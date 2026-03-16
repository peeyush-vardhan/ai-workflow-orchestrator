"""Admin dashboard API — user management, analytics, audit log."""
from flask import Blueprint, jsonify, request

admin_bp = Blueprint("admin", __name__)


def _require_admin(f):
    """Inline admin guard — avoids circular import with server.py."""
    from functools import wraps
    from backend.api.auth import decode_token, extract_token
    import jwt

    @wraps(f)
    def decorated(*args, **kwargs):
        token = extract_token()
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            payload = decode_token(token)
        except (jwt.ExpiredSignatureError, jwt.InvalidTokenError):
            return jsonify({"error": "Invalid or expired token"}), 401
        if not payload.get("is_admin"):
            return jsonify({"error": "Admin access required"}), 403
        request.user_id = payload["sub"]
        return f(*args, **kwargs)

    return decorated


@admin_bp.route("/api/admin/stats")
@_require_admin
def admin_stats():
    from flask import current_app
    store = current_app.config["STORE"]
    return jsonify(store.get_admin_stats())


@admin_bp.route("/api/admin/users")
@_require_admin
def admin_users():
    from flask import current_app
    limit  = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))
    store  = current_app.config["STORE"]
    users  = store.list_users(limit=limit, offset=offset)
    total  = store.count_users()
    # Enrich with workflow count per user
    enriched = []
    for u in users:
        wf_count = len(store.list_workflows(limit=1000, user_id=u["user_id"]))
        enriched.append({**u, "workflow_count": wf_count})
    return jsonify({"users": enriched, "total": total})


@admin_bp.route("/api/admin/workflows")
@_require_admin
def admin_workflows():
    from flask import current_app
    limit  = min(int(request.args.get("limit", 50)), 200)
    offset = int(request.args.get("offset", 0))
    store  = current_app.config["STORE"]
    # No user_id filter → returns all workflows
    workflows = store.list_workflows(limit=limit, offset=offset)
    return jsonify({"workflows": workflows})


@admin_bp.route("/api/admin/audit-log")
@_require_admin
def admin_audit_log():
    from flask import current_app
    limit    = min(int(request.args.get("limit", 100)), 500)
    user_id  = request.args.get("user_id")
    store    = current_app.config["STORE"]
    events   = store.list_audit_log(limit=limit, user_id=user_id or None)
    return jsonify({"events": events})
