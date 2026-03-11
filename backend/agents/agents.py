"""Specialized AI agents for the workflow orchestrator."""
from typing import Any, Dict, List, Optional

from ..orchestrator.llm_client import LLMClient
from ..orchestrator.models import AgentType


RESEARCHER_PROMPT = """You are a meticulous research analyst with deep expertise in information synthesis. Your role is to:
- Gather comprehensive information on the given topic
- Identify key trends, statistics, and expert insights
- Structure findings with clear headers and source attribution
- Assign confidence levels to each finding
- Highlight critical data points and emerging patterns

Format your output with:
## Research Findings
### Key Discoveries
### Trends & Analysis
### Data Points & Statistics
### Sources & Confidence Levels
### Conclusions"""

WRITER_PROMPT = """You are an expert writer and communications specialist. Your role is to:
- Transform research findings into clear, compelling content
- Write with precision, authority, and accessibility
- Create well-structured documents with logical flow
- Never invent facts — only use information from the provided research
- Include executive summaries, recommendations, and action items

Format your output with:
## Executive Summary
### Overview
### Key Findings
### Strategic Recommendations
### Action Items
### Conclusion"""

REVIEWER_PROMPT = """You are a senior editor and fact-checker with rigorous quality standards. Your role is to:
- Evaluate content accuracy, completeness, and quality
- Verify all factual claims against the research provided
- Identify logical gaps, inconsistencies, or unclear sections
- Provide a numerical quality score on a 1-5 scale
- Give specific, actionable improvement recommendations

Format your output with:
## Quality Score: X.X / 5.0
### Assessment Summary
### Strengths
### Issues Identified
### Fact-Check Results
### Recommendations for Improvement
### Final Recommendation"""

EXECUTOR_PROMPT = """You are a precise executor responsible for final deliverable preparation. Your role is to:
- Incorporate all reviewer feedback faithfully
- Finalize and polish the content to publication quality
- Ensure consistency in style, tone, and formatting
- Follow instructions exactly without improvisation
- Produce the definitive, distribution-ready output

Format your output as the complete final deliverable, clearly marked as the final version."""

AGENT_TEMPERATURES = {
    AgentType.RESEARCHER: 0.4,
    AgentType.WRITER: 0.7,
    AgentType.REVIEWER: 0.2,
    AgentType.EXECUTOR: 0.1,
}

AGENT_PROMPTS = {
    AgentType.RESEARCHER: RESEARCHER_PROMPT,
    AgentType.WRITER: WRITER_PROMPT,
    AgentType.REVIEWER: REVIEWER_PROMPT,
    AgentType.EXECUTOR: EXECUTOR_PROMPT,
}


class BaseAgent:
    """Base class for all specialized agents."""

    def __init__(self, agent_type: AgentType, llm_client: LLMClient):
        self.agent_type = agent_type
        self.llm_client = llm_client
        self.temperature = AGENT_TEMPERATURES[agent_type]
        self.system_prompt = AGENT_PROMPTS[agent_type]

    def execute(
        self,
        task_description: str,
        original_intent: str,
        context_chain: List[Dict[str, Any]],
        expected_output: str = "",
    ) -> Dict[str, Any]:
        """Execute the task and return result with content, summary, and usage."""
        messages = self._build_messages(task_description, original_intent, context_chain, expected_output)

        result = self.llm_client.complete(
            messages=messages,
            system=self.system_prompt,
            temperature=self.temperature,
            max_tokens=4096,
        )

        content = result["content"]
        summary = self._summarize(content)

        return {
            "content": content,
            "summary": summary,
            "usage": {
                "input_tokens": result.get("input_tokens", 0),
                "output_tokens": result.get("output_tokens", 0),
            },
        }

    def _build_messages(
        self,
        task_description: str,
        original_intent: str,
        context_chain: List[Dict[str, Any]],
        expected_output: str,
    ) -> List[Dict[str, str]]:
        """Build the message list with context from prior agents."""
        parts = []

        parts.append(f"## Original Workflow Request\n{original_intent}")

        if context_chain:
            prior_work = []
            for ctx in context_chain:
                agent_name = ctx.get("agent_type", "unknown").capitalize()
                summary = ctx.get("summary", "")
                if summary:
                    prior_work.append(f"**{agent_name} Agent**: {summary}")
            if prior_work:
                parts.append("## Prior Agent Work\n" + "\n\n".join(prior_work))

        parts.append(f"## Your Task\n{task_description}")

        if expected_output:
            parts.append(f"## Expected Output\n{expected_output}")

        return [{"role": "user", "content": "\n\n".join(parts)}]

    def _summarize(self, content: str, max_chars: int = 600) -> str:
        """Create a brief summary by truncating content (no extra LLM call)."""
        if not content:
            return ""
        # Clean up the content and truncate
        lines = content.strip().split("\n")
        summary_lines = []
        char_count = 0
        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Skip markdown headers for summary, keep first substantive content
            if char_count + len(line) <= max_chars:
                summary_lines.append(line)
                char_count += len(line) + 1
            else:
                remaining = max_chars - char_count
                if remaining > 20:
                    summary_lines.append(line[:remaining] + "...")
                break
        return " ".join(summary_lines)[:max_chars]


def create_agent(agent_type: AgentType, llm_client: LLMClient) -> BaseAgent:
    """Factory function to create the appropriate agent for a given type."""
    if not isinstance(agent_type, AgentType):
        raise ValueError(f"Invalid agent type: {agent_type}. Must be an AgentType enum value.")
    return BaseAgent(agent_type=agent_type, llm_client=llm_client)
