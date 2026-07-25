# ============================================================
#  Door2Door Laundry — routes/admin.py
#  GET   /api/admin/orders                — all orders
#  PATCH /api/admin/orders/<id>/status    — update status
#  GET   /api/admin/stats/users           — total registered users
#  GET    /api/admin/services             — all categories (incl. inactive)
#  POST   /api/admin/services             — create a new category
#  PATCH  /api/admin/services/<id>        — update a category's fields
#  PATCH  /api/admin/services/<id>/toggle — activate/deactivate a category
#  GET    /api/admin/services/<id>/items  — all items (incl. inactive) under a category
#  POST   /api/admin/services/<id>/items  — create a new item under a category
#  PATCH  /api/admin/items/<id>           — update an item's fields
#  PATCH  /api/admin/items/<id>/toggle    — activate/deactivate an item
# ============================================================

from flask import Blueprint, request
from utils.db import query_all, query_one, execute
from utils.helpers import admin_required, success, error
from utils.mailer import send_order_status_update_email

admin_bp = Blueprint("admin", __name__)

VALID_STATUSES = {
    "pending", "confirmed", "picked_up",
    "in_process", "out_for_delivery", "delivered", "cancelled",
}


@admin_bp.route("/orders", methods=["GET"])
@admin_required
def get_all_orders():
    rows = query_all(
        """SELECT o.id, o.status, o.payment_status, o.paid_at, o.payment_method,
                  o.pickup_date, o.delivery_address,
                  o.total_amount, o.created_at,
                  u.full_name AS customer_name, u.phone AS customer_phone,
                  s.name AS service_name
           FROM orders o
           JOIN users    u ON u.id = o.user_id
           JOIN services s ON s.id = o.service_id
           ORDER BY o.created_at DESC"""
    )
    for row in rows:
        if row.get("total_amount"): row["total_amount"] = float(row["total_amount"])
        if row.get("created_at"):   row["created_at"]   = row["created_at"].isoformat()
        if row.get("paid_at"):      row["paid_at"]      = row["paid_at"].isoformat()
    return success(data=rows)


@admin_bp.route("/reports/summary", methods=["GET"])
@admin_required
def get_reports_summary():
    """
    Aggregated data for the Reports page: totals, revenue over time,
    top customers, top services, and status breakdown. Cancelled
    orders are excluded from every revenue figure (they were never
    fulfilled) but ARE counted in the status breakdown so the admin
    can still see how many were cancelled.

    Optional query param: ?days=30 restricts the "revenue over time"
    series and totals to the last N days (created_at). Omit for
    all-time. Top customers / top services always look at the same
    window as the totals.
    """
    days = request.args.get("days", type=int)
    date_filter = ""
    params = []
    if days and days > 0:
        date_filter = "AND o.created_at >= DATE_SUB(NOW(), INTERVAL %s DAY)"
        params.append(days)

    # ── Overall totals (excl. cancelled) ──────────────────────
    totals_row = query_one(
        f"""SELECT COUNT(*) AS total_orders,
                   COALESCE(SUM(o.total_amount), 0) AS total_revenue,
                   COALESCE(AVG(o.total_amount), 0) AS avg_order_value
            FROM orders o
            WHERE o.status != 'cancelled' {date_filter}""",
        tuple(params),
    )
    total_orders = totals_row["total_orders"] if totals_row else 0
    total_revenue = float(totals_row["total_revenue"]) if totals_row else 0.0
    avg_order_value = float(totals_row["avg_order_value"]) if totals_row else 0.0

    # ── Revenue over time (daily) ─────────────────────────────
    revenue_by_day = query_all(
        f"""SELECT DATE(o.created_at) AS day,
                   COALESCE(SUM(o.total_amount), 0) AS revenue,
                   COUNT(*) AS order_count
            FROM orders o
            WHERE o.status != 'cancelled' {date_filter}
            GROUP BY DATE(o.created_at)
            ORDER BY day ASC""",
        tuple(params),
    )
    for row in revenue_by_day:
        row["revenue"] = float(row["revenue"])
        row["day"] = row["day"].isoformat()

    # ── Top customers by total spend ──────────────────────────
    top_customers = query_all(
        f"""SELECT u.id, u.full_name, u.email, u.phone,
                   COUNT(o.id) AS order_count,
                   COALESCE(SUM(o.total_amount), 0) AS total_spent
            FROM orders o
            JOIN users u ON u.id = o.user_id
            WHERE o.status != 'cancelled' {date_filter}
            GROUP BY u.id, u.full_name, u.email, u.phone
            ORDER BY total_spent DESC
            LIMIT 20""",
        tuple(params),
    )
    for row in top_customers:
        row["total_spent"] = float(row["total_spent"])

    # ── Top services by revenue ────────────────────────────────
    top_services = query_all(
        f"""SELECT s.id, s.name,
                   COUNT(o.id) AS order_count,
                   COALESCE(SUM(o.total_amount), 0) AS revenue
            FROM orders o
            JOIN services s ON s.id = o.service_id
            WHERE o.status != 'cancelled' {date_filter}
            GROUP BY s.id, s.name
            ORDER BY revenue DESC""",
        tuple(params),
    )
    for row in top_services:
        row["revenue"] = float(row["revenue"])

    # ── Status breakdown (all orders, including cancelled) ────
    status_filter = date_filter.replace("o.created_at", "created_at") if date_filter else ""
    status_breakdown = query_all(
        f"""SELECT status, COUNT(*) AS count
            FROM orders
            WHERE 1=1 {status_filter}
            GROUP BY status""",
        tuple(params),
    )

    return success(data={
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "avg_order_value": avg_order_value,
        "revenue_by_day": revenue_by_day,
        "top_customers": top_customers,
        "top_services": top_services,
        "status_breakdown": status_breakdown,
    })


