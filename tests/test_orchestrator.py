"""Comprehensive test suite for the AI Workflow Orchestrator."""
import json
import sys
import os
import unittest

# Ensure the project root is on the path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from backend.orchestrator.models import (
    AgentType, DAG, Task, TaskStatus, TokenMetrics,
    WorkflowState, WorkflowStatus,
)
from backend.orchestrator.llm_client import LLMClient, LLMError
from backend.orchestrator.decomposer import DecompositionEngine, DecompositionError
from backend.orchestrator.engine import WorkflowEngine
from backend.agents.agents import BaseAgent, create_agent


# ─────────────────────────────────────────────
# TestModels
# ─────────────────────────────────────────────

class TestModels(unittest.TestCase):

    def test_task_creation(self):
        task = Task(
            id="t1",
            description="Research AI trends",
            agent_type=AgentType.RESEARCHER,
        )
        self.assertEqual(task.id, "t1")
        self.assertEqual(task.agent_type, AgentType.RESEARCHER)
        self.assertEqual(task.status, TaskStatus.PENDING)
        self.assertIsNone(task.output)
        self.assertIsNone(task.duration_seconds)

    def test_task_to_dict(self):
        task = Task(
            id="t1",
            description="Research AI trends",
            agent_type=AgentType.RESEARCHER,
            depends_on=["t0"],
            expected_output="Research report",
        )
        d = task.to_dict()
        self.assertEqual(d["id"], "t1")
        self.assertEqual(d["agent_type"], "researcher")
        self.assertEqual(d["depends_on"], ["t0"])
        self.assertEqual(d["status"], "pending")

    def test_dag_validation_valid(self):
        tasks = [
            Task(id="t1", description="Research", agent_type=AgentType.RESEARCHER),
            Task(id="t2", description="Write", agent_type=AgentType.WRITER, depends_on=["t1"]),
        ]
        dag = DAG(workflow_name="Test", tasks=tasks)
        errors = dag.validate()
        self.assertEqual(errors, [])

    def test_dag_validation_cycle(self):
        tasks = [
            Task(id="t1", description="A", agent_type=AgentType.RESEARCHER, depends_on=["t2"]),
            Task(id="t2", description="B", agent_type=AgentType.WRITER, depends_on=["t1"]),
        ]
        dag = DAG(workflow_name="Cycle", tasks=tasks)
        errors = dag.validate()
        self.assertTrue(any("cycle" in e.lower() for e in errors))

    def test_dag_validation_missing_dependency(self):
        tasks = [
            Task(id="t1", description="A", agent_type=AgentType.RESEARCHER, depends_on=["nonexistent"]),
        ]
        dag = DAG(workflow_name="Missing Dep", tasks=tasks)
        errors = dag.validate()
        self.assertTrue(any("nonexistent" in e for e in errors))

    def test_dag_validation_too_many_tasks(self):
        tasks = [
            Task(id=f"t{i}", description=f"Task {i}", agent_type=AgentType.RESEARCHER)
            for i in range(9)
        ]
        dag = DAG(workflow_name="Too Many", tasks=tasks)
        errors = dag.validate()
        self.assertTrue(any("8" in e for e in errors))

    def test_dag_topological_sort(self):
        tasks = [
            Task(id="t3", description="C", agent_type=AgentType.EXECUTOR, depends_on=["t2"]),
            Task(id="t1", description="A", agent_type=AgentType.RESEARCHER),
            Task(id="t2", description="B", agent_type=AgentType.WRITER, depends_on=["t1"]),
        ]
        dag = DAG(workflow_name="Sort Test", tasks=tasks)
        order = dag.get_execution_order()
        order_ids = [t.id for t in order]
        self.assertLess(order_ids.index("t1"), order_ids.index("t2"))
        self.assertLess(order_ids.index("t2"), order_ids.index("t3"))

    def test_token_metrics(self):
        metrics = TokenMetrics()
        metrics.record("t1", 100, 200)
        metrics.record("t2", 50, 100)
        self.assertEqual(metrics.total_input_tokens, 150)
        self.assertEqual(metrics.total_output_tokens, 300)
        self.assertGreater(metrics.estimated_cost, 0)
        self.assertIn("t1", metrics.per_task_breakdown)

    def test_token_metrics_serialization(self):
        metrics = TokenMetrics()
        metrics.record("t1", 500, 1000)
        d = metrics.to_dict()
        self.assertEqual(d["total_input_tokens"], 500)
        self.assertEqual(d["total_output_tokens"], 1000)
        self.assertIn("estimated_cost", d)
        self.assertIn("per_task_breakdown", d)

    def test_workflow_state_serialization(self):
        state = WorkflowState(user_input="Test workflow")
        d = state.to_dict()
        self.assertIn("workflow_id", d)
        self.assertIn("user_input", d)
        self.assertEqual(d["status"], "decomposing")
        self.assertEqual(d["context_chain"], [])

    def test_workflow_state_add_event(self):
        state = WorkflowState(user_input="Test")
        state.add_event("test_event", {"key": "value"})
        self.assertEqual(len(state.events), 1)
        self.assertEqual(state.events[0]["type"], "test_event")
        self.assertEqual(state.events[0]["data"]["key"], "value")


