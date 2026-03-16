"""SQLite storage adapter for persistent workflow and agent storage."""
import json
import sqlite3
import threading
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from .models import CustomAgentDefinition, WorkflowState


class StorageAdapter:
    """Thread-safe SQLite storage for workflows, templates, and custom agents."""

    def __init__(self, db_path: str = "workflows.db") -> None:
        self.db_path = db_path
        self._local = threading.local()
        self._init_db()

    # ── Connection management ────────────────────────────────────────────────

    def _get_conn(self) -> sqlite3.Connection:
        """Return a thread-local SQLite connection."""
        if not hasattr(self._local, "conn") or self._local.conn is None:
            conn = sqlite3.connect(self.db_path, check_same_thread=False)
            conn.row_factory = sqlite3.Row
            conn.execute("PRAGMA journal_mode=WAL")  # better concurrent writes
            self._local.conn = conn
        return self._local.conn

    def _init_db(self) -> None:
        conn = self._get_conn()
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS workflows (
                workflow_id   TEXT PRIMARY KEY,
                state_json    TEXT NOT NULL,
                user_input    TEXT NOT NULL,
                status        TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                completed_at  TEXT,
                user_id       TEXT
            );

            CREATE TABLE IF NOT EXISTS templates (
                template_id   TEXT PRIMARY KEY,
                name          TEXT NOT NULL,
                description   TEXT NOT NULL DEFAULT '',
                user_input    TEXT NOT NULL,
                created_at    TEXT NOT NULL,
                is_custom     INTEGER NOT NULL DEFAULT 1,
                user_id       TEXT
            );

            CREATE TABLE IF NOT EXISTS custom_agents (
                agent_id      TEXT PRIMARY KEY,
                agent_json    TEXT NOT NULL,
                user_id       TEXT
            );

            CREATE TABLE IF NOT EXISTS linkedin_tokens (
                id            INTEGER PRIMARY KEY CHECK (id = 1),
                access_token  TEXT NOT NULL,
                expires_at    TEXT NOT NULL,
                sub           TEXT NOT NULL DEFAULT ''
            );

            CREATE TABLE IF NOT EXISTS users (
                user_id       TEXT PRIMARY KEY,
                email         TEXT NOT NULL UNIQUE,
                name          TEXT NOT NULL,
                avatar_url    TEXT NOT NULL DEFAULT '',
                provider      TEXT NOT NULL DEFAULT 'google',
                is_admin      INTEGER NOT NULL DEFAULT 0,
                created_at    TEXT NOT NULL,
                last_seen_at  TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS otps (
                id         INTEGER PRIMARY KEY AUTOINCREMENT,
                email      TEXT NOT NULL,
                code_hash  TEXT NOT NULL,
                created_at TEXT NOT NULL,
                expires_at TEXT NOT NULL,
                used       INTEGER NOT NULL DEFAULT 0
            );

            CREATE TABLE IF NOT EXISTS audit_log (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                event_type  TEXT NOT NULL,
                user_id     TEXT,
                details     TEXT NOT NULL DEFAULT '{}',
                created_at  TEXT NOT NULL
            );
        """)
        conn.commit()
        # Safe migrations for older databases that may lack new columns
        for migration in [
            "ALTER TABLE workflows ADD COLUMN user_id TEXT",
            "ALTER TABLE templates ADD COLUMN user_id TEXT",
            "ALTER TABLE custom_agents ADD COLUMN user_id TEXT",
        ]:
            try:
                conn.execute(migration)
                conn.commit()
            except Exception:
                pass  # column already exists

    # ── Workflow CRUD ────────────────────────────────────────────────────────

    def save(self, state: WorkflowState, user_id: Optional[str] = None) -> None:
        """Upsert a workflow state."""
        conn = self._get_conn()
        conn.execute(
            """
            INSERT OR REPLACE INTO workflows
                (workflow_id, state_json, user_input, status, created_at, completed_at, user_id)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                state.workflow_id,
                json.dumps(state.to_dict()),
                state.user_input,
                state.status.value,
                state.created_at.isoformat(),
                state.completed_at.isoformat() if state.completed_at else None,
                user_id,
            ),
        )
        conn.commit()

    def load(self, workflow_id: str) -> Optional[WorkflowState]:
        """Load a workflow state by ID. Returns None if not found."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT state_json FROM workflows WHERE workflow_id = ?", (workflow_id,)
        ).fetchone()
        if not row:
            return None
        return WorkflowState.from_dict(json.loads(row["state_json"]))

    def list_workflows(
        self, limit: int = 50, offset: int = 0, user_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Return workflow summaries (no task outputs, only metadata)."""
        conn = self._get_conn()
        if user_id:
            rows = conn.execute(
                """
                SELECT workflow_id, user_input, status, created_at, completed_at, state_json
                FROM workflows WHERE user_id = ?
                ORDER BY created_at DESC LIMIT ? OFFSET ?
                """,
                (user_id, limit, offset),
            ).fetchall()
        else:
            rows = conn.execute(
                """
                SELECT workflow_id, user_input, status, created_at, completed_at, state_json
                FROM workflows
                ORDER BY created_at DESC
                LIMIT ? OFFSET ?
                """,
                (limit, offset),
            ).fetchall()

        results = []
        for row in rows:
            state_data = json.loads(row["state_json"])
            dag = state_data.get("dag")
            tm = state_data.get("token_metrics", {})
            results.append({
                "workflow_id": row["workflow_id"],
                "user_input": (
                    row["user_input"][:120] + "…"
                    if len(row["user_input"]) > 120
                    else row["user_input"]
                ),
                "workflow_name": dag["workflow_name"] if dag else None,
                "status": row["status"],
                "created_at": row["created_at"],
                "completed_at": row["completed_at"],
                "task_count": len(dag["tasks"]) if dag else 0,
                "estimated_cost": tm.get("estimated_cost", 0),
                "total_tokens": (
                    tm.get("total_input_tokens", 0) + tm.get("total_output_tokens", 0)
                ),
            })
        return results

    def delete_workflow(self, workflow_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM workflows WHERE workflow_id = ?", (workflow_id,)
        )
        conn.commit()
        return cursor.rowcount > 0

    # ── Template CRUD ────────────────────────────────────────────────────────

    def save_template(
        self,
        name: str,
        description: str,
        user_input: str,
        template_id: Optional[str] = None,
        user_id: Optional[str] = None,
    ) -> str:
        """Save a workflow template. Returns the template_id."""
        conn = self._get_conn()
        tid = template_id or str(uuid.uuid4())[:8]
        conn.execute(
            """
            INSERT OR REPLACE INTO templates
                (template_id, name, description, user_input, created_at, is_custom, user_id)
            VALUES (?, ?, ?, ?, ?, 1, ?)
            """,
            (tid, name, description, user_input, datetime.utcnow().isoformat(), user_id),
        )
        conn.commit()
        return tid

    def list_templates(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """Return all saved templates (user-created only)."""
        conn = self._get_conn()
        if user_id:
            rows = conn.execute(
                "SELECT * FROM templates WHERE is_custom = 1 AND user_id = ? ORDER BY created_at DESC",
                (user_id,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM templates WHERE is_custom = 1 ORDER BY created_at DESC"
            ).fetchall()
        return [dict(row) for row in rows]

    def delete_template(self, template_id: str) -> bool:
        conn = self._get_conn()
        cursor = conn.execute(
            "DELETE FROM templates WHERE template_id = ?", (template_id,)
        )
        conn.commit()
        return cursor.rowcount > 0

    # ── Custom agent CRUD ────────────────────────────────────────────────────

    def save_custom_agent(
        self, agent: CustomAgentDefinition, user_id: Optional[str] = None
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            "INSERT OR REPLACE INTO custom_agents (agent_id, agent_json, user_id) VALUES (?, ?, ?)",
            (agent.id, json.dumps(agent.to_dict()), user_id),
        )
        conn.commit()

    def load_custom_agent(self, agent_id: str) -> Optional[CustomAgentDefinition]:
        conn = self._get_conn()
        row = conn.execute(
            "SELECT agent_json FROM custom_agents WHERE agent_id = ?", (agent_id,)
        ).fetchone()
        if not row:
            return None
        return CustomAgentDefinition.from_dict(json.loads(row["agent_json"]))

    def list_custom_agents(self, user_id: Optional[str] = None) -> List[CustomAgentDefinition]:
        conn = self._get_conn()
        if user_id:
            rows = conn.execute(
                "SELECT agent_json FROM custom_agents WHERE user_id = ?", (user_id,)
            ).fetchall()
        else:
            rows = conn.execute("SELECT agent_json FROM custom_agents").fetchall()
        return [CustomAgentDefinition.from_dict(json.loads(r["agent_json"])) for r in rows]

    def delete_custom_agent(self, agent_id: str, user_id: Optional[str] = None) -> bool:
        conn = self._get_conn()
        if user_id:
            cursor = conn.execute(
                "DELETE FROM custom_agents WHERE agent_id = ? AND user_id = ?", (agent_id, user_id)
            )
        else:
            cursor = conn.execute(
                "DELETE FROM custom_agents WHERE agent_id = ?", (agent_id,)
            )
        conn.commit()
        return cursor.rowcount > 0

    # ── LinkedIn token ───────────────────────────────────────────────────────

    def save_linkedin_token(self, access_token: str, expires_at: str, sub: str) -> None:
        """Upsert the single LinkedIn token row (single-user app)."""
        conn = self._get_conn()
        conn.execute(
            """
            INSERT OR REPLACE INTO linkedin_tokens (id, access_token, expires_at, sub)
            VALUES (1, ?, ?, ?)
            """,
            (access_token, expires_at, sub),
        )
        conn.commit()

    def load_linkedin_token(self) -> Optional[Dict[str, Any]]:
        """Return the stored token dict or None."""
        conn = self._get_conn()
        row = conn.execute(
            "SELECT access_token, expires_at, sub FROM linkedin_tokens WHERE id = 1"
        ).fetchone()
        if not row:
            return None
        return {"access_token": row["access_token"], "expires_at": row["expires_at"], "sub": row["sub"]}

    def linkedin_token_is_valid(self) -> bool:
        """Return True if a token exists and has not expired."""
        row = self.load_linkedin_token()
        if not row:
            return False
        try:
            expires = datetime.fromisoformat(row["expires_at"])
            return expires > datetime.utcnow()
        except (ValueError, TypeError):
            return False

    def delete_linkedin_token(self) -> None:
        conn = self._get_conn()
        conn.execute("DELETE FROM linkedin_tokens")
        conn.commit()

    # ── Users ────────────────────────────────────────────────────────────────

    def upsert_user(
        self,
        email: str,
        name: str,
        avatar_url: str,
        provider: str,
        is_admin: bool = False,
    ) -> Dict[str, Any]:
        """Create or update a user by email. Returns the user dict."""
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        existing = conn.execute(
            "SELECT * FROM users WHERE email = ?", (email,)
        ).fetchone()
        if existing:
            conn.execute(
                "UPDATE users SET name=?, avatar_url=?, last_seen_at=?, is_admin=? WHERE email=?",
                (name, avatar_url, now, int(is_admin), email),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        else:
            uid = str(uuid.uuid4())
            conn.execute(
                """
                INSERT INTO users (user_id, email, name, avatar_url, provider, is_admin, created_at, last_seen_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (uid, email, name, avatar_url, provider, int(is_admin), now, now),
            )
            conn.commit()
            row = conn.execute("SELECT * FROM users WHERE user_id = ?", (uid,)).fetchone()
        return dict(row)

    def get_user_by_id(self, user_id: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM users WHERE user_id = ?", (user_id,)).fetchone()
        return dict(row) if row else None

    def get_user_by_email(self, email: str) -> Optional[Dict[str, Any]]:
        conn = self._get_conn()
        row = conn.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
        return dict(row) if row else None

    def touch_user(self, user_id: str) -> None:
        """Update last_seen_at."""
        conn = self._get_conn()
        conn.execute(
            "UPDATE users SET last_seen_at = ? WHERE user_id = ?",
            (datetime.utcnow().isoformat(), user_id),
        )
        conn.commit()

    def list_users(self, limit: int = 50, offset: int = 0) -> List[Dict[str, Any]]:
        conn = self._get_conn()
        rows = conn.execute(
            "SELECT * FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?",
            (limit, offset),
        ).fetchall()
        return [dict(r) for r in rows]

    def count_users(self) -> int:
        conn = self._get_conn()
        return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    # ── OTPs ─────────────────────────────────────────────────────────────────

    def save_otp(self, email: str, code: str) -> None:
        """Store a hashed OTP valid for 10 minutes. Invalidates previous ones."""
        import hashlib
        from datetime import timedelta
        conn = self._get_conn()
        now = datetime.utcnow()
        # Invalidate previous unused OTPs for this email
        conn.execute("UPDATE otps SET used = 1 WHERE email = ? AND used = 0", (email,))
        conn.execute(
            "INSERT INTO otps (email, code_hash, created_at, expires_at, used) VALUES (?, ?, ?, ?, 0)",
            (
                email,
                hashlib.sha256(code.encode()).hexdigest(),
                now.isoformat(),
                (now + timedelta(minutes=10)).isoformat(),
            ),
        )
        conn.commit()

    def verify_otp(self, email: str, code: str) -> bool:
        """Return True if the code is valid; marks it used."""
        import hashlib
        conn = self._get_conn()
        now = datetime.utcnow().isoformat()
        code_hash = hashlib.sha256(code.encode()).hexdigest()
        row = conn.execute(
            """
            SELECT id FROM otps
            WHERE email = ? AND code_hash = ? AND used = 0 AND expires_at > ?
            ORDER BY created_at DESC LIMIT 1
            """,
            (email, code_hash, now),
        ).fetchone()
        if not row:
            return False
        conn.execute("UPDATE otps SET used = 1 WHERE id = ?", (row["id"],))
        conn.commit()
        return True

    # ── Audit log ────────────────────────────────────────────────────────────

    def log_event(
        self, event_type: str, user_id: Optional[str] = None, details: Optional[dict] = None
    ) -> None:
        conn = self._get_conn()
        conn.execute(
            "INSERT INTO audit_log (event_type, user_id, details, created_at) VALUES (?, ?, ?, ?)",
            (
                event_type,
                user_id,
                json.dumps(details or {}),
                datetime.utcnow().isoformat(),
            ),
        )
        conn.commit()

    def list_audit_log(self, limit: int = 100, user_id: Optional[str] = None) -> List[Dict]:
        conn = self._get_conn()
        if user_id:
            rows = conn.execute(
                "SELECT * FROM audit_log WHERE user_id = ? ORDER BY created_at DESC LIMIT ?",
                (user_id, limit),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM audit_log ORDER BY created_at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [dict(r) for r in rows]

    def get_admin_stats(self) -> Dict[str, Any]:
        """Aggregate stats for the admin dashboard."""
        conn = self._get_conn()
        total_users = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]
        total_workflows = conn.execute("SELECT COUNT(*) FROM workflows").fetchone()[0]
        completed = conn.execute(
            "SELECT COUNT(*) FROM workflows WHERE status = 'completed'"
        ).fetchone()[0]
        failed = conn.execute(
            "SELECT COUNT(*) FROM workflows WHERE status = 'failed'"
        ).fetchone()[0]
        # Token usage across all workflows
        rows = conn.execute("SELECT state_json FROM workflows").fetchall()
        total_tokens = 0
        total_cost = 0.0
        for r in rows:
            try:
                d = json.loads(r["state_json"])
                tm = d.get("token_metrics", {})
                total_tokens += tm.get("total_input_tokens", 0) + tm.get("total_output_tokens", 0)
                total_cost += tm.get("estimated_cost", 0.0)
            except Exception:
                pass
        # Daily workflow counts for the last 14 days
        daily = conn.execute(
            """
            SELECT substr(created_at, 1, 10) as day, COUNT(*) as count
            FROM workflows
            WHERE created_at >= date('now', '-14 days')
            GROUP BY day ORDER BY day
            """
        ).fetchall()
        return {
            "total_users": total_users,
            "total_workflows": total_workflows,
            "completed_workflows": completed,
            "failed_workflows": failed,
            "success_rate": round(completed / total_workflows * 100, 1) if total_workflows else 0,
            "total_tokens": total_tokens,
            "total_cost": round(total_cost, 4),
            "daily_workflows": [{"day": r["day"], "count": r["count"]} for r in daily],
        }
