(() => {
'use strict';
const GAME = 'echo-shatter';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1, U = 1; // U = size unit, scales with screen
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  U = Math.min(W / 390, H / 844);
  U = Math.max(0.9, Math.min(U, 2.8));
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
let actx = null, muted = localStorage.getItem('es_muted') === '1';
const muteBtn = document.getElementById('mute');
const setMuteIcon = () => { muteBtn.textContent = muted ? '🔇' : '🔊'; };
setMuteIcon();
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); muted = !muted; localStorage.setItem('es_muted', muted ? '1' : '0'); setMuteIcon(); });
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
  charge(c, o, t) { tone(c, o, t, 180, 360, 0.12, 'sine', 0.03, 0.03); },
  blast(c, o, t) { noise(c, o, t, 0.25, 'bandpass', 3000, 600, 1.2, 0.18); tone(c, o, t, 520, 140, 0.25, 'sine', 0.1); },
  shatter(c, o, t, n) { // glassy, rises with the chain
    const f = note(Math.min(n, 15) + 3);
    noise(c, o, t, 0.12, 'highpass', 7000, 3000, 0.8, 0.14);
    tone(c, o, t, f * 2, f * 2, 0.25, 'triangle', 0.08, 0.002); tone(c, o, t + 0.01, f * 3.01, f * 3.01, 0.4, 'sine', 0.04);
  },
  miss(c, o, t) { tone(c, o, t, 220, 160, 0.18, 'square', 0.03); },
  crack(c, o, t) {
    tone(c, o, t, 140, 38, 0.6, 'sine', 0.55, 0.003); noise(c, o, t, 0.5, 'lowpass', 2400, 120, 0.8, 0.35);
    tone(c, o, t + 0.04, 900, 200, 0.3, 'sawtooth', 0.04);
  },
  chime(c, o, t) { [0, 2, 4].forEach((k, i) => { const f = note(10 + k); tone(c, o, t + i * 0.07, f, f, 0.7, 'triangle', 0.12); tone(c, o, t + i * 0.07, f * 3, f * 3, 0.35, 'sine', 0.03); }); },
};
window.__SFX = SFX; window.__sfxLog = [];
const sfxGap = { shatter: 30 }, sfxLast = {};
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
let best = +(localStorage.getItem('es_best') || 0);
let state = 'ready'; // ready, play, dying, over
let crystals = [], shards = [], waves = [], echoes = [], texts = [];
let t = 0, shatters = 0, score = 0, shields = 3, spawnT = 0, shake = 0, slow = 1, deathT = 0, overAt = 0, tier = 0, flash = 0;
let holding = false, ring = 0, cool = 0, chain = 0, chainT = 0, bestChain = 0, hitFlash = 0;
let runs = +(sessionStorage.getItem('es_runs') || 0), funShown = sessionStorage.getItem('es_fun') === '1';
const CX = () => W / 2, CY = () => H * 0.55;
const coreR = () => 22 * U, band = () => 14 * U, growV = () => 330 * U, maxR = () => Math.hypot(W, H) / 2 + 10;
window.__game = {
  get state() { return state; }, get time() { return t; }, get shatters() { return shatters; }, get shields() { return shields; },
  get holding() { return holding; }, get ring() { return ring; }, get band() { return band(); }, get bestChain() { return bestChain; }, get fx() { return shards.length + echoes.length; },
  get crystals() { return crystals.map(c => ({ d: c.d, v: c.v, r: c.r })); },
};
const TIERS = [0, 15, 30, 45, 60, 90];
const HUES = [190, 280, 40, 150, 330, 210];
function hue() { return HUES[tier % HUES.length]; }

