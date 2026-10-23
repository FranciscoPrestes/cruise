// Builds the Cruise flight-route art (dark + light) and the new logo files into ./out.
// Everything animated is sampled from pure functions of time (see sampleAt), so SMIL needs only linear `values`.
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..')
fs.mkdirSync(OUT, { recursive: true })

const W = 960
const H = 600
const LOOP = 20
const STEPS = 200 // 0.1 s
const ts = Array.from({ length: STEPS + 1 }, (_, i) => (i * LOOP) / STEPS)
const STILL_T = 16.2

// ---------- palettes ----------
const FONT = `ui-sans-serif, system-ui, -apple-system, "Segoe UI", Helvetica, Arial, sans-serif`
const PAL = {
  dark: {
    bg0: '#0E1116', bg1: '#141922', orange: '#D97757', strong: '#E8EBF1', muted: '#8C95A6',
    band: 'rgba(255,255,255,0.07)', ceiling: 'rgba(255,255,255,0.26)', planned: 'rgba(255,255,255,0.22)',
    ground: 'rgba(255,255,255,0.20)', panel: '#171C25', ring: 'rgba(255,255,255,0.40)', gaugeBg: 'rgba(255,255,255,0.09)',
    base: '#8C95A6', glowA: 0.30, tile0: '#1E232C', tile1: '#14181F', tileStroke: 'rgba(255,255,255,0.09)',
  },
  light: {
    bg0: '#F7F8FA', bg1: '#EEF0F4', orange: '#C15F3C', strong: '#1E2430', muted: '#5F6B7D',
    band: 'rgba(15,23,42,0.08)', ceiling: 'rgba(15,23,42,0.32)', planned: 'rgba(15,23,42,0.26)',
    ground: 'rgba(15,23,42,0.24)', panel: '#FFFFFF', ring: 'rgba(15,23,42,0.45)', gaugeBg: 'rgba(15,23,42,0.09)',
    base: '#7C8798', glowA: 0.20, tile0: '#FFFFFF', tile1: '#F1F3F6', tileStroke: 'rgba(15,23,42,0.14)',
  },
}

// ---------- geometry ----------
const BAND = { low: 380, medium: 325, high: 270, xhigh: 215, max: 160 }
const CEIL_Y = 128
const GROUND_Y = 446
const FLY_GROUND = 435 // the aircraft's path rides above the runway line

const P = (x, y) => ({ x, y })
const seg = (a, b, k = 0.5) => {
  const dx = b.x - a.x
  return { p0: a, c1: P(a.x + k * dx, a.y), c2: P(b.x - k * dx, b.y), p1: b }
}
const A = P(120, FLY_GROUND)
const WP1 = [
  { name: 'low', p: P(205, BAND.low) },
  { name: 'high', p: P(285, BAND.high) },
  { name: 'medium', p: P(365, BAND.medium) },
  { name: 'xhigh', p: P(445, BAND.xhigh) },
  { name: 'high', p: P(525, BAND.high) },
]
const H1 = P(676, FLY_GROUND)
const H2 = P(732, FLY_GROUND)
const WP2 = [
  { name: 'low', p: P(812, BAND.low) },
  { name: 'medium', p: P(892, BAND.medium) },
]
const EXIT = P(1030, BAND.medium)

function chain(points, ks = []) {
  return points.slice(1).map((b, i) => seg(points[i], b, ks[i] ?? 0.5))
}
const R1 = chain([A, ...WP1.map(w => w.p), H1], [0.55, 0.5, 0.5, 0.5, 0.5, 0.55])
const R2 = chain([H2, ...WP2.map(w => w.p), EXIT], [0.55, 0.5, 0.4])

