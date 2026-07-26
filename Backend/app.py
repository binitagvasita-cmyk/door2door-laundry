# ============================================================
#  Door2Door Laundry — app.py
# ============================================================

import re
from flask import Flask
from flask_cors import CORS

import config
from routes.auth     import auth_bp
from routes.services import services_bp
from routes.orders   import orders_bp
from routes.admin    import admin_bp

app = Flask(__name__)
app.config["SECRET_KEY"] = config.SECRET_KEY
app.config["DEBUG"]      = config.DEBUG

# ── CORS ──────────────────────────────────────────────────────
# Explicit origins from Render env var (production domain, custom
# domain) + a regex fallback so ANY Vercel preview/personal URL
# (e.g. door2door-laundry-git-branch-you.vercel.app) works too,
# without needing to update Render's env var on every deploy.
_vercel_preview_regex = re.compile(r"^https://door2door-laundry-.*\.vercel\.app$")

CORS(app, resources={r"/api/*": {
    "origins": config.CORS_ORIGINS + [_vercel_preview_regex]
}})

# ── Register blueprints ───────────────────────────────────────
app.register_blueprint(auth_bp,     url_prefix="/api/auth")
app.register_blueprint(services_bp, url_prefix="/api/services")
app.register_blueprint(orders_bp,   url_prefix="/api/orders")
app.register_blueprint(admin_bp,    url_prefix="/api/admin")


@app.route("/api/health")
def health():
    return {"status": "ok", "service": "Door2Door Laundry API"}, 200


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5001, debug=config.DEBUG)