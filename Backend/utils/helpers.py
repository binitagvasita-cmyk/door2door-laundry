# ============================================================
#  Door2Door Laundry — utils/helpers.py
#  JWT encoding/decoding, standard JSON response builders,
#  and auth decorator.
# ============================================================

import jwt
import datetime
from functools import wraps
from typing import Optional
from flask import request, jsonify
import config


# ── JWT helpers ───────────────────────────────────────────────

def generate_token(user_id: int, is_admin: bool = False) -> str:
    """Create a signed JWT for the given user."""
    payload = {
        "sub": str(user_id),
        "admin": is_admin,
        "iat": datetime.datetime.utcnow(),
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=config.JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, config.SECRET_KEY, algorithm="HS256")


def decode_token(token: str) -> Optional[dict]:
    """
    Decode and verify a JWT.
    Returns the payload dict or None if invalid/expired.
    """
    try:
        return jwt.decode(token, config.SECRET_KEY, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None
    except jwt.InvalidTokenError:
        return None


# ── Auth decorators ───────────────────────────────────────────

def login_required(f):
    """Decorator: require a valid JWT in Authorization: Bearer <token>."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return error("Authentication required.", 401)
        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if not payload:
            return error("Token is invalid or expired. Please log in again.", 401)
        request.user_id  = int(payload["sub"])
        request.is_admin = payload.get("admin", False)
        return f(*args, **kwargs)
    return decorated


def admin_required(f):
    """Decorator: require a valid JWT AND admin flag."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return error("Authentication required.", 401)
        token = auth_header.split(" ", 1)[1]
        payload = decode_token(token)
        if not payload:
            return error("Token is invalid or expired.", 401)
        if not payload.get("admin"):
            return error("Admin access required.", 403)
        request.user_id  = int(payload["sub"])
        request.is_admin = True
        return f(*args, **kwargs)
    return decorated


# ── Response builders ─────────────────────────────────────────

def success(data=None, message="Success", status=200):
    """Standard success JSON response."""
    body = {"success": True, "message": message}
    if data is not None:
        body["data"] = data
    return jsonify(body), status


def error(message="Something went wrong.", status=400):
    """Standard error JSON response."""
    return jsonify({"success": False, "message": message}), status


# ── Input validation ──────────────────────────────────────────

import re

def is_valid_email(val: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", val.strip()))

def is_valid_phone(val: str) -> bool:
    digits = re.sub(r"\D", "", val)
    return len(digits) == 10 and digits[0] in "6789"

def is_valid_pin(val: str) -> bool:
    """Basic 6-digit check — Ahmedabad-range filter is in the route."""
    return bool(re.match(r"^\d{6}$", val.strip())) if val else True