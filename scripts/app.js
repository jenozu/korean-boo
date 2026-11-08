// 한글 — app logic. DATA is injected by scripts/build_standalone.py.
const STORAGE_KEY = 'hangeul-standalone';
const LEGACY_KEY = 'hangeul-web-v1'; // first Korean prototype
const MIN = 60 * 1000, DAY = 24 * 60 * MIN;
const INTERVALS = { again: 10 * MIN, hard: DAY, good: 3 * DAY, easy: 7 * DAY };
const DAYS = [
  ['Say hello', 'Items 1–20 · greetings, yes/no, understanding'],
  ['People around you', 'Items 21–40 · people and useful questions'],
  ['Make things happen', 'Items 41–60 · verbs and time'],
  ['Find your way', 'Items 61–80 · places, directions, food'],
  ['Ask for what you need', 'Items 81–100 · descriptions and survival'],
];
const LETTER_BY_ID = Object.fromEntries(DATA.letters.map(l => [l.id, l]));
const $ = id => document.getElementById(id);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// ---------- State ----------
// Local calendar date (not UTC), so the daily counter rolls over at local midnight.
function todayKey() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function emptyState() {
  return { version: 1, goal: 10, daily: { date: todayKey(), reviewed: [] }, stageItems: {}, letters: {}, events: [] };
}
function normalizeState(raw) {
  const n = emptyState();
  if (!raw || typeof raw !== 'object') return n;
  if (raw.version === 1 && raw.stageItems && raw.letters) {
    n.goal = Math.max(5, Math.min(30, Number(raw.goal) || 10));
    n.stageItems = raw.stageItems; n.letters = raw.letters;
    n.events = Array.isArray(raw.events) ? raw.events.slice(-500) : [];
    if (raw.daily && raw.daily.date === todayKey() && Array.isArray(raw.daily.reviewed)) n.daily = raw.daily;
    return n;
  }
  return n;
}
// Carry progress over from the first Korean prototype (hangeul-web-v1).
function migrateLegacy(old) {
  const n = emptyState(), now = new Date().toISOString();
  n.goal = Math.max(5, Math.min(30, Number(old.dailyGoal) || 10));
  const rec = () => ({ attempts: 1, correct: 1, intervalDays: 0, lastReviewed: now, nextReview: null, lastRating: 'good', difficulty: 'good', streakContribution: 1 });
  Object.entries(old.cards || {}).forEach(([id, c]) => { if (c && c.mastery >= 3 && LETTER_BY_ID[id]) n.letters[id] = rec(); });
  Object.keys(old.reviewed || {}).forEach(k => { const m = /^stage-1-(\d+)$/.exec(k); if (m) n.stageItems[m[1]] = rec(); });
  return n;
}
function loadState() {
  try {
    const cur = localStorage.getItem(STORAGE_KEY);
    if (cur) return normalizeState(JSON.parse(cur));
    const old = localStorage.getItem(LEGACY_KEY);
    if (old) return migrateLegacy(JSON.parse(old));
  } catch (e) { /* corrupted or blocked storage: start fresh */ }
  return emptyState();
}
let state = loadState();
let day = 1, current = null, revealed = false;

function rollDaily() { if (state.daily.date !== todayKey()) state.daily = { date: todayKey(), reviewed: [] }; }
function save() {
  rollDaily();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  update();
}

