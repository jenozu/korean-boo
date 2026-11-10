// 한글 — app logic. DATA is injected by scripts/build_standalone.py.

// ---------- Constants ----------
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
const ITEM_BY_N = Object.fromEntries(DATA.items.map(i => [i.n, i]));
const LETTER_BY_ID = Object.fromEntries(DATA.letters.map(l => [l.id, l]));
const LETTER_COUNT = DATA.letters.length;
const BADGE_NAMES = { 'first-win': 'First small win', 'steady-learner': '50 XP learner', 'three-day-streak': '3-day streak' };
const SCENARIO = DATA.scenario;
const STORY = DATA.story;

// ---------- DOM helpers ----------
const $ = id => document.getElementById(id);
const setText = (id, text) => { const el = $(id); if (el) el.textContent = text; };
const setHidden = (id, hidden) => { const el = $(id); if (el) el.classList.toggle('hidden', hidden); };
const setWidth = (id, pct) => { const el = $(id); if (el) el.style.width = Math.max(0, Math.min(100, pct)) + '%'; };
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const escapeRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Dates (local calendar day, not UTC) ----------
function todayKey() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}
function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// ---------- State ----------
function emptyState() {
  return {
    version: 1, goal: 10, audio: { speed: 0.8, voiceName: '' },
    daily: { date: todayKey(), reviewed: [] }, stageItems: {}, letters: {}, events: [],
    scenario: { attempts: 0, completed: 0, lastCompletedAt: null },
    story: { attempts: 0, correct: 0, clozeCorrect: 0 },
    contextDismissed: {},
    motivation: { xp: 0, rewards: {}, badges: [], activityDates: [], weeklyGoal: 5 },
    account: { id: '', displayName: '', createdAt: null },
    sync: { lastExportAt: null, lastImportAt: null },
  };
}
const clampGoal = v => Math.max(5, Math.min(30, Number(v) || 10));
function normalizeState(raw) {
  const n = emptyState();
  if (!raw || typeof raw !== 'object' || raw.version !== 1 || !raw.stageItems || !raw.letters) return n;
  const m = raw.motivation || {};
  n.goal = clampGoal(raw.goal);
  n.audio = { ...n.audio, ...(raw.audio || {}) };
  n.stageItems = raw.stageItems; n.letters = raw.letters;
  n.events = Array.isArray(raw.events) ? raw.events.slice(-500) : [];
  n.scenario = { ...n.scenario, ...(raw.scenario || {}) };
  n.story = { ...n.story, ...(raw.story || {}) };
  n.contextDismissed = { ...(raw.contextDismissed || {}) };
  n.motivation = {
    xp: Number(m.xp) || 0,
    rewards: { ...(m.rewards || {}) },
    badges: Array.isArray(m.badges) ? m.badges : [],
    activityDates: Array.isArray(m.activityDates) ? m.activityDates : [],
    weeklyGoal: Math.max(1, Math.min(7, Number(m.weeklyGoal) || 5)),
  };
  n.account = { ...n.account, ...(raw.account || {}) };
  n.sync = { ...n.sync, ...(raw.sync || {}) };
  if (raw.daily && raw.daily.date === todayKey() && Array.isArray(raw.daily.reviewed)) n.daily = raw.daily;
  return n;
}
// Carry progress over from the first Korean prototype (hangeul-web-v1).
function migrateLegacy(old) {
  const n = emptyState(), now = new Date().toISOString();
  n.goal = clampGoal(old.dailyGoal);
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
let quizStarted = false, quizAnswered = false, quizItemId = null, quizReason = '', quizSession = { seen: {}, asked: 0 };
let scenarioState = { started: false, turn: 0, english: false, pending: false };
let storyEnglish = false, storyAnswers = {};

function rollDaily() { if (state.daily.date !== todayKey()) state.daily = { date: todayKey(), reviewed: [] }; }
function save() {
  rollDaily();
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
  update();
}
function pushEvent(ev) {
  state.events.push(ev);
  if (state.events.length > 500) state.events = state.events.slice(-500);
}
function markDaily(key) { rollDaily(); if (!state.daily.reviewed.includes(key)) state.daily.reviewed.push(key); }

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
  pushEvent({ type, id, rating, at: new Date().toISOString(), nextReview: rec.nextReview });
}

// ---------- Motivation: XP, streak, badges (idempotent per reward key) ----------
function recordMotivationActivity() {
  const d = todayKey();
  if (!state.motivation.activityDates.includes(d)) state.motivation.activityDates.push(d);
}
function streakCount() {
  const days = new Set(state.motivation.activityDates || []);
  let d = todayKey();
  if (!days.has(d)) d = shiftDay(d, -1); // today may not be over yet
  let n = 0;
  while (days.has(d)) { n++; d = shiftDay(d, -1); }
  return n;
}
function weeklyActivityCount() {
  const today = todayKey(), cutoff = shiftDay(today, -6);
  return (state.motivation.activityDates || []).filter(x => x >= cutoff && x <= today).length;
}
function updateBadges() {
  const m = state.motivation, badges = [];
  if (m.xp >= 10) badges.push('first-win');
  if (m.xp >= 50) badges.push('steady-learner');
  if (streakCount() >= 3) badges.push('three-day-streak');
  m.badges = badges;
}
function awardXP(key, amount, label) {
  if (state.motivation.rewards[key]) return false;
  const at = new Date().toISOString();
  state.motivation.rewards[key] = { amount, label, at };
  state.motivation.xp += amount;
  recordMotivationActivity();
  updateBadges();
  pushEvent({ type: 'xp-awarded', key, amount, label, at });
  save();
  return true;
}
function renderMotivation() {
  if (!$('motivationXp')) return;
  updateBadges();
  const m = state.motivation, week = weeklyActivityCount(), streak = streakCount();
  setText('motivationXp', m.xp + ' XP');
  setText('motivationStreak', streak + ' ' + (streak === 1 ? 'day' : 'days'));
  setText('motivationWeek', week + ' / ' + m.weeklyGoal);
  setText('motivationBadges', m.badges.length);
  setText('motivationHint', week >= m.weeklyGoal ? 'Weekly goal complete — keep the loop light.' : Math.max(0, m.weeklyGoal - week) + ' activity day' + (m.weeklyGoal - week === 1 ? '' : 's') + ' to reach this week’s goal.');
  setText('motivationDailyGoal', state.goal);
  setText('motivationWeeklyGoal', m.weeklyGoal);
  const list = $('badgeList');
  if (list) list.innerHTML = m.badges.map(x => '<span class="badge">' + BADGE_NAMES[x] + '</span>').join('') || '<span class="badge">No badges yet — keep one small loop going.</span>';
}
function changeWeeklyGoal(n) { state.motivation.weeklyGoal = Math.max(1, Math.min(7, state.motivation.weeklyGoal + n)); save(); }

