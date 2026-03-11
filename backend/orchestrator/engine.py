"""Workflow execution engine — runs tasks in topological order."""
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from .decomposer import DecompositionEngine, DecompositionError
from .llm_client import LLMClient, LLMError
from .models import TaskStatus, WorkflowState, WorkflowStatus


class WorkflowEngine:
    """Orchestrates the full lifecycle of a workflow."""

    def __init__(
        self,
        llm_client: Optional[LLMClient] = None,
        event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
    ):
        self.llm_client = llm_client or LLMClient()
        self.event_callback = event_callback
        self.decomposer = DecompositionEngine(self.llm_client)

    def _emit(self, event_type: str, data: Optional[Dict[str, Any]] = None) -> None:
        if self.event_callback:
            self.event_callback(event_type, data or {})

    def create_workflow(self, user_input: str) -> WorkflowState:
        """Create a new workflow state without executing it."""
        state = WorkflowState(user_input=user_input)
        state.add_event("workflow_created", {"workflow_id": state.workflow_id})
        self._emit("workflow_created", {"workflow_id": state.workflow_id, "user_input": user_input})
        return state

    def execute(self, state: WorkflowState) -> WorkflowState:
        """Decompose and execute a workflow from a given state."""
        # Decompose if no DAG yet
        if state.dag is None:
            state.status = WorkflowStatus.DECOMPOSING
            state.add_event("decomposition_started")
            self._emit("decomposition_started", {"workflow_id": state.workflow_id})

            try:
                state.dag = self.decomposer.decompose(state.user_input)
                state.status = WorkflowStatus.AWAITING_APPROVAL
                state.add_event("decomposition_complete", {
                    "task_count": len(state.dag.tasks),
                    "workflow_name": state.dag.workflow_name,
                })
                self._emit("decomposition_complete", {
                    "workflow_id": state.workflow_id,
                    "dag": state.dag.to_dict(),
                })
            except (DecompositionError, Exception) as e:
                state.status = WorkflowStatus.FAILED
                state.error_log.append(f"Decomposition failed: {e}")
                state.add_event("decomposition_failed", {"error": str(e)})
                self._emit("decomposition_failed", {"error": str(e)})
                return state

        # Execute tasks
        state.status = WorkflowStatus.RUNNING
        state.add_event("execution_started", {"workflow_id": state.workflow_id})
        self._emit("execution_started", {"workflow_id": state.workflow_id})

        execution_order = state.dag.get_execution_order()

        for task in execution_order:
            if state.status == WorkflowStatus.PAUSED:
                state.add_event("execution_paused", {"task_id": task.id})
                break

            # Skip tasks that already completed
            if task.status == TaskStatus.COMPLETED:
                continue

            # Check dependencies
            deps_satisfied = all(
                state.dag.get_task(dep_id) and
                state.dag.get_task(dep_id).status == TaskStatus.COMPLETED
                for dep_id in task.depends_on
            )
            if not deps_satisfied:
                task.status = TaskStatus.SKIPPED
                state.add_event("task_skipped", {"task_id": task.id})
                continue

            # Execute task
            state.current_task_id = task.id
            task.status = TaskStatus.RUNNING
            task.started_at = datetime.utcnow()
            state.add_event("task_started", {
                "task_id": task.id,
                "agent_type": task.agent_type.value,
            })
            self._emit("task_started", {
                "task_id": task.id,
                "agent_type": task.agent_type.value,
            })

            try:
                from ..agents.agents import create_agent
                agent = create_agent(task.agent_type, self.llm_client)

                result = agent.execute(
                    task_description=task.description,
                    original_intent=state.user_input,
                    context_chain=state.context_chain,
                    expected_output=task.expected_output,
                )

                task.output = result["content"]
                task.token_usage = result.get("usage", {})
                task.status = TaskStatus.COMPLETED
                task.completed_at = datetime.utcnow()

                # Record metrics
                usage = result.get("usage", {})
                state.token_metrics.record(
                    task.id,
                    usage.get("input_tokens", 0),
                    usage.get("output_tokens", 0),
                )

                # Add to context chain
                state.add_context(
                    task_id=task.id,
                    agent_type=task.agent_type.value,
                    summary=result.get("summary", task.output[:300] if task.output else ""),
                    full_output=task.output or "",
                )

                state.add_event("task_completed", {
                    "task_id": task.id,
                    "duration_seconds": task.duration_seconds,
                    "token_usage": task.token_usage,
                })
                self._emit("task_completed", {
                    "task_id": task.id,
                    "agent_type": task.agent_type.value,
                    "output_preview": (task.output or "")[:200],
                })

            except LLMError as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.utcnow()
                state.error_log.append(f"Task {task.id} failed: {e}")
                state.status = WorkflowStatus.FAILED
                state.add_event("task_failed", {"task_id": task.id, "error": str(e)})
                self._emit("task_failed", {"task_id": task.id, "error": str(e)})
                return state

            except Exception as e:
                task.status = TaskStatus.FAILED
                task.error = str(e)
                task.completed_at = datetime.utcnow()
                state.error_log.append(f"Task {task.id} failed: {e}")
                state.status = WorkflowStatus.FAILED
                state.add_event("task_failed", {"task_id": task.id, "error": str(e)})
                self._emit("task_failed", {"task_id": task.id, "error": str(e)})
                return state

        if state.status != WorkflowStatus.PAUSED and state.status != WorkflowStatus.FAILED:
            state.status = WorkflowStatus.COMPLETED
            state.completed_at = datetime.utcnow()
            state.add_event("workflow_completed", {
                "total_tokens": state.token_metrics.total_input_tokens + state.token_metrics.total_output_tokens,
                "estimated_cost": state.token_metrics.estimated_cost,
            })
            self._emit("workflow_completed", {
                "workflow_id": state.workflow_id,
                "token_metrics": state.token_metrics.to_dict(),
            })

        return state

    def pause(self, state: WorkflowState) -> WorkflowState:
        """Pause the workflow at the next task boundary."""
        if state.status == WorkflowStatus.RUNNING:
            state.status = WorkflowStatus.PAUSED
            state.add_event("workflow_paused")
            self._emit("workflow_paused", {"workflow_id": state.workflow_id})
        return state

    def resume(self, state: WorkflowState) -> WorkflowState:
        """Resume a paused workflow."""
        if state.status == WorkflowStatus.PAUSED:
            state.status = WorkflowStatus.RUNNING
            state.add_event("workflow_resumed")
            self._emit("workflow_resumed", {"workflow_id": state.workflow_id})
            return self.execute(state)
        return state

    def run(self, user_input: str) -> WorkflowState:
        """One-shot: create and fully execute a workflow."""
        state = self.create_workflow(user_input)
        return self.execute(state)

    def get_final_output(self, state: WorkflowState) -> Optional[str]:
        """Extract the output from the last completed task."""
        if not state.dag:
            return None
        execution_order = state.dag.get_execution_order()
        for task in reversed(execution_order):
            if task.status == TaskStatus.COMPLETED and task.output:
                return task.output
        return None