@admin_bp.route("/orders/<int:order_id>/status", methods=["PATCH"])
@admin_required
def update_status(order_id):
    data       = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()

    if new_status not in VALID_STATUSES:
        return error(f"Invalid status. Choose from: {', '.join(sorted(VALID_STATUSES))}")

    row = query_one("SELECT id FROM orders WHERE id = %s", (order_id,))
    if not row:
        return error("Order not found.", 404)

    execute("UPDATE orders SET status = %s WHERE id = %s", (new_status, order_id))

    # ── Notify the customer of the status change (non-blocking) ──
    try:
        full = query_one(
            """SELECT o.id, o.pickup_date, o.pickup_time, o.delivery_address,
                      s.name AS service_name,
                      u.full_name AS customer_name, u.email AS customer_email
               FROM orders o
               JOIN services s ON s.id = o.service_id
               JOIN users u ON u.id = o.user_id
               WHERE o.id = %s""",
            (order_id,),
        )
        if full:
            send_order_status_update_email(
                to_email=full["customer_email"],
                user_name=full["customer_name"],
                order_id=full["id"],
                new_status=new_status,
                service_name=full["service_name"],
                pickup_date=str(full["pickup_date"]),
                pickup_time=full["pickup_time"],
                delivery_address=full["delivery_address"],
            )
    except Exception as mail_err:
        print(f"[Admin] Status update email failed (non-fatal): {mail_err}")

    return success(message=f"Order status updated to '{new_status}'.")


# ── PATCH /api/admin/orders/<id>/payment ──────────────────────
# Admin marks an order's payment as 'pending' or 'paid'. Marking
# paid stamps paid_at (NOW()); reverting to pending clears it.
VALID_PAYMENT_STATUSES = {"pending", "paid"}


@admin_bp.route("/orders/<int:order_id>/payment", methods=["PATCH"])
@admin_required
def update_payment_status(order_id):
    data       = request.get_json(silent=True) or {}
    new_status = (data.get("payment_status") or "").strip()

    if new_status not in VALID_PAYMENT_STATUSES:
        return error(f"Invalid payment status. Choose from: {', '.join(sorted(VALID_PAYMENT_STATUSES))}")

    row = query_one("SELECT id FROM orders WHERE id = %s", (order_id,))
    if not row:
        return error("Order not found.", 404)

    if new_status == "paid":
        execute("UPDATE orders SET payment_status = %s, paid_at = NOW() WHERE id = %s", (new_status, order_id))
    else:
        execute("UPDATE orders SET payment_status = %s, paid_at = NULL WHERE id = %s", (new_status, order_id))

    return success(message=f"Payment status updated to '{new_status}'.")


