import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Global styles + Theme variables ─────────────────────────────────────────
const GLOBAL_STYLES = `
  :root {
    --bg0:#0c0f1a; --bg1:#141826; --bg2:#1a2035; --bg3:#202540;
    --border:#252d4a; --border-hi:#3a4878;
    --text:#dde4f8; --text-muted:#5a6a90; --text-bright:#f0f4ff;
    --primary:#7c6cf8; --primary-dim:#7c6cf820; --accent:#06b6d4;
    --green:#10b981; --orange:#f59e0b; --red:#ef4444; --yellow:#fbbf24;
    --blue:#60a5fa; --purple:#a78bfa;
  }
  [data-theme="light"] {
    --bg0:#f4f6ff; --bg1:#ffffff; --bg2:#eef1ff; --bg3:#e4e8ff;
    --border:#d4d8f0; --border-hi:#a8b4e8;
    --text:#1e2848; --text-muted:#7a86aa; --text-bright:#0a1030;
    --primary:#5b4fe0; --primary-dim:#5b4fe015; --accent:#0891b2;
    --green:#059669; --orange:#d97706; --red:#dc2626; --yellow:#d97706;
    --blue:#2563eb; --purple:#7c3aed;
  }
  * { box-sizing: border-box; }
  html, body, #root {
    margin: 0; padding: 0;
    background: var(--bg0);
    min-height: 100vh;
    font-family: -apple-system, 'SF Pro Display', 'Segoe UI', system-ui, sans-serif;
    color: var(--text);
  }
  @keyframes spin      { to { transform: rotate(360deg); } }
  @keyframes pulse     { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.6;transform:scale(1.12)} }
  @keyframes pulseGlow { 0%,100%{opacity:.7} 50%{opacity:1} }
  @keyframes fadeUp    { from{opacity:0;transform:translateY(14px)} to{opacity:1;transform:translateY(0)} }
  @keyframes dashFlow  { to { stroke-dashoffset: -28; } }
  @keyframes shimmer   { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
  @keyframes gradShift { 0%,100%{background-position:0% 50%} 50%{background-position:100% 50%} }
  ::-webkit-scrollbar { width: 5px; height: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: var(--border-hi); border-radius: 4px; }
  ::-webkit-scrollbar-thumb:hover { background: var(--accent); }
  button { font-family: inherit; }
`

// ─── Design tokens (CSS variable references) ──────────────────────────────────
const C = {
  bg: 'var(--bg0)', bg1: 'var(--bg1)', bg2: 'var(--bg2)',
  border: 'var(--border)', borderHi: 'var(--border-hi)',
  cyan: 'var(--accent)', green: 'var(--green)', purple: 'var(--purple)',
  orange: 'var(--orange)', blue: 'var(--blue)', red: 'var(--red)', yellow: 'var(--yellow)',
  text: 'var(--text)', textMuted: 'var(--text-muted)', textBright: 'var(--text-bright)',
  primary: 'var(--primary)',
}

const AGENT_META = {
  researcher: { icon: '◎', color: C.blue,   label: 'Researcher' },
  writer:     { icon: '◈', color: C.purple, label: 'Writer'     },
  reviewer:   { icon: '◉', color: C.orange, label: 'Reviewer'   },
  executor:   { icon: '◆', color: C.green,  label: 'Executor'   },
}

const BUILTIN_TEMPLATES = [
  { label: 'Competitive Analysis', input: 'Conduct a comprehensive competitive analysis of the AI assistant market. Identify key players, market share, pricing strategies, strengths and weaknesses, and opportunities for differentiation.' },
  { label: 'Content Pipeline',     input: 'Research the impact of generative AI on software development productivity. Write a detailed blog post for engineering managers, review it for technical accuracy, then produce the final publication-ready version.' },
  { label: 'Executive Report',     input: 'Analyze current trends in remote work adoption since 2020 — productivity data, employee preferences, company policies, and economic impacts. Produce an executive report with strategic recommendations for HR leaders.' },
]

