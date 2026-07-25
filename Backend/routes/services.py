# ============================================================
#  Door2Door Laundry — routes/services.py
#  Endpoints:
#    GET  /api/services/          → all parent services (active)
#    GET  /api/services/<id>/items → sub-items for a service
#    GET  /api/services/all-with-items → all services + sub-items
# ============================================================

from flask import Blueprint, jsonify
from utils.db import query_all, query_one

services_bp = Blueprint("services", __name__)


# ── helpers ───────────────────────────────────────────────────
def ok(data=None, message="Success"):
    return jsonify({"success": True, "message": message, "data": data}), 200


def err(message="Error", code=400):
    return jsonify({"success": False, "message": message}), code


# ════════════════════════════════════════════════════════════
#  GET /api/services/
#  Returns all active parent services
# ════════════════════════════════════════════════════════════
@services_bp.route("/", methods=["GET"])
def get_services():
    rows = query_all(
        """
        SELECT id, name, description, price, unit, icon_emoji, image_url, display_order
        FROM   services
        WHERE  is_active = 1
        ORDER  BY display_order ASC, id ASC
        """
    )
    return ok(rows if rows else [])


# ════════════════════════════════════════════════════════════
#  GET /api/services/<int:service_id>/items
#  Returns all active sub-items for a specific service
# ════════════════════════════════════════════════════════════
@services_bp.route("/<int:service_id>/items", methods=["GET"])
def get_service_items(service_id):
    parent = query_one(
        "SELECT id, name FROM services WHERE id = %s AND is_active = 1",
        (service_id,),
    )
    if not parent:
        return err("Service not found", 404)

    items = query_all(
        """
        SELECT id, service_id, name, price, unit, icon_emoji, image_url, display_order
        FROM   service_items
        WHERE  service_id = %s AND is_active = 1
        ORDER  BY display_order ASC, id ASC
        """,
        (service_id,),
    )
    return ok({"service": parent, "items": items if items else []})


# ════════════════════════════════════════════════════════════
#  GET /api/services/all-with-items
#  Single call — returns every active service and its sub-items.
#  Used by the services.html page to avoid N+1 requests.
# ════════════════════════════════════════════════════════════
@services_bp.route("/all-with-items", methods=["GET"])
def get_all_with_items():
    services = query_all(
        """
        SELECT id, name, description, price, unit, icon_emoji, image_url, display_order
        FROM   services
        WHERE  is_active = 1
        ORDER  BY display_order ASC, id ASC
        """
    )
    if not services:
        return ok([])

    # Fetch all items in one query and group in Python
    all_items = query_all(
        """
        SELECT si.id, si.service_id, si.name, si.price, si.unit,
               si.icon_emoji, si.image_url, si.display_order
        FROM   service_items si
        INNER JOIN services s ON s.id = si.service_id
        WHERE  si.is_active = 1 AND s.is_active = 1
        ORDER  BY si.service_id, si.display_order ASC, si.id ASC
        """
    )

    # Build a map: service_id → [items]
    items_map = {}
    for item in (all_items or []):
        sid = item["service_id"]
        items_map.setdefault(sid, []).append(item)

    # Attach items to each service
    result = []
    for svc in services:
        svc_copy = dict(svc)
        svc_copy["items"] = items_map.get(svc["id"], [])
        result.append(svc_copy)

    return ok(result)