const bez = (s, t) => {
  const u = 1 - t
  const x = u * u * u * s.p0.x + 3 * u * u * t * s.c1.x + 3 * u * t * t * s.c2.x + t * t * t * s.p1.x
  const y = u * u * u * s.p0.y + 3 * u * u * t * s.c1.y + 3 * u * t * t * s.c2.y + t * t * t * s.p1.y
  return { x, y }
}
function table(segs) {
  const pts = []
  const lens = [0]
  for (const s of segs) for (let i = 0; i <= 300; i++) pts.push(bez(s, i / 300))
  for (let i = 1; i < pts.length; i++) lens.push(lens[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y))
  return { pts, lens, L: lens[lens.length - 1] }
}
const T1 = table(R1)
const T2 = table(R2)
function at(tab, s) {
  const sc = Math.max(0, Math.min(tab.L, s))
  let lo = 0
  let hi = tab.lens.length - 1
  while (hi - lo > 1) {
    const mid = (lo + hi) >> 1
    if (tab.lens[mid] <= sc) lo = mid
    else hi = mid
  }
  const f = (sc - tab.lens[lo]) / Math.max(1e-9, tab.lens[hi] - tab.lens[lo])
  const a = tab.pts[lo]
  const b = tab.pts[hi]
  const x = a.x + (b.x - a.x) * f
  const y = a.y + (b.y - a.y) * f
  // damped pitch: the tangent's angle, scaled and clamped, so a climb reads as a gentle nose-up
  const ahead = tab.pts[Math.min(tab.pts.length - 1, hi + 2)]
  const back = tab.pts[Math.max(0, lo - 2)]
  const ang = Math.atan2(ahead.y - back.y, ahead.x - back.x)
  const deg = Math.max(-15, Math.min(15, ((ang * 180) / Math.PI) * 0.34))
  return { x, y, deg }
}
// arc length (distance along the route) at which the route is closest to x
function sAtX(tab, x) {
  let best = 0
  let bd = 1e9
  tab.pts.forEach((p, i) => {
    const d = Math.abs(p.x - x)
    if (d < bd) { bd = d; best = tab.lens[i] }
  })
  return best
}

// ---------- timeline ----------
const clamp01 = v => Math.max(0, Math.min(1, v))
const smooth = v => { const c = clamp01(v); return c * c * (3 - 2 * c) }
const easeIO = v => { const c = clamp01(v); return 0.45 * c + 0.55 * smooth(c) } // mostly even, soft at both ends
const easeIn = v => Math.pow(clamp01(v), 1.7)
const fadeWin = (t, a, b) => smooth((t - a) / (b - a)) // 0 -> 1 across [a,b]

const TA = 0.8 // plane 1 rolls
const TB = 11.4 // plane 1 stops at the runway
const TC = 13.4 // plane 2 rolls
const TD = 18.8 // plane 2 leaves
const RESET0 = 19.0 // everything eases back to the opening frame
const RESET1 = 19.8

const p1 = t => easeIO((t - TA) / (TB - TA))
const p2 = t => easeIn((t - TC) / (TD - TC))
const s1 = t => p1(t) * T1.L
const s2 = t => p2(t) * T2.L
const invert = (sTarget, tab, prog, t0, t1) => {
  let lo = t0
  let hi = t1
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2
    if (prog(mid) * tab.L < sTarget) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}
const wpTimes1 = WP1.map(w => invert(sAtX(T1, w.p.x), T1, p1, TA, TB))
const wpTimes2 = WP2.map(w => invert(sAtX(T2, w.p.x), T2, p2, TC, TD))
const t60 = invert(T1.L * 0.75 * 1, T1, p1, TA, TB) // 60% of the context is 75% of the way to the 80% stop
const t80 = TB

const resetFade = t => 1 - fadeWin(t, RESET0, RESET1)

// plane 1 (flies, stops at the runway, fades, reappears at the start)
const plane1 = {
  pos: t => {
    if (t >= 13.95) return at(T1, 0)
    return at(T1, s1(t))
  },
  op: t => {
    if (t < 13.0) return 1
    if (t < 13.8) return 1 - fadeWin(t, 13.0, 13.8)
    if (t < 19.2) return 0
    return fadeWin(t, 19.2, 20)
  },
}
const plane2 = {
  pos: t => at(T2, s2(t)),
  op: t => fadeWin(t, 12.2, 12.9) * (1 - fadeWin(t, 18.3, 18.9)),
}

// context gauge: share of the context used, as a fraction of the gauge
const gaugeFrac = t => {
  if (t < TB) return 0.8 * p1(t)
  if (t < 12.9) return 0.8
  if (t < 13.9) return 0.8 * (1 - easeIO((t - 12.9) / 1.0))
  if (t < RESET0) return 0.2 * p2(t)
  return 0.2 * p2(RESET0) * (1 - fadeWin(t, RESET0, RESET1))
}