function reset() {
  state = 'play'; crystals = []; shards = []; waves = []; echoes = []; texts = [];
  t = 0; shatters = 0; score = 0; shields = 3; spawnT = 0.6; shake = 0; slow = 1; tier = 0; ring = 0; cool = 0; chain = 0; bestChain = 0;
  holding = false; sfx('start');
}
// Crystals drift in from off screen toward the core. Later on they come in clusters at the same distance,
// which is what makes one perfectly timed blast clear five at once.
function spawn() {
  const d0 = maxR() + 30, v = (50 + t * 3 + Math.max(0, t - 30) * 2.5) * U;
  const n = t < 6 ? 1 : Math.random() < Math.min(0.75, 0.2 + t * 0.012) ? 2 + Math.floor(rnd(0, Math.min(4, 1 + t / 15))) : 1;
  const a0 = rnd(0, TAU), spread = rnd(0.35, 0.7);
  for (let i = 0; i < n; i++) crystals.push({ a: a0 + (i - (n - 1) / 2) * spread, d: d0 + rnd(-6, 6) * U, v, r: rnd(11, 15) * U, rot: rnd(0, TAU), spin: rnd(-2, 2), sides: 5 + (i % 3) });
  spawnT = Math.max(0.32, 1.5 - t * 0.03) * (0.7 + n * 0.3);
}
function shatter(c, k) {
  c.dead = true; shatters++; chain++; chainT = 0.6; bestChain = Math.max(bestChain, chain);
  score += 10 * chain;
  const x = CX() + Math.cos(c.a) * c.d, y = CY() + Math.sin(c.a) * c.d, h = hue();
  for (let i = 0; i < 24; i++) {
    const a = rnd(0, TAU), s = rnd(80, 380) * U;
    shards.push({ x, y, vx: Math.cos(a) * s + Math.cos(c.a) * 120 * U, vy: Math.sin(a) * s + Math.sin(c.a) * 120 * U, rot: rnd(0, TAU), sp: rnd(-12, 12), sz: rnd(5, 13) * U, t: 0, life: rnd(0.5, 1.1), h: h + rnd(-25, 25) });
  }
  if (shards.length > 1200) shards.splice(0, shards.length - 1200);
  echoes.push({ x, y, t: 0, k }); // TWIST: every shattered crystal rings out a small echo that can shatter neighbours
  shake = Math.min(shake + 3, 14); sfx('shatter', chain);
  if (chain >= 3) texts.push({ x, y, s: 'ECHO x' + chain, t: 0 });
}
function fire() {
  holding = false; cool = 0.2;
  waves.push({ r: ring, t: 0 });
  let hit = 0;
  for (const c of crystals) if (!c.dead && Math.abs(c.d - ring) < band() + c.r * 0.6) { shatter(c, 0); hit++; }
  if (hit) { flash = 0.25; sfx('blast'); } else { sfx('miss'); chain = 0; }
  ring = 0;
}

// ---- input: hold anywhere to grow the ring, let go to blast ----
function onDown(e) {
  if (e.preventDefault) e.preventDefault(); audio();
  if (fun.style.display === 'flex') return;
  if (state === 'ready') { reset(); track('start'); runs++; sessionStorage.setItem('es_runs', runs); return; }
  if (state === 'over') { if (performance.now() - overAt < 400) return; restart(); return; }
  if (state === 'play' && cool <= 0) { holding = true; ring = coreR(); sfx('charge'); }
}
function onUp() { if (state === 'play' && holding) fire(); }
cv.addEventListener('pointerdown', onDown);
window.addEventListener('pointerup', onUp);
window.addEventListener('pointercancel', onUp);
window.addEventListener('keydown', e => { if ((e.key === ' ' || e.key === 'r') && !e.repeat) onDown({}); });
window.addEventListener('keyup', e => { if (e.key === ' ') onUp(); });
function restart() { track('retry'); runs++; sessionStorage.setItem('es_runs', runs); reset(); }

// ---- fun prompt ----
const fun = document.getElementById('fun');
function closeFun() { fun.style.display = 'none'; funShown = true; sessionStorage.setItem('es_fun', '1'); }
document.getElementById('funYes').onclick = () => { track('fun-yes'); closeFun(); };
document.getElementById('funNo').onclick = () => { track('fun-no'); closeFun(); };
document.getElementById('funX').onclick = closeFun;

function die() { state = 'dying'; deathT = 0; slow = 0.15; shake = 24; holding = false; sfx('crack'); }
function gameOver() {
  state = 'over'; overAt = performance.now();
  score += Math.floor(t * 10);
  if (score > best) { best = score; localStorage.setItem('es_best', best); }
  track('gameover');
  if (!funShown && runs >= 3) setTimeout(() => { if (!funShown) fun.style.display = 'flex'; }, 900);
}

