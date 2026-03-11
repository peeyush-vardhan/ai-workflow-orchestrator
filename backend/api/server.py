"""Flask REST API for the AI Workflow Orchestrator."""
import sys
import os

# Add the project root to path for proper imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))))

from flask import Flask, jsonify, request

from backend.orchestrator.engine import WorkflowEngine
from backend.orchestrator.llm_client import LLMClient
from backend.orchestrator.models import WorkflowStatus

app = Flask(__name__)

# In-memory workflow store
_workflows = {}

# Demo templates
TEMPLATES = [
    {
        "id": "competitive-analysis",
        "name": "Competitive Analysis",
        "description": "Research competitors, analyze market position, and produce strategic recommendations",
        "input": "Conduct a comprehensive competitive analysis of the AI assistant market, identifying key players, their strengths and weaknesses, market share, pricing strategies, and opportunities for differentiation.",
    },
    {
        "id": "content-pipeline",
        "name": "Content Pipeline",
        "description": "Research a topic, draft content, review for quality, and produce a polished article",
        "input": "Research the impact of generative AI on software development productivity, write a comprehensive blog post aimed at engineering managers, review it for technical accuracy and clarity, then produce the final publication-ready version.",
    },
    {
        "id": "data-analysis",
        "name": "Data Analysis Report",
        "description": "Analyze trends, synthesize insights, and deliver an executive-ready data report",
        "input": "Analyze current trends in remote work adoption post-2020, including productivity data, employee preferences, company policies, and economic impacts. Write an executive report with strategic recommendations for HR leaders.",
    },
]


def _get_engine() -> WorkflowEngine:
    """Create a new workflow engine (stateless)."""
    return WorkflowEngine(llm_client=LLMClient())


def _validate_input(data: dict) -> tuple:
    """Validate workflow input. Returns (input_str, error_response)."""
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


@app.route("/api/health", methods=["GET"])
def health():
    """Health check endpoint."""
    client = LLMClient()
    return jsonify({
        "status": "ok",
        "provider": client.provider,
        "model": client.model,
        "active_workflows": len(_workflows),
    })


@app.route("/api/workflows", methods=["POST"])
def create_workflow():
    """Create and decompose a workflow from user input."""
    data = request.get_json(silent=True) or {}
    user_input, err = _validate_input(data)
    if err:
        return err

    engine = _get_engine()
    state = engine.create_workflow(user_input)

    # Perform decomposition
    from backend.orchestrator.decomposer import DecompositionEngine
    try:
        state.dag = engine.decomposer.decompose(user_input)
        from backend.orchestrator.models import WorkflowStatus
        state.status = WorkflowStatus.AWAITING_APPROVAL
        state.add_event("decomposition_complete", {
            "task_count": len(state.dag.tasks),
        })
    except Exception as e:
        state.status = WorkflowStatus.FAILED
        state.error_log.append(str(e))

    _workflows[state.workflow_id] = state
    return jsonify(state.to_dict()), 201


@app.route("/api/workflows/<workflow_id>/execute", methods=["POST"])
def execute_workflow(workflow_id: str):
    """Execute an approved (decomposed) workflow."""
    state = _workflows.get(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    if state.status not in (WorkflowStatus.AWAITING_APPROVAL, WorkflowStatus.PAUSED):
        return jsonify({
            "error": f"Workflow is in '{state.status.value}' status and cannot be executed"
        }), 400

    engine = _get_engine()
    state = engine.execute(state)
    _workflows[workflow_id] = state
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>", methods=["GET"])
def get_workflow(workflow_id: str):
    """Get the current state and results of a workflow."""
    state = _workflows.get(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/pause", methods=["POST"])
def pause_workflow(workflow_id: str):
    """Pause a running workflow at the next task boundary."""
    state = _workflows.get(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    engine = _get_engine()
    state = engine.pause(state)
    _workflows[workflow_id] = state
    return jsonify(state.to_dict())


@app.route("/api/workflows/<workflow_id>/resume", methods=["POST"])
def resume_workflow(workflow_id: str):
    """Resume a paused workflow, optionally injecting edited output."""
    state = _workflows.get(workflow_id)
    if not state:
        return jsonify({"error": f"Workflow '{workflow_id}' not found"}), 404

    data = request.get_json(silent=True) or {}
    edited_output = data.get("edited_output")

    if edited_output and state.current_task_id and state.dag:
        task = state.dag.get_task(state.current_task_id)
        if task:
            task.output = edited_output

    engine = _get_engine()
    state = engine.resume(state)
    _workflows[workflow_id] = state
    return jsonify(state.to_dict())


@app.route("/api/templates", methods=["GET"])
def get_templates():
    """Return demo workflow templates."""
    return jsonify({"templates": TEMPLATES})


@app.route("/api/run", methods=["POST"])
def quick_run():
    """One-shot: decompose and execute a workflow, returning final output."""
    data = request.get_json(silent=True) or {}
    user_input, err = _validate_input(data)
    if err:
        return err

    engine = _get_engine()
    state = engine.run(user_input)
    _workflows[state.workflow_id] = state

    final_output = engine.get_final_output(state)
    return jsonify({
        "workflow_id": state.workflow_id,
        "status": state.status.value,
        "workflow_name": state.dag.workflow_name if state.dag else None,
        "final_output": final_output,
        "token_metrics": state.token_metrics.to_dict(),
        "task_count": len(state.dag.tasks) if state.dag else 0,
    })


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("DEBUG", "true").lower() == "true"
    print(f"Starting AI Workflow Orchestrator on port {port}")
    print(f"Provider: {LLMClient().provider}")
    app.run(host="0.0.0.0", port=port, debug=debug)