// ---------- Speech utilities ----------
function normalizeSpeechWords(text) {
  return String(text || '').toLocaleLowerCase('ko-KR').replace(/[^\p{L}\p{N}\s-]/gu, ' ').split(/\s+/).map(x => x.trim()).filter(Boolean);
}
function compareSpeech(targetText, answerText) {
  const targetWords = normalizeSpeechWords(targetText), answerWords = normalizeSpeechWords(answerText), remaining = {};
  targetWords.forEach(w => remaining[w] = (remaining[w] || 0) + 1);
  let matched = 0; const extra = [];
  answerWords.forEach(w => { if (remaining[w]) { remaining[w]--; matched++; } else extra.push(w); });
  const missing = [];
  Object.keys(remaining).forEach(w => { for (let i = 0; i < remaining[w]; i++) missing.push(w); });
  const score = targetWords.length ? Math.round((2 * matched / (targetWords.length + answerWords.length)) * 100) : 0;
  const feedback = score === 100 ? 'Exact word match — nice work.' : score >= 70 ? 'Good start. Practice the missing words once more.' : score > 0 ? 'You caught part of the phrase. Try the missing words slowly.' : 'No target words matched yet. Listen again, then retry.';
  return { score, matched, targetCount: targetWords.length, missing, extra, feedback };
}

// ---------- Audio: browser speech synthesis (M3) ----------
const audioController = (() => {
  let currentText = '', currentGuide = '', currentUtterance = null, voices = [];
  let speed = Number(state.audio.speed) || 0.8;
  const supported = () => 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;
  const setStatus = t => setText('audioStatus', t);
  const findVoice = name => voices.find(v => v.name === name) || voices.find(v => /^ko(-|_)/i.test(v.lang)) || voices.find(v => /korean|한국/i.test(v.name)) || null;
  function refreshVoices() {
    if (!supported()) { setStatus('Speech playback is unavailable here; the lesson still works without audio.'); return; }
    voices = speechSynthesis.getVoices();
    const select = $('voiceSelect');
    if (!select) return;
    select.innerHTML = '';
    if (!voices.length) {
      const o = document.createElement('option'); o.value = ''; o.textContent = 'No browser voices available';
      select.appendChild(o); select.disabled = true;
      setStatus('No browser voices available; use the pronunciation guide or enable a Korean voice in your browser.');
      return;
    }
    select.disabled = false;
    voices.forEach(v => { const o = document.createElement('option'); o.value = v.name; o.textContent = v.name + ' · ' + v.lang; select.appendChild(o); });
    const chosen = findVoice(state.audio.voiceName || '');
    if (chosen) select.value = chosen.name;
    setStatus(chosen ? 'Korean voice ready · ' + chosen.name : 'No Korean voice found; using browser fallback.');
  }
  function playText(text, guide = '') {
    if (!supported()) { setStatus('Speech playback is unavailable here; use the pronunciation guide.'); return; }
    currentText = String(text || '').trim(); currentGuide = guide;
    if (!currentText) return;
    speechSynthesis.cancel(); // never stack utterances
    const u = new SpeechSynthesisUtterance(currentText);
    currentUtterance = u;
    const voice = findVoice(state.audio.voiceName || '');
    if (voice) { u.voice = voice; u.lang = voice.lang || 'ko-KR'; } else { u.lang = 'ko-KR'; }
    u.rate = speed;
    const pron = () => $('pron');
    u.onstart = () => { if (u !== currentUtterance) return; setStatus('Playing · ' + currentText); if (pron()) pron().classList.add('speaking'); };
    u.onend = () => { if (u !== currentUtterance) return; setStatus('Ready · ' + (voice ? voice.lang : 'ko-KR')); if (pron()) pron().classList.remove('speaking'); };
    u.onerror = e => {
      if (u !== currentUtterance || (e && (e.error === 'canceled' || e.error === 'interrupted'))) return;
      setStatus('Audio could not play; the lesson is still available.');
      if (pron()) pron().classList.remove('speaking');
    };
    speechSynthesis.speak(u);
  }
  function playCurrent() { if (current) playText(current.ko, current.pron); }
  function pause() {
    if (!supported()) return;
    if (speechSynthesis.speaking && !speechSynthesis.paused) { speechSynthesis.pause(); setStatus('Paused'); }
    else if (speechSynthesis.paused) { speechSynthesis.resume(); setStatus('Playing · ' + currentText); }
  }
  function replay() { if (currentText) playText(currentText, currentGuide); else playCurrent(); }
  function setSpeed(value) { speed = Number(value) || 0.8; state.audio.speed = speed; save(); setStatus('Speed set to ' + speed + '×'); }
  function setVoice(name) {
    state.audio.voiceName = name; save();
    const v = findVoice(name);
    setStatus(v ? 'Voice selected · ' + v.name : 'Using browser fallback voice');
  }
  return { playText, playCurrent, pause, replay, setSpeed, setVoice, refreshVoices };
})();