// ---- update ----
function update(rdt) {
  if (state === 'dying') { deathT += rdt; slow = Math.min(1, slow + rdt * 0.5); if (deathT > 1.1) gameOver(); }
  const dt = rdt * slow;
  if (state === 'play') {
    t += dt; cool -= dt;
    if (holding) { ring += growV() * dt; if (ring >= maxR()) fire(); }
    spawnT -= dt; if (spawnT <= 0) spawn();
    const nt = TIERS.filter(x => t >= x).length - 1;
    if (nt > tier) { tier = nt; texts.push({ x: W / 2, y: H * 0.2, s: TIERS[tier] + 's!', t: 0, big: true }); sfx('chime'); shake = 8; }
    chainT -= dt; if (chainT <= 0) chain = 0;
  }
  for (const c of crystals) {
    c.d -= c.v * dt; c.rot += c.spin * dt;
    if (state === 'play' && !c.dead && c.d < coreR() + c.r * 0.5) {
      c.dead = true; shields--; hitFlash = 0.4; shake = 16; sfx('crack');
      texts.push({ x: CX(), y: CY() - 60 * U, s: shields > 0 ? 'CRACK' : 'SHATTERED', t: 0 });
      if (shields <= 0) die();
    }
  }
  for (const e of echoes) {
    e.t += dt;
    const er = 50 * U * Math.min(1, e.t / 0.22);
    if (e.t < 0.25 && e.k < 3 && state === 'play') for (const c of crystals) {
      if (c.dead) continue;
      if (Math.hypot(CX() + Math.cos(c.a) * c.d - e.x, CY() + Math.sin(c.a) * c.d - e.y) < er + c.r) shatter(c, e.k + 1);
    }
  }
  echoes = echoes.filter(e => e.t < 0.5);
  crystals = crystals.filter(c => !c.dead);
  for (const w of waves) w.t += rdt; waves = waves.filter(w => w.t < 0.45);
  for (const s of shards) { s.t += rdt; s.x += s.vx * rdt; s.y += s.vy * rdt; s.vx *= 0.96; s.vy *= 0.96; s.rot += s.sp * rdt; }
  shards = shards.filter(s => s.t < s.life);
  for (const x of texts) x.t += rdt; texts = texts.filter(x => x.t < 1);
  shake *= Math.pow(0.01, rdt); flash = Math.max(0, flash - rdt); hitFlash = Math.max(0, hitFlash - rdt);
}