function mix(c1, c2, f) {
  const h = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16))
  const a = h(c1)
  const b = h(c2)
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * f).toString(16).padStart(2, '0')).join('')
}

// ---------- rendering helpers ----------
const fmt = v => (typeof v === 'number' ? String(Math.round(v * 100) / 100) : v)
const attrs = o => Object.entries(o).map(([k, v]) => ` ${k}="${fmt(v)}"`).join('')

function node(tag, a, dyn, kids, mode) {
  let at = attrs(a)
  let anim = ''
  for (const [k, fn] of Object.entries(dyn || {})) {
    if (mode === 'still') at += ` ${k}="${fmt(fn(STILL_T))}"`
    else {
      at += ` ${k}="${fmt(fn(0))}"`
      anim += `<animate attributeName="${k}" dur="${LOOP}s" repeatCount="indefinite" values="${ts.map(t => fmt(fn(t))).join(';')}"/>`
    }
  }
  return `<${tag}${at}>${anim}${kids || ''}</${tag}>`
}
function moved(posFn, rotFn, kids, mode) {
  if (mode === 'still') {
    const p = posFn(STILL_T)
    return `<g transform="translate(${fmt(p.x)} ${fmt(p.y)})"><g transform="rotate(${fmt(rotFn(STILL_T))})">${kids}</g></g>`
  }
  const p0 = posFn(0)
  return (
    `<g transform="translate(${fmt(p0.x)} ${fmt(p0.y)})">` +
    `<animateTransform attributeName="transform" type="translate" dur="${LOOP}s" repeatCount="indefinite" values="${ts.map(t => { const p = posFn(t); return `${fmt(p.x)} ${fmt(p.y)}` }).join(';')}"/>` +
    `<g transform="rotate(${fmt(rotFn(0))})"><animateTransform attributeName="transform" type="rotate" dur="${LOOP}s" repeatCount="indefinite" values="${ts.map(t => fmt(rotFn(t))).join(';')}"/>${kids}</g></g>`
  )
}
const dpath = segs => 'M' + fmt(segs[0].p0.x) + ' ' + fmt(segs[0].p0.y) + segs.map(s => ` C${fmt(s.c1.x)} ${fmt(s.c1.y)} ${fmt(s.c2.x)} ${fmt(s.c2.y)} ${fmt(s.p1.x)} ${fmt(s.p1.y)}`).join('')

const D1 = dpath(R1)
const D2 = dpath(R2)

// ---------- content ----------
const PURSER = [
  { a: 0, b: 3.6, now: 'reading the request', done: '—', next: 'pick the route' },
  { a: 3.6, b: 8.4, now: 'cruising at high', done: '2 steps', next: 'run the tests' },
  { a: 8.4, b: 11.7, now: 'context past 60%', done: '4 steps', next: 'hand off at 80%' },
  { a: 11.7, b: 14.6, now: 'handing over', done: 'handoff.md saved', next: 'fresh start' },
  { a: 14.6, b: 19.0, now: 'new flight, full tank', done: 'handoff picked up', next: 'keep going' },
]
const purserOp = (v, i) => t => {
  const first = i === 0
  const last = i === PURSER.length - 1
  const inn = first ? (t >= 19.2 ? fadeWin(t, 19.2, 20) : t < v.b - 0.4 ? 1 : 0) : fadeWin(t, v.a - 0.4, v.a + 0.4)
  const out = last ? 1 - fadeWin(t, RESET0, RESET1) : first ? 1 - fadeWin(t, v.b - 0.4, v.b + 0.4) : 1 - fadeWin(t, v.b - 0.4, v.b + 0.4)
  if (first) return t >= 19.2 ? fadeWin(t, 19.2, 20) : out
  return inn * out
}

function pill(label, x, y, pal, extra = {}) {
  const w = Math.round(label.length * 7.3 + 22)
  return (
    `<g transform="translate(${fmt(x)} ${fmt(y)})"${attrs(extra)}>` +
    `<rect x="${fmt(-w / 2)}" y="-11" width="${w}" height="22" rx="11" fill="${pal.panel}" stroke="${pal.orange}" stroke-opacity="0.55" stroke-width="1.2"/>` +
    `<text y="4.6" text-anchor="middle" font-size="13" font-weight="500" fill="${pal.strong}">${label}</text></g>`
  )
}

