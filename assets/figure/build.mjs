// Builds the animated "how Cruise works" figure as two standalone SVGs (dark and light).
// The motion is SMIL only (no script), so GitHub keeps it when the SVG is used as a README image.
//
//   node assets/figure/build.mjs --kit <path to the anatomy skill>   (default: ~/.claude/skills/anatomy)
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const flag = process.argv.indexOf("--kit");
const KIT = flag > -1 ? process.argv[flag + 1] : join(homedir(), ".claude/skills/anatomy");
const k = await import(pathToFileURL(join(KIT, "kit/iso-kit.mjs")).href);
const OUT = join(HERE, "..");

const W = 960;
const H = 600;
const DUR = 19;
const PLATE = { x: -172, y: -82, w: 344, d: 164, r: 10 };
const PLATE_H = 12;
const FOOT_H = 5;

const fitted = k.fitProjection(
  [...k.boxCorners(PLATE, -PLATE_H - FOOT_H, 0), [109, -40, 92], [150, -50, 40], [-88, 0, 48]],
  W - 80,
  H - 30,
  { pad: 12, azimuth: 36, elevation: 34 },
);
// shifted right and down to leave the top-left corner for the title and the bottom-left for the captions
const P = { ...fitted, origin: [fitted.origin[0] + 52, fitted.origin[1] + 18] };

const at = (p) => k.iso(p, P);
const S = (paths, style) => k.solidSvg(paths, style);
const L = (d, style) => k.lineSvg(d, style);
const D = (points, style) => k.dotsSvg(points, style);
const T = (xy, z, text, style = {}, along = "x") => k.faceTextSvg(k.topMatrix(xy, z, P, along), text, { size: 4.4, tone: "mid", ...style });
const key = (x, y, bias = 0) => k.depthOf([x, y, 0], P) + bias;

// ---- animation helpers ----------------------------------------------------------------------
const EASE = "0.45 0 0.2 1";
const screenDelta = (dx, dy, dz) => {
  const [ox, oy] = at([0, 0, 0]);
  const [x, y] = at([dx, dy, dz]);
  return `${(x - ox).toFixed(2)} ${(y - oy).toFixed(2)}`;
};

// A track: start value, then [from, to, value] moves. Holds stay flat; the loop closes on the start value.
function track(start, moves, end = start) {
  const ts = [0];
  const vs = [start];
  let last = start;
  for (const [from, to, value] of moves) {
    if (from > ts[ts.length - 1] + 1e-6) { ts.push(from); vs.push(last); }
    ts.push(to);
    vs.push(value);
    last = value;
  }
  if (last !== end) { ts.push(DUR - 0.4); vs.push(last); ts.push(DUR); vs.push(end); }
  else { ts.push(DUR); vs.push(last); }
  return { ts, vs };
}
const keyTimes = (ts) => ts.map((t) => (t / DUR).toFixed(4)).join(";");
const splines = (ts) => ts.slice(1).map(() => EASE).join(";");
const BEGIN = ` dur="${DUR}s" repeatCount="indefinite"`;
const move = ({ ts, vs }) => `<animateTransform attributeName="transform" type="translate" values="${vs.join(";")}" keyTimes="${keyTimes(ts)}" calcMode="spline" keySplines="${splines(ts)}"${BEGIN}/>`;
const fade = ({ ts, vs }) => `<animate attributeName="opacity" values="${vs.join(";")}" keyTimes="${keyTimes(ts)}"${BEGIN}/>`;
const moving = (tr, inner, extra = "") => `<g${extra}>${move(tr)}${inner}</g>`;
const fading = (tr, inner, extra = "") => `<g opacity="${tr.vs[0]}"${extra}>${fade(tr)}${inner}</g>`;
const pulse = (from, to, ramp = 0.35) => track(0, [[from, from + ramp, 1], [to, to + ramp, 0]]);

