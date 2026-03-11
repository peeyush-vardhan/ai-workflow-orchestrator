"""Data models for the AI Workflow Orchestrator."""
import uuid
from dataclasses import dataclass, field
from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional


class AgentType(Enum):
    RESEARCHER = "researcher"
    WRITER = "writer"
    REVIEWER = "reviewer"
    EXECUTOR = "executor"


class TaskStatus(Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    SKIPPED = "skipped"


class WorkflowStatus(Enum):
    DECOMPOSING = "decomposing"
    AWAITING_APPROVAL = "awaiting_approval"
    RUNNING = "running"
    PAUSED = "paused"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class Task:
    id: str
    description: str
    agent_type: AgentType
    depends_on: List[str] = field(default_factory=list)
    expected_output: str = ""
    status: TaskStatus = TaskStatus.PENDING
    output: Optional[str] = None
    error: Optional[str] = None
    token_usage: Dict[str, int] = field(default_factory=dict)
    started_at: Optional[datetime] = None
    completed_at: Optional[datetime] = None

    @property
    def duration_seconds(self) -> Optional[float]:
        if self.started_at and self.completed_at:
            return (self.completed_at - self.started_at).total_seconds()
        return None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "id": self.id,
            "description": self.description,
            "agent_type": self.agent_type.value,
            "depends_on": self.depends_on,
            "expected_output": self.expected_output,
            "status": self.status.value,
            "output": self.output,
            "error": self.error,
            "token_usage": self.token_usage,
            "started_at": self.started_at.isoformat() if self.started_at else None,
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "duration_seconds": self.duration_seconds,
        }


@dataclass
class DAG:
    workflow_name: str
    tasks: List[Task] = field(default_factory=list)

    def get_task(self, task_id: str) -> Optional[Task]:
        for task in self.tasks:
            if task.id == task_id:
                return task
        return None

    def get_execution_order(self) -> List[Task]:
        """Topological sort of tasks based on dependencies."""
        in_degree = {task.id: 0 for task in self.tasks}
        adjacency: Dict[str, List[str]] = {task.id: [] for task in self.tasks}

        for task in self.tasks:
            for dep_id in task.depends_on:
                adjacency[dep_id].append(task.id)
                in_degree[task.id] += 1

        queue = [task for task in self.tasks if in_degree[task.id] == 0]
        result = []

        while queue:
            current = queue.pop(0)
            result.append(current)
            for neighbor_id in adjacency[current.id]:
                in_degree[neighbor_id] -= 1
                if in_degree[neighbor_id] == 0:
                    neighbor = self.get_task(neighbor_id)
                    if neighbor:
                        queue.append(neighbor)

        return result

    def validate(self) -> List[str]:
        """Validate the DAG. Returns list of error messages."""
        errors = []

        if len(self.tasks) < 1:
            errors.append("DAG must have at least 1 task")
        if len(self.tasks) > 8:
            errors.append(f"DAG must have at most 8 tasks, got {len(self.tasks)}")

        task_ids = {task.id for task in self.tasks}
        for task in self.tasks:
            for dep_id in task.depends_on:
                if dep_id not in task_ids:
                    errors.append(f"Task '{task.id}' depends on non-existent task '{dep_id}'")

            if not isinstance(task.agent_type, AgentType):
                errors.append(f"Task '{task.id}' has invalid agent type")

        # Cycle detection via DFS
        visited = set()
        rec_stack = set()

        def has_cycle(node_id: str) -> bool:
            visited.add(node_id)
            rec_stack.add(node_id)
            task = self.get_task(node_id)
            if task:
                for dep_id in task.depends_on:
                    if dep_id not in visited:
                        if has_cycle(dep_id):
                            return True
                    elif dep_id in rec_stack:
                        return True
            rec_stack.discard(node_id)
            return False

        for task in self.tasks:
            if task.id not in visited:
                if has_cycle(task.id):
                    errors.append("DAG contains a cycle")
                    break

        return errors

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_name": self.workflow_name,
            "tasks": [task.to_dict() for task in self.tasks],
        }


@dataclass
class TokenMetrics:
    total_input_tokens: int = 0
    total_output_tokens: int = 0
    per_task_breakdown: Dict[str, Dict[str, int]] = field(default_factory=dict)

    INPUT_COST_PER_1K = 0.003
    OUTPUT_COST_PER_1K = 0.015

    @property
    def estimated_cost(self) -> float:
        input_cost = (self.total_input_tokens / 1000) * self.INPUT_COST_PER_1K
        output_cost = (self.total_output_tokens / 1000) * self.OUTPUT_COST_PER_1K
        return round(input_cost + output_cost, 6)

    def record(self, task_id: str, input_tokens: int, output_tokens: int) -> None:
        self.total_input_tokens += input_tokens
        self.total_output_tokens += output_tokens
        self.per_task_breakdown[task_id] = {
            "input_tokens": input_tokens,
            "output_tokens": output_tokens,
        }

    def to_dict(self) -> Dict[str, Any]:
        return {
            "total_input_tokens": self.total_input_tokens,
            "total_output_tokens": self.total_output_tokens,
            "estimated_cost": self.estimated_cost,
            "per_task_breakdown": self.per_task_breakdown,
        }


@dataclass
class WorkflowState:
    user_input: str
    workflow_id: str = field(default_factory=lambda: str(uuid.uuid4())[:8])
    status: WorkflowStatus = WorkflowStatus.DECOMPOSING
    dag: Optional[DAG] = None
    current_task_id: Optional[str] = None
    context_chain: List[Dict[str, Any]] = field(default_factory=list)
    token_metrics: TokenMetrics = field(default_factory=TokenMetrics)
    error_log: List[str] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.utcnow)
    completed_at: Optional[datetime] = None
    events: List[Dict[str, Any]] = field(default_factory=list)

    def add_event(self, event_type: str, data: Optional[Dict[str, Any]] = None) -> None:
        event = {
            "type": event_type,
            "timestamp": datetime.utcnow().isoformat(),
            "data": data or {},
        }
        self.events.append(event)

    def add_context(self, task_id: str, agent_type: str, summary: str, full_output: str) -> None:
        self.context_chain.append({
            "task_id": task_id,
            "agent_type": agent_type,
            "summary": summary,
            "full_output": full_output,
            "timestamp": datetime.utcnow().isoformat(),
        })

    def to_dict(self) -> Dict[str, Any]:
        return {
            "workflow_id": self.workflow_id,
            "user_input": self.user_input,
            "status": self.status.value,
            "dag": self.dag.to_dict() if self.dag else None,
            "current_task_id": self.current_task_id,
            "context_chain": self.context_chain,
            "token_metrics": self.token_metrics.to_dict(),
            "error_log": self.error_log,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None,
            "events": self.events,
        }