// ---------- Microphone capture, in memory only (M4) ----------
const recordingController = (() => {
  let recorder = null, stream = null, chunks = [], objectUrl = '', player = null, timer = null, startedAt = 0, discarding = false;
  const supported = () => !!(window.MediaRecorder && navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  const secure = () => window.isSecureContext || location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  const status = t => setText('recordStatus', t);
  const setDisabled = (id, v) => { const el = $(id); if (el) el.disabled = v; };
  function duration() {
    const s = Math.floor((Date.now() - startedAt) / 1000);
    setText('recordDuration', String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'));
  }
  function clearUrl() {
    if (player) { player.pause(); player.removeAttribute('src'); player.load(); player = null; }
    if (objectUrl) { URL.revokeObjectURL(objectUrl); objectUrl = ''; }
  }
  function refresh() {
    const ok = supported() && secure();
    setDisabled('recordStart', !ok || !!recorder);
    setDisabled('recordStop', !recorder);
    setDisabled('recordReplay', !objectUrl);
    setDisabled('recordDiscard', !objectUrl);
    setText('secureNote', secure() ? 'Recording is local-only; nothing is uploaded.' : 'Microphone recording requires a secure HTTPS context.');
    if (!supported()) status('Microphone recording is not supported in this browser.');
    else if (!secure()) status('Microphone needs HTTPS or localhost; the rest of the lesson remains available.');
    else if (!recorder && !objectUrl) status('Ready when you are — recording starts only after you tap Record.');
  }
  async function start() {
    if (!supported() || !secure()) { refresh(); return; }
    clearUrl(); chunks = [];
    try {
      status('Requesting microphone permission…');
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      recorder = new MediaRecorder(stream);
      startedAt = Date.now(); duration(); timer = setInterval(duration, 250);
      recorder.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
      recorder.onstop = () => {
        if (timer) { clearInterval(timer); timer = null; }
        if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
        const mime = recorder && recorder.mimeType;
        const wasDiscarding = discarding; discarding = false;
        recorder = null;
        if (wasDiscarding) { chunks = []; status('Recording discarded. Nothing was uploaded.'); refresh(); return; }
        objectUrl = URL.createObjectURL(new Blob(chunks, { type: mime || 'audio/webm' }));
        player = new Audio(objectUrl);
        status('Recording saved in memory — replay or discard it.');
        refresh();
      };
      recorder.onerror = () => { status('Recording failed; you can continue the lesson.'); stop(); };
      recorder.start();
      refresh();
      status('Recording… tap Stop when you finish.');
    } catch (error) {
      if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
      recorder = null;
      const message = error && error.name === 'NotAllowedError' ? 'Microphone permission was denied. You can continue without recording.'
        : error && error.name === 'NotFoundError' ? 'No microphone was found. You can continue without recording.'
        : 'Microphone could not start. You can continue without recording.';
      refresh(); status(message);
    }
  }
  function stop() {
    if (recorder && recorder.state !== 'inactive') { status('Finishing recording…'); recorder.stop(); }
    else refresh();
  }
  function replay() {
    if (!player) { status('Record something first.'); return; }
    player.currentTime = 0;
    player.onended = () => status('Recording finished — replay or discard it.');
    player.play().then(() => status('Playing your recording…')).catch(() => status('The recording could not be replayed.'));
  }
  function discard() {
    if (recorder && recorder.state !== 'inactive') { discarding = true; recorder.stop(); }
    clearUrl(); chunks = [];
    setText('recordDuration', '00:00');
    refresh();
    if (!recorder) status('Recording discarded. Nothing was uploaded.');
  }
  return { start, stop, replay, discard, refresh };
})();

// ---------- Browser-native transcription with consent (M5) and word feedback (M6) ----------
const transcriptionController = (() => {
  let recognition = null, phase = 'idle', consent = false, finalText = '', target = '';
  const Engine = () => window.SpeechRecognition || window.webkitSpeechRecognition || null;
  const supported = () => !!Engine();
  const status = t => setText('transcribeStatus', t);
  const setDisabled = (id, v) => { const el = $(id); if (el) el.disabled = v; };
  function setPhase(next) {
    phase = next;
    setText('transcribeState', next);
    const tools = $('transcribeTools'); if (tools) tools.dataset.state = next;
    setDisabled('transcribeStart', !consent || !supported() || next === 'recording' || next === 'processing');
    setDisabled('transcribeStop', next !== 'recording');
    setDisabled('transcribeRetry', next !== 'result' && next !== 'error');
    setDisabled('scoreButton', next !== 'result');
  }
  function clearScore() {
    setHidden('scoreBox', true);
    setText('scoreValue', '—%'); setText('scoreLabel', '');
    setText('missingWords', 'none'); setText('extraWords', 'none'); setText('troubleWords', 'none');
  }
  function refresh() {
    if (!supported()) { setPhase('error'); status('Browser speech recognition is unavailable here. You can still use local recording and typed responses.'); return; }
    if (phase === 'idle') status('Ready — check consent, then start Korean transcription.');
    setPhase(phase);
  }
  function setConsent(value) {
    consent = !!value; setPhase(phase);
    if (consent && supported()) status('Consent recorded for browser-native recognition.');
  }
  function syncTarget(text) {
    if (text === target) return;
    target = text || '';
    if (phase === 'result' || phase === 'error') { reset(); return; }
    clearScore();
  }
  function start() {
    const Ctor = Engine();
    if (!Ctor) { refresh(); return; }
    if (!consent) { status('Please confirm the browser speech-recognition privacy note first.'); return; }
    if (phase === 'recording' || phase === 'processing') return;
    clearScore(); finalText = '';
    setText('transcriptText', 'Listening…'); setText('transcriptInterim', '');
    recognition = new Ctor();
    recognition.lang = 'ko-KR'; recognition.interimResults = true; recognition.continuous = false; recognition.maxAlternatives = 1;
    recognition.onstart = () => { setPhase('recording'); status('Listening in Korean… speak clearly, then tap Stop.'); };
    recognition.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const text = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalText += (finalText ? ' ' : '') + text; else interim += text;
      }
      setText('transcriptText', finalText || 'Listening…');
      setText('transcriptInterim', interim ? 'Live: ' + interim : '');
    };
    recognition.onerror = e => {
      const message = e.error === 'not-allowed' ? 'Speech-recognition permission was denied.'
        : e.error === 'no-speech' ? 'No speech was detected. Try again in a quieter place.'
        : e.error === 'network' ? 'The browser recognition service reported a network problem.'
        : 'Transcription failed: ' + e.error + '.';
      setPhase('error');
      status(message + ' This is a transcription error, not an incorrect answer.');
      setText('transcriptText', 'No transcript yet.');
    };
    recognition.onend = () => {
      if (phase === 'recording' || phase === 'processing') {
        if (finalText) { setPhase('result'); status('Transcript ready. Check it for word-level feedback.'); setText('transcriptText', finalText); }
        else { setPhase('error'); status('No transcript was produced. Try again; this is not an incorrect answer.'); }
      }
      recognition = null;
    };
    setPhase('processing');
    try { recognition.start(); }
    catch (error) { recognition = null; setPhase('error'); status('Transcription could not start. You can retry without losing the target phrase.'); }
  }
  function stop() {
    if (recognition && phase === 'recording') { setPhase('processing'); status('Finishing transcription…'); recognition.stop(); }
  }
  function renderScore(result) {
    setHidden('scoreBox', false);
    setText('scoreValue', result.score + '%');
    setText('scoreLabel', result.matched + ' of ' + result.targetCount + ' target words');
    setText('scoreFeedback', result.feedback);
    setText('missingWords', result.missing.length ? result.missing.join(', ') : 'none');
    setText('extraWords', result.extra.length ? result.extra.join(', ') : 'none');
    setText('troubleWords', result.missing.length ? result.missing.join(', ') : 'none');
  }
  function score() {
    if (phase !== 'result' || !finalText || !current) return;
    const result = compareSpeech(target, finalText), item = current, now = new Date().toISOString();
    // Only attach feedback to an item the learner has already rated, so scoring never changes the queue.
    const record = state.stageItems[item.n];
    if (record) {
      record.scoreAttempts = (record.scoreAttempts || 0) + 1;
      record.lastScore = result.score; record.lastTranscript = finalText; record.lastScoreAt = now;
      record.transcriptAttempts = [...(record.transcriptAttempts || []), { text: finalText, score: result.score, at: now }].slice(-5);
    }
    pushEvent({ type: 'transcript-score', id: item.n, score: result.score, at: now });
    save();
    renderScore(result);
    status(record ? 'Feedback saved locally. This is word matching, not phoneme scoring.'
      : 'Feedback shown. Rate this card once to start saving scores. This is word matching, not phoneme scoring.');
  }
  function reset() {
    if (recognition) { try { recognition.abort(); } catch (_) { /* already stopped */ } recognition = null; }
    finalText = '';
    setPhase('idle');
    setText('transcriptText', 'No transcript yet.'); setText('transcriptInterim', '');
    clearScore(); refresh();
  }
  function retry() { reset(); start(); }
  return { start, stop, retry, reset, setConsent, syncTarget, refresh, score };
})();