// ---- scene ------------------------------------------------------------------------------------
const items = [];
const put = (k0, svg) => items.push({ key: k0, svg });
const FLOOR = -1e9;

function plate() {
  const out = [`<path class="iso-halo" d="${k.haloOf(PLATE, -PLATE_H - FOOT_H, PLATE_H, P)}"/>`];
  const feet = [...k.corners(PLATE, 24)].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
  for (const [x, y] of feet) {
    out.push(S(k.cylinder(x, y, 8, -PLATE_H - FOOT_H, 1.8, P, 28), { tone: "lo" }));
    out.push(S(k.cylinder(x, y, 6, -PLATE_H - FOOT_H + 1.8, FOOT_H - 1.8, P, 28), { tone: "mid" }));
  }
  out.push(S(k.slabOf(PLATE, -PLATE_H, PLATE_H, P, 8, 1.6), { tone: "mid" }));
  out.push(L(k.planOutline(k.insetPlan(PLATE, 5), 0, P), { tone: "lo" }));
  const screws = k.corners(PLATE, 11);
  out.push(L(screws.map(([x, y]) => k.ring(x, y, 2.3, 0, P, 16)).join(""), { tone: "lo" }));
  out.push(D(screws.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
  const label = { x: 118, y: 66, w: 44, d: 10, r: 1.4 };
  out.push(S(k.slabOf(label, 0, 0.6, P, 3), { tone: "lo", crease: "none" }));
  out.push(T([label.x + 4, label.y + 6.2], 0.6, "CRUISE  v1", { size: 4.6, tone: "hi" }));
  return out.join("");
}
put(FLOOR, plate());

// Message conveyor ------------------------------------------------------------------------------
const BELT = { x: -170, y: -15, w: 152, d: 30, r: 2.5 };
const CARD = { x: -22, y: -11, w: 44, d: 22, r: 2.2 };
const CARD_Z = 3;
function conveyor() {
  const out = [];
  for (const y of [-21, 15]) {
    out.push(S(k.slabOf({ x: BELT.x, y, w: BELT.w, d: 6, r: 1.5 }, 0, 5, P, 3, 0.5), { tone: "mid" }));
    out.push(D([BELT.x + 8, BELT.x + BELT.w - 8].map((x) => at([x, y + 3, 5])), { size: 0.42 }));
  }
  out.push(S(k.slabOf(BELT, 0, 3, P, 4, 0.4), { tone: "lo" }));
  const lugs = k.topTicks(BELT.x + 6, BELT.x + BELT.w - 4, 6, 4, BELT.y + 3, 3, [BELT.d - 6, BELT.d - 6], P, "x");
  out.push(L(lugs.minor, { tone: "faint" }));
  out.push(T([BELT.x + 6, BELT.y + BELT.d + 7.5], 0, "MESSAGES", { size: 4.6, tone: "mid" }));
  for (const x of [BELT.x + 4, BELT.x + BELT.w - 8]) out.push(S(k.cylinder(x + 2, 0, 2.4, 3, 1.4, P, 16), { tone: "mid" }));
  return out.join("");
}
put(key(-105, 0, 0), conveyor());

// Cards: a typo (thin), a login form (two sheets), a whole repo (a pile)
const CARD_X0 = -150;
const JUDGE_X = -88;
const READ_X = -62;
const TRAY_X = -36;
function cardArt(sheets, label) {
  const out = [];
  for (let i = 0; i < sheets; i++) {
    const shift = (sheets - 1 - i) * 1.4;
    const plan = { ...CARD, x: CARD.x + shift, y: CARD.y - shift * 0.6 };
    out.push(S(k.slabOf(plan, CARD_Z + i * 2.6, 2.2, P, 4, 0.3), { tone: i === sheets - 1 ? "hi" : "mid" }));
  }
  const topZ = CARD_Z + (sheets - 1) * 2.6 + 2.2;
  out.push(L(k.lineOnTop([CARD.x + 5, CARD.y + 17], [CARD.x + CARD.w - 5, CARD.y + 17], topZ, P), { tone: "faint" }));
  out.push(T([CARD.x + 5, CARD.y + 11.5], topZ, label, { size: 4.2, tone: "hi" }));
  out.push(L(k.lineOnTop([CARD.x + 5, CARD.y + 5], [CARD.x + 5 + 10 * Math.min(sheets, 3), CARD.y + 5], topZ, P), { tone: "faint" }));
  return out.join("");
}
const cards = [
  { sheets: 1, label: "fix a typo", enter: 0.2, read: [1.4, 2.7], leave: [2.7, 3.9], gone: 4.4 },
  { sheets: 2, label: "add a login", enter: 4.8, read: [6.0, 7.5], leave: [7.5, 8.7], gone: 9.2 },
  { sheets: 4, label: "review repo", enter: 9.6, read: [10.8, 12.4], leave: [12.4, 13.6], gone: 14.1 },
];
for (const c of cards) {
  const at0 = screenDelta(CARD_X0, 0, 0);
  const atJudge = screenDelta(READ_X, 0, 0);
  const atTray = screenDelta(TRAY_X, 0, 0);
  const slide = track(at0, [[c.enter, c.read[0], atJudge], [c.leave[0], c.leave[1], atTray]], at0);
  const vis = track(0, [[c.enter, c.enter + 0.4, 1], [c.gone - 0.5, c.gone, 0]]);
  put(key(-97, 0, 0.01), fading(vis, moving(slide, cardArt(c.sheets, c.label))));
}

// Judge: an arch the messages pass under, with one lens ---------------------------------------
const POST_B = { x: -95, y: -42, w: 14, d: 7, r: 2 };
const POST_F = { x: -95, y: 35, w: 14, d: 7, r: 2 };
const LINTEL = { x: -98, y: -43, w: 20, d: 64, r: 2 };
const LINTEL_Z = 24;
const HEAD = { x: -96, y: -10, w: 16, d: 20, r: 3 };
const HEAD_Z = LINTEL_Z + 7;
const LENS = [JUDGE_X, 0];
const LENS_Z = HEAD_Z + 7;
function post(plan) {
  const out = [S(k.slabOf(plan, 0, LINTEL_Z, P, 3, 0.5), { tone: "mid" })];
  out.push(L(k.rise([plan.x + plan.w * 0.5, plan.y + plan.d, 0], 3, LINTEL_Z - 3, P), { tone: "faint" }));
  out.push(D([at([plan.x + plan.w / 2, plan.y + plan.d / 2, LINTEL_Z - 4])], { size: 0.45 }));
  return out.join("");
}
put(key(-88, -38, 0), post(POST_B));
function lintel() {
  const out = [S(k.slabOf(LINTEL, LINTEL_Z, 7, P, 3, 0.6), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(LINTEL, 2), LINTEL_Z + 7, P, 3), { tone: "faint" }));
  out.push(S(k.slabOf(HEAD, HEAD_Z, 7, P, 5, 0.6), { tone: "hi" }));
  out.push(S(k.cylinder(LENS[0], LENS[1], 6.2, LENS_Z, 1.4, P, 36), { tone: "mid" }));
  out.push(S(k.cylinder(LENS[0], LENS[1], 4.2, LENS_Z + 1.4, 1.2, P, 32), { tone: "lo", crease: "none" }));
  out.push(L(k.ring(LENS[0], LENS[1], 2.4, LENS_Z + 2.6, P, 24), { tone: "hi" }));
  out.push(D([at([LENS[0], LENS[1], LENS_Z + 2.6])], { size: 0.7, tone: "hi" }));
  const lens = k.onTop(k.circleRing(LENS[0], LENS[1], 4.2, 28), LENS_Z + 2.6, P, true);
  const glow = track(0, cards.flatMap((c) => [[c.read[0] - 0.2, c.read[0] + 0.2, 1], [c.read[1] - 0.2, c.read[1] + 0.3, 0]]));
  out.push(fading(glow, `<path d="${lens}" style="fill:var(--cr-lamp-blue);filter:blur(2.4px)" opacity=".9"/><path d="${lens}" style="fill:var(--cr-lamp-blue)"/>`));
  out.push(T([-83, -14], LINTEL_Z + 7, "JUDGE", { size: 4.8, tone: "hi" }, "y"));
  out.push(L([-1, 0, 1].map((i) => k.lineOnTop([HEAD.x + 3, 0 + i * 4.2], [HEAD.x + 5.8, i * 4.2], HEAD_Z + 7, P)).join(""), { tone: "lo" }));
  out.push(D([at([LINTEL.x + 3, LINTEL.y + 3, LINTEL_Z + 7]), at([LINTEL.x + 3, LINTEL.y + LINTEL.d - 3, LINTEL_Z + 7])], { size: 0.5 }));
  return out.join("");
}
put(key(-88, 0, 9), lintel());

// Throttle: a fader with three detents and a fixed ceiling stop ------------------------------
const THR = { x: 8, y: -66, w: 52, d: 104, r: 5 };
const SLOT_X = 24;
const POS = { low: 27, medium: 0, high: -27 };
const CAR = { x: SLOT_X - 9, y: -7, w: 18, d: 14, r: 2.5 };
const CAR_Z = 6;
const LAMPS = { low: "green", medium: "blue", high: "red" };
function throttleBase() {
  const out = [S(k.slabOf(THR, 0, 6, P, 5, 0.8), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(THR, 3), 6, P, 4), { tone: "faint" }));
  const slot = { x: SLOT_X - 3, y: -50, w: 6, d: 88, r: 2.5 };
  out.push(S(k.slabOf(slot, 6, 0.5, P, 4), { tone: "faint", crease: "none", flat: true }));
  out.push(L(k.planOutline(slot, 6.5, P, 4), { tone: "lo" }));
  for (const [name, y] of Object.entries(POS)) {
    out.push(L(k.lineOnTop([SLOT_X + 5, y], [SLOT_X + 11, y], 6, P), { tone: "mid" }));
    out.push(S(k.cylinder(SLOT_X + 20, y, 3.4, 6, 2.2, P, 20), { tone: "mid" }));
    out.push(L(k.ring(SLOT_X + 20, y, 2.1, 8.2, P, 16), { tone: "lo" }));
    out.push(T([SLOT_X + 26, y + 1.3], 6, name === "medium" ? "MED" : name.toUpperCase(), { size: 4.6, tone: "hi" }));
  }
  out.push(T([THR.x + 4, THR.y + THR.d - 3], 6, "EFFORT", { size: 4.6, tone: "mid" }));
  out.push(D([[THR.x + 5, THR.y + 5], [THR.x + THR.w - 5, THR.y + 5], [THR.x + 5, THR.y + THR.d - 5], [THR.x + THR.w - 5, THR.y + THR.d - 5]].map(([x, y]) => at([x, y, 6])), { size: 0.5 }));
  return out.join("");
}
put(key(34, -14, 0), throttleBase());
function lamps() {
  const out = [];
  const ring = (y, r, z) => k.onTop(k.circleRing(SLOT_X + 20, y, r, 22), z, P, true);
  const hold = { low: [[2.9, 8.0]], medium: [[8.0, 12.6]], high: [[12.6, 18.4]] };
  for (const [name, y] of Object.entries(POS)) {
    const fill = `var(--cr-lamp-${LAMPS[name]})`;
    const tr = track(0, hold[name].flatMap(([a, b]) => [[a, a + 0.25, 1], [b, b + 0.3, 0]]));
    out.push(fading(tr, `<path d="${ring(y, 3.4, 8.2)}" style="fill:${fill};filter:blur(3px)" opacity=".85"/><path d="${ring(y, 2.1, 8.2)}" style="fill:${fill}"/>`));
  }
  return out.join("");
}
put(key(34, -14, 0.5), lamps());
// carriage
const STOP = { x: SLOT_X - 7, y: -43, w: 12, d: 8, r: 1.8 };
function ceiling() {
  const out = [S(k.slabOf(STOP, 6, 10, P, 3, 0.6), { tone: "hi", lit: true })];
  out.push(L(k.lineOnTop([STOP.x + 3, STOP.y + 4], [STOP.x + STOP.w - 3, STOP.y + 4], 16, P), { tone: "red" }));
  out.push(T([SLOT_X + 8, -37], 6, "CEILING", { size: 4.6, tone: "hi" }, "y"));
  out.push(D([at([STOP.x + 3, STOP.y + 1.8, 16]), at([STOP.x + STOP.w - 3, STOP.y + 1.8, 16])], { size: 0.45 }));
  return out.join("");
}
put(key(34, -14, 0.4), ceiling());
function carriage() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(CAR, 2), CAR_Z, 0.1, P)}" style="filter:blur(3px)"/>`];
  out.push(S(k.slabOf(CAR, CAR_Z, 5, P, 4, 0.5), { tone: "mid" }));
  out.push(L(k.lineOnTop([CAR.x, 0], [CAR.x + CAR.w, 0], CAR_Z + 5, P), { tone: "faint" }));
  out.push(S(k.cylinder(SLOT_X, 0, 4.4, CAR_Z + 5, 6, P, 28), { tone: "hi", lit: true }));
  out.push(L(k.knurl(SLOT_X, 0, 4.4, CAR_Z + 5, CAR_Z + 11, 24, P), { tone: "lo" }));
  out.push(L(k.lineOnTop([SLOT_X, 0], [SLOT_X + 4.4, 0], CAR_Z + 11, P), { tone: "hi" }));
  out.push(D([at([SLOT_X, 0, CAR_Z + 11])], { size: 0.5, tone: "hi" }));
  out.push(D([at([CAR.x + 3, 4, CAR_Z + 5]), at([CAR.x + CAR.w - 3, 4, CAR_Z + 5])], { size: 0.42 }));
  return out.join("");
}
const slideY = (y) => screenDelta(0, y, 0);
const carriageTrack = track(slideY(POS.high), [
  [2.7, 3.7, slideY(POS.low)],
  [7.5, 8.5, slideY(POS.medium)],
  [12.4, 13.3, slideY(POS.high)],
]);
put(key(SLOT_X, 0, 0.3), moving(carriageTrack, carriage()));