function planeGlyph(pal) {
  // a refined swept chevron (heading marker) with a soft glow and a fading contrail, not a clip-art airliner
  return (
    `<ellipse rx="26" ry="12" fill="url(#glow)"/>` +
    `<rect x="-52" y="-1.1" width="40" height="2.2" rx="1.1" fill="url(#trail)"/>` +
    `<path d="M15 0L-12-8L-7.5 0L-12 8Z" fill="${pal.orange}" stroke="${pal.orange}" stroke-width="2.4" stroke-linejoin="round"/>`
  )
}

function scene(pal, mode) {
  const g = []
  const live = mode === 'anim'

  // route drawn so far (orange) + passed waypoint dots + tags
  const routeDrawn = (D, tab, prog, op) =>
    node('path', { d: D, fill: 'none', stroke: pal.orange, 'stroke-width': 2.2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'stroke-dasharray': `${fmt(tab.L)} ${fmt(tab.L + 2)}` },
      { 'stroke-dashoffset': t => (t >= 19.9 ? tab.L : tab.L * (1 - prog(t))), opacity: op }, '', mode)
  g.push(routeDrawn(D1, T1, p1, resetFade))
  g.push(routeDrawn(D2, T2, p2, resetFade))

  const wps = [...WP1.map((w, i) => ({ ...w, t: wpTimes1[i] })), ...WP2.map((w, i) => ({ ...w, t: wpTimes2[i] }))]
  for (const w of wps) {
    g.push(
      node('circle', { cx: w.p.x, cy: w.p.y, r: 3.6, fill: pal.orange }, { opacity: t => fadeWin(t, w.t - 0.05, w.t + 0.45) * resetFade(t) }, '', mode),
    )
    const tagOp = t => fadeWin(t, w.t - 0.25, w.t + 0.45) * resetFade(t)
    const rise = t => 5 * (1 - fadeWin(t, w.t - 0.25, w.t + 0.45))
    const wd = Math.round(w.name.length * 7.3 + 22)
    const inner =
      `<rect x="${fmt(-wd / 2)}" y="-12" width="${wd}" height="24" rx="12" fill="${pal.panel}" stroke="${pal.orange}" stroke-opacity="0.55" stroke-width="1.2"/>` +
      `<text y="4.6" text-anchor="middle" font-size="13" font-weight="500" fill="${pal.strong}">${w.name}</text>`
    g.push(wrapOpacity(w, tagOp, rise, inner, mode))
  }

  // handoff stop tag + card
  const stopTag = `<rect x="-56" y="-12" width="112" height="24" rx="12" fill="${pal.panel}" stroke="${pal.orange}" stroke-opacity="0.55" stroke-width="1.2"/><text y="4.6" text-anchor="middle" font-size="13" font-weight="500" fill="${pal.strong}">handoff · 80%</text>`
  g.push(node('g', { transform: `translate(704 ${GROUND_Y - 84})` }, { opacity: t => fadeWin(t, TB - 0.7, TB + 0.1) * resetFade(t) }, stopTag, mode))

  const cardPos = t => {
    const u = easeIO((t - 11.4) / 1.4)
    return { x: 670 + 64 * u, y: 408 - 14 * Math.sin(Math.PI * u) }
  }
  const cardOp = t => fadeWin(t, 11.2, 11.7) * (1 - fadeWin(t, 13.0, 13.7))
  g.push(wrapCard(pal, cardPos, cardOp, mode))

  // aircraft
  const plane = (pl, kids) =>
    moved(t => { const q = pl.pos(t); return { x: q.x, y: q.y } }, t => pl.pos(t).deg, planeGlyph(pal), mode)
  const planeWrap = (pl) => {
    // opacity on an outer g
    const inner = plane(pl)
    return node('g', {}, { opacity: pl.op }, inner, mode)
  }
  g.push(planeWrap(plane1))
  g.push(planeWrap(plane2))
  return g.join('\n')
}