// ---------- Scheduling (transparent, deterministic) ----------
const isDue = r => !!r && !!r.nextReview && Date.parse(r.nextReview) <= Date.now();
const isMastered = r => !!r && (r.lastRating === 'good' || r.lastRating === 'easy');
function scheduleRecord(collection, id, rating) {
  const r = collection[id] || { attempts: 0, correct: 0, intervalDays: 0, lastReviewed: null, nextReview: null, lastRating: null, difficulty: 'new', streakContribution: 0 };
  const prev = Number(r.intervalDays) || 0;
  let ms = INTERVALS[rating];
  if (rating === 'good' && prev) ms = Math.max(ms, prev * 2 * DAY);
  if (rating === 'easy' && prev) ms = Math.max(ms, prev * 2.5 * DAY);
  if (rating === 'hard') ms = Math.min(ms, Math.max(INTERVALS.hard, prev * DAY));
  const now = Date.now();
  r.attempts++; if (rating !== 'again') r.correct++;
  r.intervalDays = ms / DAY;
  r.lastReviewed = new Date(now).toISOString();
  r.nextReview = new Date(now + ms).toISOString();
  r.lastRating = rating; r.difficulty = rating; r.streakContribution = rating === 'again' ? 0 : 1;
  collection[id] = r;
  return r;
}
// Queue order: overdue first, then weak (again/hard), then untouched, then everything else by next review.
function priority(r) {
  if (isDue(r)) return 0;
  if (!r) return 2;
  return (r.lastRating === 'again' || r.lastRating === 'hard') ? 1 : 3;
}
function dayItems() { return DATA.items.filter(x => x.day === day); }
function queue() {
  return dayItems().sort((a, b) => {
    const ra = state.stageItems[a.n], rb = state.stageItems[b.n];
    return priority(ra) - priority(rb) || (ra?.nextReview || '').localeCompare(rb?.nextReview || '') || a.n - b.n;
  });
}
function pickNext(justRated) {
  const q = queue();
  return q.find(x => x.n !== justRated) || q[0];
}
function scheduleReason(r) {
  if (!r) return 'New item — first review';
  if (isDue(r)) return 'Due now — overdue items appear first';
  if (r.lastRating === 'again' || r.lastRating === 'hard') return 'Back because it was tricky last time · next ' + new Date(r.nextReview).toLocaleString();
  return 'Next review ' + new Date(r.nextReview).toLocaleDateString() + ' · ' + r.lastRating;
}
function logEvent(type, id, rating, rec) {
  state.events.push({ type, id, rating, at: new Date().toISOString(), nextReview: rec.nextReview });
  if (state.events.length > 500) state.events = state.events.slice(-500);
}
function markDaily(key) { rollDaily(); if (!state.daily.reviewed.includes(key)) state.daily.reviewed.push(key); }

// ---------- Audio ----------
function koreanVoice() {
  if (!('speechSynthesis' in window)) return null;
  const voices = speechSynthesis.getVoices().filter(v => v.lang.replace('_', '-').toLowerCase().startsWith('ko'));
  return voices.find(v => /yuna|google|siri|premium|enhanced/i.test(v.name)) || voices[0] || null;
}
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.8;
  const v = koreanVoice(); if (v) u.voice = v;
  speechSynthesis.speak(u);
}
document.addEventListener('click', e => { const b = e.target.closest('[data-say]'); if (b) speak(b.dataset.say); });
function speakCurrent() { if (current) speak(current.ko); }

// ---------- Views ----------
function update() {
  rollDaily();
  const stageDone = Object.keys(state.stageItems).length;
  const mastered = DATA.letters.filter(l => isMastered(state.letters[l.id])).length;
  const alphaPct = Math.round(mastered / DATA.letters.length * 100);
  const daily = state.daily.reviewed.length;
  $('todayDone').textContent = daily;
  $('mastered').textContent = mastered;
  $('overall').textContent = alphaPct + '%';
  $('goalValue').textContent = state.goal;
  $('remaining').textContent = Math.max(0, state.goal - daily);
  $('goalBar').style.width = Math.min(100, daily / state.goal * 100) + '%';
  $('stageProgress').textContent = stageDone;
  $('progressStage').textContent = stageDone;
  $('stageBar').style.width = stageDone + '%';
  $('progressAlpha').textContent = alphaPct;
  $('alphaBar').style.width = alphaPct + '%';
  if ($('stateDetails')) $('stateDetails').textContent = 'Version ' + state.version + ' · ' + stageDone + ' Stage 1 items · ' + Object.keys(state.letters).length + ' letters reviewed · ' + state.events.length + ' review events · daily counter resets after ' + state.daily.date;
  if ($('debugSchedule')) renderDebug();
}
function show(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('hidden', x.id !== v));
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  if (v === 'stage') renderStage();
  if (v === 'alphabet') renderAlphabet();
  if (v === 'progress') renderProgress();
  if (v === 'settings') update();
  scrollTo(0, 0);
}
document.querySelectorAll('.nav button').forEach(b => b.onclick = () => show(b.dataset.view));
function changeGoal(n) { state.goal = Math.max(5, Math.min(30, state.goal + n)); save(); }

