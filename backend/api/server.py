"""Flask REST API for the AI Workflow Orchestrator."""
import json
import os
import queue
import sys
import threading
import uuid
from functools import wraps

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

# Load .env file if present
try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass

import jwt as _jwt
from flask import Flask, Response, jsonify, request, stream_with_context

from backend.orchestrator.engine import WorkflowEngine
from backend.orchestrator.llm_client import LLMClient
from backend.orchestrator.models import (
    CustomAgentDefinition,
    TaskStatus,
    WorkflowState,
    WorkflowStatus,
)
from backend.orchestrator.storage import StorageAdapter

app = Flask(__name__)
app.secret_key = os.environ.get("JWT_SECRET", "weave-dev-secret-change-in-prod")

# ── Persistent storage ───────────────────────────────────────────────────────
_store = StorageAdapter(db_path=os.environ.get("DB_PATH", "workflows.db"))
app.config["STORE"] = _store

# ── Register blueprints ──────────────────────────────────────────────────────
from backend.api.auth import auth_bp               # noqa: E402
from backend.api.admin import admin_bp             # noqa: E402
from backend.api.export import export_bp           # noqa: E402
from backend.api.linkedin import linkedin_bp       # noqa: E402
from backend.api.openapi_spec import openapi_bp    # noqa: E402

app.register_blueprint(auth_bp)
app.register_blueprint(admin_bp)
app.register_blueprint(export_bp)
app.register_blueprint(linkedin_bp)
app.register_blueprint(openapi_bp)

# ── Auth middleware ───────────────────────────────────────────────────────────

_JWT_SECRET = os.environ.get("JWT_SECRET", "weave-dev-secret-change-in-prod")


def require_auth(f):
    """Decorator: validates Bearer JWT; sets request.user_id / request.is_admin."""
    @wraps(f)
    def decorated(*args, **kwargs):
        auth = request.headers.get("Authorization", "")
        token = auth[7:] if auth.startswith("Bearer ") else None
        if not token:
            return jsonify({"error": "Authentication required"}), 401
        try:
            payload = _jwt.decode(token, _JWT_SECRET, algorithms=["HS256"])
            request.user_id    = payload["sub"]
            request.user_email = payload.get("email", "")
            request.is_admin   = payload.get("is_admin", False)
        except _jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except _jwt.InvalidTokenError:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return decorated


class _WorkflowsCompat:
    """Backward-compatible dict-like interface over StorageAdapter (for tests)."""

    def clear(self) -> None:
        """Delete all workflows from the database (used in test setUp)."""
        import sqlite3
        try:
            conn = sqlite3.connect(_store.db_path)
            conn.execute("DELETE FROM workflows")
            conn.commit()
            conn.close()
        except Exception:
            pass

    def get(self, workflow_id: str):
        return _store.load(workflow_id)

    def __setitem__(self, key: str, value) -> None:
        _store.save(value)

    def __len__(self) -> int:
        return len(_store.list_workflows(limit=1000))


# Exported for backward-compatibility with tests
_workflows = _WorkflowsCompat()

# ── Live-execution registry for pause/resume signalling ─────────────────────
# These hold references to the *same* WorkflowState objects that background
# threads are mutating, so setting state.status from the pause endpoint works.
_running_states: dict = {}   # workflow_id → WorkflowState (live)
_command_queues: dict = {}   # workflow_id → queue.Queue (resume/abort signals)