// ---------- Stage 1 lesson views ----------
function resetQuizState() {
  quizStarted = false; quizAnswered = false; quizItemId = null; quizReason = ''; quizSession = { seen: {}, asked: 0 };
}
function renderDays() {
  const d = $('days'); if (!d) return;
  d.innerHTML = '';
  DAYS.forEach((x, i) => {
    const b = document.createElement('button');
    b.className = 'day ' + (day === i + 1 ? 'active' : '');
    b.innerHTML = '<b>DAY ' + (i + 1) + '</b><strong>' + x[0] + '</strong><small>' + x[1] + '</small>';
    b.onclick = () => {
      recordingController.discard(); transcriptionController.reset();
      day = i + 1; current = null; revealed = false; resetQuizState(); renderStage();
    };
    d.appendChild(b);
  });
}
function renderContextTip(x) {
  const panel = $('contextPanel'); if (!panel) return;
  const tips = (DATA.contextTips || []).filter(t => t.related.includes(x.n) && !state.contextDismissed[t.id]);
  if (!tips.length) { panel.classList.add('hidden'); return; }
  const t = tips[0];
  panel.classList.remove('hidden');
  setText('contextKind', t.kind + ' · ' + t.topic);
  $('contextBody').innerHTML = '<div class="contextTip"><h3>' + esc(t.title) + '</h3><p>' + esc(t.explanation) + '</p>' +
    '<div class="contextExample">' + esc(t.exampleKo) + '<br><small>' + esc(t.exampleEn) + '</small></div>' +
    '<div class="contextActions"><button class="ghost" data-context-more="' + esc(t.id) + '">Learn more</button>' +
    '<button class="ghost" data-context-dismiss="' + esc(t.id) + '">Dismiss</button></div>' +
    '<div id="context-more-' + esc(t.id) + '" class="contextMore hidden">' + esc(t.learn) + '</div></div>';
}
function renderStage() {
  renderDays();
  if (!current || current.day !== day) current = pickNext(null);
  const x = current, meta = DAYS[day - 1];
  const done = dayItems().filter(i => state.stageItems[i.n]).length;
  setText('dayEyebrow', 'DAY ' + day + ' / ' + meta[0].toUpperCase());
  setText('daySummary', meta[1]);
  setText('itemCounter', done + '/20');
  setText('sectionLabel', 'STAGE 1 · ITEM ' + x.n);
  setText('itemIndex', x.n);
  setText('meaning', x.en);
  setText('korean', x.ko);
  setText('pron', x.pron);
  setText('englishBack', x.en);
  setText('whyThis', scheduleReason(state.stageItems[x.n]));
  setHidden('front', revealed); setHidden('back', !revealed); setHidden('reveal', revealed);
  setHidden('audioTools', !revealed); setHidden('recordTools', !revealed); setHidden('transcribeTools', !revealed);
  setHidden('ratings', !revealed);
  const speed = $('audioSpeed'); if (speed) speed.value = String(state.audio.speed);
  recordingController.refresh();
  transcriptionController.syncTarget(x.ko);
  renderContextTip(x);
  // Optional 4th argument adds a speaker button that plays that Korean text.
  const line = (a, b, c, say) => say
    ? '<div class="line lineRow"><div class="lineText"><b>' + esc(a) + '</b><span>' + esc(b) + '</span><small>' + esc(c) + '</small></div>' +
      '<button class="lineAudio" data-say="' + esc(say) + '" aria-label="Hear ' + esc(say) + '" title="Hear it">🔊</button></div>'
    : '<div class="line"><b>' + esc(a) + '</b><span>' + esc(b) + '</span><small>' + esc(c) + '</small></div>';
  // Fill-in templates (with … or a/b particles) read badly aloud, so only complete sentences get a button.
  const sayable = t => t.replace(/(…|\.\.\.)\s*([가-힣]\/[가-힣])?/g, '').replace(/\s+/g, ' ').trim();
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
  setText('contentNote', DATA.contentNote || '');
  renderQuiz(); renderScenario(); renderStory();
}
function reveal() { revealed = true; renderStage(); }
function rateCurrent(rating) {
  const x = current;
  recordingController.discard(); transcriptionController.reset(); resetQuizState();
  const rec = scheduleRecord(state.stageItems, x.n, rating);
  markDaily('s:' + x.n);
  logEvent('stage-review', x.n, rating, rec);
  awardXP('review:' + new Date().toISOString(), 5, 'completed review');
  current = pickNext(x.n); revealed = false;
  save(); renderStage();
}