// Context gauge -------------------------------------------------------------------------------
const GB = { x: 98, y: -64, w: 40, d: 40, r: 5 };
const CELLS = 10;
const CELL = { x: 108, y: -54, w: 20, d: 20, r: 4 };
const CELL_Z0 = 9;
const CELL_PITCH = 7.2;
const cellOn = (i) => 1.0 + (i + 1) * 1.55; // seconds at which cell i lights
function gaugeBase() {
  const out = [S(k.slabOf(GB, 0, 6, P, 5, 0.8), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(GB, 3), 6, P, 4), { tone: "faint" }));
  out.push(D(k.corners(GB, 6).map(([x, y]) => at([x, y, 6])), { size: 0.5 }));
  out.push(T([GB.x + 5, GB.y + GB.d - 3], 6, "CONTEXT", { size: 4.6, tone: "mid" }));
  const spineTop = CELL_Z0 + CELLS * CELL_PITCH + 1;
  out.push(S(k.slabOf({ x: CELL.x - 1, y: CELL.y - 4, w: CELL.w + 2, d: 2.4, r: 0.8 }, CELL_Z0 - 2, spineTop - CELL_Z0 + 1, P, 2), { tone: "faint", crease: "none" }));
  for (const [x, y] of [[CELL.x - 3, CELL.y - 3], [CELL.x + CELL.w + 3, CELL.y - 3]]) {
    out.push(S(k.slabOf({ x: x - 1.6, y: y - 1.6, w: 3.2, d: 3.2, r: 1 }, 6, spineTop - 6, P, 2, 0.3), { tone: "mid" }));
  }
  return out.join("");
}
put(key(118, -44, 0), gaugeBase());
function cells() {
  const out = [];
  for (let i = 0; i < CELLS; i++) {
    const z = CELL_Z0 + i * CELL_PITCH;
    out.push(S(k.slabOf(CELL, z, 5.6, P, 4, 0.3), { tone: "lo" }));
    out.push(L(k.planOutline(k.insetPlan(CELL, 2.4), z + 5.6, P, 3), { tone: "faint" }));
    const on = track(0, [[cellOn(i), cellOn(i) + 0.3, 1], [18.2, 18.8, 0]]);
    const lit = k.slabOf(CELL, z, 5.6, P, 4, 0.3);
    const tint = i === 7 ? "var(--cr-amber)" : i >= 8 ? "var(--cr-lamp-red)" : "var(--cr-lamp-blue)";
    out.push(fading(on, S(lit, { tone: "hi", lit: true }) + `<path d="${lit.top}" style="fill:${tint};stroke:none" opacity=".8"/>`));
  }
  return out.join("");
}
put(key(118, -44, 1), cells());
function marks() {
  const out = [];
  const tabZ = (frac) => CELL_Z0 + CELLS * CELL_PITCH * frac - 1.2;
  // 75% hangs on the right of the stack, 90% on the front, so the two never overlap on screen
  const right = { x: CELL.x + CELL.w + 3, y: CELL.y + 2, w: 12, d: 15, r: 1.6 };
  out.push(S(k.slabOf(right, tabZ(0.75), 2.2, P, 3, 0.3), { tone: "hi" }));
  out.push(L(k.lineOnTop([CELL.x + CELL.w, CELL.y + 9.5], [right.x, CELL.y + 9.5], tabZ(0.75) + 2.2, P), { tone: "mid" }));
  out.push(T([right.x + 1.4, CELL.y + 11.6], tabZ(0.75) + 2.2, "75%", { size: 4.4, tone: "hi" }));
  const front = { x: CELL.x + 2, y: CELL.y + CELL.d + 3, w: 16, d: 12, r: 1.6 };
  out.push(S(k.slabOf(front, tabZ(0.9), 2.2, P, 3, 0.3), { tone: "hi" }));
  out.push(L(k.lineOnTop([CELL.x + 10, CELL.y + CELL.d], [CELL.x + 10, front.y], tabZ(0.9) + 2.2, P), { tone: "red" }));
  out.push(T([front.x + 2, front.y + 8], tabZ(0.9) + 2.2, "90%", { size: 4.4, tone: "hi" }));
  return out.join("");
}
put(key(118, -44, 2), marks());
function bell() {
  const top = CELL_Z0 + CELLS * CELL_PITCH + 1;
  const out = [S(k.cylinder(CELL.x + CELL.w / 2, CELL.y + CELL.d / 2, 7, top, 3, P, 28), { tone: "mid" })];
  const cx = CELL.x + CELL.w / 2;
  const cy = CELL.y + CELL.d / 2;
  const lamp = k.onTop(k.circleRing(cx, cy, 5, 24), top + 3, P, true);
  const amber = track(0, [[cellOn(7), cellOn(7) + 0.3, 1], [18.2, 18.8, 0]]);
  const red = track(0, [[cellOn(8), cellOn(8) + 0.3, 1], [18.2, 18.8, 0]]);
  out.push(fading(amber, `<path d="${lamp}" style="fill:var(--cr-amber);filter:blur(3px)" opacity=".9"/><path d="${lamp}" style="fill:var(--cr-amber)"/>`));
  out.push(fading(red, `<path d="${lamp}" style="fill:var(--cr-lamp-red);filter:blur(3.5px)" opacity=".95"/><path d="${lamp}" style="fill:var(--cr-lamp-red)"/>`));
  out.push(L(k.ring(cx, cy, 5, top + 3, P, 24), { tone: "hi" }));
  return out.join("");
}
put(key(118, -44, 3), bell());
// the /handoff tag rises when the stack reaches 90%
const TAG = { x: 120, y: -6, w: 42, d: 15, r: 2.4 };
function tag() {
  const out = [`<path class="iso-halo" d="${k.haloOf(k.insetPlan(TAG, 2), 0, 0.1, P)}" style="filter:blur(4px)"/>`];
  out.push(S(k.slabOf(TAG, 0, 3, P, 4, 0.5), { tone: "hi", lit: true }));
  out.push(L(k.planOutline(k.insetPlan(TAG, 2), 3, P, 3), { tone: "faint" }));
  out.push(T([TAG.x + TAG.w / 2, TAG.y + 9.6], 3, "/handoff", { size: 5.2, tone: "hi", anchor: "middle" }));
  return out.join("");
}
const tagRise = track(screenDelta(0, 0, -16), [[cellOn(8), cellOn(8) + 0.8, screenDelta(0, 0, 14)], [18.2, 18.8, screenDelta(0, 0, -16)]]);
const tagVis = track(0, [[cellOn(8), cellOn(8) + 0.3, 1], [18.2, 18.7, 0]]);
put(key(141, 1, 0), fading(tagVis, moving(tagRise, tag())));

