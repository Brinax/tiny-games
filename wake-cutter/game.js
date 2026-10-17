(() => {
'use strict';
const GAME = 'wake-cutter';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 1; // U = size unit, scales with screen
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  U = Math.min(W, H) / 390;
  U = Math.max(1, Math.min(U, 1.8));
}
window.addEventListener('resize', resize); resize();

// ---- clip tagging + GoatCounter events ----
const params = new URLSearchParams(location.search);
const SRC = (params.get('src') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
const pending = [];
function track(name) {
  const path = GAME + '/' + name + (SRC ? '?src=' + SRC : '');
  const ev = { path, title: name + (SRC ? ' (' + SRC + ')' : ''), event: true };
  if (window.goatcounter && window.goatcounter.count) window.goatcounter.count(ev);
  else pending.push(ev);
  (window.__events = window.__events || []).push(name);
}
setInterval(() => { while (pending.length && window.goatcounter && window.goatcounter.count) window.goatcounter.count(pending.shift()); }, 1000);
if (SRC) track('visit-from-clip');

// ---- audio ----
let actx = null, muted = localStorage.getItem('wc_muted') === '1';
const muteBtn = document.getElementById('mute');
const setMuteIcon = () => { muteBtn.textContent = muted ? '🔇' : '🔊'; };
setMuteIcon();
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); muted = !muted; localStorage.setItem('wc_muted', muted ? '1' : '0'); setMuteIcon(); });
let master = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
}
// Tiny WebAudio synth. Every recipe takes (ctx, out, when, param) so the same code can play live
// or be rendered offline (the clip recorder renders window.__sfxLog through window.__SFX).
const noiseBufs = new WeakMap();
function noiseBuf(c) {
  let b = noiseBufs.get(c); if (b) return b;
  b = c.createBuffer(1, c.sampleRate * 0.6, c.sampleRate); const d = b.getChannelData(0);
  let s = 12345; for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) >>> 0; d[i] = s / 2147483648 - 1; }
  noiseBufs.set(c, b); return b;
}
function tone(c, out, t, f0, f1, dur, type, vol, atk) {
  const o = c.createOscillator(), g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + (atk || 0.004)); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.03);
}
function noise(c, out, t, dur, ftype, f0, f1, q, vol) {
  const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  s.buffer = noiseBuf(c); f.type = ftype; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  s.connect(f).connect(g).connect(out); s.start(t); s.stop(t + dur + 0.03);
}
const PENTA = [0, 2, 4, 7, 9];
const note = i => 392 * Math.pow(2, (Math.floor(i / 5) * 12 + PENTA[i % 5]) / 12); // G4 pentatonic, rising
const SFX = {
  start(c, o, t) { tone(c, o, t, 300, 600, 0.15, 'triangle', 0.12); },
  slice(c, o, t, n) { // crisp blade hit, rises with the slice chain
    const f = note(Math.min(n, 15) + 3);
    noise(c, o, t, 0.07, 'highpass', 5000, 2500, 0.7, 0.16);
    tone(c, o, t, f * 2, f, 0.07, 'square', 0.05, 0.002); tone(c, o, t + 0.005, f, f, 0.16, 'triangle', 0.09);
  },
  whoosh(c, o, t) { noise(c, o, t, 0.3, 'bandpass', 500, 2600, 2.5, 0.25); tone(c, o, t, 200, 420, 0.25, 'sine', 0.03, 0.08); },
  thud(c, o, t) {
    tone(c, o, t, 140, 38, 0.6, 'sine', 0.55, 0.003); tone(c, o, t, 90, 30, 0.5, 'triangle', 0.25, 0.003);
    noise(c, o, t, 0.5, 'lowpass', 1800, 120, 0.8, 0.35); tone(c, o, t + 0.05, 420, 60, 0.7, 'sawtooth', 0.05);
  },
  chime(c, o, t) { [0, 2, 4].forEach((k, i) => { const f = note(10 + k); tone(c, o, t + i * 0.07, f, f, 0.7, 'triangle', 0.12); tone(c, o, t + i * 0.07, f * 3, f * 3, 0.35, 'sine', 0.03); }); },
};
window.__SFX = SFX; window.__sfxLog = [];
const sfxGap = { slice: 35, whoosh: 160 }, sfxLast = {};
function sfx(name, p) {
  const now = performance.now();
  if (sfxGap[name]) { if (now - (sfxLast[name] || -1e9) < sfxGap[name]) return; sfxLast[name] = now; }
  window.__sfxLog.push({ n: name, p: p || 0, t: now });
  if (window.__sfxLog.length > 400) window.__sfxLog.shift();
  if (muted || !actx || actx.state !== 'running') return;
  try { SFX[name](actx, master, actx.currentTime + 0.005, p || 0); } catch (e) { /* audio is optional */ }
}