// ---------- Adaptive multiple-choice quiz, Korean → English (M7, M8) ----------
function quizChoicesFor(item) {
  const pool = DATA.items.map(x => x.en).filter(en => en !== item.en).filter((en, i, a) => a.indexOf(en) === i);
  const picks = [item.en];
  for (let i = 0; picks.length < 4 && i < pool.length * 2; i++) {
    const candidate = pool[(item.n * 7 + i * 11) % pool.length];
    if (!picks.includes(candidate)) picks.push(candidate);
  }
  // Rotate so the correct answer does not always sit in the first slot.
  const shift = item.n % picks.length;
  return picks.slice(shift).concat(picks.slice(0, shift));
}
function adaptiveProfile(item) {
  const r = state.stageItems[item.n];
  const seen = quizSession.seen[item.n] || 0;
  const isNew = !r || !r.lastReviewed;
  const due = isDue(r);
  const weak = !!r && (r.lastQuizCorrect === false || r.lastRating === 'again' || r.lastRating === 'hard' || (r.attempts > 1 && r.correct / r.attempts < 0.6));
  const strong = !!r && (r.lastQuizCorrect === true || r.lastRating === 'good' || r.lastRating === 'easy');
  let score = due ? 1000 : weak ? 820 : isNew ? 620 : strong ? 360 : 500;
  if (r && r.lastQuizCorrect === false) score += 180;
  if (seen >= 1) score -= 650 * seen;
  return { r, seen, isNew, due, weak, strong, score };
}
function chooseAdaptiveQuizItem() {
  const ranked = dayItems().map(item => ({ item, profile: adaptiveProfile(item) }))
    .sort((a, b) => b.profile.score - a.profile.score || a.item.n - b.item.n);
  const eligible = ranked.filter(x => x.profile.seen < 2);
  const pick = (eligible[0] || ranked[0]).item;
  const profile = adaptiveProfile(pick);
  quizSession.seen[pick.n] = (quizSession.seen[pick.n] || 0) + 1;
  quizSession.asked++;
  const reason = profile.due ? 'Back because this item is due for review.'
    : profile.weak ? 'Back because it was tricky last time.'
    : profile.isNew ? 'New material — a gentle first check.'
    : profile.strong ? 'Maintenance review — keeping a strong item active.'
    : 'Balanced review — mixing recall and maintenance.';
  return { item: pick, reason };
}
function startQuiz() {
  const picked = chooseAdaptiveQuizItem();
  quizStarted = true; quizAnswered = false; quizItemId = picked.item.n; quizReason = picked.reason;
  current = picked.item;
  renderStage();
}
function renderQuiz() {
  const panel = $('quizPanel'); if (!panel) return;
  panel.classList.toggle('hidden', !revealed);
  setHidden('quizStart', quizStarted);
  setHidden('quizBody', !quizStarted);
  setText('quizState', quizStarted ? (quizAnswered ? 'answered' : 'ready') : 'not started');
  if (!quizStarted) return;
  const item = ITEM_BY_N[quizItemId] || current;
  quizItemId = item.n;
  const choices = quizChoicesFor(item);
  setText('quizReason', quizReason || 'Adaptive review selected from this day’s Stage 1 queue.');
  setText('quizTarget', item.ko);
  $('quizChoices').innerHTML = choices.map((c, i) => '<button class="quizChoice" data-quiz-choice="' + i + '">' + esc(c) + '</button>').join('');
  const feedback = $('quizFeedback');
  if (quizAnswered) {
    const record = state.stageItems[item.n] || {};
    const correct = record.lastQuizCorrect === true;
    feedback.textContent = correct ? 'Correct — nice recognition. This review is scheduled for later.'
      : 'Not quite. The right meaning is “' + item.en + '”. Try it once more, then rate the card when ready.';
    feedback.className = 'quizFeedback ' + (correct ? 'good' : 'bad');
    document.querySelectorAll('.quizChoice').forEach((b, i) => {
      b.disabled = true;
      b.classList.toggle('correct', choices[i] === item.en);
      b.classList.toggle('wrong', choices[i] !== item.en && i === record.lastQuizChoice);
    });
    setHidden('quizRetry', false); setHidden('quizNext', false);
  } else {
    feedback.textContent = ''; feedback.className = 'quizFeedback';
    setHidden('quizRetry', true); setHidden('quizNext', true);
  }
}
function answerQuiz(choiceIndex) {
  if (!quizStarted || quizAnswered) return;
  const item = ITEM_BY_N[quizItemId] || current;
  const choices = quizChoicesFor(item);
  const correct = choices[choiceIndex] === item.en;
  const rec = scheduleRecord(state.stageItems, item.n, correct ? 'good' : 'again');
  rec.quizAttempts = (rec.quizAttempts || 0) + 1;
  rec.lastQuizCorrect = correct; rec.lastQuizChoice = choiceIndex; rec.lastQuizMode = 'ko-en';
  rec.lastAdaptiveReason = quizReason; rec.lastAdaptiveSeen = quizSession.seen[item.n] || 1;
  rec.lastQuizAt = new Date().toISOString();
  pushEvent({ type: 'quiz-review', mode: 'ko-en', id: item.n, correct, choice: choices[choiceIndex], at: rec.lastQuizAt, nextReview: rec.nextReview });
  awardXP('quiz:' + rec.lastQuizAt, correct ? 5 : 2, 'quiz result');
  markDaily('s:' + item.n);
  quizAnswered = true;
  save(); renderQuiz();
}
function retryQuiz() { quizAnswered = false; renderQuiz(); }