function wrapOpacity(w, tagOp, rise, inner, mode) {
  const body = moved(t => ({ x: w.p.x, y: w.p.y - 27 + rise(t) }), () => 0, inner, mode)
  return node('g', {}, { opacity: tagOp }, body, mode)
}
function wrapCard(pal, cardPos, cardOp, mode) {
  const inner =
    `<g transform="translate(-9 -12)"><path d="M0 2a2 2 0 0 1 2-2h9l7 7v15a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2Z" fill="${pal.panel}" stroke="${pal.strong}" stroke-width="1.3" stroke-linejoin="round"/>` +
    `<path d="M11 0v7h7" fill="none" stroke="${pal.strong}" stroke-width="1.3" stroke-linejoin="round"/><path d="M4 12h10M4 16h10M4 20h6" stroke="${pal.orange}" stroke-width="1.3" stroke-linecap="round"/></g>` +
    `<text y="24" text-anchor="middle" font-size="12" fill="${pal.muted}">handoff.md</text>`
  const body = moved(cardPos, () => 0, inner, mode)
  return node('g', {}, { opacity: cardOp }, body, mode)
}

// ---------- static base ----------
function base(pal, id) {
  const out = []
  // bands + labels
  const lines = Object.entries(BAND)
  for (const [name, y] of lines) {
    out.push(`<line x1="118" y1="${y}" x2="912" y2="${y}" stroke="${pal.band}" stroke-width="1"/>`)
    out.push(`<text x="104" y="${y + 4}" text-anchor="end" font-size="13" fill="${pal.muted}">${name}</text>`)
  }
  out.push(`<line x1="118" y1="${CEIL_Y}" x2="912" y2="${CEIL_Y}" stroke="${pal.ceiling}" stroke-width="1.2"/>`)
  out.push(`<text x="912" y="${CEIL_Y - 8}" text-anchor="end" font-size="12.5" fill="${pal.muted}">ceiling · never past the top</text>`)
  // ground + runways
  out.push(`<line x1="100" y1="${GROUND_Y}" x2="912" y2="${GROUND_Y}" stroke="${pal.ground}" stroke-width="1.2"/>`)
  for (const [x0, x1] of [[96, 146], [650, 780]]) {
    out.push(`<line x1="${x0}" y1="${GROUND_Y}" x2="${x1}" y2="${GROUND_Y}" stroke="${pal.strong}" stroke-opacity=".55" stroke-width="3" stroke-linecap="round"/>`)
    out.push(`<line x1="${x0 + 6}" y1="${GROUND_Y}" x2="${x1 - 6}" y2="${GROUND_Y}" stroke="${pal.bg0}" stroke-width="1" stroke-dasharray="5 6"/>`)
  }
  out.push(`<text x="714" y="${GROUND_Y + 19}" text-anchor="middle" font-size="12.5" fill="${pal.muted}">handoff stop</text>`)
  out.push(`<text x="121" y="${GROUND_Y + 19}" text-anchor="middle" font-size="12.5" fill="${pal.muted}">start</text>`)
  // planned route (faint, dashed) and hollow waypoint rings
  out.push(`<path d="${D1}" fill="none" stroke="${pal.planned}" stroke-width="1.4" stroke-dasharray="2 6" stroke-linecap="round"/>`)
  out.push(`<path d="${D2}" fill="none" stroke="${pal.planned}" stroke-width="1.4" stroke-dasharray="2 6" stroke-linecap="round"/>`)
  for (const w of [...WP1, ...WP2]) out.push(`<circle cx="${w.p.x}" cy="${w.p.y}" r="4.6" fill="${pal.bg1}" stroke="${pal.ring}" stroke-width="1.3"/>`)
  // judge: a small tower with a slow radar pulse
  const jx = 246
  out.push(`<g transform="translate(${jx} ${GROUND_Y})"><rect x="-2.2" y="-30" width="4.4" height="30" rx="1.5" fill="${pal.strong}" fill-opacity=".7"/><path d="M-9 -34 A9 9 0 0 1 9 -34" fill="none" stroke="${pal.strong}" stroke-opacity=".7" stroke-width="1.6" stroke-linecap="round"/><circle cy="-31" r="2.6" fill="${pal.orange}"/></g>`)
  out.push(`<text x="${jx}" y="${GROUND_Y + 19}" text-anchor="middle" font-size="12.5" fill="${pal.muted}">judge</text>`)
  // caption
  out.push(`<text x="118" y="${GROUND_Y + 50}" font-size="14" fill="${pal.muted}">Each dot is a prompt. Height is the effort the judge picks for it.</text>`)
  // purser rule
  out.push(`<line x1="118" y1="516" x2="912" y2="516" stroke="${pal.band}" stroke-width="1"/>`)
  return out.join('\n')
}

