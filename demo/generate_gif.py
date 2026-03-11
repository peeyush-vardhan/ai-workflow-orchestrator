#!/usr/bin/env python3
"""
Generate demo/demo.gif for the AI Workflow Orchestrator README.
Requires only Pillow (stdlib + PIL).
"""
import os
from PIL import Image, ImageDraw, ImageFont

# ─── Canvas ────────────────────────────────────────────────────────────────
W, H = 780, 460

# ─── Palette ───────────────────────────────────────────────────────────────
C = {
    'bg':      (6,   12,  26),
    'bar':     (10,  18,  42),
    'border':  (18,  44,  78),
    'hi':      (12,  26,  54),
    'cyan':    (0,   212, 255),
    'green':   (0,   230, 118),
    'blue':    (66,  165, 245),
    'purple':  (179, 157, 219),
    'orange':  (255, 167, 38),
    'yellow':  (255, 213, 79),
    'red':     (239, 83,  80),
    'white':   (236, 244, 255),
    'muted':   (74,  106, 138),
    'dim':     (46,  76,  110),
    'prompt':  (0,   230, 118),
}

# ─── Fonts ─────────────────────────────────────────────────────────────────
def _load(size):
    for path in [
        '/System/Library/Fonts/Menlo.ttc',
        '/System/Library/Fonts/SFNSMono.ttf',
        '/Library/Fonts/Courier New.ttf',
        '/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf',
    ]:
        if os.path.exists(path):
            try:
                return ImageFont.truetype(path, size)
            except Exception:
                pass
    return ImageFont.load_default()

F   = _load(13)
F_S = _load(11)

def tw(text, font=F):
    try:
        b = font.getbbox(text)
        return b[2] - b[0]
    except Exception:
        return len(text) * 8

LH = 18   # line height
PAD_L = 22