# ── Hardcoded demo templates ─────────────────────────────────────────────────
_BUILTIN_TEMPLATES = [
    {
        "id": "competitive-analysis",
        "name": "Competitive Analysis",
        "description": "Research competitors, analyze market position, and produce strategic recommendations",
        "input": "Conduct a comprehensive competitive analysis of the AI assistant market, identifying key players, their strengths and weaknesses, market share, pricing strategies, and opportunities for differentiation.",
        "is_custom": False,
    },
    {
        "id": "content-pipeline",
        "name": "Content Pipeline",
        "description": "Research a topic, draft content, review for quality, and produce a polished article",
        "input": "Research the impact of generative AI on software development productivity, write a comprehensive blog post aimed at engineering managers, review it for technical accuracy and clarity, then produce the final publication-ready version.",
        "is_custom": False,
    },
    {
        "id": "data-analysis",
        "name": "Data Analysis Report",
        "description": "Analyze trends, synthesize insights, and deliver an executive-ready data report",
        "input": "Analyze current trends in remote work adoption post-2020, including productivity data, employee preferences, company policies, and economic impacts. Write an executive report with strategic recommendations for HR leaders.",
        "is_custom": False,
    },
]


# ── Helpers ──────────────────────────────────────────────────────────────────

def _get_engine(event_callback=None) -> WorkflowEngine:
    return WorkflowEngine(
        llm_client=LLMClient(),
        event_callback=event_callback,
        storage=_store,
    )


def _validate_input(data: dict) -> tuple:
    if not data or "input" not in data:
        return None, (jsonify({"error": "Missing 'input' field"}), 400)
    user_input = data["input"]
    if not isinstance(user_input, str):
        return None, (jsonify({"error": "'input' must be a string"}), 400)
    if len(user_input.strip()) < 10:
        return None, (jsonify({"error": "Input must be at least 10 characters"}), 400)
    if len(user_input) > 5000:
        return None, (jsonify({"error": "Input must be at most 5000 characters"}), 400)
    return user_input.strip(), None


def _cors(resp: Response) -> Response:
    resp.headers["Access-Control-Allow-Origin"] = "*"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
    resp.headers["Access-Control-Allow-Methods"] = "GET, POST, DELETE, OPTIONS"
    return resp


@app.after_request
def after_request(resp: Response) -> Response:
    return _cors(resp)


# ── Health ────────────────────────────────────────────────────────────────────

@app.route("/api/health", methods=["GET"])
def health():
    client = LLMClient()
    return jsonify({
        "status": "ok",
        "provider": client.provider,
        "model": client.model,
        "active_workflows": len(_running_states),
    })


# ── Workflow CRUD ─────────────────────────────────────────────────────────────

@app.route("/api/workflows", methods=["POST"])
@require_auth
def create_workflow():
    """Create and decompose a workflow from user input."""
    data = request.get_json(silent=True) or {}
    user_input, err = _validate_input(data)
    if err:
        return err

    engine = _get_engine()
    state = engine.create_workflow(user_input)

    try:
        state.dag = engine.decomposer.decompose(user_input)
        state.status = WorkflowStatus.AWAITING_APPROVAL
        state.add_event("decomposition_complete", {"task_count": len(state.dag.tasks)})
    except Exception as e:
        state.status = WorkflowStatus.FAILED
        state.error_log.append(str(e))

    _store.save(state, user_id=request.user_id)
    return jsonify(state.to_dict()), 201


@app.route("/api/workflows", methods=["GET"])
@require_auth
def list_workflows():
    """List workflow history with pagination (scoped to current user)."""
    limit = min(int(request.args.get("limit", 50)), 100)
    offset = int(request.args.get("offset", 0))
    workflows = _store.list_workflows(limit=limit, offset=offset, user_id=request.user_id)
    return jsonify({"workflows": workflows, "limit": limit, "offset": offset})


@app.route("/api/workflows/<workflow_id>", methods=["GET"])
@require_auth
def get_workflow(workflow_id: str):
    state = _running_states.get(workflow_id) or _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/execute", methods=["POST"])
