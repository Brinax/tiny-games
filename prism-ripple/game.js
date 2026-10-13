(() => {
'use strict';
const GAME = 'prism-ripple';
const cv = document.getElementById('c'), ctx = cv.getContext('2d');
let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth; H = window.innerHeight;
  cv.width = W * DPR; cv.height = H * DPR;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize); resize();

// ---- clip tagging (?src=tt / ?src=yt) ----
const params = new URLSearchParams(location.search);
const SRC = (params.get('src') || '').replace(/[^a-z0-9_-]/gi, '').slice(0, 24);
const pending = [];
let SIM = false;
function track(name) {
  if (SIM) return;
  const path = GAME + '/' + name + (SRC ? '?src=' + SRC : '');
  const ev = { path, title: name + (SRC ? ' (' + SRC + ')' : ''), event: true };
  if (window.goatcounter && window.goatcounter.count) window.goatcounter.count(ev);
  else pending.push(ev);
  (window.__events = window.__events || []).push(name);
}
setInterval(() => {
  while (pending.length && window.goatcounter && window.goatcounter.count) window.goatcounter.count(pending.shift());
}, 1000);
if (SRC) track('visit-from-clip');

// ---- audio ----
let actx = null, muted = localStorage.getItem('pr_muted') === '1';
const muteBtn = document.getElementById('mute');
function setMuteIcon() { muteBtn.textContent = muted ? '🔇' : '🔊'; }
setMuteIcon();
muteBtn.addEventListener('pointerdown', e => { e.stopPropagation(); muted = !muted; localStorage.setItem('pr_muted', muted ? '1' : '0'); setMuteIcon(); });
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
let lastBlip = 0;
function blip(freq, dur, type, vol) {
  if (SIM || muted || !actx) return;
  const t = actx.currentTime;
  if (t - lastBlip < 0.012) return; lastBlip = t;
  const o = actx.createOscillator(), g = actx.createGain();
  o.type = type || 'sine'; o.frequency.setValueAtTime(freq, t);
  o.frequency.exponentialRampToValueAtTime(freq * 1.5, t + dur);
  g.gain.setValueAtTime(vol || 0.12, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}

// ---- state ----
const rnd = (a, b) => a + Math.random() * (b - a);
let level = +(localStorage.getItem('pr_level') || 1);
let best = +(localStorage.getItem('pr_best') || 0);
let dots = [], rings = [], parts = [], beams = [], texts = [];
let state = 'ready'; // ready, live, chain, over
let popped = 0, combo = 0, score = 0, target = 0, total = 0, shake = 0, flash = 0;
let runs = +(sessionStorage.getItem('pr_runs') || 0), funShown = sessionStorage.getItem('pr_fun') === '1';
let quiet = 0, overAt = 0, won = false, overText = '';
window.__firstDot = () => { const d = dots.find(d => d.alive && !d.prism); return { x: d.x, y: d.y }; };
window.__game = { get state() { return state; }, get popped() { return popped; }, get level() { return level; } };

// Levels 1-7 are a gentle ramp. From level 8 on, rings shrink and prisms get rarer, so a random
// tap fizzles but a tap on a dense cluster or a prism still clears the goal.
let TUNE = { k0: 0.06, kMin: 0.88, pDrop: 1, fr: 0.03, frMax: 0.58, pMin: 2 };
window.__tune = o => Object.assign(TUNE, o);
function levelCfg(n) {
  const count = Math.min(40 + n * 5, 100);
  const late = Math.max(0, n - 7);
  const frac = Math.min(0.22 + Math.min(n, 7) * 0.04 + late * TUNE.fr, TUNE.frMax);
  const prisms = n <= 7 ? Math.min(1 + Math.floor(n / 2), 4) : Math.max(TUNE.pMin, Math.round(4 - late * TUNE.pDrop));
  const ringK = n <= 7 ? 1 : Math.max(TUNE.kMin, 1 - late * TUNE.k0);
  return { count, target: Math.min(Math.round(count * frac), count - 2), prisms, ringK };
}
function setup() {
  const cfg = levelCfg(level);
  total = cfg.count; target = cfg.target; LK = cfg.ringK;
  dots = []; rings = []; beams = []; texts = []; popped = 0; combo = 0; score = 0;
  const r = Math.max(7, Math.sqrt(W * H) * 0.013);
  for (let i = 0; i < cfg.count; i++) {
    const a = rnd(0, Math.PI * 2), s = rnd(25, 60);
    dots.push({ x: rnd(r, W - r), y: rnd(r + 60, H - r), vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, hue: (i * 37) % 360, prism: i < cfg.prisms, rot: rnd(0, 6), alive: true });
  }
  state = 'live';
}
// ring radius scales with mean dot spacing so chains behave the same on phone and desktop
let RK = 0.8, LK = 1;
window.__setRK = k => { RK = k; };
function ringR() { return RK * LK * Math.sqrt(W * H / Math.max(total, 1)); }
function pop(d, gen) {
  d.alive = false; popped++; combo++; quiet = 0;
  const pts = 10 * combo; score += pts;
  rings.push({ x: d.x, y: d.y, r: d.r, max: ringR(), t: 0, hue: d.hue, gen });
  const n = parts.length < 600 ? 14 : 6;
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(60, 260); parts.push({ x: d.x, y: d.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.4, .9), t: 0, hue: d.hue }); }
  if (combo % 5 === 0 || combo > 10) texts.push({ x: d.x, y: d.y, s: '+' + pts, t: 0, hue: d.hue });
  shake = Math.min(shake + 2.5, 16);
  blip(220 * Math.pow(2, Math.min(combo, 36) / 12), 0.12, 'triangle', 0.09);
  if (d.prism) firePrism(d);
}
// TWIST: prism shards fire 3 light beams across the screen that pop every dot they cross
function firePrism(d) {
  flash = 0.35; shake = Math.min(shake + 8, 20);
  blip(880, 0.35, 'sawtooth', 0.06);
  for (let k = 0; k < 3; k++) {
    const a = d.rot + k * Math.PI * 2 / 3;
    beams.push({ x: d.x, y: d.y, ax: Math.cos(a), ay: Math.sin(a), len: 0, L: Math.hypot(W, H), t: 0, hue: (d.hue + k * 120) % 360 });
  }
  texts.push({ x: d.x, y: d.y - 20, s: 'PRISM!', t: 0, hue: 50, big: true });
}

