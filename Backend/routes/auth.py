# ============================================================
#  Door2Door Laundry — routes/auth.py
#  Handles: POST /api/auth/register
#           POST /api/auth/login
#           GET  /api/auth/profile  (JWT protected)
# ============================================================

from flask import Blueprint, request
import bcrypt
import time
import config                                        # ← add this
from utils.mailer import generate_otp, send_otp_email
from utils.db import query_one, execute
from utils.helpers import (
    generate_token, login_required,
    success, error,
    is_valid_email, is_valid_phone, is_valid_pin,
)
# In-memory OTP store: { email: { otp, expires_at } }
# On Render this resets on redeploy — fine for short-lived OTPs
_otp_store: dict = {}
auth_bp = Blueprint("auth", __name__)


# ── POST /api/auth/register ───────────────────────────────────
@auth_bp.route("/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}

    # ── Required fields ───────────────────────────────────────
    full_name = (data.get("fullName") or "").strip()
    email     = (data.get("email")    or "").strip().lower()
    phone     = (data.get("phone")    or "").strip()
    password  = (data.get("password") or "")

    if not full_name:
        return error("Full name is required.")
    if len(full_name) < 3:
        return error("Full name must be at least 3 characters.")
    if not is_valid_email(email):
        return error("A valid email address is required.")
    if not is_valid_phone(phone):
        return error("A valid 10-digit Indian mobile number is required.")
    if len(password) < 8:
        return error("Password must be at least 8 characters.")

    # ── Optional address fields ───────────────────────────────
    street_address = (data.get("streetAddress") or "").strip() or None
    apartment      = (data.get("apartment")     or "").strip() or None
    building_name  = (data.get("buildingName")  or "").strip() or None
    landmark       = (data.get("landmark")      or "").strip() or None
    pin_code       = (data.get("pinCode")        or "").strip() or None

    if pin_code and not is_valid_pin(pin_code):
        return error("PIN code must be exactly 6 digits.")

    marketing_opt_in = bool(data.get("marketingOptIn", True))
    email_verified   = bool(data.get("emailVerified",  False))

    # ── Duplicate check ───────────────────────────────────────
    existing = query_one("SELECT id FROM users WHERE email = %s", (email,))
    if existing:
        return error("An account with this email already exists. Please log in.", 409)

    # ── Hash password ─────────────────────────────────────────
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

    # ── Insert user ───────────────────────────────────────────
    sql = """
        INSERT INTO users
            (full_name, email, phone, password_hash,
             street_address, apartment, building_name, landmark, pin_code,
             email_verified, marketing_opt_in)
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
    """
    new_id = execute(sql, (
        full_name, email, phone, password_hash,
        street_address, apartment, building_name, landmark, pin_code,
        1 if email_verified else 0,
        1 if marketing_opt_in else 0,
    ))

    if new_id == -1:
        return error("Registration failed due to a database error. Please try again.", 500)

    # ── Return JWT immediately so the user is logged in ───────
    token = generate_token(new_id)
    return success(
        data={"token": token, "userId": new_id, "name": full_name, "email": email},
        message="Account created successfully! Welcome to Door2Door.",
        status=201,
    )

# ── POST /api/auth/send-otp ───────────────────────────────────
@auth_bp.route("/send-otp", methods=["POST"])
def send_otp():
    data  = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    name  = (data.get("name")  or "").strip()

    if not is_valid_email(email):
        return error("A valid email address is required.")

    otp     = generate_otp()
    expires = time.time() + (config.OTP_EXPIRY_MINUTES * 60)
    _otp_store[email] = {"otp": otp, "expires_at": expires}

    sent = send_otp_email(email, otp, name)
    if not sent:
        return error("Failed to send OTP. Please try again.", 500)

    return success(message=f"OTP sent to {email}.")


# ── POST /api/auth/verify-otp ─────────────────────────────────
@auth_bp.route("/verify-otp", methods=["POST"])
def verify_otp():
    data    = request.get_json(silent=True) or {}
    email   = (data.get("email") or "").strip().lower()
    entered = (data.get("otp")   or "").strip()

    if not email or not entered:
        return error("Email and OTP are required.")

    record = _otp_store.get(email)
    if not record:
        return error("No OTP found for this email. Please request a new one.")
    if time.time() > record["expires_at"]:
        _otp_store.pop(email, None)
        return error("OTP has expired. Please request a new one.")
    if entered != record["otp"]:
        return error("Incorrect OTP. Please try again.")

    # Valid — clear it so it can't be reused
    _otp_store.pop(email, None)
    return success(message="Email verified successfully.")
# ── POST /api/auth/login ──────────────────────────────────────
@auth_bp.route("/login", methods=["POST"])
def login():
    data     = request.get_json(silent=True) or {}
    email    = (data.get("email")    or "").strip().lower()
    password = (data.get("password") or "")

    if not email or not password:
        return error("Email and password are required.")

    user = query_one(
        "SELECT id, full_name, email, password_hash, is_admin, is_active FROM users WHERE email = %s",
        (email,),
    )
    if not user:
        return error("Invalid email or password.", 401)
    if not user["is_active"]:
        return error("This account has been deactivated. Please contact support.", 403)

    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return error("Invalid email or password.", 401)

    token = generate_token(user["id"], is_admin=bool(user["is_admin"]))
    return success(
        data={
            "token":   token,
            "userId":  user["id"],
            "name":    user["full_name"],
            "email":   user["email"],
            "isAdmin": bool(user["is_admin"]),
        },
        message="Logged in successfully.",
    )


# ── GET /api/auth/profile ─────────────────────────────────────
@auth_bp.route("/profile", methods=["GET"])
@login_required
def profile():
    user = query_one(
        """SELECT id, full_name, email, phone,
                  street_address, apartment, building_name, landmark, pin_code,
                  email_verified, marketing_opt_in, is_admin, created_at
           FROM users WHERE id = %s""",
        (request.user_id,),
    )
    if not user:
        return error("User not found.", 404)

    # Convert datetime to string for JSON
    if user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()

    return success(data=user)


# ── PATCH /api/auth/profile ───────────────────────────────────
# Update the logged-in user's own name / phone / address fields.
# Was previously missing entirely — profile.js's "Save" buttons only
# updated a localStorage cache, so nothing ever reached the database
# and a page refresh (which re-fetches from GET /profile) wiped out
# whatever the customer had just typed. This is the real persistence.
@auth_bp.route("/profile", methods=["PATCH"])
@login_required
def update_profile():
    data = request.get_json(silent=True) or {}
    cleaned = {}

    if "fullName" in data:
        full_name = (data.get("fullName") or "").strip()
        if not full_name:
            return error("Full name cannot be empty.")
        if len(full_name) < 3:
            return error("Full name must be at least 3 characters.")
        cleaned["full_name"] = full_name

    if "phone" in data:
        phone = (data.get("phone") or "").strip()
        if phone and not is_valid_phone(phone):
            return error("A valid 10-digit Indian mobile number is required.")
        cleaned["phone"] = phone or None

    if "streetAddress" in data:
        cleaned["street_address"] = (data.get("streetAddress") or "").strip() or None
    if "apartment" in data:
        cleaned["apartment"] = (data.get("apartment") or "").strip() or None
    if "buildingName" in data:
        cleaned["building_name"] = (data.get("buildingName") or "").strip() or None
    if "landmark" in data:
        cleaned["landmark"] = (data.get("landmark") or "").strip() or None
    if "pinCode" in data:
        pin_code = (data.get("pinCode") or "").strip()
        if pin_code and not is_valid_pin(pin_code):
            return error("PIN code must be exactly 6 digits.")
        cleaned["pin_code"] = pin_code or None

    if "marketingOptIn" in data:
        cleaned["marketing_opt_in"] = 1 if data.get("marketingOptIn") else 0

    if not cleaned:
        return error("No fields provided to update.")

    set_clause = ", ".join(f"{col} = %s" for col in cleaned.keys())
    params = list(cleaned.values()) + [request.user_id]
    result = execute(f"UPDATE users SET {set_clause} WHERE id = %s", tuple(params))
    if result == -1:
        return error("Could not save changes. Please try again.", 500)

    user = query_one(
        """SELECT id, full_name, email, phone,
                  street_address, apartment, building_name, landmark, pin_code,
                  email_verified, marketing_opt_in, is_admin, created_at
           FROM users WHERE id = %s""",
        (request.user_id,),
    )
    if user and user.get("created_at"):
        user["created_at"] = user["created_at"].isoformat()

    return success(data=user, message="Profile updated successfully.")