@require_auth
def execute_workflow(workflow_id: str):
    """Execute an approved (decomposed) workflow synchronously."""
    state = _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    if state.status not in (WorkflowStatus.AWAITING_APPROVAL, WorkflowStatus.PAUSED):
        return jsonify({
            "error": f"Workflow is in '{state.status.value}' status and cannot be executed"
        }), 400

    engine = _get_engine()
    state = engine.execute(state)
    _store.save(state, user_id=request.user_id)
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/pause", methods=["POST"])
@require_auth
def pause_workflow(workflow_id: str):
    state = _running_states.get(workflow_id) or _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    engine = _get_engine()
    engine.pause(state)
    _store.save(state, user_id=request.user_id)
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/resume", methods=["POST"])
@require_auth
def resume_workflow(workflow_id: str):
    """Resume a paused workflow, optionally injecting edited task output."""
    data = request.get_json(silent=True) or {}
    edited_output = data.get("edited_output")
    task_id_to_edit = data.get("task_id")

    cmd_q = _command_queues.get(workflow_id)
    if cmd_q:
        cmd_q.put({"type": "resume", "edited_output": edited_output, "task_id": task_id_to_edit})
        return jsonify({"status": "resume_signalled", "workflow_id": workflow_id})

    state = _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    if edited_output:
        tid = task_id_to_edit or state.current_task_id
        if tid and state.dag:
            task = state.dag.get_task(tid)
            if task:
                task.output = edited_output
                task.status = TaskStatus.COMPLETED

    engine = _get_engine()
    state = engine.resume(state)
    _store.save(state, user_id=request.user_id)
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/save-template", methods=["POST"])
@require_auth
def save_as_template(workflow_id: str):
    state = _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    data = request.get_json(silent=True) or {}
    name = data.get("name") or (state.dag.workflow_name if state.dag else "Saved Template")
    description = data.get("description", "")

    tid = _store.save_template(
        name=name,
        description=description,
        user_input=state.user_input,
        user_id=request.user_id,
    )
    return jsonify({"template_id": tid, "name": name})