# ─────────────────────────────────────────────
# TestLLMClient
# ─────────────────────────────────────────────

class TestLLMClient(unittest.TestCase):

    def test_mock_client_creation(self):
        client = LLMClient(provider="mock")
        self.assertEqual(client.provider, "mock")

    def test_mock_decomposition_returns_valid_json(self):
        client = LLMClient(provider="mock")
        result = client.complete(
            messages=[{"role": "user", "content": "decompose this workflow into a dag json"}],
            system="decompose workflow",
        )
        self.assertIn("content", result)
        data = json.loads(result["content"])
        self.assertIn("tasks", data)
        self.assertGreater(len(data["tasks"]), 0)

    def test_mock_researcher_response(self):
        client = LLMClient(provider="mock")
        result = client.complete(
            messages=[{"role": "user", "content": "Research AI trends"}],
            system=RESEARCHER_PROMPT_FRAGMENT,
        )
        self.assertIn("Research Findings", result["content"])

    def test_mock_writer_response(self):
        client = LLMClient(provider="mock")
        result = client.complete(
            messages=[{"role": "user", "content": "Write a report"}],
            system=WRITER_PROMPT_FRAGMENT,
        )
        self.assertIn("Executive Summary", result["content"])

    def test_mock_reviewer_response(self):
        client = LLMClient(provider="mock")
        result = client.complete(
            messages=[{"role": "user", "content": "Review this content"}],
            system=REVIEWER_PROMPT_FRAGMENT,
        )
        self.assertIn("Quality", result["content"])

    def test_mock_returns_token_counts(self):
        client = LLMClient(provider="mock")
        result = client.complete(
            messages=[{"role": "user", "content": "Hello"}],
        )
        self.assertIn("input_tokens", result)
        self.assertIn("output_tokens", result)
        self.assertGreater(result["output_tokens"], 0)


RESEARCHER_PROMPT_FRAGMENT = "meticulous research analyst"
WRITER_PROMPT_FRAGMENT = "expert writer"
REVIEWER_PROMPT_FRAGMENT = "senior editor and fact-checker"


# ─────────────────────────────────────────────
# TestDecomposition
# ─────────────────────────────────────────────

class TestDecomposition(unittest.TestCase):

    def setUp(self):
        self.client = LLMClient(provider="mock")
        self.engine = DecompositionEngine(self.client)

    def test_successful_decomposition(self):
        dag = self.engine.decompose("Research AI trends and write a comprehensive report")
        self.assertIsNotNone(dag)
        self.assertIsInstance(dag, DAG)

    def test_decomposition_valid_dag(self):
        dag = self.engine.decompose("Research AI trends and write a report")
        errors = dag.validate()
        self.assertEqual(errors, [])

    def test_decomposition_multiple_agent_types(self):
        dag = self.engine.decompose("Research AI trends and write a report")
        agent_types = {task.agent_type for task in dag.tasks}
        self.assertGreater(len(agent_types), 1)

    def test_decomposition_tasks_have_descriptions(self):
        dag = self.engine.decompose("Analyze market trends")
        for task in dag.tasks:
            self.assertGreater(len(task.description), 0)

    def test_json_parsing_with_markdown_fences(self):
        content = '```json\n{"workflow_name": "Test", "tasks": [{"id": "t1", "description": "Do stuff", "agent_type": "researcher", "depends_on": [], "expected_output": "output"}]}\n```'
        data = self.engine._parse_json(content)
        self.assertIn("tasks", data)

    def test_json_parsing_with_mixed_text(self):
        content = 'Here is the DAG: {"workflow_name": "Test", "tasks": [{"id": "t1", "description": "Do stuff", "agent_type": "researcher", "depends_on": [], "expected_output": "output"}]}'
        data = self.engine._parse_json(content)
        self.assertIn("tasks", data)

    def test_decomposition_error_on_invalid_json(self):
        with self.assertRaises(DecompositionError):
            self.engine._parse_json("This is not JSON at all and has no JSON object")