// ---------- Conversation scenario: Meeting someone (M9) ----------
function scenarioMatches(answer, turn) {
  const text = normalizeSpeechWords(answer).join(' ');
  return !!text && (turn.accept || []).some(token => text.includes(token));
}
function setScenarioStatus(text, tone) {
  setText('scenarioStatus', text);
  const el = $('scenarioStatus'); if (el) el.className = 'scenarioStatus' + (tone ? ' ' + tone : '');
}
function scenarioLog(input, correct, method) {
  const now = new Date().toISOString();
  state.scenario.attempts = (state.scenario.attempts || 0) + 1;
  pushEvent({ type: 'scenario-attempt', scenario: SCENARIO.id, turn: scenarioState.turn, input, correct, method, at: now });
  if (method === 'speech') awardXP('speech:' + now, 4, 'speaking attempt');
  if (correct && scenarioState.turn === SCENARIO.turns.length - 2) {
    state.scenario.completed = (state.scenario.completed || 0) + 1;
    state.scenario.lastCompletedAt = now;
    awardXP('scenario-complete:' + state.scenario.completed, 15, 'scenario completion');
  }
  save();
}
function renderScenario() {
  if (!$('scenarioPanel')) return;
  const started = scenarioState.started;
  const turns = SCENARIO.turns.slice(0, started ? scenarioState.turn + 1 : 1);
  $('scenarioDialogue').innerHTML = turns.map((turn, i) =>
    '<div class="scenarioTurn ' + (started && i === scenarioState.turn ? 'current' : '') + '"><b>TUTOR</b><span>' + esc(turn.tutor) + '</span>' +
    (scenarioState.english && i === scenarioState.turn ? '<small class="scenarioEnglish">' + esc(turn.english) + '</small>' : '') + '</div>').join('');
  const finishedAll = started && scenarioState.turn >= SCENARIO.turns.length - 1;
  setHidden('scenarioStart', started);
  setHidden('scenarioBody', !started);
  setText('scenarioState', !started ? 'not started' : finishedAll ? 'completed' : 'turn ' + (scenarioState.turn + 1) + ' of ' + (SCENARIO.turns.length - 1));
  setText('scenarioMeta', 'Local attempts: ' + (state.scenario.attempts || 0) + ' · completed: ' + (state.scenario.completed || 0));
  if (!started) return;
  const turn = SCENARIO.turns[scenarioState.turn];
  const finalTurn = !turn.accept || !turn.accept.length;
  setText('scenarioEnglish', scenarioState.english ? 'Hide English' : 'Show English');
  setHidden('scenarioInputRow', finalTurn);
  setHidden('scenarioRecovery', true);
  setHidden('scenarioRetry', true);
  $('scenarioPrompt').innerHTML = finalTurn
    ? '<div class="scenarioHint">Conversation complete — nice work.</div>'
    : '<div class="scenarioHint">' + esc(turn.prompt) + '<br><small>' + esc(turn.hint) + '</small></div>';
  if (finalTurn) { setScenarioStatus('Conversation complete — nice work.', 'good'); return; }
  if (!$('scenarioInput').value) setScenarioStatus('', '');
}
function startScenario() {
  scenarioState = { started: true, turn: 0, english: false, pending: false };
  renderScenario();
  playScenarioTutor();
}
function toggleScenarioEnglish() { scenarioState.english = !scenarioState.english; renderScenario(); }
function playScenarioTutor() {
  const turn = SCENARIO.turns[scenarioState.turn];
  if (turn) audioController.playText(turn.tutor);
}
function retryScenario() { setHidden('scenarioRecovery', true); setHidden('scenarioRetry', true); setScenarioStatus('', ''); }
function checkScenario(method, spoken) {
  if (!scenarioState.started || scenarioState.pending || scenarioState.turn >= SCENARIO.turns.length - 1) return;
  const turn = SCENARIO.turns[scenarioState.turn];
  const answer = method === 'typed' ? $('scenarioInput').value.trim() : String(spoken || '').trim();
  if (!answer) { setScenarioStatus('Add a short Korean response first, or use Speak response.', 'bad'); return; }
  const correct = scenarioMatches(answer, turn);
  scenarioLog(answer, correct, method);
  if (correct) {
    scenarioState.pending = true;
    setScenarioStatus('Accepted — that is a natural response. The conversation continues.', 'good');
    setHidden('scenarioRecovery', true); setHidden('scenarioRetry', true);
    setTimeout(() => {
      scenarioState.pending = false;
      scenarioState.turn++;
      scenarioState.english = false;
      renderScenario();
      playScenarioTutor();
    }, 250);
  } else {
    setScenarioStatus('That response was not recognized yet, but you can recover safely.', 'bad');
    setText('scenarioRecovery', 'Try the pattern: ' + turn.hint + ' You can reveal English, listen again, or retry this same turn.');
    setHidden('scenarioRecovery', false); setHidden('scenarioRetry', false);
  }
}
function speakScenario() {
  const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!Ctor) { setScenarioStatus('Speech recognition is unavailable here. Type your response instead.', 'bad'); return; }
  const recognition = new Ctor();
  recognition.lang = 'ko-KR'; recognition.interimResults = false; recognition.continuous = false;
  setScenarioStatus('Listening in Korean…', '');
  recognition.onresult = e => {
    const text = e.results[0][0].transcript;
    $('scenarioInput').value = text;
    checkScenario('speech', text);
  };
  recognition.onerror = e => setScenarioStatus('Speech transcription failed (' + e.error + '). Type your response or try again.', 'bad');
  try { recognition.start(); }
  catch (_) { setScenarioStatus('Speech recognition could not start. Type your response instead.', 'bad'); }
}

// ---------- Short story and comprehension (M10) ----------
function storyLog(type, value, correct) {
  const now = new Date().toISOString();
  state.story.attempts = (state.story.attempts || 0) + 1;
  if (correct) state.story.correct = (state.story.correct || 0) + 1;
  if (type === 'cloze' && correct) state.story.clozeCorrect = (state.story.clozeCorrect || 0) + 1;
  pushEvent({ type: 'story-review', story: STORY.id, activity: type, value, correct, at: now });
  save();
}
function storyLineHtml(ko) {
  // One pass over the line, longest words first, so a short word never splits a longer one.
  const vocab = STORY.vocab.slice().sort((a, b) => b.word.length - a.word.length);
  const re = new RegExp(vocab.map(v => escapeRegex(v.word)).join('|'), 'g');
  return esc(ko).replace(re, w => {
    const v = vocab.find(x => x.word === w);
    const known = !!state.stageItems[v.id];
    return '<button class="storyWord ' + (known ? 'known' : 'new') + '" onclick="reviewStoryWord(' + v.id + ')" title="' + esc(v.en) + '">' + esc(w) + '</button>';
  });
}
function renderStory() {
  if (!$('storyPanel')) return;
  setText('storyEnglish', storyEnglish ? 'Hide English' : 'Show English');
  $('storyText').innerHTML = STORY.lines.map(line =>
    '<div class="storyLine">' + storyLineHtml(line.ko) + (storyEnglish ? '<small>' + esc(line.en) + '</small>' : '') + '</div>').join('');
  $('storyQuestions').innerHTML = STORY.questions.map((item, i) => {
    const picked = storyAnswers[i];
    const result = picked === undefined ? '' : picked === item.answer ? 'Correct — the story says it.' : 'Try again — find that detail in the story.';
    const resultTone = picked === undefined ? '' : picked === item.answer ? 'good' : 'bad';
    return '<div class="storyQuestion"><strong>' + (i + 1) + '. ' + esc(item.q) + '</strong><div class="storyChoices">' +
      item.options.map(option => '<button class="storyChoice ' + (picked === option ? (option === item.answer ? 'correct' : 'wrong') : '') +
        '" data-story-i="' + i + '" data-story-option="' + esc(option) + '">' + esc(option) + '</button>').join('') +
      '</div><div class="storyResult ' + resultTone + '">' + result + '</div></div>';
  }).join('');
  setText('storyState', Object.keys(storyAnswers).length + ' / ' + (STORY.questions.length + 1));
  setText('storyMeta', 'Answers save locally · attempts: ' + (state.story.attempts || 0) + ' · correct: ' + (state.story.correct || 0));
  const cloze = STORY.cloze;
  setText('storyClozeBefore', cloze.before);
  setText('storyClozeAfter', cloze.after);
  const select = $('storyClozeSelect');
  if (select && !select.options.length) {
    select.innerHTML = '<option value="">choose a word</option>' + cloze.options.map(o => '<option>' + esc(o) + '</option>').join('');
  }
  if (select && !storyAnswers.cloze) select.value = '';
}
function toggleStoryEnglish() { storyEnglish = !storyEnglish; renderStory(); }
function playStory() { audioController.playText(STORY.lines.map(l => l.ko).join(' ')); }
function answerStory(i, option) {
  const correct = option === STORY.questions[i].answer;
  storyAnswers[i] = option;
  storyLog('question-' + (i + 1), option, correct);
  renderStory();
}
function checkStoryCloze() {
  const select = $('storyClozeSelect');
  const value = select ? select.value : '';
  if (!value) return;
  const correct = value === STORY.cloze.answer;
  storyAnswers.cloze = value;
  storyLog('cloze', value, correct);
  setText('storyClozeResult', correct ? 'Correct — the story says Alex drinks tea.' : 'Not quite. Read the second line again.');
  const el = $('storyClozeResult'); if (el) el.className = 'storyResult ' + (correct ? 'good' : 'bad');
}
function resetStoryPractice() {
  storyAnswers = {};
  const select = $('storyClozeSelect'); if (select) select.value = '';
  setText('storyClozeResult', '');
  renderStory();
}
function reviewStoryWord(id) {
  const item = ITEM_BY_N[id];
  if (!item) return;
  day = item.day; current = item; revealed = true; resetQuizState();
  renderStage();
}

