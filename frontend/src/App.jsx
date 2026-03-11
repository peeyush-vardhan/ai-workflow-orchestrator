import { useState, useEffect, useRef } from 'react'

// ─── Injected keyframe animations (no external CSS) ────────────────────────
const GLOBAL_STYLES = `
  * { box-sizing: border-box; }
  html, body, #root {
    margin: 0; padding: 0;
    background: #060c1a;
    min-height: 100vh;
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
    color: #c8d8f0;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }
  @keyframes pulse {
    0%, 100% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.6; transform: scale(1.12); }
  }
  @keyframes pulseGlow {
    0%, 100% { opacity: 0.7; }
    50% { opacity: 1; }
  }
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes dashFlow {
    to { stroke-dashoffset: -28; }
  }
  @keyframes progressFill {
    from { width: 0%; }
    to   { width: 100%; }
  }
  @keyframes scanline {
    0%   { transform: translateY(-100%); opacity: 0; }
    20%  { opacity: 0.06; }
    80%  { opacity: 0.06; }
    100% { transform: translateY(2000%); opacity: 0; }
  }
  @keyframes nodeRing {
    0%, 100% { r: 34; opacity: 0.5; }
    50%       { r: 40; opacity: 0.15; }
  }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #1a3050; border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: #00d4ff60; }
`

// ─── Design tokens ──────────────────────────────────────────────────────────
const C = {
  bg:          '#060c1a',
  bg1:         '#0a1428',
  bg2:         '#0e1c38',
  border:      '#142040',
  borderHi:    '#1e3a6e',
  cyan:        '#00d4ff',
  green:       '#00e676',
  purple:      '#b39ddb',
  orange:      '#ffa726',
  blue:        '#42a5f5',
  red:         '#ef5350',
  text:        '#c8d8f0',
  textMuted:   '#4a6a8a',
  textBright:  '#f0f6ff',
}

// ─── Agent definitions ──────────────────────────────────────────────────────
const AGENTS = [
  { id: 'researcher', name: 'Researcher', icon: '◎', color: C.blue,   temp: 0.4, delayMs: 1400, tokIn: 920,  tokOut: 640 },
  { id: 'writer',     name: 'Writer',     icon: '◈', color: C.purple, temp: 0.7, delayMs: 1800, tokIn: 1240, tokOut: 820 },
  { id: 'reviewer',   name: 'Reviewer',   icon: '◉', color: C.orange, temp: 0.2, delayMs: 1200, tokIn: 1560, tokOut: 480 },
  { id: 'executor',   name: 'Executor',   icon: '◆', color: C.green,  temp: 0.1, delayMs: 1600, tokIn: 1820, tokOut: 760 },
]

// ─── Demo templates ─────────────────────────────────────────────────────────
const TEMPLATES = [
  {
    label: 'Competitive Analysis',
    input: 'Conduct a comprehensive competitive analysis of the AI assistant market. Identify key players, market share, pricing strategies, strengths and weaknesses, and opportunities for differentiation.',
  },
  {
    label: 'Content Pipeline',
    input: 'Research the impact of generative AI on software development productivity. Write a detailed blog post for engineering managers, review it for technical accuracy, then produce the final publication-ready version.',
  },
  {
    label: 'Executive Report',
    input: 'Analyze current trends in remote work adoption since 2020 — productivity data, employee preferences, company policies, and economic impacts. Produce an executive report with strategic recommendations for HR leaders.',
  },
]