// Progress strip: the band above the prompt ----------------------------------------------------
const STRIP = { x: -150, y: 54, w: 262, d: 17, r: 3 };
const STEPS = [-118, -50, 18, 86];
function strip() {
  const out = [S(k.slabOf(STRIP, 0, 4, P, 4, 0.6), { tone: "mid" })];
  out.push(L(k.planOutline(k.insetPlan(STRIP, 2.4), 4, P, 3), { tone: "faint" }));
  const names = ["ask", "plan", "work", "done"];
  STEPS.forEach((x, i) => {
    out.push(D([at([x, STRIP.y + 11.5, 4])], { size: 0.6, tone: "hi" }));
    out.push(T([x + 2.6, STRIP.y + 12.8], 4, names[i], { size: 4.6, tone: "hi" }));
  });
  out.push(L(k.lineOnTop([STEPS[0], STRIP.y + 11.5], [STEPS[3], STRIP.y + 11.5], 4, P), { tone: "faint" }));
  out.push(T([STRIP.x + 6, STRIP.y + 6], 4, "NOW", { size: 4.6, tone: "mid" }));
  return out.join("");
}
put(key(-20, 62, 0), strip());
function marker() {
  const out = [S(k.slabOf({ x: -4.5, y: STRIP.y + 3, w: 9, d: 5.6, r: 1.4 }, 4, 4.4, P, 3, 0.4), { tone: "hi", lit: true })];
  out.push(D([at([0, STRIP.y + 5.8, 8.4])], { size: 0.5, tone: "hi" }));
  return out.join("");
}
const stepAt = (x) => screenDelta(x, 0, 0);
const markerTrack = track(stepAt(STEPS[0]), [
  [0.6, 1.2, stepAt(STEPS[0])],
  [4.8, 5.6, stepAt(STEPS[1])],
  [9.6, 10.4, stepAt(STEPS[2])],
  [14.0, 14.8, stepAt(STEPS[3])],
], stepAt(STEPS[0]));
put(key(-20, 62, 1), moving(markerTrack, marker()));