// ---- state ----
const rnd = (a, b) => a + Math.random() * (b - a);
const TAU = Math.PI * 2;
let best = +(localStorage.getItem('wc_best') || 0);
let state = 'ready'; // ready, play, dying, over
let P = { x: 0, y: 0, r: 7 };
let wake = [], bullets = [], parts = [], texts = [];
let runId = 0, t = 0, cuts = 0, score = 0, spawnT = 0, shake = 0, slow = 1, deathT = 0, overAt = 0, tier = 0, chainCut = 0, chainT = 0;
let runs = +(sessionStorage.getItem('wc_runs') || 0), funShown = sessionStorage.getItem('wc_fun') === '1';
window.__game = { get daily() { return daily; }, get score() { return score; }, get dinfo() { return dinfo; }, get state() { return state; }, get time() { return t; }, get cuts() { return cuts; }, get player() { return { x: P.x, y: P.y }; }, get bullets() { return bullets.map(b => ({ x: b.x, y: b.y, vx: b.vx, vy: b.vy, r: b.r })); }, get pr() { return P.r; } };
const TIERS = [0, 10, 20, 30, 45, 60];
// ---- daily challenge: bullet patterns come from a seeded RNG per UTC date ----
let daily = false, dinfo = TG.daily('wc'), newBest = false, gr = Math.random, gp = Math.random; // gr: positions, gp: which pattern (independent of where the player is)
const grnd = (a, b) => a + gr() * (b - a); // gameplay randomness (patterns); visuals keep rnd
window.__spawnLog = [];
window.__dailyPeek = (d, n) => { const keep = window.__today; window.__today = d; const g = TG.rng(GAME + ':' + TG.today()); window.__today = keep; return Array.from({ length: n || 8 }, () => +g().toFixed(6)); };
const HUES = [190, 90, 40, 170, 140, 260]; // kept away from bullet pink (~345)

function reset() {
  P.x = W / 2; P.y = H * 0.7; P.r = 7 * U;
  wake = []; bullets = []; texts = []; t = 0; cuts = 0; score = 0; spawnT = 1.4; slow = 1; tier = 0; chainCut = 0;
  newBest = false; gr = daily ? TG.rng(GAME + ':' + TG.today()) : Math.random; gp = daily ? TG.rng(GAME + ':p:' + TG.today()) : Math.random; window.__spawnLog = [];
  runId++; state = 'play'; sfx('start');
}
function hue() { return HUES[tier % HUES.length]; }

