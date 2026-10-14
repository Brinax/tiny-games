// Shared daily-challenge + share helpers for tiny-games. Same file in every game folder.
(() => {
'use strict';
const EPOCH = Date.UTC(2026, 9, 14); // Daily #1 = 2026-10-14 (UTC)
// UTC date string; tests may set window.__today = 'YYYY-MM-DD'
function today() { return window.__today || new Date().toISOString().slice(0, 10); }
function dayNum(d) { const [y, m, dd] = (d || today()).split('-').map(Number); return Math.round((Date.UTC(y, m - 1, dd) - EPOCH) / 864e5) + 1; }
function prevDay(d) { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd) - 864e5).toISOString().slice(0, 10); }
function hash(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function rng(seedStr) { let a = hash(seedStr); return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function load(k, def) { try { return JSON.parse(localStorage.getItem(k)) || def; } catch (e) { return def; } }
// Daily record per game: { date, best, tries } plus streak { last, n, max }
function daily(prefix) {
  const d = today(), rec = load(prefix + '_daily', {}), st = load(prefix + '_streak', { last: '', n: 0, max: 0 });
  const cur = rec.date === d ? rec : { date: d, best: 0, tries: 0 };
  const alive = st.last === d || st.last === prevDay(d);
  return { date: d, num: dayNum(d), best: cur.best, tries: cur.tries, played: cur.tries > 0, streak: alive ? st.n : 0, maxStreak: st.max || 0 };
}
// record a finished daily run; first finished run of the day counts toward the streak
function recordDaily(prefix, score) {
  const d = today(), rec = load(prefix + '_daily', {});
  const cur = rec.date === d ? rec : { date: d, best: 0, tries: 0 };
  const first = cur.tries === 0, newBest = score > cur.best;
  cur.tries++; cur.best = Math.max(cur.best, score);
  localStorage.setItem(prefix + '_daily', JSON.stringify(cur));
  const st = load(prefix + '_streak', { last: '', n: 0, max: 0 });
  if (st.last !== d) { st.n = st.last === prevDay(d) ? st.n + 1 : 1; st.last = d; st.max = Math.max(st.max || 0, st.n); localStorage.setItem(prefix + '_streak', JSON.stringify(st)); }
  return Object.assign(daily(prefix), { first, newBest });
}
// navigator.share, then clipboard, then execCommand. Resolves 'shared' | 'copied' | 'cancel' | 'fail'
async function share(text, link) {
  const full = text + '\n' + link;
  if (navigator.share) {
    try { await navigator.share({ text: full }); return 'shared'; }
    catch (e) { if (e && e.name === 'AbortError') return 'cancel'; }
  }
  try { if (navigator.clipboard && navigator.clipboard.writeText) { await navigator.clipboard.writeText(full); return 'copied'; } } catch (e) { /* fall through */ }
  try {
    const ta = document.createElement('textarea'); ta.value = full; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;left:-999px;top:0';
    document.body.appendChild(ta); ta.select(); const ok = document.execCommand('copy'); ta.remove(); return ok ? 'copied' : 'fail';
  } catch (e) { return 'fail'; }
}
function toast(msg) {
  let el = document.getElementById('toast');
  if (!el) { el = document.createElement('div'); el.id = 'toast'; document.body.appendChild(el); }
  el.textContent = msg; el.className = 'show'; clearTimeout(toast.t); toast.t = setTimeout(() => { el.className = ''; }, 1800);
}
function bar(frac, n, on, off) { const k = Math.max(0, Math.min(n, Math.round(frac * n))); return on.repeat(k) + off.repeat(n - k); }
window.TG = { today, dayNum, rng, daily, recordDaily, share, toast, bar };
})();