// ---------- Alphabet, progress, and debug ----------
function renderAlphabet() {
  $('alphabetGrid').innerHTML = DATA.letters.map(l =>
    '<button class="letter" data-say="' + esc(l.example) + '" title="Tap to hear ' + esc(l.example) + '">' +
    '<span class="g">' + esc(l.glyph) + '</span><span class="l">' + esc(l.name) + '</span>' +
    '<small>' + esc(l.rr) + ' · ' + esc(l.sound) + '</small>' +
    '<em>' + esc(l.example) + ' · ' + esc(l.meaning.split(' / ')[0]) + '</em></button>').join('');
}
function rateLetter(id, rating) {
  const rec = scheduleRecord(state.letters, id, rating);
  markDaily('l:' + id);
  logEvent('letter-review', id, rating, rec);
  save(); renderProgress();
}
function renderProgress() {
  const n = DATA.letters.filter(l => isMastered(state.letters[l.id])).length;
  setText('masteryHint', n + ' / ' + LETTER_COUNT);
  const grid = $('masteryGrid'); if (!grid) return;
  grid.innerHTML = DATA.letters.map(l => {
    const r = state.letters[l.id];
    const label = r ? (isDue(r) ? 'Due now' : 'Next ' + new Date(r.nextReview).toLocaleDateString()) : 'New';
    const btn = (k, t, full) => '<button title="' + full + '" onclick="rateLetter(\'' + l.id + '\',\'' + k + '\')">' + t + '</button>';
    return '<div class="letter" style="opacity:' + (r ? 1 : .48) + '"><span class="g">' + esc(l.glyph) + '</span><span class="l">' + esc(l.rr) + '</span><small>' + label + '</small>' +
      '<div class="mini-ratings">' + btn('again', 'A', 'Again') + btn('hard', 'H', 'Hard') + btn('good', 'G', 'Good') + btn('easy', 'E', 'Easy') + '</div></div>';
  }).join('');
  renderMotivation();
}
function renderDebug() {
  const el = $('debugSchedule'); if (!el) return;
  const rows = [
    ...Object.entries(state.stageItems).map(([id, r]) => ({ kind: 'Stage', id, r })),
    ...Object.entries(state.letters).map(([id, r]) => ({ kind: 'Letter', id: (LETTER_BY_ID[id] || {}).glyph || id, r })),
  ].sort((a, b) => (a.r.nextReview || '').localeCompare(b.r.nextReview || ''));
  el.innerHTML = rows.length ? rows.slice(0, 40).map(x =>
    '<div class="debugItem"><b>' + esc(x.kind) + ' ' + esc(x.id) + '</b><span>Last ' + (x.r.lastReviewed ? new Date(x.r.lastReviewed).toLocaleString() : '—') +
    ' · ' + esc(x.r.lastRating || 'new') + ' · Next ' + (x.r.nextReview ? new Date(x.r.nextReview).toLocaleString() : 'not scheduled') + '</span></div>').join('') : 'No reviews yet.';
}

// ---------- Local account profile (M13) ----------
function ensureAccount() {
  if (!state.account.id) {
    state.account.id = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : 'local-' + Date.now() + '-' + Math.random().toString(36).slice(2);
    state.account.createdAt = new Date().toISOString();
    save();
  }
}
function renderAccount() {
  if (!$('accountName')) return;
  ensureAccount();
  $('accountName').value = state.account.displayName || '';
  setText('accountStatus', 'Profile ID ' + state.account.id + ' · local only' +
    (state.sync.lastImportAt ? ' · last merged ' + new Date(state.sync.lastImportAt).toLocaleString() : ''));
}
function saveAccountProfile() {
  ensureAccount();
  state.account.displayName = $('accountName').value.trim().slice(0, 40);
  save(); renderAccount();
  setText('accountStatus', 'Profile saved locally. Use a backup to move it to another browser.');
}
function deleteLocalAccount() {
  if (!confirm('Delete this local account and all 한글 learning data?')) return;
  localStorage.removeItem(STORAGE_KEY);
  state = emptyState(); current = null; revealed = false; resetQuizState();
  ensureAccount();
  renderStage(); renderProgress(); renderAccount();
  alert('Local account deleted and a fresh local profile was created.');
}