// ---- bullet patterns ----
function spd() { return (90 + t * 5 + Math.max(0, t - 35) * 1.5) * U; }
function later(fn, ms) { const id = runId; setTimeout(() => { if (state === 'play' && runId === id) fn(); }, ms); }
const far = (x, y) => Math.hypot(x - P.x, y - P.y) > 150 * U;
function shoot(x, y, a, s, r) { bullets.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, r: (r || 6) * U, born: t }); }
function edgePoint() {
  for (let k = 0; k < 8; k++) { const p = edgePoint1(); if (far(p.x, p.y)) return p; }
  return edgePoint1();
}
function edgePoint1() {
  const e = Math.floor(grnd(0, 4));
  if (e === 0) return { x: grnd(0, W), y: -10 };
  if (e === 1) return { x: W + 10, y: grnd(0, H) };
  if (e === 2) return { x: grnd(0, W), y: H + 10 };
  return { x: -10, y: grnd(0, H) };
}
const patterns = [
  () => { const p = edgePoint(), a = Math.atan2(P.y - p.y, P.x - p.x); for (let i = 0; i < 5; i++) later(() => shoot(p.x, p.y, a, spd()), i * 90); },
  () => { const p = edgePoint(), a = Math.atan2(P.y - p.y, P.x - p.x); for (let i = -2; i <= 2; i++) shoot(p.x, p.y, a + i * 0.22, spd() * 0.9); },
  () => { let x, y, k = 0; do { x = grnd(W * .2, W * .8); y = grnd(H * .15, H * .4); } while (!far(x, y) && ++k < 8); const n = 12 + Math.floor(t / 8); for (let i = 0; i < n; i++) shoot(x, y, i / n * TAU, spd() * 0.7); burst(x, y, 0, 16); },
  () => { const gap = grnd(0.15, 0.85) * W, n = Math.ceil(W / (26 * U)); for (let i = 0; i < n; i++) { const x = i * 26 * U + 10; if (Math.abs(x - gap) > 50 * U) shoot(x, -10, Math.PI / 2, spd() * 0.75); } },
  () => { const cx = W / 2, cy = far(W / 2, H / 2) ? H / 2 : (P.y > H / 2 ? H * 0.25 : H * 0.75), a0 = grnd(0, TAU); for (let i = 0; i < 16; i++) later(() => shoot(cx, cy, a0 + i * 0.5, spd() * 0.8), i * 60); },
];
function spawn() {
  const unlocked = Math.min(patterns.length, 1 + Math.floor(t / 5));
  const pi = Math.floor(gp() * unlocked); window.__spawnLog.push(pi); patterns[pi]();
  // past 35s keep ramping gently: the spawn floor keeps sliding down and a second pattern
  // sometimes stacks on top, so runs end within a couple of minutes even for strong players
  const late = Math.max(0, t - 35);
  if (late > 0 && gp() < Math.min(0.45, late * 0.012)) { const pj = Math.floor(gp() * patterns.length); later(() => patterns[pj](), 250); }
  spawnT = Math.max(Math.max(0.26, 0.45 - late * 0.004), 1.5 - t * 0.03);
}

// ---- juice ----
function burst(x, y, h, n, sp) {
  for (let i = 0; i < n; i++) { const a = rnd(0, TAU), s = rnd(40, sp || 260); parts.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0, life: rnd(.3, .8), h }); }
  if (parts.length > 900) parts.splice(0, parts.length - 900);
}

// ---- input: relative drag so the thumb never covers the ship ----
let drag = null; const keys = {};
function onDown(e) {
  e.preventDefault(); audio();
  if (fun.style.display === 'flex') return;
  if (state === 'ready') { reset(); track('start'); runs++; sessionStorage.setItem('wc_runs', runs); }
  else if (state === 'over') { if (performance.now() - overAt < 400) return; restart(); }
  drag = { x: e.clientX, y: e.clientY };
}
function onMove(e) {
  if (!drag || state !== 'play') return;
  const k = 1.3; P.x += (e.clientX - drag.x) * k; P.y += (e.clientY - drag.y) * k;
  drag = { x: e.clientX, y: e.clientY };
}
cv.addEventListener('pointerdown', onDown);
window.addEventListener('pointermove', onMove);
window.addEventListener('pointerup', () => { drag = null; });
window.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true;
  if ((e.key === ' ' || e.key === 'r') && (state === 'ready' || state === 'over')) onDown({ preventDefault() {}, clientX: 0, clientY: 0 });
});
window.addEventListener('keyup', e => { keys[e.key.toLowerCase()] = false; });
function restart() { track('retry'); runs++; sessionStorage.setItem('wc_runs', runs); reset(); }

