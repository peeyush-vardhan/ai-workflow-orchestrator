# Architecture Document
## AI Workflow Orchestrator

**Version**: 1.0
**Status**: Current
**Last Updated**: March 2026

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [System Flow](#system-flow)
3. [Task Decomposition Engine](#task-decomposition-engine)
4. [Agent Design](#agent-design)
5. [Context Management Strategy](#context-management-strategy)
6. [Error Handling](#error-handling)
7. [API Design](#api-design)
8. [Cost Analysis](#cost-analysis)
9. [Key Design Decisions](#key-design-decisions)

---

## Architecture Overview

The system is organized into four distinct layers, each with a single responsibility. Dependencies flow strictly downward — upper layers call lower layers; lower layers never call up.

```
┌──────────────────────────────────────────────────────────────────────┐
│                        LAYER 1 — API LAYER                           │
│                                                                       │
│   Flask REST API (backend/api/server.py)                             │
│   • 8 endpoints   • Input validation   • In-memory workflow store    │
│   • Request/response serialization     • HTTP status codes           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │ calls
┌─────────────────────────────▼────────────────────────────────────────┐
│                     LAYER 2 — ORCHESTRATION LAYER                    │
│                                                                       │
│   WorkflowEngine (engine.py)   DecompositionEngine (decomposer.py)  │
│   • Lifecycle management        • NL → DAG translation               │
│   • Topological execution       • JSON parsing with fallbacks        │
│   • Event emission              • DAG validation                     │
│   • Pause / resume              • DecompositionError handling        │
└───────────────┬──────────────────────────────┬───────────────────────┘
                │ creates / executes           │ uses
┌───────────────▼──────────────┐  ┌────────────▼──────────────────────┐
│    LAYER 3 — AGENT LAYER     │  │      LAYER 3 — DATA MODELS        │
│                              │  │                                   │
│  BaseAgent (agents/agents.py)│  │  Task, DAG, WorkflowState         │
│  • 4 specializations         │  │  TokenMetrics                     │
│  • Context assembly          │  │  AgentType, TaskStatus            │
│  • Local summarization       │  │  WorkflowStatus enums             │
│  • Temperature per type      │  │  (backend/orchestrator/models.py) │
└───────────────┬──────────────┘  └───────────────────────────────────┘
                │ calls
┌───────────────▼──────────────────────────────────────────────────────┐
│                      LAYER 4 — LLM LAYER                             │
│                                                                       │
│   LLMClient (llm_client.py)                                          │
│   • Provider auto-detection (ANTHROPIC_API_KEY → OPENAI_API_KEY →   │
│     mock)                                                             │
│   • Retry with exponential backoff (3x: 1s → 2s → 4s)               │
│   • Automatic fallback to secondary provider on failure              │
│   • Mock provider with realistic, agent-type-aware responses         │
└──────────────────────────────────────────────────────────────────────┘
```

### Layer Responsibilities Summary

| Layer | Files | Responsibility |
|-------|-------|----------------|
| API | `backend/api/server.py` | HTTP interface, routing, validation, serialization |
| Orchestration | `engine.py`, `decomposer.py` | Workflow lifecycle, DAG execution, task decomposition |
| Agent / Models | `agents/agents.py`, `models.py` | Agent execution, context assembly, data structures |
| LLM | `llm_client.py` | LLM communication, retry, fallback, mock |

---

## System Flow

A complete workflow passes through seven sequential stages from user input to final output.

```
                        ┌──────────────────────┐
                        │   1. USER INPUT       │
                        │  "Research AI trends  │
                        │   and write a report" │
                        └──────────┬───────────┘
                                   │ POST /api/run
                                   ▼
                        ┌──────────────────────┐
                        │  2. DECOMPOSITION     │
                        │                      │
                        │  LLM analyzes intent  │
                        │  Returns JSON DAG:    │
                        │  4 tasks, deps,       │
                        │  agent assignments    │
                        └──────────┬───────────┘
                                   │ validates DAG
                                   ▼
                        ┌──────────────────────┐
                        │  3. DAG VALIDATION    │
                        │                      │
                        │  • 1–8 tasks          │
                        │  • No cycles          │
                        │  • Deps exist         │
                        │  • Valid agent types  │
                        └──────────┬───────────┘
                                   │ topological sort
                                   ▼
                    ┌──────────────────────────────────┐
                    │      4. SEQUENTIAL EXECUTION      │
                    │                                  │
                    │  ┌──────────┐                    │
                    │  │ task_1   │ Researcher Agent   │
                    │  │ (no deps)│ temp=0.4           │
                    │  └────┬─────┘                    │
                    │       │ output → context_chain   │
                    │  ┌────▼─────┐                    │
                    │  │ task_2   │ Writer Agent        │
                    │  │ deps:t1  │ temp=0.7           │
                    │  └────┬─────┘                    │
                    │       │ output → context_chain   │
                    │  ┌────▼─────┐                    │
                    │  │ task_3   │ Reviewer Agent      │
                    │  │ deps:t2  │ temp=0.2           │
                    │  └────┬─────┘                    │
                    │       │ output → context_chain   │
                    │  ┌────▼─────┐                    │
                    │  │ task_4   │ Executor Agent      │
                    │  │ deps:t3  │ temp=0.1           │
                    │  └──────────┘                    │
                    └──────────────────────────────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  5. CONTEXT CHAIN     │
                        │                      │
                        │  Each agent receives: │
                        │  • Original intent   │
                        │  • Prior summaries   │
                        │    (≤600 chars each) │
                        │  • Current task desc │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  6. METRICS CAPTURE   │
                        │                      │
                        │  Per task:            │
                        │  • Input tokens       │
                        │  • Output tokens      │
                        │  • Duration (s)       │
                        │  • Cost estimate      │
                        └──────────┬───────────┘
                                   │
                                   ▼
                        ┌──────────────────────┐
                        │  7. FINAL OUTPUT      │
                        │                      │
                        │  Last completed       │
                        │  task output returned │
                        │  + full WorkflowState │
                        └──────────────────────┘
```

---

## Task Decomposition Engine

### Overview

The `DecompositionEngine` (`backend/orchestrator/decomposer.py`) is the entry point for every workflow. It translates a natural language description into a validated DAG using the LLM.

### System Prompt Design

The decomposition system prompt enforces strict constraints:

```
You are an expert workflow architect. Analyze the user's workflow request
and decompose it into 2–8 discrete subtasks.

Available agent types:
- researcher: Gathers information, analyzes data, synthesizes findings
- writer: Creates, drafts, and refines written content
- reviewer: Reviews, fact-checks, provides quality assessments
- executor: Executes final delivery and output preparation

Rules:
1. Create between 2 and 8 tasks (inclusive)
2. Each task must have a unique ID (task_1, task_2, ...)
3. Dependencies must reference valid task IDs that precede the dependent task
4. The task graph must be a valid DAG (no cycles)
5. Return ONLY a valid JSON object — no surrounding text

Return format: { "workflow_name": "...", "tasks": [...] }
```

### Output JSON Schema

The LLM must return a JSON object matching this schema exactly:

```json
{
  "workflow_name": "Competitive Analysis: AI Assistant Market",
  "tasks": [
    {
      "id": "task_1",
      "description": "Research the AI assistant market landscape. Identify top 10 players, market share estimates, funding rounds, and product positioning. Gather data from recent reports (2023–2024).",
      "agent_type": "researcher",
      "depends_on": [],
      "expected_output": "Structured research findings with market data, player profiles, and source citations"
    },
    {
      "id": "task_2",
      "description": "Write a comprehensive competitive analysis report based on the research findings. Include an executive summary, player-by-player analysis, SWOT synthesis, and strategic recommendations.",
      "agent_type": "writer",
      "depends_on": ["task_1"],
      "expected_output": "Professional competitive analysis document with executive summary and recommendations"
    },
    {
      "id": "task_3",
      "description": "Review the competitive analysis for accuracy, completeness, and strategic coherence. Verify all market claims against the research. Score quality 1–5 and provide specific improvement notes.",
      "agent_type": "reviewer",
      "depends_on": ["task_2"],
      "expected_output": "Quality score, fact-check results, and prioritized improvement recommendations"
    },
    {
      "id": "task_4",
      "description": "Incorporate all reviewer feedback and produce the final, polished competitive analysis ready for executive distribution.",
      "agent_type": "executor",
      "depends_on": ["task_3"],
      "expected_output": "Final publication-ready competitive analysis document"
    }
  ]
}
```

### JSON Parsing Strategy

The decomposer handles three common LLM response formats with progressive fallbacks:

```
Response from LLM
      │
      ▼
┌─────────────────────────────────┐
│ 1. Direct JSON parse            │
│    json.loads(content)          │
│    → Success: use result        │
└─────────────┬───────────────────┘
              │ fails (JSONDecodeError)
              ▼
┌─────────────────────────────────┐
│ 2. Strip markdown fences        │
│    re: ```json ... ```          │
│    json.loads(extracted)        │
│    → Success: use result        │
└─────────────┬───────────────────┘
              │ fails
              ▼
┌─────────────────────────────────┐
│ 3. Extract JSON object          │
│    re: \{[\s\S]*\}              │
│    json.loads(matched)          │
│    → Success: use result        │
└─────────────┬───────────────────┘
              │ fails
              ▼
      DecompositionError raised
```

### DAG Validation

After parsing, the DAG undergoes four validation checks before execution is permitted:

| Check | Method | Error Condition |
|-------|--------|-----------------|
| **Task count** | `len(tasks)` | < 1 or > 8 tasks |
| **Dependency existence** | Set lookup | dep_id not in task_ids |
| **Cycle detection** | DFS with recursion stack | Back edge detected |
| **Agent type validity** | `AgentType(value)` enum | ValueError on invalid type |

---

## Agent Design

### Agent Types Table

| Agent | Role | System Prompt Focus | Temp | Max Tokens | Output Format |
|-------|------|---------------------|------|------------|---------------|
| **Researcher** | Information synthesis | "Meticulous research analyst. Structured findings with headers, sources, confidence levels." | 0.4 | 4096 | `## Research Findings` → discoveries, data, sources, confidence |
| **Writer** | Content creation | "Expert writer. Polished content from research only. Never invents facts." | 0.7 | 4096 | `## Executive Summary` → overview, recommendations, action items |
| **Reviewer** | Quality assurance | "Senior editor and fact-checker. Quality score 1–5. Specific issues. Actionable feedback." | 0.2 | 4096 | `## Quality Score: X / 5.0` → strengths, issues, fact-check |
| **Executor** | Final delivery | "Precise executor. Follows instructions exactly. Incorporates all feedback." | 0.1 | 4096 | `## Final Deliverable` → complete reviewed output |

### Temperature Rationale

Temperature controls the creativity/determinism tradeoff. Each agent type requires a different balance:

```
Low Temperature (Deterministic)              High Temperature (Creative)
0.0 ──────┬──────────────┬──────────────────┬────── 1.0
          │              │                  │
        0.1            0.2               0.4      0.7
      Executor        Reviewer         Researcher  Writer
      "Follow         "Verify           "Find &    "Draft
       exactly"        facts"            analyze"   prose"

Rationale:
• Executor (0.1): Must faithfully incorporate reviewer feedback without
  creative deviation. Determinism is critical — no new facts or ideas.

• Reviewer (0.2): Fact-checking requires consistency. The same document
  should receive approximately the same score on re-evaluation.

• Researcher (0.4): Needs some creativity to identify non-obvious
  connections, but must stay grounded in real information patterns.

• Writer (0.7): Prose quality benefits from linguistic variety and
  natural sentence construction. Too low → robotic output.
```

### Agent Execution Flow

```python
BaseAgent.execute(task_description, original_intent, context_chain, expected_output)
│
├── _build_messages()
│   ├── Part 1: "## Original Workflow Request\n{original_intent}"
│   ├── Part 2: "## Prior Agent Work\n{summarized context_chain}"
│   │           (only if context_chain is non-empty)
│   ├── Part 3: "## Your Task\n{task_description}"
│   └── Part 4: "## Expected Output\n{expected_output}"
│               (only if expected_output is non-empty)
│
├── llm_client.complete(messages, system=AGENT_SYSTEM_PROMPT, temp=self.temperature)
│
├── _summarize(content, max_chars=600)
│   ├── Split content into lines
│   ├── Skip blank lines
│   └── Accumulate until 600 chars reached → truncate with "..."
│       (No extra LLM call — pure string manipulation)
│
└── return { "content": full_output, "summary": truncated, "usage": {in, out} }
```

---

## Context Management Strategy

### The Problem

Naive context passing — giving each agent the full output of all prior agents — creates two problems:

1. **Context window overflow**: 4 agents × ~1500 tokens/output = 6000 tokens of prior context per request, plus the current task. With 200K context windows this seems safe, but at scale (8 tasks, longer outputs, or smaller models) it becomes a bottleneck.

2. **Noise amplification**: LLMs given very long prior context can fixate on irrelevant details from earlier agents rather than focusing on the current task.

### The Solution: Summarized Context Chain

Each agent's output is summarized to ≤600 characters before being passed to subsequent agents. The full output is stored in `context_chain[n].full_output` for retrieval, while only `context_chain[n].summary` enters the LLM prompt.

```
Agent 1 output: 2,400 chars    → summary: 580 chars → passed to Agent 2
Agent 2 output: 3,100 chars    → summary: 595 chars → passed to Agent 3
Agent 3 output: 1,800 chars    → summary: 572 chars → passed to Agent 4

Total context injected into Agent 4's prompt:
  Original intent:     ~200 chars
  Agent 1 summary:     ~580 chars
  Agent 2 summary:     ~595 chars
  Agent 3 summary:     ~572 chars
  Current task:        ~300 chars
  ─────────────────────────────
  Total injected:    ~2,247 chars   (~560 tokens)
```

### Context Chain Schema

```python
context_chain: List[Dict] = [
    {
        "task_id": "task_1",
        "agent_type": "researcher",
        "summary": "Found 34% YoY market growth, $847B TAM by 2027, 78% Fortune 500...",  # ≤600 chars
        "full_output": "## Research Findings\n\n### Executive Overview\n...",               # full text
        "timestamp": "2026-03-11T14:23:45.123456"
    },
    ...
]
```

### Why Not Pass Full Outputs?

| Approach | Pros | Cons | Decision |
|----------|------|------|----------|
| Full output chain | Maximum information | Token blowup; noise; slower; costly | ✗ Rejected |
| Summary chain | Controlled cost; focused signal | Some detail loss | ✓ Chosen |
| No context passing | Fastest; cheapest | Agents work in isolation; poor quality | ✗ Rejected |
| Compressed context | Best of both | Requires extra LLM call per agent | Roadmap (v2) |

---

## Error Handling

### Error Taxonomy

```
WorkflowError (base)
├── DecompositionError          — NL → DAG translation failed
│   ├── JSON parse failure      — LLM returned non-JSON despite all fallbacks
│   ├── Validation failure      — DAG has cycles, missing deps, etc.
│   └── LLM call failure        — API error during decomposition
│
└── LLMError                    — Agent execution failed
    ├── API authentication       — Invalid or missing API key
    ├── Rate limit               — 429 from provider
    ├── Provider timeout         — Network/service unavailable
    └── All retries exhausted    — 3 attempts failed
```

### Retry Strategy

```
LLM call attempt 1
    │
    ├── Success → return result
    │
    └── Failure (any exception)
            │
            └── Wait 1s → attempt 2
                    │
                    ├── Success → return result
                    │
                    └── Failure
                            │
                            └── Wait 2s → attempt 3
                                    │
                                    ├── Success → return result
                                    │
                                    └── Failure (all 3 failed)
                                            │
                                            └── Fall back to mock provider
                                                (returns realistic response)
                                                log warning: "falling back to mock"
```

### Workflow-Level Error Propagation

| Error Event | Task Status | Workflow Status | API Response |
|-------------|-------------|-----------------|--------------|
| Decomposition failure | N/A | `failed` | 200 with `status: failed`, `error_log` populated |
| Agent LLMError | `failed` | `failed` | 200 with task and workflow status |
| Agent unexpected exception | `failed` | `failed` | 200 with error details |
| Dep task skipped | `skipped` | Continues | Downstream tasks also skipped |
| All tasks complete | `completed` | `completed` | 200 with full state |

**Design decision**: Workflow errors return HTTP 200 with a `status: failed` payload rather than HTTP 500. This allows clients to inspect the full error context (which tasks failed, why) without error-handling edge cases.

---

## API Design

### Endpoints

| Method | Path | Purpose | Request Body | Response |
|--------|------|---------|--------------|----------|
| `GET` | `/api/health` | Liveness check | — | `{status, provider, model, active_workflows}` |
| `POST` | `/api/workflows` | Decompose workflow | `{input: string}` | `WorkflowState` (201) |
| `POST` | `/api/workflows/:id/execute` | Execute decomposed workflow | — | `WorkflowState` |
| `GET` | `/api/workflows/:id` | Get workflow state | — | `WorkflowState` |
| `POST` | `/api/workflows/:id/pause` | Pause at next boundary | — | `WorkflowState` |
| `POST` | `/api/workflows/:id/resume` | Resume paused workflow | `{edited_output?: string}` | `WorkflowState` |
| `GET` | `/api/templates` | List demo templates | — | `{templates: Template[]}` |
| `POST` | `/api/run` | One-shot run | `{input: string}` | `{workflow_id, status, final_output, token_metrics}` |

### Input Validation Rules

| Field | Rule | Error |
|-------|------|-------|
| `input` | Required | 400: "Missing 'input' field" |
| `input` | Type: string | 400: "'input' must be a string" |
| `input` | Min length: 10 chars | 400: "Input must be at least 10 characters" |
| `input` | Max length: 5000 chars | 400: "Input must be at most 5000 characters" |
| `workflow_id` | Must exist in store | 404: "Workflow '{id}' not found" |
| Workflow status | Must be `awaiting_approval` or `paused` to execute | 400: "Workflow is in '{status}' status and cannot be executed" |

### WorkflowState Response Schema

```json
{
  "workflow_id": "a3f2b1c4",
  "user_input": "Research AI trends and write a report",
  "status": "completed",
  "created_at": "2026-03-11T14:20:00.000000",
  "completed_at": "2026-03-11T14:20:47.123456",
  "dag": {
    "workflow_name": "AI Research and Report Workflow",
    "tasks": [
      {
        "id": "task_1",
        "description": "...",
        "agent_type": "researcher",
        "depends_on": [],
        "expected_output": "...",
        "status": "completed",
        "output": "## Research Findings\n...",
        "error": null,
        "token_usage": { "input_tokens": 920, "output_tokens": 640 },
        "started_at": "2026-03-11T14:20:01.000000",
        "completed_at": "2026-03-11T14:20:12.000000",
        "duration_seconds": 11.0
      }
    ]
  },
  "context_chain": [
    {
      "task_id": "task_1",
      "agent_type": "researcher",
      "summary": "Found 34% YoY growth...",
      "full_output": "## Research Findings\n...",
      "timestamp": "2026-03-11T14:20:12.000000"
    }
  ],
  "token_metrics": {
    "total_input_tokens": 5540,
    "total_output_tokens": 2700,
    "estimated_cost": 0.0572,
    "per_task_breakdown": {
      "task_1": { "input_tokens": 920, "output_tokens": 640 },
      "task_2": { "input_tokens": 1240, "output_tokens": 820 },
      "task_3": { "input_tokens": 1560, "output_tokens": 480 },
      "task_4": { "input_tokens": 1820, "output_tokens": 760 }
    }
  },
  "error_log": [],
  "events": [
    { "type": "workflow_created", "timestamp": "...", "data": {} },
    { "type": "decomposition_complete", "timestamp": "...", "data": { "task_count": 4 } },
    { "type": "task_started", "timestamp": "...", "data": { "task_id": "task_1" } },
    { "type": "task_completed", "timestamp": "...", "data": { "task_id": "task_1" } },
    { "type": "workflow_completed", "timestamp": "...", "data": {} }
  ]
}
```

---

## Cost Analysis

### Token Breakdown for a Typical 4-Task Workflow

Pricing: Anthropic Claude — **$0.003 / 1K input tokens**, **$0.015 / 1K output tokens**

| Task | Agent | Input Tokens | Output Tokens | Input Cost | Output Cost | Task Total |
|------|-------|-------------|---------------|------------|-------------|------------|
| task_1 | Researcher | 920 | 640 | $0.0028 | $0.0096 | **$0.0124** |
| task_2 | Writer | 1,240 | 820 | $0.0037 | $0.0123 | **$0.0160** |
| task_3 | Reviewer | 1,560 | 480 | $0.0047 | $0.0072 | **$0.0119** |
| task_4 | Executor | 1,820 | 760 | $0.0055 | $0.0114 | **$0.0169** |
| **Total** | | **5,540** | **2,700** | **$0.0167** | **$0.0405** | **~$0.057** |

**Typical cost per workflow: ~$0.05–$0.10**

### Why Input Tokens Grow Across Tasks

Input tokens increase for each successive task because the context chain accumulates:

```
task_1 input: system prompt + original intent + task description
            ≈ 400 + 200 + 320 = ~920 tokens

task_2 input: system prompt + original intent + task_1 summary + task description
            ≈ 400 + 200 + 320 + 320 = ~1,240 tokens

task_3 input: system prompt + original intent + summaries(t1+t2) + task description
            ≈ 400 + 200 + 640 + 320 = ~1,560 tokens

task_4 input: system prompt + original intent + summaries(t1+t2+t3) + task description
            ≈ 400 + 200 + 960 + 260 = ~1,820 tokens
```

The 600-char summary cap keeps this growth linear (O(n)) rather than exponential — without it, input tokens would grow quadratically.

### Cost Scenarios

| Scenario | Tasks | Avg Tokens/Task | Est. Cost | Notes |
|----------|-------|-----------------|-----------|-------|
| Simple (2 tasks) | 2 | 3,000 | ~$0.02 | Research + Write |
| Standard (4 tasks) | 4 | 8,240 | ~$0.06 | Full pipeline |
| Complex (6 tasks) | 6 | 14,000 | ~$0.12 | Extended pipeline |
| Maximum (8 tasks) | 8 | 22,000 | ~$0.20 | Full complexity |
| **Monthly (100 workflows/day)** | 4 avg | — | **~$180/month** | At $0.06 avg |

### Cost vs. Alternatives

| Approach | Time | Cost | Quality |
|----------|------|------|---------|
| **Orchestrator (Claude)** | ~45s | ~$0.06 | High (reviewed) |
| Single ChatGPT prompt | ~10s | ~$0.01 | Medium (unreviewed) |
| Human analyst (1 hour) | ~60 min | ~$50–100 | Very High |
| Human analyst (4 hours) | ~4 hours | ~$200–400 | Very High |

---

## Key Design Decisions

### Decision Log

| # | Decision | Choice Made | Alternatives Considered | Rationale |
|---|----------|-------------|------------------------|-----------|
| DD-01 | **Data modeling library** | Python `dataclasses` | Pydantic v2, attrs, TypedDict | Zero external dependencies for core models. Pydantic adds validation but requires installation — not appropriate given the "stdlib + flask only" constraint. Dataclasses provide all needed features: typed fields, defaults, `field(default_factory=...)`. |
| DD-02 | **Execution model** | Sequential (topological order) | Parallel branches, async concurrent | Agents are semantically dependent: writer needs researcher output; reviewer needs writer output. Parallel execution would require merging strategies and risks quality degradation. Sequential is also simpler to reason about, test, and debug. Parallel is on the v2 roadmap. |
| DD-03 | **Context passing strategy** | Summarized chain (≤600 chars/agent) | Full output chain, no context, vector retrieval | Full chain risks token overflow and noise amplification. No context produces isolated, lower-quality outputs. Vector retrieval requires an embedding database. Summarization provides the best cost/quality tradeoff with zero additional dependencies. The 600-char limit was chosen empirically: enough to convey key findings, not so much as to overwhelm the current task prompt. |
| DD-04 | **LLM abstraction** | Provider-agnostic `LLMClient` | Direct Anthropic SDK calls, LangChain | Direct SDK calls would lock the system to one provider. LangChain adds significant complexity and its own abstractions. A thin custom client is 80 lines, fully testable, and supports the mock mode essential for local development without API keys. |
| DD-05 | **Mock provider design** | Realistic, agent-type-aware responses | Simple placeholder strings, random text | Placeholder text ("This is a researcher response") makes integration tests meaningless — you can't tell if the pipeline is working correctly. Realistic mock responses mirror actual LLM output structure, making tests that validate the full pipeline (decompose → execute → review) genuinely useful. |
| DD-06 | **Error handling philosophy** | Fail fast; return 200 with `status: failed` | HTTP 4xx/5xx on failures, silent retry | Silent retry masks real failures. HTTP 500 for agent errors loses the partial workflow state. Returning 200 with `status: failed` lets clients inspect exactly which task failed and why, enabling better UX (show partial results, allow resume from failure point). |
| DD-07 | **DAG validation strictness** | Hard validation with specific error messages | Lenient parsing, best-effort DAG | A DAG with cycles or missing dependencies will silently fail at runtime in unpredictable ways. Strict upfront validation with clear error messages (e.g., "Task 't2' depends on non-existent task 't5'") enables faster debugging and prevents confusing runtime errors. |
| DD-08 | **Temperature per agent type** | Fixed per-agent (0.1–0.7) | Single temperature for all, user-configurable | Each agent role has a fundamentally different creativity/accuracy tradeoff. A reviewer needs near-determinism (0.2) for consistency; a writer needs variety (0.7) for prose quality. Single temperature would either produce robotic prose or inconsistent fact-checking. User-configurable is over-engineering for MVP. |
| DD-09 | **Web framework** | Flask | FastAPI, Django, Starlette, raw WSGI | FastAPI requires Pydantic (excluded). Django is heavy. Starlette adds async complexity. Flask with 8 routes is minimal, well-understood, and requires only one external dependency (`flask>=3.0.0`). |
| DD-10 | **Workflow state storage** | In-memory dict | SQLite, PostgreSQL, Redis | In-memory is sufficient for MVP (single-process, session-scoped). It requires zero setup and makes the stateless design explicit. The `to_dict()` methods on all models ensure migration to persistent storage is straightforward — the serialization layer is already built. |