function radar(pal) {
  const jx = 246
  const ring = (begin) =>
    `<circle cx="${jx}" cy="${GROUND_Y - 31}" r="6" fill="none" stroke="${pal.orange}" stroke-width="1.3" opacity="0">` +
    `<animate attributeName="r" values="6;26" dur="4.2s" begin="${begin}" repeatCount="indefinite" calcMode="spline" keyTimes="0;1" keySplines="0.2 0.6 0.3 1"/>` +
    `<animate attributeName="opacity" values="0;0.55;0" dur="4.2s" begin="${begin}" repeatCount="indefinite" keyTimes="0;0.2;1"/></circle>`
  return ring('0s') + ring('2.1s')
}

function gauge(pal, mode) {
  const GX = 118
  const GY = 52
  const GW = 262
  const GH = 7
  const out = []
  out.push(`<text x="${GX}" y="40" font-size="13.5" fill="${pal.muted}">Context · the fuel</text>`)
  out.push(`<rect x="${GX}" y="${GY}" width="${GW}" height="${GH}" rx="${GH / 2}" fill="${pal.gaugeBg}"/>`)
  const color = t => {
    const f = gaugeFrac(t)
    if (f < 0.6) return pal.base
    if (f < 0.8) return mix(pal.base, pal.orange, 0.35 + 0.65 * ((f - 0.6) / 0.2) * 0.5)
    return pal.orange
  }
  out.push(node('rect', { x: GX, y: GY, height: GH, rx: GH / 2 },
    { width: t => Math.max(0.01, GW * gaugeFrac(t)), fill: t => color(t) }, '', mode))
  for (const [frac, label, hot] of [[0.6, '60%', t => fadeWin(t, t60 - 0.05, t60 + 0.5) * resetFade(t) * (t < 13 ? 1 : 0)], [0.8, '80%', t => fadeWin(t, t80 - 0.3, t80) * resetFade(t) * (t < 13.2 ? 1 : 0)]]) {
    const x = GX + GW * frac
    out.push(`<line x1="${x}" y1="${GY - 3}" x2="${x}" y2="${GY + GH + 3}" stroke="${pal.muted}" stroke-width="1.2"/>`)
    out.push(`<text x="${x}" y="${GY + GH + 17}" text-anchor="middle" font-size="12" fill="${pal.muted}">${label}</text>`)
    out.push(node('g', {}, { opacity: hot },
      `<line x1="${x}" y1="${GY - 3}" x2="${x}" y2="${GY + GH + 3}" stroke="${pal.orange}" stroke-width="1.6"/><text x="${x}" y="${GY + GH + 17}" text-anchor="middle" font-size="12" font-weight="600" fill="${pal.orange}">${label}</text>`, mode))
  }
  return out.join('\n')
}

function purser(pal, mode) {
  const out = []
  PURSER.forEach((v, i) => {
    const text =
      `<text x="480" y="552" text-anchor="middle" font-size="16.5">` +
      `<tspan fill="${pal.muted}">Now </tspan><tspan fill="${pal.strong}" font-weight="500">${v.now}</tspan>` +
      `<tspan fill="${pal.muted}">  ·  Done </tspan><tspan fill="${pal.strong}" font-weight="500">${v.done}</tspan>` +
      `<tspan fill="${pal.muted}">  ·  Next </tspan><tspan fill="${pal.strong}" font-weight="500">${v.next}</tspan></text>`
    out.push(node('g', {}, { opacity: purserOp(v, i) }, text, mode))
  })
  return out.join('\n')
}