// ---- daily + share UI ----
const readyUi = document.getElementById('readyUi'), overUi = document.getElementById('overUi'), modeBtn = document.getElementById('modeBtn'), dailyBtn = document.getElementById('dailyBtn');
for (const el of [readyUi, overUi]) el.addEventListener('pointerdown', e => e.stopPropagation());
function startMode(d) { audio(); daily = d; dinfo = TG.daily('wc'); reset(); track(d ? 'daily-start' : 'start'); runs++; sessionStorage.setItem('wc_runs', runs); }
dailyBtn.onclick = () => startMode(true);
modeBtn.onclick = () => startMode(!daily);
function shareText() {
  const reached = TIERS.slice(1).map(x => t >= x ? (x >= 30 ? '\u{1F7E9}' : '\u{1F7E8}') : '\u2B1B').join('');
  const lines = [(daily ? 'Wake Cutter Daily #' + dinfo.num : 'Wake Cutter') + (t >= 30 ? ' \u2705' : ''), reached + ' ' + t.toFixed(1) + 's',
    '\u2702\uFE0F ' + cuts + ' cuts  \u2B50 Score ' + score + (daily && dinfo.streak > 1 ? '  \u{1F525} ' + dinfo.streak + ' day streak' : '')];
  return lines.join('\n');
}
window.__shareText = shareText;
document.getElementById('shareBtn').onclick = async () => {
  const how = await TG.share(shareText(), 'https://brinax.github.io/tiny-games/' + GAME + '/?src=share');
  track('share-' + how); if (how === 'copied') TG.toast('Copied! Paste it anywhere'); else if (how === 'fail') TG.toast('Could not share');
};
let uiShown = '';
function syncUi() {
  const v = fun.style.display === 'flex' ? '' : state === 'ready' ? 'ready' : state === 'over' && performance.now() - overAt > 400 ? 'over' : '';
  if (v === uiShown) return; uiShown = v;
  readyUi.style.display = v === 'ready' ? 'flex' : 'none'; overUi.style.display = v === 'over' ? 'flex' : 'none';
  readyUi.style.top = Math.round(H * 0.58) + 'px'; overUi.style.top = Math.round(H * 0.33 + 215) + 'px';
  dinfo = daily ? dinfo : TG.daily('wc');
  dailyBtn.textContent = 'Daily #' + dinfo.num + (dinfo.played ? '  best ' + dinfo.best : '') + (dinfo.streak ? '  \u{1F525}' + dinfo.streak : '');
  modeBtn.textContent = daily ? 'Classic' : 'Daily #' + dinfo.num;
}

// ---- fun prompt ----
const fun = document.getElementById('fun');
function closeFun() { fun.style.display = 'none'; funShown = true; sessionStorage.setItem('wc_fun', '1'); }
document.getElementById('funYes').onclick = () => { track('fun-yes'); closeFun(); };
document.getElementById('funNo').onclick = () => { track('fun-no'); closeFun(); };
document.getElementById('funX').onclick = closeFun;

function die() {
  state = 'dying'; deathT = 0; slow = 0.15; shake = 22; drag = null;
  burst(P.x, P.y, hue(), 80, 420);
  sfx('thud');
}
function gameOver() {
  state = 'over'; overAt = performance.now();
  score = Math.floor(t * 10) + cuts * 5;
  if (daily) { dinfo = TG.recordDaily('wc', score); newBest = dinfo.newBest; track('daily-gameover'); }
  else if (score > best) { best = score; newBest = true; localStorage.setItem('wc_best', best); }
  track('gameover');
  if (!funShown && runs >= 3) setTimeout(() => { if (!funShown) fun.style.display = 'flex'; }, 900);
}

