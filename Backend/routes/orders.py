# ============================================================
#  Door2Door Laundry — routes/orders.py
#  POST /api/orders          — place new order (login required)
#  GET  /api/orders          — user's orders
#  GET  /api/orders/<id>/track
#  PATCH /api/orders/<id>/cancel
# ============================================================

from flask import Blueprint, request
from utils.db import query_all, query_one, execute
from utils.helpers import login_required, success, error
from utils.mailer import send_order_confirmation_email, send_admin_order_notification_email

orders_bp = Blueprint("orders", __name__)


# ── POST /api/orders/ ─────────────────────────────────────────
@orders_bp.route("/", methods=["POST"])
@login_required
def create_order():
    data = request.get_json(silent=True) or {}

    # ── Core fields ───────────────────────────────────────────
    service_id    = data.get("service_id")          # parent service id
    item_id       = data.get("item_id") or None     # sub-item id (optional)
    item_name     = (data.get("item_name") or "").strip() or None

    delivery_address     = (data.get("address") or "").strip()
    pickup_date          = (data.get("pickup_date") or "").strip()
    pickup_time          = (data.get("pickup_time") or "").strip() or None
    special_instructions = (data.get("special_instructions") or "").strip() or None
    pin_code             = (data.get("pin_code") or "").strip() or None
    payment_method       = (data.get("payment_method") or "online").strip()
    quantity             = int(data.get("quantity") or 1)
    total_amount         = data.get("total_amount")

    # ── Validation ────────────────────────────────────────────
    if not service_id:
        return error("Service is required.")
    if not delivery_address:
        return error("Delivery address is required.")
    if not pickup_date:
        return error("Pickup date is required.")
    if payment_method not in ("online", "cod"):
        return error("Invalid payment method.")
    if payment_method == "cod" and total_amount and float(total_amount) < 100:
        return error("Cash on Delivery requires a minimum order of ₹100.")

    # ── Verify service exists ─────────────────────────────────
    svc = query_one(
        "SELECT id, name, price, unit FROM services WHERE id = %s AND is_active = 1",
        (service_id,),
    )
    if not svc:
        return error("Invalid service selected.")

    # ── Verify item exists if provided ────────────────────────
    if item_id:
        itm = query_one(
            "SELECT id, name FROM service_items WHERE id = %s AND service_id = %s AND is_active = 1",
            (item_id, service_id),
        )
        if not itm:
            return error("Invalid item selected.")

    # ── Fetch user info for email ─────────────────────────────
    user = query_one(
        "SELECT id, full_name, email, phone FROM users WHERE id = %s",
        (request.user_id,),
    )
    if not user:
        return error("User not found.", 404)

    # ── Insert order ──────────────────────────────────────────
    new_id = execute(
        """INSERT INTO orders
               (user_id, service_id, item_id, item_name, delivery_address, pin_code,
                pickup_date, pickup_time, special_instructions,
                quantity, total_amount, payment_method)
           VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)""",
        (
            request.user_id, service_id, item_id, item_name,
            delivery_address, pin_code,
            pickup_date, pickup_time, special_instructions,
            quantity,
            float(total_amount) if total_amount else None,
            payment_method,
        ),
    )
    if new_id == -1:
        return error("Could not place order. Please try again.", 500)

    # ── Send confirmation email to the customer (non-blocking; failure is logged not raised) ──
    try:
        send_order_confirmation_email(
            to_email=user["email"],
            user_name=user["full_name"],
            order_id=new_id,
            service_name=svc["name"],
            item_name=item_name,
            quantity=quantity,
            total_amount=float(total_amount) if total_amount else None,
            pickup_date=pickup_date,
            pickup_time=pickup_time,
            delivery_address=delivery_address,
            payment_method=payment_method,
            special_instructions=special_instructions,
        )
    except Exception as mail_err:
        print(f"[Orders] Customer email send failed (non-fatal): {mail_err}")

    # ── Notify admin inbox of the new order (non-blocking; failure is logged not raised) ──
    try:
        send_admin_order_notification_email(
            order_id=new_id,
            customer_name=user["full_name"],
            customer_email=user["email"],
            customer_phone=user.get("phone"),
            service_name=svc["name"],
            item_name=item_name,
            quantity=quantity,
            total_amount=float(total_amount) if total_amount else None,
            pickup_date=pickup_date,
            pickup_time=pickup_time,
            delivery_address=delivery_address,
            payment_method=payment_method,
            special_instructions=special_instructions,
        )
    except Exception as mail_err:
        print(f"[Orders] Admin notification email send failed (non-fatal): {mail_err}")

    return success(
        data={"orderId": new_id},
        message="Order placed successfully!",
        status=201,
    )


# ── GET /api/orders/ ──────────────────────────────────────────
@orders_bp.route("/", methods=["GET"])
@login_required
def get_my_orders():
    rows = query_all(
        """SELECT o.id, o.status, o.payment_status, o.paid_at,
                  o.pickup_date, o.pickup_time, o.delivery_address,
                  o.special_instructions, o.total_amount, o.quantity,
                  o.payment_method, o.item_name, o.created_at,
                  s.name AS service_name, s.price, s.unit
           FROM orders o
           JOIN services s ON s.id = o.service_id
           WHERE o.user_id = %s
           ORDER BY o.created_at DESC""",
        (request.user_id,),
    )
    for row in rows:
        if row.get("price"):        row["price"]        = float(row["price"])
        if row.get("total_amount"): row["total_amount"] = float(row["total_amount"])
        if row.get("created_at"):   row["created_at"]   = row["created_at"].isoformat()
        if row.get("paid_at"):      row["paid_at"]      = row["paid_at"].isoformat()
    return success(data=rows)


# ── GET /api/orders/<id>/track ────────────────────────────────
@orders_bp.route("/<int:order_id>/track", methods=["GET"])
@login_required
def track_order(order_id):
    row = query_one(
        """SELECT o.id, o.status, o.payment_status, o.paid_at, o.payment_method,
                  o.pickup_date, o.pickup_time, o.delivery_address, o.total_amount,
                  o.created_at, o.updated_at, s.name AS service_name
           FROM orders o
           JOIN services s ON s.id = o.service_id
           WHERE o.id = %s AND o.user_id = %s""",
        (order_id, request.user_id),
    )
    if not row:
        return error("Order not found.", 404)
    for key in ("created_at", "updated_at", "paid_at"):
        if row.get(key):
            row[key] = row[key].isoformat()
    if row.get("total_amount") is not None:
        row["total_amount"] = float(row["total_amount"])
    return success(data=row)


# ── GET /api/orders/<id>/invoice ──────────────────────────────
# Full bill/invoice data for the logged-in customer's own order.
@orders_bp.route("/<int:order_id>/invoice", methods=["GET"])
@login_required
def get_invoice(order_id):
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
           WHERE o.id = %s AND o.user_id = %s""",
        (order_id, request.user_id),
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


# ── PATCH /api/orders/<id>/cancel ─────────────────────────────
@orders_bp.route("/<int:order_id>/cancel", methods=["PATCH"])
@login_required
def cancel_order(order_id):
    row = query_one(
        "SELECT id, status FROM orders WHERE id = %s AND user_id = %s",
        (order_id, request.user_id),
    )
    if not row:
        return error("Order not found.", 404)
    if row["status"] not in ("pending", "confirmed"):
        return error(f"Cannot cancel an order with status '{row['status']}'.")

    execute("UPDATE orders SET status = 'cancelled' WHERE id = %s", (order_id,))
    return success(message="Order cancelled successfully.")