// Signal cable: from the judge to the throttle ----------------------------------------------
put(key(-30, 44, 0.2), k.wireSvg(at([-88, 34, 0.6]), at([8, 30, 3]), { via: [at([-88, 44, 0.6]), at([-4, 44, 0.6]), at([-4, 30, 0.6])], tone: "lit", flow: true, size: 1.1 }));

// ---- assemble -------------------------------------------------------------------------------
const body = items.sort((a, b) => a.key - b.key).map((i) => i.svg).join("");

const CAPTIONS = [
  { from: 0.0, to: 1.5, lines: ["1 · You send a message"] },
  { from: 1.5, to: 4.8, lines: ["2 · A tiny judge reads only that", "message, never your conversation"] },
  { from: 4.8, to: 13.2, lines: ["3 · It sets the effort the job needs,", "never above your ceiling"] },
  { from: 13.2, to: DUR, lines: ["4 · Context filling up? Cruise warns", "you and points to /handoff"] },
];
const phase = (c) => (c.from === 0
  ? { text: track(1, [[c.to - 0.35, c.to, 0], [DUR - 0.5, DUR, 1]]), dot: track(1, [[c.to - 0.35, c.to, 0.25], [DUR - 0.5, DUR, 1]]) }
  : { text: track(0, [[c.from, c.from + 0.35, 1], [c.to - 0.35, c.to, 0]], 0), dot: track(0.25, [[c.from, c.from + 0.35, 1], [c.to - 0.35, c.to, 0.25]], 0.25) });
