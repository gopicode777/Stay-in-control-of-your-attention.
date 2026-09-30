'use strict';
/* ---------- Data layer (localStorage, demo persistence only) ---------- */
const KEY = 'focuspause.sessions';
const store = {
  load() { try { return JSON.parse(localStorage.getItem(KEY)) || []; } catch { return []; } },
  save(list) { try { localStorage.setItem(KEY, JSON.stringify(list)); } catch { /* storage unavailable */ } },
  clear() { try { localStorage.removeItem(KEY); } catch { /* ignore */ } }
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const fmtDur = sec => sec < 60 ? `${sec} sec` : `${Math.round(sec / 60)} min`;
const clock = sec => `${String(Math.floor(sec / 60)).padStart(2, '0')}:${String(sec % 60).padStart(2, '0')}`;
const statCards = items => items.map(([v, l]) => `<div class="stat"><b>${v}</b><span>${l}</span></div>`).join('');

/* ---------- Session state ---------- */
let cur = null;        // active session
let ticker = null;     // session interval
let cdTimer = null;    // 5-second countdown interval
let toastTimer = null;

function startSession(activity, minutes) {
  cur = { activity, planned: minutes, elapsed: 0, pauses: 0, returned: 0, running: true };
  clearInterval(ticker);
  ticker = setInterval(updateTimer, 1000);
  $('#sActivity').textContent = activity;
  setPaused(false);
  updateTimer(true);
  show('session');
}

function updateTimer(silent) {
  if (!cur) return;
  if (cur.running && silent !== true) cur.elapsed++;
  const total = cur.planned * 60, left = Math.max(0, total - cur.elapsed);
  $('#time').textContent = clock(left);
  $('#prog').style.width = `${Math.min(100, cur.elapsed / total * 100)}%`;
  $('#prog').parentElement.setAttribute('aria-valuenow', Math.round(cur.elapsed / total * 100));
  if (left === 0) endSession('Completed');
}

function setPaused(p) {
  if (!cur) return;
  cur.running = !p;
  $('#pauseBtn').textContent = p ? 'Resume Session' : 'Pause Session';
  $('#status').textContent = p ? 'Session paused' : 'Focus session active';
}

function endSession(status) {
  if (!cur) return;
  clearInterval(ticker);
  const rec = { activity: cur.activity, planned: cur.planned, focusedSec: cur.elapsed, pauses: cur.pauses, returned: cur.returned, status };
  const list = store.load(); list.push(rec); store.save(list);
  cur = null;
  renderSummary(rec);
  show('summary');
}

/* ---------- The 5-second Focus Pause ---------- */
const BREATH = { 5: 'Breathe in', 4: 'Breathe in', 3: 'Hold', 2: 'Breathe out', 1: 'Breathe out' };
let wasRunning = false;

function triggerFocusPause() {
  if (!cur) return;
  if ($('#overlay').hidden === false) return;
  cur.pauses++;
  wasRunning = cur.running;
  cur.running = false;               // the clock waits while the student decides
  $('#overlay').hidden = false;
  $('#stepChoice').hidden = true;
  $('#stepPause').hidden = false;
  runCountdown();
}

function runCountdown() {
  let c = 5;
  const arc = $('#arc');
  arc.style.transition = 'none'; arc.style.strokeDashoffset = 0;
  const paint = () => { $('#count').textContent = c; $('#breath').textContent = BREATH[c]; };
  paint();
  void arc.getBoundingClientRect();
  arc.style.transition = '';
  clearInterval(cdTimer);
  cdTimer = setInterval(() => {
    c--;
    arc.style.strokeDashoffset = 339.3 * (5 - c) / 5;
    if (c <= 0) { clearInterval(cdTimer); showChoice(); return; }
    paint();
  }, 1000);
}

function showChoice() {
  $('#stepPause').hidden = true;
  $('#stepChoice').hidden = false;
  $('#returnBtn').focus();
}

function closeOverlay() { clearInterval(cdTimer); $('#overlay').hidden = true; }

function returnToLearning() {
  cur.returned++;
  closeOverlay();
  cur.running = wasRunning || true;
  setPaused(false);
  toast('Welcome back. Continue where you left off.');
  $('#distract').focus();
}

function leaveSession() {
  closeOverlay();
  endSession('Left after pause');
}

function toast(msg) {
  const t = $('#toast'); t.textContent = msg;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.textContent = '', 4000);
}

/* ---------- Rendering ---------- */
function totals() {
  const l = store.load();
  const sum = k => l.reduce((a, s) => a + s[k], 0);
  return {
    list: l, n: l.length, done: l.filter(s => s.status === 'Completed').length,
    sec: sum('focusedSec'), pauses: sum('pauses'), returned: sum('returned')
  };
}

function updateDashboard() {
  const t = totals();
  $('#stats').innerHTML = statCards([[t.n, 'Focus Sessions'], [fmtDur(t.sec), 'Total Focus Time'], [t.pauses, 'Pause Interventions'], [t.done, 'Sessions Completed']]);
}