// ---- input ----
function onTap(e) {
  e.preventDefault(); audio();
  if (document.getElementById('fun').style.display === 'flex') return;
  const x = e.clientX, y = e.clientY;
  if (state === 'ready') { setup(); track('start'); runs++; sessionStorage.setItem('pr_runs', runs); return; }
  if (state === 'live') {
    rings.push({ x, y, r: 4, max: ringR() * 1.8, t: 0, hue: 0, gen: 0, player: true });
    state = 'chain'; quiet = 0; blip(160, 0.25, 'sine', 0.15); return;
  }
  if (state === 'chain' && popped >= target) { gameOver(); return; }
  if (state === 'over' && performance.now() - overAt > 250) restart();
}
function restart() {
  track('retry'); runs++; sessionStorage.setItem('pr_runs', runs);
  if (won) { level++; localStorage.setItem('pr_level', level); }
  setup();
}
cv.addEventListener('pointerdown', onTap);
window.addEventListener('keydown', e => { if (e.key === 'r' || e.key === ' ') { audio(); if (state === 'over') restart(); else if (state === 'ready') onTap({ preventDefault() {}, clientX: W / 2, clientY: H / 2 }); } });

// ---- fun prompt (once per session, after 3 runs) ----
const fun = document.getElementById('fun');
function closeFun() { fun.style.display = 'none'; funShown = true; sessionStorage.setItem('pr_fun', '1'); }
document.getElementById('funYes').onclick = () => { track('fun-yes'); closeFun(); };
document.getElementById('funNo').onclick = () => { track('fun-no'); closeFun(); };
document.getElementById('funX').onclick = closeFun;

function gameOver() {
  if (state === 'over') return;
  state = 'over'; rings = rings.filter(r => !r.player); overAt = performance.now();
  won = popped >= target;
  if (SIM) return;
  if (score > best) { best = score; localStorage.setItem('pr_best', best); }
  overText = won ? 'LEVEL CLEAR' : 'SO CLOSE';
  blip(won ? 660 : 140, 0.5, won ? 'triangle' : 'sine', 0.15);
  track('gameover');
  if (!funShown && runs >= 3) setTimeout(() => { if (!funShown) fun.style.display = 'flex'; }, 900);
}