// ---- draw ----
function poly(x, y, r, n, rot) { ctx.beginPath(); for (let i = 0; i < n; i++) { const a = rot + i / n * TAU, rr = r * (i % 2 ? 0.72 : 1); ctx.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); } ctx.closePath(); }
function draw() {
  const h = hue(), cx = CX(), cy = CY(), F = s => `${s * U}px system-ui,sans-serif`;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, maxR());
  g.addColorStop(0, `hsl(${h},60%,10%)`); g.addColorStop(1, '#05040c');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (hitFlash > 0) { ctx.fillStyle = `rgba(255,40,80,${hitFlash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  ctx.save();
  if (shake > 0.3) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  // guide rings
  ctx.strokeStyle = `hsla(${h},80%,60%,.07)`; ctx.lineWidth = 1;
  for (let r = 60 * U; r < maxR(); r += 60 * U) { ctx.beginPath(); ctx.arc(cx, cy, r, 0, TAU); ctx.stroke(); }
  ctx.globalCompositeOperation = 'lighter';
  // charging ring preview
  if (holding) {
    ctx.strokeStyle = `hsla(${h},100%,70%,.35)`; ctx.lineWidth = band() * 2;
    ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke();
    ctx.strokeStyle = `hsla(${h},100%,85%,.9)`; ctx.lineWidth = 2 * U; ctx.setLineDash([8 * U, 8 * U]);
    ctx.beginPath(); ctx.arc(cx, cy, ring, 0, TAU); ctx.stroke(); ctx.setLineDash([]);
  }
  for (const w of waves) {
    const k = 1 - w.t / 0.45;
    ctx.strokeStyle = `hsla(${h},100%,75%,${k})`; ctx.lineWidth = 3 * U + band() * 0.8 * k;
    ctx.beginPath(); ctx.arc(cx, cy, w.r + (1 - k) * 30 * U, 0, TAU); ctx.stroke();
  }
  for (const e of echoes) {
    const k = 1 - e.t / 0.5;
    ctx.fillStyle = `hsla(${h + 40},100%,85%,${k * 0.25})`; ctx.beginPath(); ctx.arc(e.x, e.y, 50 * U * Math.min(1, e.t / 0.22), 0, TAU); ctx.fill(); ctx.strokeStyle = `hsla(${h + 40},100%,85%,${k})`; ctx.lineWidth = 5 * U;
    ctx.beginPath(); ctx.arc(e.x, e.y, 50 * U * Math.min(1, e.t / 0.22), 0, TAU); ctx.stroke();
  }
  // crystals
  for (const c of crystals) {
    const x = cx + Math.cos(c.a) * c.d, y = cy + Math.sin(c.a) * c.d;
    ctx.fillStyle = 'rgba(255,255,255,.08)'; poly(x, y, c.r * 1.8, c.sides * 2, c.rot); ctx.fill();
    ctx.fillStyle = `hsla(${h + 160},90%,62%,.9)`; poly(x, y, c.r, c.sides * 2, c.rot); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.7)'; poly(x - c.r * .2, y - c.r * .2, c.r * .35, 4, c.rot); ctx.fill();
  }
  for (const s of shards) {
    ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(s.rot);
    ctx.fillStyle = `hsla(${s.h + 160},100%,${75 + 20 * (1 - s.t / s.life)}%,${1 - s.t / s.life})`;
    ctx.beginPath(); ctx.moveTo(0, -s.sz); ctx.lineTo(s.sz * .6, s.sz); ctx.lineTo(-s.sz * .6, s.sz * .4); ctx.fill(); ctx.restore();
  }
  if (flash > 0) { ctx.fillStyle = `hsla(${h},100%,80%,${flash * 0.4})`; ctx.fillRect(-50, -50, W + 100, H + 100); }
  ctx.globalCompositeOperation = 'source-over';
  // core with shield arcs
  if (state !== 'over') {
    const r = coreR(), pulse = 1 + Math.sin(performance.now() / 200) * 0.06;
    ctx.fillStyle = `hsla(${h},100%,60%,.25)`; ctx.beginPath(); ctx.arc(cx, cy, r * 2 * pulse, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx, cy, r * 0.8, 0, TAU); ctx.fill();
    ctx.lineWidth = 4 * U; ctx.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      ctx.strokeStyle = i < shields ? `hsl(${h},100%,70%)` : 'rgba(255,255,255,.12)';
      ctx.beginPath(); ctx.arc(cx, cy, r * 1.3, i * TAU / 3 + 0.25, (i + 1) * TAU / 3 - 0.25); ctx.stroke();
    }
  }
  ctx.textAlign = 'center';
  for (const x of texts) { ctx.fillStyle = `rgba(255,255,255,${1 - x.t})`; ctx.font = '900 ' + F(x.big ? 44 : 22); ctx.fillText(x.s, x.x, x.y - x.t * 30 * U); }
  ctx.restore();
  // HUD
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '800 ' + F(22);
  if (state !== 'ready') ctx.fillText(t.toFixed(1) + 's', 14 * U, 34 * U);
  ctx.textAlign = 'center'; ctx.font = '700 ' + F(17); ctx.fillStyle = `hsl(${h},100%,72%)`;
  if (state !== 'ready') ctx.fillText('SCORE ' + score, W / 2, 33 * U);
  if (state === 'ready') {
    ctx.fillStyle = '#fff'; ctx.font = '900 ' + F(44); ctx.fillText('ECHO SHATTER', W / 2, H * 0.2);
    ctx.font = '600 ' + F(17); ctx.fillStyle = `hsl(${h},100%,78%)`;
    ctx.fillText('Hold to grow the ring. Let go to blast.', W / 2, H * 0.2 + 36 * U);
    ctx.fillText('Shards echo and break their neighbours.', W / 2, H * 0.2 + 60 * U);
    ctx.fillStyle = '#fff'; ctx.font = '800 ' + F(18); ctx.fillText('TAP TO START', W / 2, H * 0.82);
  } else if (state === 'over') {
    const y0 = H * 0.36;
    ctx.fillStyle = 'rgba(5,4,12,.75)'; ctx.fillRect(0, y0, W, 210 * U);
    ctx.font = '900 ' + F(46); ctx.fillStyle = '#fff'; ctx.fillText(score + '', W / 2, y0 + 60 * U);
    ctx.font = '700 ' + F(19);
    ctx.fillText(t.toFixed(1) + 's   ' + shatters + ' shattered   best chain x' + bestChain, W / 2, y0 + 100 * U);
    ctx.fillText('Best ' + best, W / 2, y0 + 130 * U);
    ctx.fillStyle = `hsl(${h},100%,75%)`; ctx.fillText('Tap to retry', W / 2, y0 + 175 * U);
  }
}

let last = performance.now();
function step(now) { const dt = Math.min((now - last) / 1000, 0.05); last = now; update(dt); draw(); requestAnimationFrame(step); }
requestAnimationFrame(step);
})();