function renderSummary(r) {
  $('#sumStats').innerHTML = statCards([
    [r.planned + ' min', 'Planned Duration'], [fmtDur(r.focusedSec), 'Focus Time'],
    [r.pauses, 'Pause Interventions'], [r.returned, 'Returned to Learning'], [r.status, 'Session Status']]);
  const p = n => `${n} distraction impulse${n === 1 ? '' : 's'}`;
  $('#sumText').textContent = r.pauses
    ? `You noticed ${p(r.pauses)} and returned to learning ${r.returned} time${r.returned === 1 ? '' : 's'}.`
    : 'You did not trigger any pauses in this session.';
}

function renderInsights() {
  const t = totals();
  const avg = t.n ? fmtDur(Math.round(t.sec / t.n)) : '—';
  $('#inStats').innerHTML = statCards([[t.done, 'Sessions completed'], [Math.round(t.sec / 60), 'Focus minutes'],
    [t.pauses, 'Distraction impulses'], [t.returned, 'Times returned to learning'], [avg, 'Average session duration']]);
  const recent = t.list.slice(-8);
  $('#chart').innerHTML = recent.length ? recent.map((s, i) => {
    const h = Math.min(100, s.focusedSec / (s.planned * 60) * 100);
    return `<div class="col"><div style="height:${Math.max(4, h)}%"><i style="height:100%"></i></div>#${t.n - recent.length + i + 1}</div>`;
  }).join('') : '<p class="sub">No sessions yet. Complete a session or use Demo Mode to see your chart.</p>';
  $('#chart').style.cssText = recent.length ? '' : 'height:auto';
  const out = [];
  const long = t.list.filter(s => s.planned >= 45), short = t.list.filter(s => s.planned < 45);
  const av = a => a.reduce((x, s) => x + s.pauses, 0) / a.length;
  if (long.length && short.length) {
    out.push(av(long) > av(short) ? 'Most interruptions happened during longer sessions.' : 'Interruptions were not higher in longer sessions so far.');
    const rate = a => a.filter(s => s.status === 'Completed').length / a.length;
    if (rate(short) > rate(long)) out.push('Short sessions may be easier to complete.');
  } else out.push('Record both short (under 45 min) and long sessions to compare patterns.');
  $('#patterns').innerHTML = out.map(x => `<li>${x}</li>`).join('');
}

const CATS = ['Problem Understanding', 'Creativity', 'Logical Reasoning', 'Number of Ideas', 'Practicality', 'Time Required', 'New Ideas', 'Limitations', 'User Focus', 'Implementation Possibility'];
$('#cmp').innerHTML = CATS.map(c => `<tr><td>${c}</td><td>To be added</td><td>To be added after AI stage</td></tr>`).join('');

const demoHTML = `<h3>Demo Mode</h3><p class="note">Distractions are simulated. Use these controls to test the intervention.</p>
<div class="row"><button class="btn ghost sm" data-d="sim">Simulate distraction</button><button class="btn ghost sm" data-d="pause">Trigger 5-second pause</button>
<button class="btn ghost sm" data-d="done">Complete session</button><button class="btn ghost sm" data-d="reset">Reset demo data</button></div><p class="note" data-msg></p>`;
$$('[data-demo]').forEach(d => d.innerHTML = demoHTML);

/* ---------- Navigation ---------- */
function show(id) {
  $$('.view').forEach(v => v.classList.toggle('on', v.id === id));
  $$('nav a').forEach(a => a.classList.toggle('on', a.dataset.view === id));
  $('#live').hidden = !cur; $('#noSession').hidden = !!cur;
  if (id === 'dashboard') updateDashboard();
  if (id === 'insights') renderInsights();
  $('#nav').classList.remove('open'); $('#burger').setAttribute('aria-expanded', 'false');
  window.scrollTo(0, 0);
}

function resetDemo() {
  closeOverlay(); clearInterval(ticker); cur = null; store.clear();
  show('dashboard');
}

/* ---------- Events ---------- */
document.addEventListener('click', e => {
  const v = e.target.closest('[data-view]');
  if (v) { e.preventDefault(); show(v.dataset.view); return; }
  const d = e.target.closest('[data-d]');
  if (!d) return;
  const msg = $('[data-msg]', d.closest('[data-demo]'));
  const a = d.dataset.d;
  if (a === 'reset') return resetDemo();
  if ((a === 'sim' || a === 'pause') && !cur) startSession('Coding Practice (demo)', 25);
  if (a === 'sim' || a === 'pause') return triggerFocusPause();
  if (!cur) { msg.textContent = 'Start a session first, or use Simulate distraction.'; return; }
  cur.elapsed = cur.planned * 60; endSession('Completed');
});
$('#burger').onclick = () => { const o = $('#nav').classList.toggle('open'); $('#burger').setAttribute('aria-expanded', o); };
$('#activity').onchange = e => { $('#custom').hidden = e.target.value !== 'Custom'; };
$('#begin').onclick = () => {
  let a = $('#activity').value;
  if (a === 'Custom') a = $('#custom').value.trim() || 'Custom Learning Activity';
  startSession(a, +$('#duration').value);
};
$('#pauseBtn').onclick = () => setPaused(cur.running);
$('#endBtn').onclick = () => endSession(cur.elapsed >= cur.planned * 60 ? 'Completed' : 'Ended early');
$('#distract').onclick = triggerFocusPause;
$('#returnBtn').onclick = returnToLearning;
$('#leaveBtn').onclick = leaveSession;

show('home');