# ─── Frame builder ─────────────────────────────────────────────────────────
def frame(lines, status='●  READY', status_col='muted'):
    """
    lines: list of rows.  Each row is list of (text, color_key) tuples.
    Returns a PIL Image (RGB).
    """
    img = Image.new('RGB', (W, H), C['bg'])
    d   = ImageDraw.Draw(img)

    # ── Title bar ──────────────────────────────────────────────────────────
    d.rectangle([0, 0, W, 32], fill=C['bar'])
    d.rectangle([0, 32, W, 33], fill=C['border'])

    # Traffic lights
    for i, col in enumerate([(239, 83, 80), (255, 189, 68), (0, 201, 87)]):
        cx, cy = 16 + i * 20, 16
        d.ellipse([cx-6, cy-6, cx+6, cy+6], fill=col)

    # Title
    title = 'AI Workflow Orchestrator  ·  Demo'
    d.text((W // 2 - tw(title, F) // 2, 9), title, fill=C['dim'], font=F)

    # Status badge (right)
    badge = f'{status}'
    bw = tw(badge, F_S)
    d.text((W - bw - 16, 11), badge, fill=C[status_col], font=F_S)

    # ── Content ────────────────────────────────────────────────────────────
    y = 48
    for row in lines:
        x = PAD_L
        for text, ck in row:
            col = C.get(ck, C['white'])
            d.text((x, y), text, fill=col, font=F)
            x += tw(text, F)
        y += LH
        if y > H - 12:
            break

    return img

# ─── Scene helpers ─────────────────────────────────────────────────────────
def B():
    """Blank line."""
    return [('', 'bg')]

def sep(label='', width=55):
    dashes = '─' * (width - len(label) - 2)
    return [(f'  {label} ', 'cyan'), (dashes, 'border')]

# ─── Bar characters ────────────────────────────────────────────────────────
FULL  = '█' * 22
HALF  = '█' * 11 + '░' * 11
EMPTY = '░' * 22

AGENTS = [
    ('◎', 'Researcher', 'blue',   '0.4', '1.4s'),
    ('◈', 'Writer    ', 'purple', '0.7', '1.8s'),
    ('◉', 'Reviewer  ', 'orange', '0.2', '1.2s'),
    ('◆', 'Executor  ', 'green',  '0.1', '1.6s'),
]

def agent_row(i, state, done_count):
    """state: 'done' | 'run' | 'wait'"""
    icon, name, color, temp, dur = AGENTS[i]
    if state == 'done':
        return [
            ('  ', 'bg'), (f'{icon} {name}', color), ('  ', 'bg'),
            (FULL, color), ('  ', 'bg'), ('✓', 'green'), (f'  {dur}', 'muted'),
        ]
    if state == 'run':
        return [
            ('  ', 'bg'), (f'{icon} {name}', color), ('  ', 'bg'),
            (HALF, color), ('  ', 'bg'), ('● RUNNING', color), (f'  t={temp}', 'muted'),
        ]
    return [
        ('  ', 'bg'), (f'{icon} {name}', 'muted'), ('  ', 'bg'),
        (EMPTY, 'dim'), ('  ○ pending', 'muted'),
    ]

# ─── Build all frames ──────────────────────────────────────────────────────
def build():
    frames = []   # list of (Image, duration_ms)

    def add(lines, ms, st='●  READY', sc='muted'):
        frames.append((frame(lines, st, sc), ms))

    # ── 0. Title splash ────────────────────────────────────────────────────
    splash = [
        B(), B(), B(),
        [('  ⬡  AI Workflow Orchestrator', 'cyan')],
        B(),
        [('     Natural Language  →  Multi-Agent DAG  →  Reviewed Output', 'muted')],
        B(),
        [('     ◎ Researcher  ◈ Writer  ◉ Reviewer  ◆ Executor', 'dim')],
        B(), B(), B(),
        [('     Starting demo...', 'comment')],
    ]
    add(splash, 2200, '●  READY', 'green')

    # ── 1. Health check ────────────────────────────────────────────────────
    hdr = [
        B(),
        [('  ', 'bg'), ('$ ', 'prompt'), ('curl http://localhost:5000/api/health', 'white')],
    ]
    add(hdr, 700)

    health = hdr + [
        B(),
        [('  {', 'dim')],
        [('    ', 'bg'), ('"status"',            'cyan'),   (': ', 'dim'), ('"ok"',    'green'),  (',', 'dim')],
        [('    ', 'bg'), ('"provider"',           'cyan'),   (': ', 'dim'), ('"mock"',  'yellow'), (',', 'dim')],
        [('    ', 'bg'), ('"active_workflows"',   'cyan'),   (': ', 'dim'), ('0',       'orange')],
        [('  }', 'dim')],
    ]
    add(health, 1500)

    # ── 2. POST /api/run ───────────────────────────────────────────────────
    cmd = health + [
        B(),
        [('  ', 'bg'), ('$ ', 'prompt'), ('curl -s -X POST http://localhost:5000/api/run \\', 'white')],
        [('      ', 'bg'), ('-H ', 'blue'),  ("'Content-Type: application/json' \\", 'yellow')],
        [('      ', 'bg'), ('-d ', 'blue'),  ("'", 'yellow'),
         ('{"input": "Research AI trends and write a strategic report"}', 'green'),
         ("'", 'yellow')],
    ]
    add(cmd, 900, '●  RUNNING', 'cyan')

    # ── 3. Decomposing ─────────────────────────────────────────────────────
    decomp = cmd + [
        B(),
        [('  ', 'bg'), ('⬡  Decomposing workflow...', 'cyan')],
    ]
    add(decomp, 900, '●  RUNNING', 'cyan')

    decomp2 = cmd + [
        B(),
        [('  ', 'bg'), ('⬡  4 tasks  ·  DAG validated  ·  sequential pipeline', 'cyan')],
    ]
    add(decomp2, 800, '●  RUNNING', 'cyan')

    # ── 4–7. Agent execution ───────────────────────────────────────────────
    base = decomp2 + [B()]

    for active in range(4):
        # Running frame
        run_lines = base[:]
        for j in range(4):
            st = 'done' if j < active else ('run' if j == active else 'wait')
            run_lines.append(agent_row(j, st, active))
        add(run_lines, 1150, '●  RUNNING', 'cyan')

        # Completed frame
        done_lines = base[:]
        for j in range(4):
            st = 'done' if j <= active else 'wait'
            done_lines.append(agent_row(j, st, active + 1))
        add(done_lines, 380, '●  RUNNING', 'cyan')

    # ── 8. All complete ────────────────────────────────────────────────────
    all_done = base[:]
    for j in range(4):
        all_done.append(agent_row(j, 'done', 4))
    all_done += [
        B(),
        [('  ', 'bg'), ('✓  Workflow complete  ·  6.0s elapsed', 'green')],
    ]
    add(all_done, 900, '✓  DONE', 'green')

    # ── 9. Final output preview ────────────────────────────────────────────
    output = all_done + [
        B(),
        sep('── Final Output Preview'),
        B(),
        [('  ', 'bg'), ('## Final Deliverable — AI Strategy Report', 'cyan')],
        [('  ', 'bg'), ('Status: ✅ Publication Ready · Version 2.0', 'green')],
        B(),
        [('  ', 'bg'), ('Organizations integrating AI into core operations are', 'white')],
        [('  ', 'bg'), ('establishing durable competitive advantages...', 'white')],
        B(),
        [('  ', 'bg'), ('180% ROI  ·  Month 14 breakeven  ·  67% cost reduction', 'yellow')],
    ]
    add(output, 2600, '✓  DONE', 'green')

    # ── 10. Metrics ────────────────────────────────────────────────────────
    metrics = all_done + [
        B(),
        sep('── Metrics'),
        B(),
        [
            ('  ', 'bg'),
            ('Tokens  ', 'muted'), ('8,240   ', 'white'),
            ('Cost  ',   'muted'), ('$0.057   ', 'green'),
            ('Tasks  ',  'muted'), ('4   ',     'orange'),
            ('Agents  ', 'muted'), ('4',        'blue'),
        ],
        B(),
        [('  ', 'bg'), ('workflow_id ', 'muted'), ('a3f2b1c4', 'cyan'),
         ('   status ', 'muted'), ('completed', 'green')],
        B(),
        [('  ', 'bg'), ('$ ', 'prompt'), ('_', 'green')],
    ]
    add(metrics, 3200, '✓  DONE', 'green')

    # ── 11. Loop back to splash ─────────────────────────────────────────────
    add(splash, 1600, '●  READY', 'green')

    return frames


# ─── Palette optimisation ──────────────────────────────────────────────────
def quantise(img, n_colors=128):
    """Convert to P-mode (palette) with no dithering for crisp terminal text."""
    return img.quantize(colors=n_colors, dither=Image.Dither.NONE)


# ─── Main ──────────────────────────────────────────────────────────────────
def main():
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'demo.gif')

    print('Building frames...')
    raw = build()
    print(f'  {len(raw)} frames')

    print('Quantising to 128-colour palette...')
    images    = [quantise(f) for f, _ in raw]
    durations = [d for _, d in raw]

    print(f'Saving → {out}')
    images[0].save(
        out,
        save_all=True,
        append_images=images[1:],
        duration=durations,
        loop=0,
        optimize=True,
    )
    kb = os.path.getsize(out) // 1024
    print(f'Done!  {kb} KB  ({len(raw)} frames, {sum(durations)/1000:.1f}s loop)')


if __name__ == '__main__':
    main()