# ── GET /api/admin/orders/<id>/invoice ────────────────────────
# Full bill data for ANY order (admin isn't restricted to owning it).
@admin_bp.route("/orders/<int:order_id>/invoice", methods=["GET"])
@admin_required
def get_admin_invoice(order_id):
    row = query_one(
        """SELECT o.id, o.status, o.payment_status, o.paid_at, o.payment_method,
                  o.pickup_date, o.pickup_time, o.delivery_address, o.pin_code,
                  o.item_name, o.quantity, o.total_amount, o.special_instructions,
                  o.created_at, o.updated_at,
                  s.name AS service_name, s.price AS service_price, s.unit AS service_unit,
                  u.full_name AS customer_name, u.email AS customer_email, u.phone AS customer_phone
           FROM orders o
           JOIN services s ON s.id = o.service_id
           JOIN users u ON u.id = o.user_id
           WHERE o.id = %s""",
        (order_id,),
    )
    if not row:
        return error("Order not found.", 404)
    for key in ("created_at", "updated_at", "paid_at"):
        if row.get(key):
            row[key] = row[key].isoformat()
    for key in ("total_amount", "service_price"):
        if row.get(key) is not None:
            row[key] = float(row[key])
    return success(data=row)


# ── GET /api/admin/stats/users ────────────────────────────────
# Total registered users (independent of whether they've ordered).
# Kept as its own lightweight endpoint so it loads fast on the
# dashboard even before the orders table has finished loading.
@admin_bp.route("/stats/users", methods=["GET"])
@admin_required
def get_user_stats():
    total_row = query_one("SELECT COUNT(*) AS count FROM users")
    admin_row = query_one("SELECT COUNT(*) AS count FROM users WHERE is_admin = 1")

    total_users = total_row["count"] if total_row else 0
    admin_users = admin_row["count"] if admin_row else 0

    return success(data={
        "total_users": total_users,
        "customer_users": total_users - admin_users,
        "admin_users": admin_users,
    })


# ============================================================
#  CATEGORY (services table) MANAGEMENT
#  A "category" here is a row in the `services` table — e.g.
#  "iron", "Dry clean with iron", "petrol wash". Sub-items in
#  `service_items` are untouched by these endpoints.
# ============================================================

REQUIRED_SERVICE_FIELDS = ("name", "price")


def _validate_service_payload(data, partial=False):
    """
    Shared validation for create/update. When partial=True (PATCH),
    missing fields are fine — only validate what's present.
    Returns (cleaned_dict, error_message_or_None).
    """
    cleaned = {}

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "Category name is required."
        cleaned["name"] = name

    if "description" in data:
        cleaned["description"] = (data.get("description") or "").strip() or None

    if "price" in data or not partial:
        price = data.get("price")
        try:
            price = float(price)
        except (TypeError, ValueError):
            return None, "Price must be a valid number."
        if price < 0:
            return None, "Price cannot be negative."
        cleaned["price"] = price

    if "unit" in data:
        unit = (data.get("unit") or "").strip()
        cleaned["unit"] = unit or "per kg"

    if "icon_emoji" in data:
        cleaned["icon_emoji"] = (data.get("icon_emoji") or "").strip() or "🧺"

    if "image_url" in data:
        cleaned["image_url"] = (data.get("image_url") or "").strip() or None

    if "display_order" in data:
        try:
            cleaned["display_order"] = int(data.get("display_order") or 0)
        except (TypeError, ValueError):
            return None, "Display order must be a whole number."

    return cleaned, None


# ── GET /api/admin/services ───────────────────────────────────
# Returns every category, active or not, for the admin table.
@admin_bp.route("/services", methods=["GET"])
@admin_required
def get_all_services():
    rows = query_all(
        """SELECT id, name, description, price, unit, icon_emoji,
                  image_url, display_order, is_active, created_at
           FROM services
           ORDER BY display_order ASC, id ASC"""
    )
    for row in rows:
        if row.get("price"):
            row["price"] = float(row["price"])
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()
    return success(data=rows)


