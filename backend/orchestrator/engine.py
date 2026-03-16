"""Workflow execution engine — runs tasks in parallel waves via topological order."""
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime
from typing import Any, Callable, Dict, List, Optional

from ..agents.agents import create_agent
from .decomposer import DecompositionEngine, DecompositionError
from .llm_client import LLMClient, LLMError
from .models import AgentType, Task, TaskStatus, WorkflowState, WorkflowStatus


class WorkflowEngine:
    """Orchestrates the full lifecycle of a workflow."""

    def __init__(
        self,
        llm_client: Optional[LLMClient] = None,
        event_callback: Optional[Callable[[str, Dict[str, Any]], None]] = None,
        storage: Optional[Any] = None,  # StorageAdapter — optional to avoid circular import
        parallel: bool = True,
    ):
        self.llm_client = llm_client or LLMClient()
        self.event_callback = event_callback
        self.storage = storage
        self.parallel = parallel

        # Build decomposer with custom agents if storage is available
        custom_agents = []
        if storage:
            try:
                custom_agents = storage.list_custom_agents()
            except Exception:
                pass
        self.decomposer = DecompositionEngine(self.llm_client, custom_agents=custom_agents)

    def _emit(self, event_type: str, data: Optional[Dict[str, Any]] = None) -> None:
        if self.event_callback:
            self.event_callback(event_type, data or {})

    def create_workflow(self, user_input: str) -> WorkflowState:
        """Create a new workflow state without executing it."""
        state = WorkflowState(user_input=user_input)
        state.add_event("workflow_created", {"workflow_id": state.workflow_id})
        self._emit("workflow_created", {"workflow_id": state.workflow_id, "user_input": user_input})
        return state

    # ── Single-task execution (thread-safe) ─────────────────────────────────

    def _execute_single_task(self, state: WorkflowState, task: Task) -> None:
        """Execute one task and update state. Safe to call from multiple threads."""
        agent_type_str = (
            task.agent_type.value if isinstance(task.agent_type, AgentType) else task.agent_type
        )

        state.current_task_id = task.id
        task.status = TaskStatus.RUNNING
        task.started_at = datetime.utcnow()
        state.add_event("task_started", {"task_id": task.id, "agent_type": agent_type_str})
        self._emit("task_started", {"task_id": task.id, "agent_type": agent_type_str})

        try:
            # Look up custom agent definition if needed
            custom_def = None
            if isinstance(task.agent_type, str) and self.storage:
                custom_def = self.storage.load_custom_agent(task.agent_type)

            agent = create_agent(task.agent_type, self.llm_client, custom_def=custom_def)

            # Snapshot context chain (thread-safe)
            with state._lock:
                context_snapshot = list(state.context_chain)

            result = agent.execute(
                task_description=task.description,
                original_intent=state.user_input,
                context_chain=context_snapshot,
                expected_output=task.expected_output,
            )

            task.output = result["content"]
            task.token_usage = result.get("usage", {})
            task.status = TaskStatus.COMPLETED
            task.completed_at = datetime.utcnow()

            # Record token metrics (locked)
            with state._lock:
                usage = result.get("usage", {})
                state.token_metrics.record(
                    task.id,
                    usage.get("input_tokens", 0),
                    usage.get("output_tokens", 0),
                )
                cumulative_tokens = (
                    state.token_metrics.total_input_tokens
                    + state.token_metrics.total_output_tokens
                )
                cumulative_cost = state.token_metrics.estimated_cost

            # Add to context chain (already thread-safe via add_context)
            state.add_context(
                task_id=task.id,
                agent_type=agent_type_str,
                summary=result.get("summary", (task.output or "")[:300]),
                full_output=task.output or "",
            )

            state.add_event("task_completed", {
                "task_id": task.id,
                "duration_seconds": task.duration_seconds,
                "token_usage": task.token_usage,
            })
            self._emit("task_completed", {
                "task_id": task.id,
                "agent_type": agent_type_str,
                "full_output": task.output or "",
                "output_preview": (task.output or "")[:200],
                "cumulative_tokens": cumulative_tokens,
                "cumulative_cost": cumulative_cost,
            })

        except Exception as e:
            task.status = TaskStatus.FAILED
            task.error = str(e)
            task.completed_at = datetime.utcnow()
            with state._lock:
                state.error_log.append(f"Task {task.id} failed: {e}")
            state.add_event("task_failed", {"task_id": task.id, "error": str(e)})
            self._emit("task_failed", {"task_id": task.id, "error": str(e)})
            raise  # re-raise so wave loop can catch it

    # ── Wave-based parallel execution ────────────────────────────────────────

    def execute(self, state: WorkflowState) -> WorkflowState:
        """Decompose (if needed) and execute a workflow from a given state."""
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

        # Execute tasks in parallel waves
        state.status = WorkflowStatus.RUNNING
        state.add_event("execution_started", {"workflow_id": state.workflow_id})
        self._emit("execution_started", {"workflow_id": state.workflow_id})

        waves = state.dag.get_execution_waves()

        for wave in waves:
            # Pause check at wave boundary (between waves, not mid-wave)
            if state.status == WorkflowStatus.PAUSED:
                state.add_event("execution_paused")
                break

            # Skip tasks already done in previous partial runs
            pending = [
                t for t in wave
                if t.status not in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.SKIPPED)
            ]
            if not pending:
                continue

            # Check that all deps are satisfied (defensive)
            runnable = []
            for task in pending:
                deps_ok = all(
                    state.dag.get_task(dep_id) and
                    state.dag.get_task(dep_id).status == TaskStatus.COMPLETED
                    for dep_id in task.depends_on
                )
                if deps_ok:
                    runnable.append(task)
                else:
                    task.status = TaskStatus.SKIPPED
                    state.add_event("task_skipped", {"task_id": task.id})

            if not runnable:
                continue

            if len(runnable) == 1 or not self.parallel:
                # Sequential — no overhead of thread pool
                for task in runnable:
                    try:
                        self._execute_single_task(state, task)
                    except Exception:
                        state.status = WorkflowStatus.FAILED
                        return state
            else:
                # Parallel — all tasks in the wave run concurrently
                failed = False
                max_workers = min(8, len(runnable))
                with ThreadPoolExecutor(max_workers=max_workers) as pool:
                    futures = {
                        pool.submit(self._execute_single_task, state, task): task
                        for task in runnable
                    }
                    for future in as_completed(futures):
                        try:
                            future.result()
                        except Exception:
                            failed = True
                            # Cancel pending (not yet started) futures
                            for f in futures:
                                f.cancel()
                if failed:
                    state.status = WorkflowStatus.FAILED
                    return state

            # Save progress after each wave
            if self.storage:
                try:
                    self.storage.save(state)
                except Exception:
                    pass

        if state.status not in (WorkflowStatus.PAUSED, WorkflowStatus.FAILED):
            state.status = WorkflowStatus.COMPLETED
            state.completed_at = datetime.utcnow()
            state.add_event("workflow_completed", {
                "total_tokens": (
                    state.token_metrics.total_input_tokens
                    + state.token_metrics.total_output_tokens
                ),
                "estimated_cost": state.token_metrics.estimated_cost,
            })
            self._emit("workflow_completed", {
                "workflow_id": state.workflow_id,
                "token_metrics": state.token_metrics.to_dict(),
            })

        return state

    def pause(self, state: WorkflowState) -> WorkflowState:
        """Signal the engine to pause at the next wave boundary."""
        if state.status == WorkflowStatus.RUNNING:
            state.status = WorkflowStatus.PAUSED
            state.add_event("workflow_paused")
            self._emit("workflow_paused", {"workflow_id": state.workflow_id})
        return state

    def resume(self, state: WorkflowState) -> WorkflowState:
        """Resume a paused workflow (re-enters execute which skips completed tasks)."""
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