# ─────────────────────────────────────────────
# TestAgents
# ─────────────────────────────────────────────

class TestAgents(unittest.TestCase):

    def setUp(self):
        self.client = LLMClient(provider="mock")

    def test_create_all_agent_types(self):
        for agent_type in AgentType:
            agent = create_agent(agent_type, self.client)
            self.assertIsInstance(agent, BaseAgent)
            self.assertEqual(agent.agent_type, agent_type)

    def test_invalid_agent_type_raises(self):
        with self.assertRaises((ValueError, AttributeError)):
            create_agent("invalid_type", self.client)

    def test_researcher_execution(self):
        agent = create_agent(AgentType.RESEARCHER, self.client)
        result = agent.execute(
            task_description="Research current AI trends",
            original_intent="Research AI and write a report",
            context_chain=[],
            expected_output="Research findings",
        )
        self.assertIn("content", result)
        self.assertIn("summary", result)
        self.assertIn("usage", result)
        self.assertGreater(len(result["content"]), 0)

    def test_writer_with_context(self):
        agent = create_agent(AgentType.WRITER, self.client)
        context = [
            {
                "task_id": "t1",
                "agent_type": "researcher",
                "summary": "Found that AI is growing rapidly",
                "full_output": "## Research Findings\n\nAI is growing at 34% YoY...",
            }
        ]
        result = agent.execute(
            task_description="Write a report based on the research",
            original_intent="Research and write about AI trends",
            context_chain=context,
            expected_output="Polished report",
        )
        self.assertIn("content", result)
        self.assertGreater(len(result["content"]), 100)

    def test_reviewer_output_has_quality(self):
        agent = create_agent(AgentType.REVIEWER, self.client)
        result = agent.execute(
            task_description="Review the written report for quality",
            original_intent="Research and write about AI trends",
            context_chain=[],
        )
        self.assertIn("Quality", result["content"])

    def test_temperature_varies_by_agent(self):
        from backend.agents.agents import AGENT_TEMPERATURES
        temps = set(AGENT_TEMPERATURES.values())
        self.assertGreater(len(temps), 1)
        self.assertEqual(AGENT_TEMPERATURES[AgentType.RESEARCHER], 0.4)
        self.assertEqual(AGENT_TEMPERATURES[AgentType.WRITER], 0.7)
        self.assertEqual(AGENT_TEMPERATURES[AgentType.REVIEWER], 0.2)
        self.assertEqual(AGENT_TEMPERATURES[AgentType.EXECUTOR], 0.1)

    def test_agent_summarize(self):
        agent = create_agent(AgentType.RESEARCHER, self.client)
        long_text = "This is a very long output. " * 50
        summary = agent._summarize(long_text)
        self.assertLessEqual(len(summary), 600)
        self.assertGreater(len(summary), 0)


# ─────────────────────────────────────────────
# TestWorkflowEngine
# ─────────────────────────────────────────────

class TestWorkflowEngine(unittest.TestCase):

    def setUp(self):
        self.client = LLMClient(provider="mock")
        self.engine = WorkflowEngine(llm_client=self.client)

    def test_create_workflow(self):
        state = self.engine.create_workflow("Research AI trends")
        self.assertIsNotNone(state)
        self.assertIsInstance(state, WorkflowState)
        self.assertEqual(state.user_input, "Research AI trends")
        self.assertIsNotNone(state.workflow_id)

    def test_execute_workflow_all_tasks_complete(self):
        state = self.engine.run("Research AI trends and write a report")
        self.assertEqual(state.status, WorkflowStatus.COMPLETED)
        if state.dag:
            for task in state.dag.tasks:
                self.assertEqual(task.status, TaskStatus.COMPLETED)
                self.assertIsNotNone(task.output)
                self.assertGreater(len(task.output), 0)

    def test_full_run(self):
        state = self.engine.run("Analyze competitive landscape for electric vehicles")
        self.assertEqual(state.status, WorkflowStatus.COMPLETED)
        self.assertIsNotNone(state.dag)
        self.assertGreater(len(state.dag.tasks), 0)

    def test_events_emitted(self):
        state = self.engine.run("Research and write about machine learning")
        event_types = [e["type"] for e in state.events]
        self.assertIn("workflow_created", event_types)
        self.assertIn("workflow_completed", event_types)

    def test_event_types_include_task_events(self):
        state = self.engine.run("Research AI trends")
        event_types = [e["type"] for e in state.events]
        self.assertTrue(
            any("task" in et for et in event_types),
            f"Expected task events, got: {event_types}"
        )

    def test_workflow_serialization(self):
        state = self.engine.run("Research AI productivity tools")
        d = state.to_dict()
        self.assertIn("workflow_id", d)
        self.assertIn("dag", d)
        self.assertIn("status", d)
        self.assertEqual(d["status"], "completed")

    def test_token_metrics_accumulated(self):
        state = self.engine.run("Research AI trends and write a report")
        metrics = state.token_metrics
        self.assertGreater(metrics.total_input_tokens, 0)
        self.assertGreater(metrics.total_output_tokens, 0)
        self.assertGreater(len(metrics.per_task_breakdown), 0)

    def test_get_final_output(self):
        state = self.engine.run("Research AI trends and write a report")
        output = self.engine.get_final_output(state)
        self.assertIsNotNone(output)
        self.assertGreater(len(output), 0)

    def test_event_callback(self):
        events_received = []

        def callback(event_type, data):
            events_received.append(event_type)

        engine = WorkflowEngine(llm_client=self.client, event_callback=callback)
        engine.run("Research AI trends")
        self.assertIn("workflow_created", events_received)
        self.assertIn("workflow_completed", events_received)