// ─── Realistic mock outputs ──────────────────────────────────────────────────
const MOCK = {
  researcher: `## Research Findings

### Executive Overview
After extensive analysis of the requested topic, findings have been compiled from **23 authoritative sources** including peer-reviewed journals, industry reports (Gartner, McKinsey, Forrester), and expert interviews conducted Q4 2024.

### Key Discoveries

**1. Market Trajectory**
The domain is experiencing **34% year-over-year growth**, with total addressable market projected at **$847B by 2027**. Early adopters report an average **2.4x efficiency multiplier** within 18 months of full deployment.

**2. Technology Adoption Curve**
- 78% of Fortune 500 organizations are actively investing in automation infrastructure
- ROI averaging **156%** within first 18 months post-implementation
- Skill demand outpacing supply **3:1** — creating significant talent pressure across the industry

**3. Competitive Differentiation Signals**
Organizations with mature AI strategies demonstrate measurable advantages:
- 67% reduction in operational overhead (Gartner, 2024)
- 42% improvement in customer satisfaction scores (NPS delta)
- 28% faster time-to-market for new product launches

### Critical Data Points

| Metric | Value | Source | Confidence |
|--------|-------|--------|-----------|
| Cost reduction | 67% | Gartner | High |
| Satisfaction lift | +42 NPS | McKinsey | High |
| Time-to-market | -28% | IDC | Medium |
| Talent gap ratio | 3:1 | LinkedIn | High |
| 36-month ROI | 180% | Forrester | Medium |

### Risk Factors
- Integration complexity varies 4x by organizational maturity level
- Data privacy regulations affect 45% of potential implementations globally
- Legacy system technical debt creates 60% of delays in large enterprises

### Confidence Assessment
- Quantitative findings: **85–92%** confidence
- Trend projections (3yr horizon): **70–80%** confidence
- Market size estimates: **75–85%** confidence`,

  writer: `## Executive Summary

Organizations that decisively integrate AI into core operations are establishing **durable competitive advantages** that compound over time. This report synthesizes research findings into a clear strategic framework for leadership teams ready to act.

---

### The Strategic Imperative

The data is unambiguous: a **34% growth rate** and **$847B market opportunity** signal that the window for first-mover advantage is narrowing rapidly. Companies that delay risk becoming permanent followers in a landscape defined by AI-native competitors.

### Recommended Strategic Framework

**Phase 1 — Foundation** *(Months 1–3)*
Establish AI governance, identify top-5 use cases by ROI potential, and secure executive sponsorship with clear accountability structures. Invest in baseline measurement.

**Phase 2 — Pilot and Learn** *(Months 4–9)*
Launch 3 high-ROI pilots with rigorous measurement. Target the 67% cost-reduction opportunities first — these deliver the clearest signal to skeptical stakeholders.

**Phase 3 — Scale** *(Months 10–18)*
Roll out proven pilots enterprise-wide. Build proprietary data advantages that competitors cannot easily replicate.

### Financial Projections

| Scenario | 36-Month ROI | Breakeven | Confidence |
|----------|-------------|-----------|-----------|
| Conservative | 150% | Month 18 | 90% |
| **Base Case** | **180%** | **Month 14** | 75% |
| Optimistic | 240% | Month 10 | 55% |

### Key Performance Indicators
- **Primary**: Operational cost reduction (target: 40–67%)
- **Secondary**: Customer satisfaction delta (target: +30 NPS)
- **Leading indicator**: AI adoption rate across BUs (target: 60% in 12 months)

### Conclusion
The organizations that will lead the next decade are making these investments today. The strategic path forward is clear, the financial case is compelling, and the risk of inaction now exceeds the risk of execution.`,

  reviewer: `## Quality Score: 4.2 / 5.0

### Assessment Summary
This report demonstrates strong analytical foundations and presents findings with commendable clarity. The strategic framework is sound and actionable. Several targeted improvements will elevate this from good to exceptional before distribution.

---

### Strengths ✓

**Content Quality** — *4.5 / 5.0*
- Research is comprehensive with 23 cited sources spanning multiple methodologies
- Quantitative data is properly attributed and contextualized throughout
- Recommendations are specific, measurable, and time-bound with clear owners

**Strategic Framework** — *4.3 / 5.0*
- Three-phase implementation is realistic and logically sequenced
- Financial projections use an appropriate range of scenarios with confidence intervals
- KPIs are tied directly to business outcomes, not vanity metrics

**Clarity and Structure** — *4.4 / 5.0*
- Executive summary effectively captures decision-relevant content for C-suite
- Tables significantly improve scannability of dense data
- Logical flow from problem → evidence → solution → measurement

---

### Issues Identified ⚠

**Minor (address before final distribution)**
1. Financial projections lack sensitivity analysis for macroeconomic downturns
2. Implementation timeline assumes greenfield — needs a legacy-system adjustment factor (+20%)
3. Stakeholder communication plan is referenced but not detailed anywhere

**Suggestions for Improvement**
- Add a 2-page risk mitigation appendix with specific contingency triggers
- Include 2–3 brief case studies from comparable organizations
- Specify change management budget explicitly (recommend 15% of total investment)

---

### Fact-Check Results
- Market size ($847B by 2027): **VERIFIED** ✓ — Gartner Q3 2024 Research Note
- ROI claim (156% / 18 months): **VERIFIED** ✓ — Forrester Wave Report 2024
- Talent gap (3:1 ratio): **VERIFIED** ✓ — LinkedIn Global Workforce Report 2024
- Cost reduction (67%): **VERIFIED** ✓ — McKinsey Global Survey on AI Adoption

### Final Recommendation
**APPROVED with minor revisions.** Core content is publication-ready. Address the 3 flagged items before distribution to avoid credibility gaps with technical audiences.`,

  executor: `## Final Deliverable — AI Strategic Integration Report

**Status**: ✅ Publication Ready · Version 2.0 (Post-Review Revision)
**Classification**: Executive Distribution
**Prepared by**: AI Workflow Orchestrator · 4-Agent Sequential Pipeline

---

## AI Strategic Integration: A Leadership Playbook

### The Opportunity

A **$847 billion market transformation** is underway. Organizations that build AI capabilities now will compound advantages that late entrants cannot close. Data from 23 independent research sources is unambiguous: this is not a question of *whether* to act, but *how decisively*.

### Three-Phase Implementation Roadmap

| Phase | Timeline | Investment | Expected Return |
|-------|----------|-----------|----------------|
| **Foundation** | Months 1–3 | Baseline | Governance + capabilities |
| **Pilot and Learn** | Months 4–9 | +15% | First measurable ROI signals |
| **Scale** | Months 10–18 | +35% | **180% cumulative ROI** |

### Quantified Outcomes (Base Case)

- **67%** reduction in target operational costs within 18 months
- **+42 NPS** improvement in customer satisfaction scores
- **28%** faster time-to-market for new product launches
- **Breakeven**: Month 14 (conservative: Month 18)
- **36-Month ROI**: 180% base case (range: 150%–240%)

### Risk-Adjusted Implementation Notes

**Technical Risk** — Mitigated by phased rollout with defined rollback checkpoints at each phase gate
**Change Management** — Budget 15% of total investment; appoint a dedicated change lead with C-suite access
**Regulatory Risk** — Schedule legal review gate at each phase boundary before scaling
**Legacy Integration** — Add 20% timeline buffer for organizations with >1,000 employees or systems >10 years old

### Immediate Next Steps

1. **Week 1–2**: Secure C-suite sponsorship and formal resource commitment
2. **Week 3–4**: Complete current-state assessment and use-case prioritization matrix
3. **Month 2**: Launch Pilot 1 targeting highest-ROI identified use case
4. **Month 3**: First metrics review; gate decision for Phase 2 launch

---

*This report integrates findings from Researcher, Writer, and Reviewer agents. All claims independently verified against primary sources. Ready for executive distribution without further revision.*

**AI Workflow Orchestrator** · Sequential DAG Execution · Quality Reviewed ✓`,
}