@app.route("/api/workflows/<workflow_id>/rerun", methods=["POST"])
@require_auth
def rerun_workflow(workflow_id: str):
    state = _store.load(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    engine = _get_engine()
    new_state = engine.create_workflow(state.user_input)
    _store.save(new_state, user_id=request.user_id)
    return jsonify({"workflow_id": new_state.workflow_id, "status": new_state.status.value}), 201


# ── Templates ─────────────────────────────────────────────────────────────────

@app.route("/api/templates", methods=["GET"])
@require_auth
def get_templates():
    """Return built-in templates + user's saved templates."""
    saved = _store.list_templates(user_id=request.user_id)
    saved_formatted = [
        {
            "id": t["template_id"],
            "name": t["name"],
            "description": t["description"],
            "input": t["user_input"],
            "is_custom": True,
        }
        for t in saved
    ]
    return jsonify({"templates": _BUILTIN_TEMPLATES + saved_formatted})


@app.route("/api/templates/<template_id>", methods=["DELETE"])
@require_auth
def delete_template(template_id: str):
    deleted = _store.delete_template(template_id)
    if not deleted:
        return jsonify({"error": "Template not found"}), 404
    return jsonify({"status": "deleted"})


# ── Custom agents ─────────────────────────────────────────────────────────────

@app.route("/api/agents", methods=["GET"])
@require_auth
def list_agents():
    agents = _store.list_custom_agents(user_id=request.user_id)
    return jsonify({"agents": [a.to_dict() for a in agents]})


@app.route("/api/agents", methods=["POST"])
@require_auth
def create_agent_endpoint():
    data = request.get_json(silent=True) or {}
    name = data.get("name", "").strip()
    system_prompt = data.get("system_prompt", "").strip()
    temperature = float(data.get("temperature", 0.5))

    if not name:
        return jsonify({"error": "Agent 'name' is required"}), 400
    if not system_prompt:
        return jsonify({"error": "Agent 'system_prompt' is required"}), 400
    if not (0.0 <= temperature <= 1.0):
        return jsonify({"error": "Temperature must be between 0.0 and 1.0"}), 400

    agent_id = data.get("id") or f"custom_{str(uuid.uuid4())[:8]}"
    agent = CustomAgentDefinition(
        id=agent_id,
        name=name,
        system_prompt=system_prompt,
        temperature=temperature,
    )
    _store.save_custom_agent(agent, user_id=request.user_id)
    return jsonify(agent.to_dict()), 201


@app.route("/api/agents/<agent_id>", methods=["DELETE"])
@require_auth
def delete_agent(agent_id: str):
    deleted = _store.delete_custom_agent(agent_id, user_id=request.user_id)
    if not deleted:
        return jsonify({"error": "Agent not found"}), 404
    return jsonify({"status": "deleted"})


@app.route("/api/agents/test", methods=["POST"])
@require_auth
def test_agent():
    """Run a system prompt against sample input and return the output + cost."""
    import time as _time
    data = request.get_json(silent=True) or {}
    system_prompt = data.get("system_prompt", "").strip()
    test_input = data.get("test_input", "").strip()
    temperature = float(data.get("temperature", 0.5))

    if not system_prompt:
        return jsonify({"error": "system_prompt is required"}), 400
    if not test_input:
        return jsonify({"error": "test_input is required"}), 400

    client = LLMClient()
    t0 = _time.time()
    result = client.complete(
        messages=[{"role": "user", "content": test_input}],
        system=system_prompt,
        temperature=temperature,
        max_tokens=1024,
    )
    elapsed_ms = int((_time.time() - t0) * 1000)
    in_tok = result.get("input_tokens", 0)
    out_tok = result.get("output_tokens", 0)
    # Claude Opus 4.6: $3/1M input, $15/1M output
    cost = (in_tok * 3 + out_tok * 15) / 1_000_000
    return jsonify({
        "output": result.get("content", ""),
        "input_tokens": in_tok,
        "output_tokens": out_tok,
        "cost": cost,
        "elapsed_ms": elapsed_ms,
    })


@app.route("/api/agents/generate-prompt", methods=["POST"])
@require_auth
def generate_agent_prompt():
    """Generate a system prompt from a plain-language description via the LLM."""
    data = request.get_json(silent=True) or {}
    purpose = data.get("purpose", "").strip()
    context = data.get("context", "").strip()
    output_desc = data.get("output_desc", "").strip()
    tone = data.get("tone", "professional").strip()

    if not purpose:
        return jsonify({"error": "purpose is required"}), 400

    meta_system = (
        "You are a prompt engineering expert. Write a concise but comprehensive system prompt "
        "for an AI agent based on the description provided. The system prompt must: clearly define "
        "the agent's role, specify what it does, describe the expected output format, and set the "
        "appropriate tone and constraints. Return ONLY the raw system prompt text — no explanation, "
        "no markdown code fences, no preamble. Start with 'You are…'."
    )
    parts = [f"Purpose: {purpose}"]
    if context:
        parts.append(f"Input the agent will receive: {context}")
    if output_desc:
        parts.append(f"Expected output: {output_desc}")
    if tone:
        parts.append(f"Tone / behavioral style: {tone}")
    parts.append("\nWrite the system prompt:")

    client = LLMClient()
    result = client.complete(
        messages=[{"role": "user", "content": "\n".join(parts)}],
        system=meta_system,
        temperature=0.4,
        max_tokens=512,
    )
    return jsonify({"system_prompt": result.get("content", "").strip()})


# ── One-shot run ──────────────────────────────────────────────────────────────

@app.route("/api/run", methods=["POST"])
@require_auth
def quick_run():
    data = request.get_json(silent=True) or {}
    user_input, err = _validate_input(data)
    if err:
        return err

    engine = _get_engine()
    state = engine.run(user_input)
    _store.save(state, user_id=request.user_id)

    final_output = engine.get_final_output(state)
    return jsonify({
        "workflow_id": state.workflow_id,
        "status": state.status.value,
        "workflow_name": state.dag.workflow_name if state.dag else None,
        "final_output": final_output,
        "token_metrics": state.token_metrics.to_dict(),
        "task_count": len(state.dag.tasks) if state.dag else 0,
    })


# ── SSE streaming run ─────────────────────────────────────────────────────────

@app.route("/api/run/stream", methods=["POST", "OPTIONS"])
@require_auth
def stream_run():
    """Stream workflow execution as Server-Sent Events."""
    if request.method == "OPTIONS":
        return Response(headers={
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        })

    data = request.get_json(silent=True) or {}
    user_input, err = _validate_input(data)
    if err:
        return err
    _uid = request.user_id

    event_q: queue.Queue = queue.Queue()
    command_q: queue.Queue = queue.Queue()

    def run_in_thread() -> None:
        try:
            def callback(event_type: str, event_data: dict) -> None:
                event_q.put({"type": event_type, **event_data})

            engine = WorkflowEngine(
                llm_client=LLMClient(),
                event_callback=callback,
                storage=_store,
            )
            state = engine.create_workflow(user_input)
            _store.save(state, user_id=_uid)
            _running_states[state.workflow_id] = state
            _command_queues[state.workflow_id] = command_q

            # Announce workflow_id early so the frontend can use pause/resume
            event_q.put({"type": "workflow_id", "workflow_id": state.workflow_id})

            # Execute (may pause mid-way)
            state = engine.execute(state)
            _store.save(state, user_id=_uid)

            # Pause/resume loop — keeps the stream alive across resume cycles
            while state.status == WorkflowStatus.PAUSED:
                event_q.put({
                    "type": "workflow_paused",
                    "workflow_id": state.workflow_id,
                    "current_task_id": state.current_task_id,
                })

                # Wait for a resume or abort command (heartbeats while waiting)
                cmd = None
                while cmd is None:
                    try:
                        cmd = command_q.get(timeout=25)
                    except queue.Empty:
                        event_q.put({"type": "heartbeat"})

                if cmd.get("type") == "abort":
                    state.status = WorkflowStatus.FAILED
                    state.error_log.append("Workflow aborted by user")
                    _store.save(state)
                    event_q.put({"type": "error", "message": "Workflow aborted"})
                    break

                # Resume: optionally patch an edited task output
                edited_output = cmd.get("edited_output")
                patch_tid = cmd.get("task_id") or state.current_task_id
                if edited_output and patch_tid and state.dag:
                    task = state.dag.get_task(patch_tid)
                    if task:
                        task.output = edited_output
                        task.status = TaskStatus.COMPLETED

                state.status = WorkflowStatus.RUNNING
                state.add_event("workflow_resumed")
                engine._emit("workflow_resumed", {"workflow_id": state.workflow_id})
                state = engine.execute(state)
                _store.save(state)

            # Emit final workflow_complete
            if state.status == WorkflowStatus.COMPLETED:
                final_output = engine.get_final_output(state)
                event_q.put({
                    "type": "workflow_complete",
                    "workflow_id": state.workflow_id,
                    "status": state.status.value,
                    "final_output": final_output or "",
                    "token_metrics": state.token_metrics.to_dict(),
                })
            elif state.status == WorkflowStatus.FAILED:
                event_q.put({
                    "type": "error",
                    "message": "; ".join(state.error_log) or "Workflow failed",
                })

        except Exception as exc:
            event_q.put({"type": "error", "message": str(exc)})
        finally:
            wid = getattr(state, "workflow_id", None) if "state" in dir() else None
            if wid:
                _running_states.pop(wid, None)
                _command_queues.pop(wid, None)
            event_q.put(None)  # sentinel — close stream

    threading.Thread(target=run_in_thread, daemon=True).start()

    def generate():
        while True:
            try:
                event = event_q.get(timeout=30)
            except queue.Empty:
                yield 'data: {"type": "heartbeat"}\n\n'
                continue
            if event is None:
                break
            yield f"data: {json.dumps(event)}\n\n"

    return Response(
        stream_with_context(generate()),
        mimetype="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
            "Access-Control-Allow-Origin": "*",
        },
    )


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "false").lower() == "true"
    print(f"Starting AI Workflow Orchestrator on port {port}")
    print(f"Provider: {LLMClient().provider}")
    app.run(host="0.0.0.0", port=port, debug=debug, use_reloader=False)