// ---- loop ----
let last = performance.now();
function step(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  update(dt); draw(); requestAnimationFrame(step);
}
function update(dt) {
  for (const d of dots) {
    if (!d.alive) continue;
    d.x += d.vx * dt; d.y += d.vy * dt; d.rot += dt * 1.5;
    if (d.x < d.r || d.x > W - d.r) { d.vx *= -1; d.x = Math.max(d.r, Math.min(W - d.r, d.x)); }
    if (d.y < d.r + 50 || d.y > H - d.r) { d.vy *= -1; d.y = Math.max(d.r + 50, Math.min(H - d.r, d.y)); }
  }
  for (const r of rings) {
    r.t += dt;
    const grow = 0.35, hold = 1.0, shrink = 0.3;
    if (r.t < grow) r.r = r.max * (1 - Math.pow(1 - r.t / grow, 3));
    else if (r.t < grow + hold) r.r = r.max;
    else r.r = r.max * Math.max(0, 1 - (r.t - grow - hold) / shrink);
    r.dead = r.t > grow + hold + shrink;
    if (!r.dead && r.r > 2) for (const d of dots) if (d.alive && Math.hypot(d.x - r.x, d.y - r.y) < r.r + d.r) pop(d, r.gen + 1);
  }
  for (const b of beams) {
    b.t += dt; b.len = Math.min(b.L, b.len + dt * 2400);
    for (const d of dots) {
      if (!d.alive) continue;
      const px = d.x - b.x, py = d.y - b.y, along = px * b.ax + py * b.ay;
      if (along > 0 && along < b.len && Math.abs(px * b.ay - py * b.ax) < d.r + 5) pop(d, 1);
    }
  }
  beams = beams.filter(b => b.t < 0.6);
  rings = rings.filter(r => !r.dead);
  for (const p of parts) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.96; p.vy *= 0.96; p.vy += 120 * dt; }
  parts = parts.filter(p => p.t < p.life);
  if (parts.length > 900) parts.splice(0, parts.length - 900);
  for (const t of texts) t.t += dt;
  texts = texts.filter(t => t.t < 0.9);
  shake *= Math.pow(0.02, dt); flash = Math.max(0, flash - dt);
  if (state === 'chain') {
    quiet += dt;
    // end as soon as nothing has popped for 0.45s (rings left only fade), instead of waiting them out
    if ((rings.length === 0 && beams.length === 0) || (beams.length === 0 && quiet > 0.45 && !rings.some(r => r.player && r.t < 0.6))) gameOver();
  }
}
function draw() {
  ctx.save();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#120b33'); g.addColorStop(1, '#2a0b3a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  if (shake > 0.3) ctx.translate(rnd(-shake, shake), rnd(-shake, shake));
  // Rings use normal alpha blending (not additive), so a pile of overlapping rings
  // tends toward the ring colors and can never wash out to white.
  ctx.globalCompositeOperation = 'source-over';
  for (const r of rings) {
    const a = r.player ? 0.3 : 0.2;
    ctx.fillStyle = r.player ? `rgba(255,255,255,${a})` : `hsla(${r.hue},90%,60%,${a})`;
    ctx.beginPath(); ctx.arc(r.x, r.y, r.r, 0, 6.283); ctx.fill();
    ctx.strokeStyle = r.player ? '#fff' : `hsl(${r.hue},100%,75%)`; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.globalCompositeOperation = 'lighter';
  for (const b of beams) {
    const a = 1 - b.t / 0.6;
    ctx.strokeStyle = `hsla(${b.hue},100%,70%,${a})`; ctx.lineWidth = 10 * a + 2;
    ctx.beginPath(); ctx.moveTo(b.x, b.y); ctx.lineTo(b.x + b.ax * b.len, b.y + b.ay * b.len); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${a})`; ctx.lineWidth = 2; ctx.stroke();
  }
  for (const d of dots) {
    if (!d.alive) continue;
    if (d.prism) {
      const s = d.r * 1.9;
      ctx.fillStyle = `hsl(${(performance.now() / 8) % 360},100%,70%)`;
      ctx.beginPath();
      for (let k = 0; k < 3; k++) { const a = d.rot + k * 2.094; ctx[k ? 'lineTo' : 'moveTo'](d.x + Math.cos(a) * s, d.y + Math.sin(a) * s); }
      ctx.closePath(); ctx.fill();
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.stroke();
    } else {
      ctx.fillStyle = `hsl(${d.hue},85%,62%)`;
      ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.283); ctx.fill();
    }
  }
  for (const p of parts) {
    ctx.fillStyle = `hsla(${p.hue},100%,70%,${1 - p.t / p.life})`;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.textAlign = 'center';
  for (const t of texts) {
    ctx.fillStyle = `hsla(${t.hue},100%,80%,${1 - t.t / 0.9})`;
    ctx.font = `800 ${t.big ? 28 : 18}px system-ui,sans-serif`;
    ctx.fillText(t.s, t.x, t.y - t.t * 40);
  }
  ctx.restore();
  if (flash > 0) { ctx.fillStyle = `rgba(255,255,255,${flash * 0.5})`; ctx.fillRect(0, 0, W, H); }
  ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = '700 18px system-ui,sans-serif';
  ctx.fillText('LV ' + level, 14, 32);
  ctx.textAlign = 'center';
  if (state !== 'ready') {
    ctx.fillStyle = popped >= target ? '#7fffd4' : '#fff';
    ctx.fillText(popped + ' / ' + target, W / 2, 32);
  }
  if (combo > 3 && state === 'chain') {
    ctx.font = `900 ${Math.min(30 + combo, 72)}px system-ui,sans-serif`;
    ctx.fillStyle = `hsla(${combo * 12},100%,70%,.9)`;
    ctx.fillText('x' + combo, W / 2, H * 0.2);
  }
  if (state === 'ready') {
    ctx.font = '900 40px system-ui,sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('PRISM RIPPLE', W / 2, H * 0.4);
    ctx.font = '600 17px system-ui,sans-serif'; ctx.fillStyle = '#c9b8ff';
    ctx.fillText('One tap. Hit a prism. Watch it all go.', W / 2, H * 0.4 + 36);
    ctx.fillStyle = '#fff'; ctx.fillText('TAP TO START', W / 2, H * 0.6);
  } else if (state === 'live') {
    ctx.font = '600 16px system-ui,sans-serif'; ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText('Tap once. Prisms fire beams.', W / 2, H - 24);
  } else if (state === 'over') {
    ctx.fillStyle = 'rgba(8,5,25,.6)'; ctx.fillRect(0, H * 0.33, W, 190);
    ctx.font = '900 40px system-ui,sans-serif'; ctx.fillStyle = won ? '#7fffd4' : '#ff8fa3';
    ctx.fillText(overText, W / 2, H * 0.33 + 55);
    ctx.font = '700 19px system-ui,sans-serif'; ctx.fillStyle = '#fff';
    ctx.fillText('Popped ' + popped + ' of ' + total + '   Score ' + score, W / 2, H * 0.33 + 95);
    ctx.fillText('Best ' + best, W / 2, H * 0.33 + 125);
    ctx.fillStyle = '#c9b8ff'; ctx.fillText(won ? 'Tap for level ' + (level + 1) : 'Tap to retry', W / 2, H * 0.33 + 165);
  }
}
// test hook: best-of-N. Same layout, `tries` candidate taps (random dots/prisms), returns best fraction per layout
window.__simBest = (n, lv, tries) => {
  SIM = true; const keep = level, out = [];
  level = lv || 1;
  for (let i = 0; i < n; i++) {
    setup(); for (let k = 0; k < 60; k++) update(1 / 60);
    const snap = dots.map(d => ({ ...d })); let bestF = 0;
    for (let t = 0; t < tries; t++) {
      dots = snap.map(d => ({ ...d })); rings = []; beams = []; popped = 0; combo = 0; state = 'live';
      const c = t % 3 === 0 && dots.some(d => d.prism) ? dots.filter(d => d.prism)[t % cfgPr()] : dots[Math.floor(Math.random() * dots.length)];
      rings.push({ x: c.x, y: c.y, r: 4, max: ringR() * 1.8, t: 0, hue: 0, gen: 0, player: true });
      state = 'chain'; quiet = 0; let guard = 0;
      while (state === 'chain' && guard++ < 20000) update(1 / 60);
      bestF = Math.max(bestF, popped / total);
    }
    out.push({ f: bestF, goal: target / total });
  }
  level = keep; SIM = false; state = 'ready'; dots = []; rings = []; beams = []; parts = []; texts = []; combo = 0;
  return out;
};
function cfgPr() { return Math.max(1, dots.filter(d => d.prism).length); }
// test hook: simulate n runs at a given level with random taps, returns popped fractions
window.__sim = (n, lv) => {
  SIM = true; const keep = level, out = [];
  level = lv || 1;
  for (let i = 0; i < n; i++) {
    setup(); for (let k = 0; k < 60; k++) update(1 / 60);
    rings.push({ x: rnd(0, W), y: rnd(60, H), r: 4, max: ringR() * 1.8, t: 0, hue: 0, gen: 0, player: true });
    state = 'chain'; let guard = 0;
    while (state === 'chain' && guard++ < 20000) update(1 / 60);
    out.push(popped / total);
  }
  window.__lastGoal = target / total;
  level = keep; SIM = false; state = 'ready'; dots = []; rings = []; beams = []; parts = []; texts = []; combo = 0;
  return out;
};
requestAnimationFrame(step);
})();