# ── POST /api/admin/services ──────────────────────────────────
# Create a brand-new category.
@admin_bp.route("/services", methods=["POST"])
@admin_required
def create_service():
    data = request.get_json(silent=True) or {}
    cleaned, err_msg = _validate_service_payload(data, partial=False)
    if err_msg:
        return error(err_msg)

    # Duplicate-name guard (case-insensitive)
    existing = query_one(
        "SELECT id FROM services WHERE LOWER(name) = LOWER(%s)", (cleaned["name"],)
    )
    if existing:
        return error("A category with this name already exists.", 409)

    new_id = execute(
        """INSERT INTO services
               (name, description, price, unit, icon_emoji, image_url, display_order, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 1)""",
        (
            cleaned["name"],
            cleaned.get("description"),
            cleaned["price"],
            cleaned.get("unit", "per kg"),
            cleaned.get("icon_emoji", "🧺"),
            cleaned.get("image_url"),
            cleaned.get("display_order", 0),
        ),
    )
    if new_id == -1:
        return error("Could not create category. Please try again.", 500)

    return success(data={"id": new_id}, message="Category created successfully.", status=201)


# ── PATCH /api/admin/services/<id> ────────────────────────────
# Update any subset of a category's fields (name, price, etc).
@admin_bp.route("/services/<int:service_id>", methods=["PATCH"])
@admin_required
def update_service(service_id):
    row = query_one("SELECT id FROM services WHERE id = %s", (service_id,))
    if not row:
        return error("Category not found.", 404)

    data = request.get_json(silent=True) or {}
    cleaned, err_msg = _validate_service_payload(data, partial=True)
    if err_msg:
        return error(err_msg)
    if not cleaned:
        return error("No fields provided to update.")

    # Duplicate-name guard, excluding this row itself
    if "name" in cleaned:
        dupe = query_one(
            "SELECT id FROM services WHERE LOWER(name) = LOWER(%s) AND id != %s",
            (cleaned["name"], service_id),
        )
        if dupe:
            return error("Another category already uses this name.", 409)

    set_clause = ", ".join(f"{col} = %s" for col in cleaned.keys())
    params = list(cleaned.values()) + [service_id]
    execute(f"UPDATE services SET {set_clause} WHERE id = %s", tuple(params))

    return success(message="Category updated successfully.")


# ── PATCH /api/admin/services/<id>/toggle ─────────────────────
# Flip is_active. Deactivating hides it from customers (services.py
# only returns is_active=1 rows) without deleting its order history.
@admin_bp.route("/services/<int:service_id>/toggle", methods=["PATCH"])
@admin_required
def toggle_service_status(service_id):
    row = query_one("SELECT id, is_active FROM services WHERE id = %s", (service_id,))
    if not row:
        return error("Category not found.", 404)

    new_status = 0 if row["is_active"] else 1
    execute("UPDATE services SET is_active = %s WHERE id = %s", (new_status, service_id))

    return success(
        data={"is_active": bool(new_status)},
        message=f"Category {'activated' if new_status else 'deactivated'} successfully.",
    )


# ============================================================
#  ITEM (service_items table) MANAGEMENT
#  An "item" is a sub-item under a category — e.g. under the
#  "iron" category: "Shirt / T-Shirt", "Pant / Trouser", etc.
#  These are what customers actually pick when placing an order.
# ============================================================


def _validate_item_payload(data, partial=False):
    """
    Shared validation for create/update of a service_items row.
    Same shape as _validate_service_payload but without display's
    "unit" default differing — mirrors service_items schema defaults.
    Returns (cleaned_dict, error_message_or_None).
    """
    cleaned = {}

    if "name" in data or not partial:
        name = (data.get("name") or "").strip()
        if not name:
            return None, "Item name is required."
        cleaned["name"] = name

    if "price" in data or not partial:
        price = data.get("price")
        try:
            price = float(price)
        except (TypeError, ValueError):
            return None, "Price must be a valid number."
        if price < 0:
            return None, "Price cannot be negative."
        cleaned["price"] = price

    if "unit" in data:
        unit = (data.get("unit") or "").strip()
        cleaned["unit"] = unit or "per piece"

    if "icon_emoji" in data:
        cleaned["icon_emoji"] = (data.get("icon_emoji") or "").strip() or "🧺"

    if "image_url" in data:
        cleaned["image_url"] = (data.get("image_url") or "").strip() or None

    if "display_order" in data:
        try:
            cleaned["display_order"] = int(data.get("display_order") or 0)
        except (TypeError, ValueError):
            return None, "Display order must be a whole number."

    return cleaned, None


