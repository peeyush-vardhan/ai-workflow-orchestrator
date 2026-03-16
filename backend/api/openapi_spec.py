"""OpenAPI 3.0 spec — enables ChatGPT GPT Actions and Gemini Extensions."""
import os
from flask import Blueprint, jsonify

openapi_bp = Blueprint("openapi", __name__)

_SPEC = {
    "openapi": "3.0.3",
    "info": {
        "title": "AI Workflow Orchestrator",
        "version": "1.0.0",
        "description": (
            "Multi-agent AI workflow system. Provide a natural-language task description "
            "and receive a fully researched, written, reviewed, and polished output produced "
            "by a pipeline of specialized AI agents (Researcher → Writer → Reviewer → Executor)."
        ),
    },
    "servers": [
        {"url": os.environ.get("PUBLIC_URL", "http://localhost:5000")}
    ],
    "paths": {
        "/api/run": {
            "post": {
                "operationId": "runWorkflow",
                "summary": "Run a multi-agent AI workflow",
                "description": (
                    "Decomposes the input into a DAG of 2-8 subtasks, executes them through "
                    "specialized agents in parallel waves, and returns the final output."
                ),
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/RunRequest"},
                            "example": {"input": "Research the latest trends in AI and write a comprehensive executive summary."},
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Workflow completed successfully",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/RunResponse"}
                            }
                        },
                    },
                    "400": {"description": "Invalid input"},
                    "500": {"description": "Server error"},
                },
            }
        },
        "/api/workflows/{workflow_id}": {
            "get": {
                "operationId": "getWorkflow",
                "summary": "Get the status and output of a workflow",
                "parameters": [
                    {
                        "name": "workflow_id",
                        "in": "path",
                        "required": True,
                        "schema": {"type": "string"},
                    }
                ],
                "responses": {
                    "200": {
                        "description": "Workflow state",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/WorkflowState"}
                            }
                        },
                    },
                    "404": {"description": "Workflow not found"},
                },
            }
        },
        "/api/workflows": {
            "get": {
                "operationId": "listWorkflows",
                "summary": "List recent workflow runs",
                "parameters": [
                    {"name": "limit",  "in": "query", "schema": {"type": "integer", "default": 20}},
                    {"name": "offset", "in": "query", "schema": {"type": "integer", "default": 0}},
                ],
                "responses": {
                    "200": {"description": "List of workflow summaries"}
                },
            }
        },
    },
    "components": {
        "schemas": {
            "RunRequest": {
                "type": "object",
                "required": ["input"],
                "properties": {
                    "input": {
                        "type": "string",
                        "minLength": 10,
                        "maxLength": 5000,
                        "description": "Natural-language description of the workflow to execute.",
                    }
                },
            },
            "RunResponse": {
                "type": "object",
                "properties": {
                    "workflow_id":   {"type": "string"},
                    "status":        {"type": "string", "enum": ["completed", "failed", "paused"]},
                    "workflow_name": {"type": "string"},
                    "final_output":  {"type": "string", "description": "The final synthesized output from the agent pipeline."},
                    "task_count":    {"type": "integer"},
                    "token_metrics": {"type": "object"},
                },
            },
            "WorkflowState": {
                "type": "object",
                "properties": {
                    "workflow_id":    {"type": "string"},
                    "user_input":     {"type": "string"},
                    "status":         {"type": "string"},
                    "dag":            {"type": "object"},
                    "token_metrics":  {"type": "object"},
                    "context_chain":  {"type": "array", "items": {"type": "object"}},
                    "error_log":      {"type": "array", "items": {"type": "string"}},
                    "created_at":     {"type": "string", "format": "date-time"},
                    "completed_at":   {"type": "string", "format": "date-time"},
                },
            },
        }
    },
}


@openapi_bp.route("/api/openapi.json", methods=["GET"])
def openapi_json():
    """Serve the OpenAPI spec — import this URL into ChatGPT GPT Actions or Gemini Extensions."""
    return jsonify(_SPEC)
