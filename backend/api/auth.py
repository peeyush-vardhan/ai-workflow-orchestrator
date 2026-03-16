"""Authentication blueprint — Email OTP + JWT."""
import os
import random
import string
import time

import jwt
import requests as http_requests
from flask import Blueprint, current_app, jsonify, request

auth_bp = Blueprint("auth", __name__)

FRONTEND_URL    = os.environ.get("FRONTEND_URL", "http://localhost:5173")
JWT_SECRET      = os.environ.get("JWT_SECRET", "weave-dev-secret-change-in-prod")
ADMIN_EMAIL     = os.environ.get("ADMIN_EMAIL", "vardhanpeeyush@gmail.com")
JWT_EXPIRY_DAYS = int(os.environ.get("JWT_EXPIRY_DAYS", "7"))
DEV_MODE        = os.environ.get("DEV_MODE", "true").lower() == "true"
RESEND_API_KEY  = os.environ.get("RESEND_API_KEY", "")
EMAIL_FROM      = os.environ.get("EMAIL_FROM", "onboarding@resend.dev")


# ── JWT helpers ───────────────────────────────────────────────────────────────

def make_token(user_id: str, email: str, is_admin: bool) -> str:
    payload = {
        "sub":      user_id,
        "email":    email,
        "is_admin": is_admin,
        "iat":      int(time.time()),
        "exp":      int(time.time()) + JWT_EXPIRY_DAYS * 86400,
    }
    return jwt.encode(payload, JWT_SECRET, algorithm="HS256")


def decode_token(token: str) -> dict:
    return jwt.decode(token, JWT_SECRET, algorithms=["HS256"])


def extract_token():
    auth = request.headers.get("Authorization", "")
    if auth.startswith("Bearer "):
        return auth[7:]
    return None


# ── Resend email helper ───────────────────────────────────────────────────────

def _send_otp_email(to_email: str, code: str) -> bool:
    """Send the OTP via Resend. Returns True on success."""
    if not RESEND_API_KEY:
        return False
    try:
        resp = http_requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {RESEND_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "from": EMAIL_FROM,
                "to": [to_email],
                "subject": "Your Weave login code",
                "html": (
                    "<div style='font-family:sans-serif;max-width:420px;margin:40px auto;"
                    "padding:32px;border:1px solid #e4e8ff;border-radius:12px;background:#fff'>"
                    "<div style='font-size:22px;font-weight:700;color:#1e2848;margin-bottom:8px'>⬡ Weave</div>"
                    "<p style='color:#5a6a90;font-size:14px;margin-bottom:24px'>"
                    "Use the code below to sign in. It expires in 10 minutes.</p>"
                    f"<div style='font-size:36px;font-weight:800;letter-spacing:8px;"
                    f"color:#5b4fe0;text-align:center;padding:20px;background:#f4f6ff;"
                    f"border-radius:8px;margin-bottom:24px'>{code}</div>"
                    "<p style='color:#aab4cc;font-size:12px'>If you didn't request this, ignore this email.</p>"
                    "</div>"
                ),
            },
            timeout=10,
        )
        return resp.status_code == 200
    except Exception:
        return False


# ── Email OTP ─────────────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/email/request", methods=["POST"])
def email_request_otp():
    data  = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    if not email or "@" not in email:
        return jsonify({"error": "Valid email required"}), 400

    code  = "".join(random.choices(string.digits, k=6))
    store = current_app.config["STORE"]
    store.save_otp(email=email, code=code)

    # Send via Resend
    sent = _send_otp_email(email, code)

    resp = {"status": "otp_sent", "email": email}
    if DEV_MODE:
        resp["dev_code"] = code   # visible in dev; omit in production
    if not sent and not DEV_MODE:
        # Email failed and we can't surface the code — tell the client
        return jsonify({"error": "Failed to send email. Please try again."}), 503
    return jsonify(resp)


@auth_bp.route("/api/auth/email/verify", methods=["POST"])
def email_verify_otp():
    data  = request.get_json(silent=True) or {}
    email = data.get("email", "").strip().lower()
    code  = data.get("code", "").strip()

    if not email or not code:
        return jsonify({"error": "Email and code required"}), 400

    store = current_app.config["STORE"]
    if not store.verify_otp(email=email, code=code):
        return jsonify({"error": "Invalid or expired code"}), 401

    user = store.upsert_user(
        email=email,
        name=email.split("@")[0],
        avatar_url="",
        provider="email",
        is_admin=(email.lower() == ADMIN_EMAIL.lower()),
    )
    store.log_event("user_login", user["user_id"], {"provider": "email"})

    token = make_token(user["user_id"], user["email"], bool(user["is_admin"]))
    return jsonify({"token": token, "user": user})


# ── Session endpoints ─────────────────────────────────────────────────────────

@auth_bp.route("/api/auth/me")
def auth_me():
    token = extract_token()
    if not token:
        return jsonify({"error": "Not authenticated"}), 401
    try:
        payload = decode_token(token)
    except jwt.ExpiredSignatureError:
        return jsonify({"error": "Token expired"}), 401
    except jwt.InvalidTokenError:
        return jsonify({"error": "Invalid token"}), 401

    store = current_app.config["STORE"]
    user  = store.get_user_by_id(payload["sub"])
    if not user:
        return jsonify({"error": "User not found"}), 404
    store.touch_user(payload["sub"])
    return jsonify({"user": user})


@auth_bp.route("/api/auth/logout", methods=["POST"])
def auth_logout():
    # JWT is stateless; client drops the token.
    return jsonify({"status": "logged_out"})