// ─── Lightweight markdown renderer ───────────────────────────────────────────
function MD({ text }) {
  if (!text) return null
  const parseInline = (str, kp = '') =>
    str.split(/(\*\*[^*]+\*\*|`[^`]+`|\*[^*]+\*)/).map((p, i) => {
      const k = `${kp}-${i}`
      if (p.startsWith('**') && p.endsWith('**') && p.length > 4)
        return <strong key={k} style={{ color: C.textBright, fontWeight: 600 }}>{p.slice(2,-2)}</strong>
      if (p.startsWith('`') && p.endsWith('`') && p.length > 2)
        return <code key={k} style={{ background:'#0a1830',color:C.cyan,padding:'1px 5px',borderRadius:3,fontSize:'.84em',fontFamily:'monospace' }}>{p.slice(1,-1)}</code>
      if (p.startsWith('*') && p.endsWith('*') && p.length > 2)
        return <em key={k} style={{ color: C.textMuted }}>{p.slice(1,-1)}</em>
      return p
    })
  const lines = text.split('\n'); const out = []; let k=0,i=0,tableRows=[]
  const flushTable = () => {
    if (!tableRows.length) return
    const rows = tableRows.filter(r => !/^\s*\|[-| :]+\|\s*$/.test(r) && r.trim())
    out.push(<div key={k++} style={{overflowX:'auto',margin:'10px 0'}}>
      <table style={{borderCollapse:'collapse',width:'100%',fontSize:12}}><tbody>
        {rows.map((row,ri) => {
          const cells = row.split('|').map(c=>c.trim()).filter(c=>c!=='')
          const isHead = ri===0
          return <tr key={ri} style={{borderBottom:`1px solid ${C.border}`,background:isHead?C.bg2:ri%2===0?'#0c1830':'transparent'}}>
            {cells.map((cell,ci) => {
              const Tag = isHead?'th':'td'
              return <Tag key={ci} style={{padding:'6px 12px',textAlign:'left',color:isHead?C.cyan:C.text,fontWeight:isHead?700:400,whiteSpace:'nowrap'}}>{parseInline(cell,`${ri}-${ci}`)}</Tag>
            })}
          </tr>
        })}
      </tbody></table>
    </div>)
    tableRows = []
  }
  while (i < lines.length) {
    const line = lines[i]
    if (line.trim().startsWith('|')) { tableRows.push(line); i++; continue }
    else if (tableRows.length) flushTable()
    if (line.startsWith('## '))       out.push(<h2 key={k++} style={{color:C.cyan,fontSize:15,fontWeight:700,margin:'18px 0 8px',borderBottom:`1px solid ${C.border}`,paddingBottom:6}}>{parseInline(line.slice(3),k)}</h2>)
    else if (line.startsWith('### ')) out.push(<h3 key={k++} style={{color:C.textBright,fontSize:13,fontWeight:600,margin:'14px 0 6px'}}>{parseInline(line.slice(4),k)}</h3>)
    else if (line.startsWith('- ')||line.startsWith('* '))
      out.push(<div key={k++} style={{display:'flex',gap:8,marginBottom:4,paddingLeft:4}}><span style={{color:C.cyan,flexShrink:0,marginTop:2,fontSize:10}}>▸</span><span style={{fontSize:13,color:C.text,lineHeight:1.65}}>{parseInline(line.slice(2),k)}</span></div>)
    else if (/^---+$/.test(line.trim())) out.push(<hr key={k++} style={{border:'none',borderTop:`1px solid ${C.border}`,margin:'12px 0'}}/>)
    else if (line.trim()==='')          out.push(<div key={k++} style={{height:6}}/>)
    else                                out.push(<p key={k++} style={{fontSize:13,color:C.text,lineHeight:1.7,marginBottom:3}}>{parseInline(line,k)}</p>)
    i++
  }
  flushTable()
  return <>{out}</>
}

// ─── Dynamic DAG pipeline ────────────────────────────────────────────────────
function DAGPipeline({ tasks, activeTaskIds, doneTaskIds }) {
  if (!tasks.length) return null
  const W = 660, nodeR = 28, spacing = Math.min(160, (W - 60) / Math.max(tasks.length, 1))
  const cx = tasks.map((_, i) => 40 + i * spacing)
  const cy = 80

  return (
    <svg viewBox={`0 0 ${Math.max(W, tasks.length * spacing + 80)} 160`}
         style={{ width:'100%', height:150, display:'block', overflow:'visible' }}>
      <defs>
        {tasks.map(t => {
          const m = AGENT_META[t.agent_type] || { color: C.cyan }
          return (
            <radialGradient key={t.id} id={`rg-${t.id}`} cx="50%" cy="50%" r="50%">
              <stop offset="0%"   stopColor={m.color} stopOpacity=".35" />
              <stop offset="100%" stopColor={m.color} stopOpacity="0"  />
            </radialGradient>
          )
        })}
        <marker id="arr"    markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill={C.borderHi}/></marker>
        <marker id="arr-hi" markerWidth="7" markerHeight="7" refX="5" refY="3.5" orient="auto"><path d="M0,0 L0,7 L7,3.5z" fill={C.cyan}/></marker>
      </defs>

      {/* Dependency arrows */}
      {tasks.map((task, ti) =>
        task.depends_on.map(depId => {
          const di = tasks.findIndex(t => t.id === depId)
          if (di < 0) return null
          const x1 = cx[di] + nodeR, x2 = cx[ti] - nodeR
          const done = doneTaskIds.has(task.id) && doneTaskIds.has(depId)
          return (
            <line key={`${depId}-${task.id}`}
              x1={x1} y1={cy} x2={x2} y2={cy}
              stroke={done ? C.cyan : C.border}
              strokeWidth={done ? 2 : 1.5}
              markerEnd={done ? 'url(#arr-hi)' : 'url(#arr)'}
            />
          )
        })
      )}

      {/* Nodes */}
      {tasks.map((task, i) => {
        const x = cx[i]
        const m = AGENT_META[task.agent_type] || { icon: '◌', color: C.cyan, label: task.agent_type }
        const isActive  = activeTaskIds.has(task.id)
        const isDone    = doneTaskIds.has(task.id)
        const isPending = !isActive && !isDone
        const col = isPending ? C.textMuted : m.color
        return (
          <g key={task.id} transform={`translate(${x},${cy})`}>
            {isActive && <circle r="44" fill={`url(#rg-${task.id})`} style={{animation:'pulseGlow 2s ease-in-out infinite'}}/>}
            {isDone   && <circle r="36" fill={`url(#rg-${task.id})`} opacity=".5"/>}
            <circle r={nodeR}
              fill={isDone ? m.color+'18' : isActive ? m.color+'12' : C.bg1}
              stroke={col} strokeWidth={isActive ? 2.5 : isDone ? 2 : 1}
              style={isActive ? {filter:`drop-shadow(0 0 8px ${m.color})`} : {}}
            />
            {isActive && <circle r="34" fill="none" stroke={m.color} strokeWidth="1.5"
              strokeDasharray="10 5" strokeOpacity=".6"
              style={{animation:'spin 3s linear infinite',transformOrigin:'0 0'}}/>}
            <text textAnchor="middle" dominantBaseline="central"
              style={{fontSize:14,fill:col,fontWeight:700,filter:isDone||isActive?`drop-shadow(0 0 4px ${m.color})`:'none'}}>
              {isDone ? '✓' : m.icon}
            </text>
            <text textAnchor="middle" y={nodeR + 16}
              style={{fontSize:9,fill:col,fontWeight:isActive?700:400,textTransform:'uppercase',letterSpacing:'.08em'}}>
              {m.label || task.agent_type}
            </text>
            <text textAnchor="middle" y={nodeR + 27}
              style={{fontSize:8,fill:C.textMuted,fontFamily:'monospace'}}>
              {task.id}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

// ─── Metrics bar ─────────────────────────────────────────────────────────────
function MetricsBar({ elapsed, tokens, cost, done, total }) {
  const fmt = n => n >= 1000 ? (n/1000).toFixed(1)+'K' : String(n)
  const items = [
    { icon:'⏱', label:'Elapsed',     value:`${elapsed.toFixed(1)}s`,   color:C.cyan   },
    { icon:'◈', label:'Tokens',      value:fmt(tokens),                 color:C.purple },
    { icon:'$', label:'Est. Cost',   value:`$${cost.toFixed(4)}`,       color:C.green  },
    { icon:'◆', label:'Tasks Done',  value:`${done} / ${total}`,        color:C.orange },
  ]
  return (
    <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
      {items.map(it => (
        <div key={it.label} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:'14px 10px',textAlign:'center'}}>
          <div style={{fontSize:18,color:it.color,marginBottom:4}}>{it.icon}</div>
          <div style={{fontSize:22,fontWeight:700,color:it.color,fontFamily:'monospace',letterSpacing:'-.02em'}}>{it.value}</div>
          <div style={{fontSize:10,color:C.textMuted,marginTop:3,textTransform:'uppercase',letterSpacing:'.07em'}}>{it.label}</div>
        </div>
      ))}
    </div>
  )
}

// ─── Task card ───────────────────────────────────────────────────────────────
function TaskCard({ task, isActive, isDone, isPaused, output, expanded, onToggle, onEditRequest }) {
  const m = AGENT_META[task.agent_type] || { icon:'◌', color:C.cyan, label: task.agent_type }
  const col = m.color
  return (
    <div style={{
      background: isActive ? `linear-gradient(135deg,${C.bg1} 0%,${col}08 100%)` : isPaused ? `linear-gradient(135deg,${C.bg1},${C.orange}08)` : C.bg1,
      border:`1px solid ${isActive ? col+'70' : isPaused ? C.orange+'60' : isDone ? col+'40' : C.border}`,
      borderRadius:10, marginBottom:10, overflow:'hidden',
      transition:'border-color .3s,box-shadow .3s',
      boxShadow: isActive ? `0 0 24px ${col}18` : isPaused ? `0 0 16px ${C.orange}18` : 'none',
    }}>
      <div onClick={isDone || isPaused ? onToggle : undefined}
           style={{display:'flex',alignItems:'center',gap:12,padding:'12px 16px',cursor:isDone||isPaused?'pointer':'default'}}>
        <div style={{
          width:36,height:36,borderRadius:'50%',flexShrink:0,
          background:isDone?col+'20':isActive?col+'12':isPaused?C.orange+'20':C.bg2,
          border:`2px solid ${isDone?col:isActive?col:isPaused?C.orange:C.border}`,
          display:'flex',alignItems:'center',justifyContent:'center',
          boxShadow:isActive?`0 0 12px ${col}60`:'none',
        }}>
          {isActive  ? <div style={{width:14,height:14,border:`2.5px solid ${col}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin .75s linear infinite'}}/> :
           isDone    ? <span style={{color:col,fontSize:15,fontWeight:700}}>✓</span> :
           isPaused  ? <span style={{color:C.orange,fontSize:13}}>⏸</span> :
                       <span style={{color:C.textMuted,fontSize:13}}>◌</span>}
        </div>
        <div style={{flex:1}}>
          <div style={{display:'flex',alignItems:'center',gap:8,flexWrap:'wrap'}}>
            <span style={{fontSize:14,fontWeight:600,color:isDone||isActive?col:isPaused?C.orange:C.textMuted}}>
              {m.label || task.agent_type}
            </span>
            <span style={{fontSize:10,color:C.textMuted,background:C.bg2,padding:'2px 6px',borderRadius:3,fontFamily:'monospace'}}>{task.id}</span>
            {isActive  && <span style={{fontSize:10,color:col,fontWeight:600,animation:'pulse 1s ease-in-out infinite'}}>● RUNNING</span>}
            {isPaused  && <span style={{fontSize:10,color:C.orange,fontWeight:600}}>⏸ PAUSED</span>}
            {isDone    && <span style={{fontSize:10,color:C.textMuted}}>COMPLETE</span>}
          </div>
          <div style={{fontSize:11,color:C.textMuted,marginTop:2}}>{task.description?.slice(0,100)}</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8,flexShrink:0}}>
          {isDone && output && (
            <>
              <span style={{fontSize:11,color:C.textMuted}}>{output.length.toLocaleString()} chars</span>
              <span style={{color:C.textMuted,fontSize:20,display:'inline-block',transform:expanded?'rotate(180deg)':'none',transition:'transform .2s'}}>⌃</span>
            </>
          )}
          {isPaused && onEditRequest && (
            <button onClick={e=>{e.stopPropagation();onEditRequest()}} style={{
              background:C.orange+'20',border:`1px solid ${C.orange}60`,borderRadius:6,
              color:C.orange,padding:'4px 10px',cursor:'pointer',fontSize:11,fontWeight:600
            }}>Edit Output</button>
          )}
        </div>
      </div>
      {isActive && (
        <div style={{height:2,background:C.bg2,overflow:'hidden'}}>
          <div style={{height:'100%',width:'100%',background:`linear-gradient(90deg,transparent 0%,${col} 50%,transparent 100%)`,backgroundSize:'200% 100%',animation:'shimmer 1.4s ease-in-out infinite'}}/>
        </div>
      )}
      {expanded && (isDone || isPaused) && output && (
        <div style={{padding:'16px 20px',borderTop:`1px solid ${C.border}`,background:C.bg,animation:'fadeUp .25s ease-out'}}>
          <MD text={output}/>
        </div>
      )}
    </div>
  )
}

// ─── Pause approval banner ───────────────────────────────────────────────────
function PauseBanner({ workflowId, currentTaskId, taskOutput, onResumed, onAborted }) {
  const [editedOutput, setEditedOutput] = useState(taskOutput || '')
  const [loading, setLoading] = useState(false)

  const handleResume = async () => {
    setLoading(true)
    try {
      await fetch(`/api/workflows/${workflowId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ edited_output: editedOutput || undefined, task_id: currentTaskId }),
      })
      onResumed()
    } catch (e) {
      setLoading(false)
    }
  }

  const handleAbort = async () => {
    setLoading(true)
    try {
      await fetch(`/api/workflows/${workflowId}/resume`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'abort' }),
      })
      onAborted()
    } catch (e) {
      setLoading(false)
    }
  }

  return (
    <div style={{
      background:`linear-gradient(135deg,${C.bg1},${C.orange}0a)`,
      border:`1px solid ${C.orange}60`,borderRadius:12,padding:20,marginBottom:20,
      animation:'fadeUp .4s ease-out',boxShadow:`0 0 30px ${C.orange}12`,
    }}>
      <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:14}}>
        <div style={{width:40,height:40,borderRadius:'50%',background:C.orange+'20',border:`2px solid ${C.orange}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,boxShadow:`0 0 16px ${C.orange}40`}}>⏸</div>
        <div>
          <div style={{fontSize:15,fontWeight:700,color:C.orange}}>Workflow Paused — Awaiting Approval</div>
          <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>
            Review or edit the last task output, then resume or abort.
          </div>
        </div>
      </div>
      {taskOutput && (
        <div style={{marginBottom:14}}>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:6,textTransform:'uppercase',letterSpacing:'.07em'}}>
            Task output (editable)
          </div>
          <textarea
            value={editedOutput}
            onChange={e => setEditedOutput(e.target.value)}
            style={{
              width:'100%',minHeight:160,background:C.bg2,border:`1px solid ${C.orange}40`,
              borderRadius:8,color:C.text,fontSize:13,padding:'10px 13px',resize:'vertical',
              outline:'none',fontFamily:'inherit',lineHeight:1.6,
            }}
          />
        </div>
      )}
      <div style={{display:'flex',gap:10,justifyContent:'flex-end'}}>
        <button onClick={handleAbort} disabled={loading} style={{
          background:C.red+'15',border:`1px solid ${C.red}50`,borderRadius:7,
          color:C.red,padding:'9px 20px',cursor:'pointer',fontSize:13,fontWeight:600,
        }}>
          ✕ Abort
        </button>
        <button onClick={handleResume} disabled={loading} style={{
          background:`linear-gradient(135deg,${C.orange}28,${C.yellow}18)`,
          border:`1.5px solid ${C.orange}`,borderRadius:7,color:C.orange,
          padding:'9px 24px',cursor:'pointer',fontSize:13,fontWeight:600,
          boxShadow:`0 0 14px ${C.orange}20`,
        }}>
          {loading ? '…' : '▶ Resume'}
        </button>
      </div>
    </div>
  )
}

// ─── Completion view ──────────────────────────────────────────────────────────
function CompletionView({ output, elapsed, tokens, cost, workflowId, linkedInConnected, onLinkedInConnect }) {
  const [copied,        setCopied]        = useState(false)
  const [exportOpen,    setExportOpen]    = useState(false)
  const [liOpen,        setLiOpen]        = useState(false)
  const [liText,        setLiText]        = useState('')
  const [liPosting,     setLiPosting]     = useState(false)
  const [liResult,      setLiResult]      = useState(null)

  // Pre-fill LinkedIn post text when panel opens
  const openLinkedIn = () => {
    if (!liText) {
      // strip markdown, take first ~1200 chars
      const plain = output.replace(/#{1,6}\s/g,'').replace(/\*\*/g,'').replace(/`/g,'').replace(/---+/g,'').trim()
      setLiText(plain.slice(0, 1200) + (plain.length > 1200 ? '…' : ''))
    }
    setLiOpen(p => !p)
  }

  const handleCopy = () => {
    const fallback = () => { const ta=document.createElement('textarea'); ta.value=output; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta) }
    if (navigator.clipboard) navigator.clipboard.writeText(output).catch(fallback)
    else fallback()
    setCopied(true); setTimeout(() => setCopied(false), 2200)
  }

  const handleLinkedInPost = async () => {
    setLiPosting(true); setLiResult(null)
    try {
      const r = await fetch('/api/linkedin/post', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ workflow_id: workflowId, text: liText }),
      })
      const d = await r.json()
      setLiResult(d.success ? { ok:true, msg:'Posted to LinkedIn!' } : { ok:false, msg: d.error || 'Post failed' })
    } catch(e) {
      setLiResult({ ok:false, msg: e.message })
    }
    setLiPosting(false)
  }

  const btnStyle = (color) => ({
    background:`${color}18`, border:`1.5px solid ${color}60`,
    borderRadius:8, color, padding:'9px 16px', cursor:'pointer',
    fontSize:13, fontWeight:600, display:'flex', alignItems:'center', gap:7, transition:'all .2s',
  })

  return (
    <div style={{background:`linear-gradient(135deg,${C.bg1} 0%,${C.green}0a 100%)`,border:`1px solid ${C.green}50`,borderRadius:12,padding:24,animation:'fadeUp .5s ease-out',boxShadow:`0 0 40px ${C.green}12`}}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20,flexWrap:'wrap',gap:10}}>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:44,height:44,borderRadius:'50%',background:C.green+'20',border:`2px solid ${C.green}`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:22,boxShadow:`0 0 20px ${C.green}40`}}>✓</div>
          <div>
            <div style={{fontSize:16,fontWeight:700,color:C.green}}>Workflow Complete</div>
            <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>{elapsed.toFixed(1)}s · {tokens.toLocaleString()} tokens · ${cost.toFixed(4)}</div>
          </div>
        </div>

        <div style={{display:'flex',gap:8,flexWrap:'wrap',alignItems:'center'}}>
          {/* Copy */}
          <button onClick={handleCopy} style={{...btnStyle(copied?C.green:C.textMuted),background:copied?C.green+'20':C.bg2,border:`1.5px solid ${copied?C.green:C.border}`,color:copied?C.green:C.text}}>
            <span style={{fontSize:16}}>{copied?'✓':'⎘'}</span>{copied?'Copied!':'Copy'}
          </button>

          {/* Export dropdown */}
          <div style={{position:'relative'}}>
            <button onClick={() => setExportOpen(p=>!p)} style={{...btnStyle(C.blue)}}>
              ↓ Export
            </button>
            {exportOpen && (
              <div onClick={()=>setExportOpen(false)} style={{position:'absolute',right:0,top:'110%',background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,zIndex:200,minWidth:120,boxShadow:'0 8px 24px #00000040'}}>
                {[['md','Markdown'], ['pdf','PDF'], ['docx','Word (DOCX)']].map(([fmt,label]) => (
                  <a key={fmt}
                     href={`/api/workflows/${workflowId}/export?format=${fmt}`}
                     download
                     style={{display:'block',padding:'10px 18px',color:C.text,textDecoration:'none',fontSize:13,borderBottom:`1px solid ${C.border}`}}
                     onMouseEnter={e=>e.currentTarget.style.color=C.cyan}
                     onMouseLeave={e=>e.currentTarget.style.color=C.text}>
                    {label}
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* LinkedIn */}
          {linkedInConnected
            ? <button onClick={openLinkedIn} style={btnStyle(C.blue)}>
                <span style={{fontWeight:800,fontSize:13}}>in</span> LinkedIn
              </button>
            : <button onClick={onLinkedInConnect} style={btnStyle(C.blue)}>
                <span style={{fontWeight:800,fontSize:13}}>in</span> Connect LinkedIn
              </button>
          }
        </div>
      </div>

      {/* LinkedIn post panel */}
      {liOpen && linkedInConnected && (
        <div style={{background:C.bg2,border:`1px solid ${C.blue}40`,borderRadius:10,padding:16,marginBottom:16,animation:'fadeUp .25s ease-out'}}>
          <div style={{fontSize:12,color:C.textMuted,marginBottom:8}}>
            Edit your post · {liText.length} / 3000 chars
          </div>
          <textarea
            value={liText}
            onChange={e => setLiText(e.target.value)}
            maxLength={3000}
            style={{width:'100%',minHeight:140,background:C.bg1,border:`1px solid ${C.border}`,borderRadius:8,color:C.text,fontSize:13,padding:'10px 12px',resize:'vertical',outline:'none',fontFamily:'inherit',lineHeight:1.6}}
          />
          {liResult && (
            <div style={{fontSize:12,color:liResult.ok?C.green:C.red,marginTop:6}}>{liResult.msg}</div>
          )}
          <div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:10}}>
            <button onClick={()=>{setLiOpen(false);setLiResult(null)}} style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:7,color:C.textMuted,padding:'8px 16px',cursor:'pointer',fontSize:12}}>Cancel</button>
            <button onClick={handleLinkedInPost} disabled={liPosting||!liText.trim()||liResult?.ok} style={{background:`linear-gradient(135deg,${C.blue}28,${C.cyan}18)`,border:`1.5px solid ${C.blue}`,borderRadius:7,color:C.blue,padding:'8px 20px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:liPosting?0.6:1}}>
              {liPosting ? '…' : liResult?.ok ? '✓ Posted' : 'Publish →'}
            </button>
          </div>
        </div>
      )}

      {/* Output */}
      <div style={{background:C.bg,border:`1px solid ${C.border}`,borderRadius:8,padding:'20px 22px',maxHeight:520,overflowY:'auto'}}>
        <MD text={output}/>
      </div>
    </div>
  )
}

