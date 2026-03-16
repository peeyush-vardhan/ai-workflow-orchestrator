#!/usr/bin/env python3
"""
MCP Server — exposes the AI Workflow Orchestrator as a Claude tool.

Usage (Claude Desktop):
  1. Start the orchestrator:  python3 -m backend.api.server
  2. In claude_desktop_config.json add:
     {
       "mcpServers": {
         "workflow-orchestrator": {
           "command": "python3",
           "args": ["/absolute/path/to/mcp_server.py"]
         }
       }
     }
  3. Restart Claude Desktop — the tool appears automatically.

Usage (HTTP/SSE, for testing):
  python3 mcp_server.py --transport sse
  # → http://localhost:8000
"""
import os
import sys

import requests

try:
    from mcp.server.fastmcp import FastMCP
except ImportError:
    print("ERROR: mcp package not installed. Run: pip install mcp", file=sys.stderr)
    sys.exit(1)

ORCHESTRATOR_URL = os.environ.get("ORCHESTRATOR_URL", "http://localhost:5000")

mcp = FastMCP(
    "AI Workflow Orchestrator",
    instructions=(
        "Use run_workflow to execute a multi-agent research and writing pipeline. "
        "Provide a detailed natural-language description of the task. "
        "The orchestrator will decompose it, run specialized agents in parallel, "
        "and return a fully polished final output."
    ),
)


@mcp.tool()
def run_workflow(input: str) -> str:
    """Run a multi-agent AI workflow from a natural-language description.

    The orchestrator decomposes the input into a directed acyclic graph (DAG) of
    2-8 subtasks, executes them through specialized agents (Researcher, Writer,
    Reviewer, Executor) in parallel waves, and returns the final synthesized output.

    Args:
        input: Natural-language workflow description (10–5000 characters).
               Examples:
               - "Research the latest trends in quantum computing and write an executive report"
               - "Analyze competitor pricing strategies and produce recommendations"

    Returns:
        The final polished output from the agent pipeline (Markdown formatted).
    """
    resp = requests.post(
        f"{ORCHESTRATOR_URL}/api/run",
        json={"input": input},
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()
    final = data.get("final_output")
    if final:
        return final
    return f"Workflow '{data.get('workflow_id')}' status: {data.get('status')}"


@mcp.tool()
def get_workflow(workflow_id: str) -> str:
    """Get the status and output of a previously run workflow.

    Args:
        workflow_id: The 8-character workflow ID returned by run_workflow.

    Returns:
        Workflow status and a summary of each completed task.
    """
    resp = requests.get(f"{ORCHESTRATOR_URL}/api/workflows/{workflow_id}", timeout=10)
    resp.raise_for_status()
    data = resp.json()

    lines = [
        f"Workflow: {data.get('dag', {}).get('workflow_name', 'Unknown')}",
        f"Status:   {data.get('status')}",
        f"Input:    {data.get('user_input', '')[:120]}",
        "",
    ]
    dag = data.get("dag") or {}
    for task in dag.get("tasks", []):
        lines.append(f"[{task['status'].upper()}] {task['id']} — {task['description'][:80]}")

    tm = data.get("token_metrics", {})
    if tm:
        lines += ["", f"Tokens: {tm.get('total_input_tokens', 0) + tm.get('total_output_tokens', 0)}  Cost: ${tm.get('estimated_cost', 0):.4f}"]

    return "\n".join(lines)


@mcp.tool()
def list_workflows(limit: int = 10) -> str:
    """List recent workflow runs with their status and cost.

    Args:
        limit: Number of workflows to return (1–50, default 10).

    Returns:
        A formatted list of recent workflows.
    """
    limit = max(1, min(50, limit))
    resp = requests.get(f"{ORCHESTRATOR_URL}/api/workflows?limit={limit}", timeout=10)
    resp.raise_for_status()
    workflows = resp.json().get("workflows", [])

    if not workflows:
        return "No workflows found."

    lines = [f"Recent workflows ({len(workflows)} shown):", ""]
    for wf in workflows:
        lines.append(
            f"[{wf['status'].upper()}] {wf['workflow_id']} — {wf.get('workflow_name') or 'Unnamed'}"
        )
        lines.append(f"  Input: {wf['user_input'][:80]}")
        lines.append(f"  Tasks: {wf['task_count']}  Cost: ${wf.get('estimated_cost', 0):.4f}  {wf['created_at'][:19]}")
        lines.append("")

    return "\n".join(lines)


if __name__ == "__main__":
    transport = "stdio"
    if "--transport" in sys.argv:
        idx = sys.argv.index("--transport")
        if idx + 1 < len(sys.argv):
            transport = sys.argv[idx + 1]

    print(f"Starting MCP server (transport={transport}, orchestrator={ORCHESTRATOR_URL})", file=sys.stderr)
    mcp.run(transport=transport)