function renderDays() {
  const d = $('days'); d.innerHTML = '';
  DAYS.forEach((x, i) => {
    const b = document.createElement('button');
    b.className = 'day ' + (day === i + 1 ? 'active' : '');
    b.innerHTML = '<b>DAY ' + (i + 1) + '</b><strong>' + x[0] + '</strong><small>' + x[1] + '</small>';
    b.onclick = () => { day = i + 1; current = null; revealed = false; renderStage(); };
    d.appendChild(b);
  });
}
function renderStage() {
  renderDays();
  if (!current || current.day !== day) current = pickNext(null);
  const x = current, meta = DAYS[day - 1];
  const done = dayItems().filter(i => state.stageItems[i.n]).length;
  $('dayEyebrow').textContent = 'DAY ' + day + ' / ' + meta[0].toUpperCase();
  $('daySummary').textContent = meta[1];
  $('itemCounter').textContent = done + '/20';
  $('sectionLabel').textContent = 'STAGE 1 · ITEM ' + x.n;
  $('itemIndex').textContent = x.n;
  $('meaning').textContent = x.en;
  $('russian').textContent = x.ko;
  $('pron').textContent = x.pron;
  $('englishBack').textContent = x.en;
  $('front').classList.toggle('hidden', revealed);
  $('back').classList.toggle('hidden', !revealed);
  $('reveal').classList.toggle('hidden', revealed);
  $('audio').classList.toggle('hidden', !revealed);
  $('ratings').classList.toggle('hidden', !revealed);
  $('whyThis').textContent = scheduleReason(state.stageItems[x.n]);
  // Optional 4th argument adds a speaker button on the right that plays that Korean text.
  const line = (a, b, c, say) => say
    ? '<div class="line lineRow"><div class="lineText"><b>' + esc(a) + '</b><span>' + esc(b) + '</span><small>' + esc(c) + '</small></div>' +
      '<button class="lineAudio" data-say="' + esc(say) + '" aria-label="Hear ' + esc(say) + '" title="Hear it">🔊</button></div>'
    : '<div class="line"><b>' + esc(a) + '</b><span>' + esc(b) + '</span><small>' + esc(c) + '</small></div>';
  // Fill-in templates (with … or a/b particles) read badly aloud, so only complete sentences get a button.
  const sayable = t => /[…\/]|\.\.\./.test(t) ? '' : t;
  $('patterns').innerHTML = DATA.patterns.map(p => {
    let h = line(p.template[0], p.template[1], p.template[2], sayable(p.template[0]));
    if (p.example) h += line(p.example[0], p.example[1], p.example[2], p.example[0]);
    return h;
  }).join('');
  $('conversation').innerHTML = DATA.conversations.map(c =>
    '<div class="eyebrow" style="margin-top:6px">' + esc(c.title.toUpperCase()) + '</div>' +
    c.lines.map(l => line(l.speaker + ' · ' + l.ko, l.pron, l.en, l.ko)).join('')).join('');
  $('checklist').innerHTML = DATA.checklist.map(c => '<div class="line"><b>□ ' + esc(c) + '</b></div>').join('') +
    '<p class="hint">' + esc(DATA.threshold) + '</p>' +
    '<div class="eyebrow" style="margin-top:10px">PRONUNCIATION KEY</div>' +
    DATA.pronKey.map(k => '<div class="line"><span style="margin:0">' + esc(k) + '</span></div>').join('') +
    DATA.pronNotes.map(n => line(n.ko, n.note, '')).join('');
}
function reveal() { revealed = true; renderStage(); }
function rateCurrent(rating) {
  const x = current;
  const rec = scheduleRecord(state.stageItems, x.n, rating);
  markDaily('s:' + x.n);
  logEvent('stage-review', x.n, rating, rec);
  current = pickNext(x.n); revealed = false;
  save(); renderStage();
}