// ─── History view ─────────────────────────────────────────────────────────────
function HistoryView({ onLoad, api }) {
  const [workflows, setWorkflows] = useState([])
  const [loading, setLoading] = useState(true)
  const apiFn = api || fetch

  useEffect(() => {
    setLoading(true)
    apiFn('/api/workflows?limit=30')
      .then(r => r.json())
      .then(d => { setWorkflows(d.workflows || []); setLoading(false) })
      .catch(() => setLoading(false))
  }, []) // eslint-disable-line

  const handleRerun = async (workflowId) => {
    const r = await apiFn(`/api/workflows/${workflowId}/rerun`, { method: 'POST' })
    const d = await r.json()
    if (d.workflow_id) alert(`Re-run started: ${d.workflow_id}`)
  }

  const handleSaveTemplate = async (wf) => {
    const name = prompt('Template name:', wf.workflow_name || 'My Template')
    if (!name) return
    await apiFn(`/api/workflows/${wf.workflow_id}/save-template`, {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name, description: wf.user_input.slice(0,80) }),
    })
    alert('Saved as template!')
  }

  const statusColor = s => s === 'completed' ? C.green : s === 'failed' ? C.red : s === 'paused' ? C.orange : C.blue

  if (loading) return (
    <div style={{padding:40,textAlign:'center',color:C.textMuted}}>
      <div style={{width:32,height:32,border:`3px solid ${C.cyan}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin .75s linear infinite',margin:'0 auto 12px'}}/>
      Loading history…
    </div>
  )

  if (!workflows.length) return (
    <div style={{padding:40,textAlign:'center',color:C.textMuted}}>
      <div style={{fontSize:32,marginBottom:12}}>📭</div>
      No workflow history yet. Run a workflow to see it here.
    </div>
  )

  return (
    <div>
      <div style={{fontSize:11,color:C.textMuted,marginBottom:14,textTransform:'uppercase',letterSpacing:'.09em'}}>
        Workflow History · {workflows.length} runs
      </div>
      {workflows.map(wf => (
        <div key={wf.workflow_id} style={{
          background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,
          padding:'14px 18px',marginBottom:10,
          display:'flex',alignItems:'center',gap:14,flexWrap:'wrap',
        }}>
          <div style={{flex:1,minWidth:200}}>
            <div style={{fontSize:13,fontWeight:600,color:C.textBright,marginBottom:4}}>
              {wf.workflow_name || 'Unnamed Workflow'}
            </div>
            <div style={{fontSize:11,color:C.textMuted,marginBottom:4}}>{wf.user_input}</div>
            <div style={{display:'flex',gap:10,flexWrap:'wrap',alignItems:'center'}}>
              <span style={{fontSize:10,color:statusColor(wf.status),background:statusColor(wf.status)+'18',padding:'2px 8px',borderRadius:10,fontWeight:600}}>{wf.status.toUpperCase()}</span>
              <span style={{fontSize:10,color:C.textMuted}}>{wf.task_count} tasks</span>
              {wf.estimated_cost > 0 && <span style={{fontSize:10,color:C.textMuted}}>${wf.estimated_cost.toFixed(4)}</span>}
              <span style={{fontSize:10,color:C.textMuted}}>{new Date(wf.created_at).toLocaleString()}</span>
            </div>
          </div>
          <div style={{display:'flex',gap:8,flexShrink:0}}>
            <button onClick={() => onLoad(wf.workflow_id)} style={{background:C.bg2,border:`1px solid ${C.borderHi}`,borderRadius:6,color:C.text,padding:'6px 12px',cursor:'pointer',fontSize:12}}>View</button>
            {wf.status === 'completed' && (
              <button onClick={() => handleSaveTemplate(wf)} style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:6,color:C.textMuted,padding:'6px 12px',cursor:'pointer',fontSize:12}}>⭐ Save</button>
            )}
            <button onClick={() => handleRerun(wf.workflow_id)} style={{background:`linear-gradient(135deg,${C.cyan}15,${C.blue}10)`,border:`1px solid ${C.cyan}50`,borderRadius:6,color:C.cyan,padding:'6px 12px',cursor:'pointer',fontSize:12,fontWeight:600}}>↺ Re-run</button>
          </div>
        </div>
      ))}
    </div>
  )
}

// ─── Custom agents view ───────────────────────────────────────────────────────
// ─── Gallery Templates (Home screen) ─────────────────────────────────────────
const GALLERY_TEMPLATES = [
  { id:'competitive-analysis', name:'Competitive Analysis', cat:'Research', icon:'◎', color:'var(--blue)',   desc:'Research competitors, analyze market position, strategic recommendations', input:'Conduct a comprehensive competitive analysis of the AI assistant market, identifying key players, their strengths and weaknesses, market share, pricing strategies, and opportunities for differentiation.' },
  { id:'content-pipeline',     name:'Content Pipeline',     cat:'Content',  icon:'◈', color:'var(--purple)', desc:'Research, draft, review, and produce a publish-ready article',           input:'Research the impact of generative AI on software development productivity, write a comprehensive blog post aimed at engineering managers, review it for technical accuracy, then produce the final version.' },
  { id:'data-analysis',        name:'Data Analysis Report', cat:'Analysis', icon:'◉', color:'var(--green)',  desc:'Analyze trends, synthesize insights, executive-ready report',             input:'Analyze current trends in remote work adoption post-2020, including productivity data, employee preferences, company policies, and economic impacts. Write an executive report with strategic recommendations.' },
  { id:'market-research',      name:'Market Research',      cat:'Research', icon:'◎', color:'var(--blue)',   desc:'Deep-dive market sizing, trends, and opportunity analysis',               input:'Research the market opportunity for AI-powered legal tech tools, including market size, key players, regulatory landscape, and growth projections for enterprise clients.' },
  { id:'technical-blog',       name:'Technical Blog Post',  cat:'Content',  icon:'◈', color:'var(--purple)', desc:'Research and write a polished technical article for developers',          input:'Write a technical deep-dive on how vector databases work and why they matter for AI applications, targeting senior software engineers with practical examples.' },
  { id:'api-docs',             name:'API Documentation',    cat:'Code',     icon:'<>', color:'var(--blue)',   desc:'Analyze and produce complete developer documentation for an API',         input:'Create comprehensive developer documentation for a REST API managing user authentication and authorization, including examples, error codes, and security guidance.' },
  { id:'social-campaign',      name:'Social Media Campaign',cat:'Social',   icon:'◈', color:'var(--orange)', desc:'Research and write a multi-platform social media campaign',               input:'Create a social media campaign for a new AI productivity app targeting knowledge workers, with posts for LinkedIn, Twitter, and a supporting blog article.' },
  { id:'legal-review',         name:'Legal Document Review',cat:'Analysis', icon:'⊡', color:'var(--yellow)', desc:'Analyze documents for risk, compliance gaps, and key provisions',         input:'Review a standard SaaS subscription agreement and identify key risks, missing standard protections, liability exposure, and recommended improvements.' },
  { id:'seo-audit',            name:'SEO Content Audit',    cat:'Analysis', icon:'◉', color:'var(--green)',  desc:'Audit content strategy and recommend optimizations',                     input:'Perform an SEO content audit for a B2B SaaS company in the HR tech space, identifying content gaps, keyword opportunities, and quick wins.' },
  { id:'product-prd',          name:'Product Requirements', cat:'Content',  icon:'◈', color:'var(--purple)', desc:'Research user needs and write a complete PRD with acceptance criteria',   input:'Write a product requirements document for a mobile expense tracking app with AI categorization, targeting small business owners. Include user stories and acceptance criteria.' },
  { id:'code-review',          name:'Code Review Report',   cat:'Code',     icon:'<>', color:'var(--blue)',   desc:'Analyze code for bugs, security issues, and best practices',              input:'Review a Python Flask REST API for security vulnerabilities, performance issues, and adherence to best practices. Provide a detailed report with severity ratings and recommendations.' },
  { id:'investor-memo',        name:'Investor Memo',        cat:'Research', icon:'◎', color:'var(--blue)',   desc:'Research market and write a compelling investment memo',                  input:'Write an investor memo for a Series A startup building AI tools for accountants, covering market opportunity, competitive landscape, traction, and use of funds.' },
]

// ─── Loading screen ───────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',height:'100vh',background:'var(--bg0)',gap:16}}>
      <div style={{display:'flex',alignItems:'center',gap:10}}>
        <div style={{width:32,height:32,borderRadius:8,background:'linear-gradient(135deg,var(--primary),var(--accent))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:18}}>⬡</div>
        <span style={{fontSize:22,fontWeight:700,color:'var(--text-bright)',letterSpacing:'.02em'}}>Weave</span>
      </div>
      <div style={{width:32,height:32,border:'3px solid var(--border)',borderTopColor:'var(--primary)',borderRadius:'50%',animation:'spin .8s linear infinite'}}/>
    </div>
  )
}

// ─── Landing page (email OTP only) ───────────────────────────────────────────
function LandingPage() {
  const [email,   setEmail]   = useState('')
  const [code,    setCode]    = useState('')
  const [otpSent, setOtpSent] = useState(false)
  const [err,     setErr]     = useState('')
  const [loading, setLoading] = useState(false)

  const sendOtp = async () => {
    if (!email.trim()) return
    setLoading(true); setErr('')
    const r = await fetch('/api/auth/email/request', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email }),
    })
    const d = await r.json()
    if (d.status === 'otp_sent') {
      setOtpSent(true)
      if (d.dev_code) setCode(d.dev_code) // dev mode only — auto-fills the code
    } else {
      setErr(d.error || 'Failed to send code. Please try again.')
    }
    setLoading(false)
  }

  const verifyOtp = async () => {
    if (code.length < 6) return
    setLoading(true); setErr('')
    const r = await fetch('/api/auth/email/verify', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ email, code }),
    })
    const d = await r.json()
    if (d.token) {
      localStorage.setItem('weave_token', d.token)
      window.location.reload()
    } else {
      setErr(d.error || 'Invalid code. Please try again.')
      setLoading(false)
    }
  }

  const fld = {
    background:'var(--bg2)', border:'1px solid var(--border)', borderRadius:8,
    color:'var(--text)', padding:'12px 14px', width:'100%', outline:'none',
    fontFamily:'inherit', fontSize:15, transition:'border-color .2s',
  }
  const onFocus = e => e.target.style.borderColor = 'var(--primary)'
  const onBlur  = e => e.target.style.borderColor = 'var(--border)'

  return (
    <div style={{minHeight:'100vh', background:'var(--bg0)', display:'flex', flexDirection:'column'}}>
      {/* Nav */}
      <nav style={{padding:'16px 32px', display:'flex', alignItems:'center', borderBottom:'1px solid var(--border)'}}>
        <div style={{display:'flex', alignItems:'center', gap:10}}>
          <div style={{width:30,height:30,borderRadius:7,background:'linear-gradient(135deg,var(--primary),var(--accent))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:16}}>⬡</div>
          <span style={{fontSize:18,fontWeight:700,color:'var(--text-bright)',letterSpacing:'.02em'}}>Weave</span>
        </div>
      </nav>

      {/* Hero + form */}
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'60px 24px',position:'relative',overflow:'hidden'}}>
        {/* Gradient orbs */}
        <div style={{position:'absolute',width:600,height:600,borderRadius:'50%',background:'radial-gradient(circle,var(--primary)08,transparent 70%)',top:-100,left:'50%',transform:'translateX(-50%)',pointerEvents:'none'}}/>
        <div style={{position:'absolute',width:400,height:400,borderRadius:'50%',background:'radial-gradient(circle,var(--accent)06,transparent 70%)',bottom:-50,right:'10%',pointerEvents:'none'}}/>

        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{display:'inline-block',background:'var(--primary-dim)',border:'1px solid var(--primary)',borderRadius:20,padding:'5px 16px',fontSize:11,color:'var(--primary)',fontWeight:600,letterSpacing:'.08em',textTransform:'uppercase',marginBottom:24}}>
            Multi-Agent AI Orchestration
          </div>
          <h1 style={{fontSize:48,fontWeight:800,color:'var(--text-bright)',lineHeight:1.15,marginBottom:16,maxWidth:700,letterSpacing:'-.02em'}}>
            Turn one sentence into<br/>
            <span style={{background:'linear-gradient(135deg,var(--primary),var(--accent))',WebkitBackgroundClip:'text',WebkitTextFillColor:'transparent'}}>
              a complete workflow
            </span>
          </h1>
          <p style={{fontSize:17,color:'var(--text-muted)',maxWidth:520,lineHeight:1.7,margin:'0 auto'}}>
            Weave decomposes your goal into a parallel DAG of specialized agents — researcher, writer, reviewer — and delivers a polished result automatically.
          </p>
        </div>

        {/* Auth card */}
        <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:16,padding:'32px 28px',width:'100%',maxWidth:380,boxShadow:'0 8px 40px #00000020'}}>
          {!otpSent ? (
            <>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text-bright)',marginBottom:6}}>Sign in to Weave</div>
              <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:22}}>Enter your email — we'll send you a one-time code.</div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.07em'}}>Email address</div>
                <input
                  value={email} onChange={e=>setEmail(e.target.value)}
                  placeholder="you@example.com" type="email"
                  style={fld} onFocus={onFocus} onBlur={onBlur}
                  onKeyDown={e=>e.key==='Enter'&&sendOtp()}
                  autoFocus
                />
              </div>
              <button onClick={sendOtp} disabled={!email.trim()||loading} style={{
                width:'100%',background:'var(--primary)',border:'none',borderRadius:8,
                color:'white',padding:'13px',cursor:'pointer',fontSize:14,fontWeight:600,
                opacity:!email.trim()||loading ? .5 : 1, transition:'opacity .15s',
              }}>
                {loading ? 'Sending…' : 'Send Code →'}
              </button>
            </>
          ) : (
            <>
              <div style={{fontSize:16,fontWeight:700,color:'var(--text-bright)',marginBottom:6}}>Check your email</div>
              <div style={{fontSize:13,color:'var(--text-muted)',marginBottom:22}}>
                We sent a 6-digit code to <strong style={{color:'var(--text)'}}>{email}</strong>
              </div>
              <div style={{marginBottom:14}}>
                <div style={{fontSize:11,color:'var(--text-muted)',marginBottom:6,textTransform:'uppercase',letterSpacing:'.07em'}}>6-digit code</div>
                <input
                  value={code} onChange={e=>setCode(e.target.value.replace(/\D/,'').slice(0,6))}
                  placeholder="123456" maxLength={6}
                  style={{...fld, fontSize:24, fontWeight:700, letterSpacing:8, textAlign:'center'}}
                  onFocus={onFocus} onBlur={onBlur}
                  onKeyDown={e=>e.key==='Enter'&&verifyOtp()}
                  autoFocus
                />
              </div>
              <button onClick={verifyOtp} disabled={code.length<6||loading} style={{
                width:'100%',background:'var(--primary)',border:'none',borderRadius:8,
                color:'white',padding:'13px',cursor:'pointer',fontSize:14,fontWeight:600,
                opacity:code.length<6||loading ? .5 : 1, transition:'opacity .15s',
              }}>
                {loading ? 'Verifying…' : 'Sign In →'}
              </button>
              <button onClick={()=>{setOtpSent(false);setCode('');setErr('')}} style={{
                marginTop:12,background:'transparent',border:'none',
                color:'var(--text-muted)',fontSize:12,cursor:'pointer',
                width:'100%',textAlign:'center',
              }}>
                ← Use a different email
              </button>
            </>
          )}
          {err && (
            <div style={{marginTop:12,fontSize:12,color:'var(--red)',textAlign:'center'}}>{err}</div>
          )}
        </div>
      </div>

      {/* Feature strip */}
      <div style={{borderTop:'1px solid var(--border)',padding:'28px 24px',display:'flex',justifyContent:'center',gap:40,flexWrap:'wrap'}}>
        {[
          ['⚡','Parallel Execution','Multiple agents run simultaneously in waves'],
          ['◎','Human-in-the-Loop','Pause, review, and edit at any step'],
          ['◈','Any Output Format','Export as Markdown, PDF, or DOCX'],
        ].map(([icon,title,desc])=>(
          <div key={title} style={{textAlign:'center',maxWidth:180}}>
            <div style={{fontSize:22,marginBottom:6,color:'var(--primary)'}}>{icon}</div>
            <div style={{fontSize:13,fontWeight:600,color:'var(--text-bright)',marginBottom:3}}>{title}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',lineHeight:1.5}}>{desc}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────
function Sidebar({ view, setView, user, collapsed, setCollapsed, onLogout }) {
  const navItems = [
    { id:'home',     icon:'⊞', label:'Home'     },
    { id:'run',      icon:'▶', label:'New Run'  },
    { id:'history',  icon:'↺', label:'History'  },
    { id:'agents',   icon:'◈', label:'Agents'   },
    ...(user?.is_admin ? [{ id:'admin', icon:'⚙', label:'Admin' }] : []),
  ]
  const w = collapsed ? 58 : 220

  const item = (id, icon, label) => {
    const active = view === id
    return (
      <button key={id} onClick={()=>setView(id)} title={collapsed?label:''} style={{
        display:'flex',alignItems:'center',gap:10,width:'100%',
        background:active?'var(--primary-dim)':'transparent',
        border:`1px solid ${active?'var(--primary)':'transparent'}`,
        borderRadius:8,padding:collapsed?'10px 0':'10px 12px',
        justifyContent:collapsed?'center':'flex-start',
        color:active?'var(--primary)':'var(--text-muted)',
        cursor:'pointer',fontSize:13,fontWeight:active?600:400,
        transition:'all .15s', marginBottom:2,
      }}
      onMouseEnter={e=>{if(!active){e.currentTarget.style.background='var(--bg3)';e.currentTarget.style.color='var(--text)'}}}
      onMouseLeave={e=>{if(!active){e.currentTarget.style.background='transparent';e.currentTarget.style.color='var(--text-muted)'}}}>
        <span style={{fontSize:16,flexShrink:0}}>{icon}</span>
        {!collapsed && <span>{label}</span>}
      </button>
    )
  }

  return (
    <div style={{
      width:w, minHeight:'100vh', flexShrink:0,
      background:'var(--bg1)', borderRight:'1px solid var(--border)',
      display:'flex', flexDirection:'column',
      transition:'width .2s ease', overflow:'hidden',
    }}>
      {/* Logo */}
      <div style={{padding:collapsed?'16px 0':'16px',display:'flex',alignItems:'center',gap:10,borderBottom:'1px solid var(--border)',justifyContent:collapsed?'center':'flex-start',cursor:'pointer'}} onClick={()=>setCollapsed(c=>!c)}>
        <div style={{width:28,height:28,borderRadius:7,background:'linear-gradient(135deg,var(--primary),var(--accent))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:15,flexShrink:0}}>⬡</div>
        {!collapsed && <span style={{fontSize:16,fontWeight:700,color:'var(--text-bright)',letterSpacing:'.02em'}}>Weave</span>}
      </div>

      {/* Nav */}
      <nav style={{flex:1,padding:collapsed?'12px 8px':'12px'}}>
        {navItems.map(n => item(n.id, n.icon, n.label))}
      </nav>

      {/* Bottom */}
      <div style={{borderTop:'1px solid var(--border)',padding:collapsed?'12px 8px':'12px'}}>
        {item('settings','⚙','Settings')}
        {/* User */}
        <div style={{display:'flex',alignItems:'center',gap:8,padding:collapsed?'10px 0':'10px 12px',justifyContent:collapsed?'center':'flex-start',marginTop:4}}>
          <div style={{width:28,height:28,borderRadius:'50%',background:'linear-gradient(135deg,var(--primary),var(--accent))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:12,fontWeight:700,color:'white',flexShrink:0}}>
            {user?.name?.[0]?.toUpperCase()||'U'}
          </div>
          {!collapsed && (
            <div style={{flex:1,overflow:'hidden'}}>
              <div style={{fontSize:12,fontWeight:600,color:'var(--text-bright)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.name||'User'}</div>
              <div style={{fontSize:10,color:'var(--text-muted)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{user?.email||''}</div>
            </div>
          )}
        </div>
        <button onClick={onLogout} title={collapsed?'Logout':''} style={{
          display:'flex',alignItems:'center',gap:8,width:'100%',
          background:'transparent',border:'1px solid transparent',borderRadius:8,
          padding:collapsed?'8px 0':'8px 12px',justifyContent:collapsed?'center':'flex-start',
          color:'var(--text-muted)',cursor:'pointer',fontSize:12,
          transition:'all .15s',
        }}
        onMouseEnter={e=>{e.currentTarget.style.color='var(--red)';e.currentTarget.style.background='var(--red)10'}}
        onMouseLeave={e=>{e.currentTarget.style.color='var(--text-muted)';e.currentTarget.style.background='transparent'}}>
          <span>⇥</span>{!collapsed&&<span>Logout</span>}
        </button>
      </div>
    </div>
  )
}

// ─── Home view (template gallery) ────────────────────────────────────────────
function HomeView({ api, user, onRun }) {
  const [cat, setCat]       = useState('All')
  const [recent, setRecent] = useState([])
  const hour = new Date().getHours()
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'
  const firstName = user?.name?.split(' ')[0] || 'there'

  useEffect(() => {
    api('/api/workflows?limit=5').then(r=>r.json()).then(d=>setRecent(d.workflows||[])).catch(()=>{})
  }, [api])

  const cats = ['All','Research','Content','Analysis','Code','Social']
  const filtered = cat === 'All' ? GALLERY_TEMPLATES : GALLERY_TEMPLATES.filter(t=>t.cat===cat)

  const statusColor = { completed:'var(--green)', failed:'var(--red)', running:'var(--orange)' }

  return (
    <div style={{padding:'32px 36px',maxWidth:960,animation:'fadeUp .25s ease-out'}}>
      <div style={{marginBottom:32}}>
        <h1 style={{fontSize:26,fontWeight:700,color:'var(--text-bright)',marginBottom:6}}>{greeting}, {firstName}</h1>
        <p style={{fontSize:14,color:'var(--text-muted)'}}>What would you like to accomplish today?</p>
      </div>

      {/* Category filter */}
      <div style={{display:'flex',gap:6,marginBottom:20,flexWrap:'wrap'}}>
        {cats.map(c=>(
          <button key={c} onClick={()=>setCat(c)} style={{
            background:cat===c?'var(--primary)':'var(--bg2)',
            border:`1px solid ${cat===c?'var(--primary)':'var(--border)'}`,
            borderRadius:20,color:cat===c?'white':'var(--text-muted)',
            padding:'5px 14px',cursor:'pointer',fontSize:12,fontWeight:cat===c?600:400,transition:'all .15s',
          }}>{c}</button>
        ))}
      </div>

      {/* Template grid */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(240px,1fr))',gap:14,marginBottom:36}}>
        {filtered.map(tpl=>(
          <div key={tpl.id} style={{background:'var(--bg1)',border:'1.5px solid var(--border)',borderRadius:14,padding:'18px',cursor:'pointer',transition:'all .2s'}}
            onMouseEnter={e=>{e.currentTarget.style.borderColor=tpl.color;e.currentTarget.style.transform='translateY(-2px)';e.currentTarget.style.boxShadow=`0 8px 24px ${tpl.color}18`}}
            onMouseLeave={e=>{e.currentTarget.style.borderColor='var(--border)';e.currentTarget.style.transform='translateY(0)';e.currentTarget.style.boxShadow='none'}}
            onClick={()=>onRun(tpl.input)}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
              <div style={{width:36,height:36,borderRadius:9,background:tpl.color+'18',border:`1px solid ${tpl.color}40`,display:'flex',alignItems:'center',justifyContent:'center',fontSize:18,color:tpl.color}}>{tpl.icon}</div>
              <span style={{fontSize:10,fontWeight:600,color:tpl.color,background:tpl.color+'15',border:`1px solid ${tpl.color}30`,borderRadius:10,padding:'2px 8px',textTransform:'uppercase',letterSpacing:'.06em'}}>{tpl.cat}</span>
            </div>
            <div style={{fontSize:14,fontWeight:600,color:'var(--text-bright)',marginBottom:6}}>{tpl.name}</div>
            <div style={{fontSize:12,color:'var(--text-muted)',lineHeight:1.5,marginBottom:12}}>{tpl.desc}</div>
            <div style={{fontSize:11,color:tpl.color,fontWeight:600}}>Use template →</div>
          </div>
        ))}
      </div>

      {/* Recent runs */}
      {recent.length > 0 && (
        <div>
          <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:12}}>Recent Runs</div>
          {recent.map(wf=>(
            <div key={wf.workflow_id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:8,marginBottom:6}}>
              <div style={{width:8,height:8,borderRadius:'50%',background:statusColor[wf.status]||'var(--text-muted)',flexShrink:0}}/>
              <div style={{flex:1,overflow:'hidden'}}>
                <div style={{fontSize:13,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{wf.workflow_name||wf.user_input?.slice(0,60)||'Untitled'}</div>
                <div style={{fontSize:11,color:'var(--text-muted)'}}>{wf.created_at?.slice(0,10)} · {wf.task_count} tasks · ${(wf.estimated_cost||0).toFixed(4)}</div>
              </div>
              <span style={{fontSize:11,color:statusColor[wf.status]||'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.05em'}}>{wf.status}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Admin view ───────────────────────────────────────────────────────────────
function AdminView({ api }) {
  const [stats,    setStats]    = useState(null)
  const [users,    setUsers]    = useState([])
  const [wfs,      setWfs]      = useState([])
  const [audit,    setAudit]    = useState([])
  const [tab,      setTab]      = useState('overview')

  const load = useCallback(() => {
    api('/api/admin/stats').then(r=>r.json()).then(setStats).catch(()=>{})
    api('/api/admin/users?limit=20').then(r=>r.json()).then(d=>setUsers(d.users||[])).catch(()=>{})
    api('/api/admin/workflows?limit=20').then(r=>r.json()).then(d=>setWfs(d.workflows||[])).catch(()=>{})
    api('/api/admin/audit-log?limit=30').then(r=>r.json()).then(d=>setAudit(d.events||[])).catch(()=>{})
  }, [api])

  useEffect(()=>{ load(); const t=setInterval(load,30000); return ()=>clearInterval(t) }, [load])

  const statCard = (label, value, color='var(--text-bright)') => (
    <div key={label} style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:12,padding:'20px 22px',flex:1,minWidth:140}}>
      <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:8}}>{label}</div>
      <div style={{fontSize:26,fontWeight:700,color}}>{value??'—'}</div>
    </div>
  )

  const tabs = ['overview','users','workflows','audit']

  return (
    <div style={{padding:'32px 36px',maxWidth:1100,animation:'fadeUp .25s ease-out'}}>
      <div style={{marginBottom:24}}>
        <h1 style={{fontSize:22,fontWeight:700,color:'var(--text-bright)',marginBottom:4}}>Admin Dashboard</h1>
        <p style={{fontSize:13,color:'var(--text-muted)'}}>Real-time platform analytics and user management</p>
      </div>

      {/* Tab strip */}
      <div style={{display:'flex',gap:4,background:'var(--bg2)',borderRadius:8,padding:3,marginBottom:24,width:'fit-content'}}>
        {tabs.map(t=>(
          <button key={t} onClick={()=>setTab(t)} style={{background:tab===t?'var(--bg1)':'transparent',border:`1px solid ${tab===t?'var(--border-hi)':'transparent'}`,borderRadius:6,color:tab===t?'var(--text-bright)':'var(--text-muted)',padding:'6px 16px',cursor:'pointer',fontSize:12,fontWeight:tab===t?600:400,textTransform:'capitalize'}}>{t}</button>
        ))}
      </div>

      {tab==='overview' && stats && (
        <>
          <div style={{display:'flex',gap:12,flexWrap:'wrap',marginBottom:24}}>
            {statCard('Total Users',stats.total_users,'var(--primary)')}
            {statCard('Total Workflows',stats.total_workflows,'var(--accent)')}
            {statCard('Success Rate',`${stats.success_rate}%`,'var(--green)')}
            {statCard('Total Cost',`$${stats.total_cost}`,'var(--orange)')}
            {statCard('Total Tokens',stats.total_tokens?.toLocaleString(),'var(--blue)')}
          </div>
          {stats.daily_workflows?.length > 0 && (
            <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:12,padding:20}}>
              <div style={{fontSize:12,color:'var(--text-muted)',marginBottom:12,textTransform:'uppercase',letterSpacing:'.08em'}}>Daily Workflow Runs (last 14 days)</div>
              <div style={{display:'flex',alignItems:'flex-end',gap:6,height:80}}>
                {stats.daily_workflows.map(d=>{
                  const max = Math.max(...stats.daily_workflows.map(x=>x.count),1)
                  const h = Math.max(4, (d.count/max)*72)
                  return <div key={d.day} title={`${d.day}: ${d.count}`} style={{flex:1,height:h,background:'var(--primary)',borderRadius:4,opacity:.8,minWidth:8,transition:'height .3s'}}/>
                })}
              </div>
            </div>
          )}
        </>
      )}

      {tab==='users' && (
        <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
              {['Name','Email','Provider','Workflows','Last Seen'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',fontSize:10}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{users.map(u=>(
              <tr key={u.user_id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',color:'var(--text-bright)',fontWeight:600}}>{u.name}{u.is_admin?<span style={{marginLeft:6,fontSize:9,color:'var(--primary)',background:'var(--primary-dim)',padding:'1px 5px',borderRadius:3}}>admin</span>:null}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>{u.email}</td>
                <td style={{padding:'10px 14px',color:'var(--accent)',textTransform:'capitalize'}}>{u.provider}</td>
                <td style={{padding:'10px 14px',color:'var(--text)'}}>{u.workflow_count||0}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>{u.last_seen_at?.slice(0,16)||'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab==='workflows' && (
        <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
              {['Workflow','Status','Tasks','Cost','Created'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',fontSize:10}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{wfs.map(w=>(
              <tr key={w.workflow_id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',color:'var(--text)',maxWidth:300,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{w.workflow_name||w.user_input?.slice(0,40)||'—'}</td>
                <td style={{padding:'10px 14px'}}><span style={{fontSize:10,fontWeight:600,color:w.status==='completed'?'var(--green)':w.status==='failed'?'var(--red)':'var(--orange)',textTransform:'uppercase'}}>{w.status}</span></td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>{w.task_count}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>${(w.estimated_cost||0).toFixed(4)}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>{w.created_at?.slice(0,16)||'—'}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}

      {tab==='audit' && (
        <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:12,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{borderBottom:'1px solid var(--border)',background:'var(--bg2)'}}>
              {['Event','User','Details','Time'].map(h=>(
                <th key={h} style={{padding:'10px 14px',textAlign:'left',color:'var(--text-muted)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.07em',fontSize:10}}>{h}</th>
              ))}
            </tr></thead>
            <tbody>{audit.map(e=>(
              <tr key={e.id} style={{borderBottom:'1px solid var(--border)'}}>
                <td style={{padding:'10px 14px',color:'var(--accent)',fontWeight:600,fontFamily:'monospace',fontSize:11}}>{e.event_type}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)',fontSize:10,fontFamily:'monospace'}}>{e.user_id?.slice(0,8)||'—'}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)',maxWidth:280,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{e.details}</td>
                <td style={{padding:'10px 14px',color:'var(--text-muted)'}}>{e.created_at?.slice(0,16)}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ─── Settings view ────────────────────────────────────────────────────────────
function SettingsView({ user, theme, setTheme, onLogout, api }) {
  const [health, setHealth] = useState(null)
  useEffect(()=>{ fetch('/api/health').then(r=>r.json()).then(setHealth).catch(()=>{}) }, [])

  return (
    <div style={{padding:'32px 36px',maxWidth:560,animation:'fadeUp .25s ease-out'}}>
      <h1 style={{fontSize:22,fontWeight:700,color:'var(--text-bright)',marginBottom:28}}>Settings</h1>

      {/* Profile */}
      <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:14,padding:20,marginBottom:16}}>
        <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:14}}>Profile</div>
        <div style={{display:'flex',alignItems:'center',gap:14}}>
          <div style={{width:48,height:48,borderRadius:'50%',background:'linear-gradient(135deg,var(--primary),var(--accent))',display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,fontWeight:700,color:'white'}}>
            {user?.name?.[0]?.toUpperCase()||'U'}
          </div>
          <div>
            <div style={{fontSize:15,fontWeight:600,color:'var(--text-bright)'}}>{user?.name}</div>
            <div style={{fontSize:12,color:'var(--text-muted)'}}>{user?.email}</div>
            <div style={{fontSize:11,color:'var(--text-muted)',marginTop:2}}>Provider: {user?.provider} {user?.is_admin?'· Admin':''}</div>
          </div>
        </div>
      </div>

      {/* Theme */}
      <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:14,padding:20,marginBottom:16}}>
        <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:14}}>Appearance</div>
        <div style={{display:'flex',gap:8}}>
          {[['dark','◑ Dark'],['light','○ Light'],['auto','⬡ Auto']].map(([v,l])=>(
            <button key={v} onClick={()=>setTheme(v)} style={{flex:1,background:theme===v?'var(--primary-dim)':'var(--bg2)',border:`1.5px solid ${theme===v?'var(--primary)':'var(--border)'}`,borderRadius:8,color:theme===v?'var(--primary)':'var(--text-muted)',padding:'10px',cursor:'pointer',fontSize:13,fontWeight:theme===v?600:400}}>
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* LLM provider */}
      {health && (
        <div style={{background:'var(--bg1)',border:'1px solid var(--border)',borderRadius:14,padding:20,marginBottom:16}}>
          <div style={{fontSize:11,color:'var(--text-muted)',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:12}}>AI Provider</div>
          <div style={{display:'flex',gap:16}}>
            <div><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Provider</div><div style={{fontSize:14,fontWeight:600,color:'var(--accent)'}}>{health.provider?.toUpperCase()}</div></div>
            <div><div style={{fontSize:10,color:'var(--text-muted)',marginBottom:2}}>Model</div><div style={{fontSize:14,fontWeight:600,color:'var(--text)'}}>{health.model||'—'}</div></div>
          </div>
        </div>
      )}

      {/* Danger zone */}
      <div style={{background:'var(--bg1)',border:'1px solid var(--red)30',borderRadius:14,padding:20}}>
        <div style={{fontSize:11,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.09em',marginBottom:14}}>Danger Zone</div>
        <button onClick={onLogout} style={{background:'var(--red)15',border:'1px solid var(--red)50',borderRadius:8,color:'var(--red)',padding:'9px 20px',cursor:'pointer',fontSize:13,fontWeight:600}}>
          Sign out
        </button>
      </div>
    </div>
  )
}

// ─── Agent Templates ──────────────────────────────────────────────────────────
const AGENT_TEMPLATES = [
  { id:'tpl-summarizer',  name:'Summarizer',          icon:'◈', color:C.blue,   temp:0.3,
    desc:'Condense content into clear, structured summaries',
    prompt:"You are a precise summarization agent. When given any text, produce a structured summary with: (1) a 2–3 sentence executive summary, (2) 3–7 key bullet points, and (3) any important caveats or limitations. Be concise but complete — never omit critical information." },
  { id:'tpl-translator',  name:'Translator',           icon:'◎', color:C.cyan,   temp:0.2,
    desc:'Translate with linguistic and cultural accuracy',
    prompt:"You are a professional translator with deep expertise in linguistics and cultural context. Translate content accurately while preserving tone, intent, and cultural nuances. When idioms don't translate directly, provide the closest equivalent and note the original. Maintain the source's formatting and structure." },
  { id:'tpl-analyst',     name:'Data Analyst',         icon:'◉', color:C.green,  temp:0.3,
    desc:'Identify patterns, trends, and business insights',
    prompt:"You are an expert data analyst. When given data or research findings, identify significant patterns, anomalies, and correlations. Structure your output: Key Findings → Supporting Data → Business Implications → Recommended Actions. Frame all insights in terms of measurable impact." },
  { id:'tpl-social',      name:'Social Media Writer',  icon:'◈', color:C.purple, temp:0.8,
    desc:'Craft engaging, platform-native social content',
    prompt:"You are a social media strategist and copywriter. Transform information into engaging, platform-native content. For LinkedIn: professional, insight-driven, readable line breaks, end with a question or CTA. For Twitter/X: punchy and conversational. Include hashtag suggestions. Optimize for engagement while maintaining authenticity." },
  { id:'tpl-devil',       name:"Devil's Advocate",     icon:'◇', color:C.orange, temp:0.7,
    desc:'Challenge assumptions and stress-test ideas',
    prompt:"You are a critical thinking agent. For any proposal or argument, (1) identify the 3–5 strongest counter-arguments, (2) expose unstated assumptions and hidden risks, (3) present alternative interpretations of evidence, (4) surface edge cases and failure scenarios. Be direct, specific, and rigorous — your goal is to strengthen thinking, not to be negative." },
  { id:'tpl-legal',       name:'Legal Reviewer',       icon:'⊡', color:C.yellow, temp:0.2,
    desc:'Flag legal risks and compliance gaps',
    prompt:"You are a legal risk assessment agent. Review documents for: (1) liability exposure, (2) ambiguous language that could be interpreted unfavorably, (3) missing standard protections, (4) regulatory compliance gaps, (5) IP concerns. For each issue: explain the risk, rate severity (High/Medium/Low), and suggest a remedy. Note: this is not legal advice — always consult qualified counsel." },
  { id:'tpl-code',        name:'Code Generator',       icon:'<>', color:C.blue,   temp:0.4,
    desc:'Write clean, documented, production-ready code',
    prompt:"You are an expert software engineer. Write clean, idiomatic, production-ready code with clear variable names and concise inline comments for non-obvious logic. Include a brief usage example and note any dependencies. State your assumptions when requirements are ambiguous. Prioritize security, performance, and maintainability." },
  { id:'tpl-email',       name:'Email Drafter',        icon:'✉', color:C.purple, temp:0.6,
    desc:'Write professional, effective business emails',
    prompt:"You are a business communication specialist. Draft professional emails: compelling subject line, brief context, clear message, specific next steps, appropriate sign-off. Match tone to context (formal for executives, warm for clients, direct for internal teams). Avoid filler phrases and passive voice. Every email should have exactly one clear call to action." },
]

// ─── Quality Hints ────────────────────────────────────────────────────────────
function computeHints(prompt) {
  if (!prompt || prompt.length < 10) return []
  const hints = []
  const p = prompt.toLowerCase()
  if (prompt.length < 60)
    hints.push({ level:'warn', text:'Very short — add specific instructions about what the agent should do.' })
  if (!p.includes('you are'))
    hints.push({ level:'warn', text:'Define a role: start with "You are a [role]…"' })
  if (!p.includes('output') && !p.includes('format') && !p.includes('structure') && !p.includes('produce') && !p.includes('write') && !p.includes('return'))
    hints.push({ level:'info', text:'Specify the output format or structure for consistent results.' })
  if (prompt.length > 100 && (p.includes('step') || p.includes('1.') || p.includes('(1)')))
    hints.push({ level:'ok', text:'Numbered steps detected — great for guiding structured output.' })
  if (prompt.length > 200)
    hints.push({ level:'ok', text:'Detailed prompt — more context generally leads to better results.' })
  if (p.includes('example') || p.includes('for instance') || p.includes('e.g.'))
    hints.push({ level:'ok', text:'Examples in your prompt help the agent calibrate its output.' })
  return hints
}

// ─── Agents View ──────────────────────────────────────────────────────────────
function AgentsView({ api }) {
  const apiFn = api || fetch
  const [agents, setAgents]     = useState([])
  const [mode, setMode]         = useState('templates') // 'templates'|'wizard'|'expert'

  // Shared creation form
  const [name, setName]         = useState('')
  const [prompt, setPrompt]     = useState('')
  const [temp, setTemp]         = useState(0.5)
  const [saving, setSaving]     = useState(false)

  // Wizard state
  const [wizStep, setWizStep]   = useState(0)
  const [wizData, setWizData]   = useState({ purpose:'', context:'', output:'', tone:'professional' })
  const [generating, setGenerating] = useState(false)
  const [wizDone, setWizDone]   = useState(false)

  // Test panel
  const [testOpen, setTestOpen] = useState(false)
  const [testInput, setTestInput] = useState('')
  const [testResult, setTestResult] = useState(null)
  const [testing, setTesting]   = useState(false)

  const fld = { background:C.bg2, border:`1px solid ${C.border}`, borderRadius:8, color:C.text,
    padding:'9px 12px', width:'100%', outline:'none', fontFamily:'inherit', fontSize:13 }

  const load = useCallback(() => {
    apiFn('/api/agents').then(r=>r.json()).then(d => setAgents(d.agents||[]))
  }, []) // eslint-disable-line
  useEffect(() => { load() }, [load])

  const handleSave = async () => {
    if (!name.trim() || !prompt.trim()) return
    setSaving(true)
    await apiFn('/api/agents', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ name:name.trim(), system_prompt:prompt.trim(), temperature:temp }),
    })
    setName(''); setPrompt(''); setTemp(0.5)
    setTestResult(null); setTestInput(''); setWizDone(false)
    setWizStep(0); setWizData({ purpose:'', context:'', output:'', tone:'professional' })
    setSaving(false); load()
  }

  const handleDelete = async (id) => {
    if (!confirm('Delete this custom agent?')) return
    await apiFn(`/api/agents/${id}`, { method:'DELETE' })
    load()
  }

  const applyTemplate = (tpl) => {
    setName(tpl.name); setPrompt(tpl.prompt); setTemp(tpl.temp)
    setTestResult(null); setMode('expert')
  }

  const runWizard = async () => {
    if (!wizData.purpose.trim()) return
    setGenerating(true)
    try {
      const r = await apiFn('/api/agents/generate-prompt', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify(wizData),
      })
      const d = await r.json()
      if (d.system_prompt) {
        setPrompt(d.system_prompt)
        if (!name.trim()) setName(wizData.purpose.slice(0,40).trim())
        setWizDone(true)
      }
    } finally { setGenerating(false) }
  }

  const runTest = async () => {
    if (!prompt.trim() || !testInput.trim()) return
    setTesting(true); setTestResult(null)
    try {
      const r = await apiFn('/api/agents/test', {
        method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ system_prompt:prompt.trim(), test_input:testInput.trim(), temperature:temp }),
      })
      setTestResult(await r.json())
    } finally { setTesting(false) }
  }

  const hints = computeHints(prompt)
  const canSave = name.trim() && prompt.trim()

  const hintColor = { ok:C.green, warn:C.orange, info:C.cyan }

  // ── Wizard steps ─────────────────────────────────────────────────────────
  const TONES = ['professional','creative','analytical','critical','friendly','technical','formal','casual']
  const WIZ_STEPS = [
    { label:'Purpose',   q:'What does this agent do?',             key:'purpose',  ph:'e.g. Summarize long documents into executive briefs' },
    { label:'Input',     q:'What context will it receive?',        key:'context',  ph:'e.g. Research reports, articles, meeting transcripts' },
    { label:'Output',    q:'What should it produce?',              key:'output',   ph:'e.g. Bullet-point summary with key findings and risks' },
    { label:'Tone',      q:'Choose the behavioral tone',           key:'tone',     ph:'' },
  ]

  return (
    <div style={{animation:'fadeUp .25s ease-out',padding:'32px 36px',maxWidth:640}}>

      {/* ── Mode tabs ───────────────────────────────────────────────────── */}
      <div style={{display:'flex',gap:4,background:C.bg2,borderRadius:8,padding:3,marginBottom:20,width:'fit-content'}}>
        {[['templates','From Template'],['wizard','AI Wizard'],['expert','Expert']].map(([id,label]) => (
          <button key={id} onClick={()=>{setMode(id);setWizDone(false)}} style={{
            background:mode===id?C.bg1:'transparent',
            border:`1px solid ${mode===id?C.borderHi:'transparent'}`,
            borderRadius:6, color:mode===id?C.textBright:C.textMuted,
            padding:'6px 16px', cursor:'pointer', fontSize:12, fontWeight:mode===id?600:400,
          }}>{label}</button>
        ))}
      </div>

      {/* ── TEMPLATES MODE ─────────────────────────────────────────────── */}
      {mode==='templates' && (
        <div>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:12,textTransform:'uppercase',letterSpacing:'.09em'}}>
            Pick a starting point — then customise in Expert mode
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))',gap:10}}>
            {AGENT_TEMPLATES.map(tpl => (
              <button key={tpl.id} onClick={()=>applyTemplate(tpl)} style={{
                background:C.bg1, border:`1.5px solid ${C.border}`, borderRadius:12,
                padding:'14px 16px', cursor:'pointer', textAlign:'left',
                transition:'all .15s',
              }}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=tpl.color;e.currentTarget.style.background=tpl.color+'12'}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.background=C.bg1}}>
                <div style={{fontSize:20,marginBottom:8,color:tpl.color}}>{tpl.icon}</div>
                <div style={{fontSize:13,fontWeight:600,color:C.textBright,marginBottom:4}}>{tpl.name}</div>
                <div style={{fontSize:11,color:C.textMuted,lineHeight:1.5}}>{tpl.desc}</div>
                <div style={{fontSize:10,color:tpl.color,marginTop:8}}>t={tpl.temp} · Use template →</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── WIZARD MODE ────────────────────────────────────────────────── */}
      {mode==='wizard' && !wizDone && (
        <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,padding:24,maxWidth:560}}>
          {/* Progress bar */}
          <div style={{display:'flex',gap:6,marginBottom:24}}>
            {WIZ_STEPS.map((s,i)=>(
              <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:4}}>
                <div style={{
                  width:26,height:26,borderRadius:'50%',fontSize:11,fontWeight:600,
                  display:'flex',alignItems:'center',justifyContent:'center',
                  background:i<wizStep?C.green:i===wizStep?C.cyan:C.bg2,
                  color:i<=wizStep?C.bg:'#4a6a8a',
                  border:`1.5px solid ${i<wizStep?C.green:i===wizStep?C.cyan:C.border}`,
                  transition:'all .2s',
                }}>{i<wizStep?'✓':i+1}</div>
                <div style={{fontSize:9,color:i===wizStep?C.cyan:C.textMuted,textTransform:'uppercase',letterSpacing:'.07em'}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Current step */}
          <div style={{fontSize:15,fontWeight:600,color:C.textBright,marginBottom:12}}>{WIZ_STEPS[wizStep].q}</div>

          {WIZ_STEPS[wizStep].key === 'tone' ? (
            <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:20}}>
              {TONES.map(t=>(
                <button key={t} onClick={()=>setWizData(p=>({...p,tone:t}))} style={{
                  background:wizData.tone===t?C.cyan+'18':C.bg2,
                  border:`1.5px solid ${wizData.tone===t?C.cyan:C.border}`,
                  borderRadius:20, color:wizData.tone===t?C.cyan:C.text,
                  padding:'6px 14px', cursor:'pointer', fontSize:12, textTransform:'capitalize',
                }}>{t}</button>
              ))}
            </div>
          ) : (
            <input
              value={wizData[WIZ_STEPS[wizStep].key]}
              onChange={e=>setWizData(p=>({...p,[WIZ_STEPS[wizStep].key]:e.target.value}))}
              placeholder={WIZ_STEPS[wizStep].ph}
              onKeyDown={e=>{ if(e.key==='Enter'&&wizStep<3) setWizStep(s=>s+1) }}
              autoFocus
              style={{...fld, marginBottom:20}}
            />
          )}

          <div style={{display:'flex',justifyContent:'space-between'}}>
            <button onClick={()=>setWizStep(s=>Math.max(0,s-1))} disabled={wizStep===0}
              style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:7,color:C.textMuted,padding:'8px 20px',cursor:wizStep===0?'not-allowed':'pointer',fontSize:13,opacity:wizStep===0?.3:1}}>
              ← Back
            </button>
            {wizStep < 3 ? (
              <button onClick={()=>setWizStep(s=>s+1)}
                disabled={wizStep<3 && !wizData[WIZ_STEPS[wizStep].key].trim()}
                style={{background:`linear-gradient(135deg,${C.cyan}22,${C.blue}18)`,border:`1.5px solid ${C.cyan}`,borderRadius:7,color:C.cyan,padding:'8px 22px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:!wizData[WIZ_STEPS[wizStep].key].trim()&&wizStep<3?.4:1}}>
                Next →
              </button>
            ) : (
              <button onClick={runWizard} disabled={generating}
                style={{background:`linear-gradient(135deg,${C.cyan}30,${C.purple}20)`,border:`1.5px solid ${C.cyan}`,borderRadius:7,color:C.cyan,padding:'8px 22px',cursor:'pointer',fontSize:13,fontWeight:600}}>
                {generating ? '⟳ Generating…' : '✦ Generate Prompt'}
              </button>
            )}
          </div>
        </div>
      )}

      {/* After wizard: show generated prompt + review form ─────────────── */}
      {mode==='wizard' && wizDone && (
        <div style={{background:C.bg1,border:`1px solid ${C.green}40`,borderRadius:12,padding:20,maxWidth:580}}>
          <div style={{fontSize:12,color:C.green,marginBottom:10,display:'flex',gap:6,alignItems:'center'}}>
            <span>✓</span><span>Prompt generated — review and customise before saving</span>
          </div>
          <PromptForm name={name} setName={setName} prompt={prompt} setPrompt={setPrompt}
            temp={temp} setTemp={setTemp} fld={fld} hints={hints} hintColor={hintColor}
            onBack={()=>{setWizDone(false);setWizStep(3)}}/>
        </div>
      )}

      {/* ── EXPERT MODE ────────────────────────────────────────────────── */}
      {mode==='expert' && (
        <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,padding:20,maxWidth:580}}>
          <PromptForm name={name} setName={setName} prompt={prompt} setPrompt={setPrompt}
            temp={temp} setTemp={setTemp} fld={fld} hints={hints} hintColor={hintColor}/>
        </div>
      )}

      {/* ── TEST PANEL (visible when a prompt exists, in wizard/expert) ── */}
      {(mode==='expert'||wizDone) && prompt.trim() && (
        <div style={{maxWidth:580,marginTop:12}}>
          <button onClick={()=>setTestOpen(o=>!o)} style={{
            width:'100%',background:C.bg2,border:`1px solid ${testOpen?C.cyan:C.border}`,
            borderRadius:8,color:testOpen?C.cyan:C.textMuted,padding:'9px 16px',
            cursor:'pointer',fontSize:12,fontWeight:600,textAlign:'left',display:'flex',justifyContent:'space-between',
          }}>
            <span>⚡ Test Agent</span>
            <span style={{opacity:.5}}>{testOpen?'▲':'▼'}</span>
          </button>
          {testOpen && (
            <div style={{background:C.bg1,border:`1px solid ${C.cyan}30`,borderTop:'none',borderRadius:'0 0 8px 8px',padding:16}}>
              <div style={{fontSize:11,color:C.textMuted,marginBottom:6}}>Sample input for the agent</div>
              <textarea value={testInput} onChange={e=>setTestInput(e.target.value)}
                placeholder="Paste a sample task or text the agent will process…"
                style={{...fld,minHeight:80,resize:'vertical',lineHeight:1.6,marginBottom:10}}/>
              <button onClick={runTest} disabled={!testInput.trim()||testing}
                style={{background:`linear-gradient(135deg,${C.orange}20,${C.yellow}15)`,border:`1.5px solid ${C.orange}`,borderRadius:7,color:C.orange,padding:'8px 22px',cursor:'pointer',fontSize:12,fontWeight:600,opacity:!testInput.trim()?.4:1}}>
                {testing?'⟳ Running…':'▶ Run Test'}
              </button>
              {testResult && (
                <div style={{marginTop:12}}>
                  <div style={{display:'flex',gap:12,marginBottom:8,fontSize:11}}>
                    <span style={{color:C.green}}>✓ Done</span>
                    <span style={{color:C.textMuted}}>{testResult.elapsed_ms}ms</span>
                    <span style={{color:C.textMuted}}>{(testResult.input_tokens||0)+(testResult.output_tokens||0)} tokens</span>
                    <span style={{color:C.textMuted}}>${(testResult.cost||0).toFixed(4)}</span>
                  </div>
                  <pre style={{background:C.bg2,border:`1px solid ${C.border}`,borderRadius:8,padding:12,fontSize:12,color:C.text,whiteSpace:'pre-wrap',lineHeight:1.6,maxHeight:280,overflow:'auto',margin:0}}>{testResult.output||testResult.error}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Save button ─────────────────────────────────────────────────── */}
      {(mode==='expert'||wizDone) && (
        <div style={{maxWidth:580,marginTop:14,display:'flex',justifyContent:'flex-end'}}>
          <button onClick={handleSave} disabled={!canSave||saving}
            style={{background:`linear-gradient(135deg,${C.cyan}22,${C.blue}18)`,border:`1.5px solid ${C.cyan}`,borderRadius:8,color:C.cyan,padding:'10px 28px',cursor:'pointer',fontSize:13,fontWeight:600,opacity:!canSave?.4:1}}>
            {saving?'…':'+ Save Agent'}
          </button>
        </div>
      )}

      {/* ── Saved agents list ───────────────────────────────────────────── */}
      {agents.length > 0 && (
        <div style={{marginTop:28}}>
          <div style={{fontSize:11,color:C.textMuted,marginBottom:10,textTransform:'uppercase',letterSpacing:'.09em'}}>
            Saved Agents ({agents.length})
          </div>
          {agents.map(a => (
            <div key={a.id} style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:10,padding:'12px 16px',marginBottom:8,display:'flex',alignItems:'flex-start',gap:12}}>
              <div style={{flex:1}}>
                <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:4,flexWrap:'wrap'}}>
                  <span style={{fontSize:14,fontWeight:600,color:C.textBright}}>{a.name}</span>
                  <span style={{fontSize:10,color:C.textMuted,background:C.bg2,padding:'2px 6px',borderRadius:3,fontFamily:'monospace'}}>{a.id}</span>
                  <span style={{fontSize:10,color:C.purple,background:C.bg2,padding:'2px 6px',borderRadius:3}}>t={a.temperature}</span>
                </div>
                <div style={{fontSize:11,color:C.textMuted,lineHeight:1.5}}>{a.system_prompt.slice(0,160)}{a.system_prompt.length>160?'…':''}</div>
              </div>
              <div style={{display:'flex',gap:6,flexShrink:0}}>
                <button onClick={()=>{setName(a.name);setPrompt(a.system_prompt);setTemp(a.temperature);setMode('expert');setTestResult(null)}}
                  style={{background:C.cyan+'12',border:`1px solid ${C.cyan}40`,borderRadius:6,color:C.cyan,padding:'5px 10px',cursor:'pointer',fontSize:11}}>Edit</button>
                <button onClick={()=>handleDelete(a.id)}
                  style={{background:C.red+'15',border:`1px solid ${C.red}40`,borderRadius:6,color:C.red,padding:'5px 10px',cursor:'pointer',fontSize:11}}>Delete</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {agents.length===0 && mode==='templates' && (
        <div style={{marginTop:12,padding:'10px 14px',background:C.bg2,borderRadius:8,fontSize:12,color:C.textMuted}}>
          Agents you create will be available to the workflow decomposer when planning new runs.
        </div>
      )}
    </div>
  )
}

// ─── Shared prompt form (used by wizard review + expert mode) ─────────────────
function PromptForm({ name, setName, prompt, setPrompt, temp, setTemp, fld, hints, hintColor, onBack }) {
  return (
    <>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:12,marginBottom:14}}>
        <div>
          <div style={{fontSize:11,color:'#4a6a8a',marginBottom:6}}>Agent Name</div>
          <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. My Summarizer"
            style={{...fld}}/>
        </div>
        <div>
          <div style={{fontSize:11,color:'#4a6a8a',marginBottom:6}}>Temperature: {temp}</div>
          <input type="range" min="0" max="1" step="0.05" value={temp}
            onChange={e=>setTemp(parseFloat(e.target.value))}
            style={{width:'100%',marginTop:8,accentColor:'#00d4ff'}}/>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:9,color:'#4a6a8a',marginTop:2}}>
            <span>Precise</span><span>Creative</span>
          </div>
        </div>
      </div>
      <div style={{marginBottom:10}}>
        <div style={{fontSize:11,color:'#4a6a8a',marginBottom:6}}>System Prompt</div>
        <textarea value={prompt} onChange={e=>setPrompt(e.target.value)}
          placeholder="You are a specialized agent that…"
          style={{...fld, minHeight:140, resize:'vertical', lineHeight:1.65}}/>
      </div>
      {/* Quality hints */}
      {hints.length > 0 && (
        <div style={{display:'flex',flexDirection:'column',gap:5,marginBottom:12}}>
          {hints.map((h,i)=>(
            <div key={i} style={{fontSize:11,color:hintColor[h.level],display:'flex',gap:6,alignItems:'flex-start',padding:'5px 8px',background:hintColor[h.level]+'10',borderRadius:5}}>
              <span style={{flexShrink:0}}>{h.level==='ok'?'✓':h.level==='warn'?'⚠':'ℹ'}</span>
              <span>{h.text}</span>
            </div>
          ))}
        </div>
      )}
      {onBack && (
        <button onClick={onBack} style={{background:'transparent',border:`1px solid #142040`,borderRadius:7,color:'#4a6a8a',padding:'6px 14px',cursor:'pointer',fontSize:12}}>← Back to Wizard</button>
      )}
    </>
  )
}