function captions() {
  return CAPTIONS.map((c) => {
    const { text } = phase(c);
    const lines = c.lines.map((line, i) => `<tspan x="28" dy="${i === 0 ? 0 : 25}">${line}</tspan>`).join("");
    return `<g opacity="${text.vs[0]}">${fade(text)}<text x="28" y="${H - 76 - (c.lines.length - 1) * 12}" class="cr-caption">${lines}</text></g>`;
  }).join("");
}
function dots() {
  return CAPTIONS.map((c, i) => `<circle cx="${34 + i * 20}" cy="${H - 30}" r="4" class="cr-dot" opacity="${phase(c).dot.vs[0]}">${fade(phase(c).dot)}</circle>`).join("");
}
function title() {
  return `<text x="28" y="52" class="cr-title">Cruise</text><text x="28" y="76" class="cr-sub">cruise control for Claude Code</text>`;
}

const label =
  "An isometric bench that shows how Cruise works. Messages ride a conveyor under a small judge. The judge sets a three-notch effort fader that can never pass a fixed ceiling stop. A ten-cell context gauge fills up and, at 75% and 90%, lights its warning lamps and raises a /handoff tag. A progress strip tracks the request.";

for (const theme of ["dark", "light"]) {
  const style = `<style>
    .cr-card{fill:var(--anatomy-card);stroke:var(--anatomy-faint);stroke-width:1}
    .cr-title{fill:var(--anatomy-strong);font:700 36px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;letter-spacing:-.02em}
    .cr-sub{fill:var(--anatomy-muted);font:500 15px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif}
    .cr-caption{fill:var(--anatomy-strong);font:600 20px ui-sans-serif,system-ui,-apple-system,"Segoe UI",Helvetica,Arial,sans-serif;letter-spacing:.01em}
    .cr-dot{fill:var(--anatomy-strong)}
    .iso{--cr-amber:${theme === "dark" ? "#f5a524" : "#d97706"};--cr-lamp-red:var(--anatomy-red);--cr-lamp-green:var(--anatomy-green);--cr-lamp-blue:var(--anatomy-blue)}
    @media (prefers-reduced-motion: reduce){animate,animateTransform{display:none}}
  </style>`;
  const svg = k.figureSvg({
    width: W,
    height: H,
    label,
    standalone: theme,
    body: [style, `<rect class="cr-card" x="1" y="1" width="${W - 2}" height="${H - 2}" rx="18"/>`, body, title(), captions(), dots()],
  });
  mkdirSync(OUT, { recursive: true });
  writeFileSync(join(OUT, `cruise-bench-${theme}.svg`), svg);
  console.log("wrote", `cruise-bench-${theme}.svg`, (svg.length / 1024).toFixed(0) + " KB");
}
