# ============================================================
#  Door2Door Laundry — app.py
#  Main Flask application entry point.
#  Run locally:   python app.py
#  Production:    gunicorn app:app  (via Procfile)
# ============================================================

from flask import Flask
from flask_cors import CORS

import config
from routes.auth     import auth_bp
from routes.services import services_bp
from routes.orders   import orders_bp
from routes.admin    import admin_bp

# ── App factory ───────────────────────────────────────────────
app = Flask(__name__)
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["DEBUG"]      = config.DEBUG

# ── CORS ──────────────────────────────────────────────────────
# Origins are loaded from .env / Render env vars.
# Add your Netlify URL to CORS_ORIGINS after first deployment.
CORS(app, resources={r"/api/*": {"origins": config.CORS_ORIGINS}})

# ── Register blueprints ───────────────────────────────────────
app.register_blueprint(auth_bp,     url_prefix="/api/auth")
app.register_blueprint(services_bp, url_prefix="/api/services")
app.register_blueprint(orders_bp,   url_prefix="/api/orders")
app.register_blueprint(admin_bp,    url_prefix="/api/admin")


# ── Health check ──────────────────────────────────────────────
@app.route("/api/health")
def health():
    return {"status": "ok", "service": "Door2Door Laundry API"}, 200


# ── Local dev entry ───────────────────────────────────────────
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=config.DEBUG)