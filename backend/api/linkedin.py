"""LinkedIn OAuth 2.0 + UGC Post blueprint."""
import os
import secrets
import urllib.parse
from datetime import datetime, timedelta

import requests as http_requests
from flask import Blueprint, abort, current_app, jsonify, redirect, request

linkedin_bp = Blueprint("linkedin", __name__)

_NONCE_STORE: dict = {}   # single-slot CSRF state

_AUTH_URL  = "https://www.linkedin.com/oauth/v2/authorization"
_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken"
_USERINFO_URL = "https://api.linkedin.com/v2/userinfo"
_POSTS_URL = "https://api.linkedin.com/v2/ugcPosts"

LINKEDIN_MAX_POST_CHARS = 3000
FRONTEND_URL = os.environ.get("FRONTEND_URL", "http://localhost:5173")


def _cfg() -> dict:
    """Read credentials at call-time so env vars set after import are visible."""
    return {
        "client_id":     os.environ.get("LINKEDIN_CLIENT_ID", ""),
        "client_secret": os.environ.get("LINKEDIN_CLIENT_SECRET", ""),
        "redirect_uri":  os.environ.get("LINKEDIN_REDIRECT_URI", "http://localhost:5000/api/linkedin/callback"),
    }


# ── Auth flow ─────────────────────────────────────────────────────────────────

@linkedin_bp.route("/api/linkedin/auth", methods=["GET"])
def auth_start():
    """Redirect the browser to LinkedIn's OAuth consent screen."""
    cfg = _cfg()
    if not cfg["client_id"]:
        return jsonify({"error": "LINKEDIN_CLIENT_ID not set"}), 503

    nonce = secrets.token_urlsafe(16)
    _NONCE_STORE["state"] = nonce

    params = {
        "response_type": "code",
        "client_id":     cfg["client_id"],
        "redirect_uri":  cfg["redirect_uri"],
        "state":         nonce,
        "scope":         "openid profile w_member_social",
    }
    return redirect(_AUTH_URL + "?" + urllib.parse.urlencode(params))


@linkedin_bp.route("/api/linkedin/callback", methods=["GET"])
def auth_callback():
    """Handle the OAuth redirect, exchange code for token, store it."""
    code  = request.args.get("code")
    state = request.args.get("state")
    error = request.args.get("error")

    if error:
        return redirect(f"{FRONTEND_URL}?linkedin=error&reason={urllib.parse.quote(error)}")

    if state != _NONCE_STORE.get("state"):
        return redirect(f"{FRONTEND_URL}?linkedin=error&reason=invalid_state")

    cfg = _cfg()
    store = current_app.config["STORE"]

    # Exchange code for access token
    token_resp = http_requests.post(
        _TOKEN_URL,
        data={
            "grant_type":    "authorization_code",
            "code":          code,
            "redirect_uri":  cfg["redirect_uri"],
            "client_id":     cfg["client_id"],
            "client_secret": cfg["client_secret"],
        },
        timeout=15,
    )
    if not token_resp.ok:
        return redirect(f"{FRONTEND_URL}?linkedin=error&reason=token_exchange_failed")

    token_data   = token_resp.json()
    access_token = token_data["access_token"]
    expires_in   = int(token_data.get("expires_in", 5183944))  # ~60 days default
    expires_at   = (datetime.utcnow() + timedelta(seconds=expires_in)).isoformat()

    # Fetch person URN via OIDC userinfo
    userinfo_resp = http_requests.get(
        _USERINFO_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        timeout=10,
    )
    sub = ""
    if userinfo_resp.ok:
        sub = userinfo_resp.json().get("sub", "")  # e.g. "urn:li:person:ABC123"

    store.save_linkedin_token(access_token, expires_at, sub)
    return redirect(f"{FRONTEND_URL}?linkedin=connected")


# ── Status & disconnect ───────────────────────────────────────────────────────

@linkedin_bp.route("/api/linkedin/status", methods=["GET"])
def status():
    store = current_app.config["STORE"]
    if store.linkedin_token_is_valid():
        row = store.load_linkedin_token()
        return jsonify({"connected": True, "sub": row.get("sub", "")})
    return jsonify({"connected": False})


@linkedin_bp.route("/api/linkedin/disconnect", methods=["POST"])
def disconnect():
    current_app.config["STORE"].delete_linkedin_token()
    return jsonify({"status": "disconnected"})


# ── Post ──────────────────────────────────────────────────────────────────────

@linkedin_bp.route("/api/linkedin/post", methods=["POST"])
def post_to_linkedin():
    """Post text content to the authenticated user's LinkedIn feed."""
    store = current_app.config["STORE"]
    if not store.linkedin_token_is_valid():
        return jsonify({"error": "Not connected to LinkedIn. Visit /api/linkedin/auth first."}), 401

    data = request.get_json(silent=True) or {}
    text = (data.get("text") or "").strip()
    if not text:
        return jsonify({"error": "Missing 'text' field"}), 400
    if len(text) > LINKEDIN_MAX_POST_CHARS:
        return jsonify({"error": f"Post text exceeds {LINKEDIN_MAX_POST_CHARS} characters"}), 400

    token_row = store.load_linkedin_token()
    sub = token_row["sub"]  # full URN, e.g. "urn:li:person:ABC123"
    if not sub:
        return jsonify({"error": "LinkedIn person ID not available. Re-authenticate."}), 401

    payload = {
        "author": sub,
        "lifecycleState": "PUBLISHED",
        "specificContent": {
            "com.linkedin.ugc.ShareContent": {
                "shareCommentary": {"text": text},
                "shareMediaCategory": "NONE",
            }
        },
        "visibility": {
            "com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"
        },
    }

    resp = http_requests.post(
        _POSTS_URL,
        json=payload,
        headers={
            "Authorization":            f"Bearer {token_row['access_token']}",
            "X-Restli-Protocol-Version": "2.0.0",
            "Content-Type":              "application/json",
        },
        timeout=15,
    )

    if resp.status_code == 201:
        post_urn = resp.headers.get("x-restli-id", "")
        return jsonify({"success": True, "post_urn": post_urn})

    return jsonify({"error": f"LinkedIn API error {resp.status_code}: {resp.text}"}), 502
