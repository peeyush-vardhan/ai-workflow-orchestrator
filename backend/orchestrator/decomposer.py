"""Task decomposition engine — breaks user input into a DAG of subtasks."""
import json
import re
from typing import Any, Dict, List, Optional

from .llm_client import LLMClient, LLMError
from .models import AgentType, CustomAgentDefinition, DAG, Task

_BUILTIN_AGENTS_SECTION = """\
Available built-in agent types:
- researcher: Gathers information, analyzes data, and synthesizes findings
- writer: Creates, drafts, and refines written content
- reviewer: Reviews, fact-checks, and provides quality assessments
- executor: Executes final delivery, formatting, and output preparation"""

_SYSTEM_PROMPT_BASE = """\
You are an expert workflow architect. Your task is to analyze a user's workflow request and decompose it into 2-8 discrete subtasks that can be executed by specialized AI agents.

{agents_section}

Rules:
1. Create between 2 and 8 tasks (inclusive)
2. Each task must have a unique ID (e.g., task_1, task_2)
3. Dependencies must reference valid task IDs that come before the dependent task
4. The task graph must be a valid DAG (no cycles)
5. Assign the most appropriate agent type to each task
6. Prefer parallel execution: tasks that don't depend on each other should have no dependency listed

Return ONLY a valid JSON object with this exact structure:
{{
  "workflow_name": "Short descriptive name",
  "tasks": [
    {{
      "id": "task_1",
      "description": "Detailed description of what this task does",
      "agent_type": "researcher|writer|reviewer|executor{custom_agent_ids}",
      "depends_on": [],
      "expected_output": "What the task should produce"
    }}
  ]
}}

Do not include any text outside the JSON object."""


class DecompositionError(Exception):
    """Raised when workflow decomposition fails."""
    pass


class DecompositionEngine:
    """Decomposes natural language workflow requests into executable DAGs."""

    def __init__(
        self,
        llm_client: LLMClient,
        custom_agents: Optional[List[CustomAgentDefinition]] = None,
    ):
        self.llm_client = llm_client
        self.custom_agents = custom_agents or []

    def _build_system_prompt(self) -> str:
        agents_section = _BUILTIN_AGENTS_SECTION
        custom_ids_str = ""

        if self.custom_agents:
            custom_lines = "\n".join(
                f"- {a.id}: {a.name} — custom agent"
                for a in self.custom_agents
            )
            agents_section += "\n\nAdditional custom agent types:\n" + custom_lines
            custom_ids_str = "|" + "|".join(a.id for a in self.custom_agents)

        return _SYSTEM_PROMPT_BASE.format(
            agents_section=agents_section,
            custom_agent_ids=custom_ids_str,
        )

    def decompose(self, user_input: str) -> DAG:
        """Break down user input into a DAG of subtasks."""
        messages = [
            {
                "role": "user",
                "content": f"Decompose this workflow into subtasks:\n\n{user_input}",
            }
        ]

        try:
            result = self.llm_client.complete(
                messages=messages,
                system=self._build_system_prompt(),
                temperature=0.3,
                max_tokens=2048,
            )
            content = result["content"]
        except LLMError as e:
            raise DecompositionError(f"LLM call failed during decomposition: {e}") from e

        dag_data = self._parse_json(content)
        dag = self._build_dag(dag_data)

        custom_ids = [a.id for a in self.custom_agents]
        errors = dag.validate(custom_agent_ids=custom_ids)
        if errors:
            raise DecompositionError(f"Invalid DAG: {'; '.join(errors)}")

        return dag

    def _parse_json(self, content: str) -> Dict[str, Any]:
        """Parse JSON from LLM response, handling markdown fences and mixed text."""
        try:
            return json.loads(content)
        except json.JSONDecodeError:
            pass

        fenced = re.search(r"```(?:json)?\s*([\s\S]*?)```", content)
        if fenced:
            try:
                return json.loads(fenced.group(1).strip())
            except json.JSONDecodeError:
                pass

        obj_match = re.search(r"\{[\s\S]*\}", content)
        if obj_match:
            try:
                return json.loads(obj_match.group(0))
            except json.JSONDecodeError:
                pass

        raise DecompositionError(f"Could not parse JSON from LLM response: {content[:200]}")

    def _build_dag(self, data: Dict[str, Any]) -> DAG:
        """Build a DAG object from parsed JSON data."""
        if "tasks" not in data:
            raise DecompositionError("Missing 'tasks' field in decomposition response")

        workflow_name = data.get("workflow_name", "Unnamed Workflow")
        valid_custom_ids = {a.id for a in self.custom_agents}
        tasks = []

        for task_data in data["tasks"]:
            try:
                agent_type_str = task_data.get("agent_type", "researcher")
                try:
                    agent_type: Any = AgentType(agent_type_str)
                except ValueError:
                    if agent_type_str in valid_custom_ids:
                        agent_type = agent_type_str  # custom agent ID
                    else:
                        raise DecompositionError(
                            f"Invalid agent type '{agent_type_str}' for task '{task_data.get('id')}'"
                        )

                task = Task(
                    id=task_data["id"],
                    description=task_data.get("description", ""),
                    agent_type=agent_type,
                    depends_on=task_data.get("depends_on", []),
                    expected_output=task_data.get("expected_output", ""),
                )
                tasks.append(task)
            except KeyError as e:
                raise DecompositionError(f"Missing required field {e} in task definition") from e

        return DAG(workflow_name=workflow_name, tasks=tasks)