// ─── Lightweight markdown renderer ──────────────────────────────────────────
function MD({ text }) {
  if (!text) return null

  const parseInline = (str, keyPrefix = '') => {
    const parts = str.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/)
    return parts.map((p, i) => {
      const k = `${keyPrefix}-${i}`
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
        return <strong key={k} style={{ color: C.textBright, fontWeight: 600 }}>{p.slice(2, -2)}</strong>
      if (p.startsWith('`') && p.endsWith('`') && p.length > 2)
        return <code key={k} style={{ background: '#0a1830', color: C.cyan, padding: '1px 5px', borderRadius: 3, fontSize: '0.84em', fontFamily: 'monospace' }}>{p.slice(1, -1)}</code>
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
        return <em key={k} style={{ color: C.textMuted }}>{p.slice(1, -1)}</em>
      return p
    })
  }

  const lines = text.split('\n')
  const out = []
  let k = 0
  let i = 0
  let tableRows = []

  const flushTable = () => {
    if (!tableRows.length) return
    const rows = tableRows.filter(r => !/^\s*\|[-| :]+\|\s*$/.test(r) && r.trim())
    out.push(
      <div key={k++} style={{ overflowX: 'auto', margin: '10px 0' }}>
        <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 12 }}>
          <tbody>
            {rows.map((row, ri) => {
              const cells = row.split('|').map(c => c.trim()).filter(c => c !== '')
              const isHead = ri === 0
              return (
                <tr key={ri} style={{ borderBottom: `1px solid ${C.border}`, background: isHead ? C.bg2 : ri % 2 === 0 ? '#0c1830' : 'transparent' }}>
                  {cells.map((cell, ci) => {
                    const Tag = isHead ? 'th' : 'td'
                    return (
                      <Tag key={ci} style={{ padding: '6px 12px', textAlign: 'left', color: isHead ? C.cyan : C.text, fontWeight: isHead ? 700 : 400, whiteSpace: 'nowrap' }}>
                        {parseInline(cell, `${ri}-${ci}`)}
                      </Tag>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    )
    tableRows = []
  }

  while (i < lines.length) {
    const line = lines[i]

    // Table detection
    if (line.trim().startsWith('|')) {
      tableRows.push(line)
      i++
      continue
    } else if (tableRows.length) {
      flushTable()
    }

    if (line.startsWith('## ')) {
      out.push(<h2 key={k++} style={{ color: C.cyan, fontSize: 15, fontWeight: 700, margin: '18px 0 8px', borderBottom: `1px solid ${C.border}`, paddingBottom: 6 }}>{parseInline(line.slice(3), k)}</h2>)
    } else if (line.startsWith('### ')) {
      out.push(<h3 key={k++} style={{ color: C.textBright, fontSize: 13, fontWeight: 600, margin: '14px 0 6px' }}>{parseInline(line.slice(4), k)}</h3>)
    } else if (line.startsWith('- ') || line.startsWith('* ')) {
      out.push(
        <div key={k++} style={{ display: 'flex', gap: 8, marginBottom: 4, paddingLeft: 4 }}>
          <span style={{ color: C.cyan, flexShrink: 0, marginTop: 2, fontSize: 10 }}>▸</span>
          <span style={{ fontSize: 13, color: C.text, lineHeight: 1.65 }}>{parseInline(line.slice(2), k)}</span>
        </div>
      )
    } else if (/^---+$/.test(line.trim())) {
      out.push(<hr key={k++} style={{ border: 'none', borderTop: `1px solid ${C.border}`, margin: '12px 0' }} />)
    } else if (line.trim() === '') {
      out.push(<div key={k++} style={{ height: 6 }} />)
    } else {
      out.push(<p key={k++} style={{ fontSize: 13, color: C.text, lineHeight: 1.7, marginBottom: 3 }}>{parseInline(line, k)}</p>)
    }
    i++
  }
  flushTable()
  return <>{out}</>
}

// ─── DAG SVG Pipeline ────────────────────────────────────────────────────────
function DAGPipeline({ activeIdx, doneIdxs }) {
  const cx = [90, 250, 410, 570]
  const cy = 80

  return (
    <svg viewBox="0 0 660 160" style={{ width: '100%', height: 150, display: 'block', overflow: 'visible' }}>
      <defs>
        {AGENTS.map(a => (
          <radialGradient key={a.id} id={`rg-${a.id}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%"   stopColor={a.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={a.color} stopOpacity="0" />
          </radialGradient>
        ))}
        <marker id="arr"    markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5z" fill={C.borderHi} />
        </marker>
        <marker id="arr-hi" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto">
          <path d="M0,0 L0,7 L7,3.5z" fill={C.cyan} />
        </marker>
      </defs>

      {/* Grid lines for mission-control feel */}
      {[40, 80, 120].map(y => (
        <line key={y} x1="0" y1={y} x2="660" y2={y} stroke={C.border} strokeWidth="0.5" strokeOpacity="0.4" />
      ))}

      {/* Connector lines */}
      {[0, 1, 2].map(i => {
        const x1 = cx[i] + 32, x2 = cx[i + 1] - 32
        const done = doneIdxs.includes(i) && doneIdxs.includes(i + 1)
        const active = activeIdx === i || activeIdx === i + 1
        const lineColor = done ? C.cyan : active ? C.cyan + '80' : C.border
        return (
          <line
            key={i}
            x1={x1} y1={cy} x2={x2} y2={cy}
            stroke={lineColor}
            strokeWidth={done ? 2 : 1.5}
            strokeDasharray={active && !done ? '7 4' : 'none'}
            style={active && !done ? { animation: 'dashFlow 0.6s linear infinite' } : {}}
            markerEnd={done ? 'url(#arr-hi)' : 'url(#arr)'}
          />
        )
      })}

      {/* Nodes */}
      {AGENTS.map((a, i) => {
        const x = cx[i]
        const isActive = activeIdx === i
        const isDone   = doneIdxs.includes(i)
        const isPending = !isActive && !isDone
        const col = isPending ? C.textMuted : a.color

        return (
          <g key={a.id} transform={`translate(${x},${cy})`}>
            {/* Ambient glow for active */}
            {isActive && (
              <circle r="52" fill={`url(#rg-${a.id})`}
                style={{ animation: 'pulseGlow 2s ease-in-out infinite' }} />
            )}
            {/* Done shimmer */}
            {isDone && (
              <circle r="44" fill={`url(#rg-${a.id})`} opacity="0.5" />
            )}

            {/* Outer ring */}
            <circle r="30"
              fill={isDone ? a.color + '18' : isActive ? a.color + '12' : C.bg1}
              stroke={col}
              strokeWidth={isActive ? 2.5 : isDone ? 2 : 1}
              style={isActive ? { filter: `drop-shadow(0 0 8px ${a.color})` } : {}}
            />

            {/* Spinning dashed ring for active */}
            {isActive && (
              <circle r="37" fill="none"
                stroke={a.color} strokeWidth="1.5"
                strokeDasharray="12 6"
                strokeOpacity="0.6"
                style={{ animation: 'spin 3s linear infinite', transformOrigin: '0 0' }}
              />
            )}

            {/* Icon / checkmark */}
            <text textAnchor="middle" dominantBaseline="central"
              style={{ fontSize: 16, fill: col, fontWeight: 700,
                filter: isDone || isActive ? `drop-shadow(0 0 4px ${a.color})` : 'none' }}>
              {isDone ? '✓' : a.icon}
            </text>

            {/* Label */}
            <text textAnchor="middle" y="46"
              style={{ fontSize: 10, fill: col, fontWeight: isActive ? 700 : 400,
                textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {a.name}
            </text>

            {/* Temp badge */}
            <text textAnchor="middle" y="59"
              style={{ fontSize: 9, fill: C.textMuted, fontFamily: 'monospace' }}>
              t={a.temp}
            </text>

            {/* Step number */}
            <text textAnchor="middle" y="-40"
              style={{ fontSize: 9, fill: isPending ? C.textMuted + '60' : col + 'aa', fontFamily: 'monospace' }}>
              0{i + 1}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Metrics cards ───────────────────────────────────────────────────────────
function MetricsBar({ elapsed, tokens, cost, done }) {
  const fmt = n => n >= 1000 ? (n / 1000).toFixed(1) + 'K' : String(n)
  const items = [
    { icon: '⏱', label: 'Elapsed',     value: `${elapsed.toFixed(1)}s`,    color: C.cyan },
    { icon: '◈', label: 'Tokens',      value: fmt(tokens),                  color: C.purple },
    { icon: '$', label: 'Est. Cost',   value: `$${cost.toFixed(4)}`,        color: C.green },
    { icon: '◆', label: 'Agents Done', value: `${done} / ${AGENTS.length}`, color: C.orange },
  ]
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 10, marginBottom: 20 }}>
      {items.map(it => (
        <div key={it.label} style={{ background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 10, padding: '14px 10px', textAlign: 'center' }}>
          <div style={{ fontSize: 18, color: it.color, marginBottom: 4 }}>{it.icon}</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: it.color, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{it.value}</div>
          <div style={{ fontSize: 10, color: C.textMuted, marginTop: 3, textTransform: 'uppercase', letterSpacing: '0.07em' }}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Agent output card ───────────────────────────────────────────────────────
function AgentCard({ agent, isActive, isDone, output, expanded, onToggle }) {
  const col = agent.color
  return (
    <div style={{
      background: isActive ? `linear-gradient(135deg,${C.bg1} 0%,${col}08 100%)` : C.bg1,
      border: `1px solid ${isActive ? col + '70' : isDone ? col + '40' : C.border}`,
      borderRadius: 10,
      marginBottom: 10,
      overflow: 'hidden',
      transition: 'border-color 0.3s, box-shadow 0.3s',
      boxShadow: isActive ? `0 0 24px ${col}18` : 'none',
    }}>
      {/* Header row */}
      <div
        onClick={isDone ? onToggle : undefined}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', cursor: isDone ? 'pointer' : 'default' }}
      >
        {/* Status circle */}
        <div style={{
          width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
          background: isDone ? col + '20' : isActive ? col + '12' : C.bg2,
          border: `2px solid ${isDone ? col : isActive ? col : C.border}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: isActive ? `0 0 12px ${col}60` : 'none',
        }}>
          {isActive
            ? <div style={{ width: 14, height: 14, border: `2.5px solid ${col}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />
            : isDone
              ? <span style={{ color: col, fontSize: 15, fontWeight: 700 }}>✓</span>
              : <span style={{ color: C.textMuted, fontSize: 13 }}>◌</span>
          }
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: isDone || isActive ? col : C.textMuted }}>{agent.name} Agent</span>
            <span style={{ fontSize: 10, color: C.textMuted, background: C.bg2, padding: '2px 6px', borderRadius: 3, fontFamily: 'monospace' }}>temp={agent.temp}</span>
            {isActive && <span style={{ fontSize: 10, color: col, fontWeight: 600, animation: 'pulse 1s ease-in-out infinite' }}>● RUNNING</span>}
            {isDone   && <span style={{ fontSize: 10, color: C.textMuted }}>COMPLETE</span>}
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, marginTop: 2 }}>
            {agent.id === 'researcher' && 'Gathering data, analyzing trends, synthesizing sources'}
            {agent.id === 'writer'     && 'Drafting structured content from research findings'}
            {agent.id === 'reviewer'   && 'Quality assessment, fact-checking, scoring 1–5'}
            {agent.id === 'executor'   && 'Final polish, incorporating feedback, delivery prep'}
          </div>
        </div>

        {isDone && output && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: C.textMuted }}>{output.length.toLocaleString()} chars</span>
            <span style={{ color: C.textMuted, fontSize: 20, display: 'inline-block', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>⌃</span>
          </div>
        )}
      </div>

      {/* Progress bar */}
      {isActive && (
        <div style={{ height: 2, background: C.bg2 }}>
          <div style={{ height: '100%', background: `linear-gradient(90deg,${col},${col}60)`, animation: `progressFill ${agent.delayMs}ms linear forwards` }} />
        </div>
      )}

      {/* Expanded output */}
      {expanded && isDone && output && (
        <div style={{ padding: '16px 20px', borderTop: `1px solid ${C.border}`, background: C.bg, animation: 'fadeUp 0.25s ease-out' }}>
          <MD text={output} />
        </div>
      )}
    </div>
  )
}

// ─── Completion view ─────────────────────────────────────────────────────────
function CompletionView({ output, elapsed, tokens, cost }) {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    const fallback = () => {
      const ta = document.createElement('textarea')
      ta.value = output; document.body.appendChild(ta); ta.select()
      document.execCommand('copy'); document.body.removeChild(ta)
    }
    if (navigator.clipboard) {
      navigator.clipboard.writeText(output).catch(fallback)
    } else { fallback() }
    setCopied(true)
    setTimeout(() => setCopied(false), 2200)
  }

  return (
    <div style={{
      background: `linear-gradient(135deg,${C.bg1} 0%,${C.green}0a 100%)`,
      border: `1px solid ${C.green}50`,
      borderRadius: 12, padding: 24,
      animation: 'fadeUp 0.5s ease-out',
      boxShadow: `0 0 40px ${C.green}12`,
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{
            width: 44, height: 44, borderRadius: '50%',
            background: C.green + '20', border: `2px solid ${C.green}`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 22, boxShadow: `0 0 20px ${C.green}40`,
          }}>✓</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.green }}>Workflow Complete</div>
            <div style={{ fontSize: 12, color: C.textMuted, marginTop: 2 }}>
              {elapsed.toFixed(1)}s · {tokens.toLocaleString()} tokens · ${cost.toFixed(4)} est. cost
            </div>
          </div>
        </div>

        <button onClick={handleCopy} style={{
          background: copied ? C.green + '20' : C.bg2,
          border: `1.5px solid ${copied ? C.green : C.border}`,
          borderRadius: 8, color: copied ? C.green : C.text,
          padding: '9px 18px', cursor: 'pointer', fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', gap: 7,
          transition: 'all 0.2s',
        }}>
          <span style={{ fontSize: 16 }}>{copied ? '✓' : '⎘'}</span>
          {copied ? 'Copied!' : 'Copy Output'}
        </button>
      </div>

      {/* Final output panel */}
      <div style={{ background: C.bg, border: `1px solid ${C.border}`, borderRadius: 8, padding: '20px 22px', maxHeight: 520, overflowY: 'auto' }}>
        <MD text={output} />
      </div>
    </div>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  const [input,      setInput]      = useState('')
  const [phase,      setPhase]      = useState('idle')   // idle | running | complete
  const [activeIdx,  setActiveIdx]  = useState(-1)
  const [doneIdxs,   setDoneIdxs]   = useState([])
  const [outputs,    setOutputs]    = useState({})
  const [expanded,   setExpanded]   = useState({})
  const [elapsed,    setElapsed]    = useState(0)
  const [tokens,     setTokens]     = useState(0)
  const [cost,       setCost]       = useState(0)
  const [finalOut,   setFinalOut]   = useState('')

  const timerRef   = useRef(null)
  const startRef   = useRef(null)

  // Elapsed-time ticker
  useEffect(() => {
    if (phase === 'running') {
      startRef.current = Date.now() - elapsed * 1000
      timerRef.current = setInterval(() =>
        setElapsed((Date.now() - startRef.current) / 1000), 100)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [phase]) // eslint-disable-line

  const runWorkflow = async () => {
    if (!input.trim() || phase === 'running') return

    setPhase('running')
    setActiveIdx(0)
    setDoneIdxs([])
    setOutputs({})
    setExpanded({})
    setElapsed(0)
    setTokens(0)
    setCost(0)
    setFinalOut('')
    startRef.current = Date.now()

    let cumTok = 0, cumCost = 0

    for (let i = 0; i < AGENTS.length; i++) {
      const a = AGENTS[i]
      setActiveIdx(i)
      await new Promise(r => setTimeout(r, a.delayMs))

      cumTok  += a.tokIn + a.tokOut
      cumCost += (a.tokIn / 1000) * 0.003 + (a.tokOut / 1000) * 0.015

      setOutputs(p => ({ ...p, [a.id]: MOCK[a.id] }))
      setDoneIdxs(p => [...p, i])
      setTokens(cumTok)
      setCost(cumCost)

      // Auto-expand newly finished agent, collapse previous after short delay
      setExpanded(p => ({ ...p, [a.id]: true }))
      if (i > 0) {
        const prevId = AGENTS[i - 1].id
        setTimeout(() => setExpanded(p => ({ ...p, [prevId]: false })), 900)
      }
    }

    setActiveIdx(-1)
    setFinalOut(MOCK.executor)
    setPhase('complete')
  }

  const reset = () => {
    setPhase('idle'); setActiveIdx(-1); setDoneIdxs([])
    setOutputs({}); setExpanded({}); setElapsed(0)
    setTokens(0); setCost(0); setFinalOut('')
  }

  const toggleExpanded = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  return (
    <>
      {/* Inject keyframes */}
      <style dangerouslySetInnerHTML={{ __html: GLOBAL_STYLES }} />

      <div style={{ minHeight: '100vh', background: C.bg, paddingBottom: 80 }}>

        {/* ── Sticky header ── */}
        <header style={{
          borderBottom: `1px solid ${C.border}`,
          padding: '14px 28px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: `${C.bg1}e8`,
          position: 'sticky', top: 0, zIndex: 200,
          backdropFilter: 'blur(10px)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 34, height: 34, borderRadius: 8,
              background: `linear-gradient(135deg,${C.cyan}28,${C.blue}20)`,
              border: `1.5px solid ${C.cyan}60`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 18, boxShadow: `0 0 12px ${C.cyan}20`,
            }}>⬡</div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: C.textBright, letterSpacing: '0.04em' }}>AI WORKFLOW ORCHESTRATOR</div>
              <div style={{ fontSize: 10, color: C.textMuted, letterSpacing: '0.07em' }}>MULTI-AGENT · DAG PIPELINE · SEQUENTIAL EXECUTION</div>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {/* Provider badge */}
            <div style={{ fontSize: 10, color: C.textMuted, background: C.bg2, border: `1px solid ${C.border}`, padding: '4px 10px', borderRadius: 20, fontFamily: 'monospace', letterSpacing: '0.04em' }}>
              MOCK PROVIDER
            </div>
            {/* Status dot */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <div style={{
                width: 8, height: 8, borderRadius: '50%',
                background: phase === 'running' ? C.green : phase === 'complete' ? C.green : C.textMuted,
                animation: phase === 'running' ? 'pulse 1s ease-in-out infinite' : 'none',
              }} />
              <span style={{ fontSize: 11, color: C.textMuted, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                {phase === 'idle' ? 'Ready' : phase === 'running' ? 'Running' : 'Complete'}
              </span>
            </div>
            {phase !== 'idle' && (
              <button onClick={reset} style={{
                background: 'transparent', border: `1px solid ${C.border}`,
                borderRadius: 6, color: C.textMuted, padding: '5px 12px',
                cursor: 'pointer', fontSize: 12, letterSpacing: '0.03em',
              }}>↺ Reset</button>
            )}
          </div>
        </header>

        {/* ── Main content ── */}
        <main style={{ maxWidth: 860, margin: '0 auto', padding: '30px 22px' }}>

          {/* Templates */}
          <div style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.09em' }}>Quick Templates</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {TEMPLATES.map(t => (
                <button key={t.label}
                  onClick={() => setInput(t.input)}
                  disabled={phase === 'running'}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = C.cyan; e.currentTarget.style.color = C.cyan }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.text }}
                  style={{
                    background: C.bg1, border: `1px solid ${C.border}`, borderRadius: 6,
                    color: C.text, padding: '7px 14px', cursor: phase === 'running' ? 'not-allowed' : 'pointer',
                    fontSize: 13, opacity: phase === 'running' ? 0.45 : 1, transition: 'all 0.15s',
                  }}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          {/* Textarea */}
          <textarea
            value={input}
            onChange={e => setInput(e.target.value)}
            disabled={phase === 'running'}
            placeholder={"Describe your workflow in natural language…\n\nExample: Research the latest AI trends, write a comprehensive report for C-suite executives, review it for accuracy, then prepare the final deliverable."}
            onFocus={e  => e.target.style.borderColor = C.cyan}
            onBlur={e   => e.target.style.borderColor = input ? C.borderHi : C.border}
            style={{
              width: '100%', minHeight: 120,
              background: C.bg1,
              border: `1px solid ${input && phase !== 'running' ? C.borderHi : C.border}`,
              borderRadius: 10, color: C.text, fontSize: 14, lineHeight: 1.65,
              padding: '13px 15px', resize: 'vertical', outline: 'none',
              fontFamily: 'inherit', transition: 'border-color 0.2s',
              marginBottom: 12,
            }}
          />

          {/* Run button */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 28 }}>
            <button
              onClick={runWorkflow}
              disabled={!input.trim() || phase === 'running'}
              onMouseEnter={e => { if (input.trim() && phase !== 'running') e.currentTarget.style.boxShadow = `0 0 30px ${C.cyan}40` }}
              onMouseLeave={e => { e.currentTarget.style.boxShadow = `0 0 18px ${C.cyan}20` }}
              style={{
                background: phase === 'running'
                  ? C.bg2
                  : `linear-gradient(135deg,${C.cyan}22,${C.blue}18)`,
                border: `1.5px solid ${phase === 'running' ? C.border : C.cyan}`,
                borderRadius: 8,
                color: phase === 'running' ? C.textMuted : C.cyan,
                padding: '11px 30px', cursor: !input.trim() || phase === 'running' ? 'not-allowed' : 'pointer',
                fontSize: 14, fontWeight: 600,
                opacity: !input.trim() && phase !== 'running' ? 0.35 : 1,
                letterSpacing: '0.04em',
                display: 'flex', alignItems: 'center', gap: 9,
                transition: 'all 0.2s',
                boxShadow: phase !== 'running' && input.trim() ? `0 0 18px ${C.cyan}20` : 'none',
              }}>
              {phase === 'running'
                ? <><div style={{ width: 14, height: 14, border: `2px solid ${C.textMuted}`, borderTopColor: 'transparent', borderRadius: '50%', animation: 'spin 0.75s linear infinite' }} />Executing…</>
                : <>▶ Run Workflow</>
              }
            </button>
          </div>

          {/* DAG Pipeline */}
          {(phase === 'running' || phase === 'complete') && (
            <div style={{
              background: C.bg1, border: `1px solid ${C.border}`,
              borderRadius: 12, padding: '14px 20px', marginBottom: 18,
              animation: 'fadeUp 0.35s ease-out',
            }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 2, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                Pipeline DAG · Sequential Execution
              </div>
              <DAGPipeline activeIdx={activeIdx} doneIdxs={doneIdxs} />
            </div>
          )}

          {/* Metrics */}
          {(phase === 'running' || phase === 'complete') && (
            <MetricsBar elapsed={elapsed} tokens={tokens} cost={cost} done={doneIdxs.length} />
          )}

          {/* Agent Cards */}
          {(phase === 'running' || phase === 'complete') && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ fontSize: 10, color: C.textMuted, marginBottom: 10, textTransform: 'uppercase', letterSpacing: '0.09em' }}>
                Agent Execution Log
              </div>
              {AGENTS.map((a, i) => (
                <AgentCard
                  key={a.id}
                  agent={a}
                  isActive={activeIdx === i}
                  isDone={doneIdxs.includes(i)}
                  output={outputs[a.id]}
                  expanded={!!expanded[a.id]}
                  onToggle={() => toggleExpanded(a.id)}
                />
              ))}
            </div>
          )}

          {/* Completion view */}
          {phase === 'complete' && finalOut && (
            <CompletionView output={finalOut} elapsed={elapsed} tokens={tokens} cost={cost} />
          )}

        </main>
      </div>
    </>
  )
}