// ---- update ----
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy || 1;
  let u = ((px - ax) * dx + (py - ay) * dy) / l; u = Math.max(0, Math.min(1, u));
  return Math.hypot(px - ax - u * dx, py - ay - u * dy);
}
const WAKE_LIFE = 0.7;
function update(rdt) {
  if (state === 'dying') { deathT += rdt; slow = Math.min(1, slow + rdt * 0.5); if (deathT > 1.1) gameOver(); }
  const dt = rdt * slow;
  if (state === 'play') {
    t += dt;
    const ks = 320 * U * dt;
    if (keys.arrowleft || keys.a) P.x -= ks; if (keys.arrowright || keys.d) P.x += ks;
    if (keys.arrowup || keys.w) P.y -= ks; if (keys.arrowdown || keys.s) P.y += ks;
    P.x = Math.max(P.r, Math.min(W - P.r, P.x)); P.y = Math.max(P.r + 44, Math.min(H - P.r, P.y));
    const lw = wake[wake.length - 1];
    if (!lw || Math.hypot(lw.x - P.x, lw.y - P.y) > 3) wake.push({ x: P.x, y: P.y, t });
    spawnT -= dt; if (spawnT <= 0) spawn();
    const nt = TIERS.filter(x => t >= x).length - 1;
    if (nt > tier) { tier = nt; texts.push({ x: W / 2, y: H * 0.3, s: TIERS[tier] + 's!', t: 0, big: true }); sfx('chime'); shake = 8; }
    chainT -= dt; if (chainT <= 0) chainCut = 0;
  }
  wake = wake.filter(w => t - w.t < WAKE_LIFE);
  for (const b of bullets) {
    b.x += b.vx * dt; b.y += b.vy * dt;
    if (state !== 'play') continue;
    const pd = Math.hypot(b.x - P.x, b.y - P.y);
    if (pd < b.r + P.r * 0.7) { die(); break; }
    if (!b.nm && pd < b.r + P.r * 0.7 + 12 * U) { b.nm = true; sfx('whoosh'); } // near miss
    // TWIST: your fading wake slices bullets. Skip the newest bit right behind the ship.
    for (let i = 1; i < wake.length; i++) {
      const a = wake[i - 1], c = wake[i];
      if (t - c.t < 0.08) break;
      if (segDist(b.x, b.y, a.x, a.y, c.x, c.y) < b.r + 3 * U) { b.cut = true; break; }
    }
    if (b.cut) {
      cuts++; chainCut++; chainT = 0.5;
      burst(b.x, b.y, hue(), 14);
      shake = Math.min(shake + 2, 12);
      sfx('slice', chainCut);
      if (chainCut >= 3) texts.push({ x: b.x, y: b.y, s: 'SLICE x' + chainCut, t: 0 });
    }
  }
  bullets = bullets.filter(b => !b.cut && b.x > -40 && b.x < W + 40 && b.y > -40 && b.y < H + 40);
  for (const p of parts) { p.t += rdt; p.x += p.vx * rdt; p.y += p.vy * rdt; p.vx *= 0.95; p.vy *= 0.95; }
  parts = parts.filter(p => p.t < p.life);
  for (const x of texts) x.t += rdt; texts = texts.filter(x => x.t < 1);
  shake *= Math.pow(0.01, rdt);
}

