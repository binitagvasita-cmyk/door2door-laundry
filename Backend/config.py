# ============================================================
#  Door2Door Laundry — config.py
#  All configuration read from environment / .env file.
#  Never hardcode secrets here.
# ============================================================

import os
from dotenv import load_dotenv

load_dotenv()  # loads .env in local dev; Render sets env vars directly

# ── Database ──────────────────────────────────────────────────
DB_HOST     = os.environ.get("DB_HOST", "localhost")
DB_PORT     = int(os.environ.get("DB_PORT", 3306))
DB_USER     = os.environ.get("DB_USER", "root")
DB_PASSWORD = os.environ.get("DB_PASSWORD", "")
DB_NAME     = os.environ.get("DB_NAME", "door2door")

# ── JWT ───────────────────────────────────────────────────────
SECRET_KEY        = os.environ.get("SECRET_KEY", "dev-secret-change-in-production")
JWT_EXPIRY_HOURS  = int(os.environ.get("JWT_EXPIRY_HOURS", 24))

# ── Flask ─────────────────────────────────────────────────────
FLASK_ENV = os.environ.get("FLASK_ENV", "development")
DEBUG     = FLASK_ENV == "development"

# ── CORS ──────────────────────────────────────────────────────
# Read as space-separated string, split into list
_cors_raw = os.environ.get(
    "CORS_ORIGINS",
    "http://127.0.0.1:5500 http://localhost:5500 http://127.0.0.1:5501 http://localhost:5501"
)
CORS_ORIGINS = _cors_raw.split()
# ── Email ─────────────────────────────────────────────────────
GMAIL_USER         = os.environ.get("GMAIL_USER", "")
GMAIL_APP_PASSWORD = os.environ.get("GMAIL_APP_PASSWORD", "")
OTP_EXPIRY_MINUTES = int(os.environ.get("OTP_EXPIRY_MINUTES", 10))

# Brevo transactional email API key — required by utils/mailer.py.
# Render's free tier blocks outbound SMTP (ports 25/465/587), so email
# is sent over HTTPS via Brevo's API instead of Gmail SMTP directly.
# Get a free key at https://app.brevo.com → Settings → SMTP & API → API Keys.
BREVO_API_KEY = os.environ.get("BREVO_API_KEY", "")

# Recipient for the "new order placed" admin notification email.
# Falls back to GMAIL_USER (the sending account) if not set.
ADMIN_NOTIFICATION_EMAIL = os.environ.get("ADMIN_NOTIFICATION_EMAIL", "") or GMAIL_USER