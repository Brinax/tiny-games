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
let master = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); master = actx.createGain(); master.gain.value = 0.8; master.connect(actx.destination); } catch (e) { actx = null; } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
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
  tap(c, o, t) { tone(c, o, t, 180, 70, 0.22, 'sine', 0.35); noise(c, o, t, 0.08, 'lowpass', 1200, 300, 1, 0.12); },
  pop(c, o, t, n) { // bubbly pop that climbs a pentatonic scale with the combo
    const f = note(Math.min(n, 22));
    tone(c, o, t, f * 1.6, f, 0.05, 'sine', 0.16, 0.002);
    tone(c, o, t + 0.01, f, f, 0.22, 'triangle', 0.10); tone(c, o, t + 0.01, f * 2, f * 2, 0.14, 'sine', 0.04);
  },
  beam(c, o, t) { // laser zap: falling saw + bright noise sweep
    tone(c, o, t, 2200, 160, 0.32, 'sawtooth', 0.07, 0.002); tone(c, o, t, 1100, 90, 0.28, 'square', 0.04, 0.002);
    noise(c, o, t, 0.35, 'bandpass', 6000, 500, 3, 0.18);
  },
  clear(c, o, t) { [0, 2, 4, 5, 7].forEach((k, i) => { const f = note(5 + k); tone(c, o, t + i * 0.085, f, f, 0.5, 'triangle', 0.13); tone(c, o, t + i * 0.085, f * 2, f * 2, 0.3, 'sine', 0.04); }); },
  fail(c, o, t) { tone(c, o, t, 330, 140, 0.55, 'sine', 0.2); tone(c, o, t + 0.12, 247, 100, 0.5, 'triangle', 0.1); },
};
window.__SFX = SFX; window.__sfxLog = [];
let lastPop = 0;
function sfx(name, p) {
  if (SIM) return;
  const now = performance.now();
  if (name === 'pop') { if (now - lastPop < 30) return; lastPop = now; }
  window.__sfxLog.push({ n: name, p: p || 0, t: now });
  if (window.__sfxLog.length > 400) window.__sfxLog.shift();
  if (muted || !actx || actx.state !== 'running') return;
  try { SFX[name](actx, master, actx.currentTime + 0.005, p || 0); } catch (e) { /* audio is optional */ }
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
// ---- daily challenge: same seeded layout for everyone on a UTC date, fixed level ----
const DLV = 6;
let daily = false, dinfo = TG.daily('pr'), maxCombo = 0, newBest = false;
window.__firstDot = () => { const d = dots.find(d => d.alive && !d.prism); return { x: d.x, y: d.y }; };
window.__prism = () => { const d = dots.find(d => d.alive && d.prism); return d ? { x: d.x, y: d.y } : null; };
window.__game = { get daily() { return daily; }, get score() { return score; }, get dinfo() { return dinfo; }, get state() { return state; }, get popped() { return popped; }, get level() { return level; } };

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
// layout from a random source; daily runs pass a seeded one so every retry and every player gets the same field
function genDots(cfg, R) {
  const rr = (a, b) => a + R() * (b - a), out = [];
  const r = Math.max(7, Math.sqrt(W * H) * 0.013);
  for (let i = 0; i < cfg.count; i++) {
    const a = rr(0, Math.PI * 2), s = rr(25, 60);
    out.push({ x: rr(r, W - r), y: rr(r + 60, H - r), vx: Math.cos(a) * s, vy: Math.sin(a) * s, r, hue: (i * 37) % 360, prism: i < cfg.prisms, rot: rr(0, 6), alive: true });
  }
  return out;
}
function setup() {
  const cfg = levelCfg(daily ? DLV : level);
  total = cfg.count; target = cfg.target; LK = cfg.ringK;
  rings = []; beams = []; texts = []; popped = 0; combo = 0; score = 0; maxCombo = 0; newBest = false;
  dots = genDots(cfg, daily ? TG.rng(GAME + ':' + TG.today()) : Math.random);
  state = 'live';
}
// test hook: normalized daily layout for a date (does not touch game state)
window.__dailyLayout = d => { const keep = window.__today; window.__today = d; const L = genDots(levelCfg(DLV), TG.rng(GAME + ':' + TG.today())); window.__today = keep; return L.map(o => [+(o.x / W).toFixed(4), +(o.y / H).toFixed(4), +o.vx.toFixed(2), o.prism]); };
// ring radius scales with mean dot spacing so chains behave the same on phone and desktop
let RK = 0.8, LK = 1;
window.__setRK = k => { RK = k; };
function ringR() { return RK * LK * Math.sqrt(W * H / Math.max(total, 1)); }
function pop(d, gen) {
  d.alive = false; quiet = 0;
  // after game over the leftover rings still pop dots for show, but the result is frozen
  const counted = state !== 'over'; if (counted) { popped++; combo++; }
  const pts = 10 * combo; if (counted) { score += pts; if (combo > maxCombo) maxCombo = combo; }
  rings.push({ x: d.x, y: d.y, r: d.r, max: ringR(), t: 0, hue: d.hue, gen });
  const n = parts.length < 600 ? 14 : 6;
  for (let i = 0; i < n; i++) { const a = rnd(0, 6.283), s = rnd(60, 260); parts.push({ x: d.x, y: d.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rnd(.4, .9), t: 0, hue: d.hue }); }
  if (combo % 5 === 0 || combo > 10) texts.push({ x: d.x, y: d.y, s: '+' + pts, t: 0, hue: d.hue });
  shake = Math.min(shake + 2.5, 16);
  sfx('pop', combo);
  if (d.prism) firePrism(d);
}
// TWIST: prism shards fire 3 light beams across the screen that pop every dot they cross
function firePrism(d) {
  flash = 0.35; shake = Math.min(shake + 8, 20);
  sfx('beam');
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
    state = 'chain'; quiet = 0; sfx('tap'); return;
  }
  if (state === 'chain' && popped >= target) { gameOver(); return; }
  if (state === 'over' && performance.now() - overAt > 250) restart();
}
function restart() {
  track('retry'); runs++; sessionStorage.setItem('pr_runs', runs);
  if (won && !daily) { level++; localStorage.setItem('pr_level', level); }
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

// ---- daily + share UI ----
const readyUi = document.getElementById('readyUi'), overUi = document.getElementById('overUi'), modeBtn = document.getElementById('modeBtn'), dailyBtn = document.getElementById('dailyBtn');
for (const el of [readyUi, overUi]) el.addEventListener('pointerdown', e => e.stopPropagation());
function startMode(d) { audio(); daily = d; dinfo = TG.daily('pr'); setup(); track(d ? 'daily-start' : 'start'); runs++; sessionStorage.setItem('pr_runs', runs); }
dailyBtn.onclick = () => startMode(true);
modeBtn.onclick = () => startMode(!daily);
function shareText() {
  const head = daily ? 'Prism Ripple Daily #' + dinfo.num : 'Prism Ripple LV ' + level;
  const lines = [head + (won ? ' \u2705' : ''), TG.bar(popped / total, 10, '\u{1F7EA}', '\u2B1B') + ' ' + popped + '/' + total,
    '\u{1F3AF} Goal ' + target + '  \u{1F4A5} x' + maxCombo + ' combo', '\u2B50 Score ' + score + (daily && dinfo.streak > 1 ? '  \u{1F525} ' + dinfo.streak + ' day streak' : '')];
  return lines.join('\n');
}
window.__shareText = shareText;
document.getElementById('shareBtn').onclick = async () => {
  const how = await TG.share(shareText(), 'https://brinax.github.io/tiny-games/' + GAME + '/?src=share');
  track('share-' + how); if (how === 'copied') TG.toast('Copied! Paste it anywhere'); else if (how === 'fail') TG.toast('Could not share');
};
let uiShown = '';
function syncUi() {
  const v = fun.style.display === 'flex' ? '' : state === 'ready' ? 'ready' : state === 'over' && performance.now() - overAt > 350 ? 'over' : '';
  if (v === uiShown) return; uiShown = v;
  readyUi.style.display = v === 'ready' ? 'flex' : 'none'; overUi.style.display = v === 'over' ? 'flex' : 'none';
  readyUi.style.top = Math.round(H * 0.68) + 'px'; overUi.style.top = Math.round(H * 0.33 + 205) + 'px';
  dinfo = daily ? dinfo : TG.daily('pr');
  dailyBtn.textContent = 'Daily #' + dinfo.num + (dinfo.played ? '  best ' + dinfo.best : '') + (dinfo.streak ? '  \u{1F525}' + dinfo.streak : '');
  modeBtn.textContent = daily ? 'Classic' : 'Daily #' + dinfo.num;
}

function gameOver() {
  if (state === 'over') return;
  state = 'over'; rings = rings.filter(r => !r.player); overAt = performance.now();
  won = popped >= target;
  if (SIM) return;
  if (daily) { dinfo = TG.recordDaily('pr', score); newBest = dinfo.newBest; track('daily-gameover'); }
  else if (score > best) { best = score; newBest = true; localStorage.setItem('pr_best', best); }
  overText = won ? (daily ? 'DAILY CLEAR' : 'LEVEL CLEAR') : 'SO CLOSE';
  sfx(won ? 'clear' : 'fail');
  track('gameover');
  if (!funShown && runs >= 3) setTimeout(() => { if (!funShown) fun.style.display = 'flex'; }, 900);
}

// ---- loop ----
let last = performance.now();
function step(now) {
  const dt = Math.min((now - last) / 1000, 0.05); last = now;
  update(dt); draw(); syncUi(); requestAnimationFrame(step);
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
  ctx.fillText(daily ? 'DAILY #' + dinfo.num : 'LV ' + level, 14, 32);
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
    ctx.fillStyle = newBest ? '#ffe27a' : '#fff';
    ctx.fillText(daily ? (newBest ? 'New best today! ' : "Today's best ") + dinfo.best + '   \u{1F525} ' + dinfo.streak : (newBest ? 'New best! ' : 'Best ') + best, W / 2, H * 0.33 + 125);
    ctx.fillStyle = '#c9b8ff'; ctx.fillText(daily ? 'Tap to retry the daily' : won ? 'Tap for level ' + (level + 1) : 'Tap to retry', W / 2, H * 0.33 + 165);
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