function svg(theme) {
  const pal = PAL[theme]
  const id = theme
  const defs =
    `<defs><linearGradient id="bg-${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.bg0}"/><stop offset="1" stop-color="${pal.bg1}"/></linearGradient>` +
    `<radialGradient id="glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${pal.orange}" stop-opacity="${pal.glowA}"/><stop offset="1" stop-color="${pal.orange}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="trail" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${pal.orange}" stop-opacity="0"/><stop offset="1" stop-color="${pal.orange}" stop-opacity="0.55"/></linearGradient>` +
    `<radialGradient id="halo-${id}" cx=".5" cy=".42" r=".6"><stop offset="0" stop-color="${pal.orange}" stop-opacity="${theme === 'dark' ? 0.07 : 0.06}"/><stop offset="1" stop-color="${pal.orange}" stop-opacity="0"/></radialGradient></defs>`
  const style = `<style>text{font-family:${FONT}}.still{display:none}@media (prefers-reduced-motion:reduce){.live{display:none}.still{display:inline}}</style>`
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-labelledby="t d">` +
    `<title id="t">Cruise: a flight route</title>` +
    `<desc id="d">A route crosses the sky. Each dot is a prompt and the aircraft's height is the reasoning effort picked for it, never above a ceiling. A fuel gauge shows the context filling up; at 80% the aircraft lands at a handoff stop, hands over handoff.md, and a new aircraft with a full tank takes off from the same point. A line at the bottom says what is happening now, what is done and what is next.</desc>` +
    defs + style +
    `<rect width="${W}" height="${H}" fill="url(#bg-${id})"/><rect width="${W}" height="${H}" fill="url(#halo-${id})"/>` +
    base(pal, id) +
    `<g class="live">${radar(pal)}${gauge(pal, 'anim')}${purser(pal, 'anim')}${scene(pal, 'anim')}</g>` +
    `<g class="still">${gauge(pal, 'still')}${purser(pal, 'still')}${scene(pal, 'still')}</g>` +
    `</svg>`
  )
}

// ---------- logo ----------
function markInner(pal, uid) {
  // a single orange route that climbs to a waypoint, over a faint horizon, on a rounded tile
  return (
    `<defs><linearGradient id="tile-${uid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${pal.tile0}"/><stop offset="1" stop-color="${pal.tile1}"/></linearGradient></defs>` +
    `<rect x=".75" y=".75" width="126.5" height="126.5" rx="31" fill="url(#tile-${uid})" stroke="${pal.tileStroke}" stroke-width="1.5"/>` +
    `<line x1="20" y1="98" x2="108" y2="98" stroke="${pal.strong}" stroke-opacity=".22" stroke-width="5" stroke-linecap="round"/>` +
    `<path d="M24 86C54 86 56 40 86 40" fill="none" stroke="${pal.orange}" stroke-width="11" stroke-linecap="round"/>` +
    `<circle cx="98" cy="40" r="13" fill="${pal.orange}"/>` +
    `<circle cx="98" cy="40" r="5" fill="${pal.tile1}"/>`
  )
}
function markSvg(theme) {
  const pal = PAL[theme]
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img" aria-label="Cruise">${markInner(pal, 'm' + theme)}</svg>\n`
}
function logoSvg(theme) {
  const pal = PAL[theme]
  const sub = theme === 'dark' ? '#8B949E' : '#57606A'
  const main = theme === 'dark' ? '#E6EDF3' : '#1F2430'
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 180" width="640" height="180" role="img" aria-label="Cruise, cruise control for Claude Code">` +
    `<g transform="translate(24 26)">${markInner(pal, 'l' + theme)}</g>` +
    `<text x="176" y="98" font-family='${FONT}' font-size="68" font-weight="700" letter-spacing="-2" fill="${main}">Cruise</text>` +
    `<text x="179" y="132" font-family='${FONT}' font-size="21" font-weight="500" fill="${sub}">Cruise control for Claude Code</text></svg>\n`
  )
}

for (const theme of ['dark', 'light']) {
  fs.writeFileSync(path.join(OUT, `cruise-route-${theme}.svg`), svg(theme) + '\n')
  fs.writeFileSync(path.join(OUT, `logo-${theme}.svg`), logoSvg(theme))
}
fs.writeFileSync(path.join(OUT, 'logo-mark.svg'), markSvg('dark'))
fs.writeFileSync(path.join(OUT, 'logo-mark-light.svg'), markSvg('light'))
console.log('waypoint times', wpTimes1.map(v => v.toFixed(2)).join(' '), '|', wpTimes2.map(v => v.toFixed(2)).join(' '), 't60', t60.toFixed(2), 'L1', T1.L.toFixed(0), 'L2', T2.L.toFixed(0))
for (const f of fs.readdirSync(OUT)) console.log(f, fs.statSync(path.join(OUT, f)).size)