function renderAlphabet() {
  $('alphabetGrid').innerHTML = DATA.letters.map(l =>
    '<button class="letter" data-sound="' + esc(l.example) + '" title="Tap to hear ' + esc(l.example) + '">' +
    '<span class="g">' + l.glyph + '</span><span class="l">' + esc(l.name) + '</span>' +
    '<small>' + esc(l.rr) + ' · ' + esc(l.sound) + '</small>' +
    '<em>' + esc(l.example) + ' · ' + esc(l.meaning.split(' / ')[0]) + '</em></button>').join('');
  document.querySelectorAll('#alphabetGrid [data-sound]').forEach(b => b.onclick = () => speak(b.dataset.sound));
}
function renderProgress() {
  const n = DATA.letters.filter(l => isMastered(state.letters[l.id])).length;
  $('masteryHint').textContent = n + ' / ' + DATA.letters.length;
  $('masteryGrid').innerHTML = DATA.letters.map(l => {
    const r = state.letters[l.id];
    const label = r ? (isDue(r) ? 'Due now' : 'Next ' + new Date(r.nextReview).toLocaleDateString()) : 'New';
    const btn = (k, t, full) => '<button title="' + full + '" onclick="rateLetter(\'' + l.id + '\',\'' + k + '\')">' + t + '</button>';
    return '<div class="letter" style="opacity:' + (r ? 1 : .48) + '"><span class="g">' + l.glyph + '</span><span class="l">' + esc(l.rr) + '</span><small>' + label + '</small>' +
      '<div class="mini-ratings">' + btn('again', 'A', 'Again') + btn('hard', 'H', 'Hard') + btn('good', 'G', 'Good') + btn('easy', 'E', 'Easy') + '</div></div>';
  }).join('');
}
function rateLetter(id, rating) {
  const rec = scheduleRecord(state.letters, id, rating);
  markDaily('l:' + id);
  logEvent('letter-review', id, rating, rec);
  save(); renderProgress();
}
function renderDebug() {
  const rows = [
    ...Object.entries(state.stageItems).map(([id, r]) => ({ kind: 'Stage', id, r })),
    ...Object.entries(state.letters).map(([id, r]) => ({ kind: 'Letter', id: (LETTER_BY_ID[id] || {}).glyph || id, r })),
  ].sort((a, b) => (a.r.nextReview || '').localeCompare(b.r.nextReview || ''));
  $('debugSchedule').innerHTML = rows.length ? rows.slice(0, 40).map(x =>
    '<div class="debugItem"><b>' + esc(x.kind) + ' ' + esc(x.id) + '</b><span>Last ' + (x.r.lastReviewed ? new Date(x.r.lastReviewed).toLocaleString() : '—') +
    ' · ' + (x.r.lastRating || 'new') + ' · Next ' + (x.r.nextReview ? new Date(x.r.nextReview).toLocaleString() : 'not scheduled') + '</span></div>').join('') : 'No reviews yet.';
}

// ---------- Backup, import, reset ----------
function exportState() {
  rollDaily();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' }));
  a.download = 'hangeul-progress-' + todayKey() + '.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 500);
}
function importState(e) {
  const file = e.target.files[0]; if (!file) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const parsed = JSON.parse(r.result);
      if (!parsed || parsed.version !== 1 || !parsed.stageItems || !parsed.letters) throw Error('shape');
      state = normalizeState(parsed); current = null; save(); renderStage(); renderProgress();
      alert('Backup imported.');
    } catch (_) { alert('That backup could not be imported.'); }
    e.target.value = '';
  };
  r.readAsText(file);
}
function resetState() {
  if (confirm('Reset all local 한글 progress?')) {
    state = emptyState(); current = null; save(); renderStage(); renderProgress();
    alert('Local progress reset.');
  }
}

if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = () => {};
update(); renderStage();