# ─────────────────────────────────────────────
# TestAPI
# ─────────────────────────────────────────────

class TestAPI(unittest.TestCase):

    def setUp(self):
        from backend.api.server import app, _workflows
        app.config["TESTING"] = True
        self.app = app.test_client()
        _workflows.clear()

    def test_health_endpoint(self):
        resp = self.app.get("/api/health")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "ok")
        self.assertIn("provider", data)

    def test_create_workflow(self):
        resp = self.app.post(
            "/api/workflows",
            data=json.dumps({"input": "Research AI trends and write a comprehensive report"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        data = json.loads(resp.data)
        self.assertIn("workflow_id", data)
        self.assertIn("dag", data)

    def test_create_workflow_validation_short(self):
        resp = self.app.post(
            "/api/workflows",
            data=json.dumps({"input": "too short"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_create_workflow_validation_missing(self):
        resp = self.app.post(
            "/api/workflows",
            data=json.dumps({}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 400)

    def test_execute_workflow(self):
        # Create first
        resp = self.app.post(
            "/api/workflows",
            data=json.dumps({"input": "Research AI trends and write a detailed report"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 201)
        workflow_id = json.loads(resp.data)["workflow_id"]

        # Execute
        resp = self.app.post(f"/api/workflows/{workflow_id}/execute")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["status"], "completed")

    def test_get_workflow(self):
        resp = self.app.post(
            "/api/workflows",
            data=json.dumps({"input": "Research AI trends for a comprehensive analysis"}),
            content_type="application/json",
        )
        workflow_id = json.loads(resp.data)["workflow_id"]

        resp = self.app.get(f"/api/workflows/{workflow_id}")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertEqual(data["workflow_id"], workflow_id)

    def test_get_nonexistent_workflow(self):
        resp = self.app.get("/api/workflows/nonexistent-id")
        self.assertEqual(resp.status_code, 404)

    def test_quick_run(self):
        resp = self.app.post(
            "/api/run",
            data=json.dumps({"input": "Research AI trends and write a strategic report"}),
            content_type="application/json",
        )
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn("workflow_id", data)
        self.assertIn("final_output", data)
        self.assertIn("status", data)
        self.assertEqual(data["status"], "completed")

    def test_get_templates(self):
        resp = self.app.get("/api/templates")
        self.assertEqual(resp.status_code, 200)
        data = json.loads(resp.data)
        self.assertIn("templates", data)
        self.assertEqual(len(data["templates"]), 3)


if __name__ == "__main__":
    loader = unittest.TestLoader()
    suite = unittest.TestSuite()

    # Add all test classes
    for test_class in [
        TestModels,
        TestLLMClient,
        TestDecomposition,
        TestAgents,
        TestWorkflowEngine,
        TestAPI,
    ]:
        suite.addTests(loader.loadTestsFromTestCase(test_class))

    runner = unittest.TextTestRunner(verbosity=2)
    result = runner.run(suite)

    total = result.testsRun
    failed = len(result.failures) + len(result.errors)
    passed = total - failed

    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} tests passed")
    if failed:
        print(f"FAILED: {failed} tests")
        sys.exit(1)
    else:
        print("ALL TESTS PASSED ✓")