# ── GET /api/admin/services/<id>/items ────────────────────────
# Every item (active or not) that belongs to this category.
@admin_bp.route("/services/<int:service_id>/items", methods=["GET"])
@admin_required
def get_items_for_service(service_id):
    service = query_one("SELECT id, name FROM services WHERE id = %s", (service_id,))
    if not service:
        return error("Category not found.", 404)

    rows = query_all(
        """SELECT id, service_id, name, price, unit, icon_emoji,
                  image_url, display_order, is_active, created_at
           FROM service_items
           WHERE service_id = %s
           ORDER BY display_order ASC, id ASC""",
        (service_id,),
    )
    for row in rows:
        if row.get("price"):
            row["price"] = float(row["price"])
        if row.get("created_at"):
            row["created_at"] = row["created_at"].isoformat()

    return success(data={"category": service, "items": rows})


# ── POST /api/admin/services/<id>/items ───────────────────────
# Create a new item under a given category.
@admin_bp.route("/services/<int:service_id>/items", methods=["POST"])
@admin_required
def create_item(service_id):
    service = query_one("SELECT id FROM services WHERE id = %s", (service_id,))
    if not service:
        return error("Category not found.", 404)

    data = request.get_json(silent=True) or {}
    cleaned, err_msg = _validate_item_payload(data, partial=False)
    if err_msg:
        return error(err_msg)

    # Duplicate-name guard within the same category (case-insensitive)
    existing = query_one(
        "SELECT id FROM service_items WHERE service_id = %s AND LOWER(name) = LOWER(%s)",
        (service_id, cleaned["name"]),
    )
    if existing:
        return error("An item with this name already exists in this category.", 409)

    new_id = execute(
        """INSERT INTO service_items
               (service_id, name, price, unit, icon_emoji, image_url, display_order, is_active)
           VALUES (%s, %s, %s, %s, %s, %s, %s, 1)""",
        (
            service_id,
            cleaned["name"],
            cleaned["price"],
            cleaned.get("unit", "per piece"),
            cleaned.get("icon_emoji", "🧺"),
            cleaned.get("image_url"),
            cleaned.get("display_order", 0),
        ),
    )
    if new_id == -1:
        return error("Could not create item. Please try again.", 500)

    return success(data={"id": new_id}, message="Item created successfully.", status=201)


# ── PATCH /api/admin/items/<id> ───────────────────────────────
# Update any subset of an item's fields (name, price, etc).
@admin_bp.route("/items/<int:item_id>", methods=["PATCH"])
@admin_required
def update_item(item_id):
    row = query_one("SELECT id, service_id FROM service_items WHERE id = %s", (item_id,))
    if not row:
        return error("Item not found.", 404)

    data = request.get_json(silent=True) or {}
    cleaned, err_msg = _validate_item_payload(data, partial=True)
    if err_msg:
        return error(err_msg)
    if not cleaned:
        return error("No fields provided to update.")

    if "name" in cleaned:
        dupe = query_one(
            """SELECT id FROM service_items
               WHERE service_id = %s AND LOWER(name) = LOWER(%s) AND id != %s""",
            (row["service_id"], cleaned["name"], item_id),
        )
        if dupe:
            return error("Another item in this category already uses this name.", 409)

    set_clause = ", ".join(f"{col} = %s" for col in cleaned.keys())
    params = list(cleaned.values()) + [item_id]
    execute(f"UPDATE service_items SET {set_clause} WHERE id = %s", tuple(params))

    return success(message="Item updated successfully.")


# ── PATCH /api/admin/items/<id>/toggle ────────────────────────
# Flip is_active. Deactivating hides it from customers without
# deleting order history that references it.
@admin_bp.route("/items/<int:item_id>/toggle", methods=["PATCH"])
@admin_required
def toggle_item_status(item_id):
    row = query_one("SELECT id, is_active FROM service_items WHERE id = %s", (item_id,))
    if not row:
        return error("Item not found.", 404)

    new_status = 0 if row["is_active"] else 1
    execute("UPDATE service_items SET is_active = %s WHERE id = %s", (new_status, item_id))

    return success(
        data={"is_active": bool(new_status)},
        message=f"Item {'activated' if new_status else 'deactivated'} successfully.",
    )