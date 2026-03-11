# AI Workflow Orchestrator

> A multi-agent task automation platform that decomposes natural language workflows into executable DAGs and runs them through specialized AI agents.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        User Input                               │
│         "Research AI trends and write a report"                 │
└────────────────────────────┬────────────────────────────────────┘
                             │
                             ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Decomposition Engine                          │
│  LLM analyzes intent → generates DAG of 2-8 subtasks           │
│  Validates: no cycles, valid deps, 1-8 tasks, valid agents      │
└─────────────────┬──────────────────────┬────────────────────────┘
                  │                      │
           task_1 ▼               task_2 ▼ (depends on task_1)
┌──────────────────────┐   ┌──────────────────────┐
│   Researcher Agent   │   │    Writer Agent       │
│  temp: 0.4          │──▶│  temp: 0.7            │
│  Finds facts/trends  │   │  Drafts polished docs │
└──────────────────────┘   └──────────┬───────────┘
                                       │
                             task_3 ▼ (depends on task_2)
                    ┌──────────────────────┐
                    │   Reviewer Agent     │
                    │  temp: 0.2           │
                    │  Quality score 1-5   │
                    └──────────┬───────────┘
                               │
                     task_4 ▼ (depends on task_3)
                    ┌──────────────────────┐
                    │   Executor Agent     │
                    │  temp: 0.1           │
                    │  Final deliverable   │
                    └──────────┬───────────┘
                               │
                               ▼
                    ┌──────────────────────┐
                    │    Final Output      │
                    │  Publication-ready   │
                    └──────────────────────┘
```

---

## Key Design Decisions

| Decision | Choice | Alternative | Rationale |
|----------|--------|-------------|-----------|
| Data Models | `dataclasses` | Pydantic | Zero external deps; stdlib only |
| Execution Model | Sequential DAG | Parallel | Agents build on each other's context |
| Context Passing | Summary chain | Full output | Prevents context window overflow |
| LLM Abstraction | Multi-provider client | Single provider | Flexibility + mock for dev/test |
| API Design | Flask REST | FastAPI | Minimal deps; well-understood |

---

## Tech Stack

- **Backend**: Python 3.9+, Flask 3.0
- **LLM**: Anthropic Claude (primary), OpenAI (fallback), Mock (dev/test)
- **Architecture**: DAG-based task orchestration
- **Testing**: Python `unittest` (35 tests, all passing)

---

## Quick Start

### Mock Mode (no API key required)
```bash
cd ~/Documents/ai-workflow-orchestrator
pip3 install flask
python3 -m backend.api.server
```

### With Live Claude API
```bash
export ANTHROPIC_API_KEY="your-key-here"
python3 -m backend.api.server
```

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/health` | Service health check |
| `POST` | `/api/workflows` | Create and decompose workflow |
| `POST` | `/api/workflows/<id>/execute` | Execute an approved workflow |
| `GET` | `/api/workflows/<id>` | Get workflow state and results |
| `POST` | `/api/workflows/<id>/pause` | Pause at next task boundary |
| `POST` | `/api/workflows/<id>/resume` | Resume paused workflow |
| `GET` | `/api/templates` | Get 3 demo workflow templates |
| `POST` | `/api/run` | One-shot: decompose + execute |

---

## Demo Workflows

```bash
# Health check
curl http://localhost:5000/api/health

# Quick full run
curl -X POST http://localhost:5000/api/run \
  -H 'Content-Type: application/json' \
  -d '{"input": "Research AI trends and write a report"}'

# Step-by-step
curl -X POST http://localhost:5000/api/workflows \
  -H 'Content-Type: application/json' \
  -d '{"input": "Analyze the competitive landscape for electric vehicles"}'

# Execute (use workflow_id from above)
curl -X POST http://localhost:5000/api/workflows/<id>/execute
```

---

## Agent Types

| Agent | Role | Temperature | Specialty |
|-------|------|-------------|-----------|
| **Researcher** | Information gathering | 0.4 | Facts, stats, trends, sources |
| **Writer** | Content creation | 0.7 | Polished docs, summaries, narratives |
| **Reviewer** | Quality assurance | 0.2 | Fact-checking, quality scoring (1-5) |
| **Executor** | Final delivery | 0.1 | Incorporates feedback, produces deliverable |

---

## Project Structure

```
ai-workflow-orchestrator/
├── README.md
├── requirements.txt
├── .gitignore
├── backend/
│   ├── __init__.py
│   ├── orchestrator/
│   │   ├── models.py       # Data models (dataclasses + enums)
│   │   ├── llm_client.py   # LLM abstraction + mock
│   │   ├── decomposer.py   # DAG decomposition engine
│   │   └── engine.py       # Workflow execution engine
│   ├── agents/
│   │   └── agents.py       # Specialized agent implementations
│   └── api/
│       └── server.py       # Flask REST API
└── tests/
    └── test_orchestrator.py  # 35 unit tests
```

---

## Test Results

```bash
cd ~/Documents/ai-workflow-orchestrator
python3 tests/test_orchestrator.py
```

Expected output: **35/35 tests passed**

| Test Class | Tests | Status |
|------------|-------|--------|
| TestModels | 10 | All passing |
| TestLLMClient | 6 | All passing |
| TestDecomposition | 7 | All passing |
| TestAgents | 6 | All passing |
| TestWorkflowEngine | 9 | All passing |
| TestAPI | 8 | All passing |

---

## Cost Analysis

| Provider | Input (per 1K tokens) | Output (per 1K tokens) | Typical 4-task workflow |
|----------|----------------------|------------------------|------------------------|
| Anthropic Claude | $0.003 | $0.015 | ~$0.08-0.15 |
| OpenAI GPT-4 | $0.010 | $0.030 | ~$0.20-0.40 |
| Mock (dev) | Free | Free | $0.00 |

---

## What I Learned

1. **Context chain design is critical**: Passing full outputs between agents quickly exhausts context windows. Summarizing to ~600 chars per agent keeps costs manageable while preserving essential information.

2. **Topological sort enables flexible DAGs**: Kahn's algorithm cleanly handles arbitrary dependency graphs, allowing workflows that are more complex than simple linear chains.

3. **Mock-first development accelerates iteration**: Building realistic mock responses (not just "placeholder text") lets you develop and test the entire pipeline without API keys or costs.

4. **Temperature as a design parameter**: Each agent type has a distinct creativity/precision tradeoff. Reviewers need near-deterministic output (0.2) while writers benefit from more creativity (0.7).

---

## Roadmap (v2)

- [ ] **Parallel execution**: Run independent DAG branches concurrently
- [ ] **Human-in-the-loop**: Pause for user approval/editing between tasks
- [ ] **Persistent storage**: SQLite/PostgreSQL for workflow history
- [ ] **WebSocket streaming**: Real-time task progress in the frontend
- [ ] **Frontend UI**: React/Vue dashboard for workflow management
- [ ] **Custom agent types**: User-defined agents with custom prompts
- [ ] **Workflow templates**: Save and replay successful workflow patterns