// ---------- Backup, merge, and reset (M1, M13) ----------
function mergeRecords(a, b) {
  if (!a) return b;
  if (!b) return a;
  return Date.parse(b.lastReviewed || 0) > Date.parse(a.lastReviewed || 0) ? b : a;
}
function mergeState(local, incomingRaw) {
  const incoming = normalizeState(incomingRaw), base = normalizeState(local), today = todayKey();
  const sameAccount = !local.account.id || !incoming.account.id || local.account.id === incoming.account.id;
  const merged = { ...base };
  merged.account = sameAccount
    ? { ...incoming.account, ...local.account, id: local.account.id || incoming.account.id }
    : local.account;
  merged.stageItems = { ...base.stageItems };
  Object.entries(incoming.stageItems).forEach(([id, r]) => { merged.stageItems[id] = mergeRecords(base.stageItems[id], r); });
  merged.letters = { ...base.letters };
  Object.entries(incoming.letters).forEach(([id, r]) => { merged.letters[id] = mergeRecords(base.letters[id], r); });
  const seen = new Set();
  merged.events = [...base.events, ...incoming.events].filter(e => {
    const key = [e.type, e.at, e.id, e.key, e.scenario, e.story].join('|');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).slice(-500);
  merged.daily = {
    date: today,
    reviewed: [...new Set([
      ...(base.daily.date === today ? base.daily.reviewed : []),
      ...(incoming.daily.date === today ? incoming.daily.reviewed : []),
    ])],
  };
  merged.scenario = {
    attempts: Math.max(base.scenario.attempts || 0, incoming.scenario.attempts || 0),
    completed: Math.max(base.scenario.completed || 0, incoming.scenario.completed || 0),
    lastCompletedAt: [base.scenario.lastCompletedAt, incoming.scenario.lastCompletedAt].filter(Boolean).sort().pop() || null,
  };
  merged.story = {
    attempts: Math.max(base.story.attempts || 0, incoming.story.attempts || 0),
    correct: Math.max(base.story.correct || 0, incoming.story.correct || 0),
    clozeCorrect: Math.max(base.story.clozeCorrect || 0, incoming.story.clozeCorrect || 0),
  };
  const lm = base.motivation, im = incoming.motivation;
  const rewards = { ...im.rewards, ...lm.rewards };
  const rewardXP = Object.values(rewards).reduce((s, r) => s + (Number(r.amount) || 0), 0);
  merged.motivation = {
    xp: Math.max(lm.xp, im.xp, rewardXP),
    rewards,
    badges: [...new Set([...lm.badges, ...im.badges])],
    activityDates: [...new Set([...lm.activityDates, ...im.activityDates])].sort(),
    weeklyGoal: lm.weeklyGoal,
  };
  merged.contextDismissed = { ...incoming.contextDismissed, ...base.contextDismissed };
  return merged;
}
function exportState() {
  rollDaily(); ensureAccount();
  state.sync.lastExportAt = new Date().toISOString();
  save();
  const blob = new Blob([JSON.stringify({ ...state, exportedAt: state.sync.lastExportAt, app: 'hangeul' }, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'hangeul-backup-' + todayKey() + '.json';
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
      state = mergeState(state, parsed);
      state.sync.lastImportAt = new Date().toISOString();
      current = null; save(); renderStage(); renderProgress(); renderAccount();
      alert('Backup merged safely. Newer review records and unique events were kept.');
    } catch (_) { alert('That backup could not be imported.'); }
    e.target.value = '';
  };
  r.readAsText(file);
}
function resetState() {
  if (!confirm('Reset all local 한글 progress?')) return;
  const account = state.account;
  state = emptyState(); state.account = account;
  current = null; revealed = false; resetQuizState();
  save(); renderStage(); renderProgress(); renderAccount();
  alert('Local progress reset.');
}

// ---------- Navigation and global actions ----------
function update() {
  rollDaily();
  const stageDone = Object.keys(state.stageItems).length;
  const mastered = DATA.letters.filter(l => isMastered(state.letters[l.id])).length;
  const alphaPct = Math.round(mastered / LETTER_COUNT * 100);
  const stagePct = Math.round(stageDone / DATA.items.length * 100);
  const daily = state.daily.reviewed.length;
  setText('todayDone', daily);
  setText('mastered', mastered);
  setText('overall', alphaPct + '%');
  setText('goalValue', state.goal);
  setText('remaining', Math.max(0, state.goal - daily));
  setWidth('goalBar', daily / state.goal * 100);
  setText('stageProgress', stageDone);
  setText('progressStage', stagePct);
  setWidth('stageBar', stagePct);
  setText('progressAlpha', alphaPct);
  setWidth('alphaBar', alphaPct);
  setText('stateDetails', 'Version ' + state.version + ' · ' + stageDone + ' Stage 1 items · ' + Object.keys(state.letters).length +
    ' letters reviewed · ' + state.events.length + ' review events · daily counter for ' + state.daily.date);
  renderDebug();
  renderMotivation();
}
function show(v) {
  document.querySelectorAll('.view').forEach(x => x.classList.toggle('hidden', x.id !== v));
  document.querySelectorAll('.nav button').forEach(x => x.classList.toggle('active', x.dataset.view === v));
  if (v === 'stage') renderStage();
  if (v === 'alphabet') renderAlphabet();
  if (v === 'progress') renderProgress();
  if (v === 'settings') { update(); renderAccount(); }
  scrollTo(0, 0);
}
function changeGoal(n) { state.goal = clampGoal(state.goal + n); save(); }

document.querySelectorAll('.nav button').forEach(b => b.onclick = () => show(b.dataset.view));
document.addEventListener('click', e => {
  const say = e.target.closest('[data-say]');
  if (say) { audioController.playText(say.dataset.say); return; }
  const choice = e.target.closest('[data-quiz-choice]');
  if (choice) { answerQuiz(Number(choice.dataset.quizChoice)); return; }
  const more = e.target.closest('[data-context-more]');
  if (more) { const el = $('context-more-' + more.dataset.contextMore); if (el) el.classList.toggle('hidden'); return; }
  const dismiss = e.target.closest('[data-context-dismiss]');
  if (dismiss) { state.contextDismissed[dismiss.dataset.contextDismiss] = true; save(); renderStage(); return; }
  const storyChoice = e.target.closest('[data-story-option]');
  if (storyChoice) { answerStory(Number(storyChoice.dataset.storyI), storyChoice.dataset.storyOption); }
});

// ---------- Boot ----------
if ('speechSynthesis' in window) {
  speechSynthesis.onvoiceschanged = () => audioController.refreshVoices();
  setTimeout(() => audioController.refreshVoices(), 100);
}
ensureAccount();
recordingController.refresh();
transcriptionController.refresh();
update();
renderStage();
renderProgress();
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('service-worker.js').catch(() => {}));
}