// ---- draw ----
function draw() {
  const h = hue();
  ctx.fillStyle = '#05060f'; ctx.fillRect(0, 0, W, H);
  ctx.save();
  if (shake > 0.3) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  // grid
  ctx.strokeStyle = `hsla(${h},80%,50%,.08)`; ctx.lineWidth = 1;
  const gs = 40 * U, off = (t * 30) % gs;
  ctx.beginPath();
  for (let x = 0; x < W; x += gs) { ctx.moveTo(x, 0); ctx.lineTo(x, H); }
  for (let y = -gs + off; y < H; y += gs) { ctx.moveTo(0, y); ctx.lineTo(W, y); }
  ctx.stroke();
  ctx.globalCompositeOperation = 'lighter';
  // wake ribbon
  for (let i = 1; i < wake.length; i++) {
    const a = wake[i - 1], c = wake[i], k = 1 - (t - c.t) / WAKE_LIFE;
    ctx.strokeStyle = `hsla(${h},100%,65%,${k * 0.9})`; ctx.lineWidth = (2 + 6 * k) * U; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
  }
  // bullets
  for (const b of bullets) {
    ctx.fillStyle = 'rgba(255,70,110,.25)'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r * 2, 0, TAU); ctx.fill();
    ctx.fillStyle = '#ff4d7a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill();
  }
  for (const p of parts) { ctx.fillStyle = `hsla(${p.h},100%,65%,${1 - p.t / p.life})`; ctx.fillRect(p.x - 2, p.y - 2, 4, 4); }
  ctx.globalCompositeOperation = 'source-over';
  // ship
  if (state === 'play' || state === 'ready') {
    const sx = state === 'ready' ? W / 2 : P.x, sy = state === 'ready' ? H * 0.7 : P.y, r = 7 * U;
    ctx.fillStyle = `hsla(${h},100%,60%,.3)`; ctx.beginPath(); ctx.arc(sx, sy, r * 2.4, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(sx, sy, r, 0, TAU); ctx.fill();
  }
  ctx.textAlign = 'center';
  for (const x of texts) { ctx.fillStyle = `rgba(255,255,255,${1 - x.t})`; ctx.font = `900 ${x.big ? 44 : 18}px system-ui,sans-serif`; ctx.fillText(x.s, x.x, x.y - x.t * 30); }
  ctx.restore();
  // HUD
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 22px system-ui,sans-serif';
  if (state !== 'ready') ctx.fillText(t.toFixed(1) + 's', 14, 34);
  if (daily && state !== 'ready') { ctx.font = '700 13px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fillText('DAILY #' + dinfo.num, 14, 54); }
  if (daily && state === 'play' && t < 6) { ctx.font = '600 12px system-ui,sans-serif'; ctx.fillStyle = `rgba(255,255,255,${0.65 * Math.min(1, (6 - t) / 1.5)})`; ctx.fillText('Same pattern for everyone today', 14, 71); }
  ctx.textAlign = 'center'; ctx.font = '700 16px system-ui,sans-serif'; ctx.fillStyle = `hsl(${h},100%,70%)`;
  if (state !== 'ready') ctx.fillText('CUTS ' + cuts, W / 2, 32);
  if (state === 'ready') {
    ctx.fillStyle = '#fff'; ctx.font = '900 42px system-ui,sans-serif'; ctx.fillText('WAKE CUTTER', W / 2, H * 0.32);
    ctx.font = '600 17px system-ui,sans-serif'; ctx.fillStyle = `hsl(${h},100%,75%)`;
    ctx.fillText('Survive 30 seconds.', W / 2, H * 0.32 + 34);
    ctx.fillText('Your glowing wake slices bullets.', W / 2, H * 0.32 + 58);
    ctx.fillStyle = '#fff'; ctx.fillText('DRAG ANYWHERE TO START', W / 2, H * 0.5);
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(5,6,15,.7)'; ctx.fillRect(0, H * 0.33, W, 200);
    ctx.font = '900 46px system-ui,sans-serif'; ctx.fillStyle = t >= 30 ? '#7fffd4' : '#ff4d7a';
    ctx.fillText(t.toFixed(1) + 's', W / 2, H * 0.33 + 60);
    ctx.font = '700 19px system-ui,sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText(cuts + ' cuts   Score ' + score, W / 2, H * 0.33 + 100);
    ctx.fillStyle = newBest ? '#ffe27a' : '#fff';
    ctx.fillText(daily ? (newBest ? 'New best today! ' : "Today's best ") + dinfo.best + '   \u{1F525} ' + dinfo.streak : (newBest ? 'New best! ' : 'Best ') + best, W / 2, H * 0.33 + 130);
    ctx.fillStyle = `hsl(${h},100%,75%)`; ctx.fillText(daily ? 'Tap to retry the daily' : t >= 30 ? 'You did it. Again?' : 'Tap to retry', W / 2, H * 0.33 + 172);
  }
}

let last = performance.now();
function step(now) { const dt = Math.min((now - last) / 1000, 0.05); last = now; update(dt); draw(); syncUi(); requestAnimationFrame(step); }
requestAnimationFrame(step);
})();