// ─── Main App ─────────────────────────────────────────────────────────────────
export default function App() {
  // ── Auth ────────────────────────────────────────────────────────────────────
  const [authToken,   setAuthToken]   = useState(() => localStorage.getItem('weave_token'))
  const [user,        setUser]        = useState(null)
  const [authLoading, setAuthLoading] = useState(true)
  const [collapsed,   setCollapsed]   = useState(false)

  // ── Theme ───────────────────────────────────────────────────────────────────
  const [theme, setTheme] = useState(() => localStorage.getItem('weave-theme') || 'auto')
  useEffect(() => {
    const root = document.documentElement
    const apply = (dark) => root.setAttribute('data-theme', dark ? 'dark' : 'light')
    if (theme === 'auto') {
      const mq = window.matchMedia('(prefers-color-scheme: dark)')
      apply(mq.matches)
      const h = e => apply(e.matches)
      mq.addEventListener('change', h)
      return () => mq.removeEventListener('change', h)
    } else { apply(theme === 'dark') }
    localStorage.setItem('weave-theme', theme)
  }, [theme])

  // ── Check URL for Weave OAuth token ─────────────────────────────────────────
  useEffect(() => {
    const p = new URLSearchParams(window.location.search)
    const t = p.get('token')
    if (t) { localStorage.setItem('weave_token', t); setAuthToken(t); window.history.replaceState({}, '', '/') }
  }, [])

  // ── Verify token on mount ────────────────────────────────────────────────────
  useEffect(() => {
    if (!authToken) { setAuthLoading(false); return }
    fetch('/api/auth/me', { headers: { Authorization: `Bearer ${authToken}` } })
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.user) setUser(d.user); else { setAuthToken(null); localStorage.removeItem('weave_token') } })
      .finally(() => setAuthLoading(false))
  }, [authToken])

  // ── apiFetch: adds auth header to every call ─────────────────────────────────
  const apiFetch = useCallback((url, opts = {}) => fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}), ...(opts.headers || {}) },
  }), [authToken])

  const handleLogout = () => {
    apiFetch('/api/auth/logout', { method: 'POST' }).catch(()=>{})
    localStorage.removeItem('weave_token')
    setAuthToken(null); setUser(null); setView('home')
  }

  // ── Navigation ───────────────────────────────────────────────────────────────
  const [view, setView] = useState('home')

  // ── Workflow input ───────────────────────────────────────────────────────────
  const [input,     setInput]     = useState('')
  const [templates, setTemplates] = useState([])

  // ── Execution state ──────────────────────────────────────────────────────────
  const [phase,         setPhase]        = useState('idle')
  const [workflowId,    setWorkflowId]   = useState(null)
  const [dagTasks,      setDagTasks]     = useState([])
  const [workflowName,  setWorkflowName] = useState('')
  const [activeTaskIds, setActiveTaskIds]= useState(new Set())
  const [doneTaskIds,   setDoneTaskIds]  = useState(new Set())
  const [outputs,       setOutputs]      = useState({})
  const [expanded,      setExpanded]     = useState({})

  // ── Pause/resume ─────────────────────────────────────────────────────────────
  const [pausedTaskId,     setPausedTaskId]     = useState(null)
  const [pausedTaskOutput, setPausedTaskOutput] = useState('')

  // ── Metrics ──────────────────────────────────────────────────────────────────
  const [elapsed, setElapsed] = useState(0)
  const [tokens,  setTokens]  = useState(0)
  const [cost,    setCost]    = useState(0)
  const [finalOut, setFinalOut] = useState('')
  const [error,   setError]   = useState('')
  const [linkedInConnected, setLinkedInConnected] = useState(false)

  const timerRef  = useRef(null)
  const startRef  = useRef(null)
  const readerRef = useRef(null)

  // ── Post-auth data fetch ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!user) return
    apiFetch('/api/templates').then(r=>r.json()).then(d => setTemplates(d.templates || [])).catch(()=>{})
    apiFetch('/api/linkedin/status').then(r=>r.json()).then(d => setLinkedInConnected(!!d.connected)).catch(()=>{})
    const params = new URLSearchParams(window.location.search)
    if (params.get('linkedin') === 'connected') {
      setLinkedInConnected(true)
      window.history.replaceState({}, '', '/')
    }
  }, [user, apiFetch])

  // Elapsed timer
  useEffect(() => {
    if (phase === 'running') {
      startRef.current = Date.now() - elapsed * 1000
      timerRef.current = setInterval(() => setElapsed((Date.now()-startRef.current)/1000), 100)
    } else {
      clearInterval(timerRef.current)
    }
    return () => clearInterval(timerRef.current)
  }, [phase]) // eslint-disable-line

  const runWorkflow = async () => {
    if (!input.trim() || phase === 'running') return

    setPhase('running')
    setDagTasks([]); setWorkflowName(''); setWorkflowId(null)
    setActiveTaskIds(new Set()); setDoneTaskIds(new Set())
    setOutputs({}); setExpanded({})
    setElapsed(0); setTokens(0); setCost(0)
    setFinalOut(''); setError('')
    setPausedTaskId(null); setPausedTaskOutput('')
    startRef.current = Date.now()

    try {
      const resp = await fetch('/api/run/stream', {
        method:'POST',
        headers:{'Content-Type':'application/json', ...(authToken?{Authorization:`Bearer ${authToken}`}:{})},
        body: JSON.stringify({ input: input.trim() }),
      })
      if (!resp.ok) {
        const eb = await resp.json().catch(()=>({}))
        throw new Error(eb.error || `HTTP ${resp.status}`)
      }

      const reader = resp.body.getReader()
      readerRef.current = reader
      const decoder = new TextDecoder()
      let buf = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        const lines = buf.split('\n')
        buf = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6).trim()
          if (!raw) continue
          let ev; try { ev = JSON.parse(raw) } catch { continue }

          if (ev.type === 'workflow_id') {
            setWorkflowId(ev.workflow_id)

          } else if (ev.type === 'decomposition_complete') {
            const dag = ev.dag || {}
            setWorkflowName(dag.workflow_name || '')
            setDagTasks(dag.tasks || [])

          } else if (ev.type === 'task_started') {
            setActiveTaskIds(p => new Set([...p, ev.task_id]))

          } else if (ev.type === 'task_completed') {
            setActiveTaskIds(p => { const n=new Set(p); n.delete(ev.task_id); return n })
            setDoneTaskIds(p => new Set([...p, ev.task_id]))
            setOutputs(p => ({ ...p, [ev.task_id]: ev.full_output }))
            setExpanded(p => ({ ...p, [ev.task_id]: true }))
            if (ev.cumulative_tokens) setTokens(ev.cumulative_tokens)
            if (ev.cumulative_cost)   setCost(ev.cumulative_cost)
            // Auto-collapse previous card after short delay
            setTimeout(() => {
              setExpanded(p => {
                const keys = Object.keys(p).filter(k => p[k])
                if (keys.length > 1) {
                  const older = keys.slice(0, -1)
                  const n = { ...p }
                  older.forEach(k => { n[k] = false })
                  return n
                }
                return p
              })
            }, 900)

          } else if (ev.type === 'workflow_paused') {
            setPhase('paused')
            setPausedTaskId(ev.current_task_id)
            // Find the paused task's last output
            setOutputs(current => {
              const out = ev.current_task_id ? current[ev.current_task_id] || '' : ''
              setPausedTaskOutput(out)
              return current
            })

          } else if (ev.type === 'workflow_resumed') {
            setPhase('running')
            setPausedTaskId(null)

          } else if (ev.type === 'workflow_complete') {
            const m = ev.token_metrics || {}
            setTokens((m.total_input_tokens||0)+(m.total_output_tokens||0))
            setCost(m.estimated_cost||0)
            setFinalOut(ev.final_output||'')
            setActiveTaskIds(new Set())
            setPhase('complete')

          } else if (ev.type === 'error') {
            throw new Error(ev.message || 'Workflow failed')
          }
        }
      }
    } catch (err) {
      setError(err.message.includes('fetch')
        ? 'Cannot reach the backend. Make sure the server is running: python3 -m backend.api.server'
        : err.message
      )
      setPhase('idle'); setActiveTaskIds(new Set())
    }
  }

  const pauseWorkflow = async () => {
    if (!workflowId) return
    await apiFetch(`/api/workflows/${workflowId}/pause`, { method:'POST' })
  }

  const reset = () => {
    if (readerRef.current) { try { readerRef.current.cancel() } catch {} }
    setPhase('idle'); setDagTasks([]); setWorkflowId(null); setWorkflowName('')
    setActiveTaskIds(new Set()); setDoneTaskIds(new Set())
    setOutputs({}); setExpanded({}); setElapsed(0); setTokens(0); setCost(0)
    setFinalOut(''); setError(''); setPausedTaskId(null); setPausedTaskOutput('')
  }

  const toggleExpanded = id => setExpanded(p => ({ ...p, [id]: !p[id] }))

  const loadHistoryWorkflow = async (wid) => {
    setView('run')
    const r = await apiFetch(`/api/workflows/${wid}`)
    const state = await r.json()
    if (state.dag) {
      setWorkflowName(state.dag.workflow_name || '')
      setDagTasks(state.dag.tasks || [])
      const done = new Set(state.dag.tasks.filter(t=>t.status==='completed').map(t=>t.id))
      setDoneTaskIds(done)
      const outs = {}
      state.dag.tasks.forEach(t => { if (t.output) outs[t.id] = t.output })
      setOutputs(outs)
      setInput(state.user_input || '')
      setWorkflowId(state.workflow_id)
      setPhase('complete')
      // Get final output
      const ordered = [...(state.dag.tasks || [])].reverse()
      const last = ordered.find(t => t.status==='completed' && t.output)
      setFinalOut(last?.output || '')
      const m = state.token_metrics || {}
      setTokens((m.total_input_tokens||0)+(m.total_output_tokens||0))
      setCost(m.estimated_cost||0)
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  if (authLoading) return <><style dangerouslySetInnerHTML={{__html:GLOBAL_STYLES}}/><LoadingScreen/></>
  if (!user) return <><style dangerouslySetInnerHTML={{__html:GLOBAL_STYLES}}/><LandingPage/></>

  // Workspace view (the full run dashboard)
  const WorkspaceContent = (
    <div style={{maxWidth:880,margin:'0 auto',padding:'28px 22px'}}>
      {/* Header row */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20}}>
        <div>
          <h2 style={{fontSize:18,fontWeight:700,color:C.textBright,margin:0}}>New Workflow Run</h2>
          <div style={{fontSize:12,color:C.textMuted,marginTop:2}}>Describe your goal — Weave will decompose and execute it</div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:8}}>
          <div style={{width:8,height:8,borderRadius:'50%',background:phase==='running'?C.green:phase==='paused'?C.orange:phase==='complete'?C.green:C.textMuted,animation:phase==='running'?'pulse 1s ease-in-out infinite':'none'}}/>
          <span style={{fontSize:11,color:C.textMuted,textTransform:'uppercase',letterSpacing:'.06em'}}>{phase==='idle'?'Ready':phase==='running'?'Running':phase==='paused'?'Paused':'Complete'}</span>
          {phase !== 'idle' && <button onClick={reset} style={{background:'transparent',border:`1px solid ${C.border}`,borderRadius:6,color:C.textMuted,padding:'4px 10px',cursor:'pointer',fontSize:11}}>↺ Reset</button>}
        </div>
      </div>

      {/* Quick templates */}
      <div style={{marginBottom:12}}>
        <div style={{display:'flex',gap:6,flexWrap:'wrap'}}>
          {[...BUILTIN_TEMPLATES,...templates.filter(t=>t.is_custom).map(t=>({label:t.name,input:t.input}))].map(t=>(
            <button key={t.label} onClick={()=>setInput(t.input)} disabled={phase==='running'}
              onMouseEnter={e=>{e.currentTarget.style.borderColor=C.cyan;e.currentTarget.style.color=C.cyan}}
              onMouseLeave={e=>{e.currentTarget.style.borderColor=C.border;e.currentTarget.style.color=C.text}}
              style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:6,color:C.text,padding:'6px 12px',cursor:phase==='running'?'not-allowed':'pointer',fontSize:12,opacity:phase==='running'?.45:1,transition:'all .15s'}}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <textarea value={input} onChange={e=>setInput(e.target.value)} disabled={phase==='running'}
        placeholder={"Describe your workflow in natural language…\n\nExample: Research the latest AI trends, write a technical brief, review it for accuracy, then produce the final version."}
        onFocus={e=>e.target.style.borderColor=C.cyan}
        onBlur={e=>e.target.style.borderColor=input?C.borderHi:C.border}
        style={{width:'100%',minHeight:110,background:C.bg1,border:`1px solid ${input&&phase!=='running'?C.borderHi:C.border}`,borderRadius:10,color:C.text,fontSize:14,lineHeight:1.65,padding:'13px 15px',resize:'vertical',outline:'none',fontFamily:'inherit',transition:'border-color .2s',marginBottom:12}}
      />

      {error && (
        <div style={{background:C.red+'12',border:`1px solid ${C.red}50`,borderRadius:8,padding:'11px 16px',marginBottom:16,fontSize:13,color:C.red,animation:'fadeUp .2s ease-out',display:'flex',gap:10,alignItems:'flex-start'}}>
          <span style={{flexShrink:0}}>⚠</span><span>{error}</span>
        </div>
      )}

      <div style={{display:'flex',justifyContent:'flex-end',gap:10,marginBottom:28}}>
        {phase==='running'&&workflowId&&(
          <button onClick={pauseWorkflow} style={{background:C.orange+'18',border:`1.5px solid ${C.orange}60`,borderRadius:8,color:C.orange,padding:'11px 22px',cursor:'pointer',fontSize:14,fontWeight:600}}>⏸ Pause</button>
        )}
        <button onClick={runWorkflow} disabled={!input.trim()||phase==='running'}
          style={{background:phase==='running'?C.bg2:`linear-gradient(135deg,var(--primary)22,var(--accent)18)`,border:`1.5px solid ${phase==='running'?C.border:'var(--primary)'}`,borderRadius:8,color:phase==='running'?C.textMuted:'var(--primary)',padding:'11px 30px',cursor:!input.trim()||phase==='running'?'not-allowed':'pointer',fontSize:14,fontWeight:600,opacity:!input.trim()&&phase!=='running'?.35:1,display:'flex',alignItems:'center',gap:9,transition:'all .2s'}}>
          {phase==='running'?<><div style={{width:14,height:14,border:`2px solid ${C.textMuted}`,borderTopColor:'transparent',borderRadius:'50%',animation:'spin .75s linear infinite'}}/>Executing…</>:<>▶ Run Workflow</>}
        </button>
      </div>

      {(phase==='running'||phase==='paused'||phase==='complete')&&dagTasks.length>0&&(
        <div style={{background:C.bg1,border:`1px solid ${C.border}`,borderRadius:12,padding:'14px 20px',marginBottom:18,animation:'fadeUp .35s ease-out'}}>
          <div style={{fontSize:10,color:C.textMuted,marginBottom:4,textTransform:'uppercase',letterSpacing:'.09em'}}>{workflowName||'Pipeline'} · {dagTasks.length} Tasks · Parallel Waves</div>
          <DAGPipeline tasks={dagTasks} activeTaskIds={activeTaskIds} doneTaskIds={doneTaskIds}/>
        </div>
      )}
      {(phase==='running'||phase==='paused'||phase==='complete')&&(
        <MetricsBar elapsed={elapsed} tokens={tokens} cost={cost} done={doneTaskIds.size} total={dagTasks.length||4}/>
      )}
      {phase==='paused'&&workflowId&&(
        <PauseBanner workflowId={workflowId} currentTaskId={pausedTaskId} taskOutput={pausedTaskOutput}
          onResumed={()=>setPhase('running')} onAborted={()=>{setPhase('idle');reset()}}/>
      )}
      {(phase==='running'||phase==='paused'||phase==='complete')&&dagTasks.length>0&&(
        <div style={{marginBottom:24}}>
          <div style={{fontSize:10,color:C.textMuted,marginBottom:10,textTransform:'uppercase',letterSpacing:'.09em'}}>Agent Execution Log</div>
          {dagTasks.map(task=>{
            const isActive=activeTaskIds.has(task.id), isDone=doneTaskIds.has(task.id)
            const isPausedTask=phase==='paused'&&task.id===pausedTaskId
            return <TaskCard key={task.id} task={task} isActive={isActive} isDone={isDone} isPaused={isPausedTask} output={outputs[task.id]} expanded={!!expanded[task.id]} onToggle={()=>toggleExpanded(task.id)} onEditRequest={isPausedTask?()=>setExpanded(p=>({...p,[task.id]:true})):null}/>
          })}
        </div>
      )}
      {phase==='complete'&&finalOut&&(
        <CompletionView output={finalOut} elapsed={elapsed} tokens={tokens} cost={cost} workflowId={workflowId} linkedInConnected={linkedInConnected} onLinkedInConnect={()=>window.location.href='/api/linkedin/auth'}/>
      )}
    </div>
  )

  return (
    <>
      <style dangerouslySetInnerHTML={{__html:GLOBAL_STYLES}}/>
      <div style={{display:'flex',height:'100vh',overflow:'hidden',background:'var(--bg0)',color:'var(--text)'}}>
        <Sidebar view={view} setView={v=>{setView(v); if(v==='run') { /* keep existing run state */ }}} user={user} collapsed={collapsed} setCollapsed={setCollapsed} onLogout={handleLogout}/>
        <main style={{flex:1,overflowY:'auto',position:'relative'}}>
          {view==='home'     && <HomeView api={apiFetch} user={user} onRun={inp=>{setInput(inp);setView('run')}}/>}
          {view==='run'      && WorkspaceContent}
          {view==='history'  && <HistoryView api={apiFetch} onLoad={loadHistoryWorkflow}/>}
          {view==='agents'   && <AgentsView api={apiFetch}/>}
          {view==='admin'    && user?.is_admin && <AdminView api={apiFetch}/>}
          {view==='settings' && <SettingsView user={user} theme={theme} setTheme={setTheme} onLogout={handleLogout} api={apiFetch}/>}
        </main>
      </div>
    </>
  )
}
