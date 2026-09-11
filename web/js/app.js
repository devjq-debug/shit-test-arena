import { ensurePlayerUser } from './auth.js?v=4';
import { fallbackQuestionText, loadGameCategories, loadGameTechniques, pickQuestionsForRoom } from './question-service.js?v=5';
import { evaluateAnswer, getCurrentRoomQuestion, recommendedAnswerForRoom } from './response-evaluator.js?v=2';
import { database, ref, set, update, get, onValue, onDisconnect, push, remove, runTransaction, serverTimestamp } from './game/realtime.js?v=2';

const state = { uid: null, roomId: null, room: null, players: {}, currentAnswers: {}, votes: {}, ownAnswer: '', activeQuestion: null, loadedAnswerQuestion: null, serverOffset: 0, hasConnectedOnce: false, unsubscribers: [], answerUnsubscribe: null, answerQuestion: null, answerStatusUnsubscribe: null, answerStatusQuestion: null, voteUnsubscribe: null, voteQuestion: null, timer: null, closeTimer: null, countdownTimer: null, countdownPaintTimer: null, autoRevealTimer: null, scoring: false, submittingAnswer: false, submittingVote: false, soundEnabled: localStorage.getItem('arenaSound') === 'on', settings: { duration: 10, rounds: 10, pressureMode: false, techniqueId: '' } };
const settingPainters = {};
let customDurationApply = null;
let delegatedActionsBound = false;

const $ = (selector) => document.querySelector(selector);
const cleanCode = (value) => value.replace(/\s/g, '').toUpperCase();
const escapeHtml = (value = '') => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const isHost = () => Boolean(state.room && state.uid === state.room.hostUid);
const formatCategoryLabel = (value = 'Todas las categorías') => value.replace(/\s*\([^)]*\)/g, '').replace('Todas las categorías', 'Todas').toUpperCase();
const roomQuestionText = (room, number) => room?.questionSet?.[number - 1]?.text || room?.questions?.[number - 1]?.text || fallbackQuestionText(number - 1);
const roomQuestion = (room, number) => room?.questionSet?.[Math.max(0, Number(number || 1) - 1)] || room?.questions?.[Math.max(0, Number(number || 1) - 1)] || null;
const effectiveDuration = (base, round, pressureMode) => Math.max(5, Number(base || 10) - (pressureMode ? Math.max(0, Number(round || 1) - 1) : 0));
const currentQuestionDuration = (room) => Number(room?.currentQuestionDuration || effectiveDuration(room?.questionDuration, room?.currentQuestion || 1, room?.pressureMode));

function selectedCategory(selector) {
  const select = $(selector);
  return {
    categoryId: select?.value || '',
    category: select?.selectedOptions?.[0]?.textContent?.trim() || 'Todas las categorías'
  };
}

function selectedTechnique(selector) {
  const select = $(selector);
  return {
    techniqueId: select?.value || '',
    technique: select?.selectedOptions?.[0]?.textContent?.trim() || 'Todas las técnicas'
  };
}

function fillCategorySelect(select, categories, selectedId = '') {
  if (!select) return;
  select.innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
  select.value = selectedId;
}

function fillTechniqueSelect(select, techniques, selectedId = '') {
  if (!select) return;
  select.innerHTML = techniques.map((technique) => `<option value="${escapeHtml(technique.id)}">${escapeHtml(technique.name)}</option>`).join('');
  select.value = selectedId;
}

async function populateCategorySelectors() {
  const categories = await loadGameCategories();
  const techniques = loadGameTechniques();
  fillCategorySelect($('[data-category-select]'), categories);
  fillCategorySelect($('[data-host-category-select]'), categories);
  fillTechniqueSelect($('[data-technique-select]'), techniques);
  fillTechniqueSelect($('[data-host-technique-select]'), techniques);
  const category = selectedCategory('[data-category-select]').category;
  $('[data-category-summary]') && ($('[data-category-summary]').textContent = formatCategoryLabel(category));
  $('[data-host-category-summary]') && ($('[data-host-category-summary]').textContent = formatCategoryLabel(category));
}

function showError(message) {
  let toast = $('#app-error');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-error';
    toast.className = 'fixed left-1/2 top-16 z-[100] -translate-x-1/2 max-w-sm rounded-xl border border-red-500/50 bg-red-950/95 px-4 py-3 text-xs font-mono text-red-200 shadow-2xl';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.hidden = false;
  setTimeout(() => { toast.hidden = true; }, 6000);
}

async function retireLegacyAppCache() {
  if ('serviceWorker' in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    await Promise.allSettled(registrations.map((registration) => registration.unregister()));
  }
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.allSettled(keys.map((key) => caches.delete(key)));
  }
}

function roomUrl(code = state.room?.code) {
  return `${window.location.origin}/room/${code}`;
}

async function copyText(value, successMessage) {
  await navigator.clipboard.writeText(value);
  const toast = document.createElement('div');
  toast.className = 'fixed left-1/2 top-16 z-[100] -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-emerald-950/95 px-4 py-3 text-xs font-mono text-emerald-200 shadow-2xl';
  toast.textContent = successMessage;
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2200);
}

function updateSoundButtons() {
  document.querySelectorAll('[data-sound-toggle]').forEach((button) => {
    button.textContent = `Sonido: ${state.soundEnabled ? 'ON' : 'OFF'}`;
    button.classList.toggle('text-arena-gold', state.soundEnabled);
  });
}

function playSound(type) {
  if (!state.soundEnabled) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  const tones = { start: 660, tick: 520, time: 180, reveal: 740, victory: 880 };
  oscillator.frequency.value = tones[type] || 440;
  oscillator.type = type === 'time' ? 'sawtooth' : 'triangle';
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + (type === 'victory' ? 0.38 : 0.16));
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + (type === 'victory' ? 0.4 : 0.18));
}

async function removeDirectChildren(path) {
  const snapshot = await get(ref(database, path));
  const value = snapshot.val();
  if (!value || typeof value !== 'object') return;
  await Promise.allSettled(Object.keys(value).map((key) => remove(ref(database, `${path}/${key}`))));
}

async function removeAnswerChildren(path) {
  const snapshot = await get(ref(database, path));
  const value = snapshot.val();
  if (!value || typeof value !== 'object') return;
  const removals = [];
  Object.entries(value).forEach(([questionId, answers]) => {
    if (!answers || typeof answers !== 'object') return;
    Object.keys(answers).forEach((uid) => removals.push(remove(ref(database, `${path}/${questionId}/${uid}`))));
  });
  await Promise.allSettled(removals);
}

async function clearRoomAnswers(roomId) {
  if (!roomId) return;
  await Promise.all([removeAnswerChildren(`roomAnswers/${roomId}`), removeAnswerChildren(`roomAnswerStatus/${roomId}`), removeAnswerChildren(`roomVotes/${roomId}`)]);
}

function replaceReferenceText(room) {
  document.querySelectorAll('[data-question-text]').forEach((element) => { element.textContent = `“${room.questionText || fallbackQuestionText(0)}”`; });
  document.querySelectorAll('[data-recommended-answer]').forEach((element) => { element.textContent = recommendedAnswerForRoom(room); });
  document.querySelectorAll('[data-room-code]').forEach((element) => { element.textContent = room.code; });
  document.querySelectorAll('[data-room-code-label]').forEach((element) => { element.textContent = `SALA: ${room.code}`; });
  document.querySelectorAll('[data-host-name]').forEach((element) => { element.textContent = room.hostName || 'Host'; });
  document.querySelectorAll('[data-room-link]').forEach((element) => { element.textContent = roomUrl(room.code); });
  document.querySelectorAll('[data-round-label]').forEach((element) => { element.textContent = `RONDA ${room.currentQuestion || 1} / ${room.roundCount}`; });
  document.querySelectorAll('[data-question-label]').forEach((element) => { element.textContent = `SHIT TEST #${String(room.currentQuestion || 1).padStart(2, '0')}`; });
  document.querySelectorAll('[data-countdown-copy]').forEach((element) => { element.textContent = Number(room.currentQuestion || 1) <= 1 ? 'La primera ronda está por comenzar.' : `La ronda ${room.currentQuestion} está por comenzar.`; });
  document.querySelectorAll('[data-room-duration-short]').forEach((element) => { element.textContent = `${currentQuestionDuration(room)}s`; });
  document.querySelectorAll('[data-room-rounds-short]').forEach((element) => { element.textContent = String(room.roundCount); });
  document.querySelectorAll('[data-room-duration]').forEach((element) => { element.textContent = `${currentQuestionDuration(room)} SEGUNDOS`; });
  document.querySelectorAll('[data-room-rounds]').forEach((element) => { element.textContent = `${room.roundCount} RONDAS`; });
  document.querySelectorAll('[data-room-category]').forEach((element) => { element.textContent = (room.category || 'Todas').toUpperCase(); });
  document.querySelectorAll('[data-room-order]').forEach((element) => { element.textContent = room.randomOrder === false ? 'FIJO' : 'ALEAT.'; });
  document.querySelectorAll('[data-next-label]').forEach((element) => {
    const next = Number(room.currentQuestion || 0) + 1;
    element.textContent = next > room.roundCount ? '(VER CLASIFICACIÓN)' : `(RONDA ${next} / ${room.roundCount})`;
  });
}

async function ensureUser(fresh = false) {
  const user = await ensurePlayerUser({ fresh });
  state.uid = user.uid;
  return user;
}

async function claimRoomCode(code, roomId, hostUid) {
  const reservation = { roomId, hostUid };
  const result = await runTransaction(ref(database, `roomCodes/${code}`), (current) => current ?? reservation);
  return result.committed && result.snapshot.val()?.roomId === roomId;
}

async function createRoom() {
  const user = await ensureUser(true);
  const nickname = ($('#host-nick')?.value || '').trim();
  if (!nickname) throw new Error('Escribe un nickname antes de crear la sala.');
  const roomId = push(ref(database, 'rooms')).key;
  let code = '';
  let claimed = false;
  for (let attempt = 0; attempt < 8 && !claimed; attempt += 1) {
    code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    claimed = await claimRoomCode(code, roomId, user.uid);
  }
  if (!claimed) throw new Error('No se pudo reservar un código único. Inténtalo otra vez.');
  const randomOrder = $('[data-random-order]')?.checked !== false;
  const { categoryId, category } = selectedCategory('[data-category-select]');
  const { techniqueId, technique } = selectedTechnique('[data-technique-select]');
  const pressureMode = $('[data-pressure-mode]')?.checked === true;
  const questionSet = await pickQuestionsForRoom({ categoryId, techniqueId, roundCount: state.settings.rounds });
  const questionOrder = questionSet.map((question) => question.id);
  const room = { hostUid: user.uid, hostName: nickname, code, status: 'LOBBY', currentQuestion: 0, questionOrder, questionSet, questionText: questionSet[0].text, questionStartedAt: 0, questionDuration: state.settings.duration, currentQuestionDuration: state.settings.duration, roundCount: state.settings.rounds, categoryId, category, techniqueId, technique, pressureMode, randomOrder, createdAt: serverTimestamp(), scoredQuestion: 0, roundWinnerUid: '' };
  const player = { nickname, score: 0, streak: 0, connected: true, joinedAt: serverTimestamp(), isHost: true };
  try {
    await set(ref(database, `rooms/${roomId}`), room);
    await set(ref(database, `roomPlayers/${roomId}/${user.uid}`), player);
    await enterSession(roomId, room.code);
  } catch (error) {
    await Promise.allSettled([removeDirectChildren(`roomPlayers/${roomId}`), clearRoomAnswers(roomId)]);
    await remove(ref(database, `rooms/${roomId}`)).catch(() => {});
    await remove(ref(database, `roomCodes/${code}`)).catch(() => {});
    throw error;
  }
}

async function joinRoom() {
  const user = await ensureUser(true);
  const code = cleanCode($('#join-code')?.value || '');
  const nickname = ($('#join-nick')?.value || '').trim();
  if (code.length !== 5 || !nickname) throw new Error('Introduce un código válido y tu nickname.');
  const codeSnapshot = await get(ref(database, `roomCodes/${code}`));
  const roomId = codeSnapshot.val()?.roomId;
  if (!roomId) throw new Error('Sala no encontrada o ya cerrada.');
  const room = (await get(ref(database, `rooms/${roomId}`))).val();
  if (!room || room.status !== 'LOBBY') throw new Error('La sala ya comenzó o expiró.');
  await set(ref(database, `roomPlayers/${roomId}/${user.uid}`), { nickname, score: 0, streak: 0, connected: true, joinedAt: serverTimestamp(), isHost: false });
  await enterSession(roomId, code);
}

async function previewRoom(rawCode) {
  const code = cleanCode(rawCode);
  const valid = $('#join-status-valid');
  const invalid = $('#join-status-error');
  valid?.classList.add('hidden');
  invalid?.classList.add('hidden');
  if (code.length !== 5) return;
  try {
    const mapping = (await get(ref(database, `roomCodes/${code}`))).val();
    const room = mapping?.roomId ? (await get(ref(database, `rooms/${mapping.roomId}`))).val() : null;
    if (!room || room.status !== 'LOBBY') throw new Error('unavailable');
    $('[data-join-found]').textContent = `SALA ENCONTRADA · ${code}`;
    $('[data-join-host]').textContent = room.hostName;
    $('[data-join-count]').textContent = 'Disponible';
    $('[data-join-settings]').textContent = `${room.roundCount} rondas • ${room.questionDuration} segundos • ${room.category || 'Todas'}`;
    valid?.classList.remove('hidden');
    valid?.classList.add('flex');
  } catch {
    invalid?.classList.remove('hidden');
    invalid?.classList.add('flex');
  }
}

async function enterSession(roomId, code) {
  state.roomId = roomId;
  await set(ref(database, `roomPlayers/${roomId}/${state.uid}/connected`), true).catch(() => {});
  await onDisconnect(ref(database, `roomPlayers/${roomId}/${state.uid}/connected`)).set(false).catch(() => {});
  subscribeRoom(roomId);
}

function subscribeRoom(roomId) {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  stopAnswerListener();
  stopAnswerStatusListener();
  stopVoteListener();
  state.unsubscribers.push(onValue(ref(database, `rooms/${roomId}`), (snapshot) => {
    state.room = snapshot.val();
    if (!state.room) return window.switchScreen('ui-14');
    replaceReferenceText(state.room);
    renderState();
  }, (error) => showError(error.message)));
  state.unsubscribers.push(onValue(ref(database, `roomPlayers/${roomId}`), (snapshot) => {
    state.players = snapshot.val() || {};
    renderPlayers();
  }, (error) => showError(error.message)));
}

function renderState() {
  const room = state.room;
  if (!room) return;
  if (Number(room.currentQuestion || 0) > 0 && state.activeQuestion !== room.currentQuestion) resetLocalQuestionState(room.currentQuestion);
  if (room.status !== 'QUESTION') clearInterval(state.timer);
  if (room.status !== 'COUNTDOWN') clearInterval(state.countdownPaintTimer);
  if (!['QUESTION', 'VOTING', 'QUESTION_RESULTS'].includes(room.status)) {
    stopAnswerListener();
    stopAnswerStatusListener();
    stopVoteListener();
    state.currentAnswers = {};
    state.votes = {};
  }
  if (room.status === 'LOBBY') {
    clearLocalQuestionState();
    clearTimeout(state.countdownTimer);
    clearInterval(state.countdownPaintTimer);
    window.switchScreen(isHost() ? 'ui-4' : 'ui-5');
  }
  if (room.status === 'COUNTDOWN') {
    window.switchScreen('ui-6');
    scheduleCountdown(room.countdownStartedAt);
  }
  if (room.status === 'QUESTION') {
    window.switchScreen('ui-7');
    stopAnswerListener();
    stopVoteListener();
    listenAnswerStatus();
    loadOwnAnswer(room.currentQuestion).catch((error) => {
      if (state.room?.status === 'QUESTION') showError(error.message);
    });
    startTimer(room.questionStartedAt, currentQuestionDuration(room));
    if (isHost()) scheduleQuestionClose(room.questionStartedAt, currentQuestionDuration(room));
  }
  if (room.status === 'VOTING') { window.switchScreen('ui-10'); stopAnswerStatusListener(); listenAnswers(); listenVotes(); scheduleAutoReveal(); setRevealChrome(); }
  if (room.status === 'QUESTION_RESULTS') { window.switchScreen('ui-10'); stopAnswerStatusListener(); listenAnswers(); listenVotes(); clearTimeout(state.autoRevealTimer); setRevealChrome(); playSound('reveal'); }
  if (room.status === 'LEADERBOARD') { stopAnswerStatusListener(); stopVoteListener(); window.switchScreen('ui-11'); renderLeaderboard(); }
  if (room.status === 'FINISHED') { stopAnswerStatusListener(); stopVoteListener(); window.switchScreen('ui-11'); }
}

async function loadOwnAnswer(question) {
  if (state.loadedAnswerQuestion === question) return;
  state.loadedAnswerQuestion = question;
  const snapshot = await get(ref(database, `roomAnswers/${state.roomId}/${question}/${state.uid}`));
  if (state.room?.currentQuestion !== question) return;
  state.ownAnswer = snapshot.val()?.answer || '';
  const answerInput = $('#answer-input');
  if (answerInput) {
    answerInput.value = state.ownAnswer;
    window.updateCharCount?.(answerInput);
  }
  document.querySelectorAll('[data-own-answer]').forEach((element) => { element.textContent = state.ownAnswer ? `“${state.ownAnswer}”` : 'Sin respuesta todavía.'; });
  renderWaitingStatus();
}

function renderPlayers() {
  const players = Object.entries(state.players).sort(([, a], [, b]) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  const ownPlayer = state.players[state.uid];
  const hostPlayer = players.find(([, player]) => player.isHost)?.[1];
  document.querySelectorAll('[data-own-player-name]').forEach((element) => { element.textContent = ownPlayer?.nickname || 'Tú'; });
  document.querySelectorAll('[data-host-name]').forEach((element) => { element.textContent = hostPlayer?.nickname || state.room?.hostName || 'Host'; });
  document.querySelectorAll('[data-player-count]').forEach((element) => { element.textContent = `(${players.length}/8)`; });
  document.querySelectorAll('[data-player-list]').forEach((list) => {
    list.innerHTML = players.map(([uid, player]) => `<div class="bg-arena-dark/80 p-2.5 rounded-xl border ${player.isHost ? 'border-arena-pink/40' : 'border-arena-cardborder'} flex items-center justify-between"><div class="flex items-center gap-2.5"><span class="w-8 h-8 rounded-lg bg-arena-pink/15 text-arena-pink flex items-center justify-center">${player.isHost ? '👑' : '⚡'}</span><div><div class="text-xs font-bold text-white">${escapeHtml(player.nickname)}${uid === state.uid ? ' (Tú)' : ''}</div><div class="text-[10px] font-mono text-gray-400">${player.score || 0} PTS</div></div></div><span class="text-[9px] font-mono ${player.connected ? 'text-emerald-400' : 'text-gray-500'}">${player.connected ? '✓ LISTO' : 'AUSENTE'}</span></div>`).join('') || '<div class="rounded-xl border border-arena-cardborder bg-arena-dark/70 p-3 text-center text-xs text-gray-400">Esperando jugadores...</div>';
  });
  renderWaitingStatus();
}

function renderWaitingStatus() {
  const players = Object.entries(state.players);
  const answered = state.currentAnswers || {};
  const answeredUids = new Set(Object.keys(answered));
  if (state.ownAnswer && state.uid) answeredUids.add(state.uid);
  const answeredCount = answeredUids.size;
  document.querySelectorAll('[data-answer-status]').forEach((list) => {
    list.innerHTML = players.map(([uid, player]) => {
      const hasAnswered = answeredUids.has(uid);
      return `<span class="${hasAnswered ? 'text-emerald-400' : 'text-gray-500'} font-bold">${escapeHtml(player.nickname)} ${hasAnswered ? '✓' : '...'}</span>`;
    }).join('') || '<span class="text-gray-500">Esperando jugadores...</span>';
  });
  document.querySelectorAll('[data-response-count]').forEach((element) => { element.textContent = `${answeredCount}/${players.length} respondieron`; });
  document.querySelectorAll('[data-response-count-locked]').forEach((element) => { element.textContent = `${answeredCount}/${players.length} RESPUESTAS RECIBIDAS`; });
}

function startTimer(startedAt, duration) {
  clearInterval(state.timer);
  const tick = () => {
    const remainingMs = Math.max(0, duration * 1000 - (Date.now() + state.serverOffset - startedAt));
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    const pct = Math.max(0, Math.min(100, (remainingMs / (duration * 1000)) * 100));
    document.querySelectorAll('[data-timer-number]').forEach((timer) => {
      timer.textContent = String(remainingSeconds).padStart(2, '0');
      timer.classList.toggle('time-critical', remainingSeconds <= 3);
    });
    document.querySelectorAll('[data-time-bar]').forEach((bar) => {
      bar.style.width = `${pct}%`;
      bar.classList.toggle('time-bar-critical', remainingSeconds <= 3);
    });
    if (remainingSeconds <= 3 && remainingSeconds > 0 && remainingMs % 1000 < 240) playSound('tick');
  };
  tick(); state.timer = setInterval(tick, 200);
}

function scheduleQuestionClose(startedAt, duration) {
  clearTimeout(state.closeTimer);
  const delay = Math.max(0, startedAt + duration * 1000 - (Date.now() + state.serverOffset));
  state.closeTimer = setTimeout(async () => {
    if (isHost() && state.room?.status === 'QUESTION') {
      playSound('time');
      await update(ref(database, `rooms/${state.roomId}`), { status: 'VOTING', votingStartedAt: serverTimestamp() });
    }
  }, delay + 150);
}

function scheduleCountdown(startedAt) {
  clearTimeout(state.countdownTimer);
  clearInterval(state.countdownPaintTimer);
  if (!Number.isFinite(startedAt)) return;
  const finishAt = startedAt + 3000;
  const paint = () => {
    const remaining = Math.max(0, Math.ceil((finishAt - (Date.now() + state.serverOffset)) / 1000));
    const display = $('#countdown-display');
    if (display && display.textContent !== String(remaining || 1)) {
      display.textContent = String(remaining || 1);
      display.classList.remove('countdown-pop');
      void display.offsetWidth;
      display.classList.add('countdown-pop');
      playSound('start');
    }
  };
  paint();
  state.countdownPaintTimer = setInterval(paint, 100);
  const delay = Math.max(0, finishAt - (Date.now() + state.serverOffset));
  if (isHost()) {
    state.countdownTimer = setTimeout(async () => {
      if (state.room?.status === 'COUNTDOWN') {
        clearInterval(state.countdownPaintTimer);
        const number = Number(state.room.currentQuestion || 1);
        const duration = effectiveDuration(state.room.questionDuration, number, state.room.pressureMode);
        await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION', questionText: roomQuestionText(state.room, number), currentQuestionDuration: duration, questionStartedAt: serverTimestamp() });
      }
    }, delay + 100);
  }
}

async function beginQuestion(number) {
  resetLocalQuestionState(number);
  if (isHost()) await clearRoomAnswers(state.roomId);
  const duration = effectiveDuration(state.room?.questionDuration, number, state.room?.pressureMode);
  await update(ref(database, `rooms/${state.roomId}`), { status: 'COUNTDOWN', currentQuestion: number, currentQuestionDuration: duration, countdownStartedAt: serverTimestamp(), roundWinnerUid: '' });
}

function resetLocalQuestionState(question) {
  state.activeQuestion = question;
  state.ownAnswer = '';
  state.currentAnswers = {};
  state.votes = {};
  state.loadedAnswerQuestion = null;
  clearAnswerFields();
  renderWaitingStatus();
}

function clearLocalQuestionState() {
  state.activeQuestion = null;
  state.ownAnswer = '';
  state.currentAnswers = {};
  state.votes = {};
  state.loadedAnswerQuestion = null;
  clearAnswerFields();
}

function clearAnswerFields() {
  const answerInput = $('#answer-input');
  if (answerInput) {
    answerInput.value = '';
    window.updateCharCount?.(answerInput);
  }
  document.querySelectorAll('[data-own-answer]').forEach((element) => { element.textContent = 'Sin respuesta todavía.'; });
}

async function startGame() {
  if (!isHost()) throw new Error('Solo el host puede iniciar la partida.');
  await beginQuestion(1);
}

async function submitAnswer() {
  const answer = ($('#answer-input')?.value || '').trim();
  if (!answer || !state.roomId || !state.uid || state.room?.status !== 'QUESTION') return;
  if (state.submittingAnswer) return;
  const question = state.room.currentQuestion;
  state.submittingAnswer = true;
  try {
    await set(ref(database, `roomAnswers/${state.roomId}/${question}/${state.uid}`), { answer, answeredAt: serverTimestamp() });
    await set(ref(database, `roomAnswerStatus/${state.roomId}/${question}/${state.uid}`), true).catch(() => {});
    if (state.room?.currentQuestion !== question) return;
    state.ownAnswer = answer;
    state.currentAnswers = { ...(state.currentAnswers || {}), [state.uid]: true };
    document.querySelectorAll('[data-own-answer]').forEach((element) => { element.textContent = `“${answer}”`; });
    renderWaitingStatus();
    window.switchScreen('ui-8');
  } finally {
    state.submittingAnswer = false;
  }
}

async function submitVote(targetUid) {
  if (!targetUid || !state.roomId || !state.uid || state.room?.status !== 'VOTING') return;
  if (targetUid === state.uid) return showError('No puedes votarte a ti mismo.');
  if (state.submittingVote) return;
  state.submittingVote = true;
  try {
    await set(ref(database, `roomVotes/${state.roomId}/${state.room.currentQuestion}/${state.uid}`), targetUid);
    state.votes = { ...(state.votes || {}), [state.uid]: targetUid };
    renderAnswers(state.currentAnswers || {});
  } finally {
    state.submittingVote = false;
  }
}

async function revealResults() {
  if (!isHost()) throw new Error('Solo el host puede revelar resultados.');
  const winnerUid = roundWinnerUid(state.currentAnswers || {});
  await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION_RESULTS', roundWinnerUid: winnerUid || '' });
  playSound('reveal');
}

function listenAnswerStatus() {
  const question = state.room.currentQuestion;
  if (state.answerStatusQuestion === question && state.answerStatusUnsubscribe) return;
  stopAnswerStatusListener();
  state.answerStatusQuestion = question;
  state.answerStatusUnsubscribe = onValue(ref(database, `roomAnswerStatus/${state.roomId}/${question}`), (snapshot) => {
    state.currentAnswers = snapshot.val() || {};
    renderWaitingStatus();
  }, (error) => showError(error.message));
}

function listenAnswers() {
  const question = state.room.currentQuestion;
  if (state.answerQuestion === question && state.answerUnsubscribe) return;
  stopAnswerListener();
  state.answerQuestion = question;
  state.answerUnsubscribe = onValue(ref(database, `roomAnswers/${state.roomId}/${question}`), async (snapshot) => {
    const answers = snapshot.val() || {};
    state.currentAnswers = answers;
    renderWaitingStatus();
    renderAnswers(answers);
    renderPersonalAnalysis(answers);
    if (state.room?.status === 'QUESTION_RESULTS' && isHost() && (state.room.scoredQuestion || 0) < question) await scoreAnswers(question, answers);
  }, (error) => showError(error.message));
}

function stopAnswerListener() {
  state.answerUnsubscribe?.();
  state.answerUnsubscribe = null;
  state.answerQuestion = null;
}

function stopAnswerStatusListener() {
  state.answerStatusUnsubscribe?.();
  state.answerStatusUnsubscribe = null;
  state.answerStatusQuestion = null;
}

function stopVoteListener() {
  state.voteUnsubscribe?.();
  state.voteUnsubscribe = null;
  state.voteQuestion = null;
}

function listenVotes() {
  const question = state.room.currentQuestion;
  if (state.voteQuestion === question && state.voteUnsubscribe) return;
  stopVoteListener();
  state.voteQuestion = question;
  state.voteUnsubscribe = onValue(ref(database, `roomVotes/${state.roomId}/${question}`), (snapshot) => {
    state.votes = snapshot.val() || {};
    renderAnswers(state.currentAnswers || {});
  }, (error) => showError(error.message));
}

function voteCounts() {
  return Object.values(state.votes || {}).reduce((counts, targetUid) => {
    counts[targetUid] = (counts[targetUid] || 0) + 1;
    return counts;
  }, {});
}

function roundWinnerUid(answers = state.currentAnswers) {
  const counts = voteCounts();
  return Object.keys(answers || {}).sort((a, b) => {
    const voteDiff = (counts[b] || 0) - (counts[a] || 0);
    if (voteDiff) return voteDiff;
    const activeQuestion = getCurrentRoomQuestion(state.room);
    return evaluateAnswer(answers[b]?.answer || '', activeQuestion).score - evaluateAnswer(answers[a]?.answer || '', activeQuestion).score;
  })[0] || '';
}

function setRevealChrome() {
  const voting = state.room?.status === 'VOTING';
  $('[data-reveal-phase-label]') && ($('[data-reveal-phase-label]').textContent = voting ? 'VOTACIÓN' : 'ANÁLISIS');
  $('[data-answer-section-title]') && ($('[data-answer-section-title]').textContent = voting ? 'VOTA LA MEJOR RESPUESTA' : 'LO QUE PUSO CADA UNO');
  $('[data-next-main-label]') && ($('[data-next-main-label]').textContent = voting ? '⚡ REVELAR RESULTADOS' : '⚡ SIGUIENTE SHIT TEST');
  const winner = state.room?.roundWinnerUid || (!voting ? roundWinnerUid() : '');
  const winnerBox = $('[data-round-winner]');
  winnerBox?.classList.toggle('hidden', !winner || voting);
  if (winner && !voting) {
    $('[data-round-winner-name]') && ($('[data-round-winner-name]').textContent = state.players[winner]?.nickname || 'Jugador');
  }
  const voters = Object.keys(state.votes || {}).length;
  const players = Object.keys(state.players || {}).length;
  $('[data-vote-summary]') && ($('[data-vote-summary]').textContent = voting ? `${voters}/${players} VOTOS` : 'ANÁLISIS + VOTOS');
}

function scheduleAutoReveal() {
  clearTimeout(state.autoRevealTimer);
  if (!isHost() || state.room?.status !== 'VOTING') return;
  const startedAt = Number(state.room.votingStartedAt || Date.now() + state.serverOffset);
  const delay = Math.max(2500, startedAt + 6500 - (Date.now() + state.serverOffset));
  state.autoRevealTimer = setTimeout(async () => {
    if (isHost() && state.room?.status === 'VOTING') await revealResults();
  }, delay);
}

async function scoreAnswers(question, answers) {
  if (state.scoring) return;
  state.scoring = true;
  try {
    const activeQuestion = roomQuestion(state.room, question);
    const counts = voteCounts();
    const winnerUid = state.room.roundWinnerUid || roundWinnerUid(answers);
    await Promise.all(Object.keys(answers).map((uid) => runTransaction(ref(database, `roomPlayers/${state.roomId}/${uid}`), (player) => {
      if (!player || player.scoredQuestions?.[question]) return undefined;
      const evaluation = evaluateAnswer(answers[uid]?.answer || '', activeQuestion);
      const roundPoints = evaluation.score + Number(counts[uid] || 0) * 12 + (uid === winnerUid ? 25 : 0);
      return {
        ...player,
        score: Number(player.score || 0) + roundPoints,
        streak: uid === winnerUid ? Number(player.streak || 0) + 1 : 0,
        scoredQuestions: { ...(player.scoredQuestions || {}), [question]: true }
      };
    })));
    await update(ref(database, `rooms/${state.roomId}`), { scoredQuestion: question, roundWinnerUid: winnerUid || '' });
    if (winnerUid) playSound('victory');
  } finally {
    state.scoring = false;
  }
}

function renderAnswers(answers) {
  const list = $('[data-answer-list]');
  if (!list) return;
  const activeQuestion = getCurrentRoomQuestion(state.room);
  const voting = state.room?.status === 'VOTING';
  const counts = voteCounts();
  const winner = !voting ? (state.room?.roundWinnerUid || roundWinnerUid(answers)) : '';
  setRevealChrome();
  list.innerHTML = Object.entries(answers).map(([uid, item]) => {
    const player = state.players[uid] || { nickname: 'Jugador' };
    const evaluation = evaluateAnswer(item.answer, activeQuestion);
    const voted = state.votes?.[state.uid] === uid;
    const canVote = voting && uid !== state.uid;
    const scoreColor = evaluation.score >= 82 ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10' : evaluation.score >= 65 ? 'text-arena-gold border-arena-gold/40 bg-arena-gold/10' : 'text-arena-orange border-arena-orange/40 bg-arena-orange/10';
    return `<div class="battle-card self-start bg-arena-card border ${winner === uid ? 'winner-card' : (player.isHost ? 'border-arena-pink/50' : 'border-arena-orange/40')} rounded-xl p-3 shadow-card">
      <div class="flex items-center justify-between gap-2 mb-2">
        <div class="flex min-w-0 items-center gap-2"><span>${voting ? '🎭' : (player.isHost ? '👑' : '⚡')}</span><span class="text-xs font-bold text-white break-words">${voting ? 'Respuesta anónima' : `${escapeHtml(player.nickname)}${winner === uid ? ' · Ganador' : ''}`}</span></div>
        <span class="shrink-0 rounded-lg border px-2 py-1 text-[10px] font-mono font-black ${scoreColor}">${voting ? `${counts[uid] || 0} votos` : `${evaluation.score}%`}</span>
      </div>
      <div class="text-[10px] font-mono text-gray-400">${voting ? 'RESPUESTA:' : 'PUSO:'}</div>
      <div class="bg-arena-dark p-2.5 rounded-lg border border-arena-cardborder text-sm italic whitespace-pre-wrap break-words">“${escapeHtml(item.answer)}”</div>
      ${voting ? `<button data-vote-target="${uid}" ${canVote ? '' : 'disabled'} class="mt-2 w-full rounded-lg border ${voted ? 'border-arena-gold bg-arena-gold/15 text-arena-gold' : 'border-arena-cardborder bg-arena-dark text-gray-200'} px-3 py-2 text-xs font-black uppercase disabled:opacity-40">${uid === state.uid ? 'Tu respuesta' : (voted ? 'Votada' : 'Votar esta')}</button>` : `
        <div class="mt-2 grid gap-2 sm:grid-cols-3">
          <div class="rounded-lg border border-arena-cardborder bg-arena-dark/70 p-2"><div class="text-[9px] font-mono text-gray-500 uppercase">Técnica</div><div class="text-[11px] font-bold text-white">${escapeHtml(evaluation.technique)}</div></div>
          <div class="rounded-lg border border-arena-cardborder bg-arena-dark/70 p-2"><div class="text-[9px] font-mono text-gray-500 uppercase">Marco</div><div class="text-[11px] font-bold ${evaluation.fellIntoFrame ? 'text-arena-orange' : 'text-emerald-400'}">${escapeHtml(evaluation.frame)}</div></div>
          <div class="rounded-lg border border-arena-cardborder bg-arena-dark/70 p-2"><div class="text-[9px] font-mono text-gray-500 uppercase">Votos</div><div class="text-[11px] font-bold text-arena-gold">${counts[uid] || 0}</div></div>
        </div>
        <div class="mt-2 rounded-lg border border-arena-cardborder bg-arena-dark/70 p-2 text-[11px] leading-relaxed text-gray-300">
          <span class="font-mono font-black uppercase ${scoreColor.split(' ')[0]}">${evaluation.label}:</span> ${escapeHtml(evaluation.feedback)}
          <div class="mt-1 text-gray-400"><span class="text-arena-gold">Mejora:</span> ${escapeHtml(evaluation.improvement)}</div>
        </div>`}
    </div>`;
  }).join('') || '<div class="text-center text-xs text-gray-400">Nadie respondió esta ronda.</div>';
}

function renderPersonalAnalysis(answers = {}) {
  const target = $('[data-personal-analysis]');
  if (!target) return;
  const own = answers[state.uid]?.answer || state.ownAnswer || '';
  const activeQuestion = getCurrentRoomQuestion(state.room);
  const reference = recommendedAnswerForRoom(state.room);
  if (!own) {
    target.innerHTML = '<div class="text-[10px] font-mono font-black uppercase tracking-wider text-arena-pink">Tu respuesta vs referencia</div><div class="mt-2 text-xs text-gray-400">Responde la ronda para ver comparación personal.</div>';
    return;
  }
  const evaluation = evaluateAnswer(own, activeQuestion);
  const references = [reference, ...(Array.isArray(activeQuestion?.referenceAnswers) ? activeQuestion.referenceAnswers : [])].filter(Boolean);
  target.innerHTML = `
    <div class="flex items-center justify-between gap-2">
      <div class="text-[10px] font-mono font-black uppercase tracking-wider text-arena-pink">Tu respuesta vs referencia</div>
      <span class="rounded-lg border border-arena-pink/40 bg-arena-pink/10 px-2 py-1 text-[10px] font-mono font-black text-arena-pink">${evaluation.score}%</span>
    </div>
    <div class="mt-2 grid gap-2 sm:grid-cols-2">
      <div class="rounded-xl border border-arena-cardborder bg-arena-card p-3"><div class="text-[10px] font-mono uppercase text-gray-500">Tu respuesta</div><div class="mt-1 text-sm text-white whitespace-pre-wrap break-words">“${escapeHtml(own)}”</div></div>
      <div class="rounded-xl border border-arena-gold/35 bg-arena-gold/10 p-3"><div class="text-[10px] font-mono uppercase text-arena-gold">Referencia</div><div class="mt-1 text-sm text-white whitespace-pre-wrap break-words">${escapeHtml(references[0] || 'Pendiente')}</div></div>
    </div>
    <div class="mt-2 text-xs leading-relaxed text-gray-300">${escapeHtml(evaluation.feedback)}</div>
  `;
}

async function nextQuestion() {
  if (!isHost()) throw new Error('Esperando al host.');
  if (state.room?.status === 'VOTING') return revealResults();
  const next = Number(state.room.currentQuestion || 0) + 1;
  if (next > Number(state.room.roundCount || 10)) return update(ref(database, `rooms/${state.roomId}`), { status: 'LEADERBOARD' });
  await beginQuestion(next);
}

function renderLeaderboard() {
  const target = $('#hist-by-player');
  if (!target) return;
  const players = Object.values(state.players);
  const rounds = Number(state.room?.roundCount || state.settings.rounds || 0);
  const duration = Number(state.room?.questionDuration || state.settings.duration || 0);
  $('[data-final-progress]') && ($('[data-final-progress]').textContent = `${rounds}/${rounds} COMPLETADO`);
  $('[data-final-rounds]') && ($('[data-final-rounds]').textContent = `${rounds} shit tests`);
  $('[data-final-players]') && ($('[data-final-players]').textContent = `${players.length} jugadores`);
  $('[data-final-duration]') && ($('[data-final-duration]').textContent = `${duration}s por ronda`);
  target.classList.remove('hidden');
  $('#hist-by-round')?.classList.add('hidden');
  const rank = (score = 0) => score >= 900 ? 'Leyenda' : score >= 650 ? 'Élite' : score >= 420 ? 'Firme' : score >= 220 ? 'Calibrado' : 'Novato';
  target.innerHTML = players.sort((a, b) => (b.score || 0) - (a.score || 0)).map((player, index) => `<div class="bg-arena-dark/90 p-3 rounded-xl border border-arena-cardborder flex items-center justify-between gap-3"><div><span class="font-bold">#${index + 1} ${escapeHtml(player.nickname)}</span><div class="mt-1 text-[10px] font-mono text-gray-500">${rank(player.score || 0)} · racha ${player.streak || 0}</div></div><span class="font-mono text-arena-gold">${player.score || 0} PTS</span></div>`).join('') || '<div class="bg-arena-dark/90 p-3 rounded-xl border border-arena-cardborder text-center text-gray-400">Sin jugadores registrados.</div>';
}

function syncHostSettingsPanel() {
  state.settings.duration = Number(state.room?.questionDuration || state.settings.duration);
  state.settings.rounds = Number(state.room?.roundCount || state.settings.rounds);
  state.settings.pressureMode = state.room?.pressureMode === true;
  state.settings.techniqueId = state.room?.techniqueId || '';
  settingPainters['[data-host-duration-options]']?.(state.settings.duration);
  settingPainters['[data-host-round-options]']?.(state.settings.rounds);
  const select = $('[data-host-category-select]');
  if (select) select.value = state.room?.categoryId || '';
  const techniqueSelect = $('[data-host-technique-select]');
  if (techniqueSelect) techniqueSelect.value = state.room?.techniqueId || '';
  const pressure = $('[data-host-pressure-mode]');
  if (pressure) pressure.checked = state.room?.pressureMode === true;
  $('[data-host-category-summary]') && ($('[data-host-category-summary]').textContent = formatCategoryLabel(select?.selectedOptions?.[0]?.textContent || state.room?.category));
}

function openHostSettings() {
  syncHostSettingsPanel();
  window.switchScreen('ui-12');
}

async function saveHostConfig() {
  if (!isHost()) throw new Error('Solo el host puede cambiar la configuración.');
  if (state.room?.status !== 'LOBBY') throw new Error('Solo puedes cambiar la configuración antes de iniciar.');
  const roundCount = Number(state.settings.rounds || state.room.roundCount || 10);
  const questionDuration = Number(state.settings.duration || state.room.questionDuration || 10);
  const { categoryId, category } = selectedCategory('[data-host-category-select]');
  const { techniqueId, technique } = selectedTechnique('[data-host-technique-select]');
  const pressureMode = $('[data-host-pressure-mode]')?.checked === true;
  const randomOrder = state.room.randomOrder !== false;
  const questionSet = await pickQuestionsForRoom({ categoryId, techniqueId, roundCount });
  const questionOrder = questionSet.map((question) => question.id);
  await update(ref(database, `rooms/${state.roomId}`), {
    category,
    categoryId,
    currentQuestion: 0,
    currentQuestionDuration: questionDuration,
    questionDuration,
    questionOrder,
    questionSet,
    questionText: questionSet[0].text,
    technique,
    techniqueId,
    pressureMode,
    randomOrder,
    roundCount,
    scoredQuestion: 0
  });
  window.switchScreen('ui-4');
}

async function resetRoom() {
  if (!isHost()) return;
  await clearRoomAnswers(state.roomId);
  const scoreReset = {};
  Object.keys(state.players).forEach((uid) => {
    scoreReset[`${uid}/score`] = 0;
    scoreReset[`${uid}/streak`] = 0;
    scoreReset[`${uid}/scoredQuestions`] = null;
  });
  if (Object.keys(scoreReset).length) await update(ref(database, `roomPlayers/${state.roomId}`), scoreReset);
  await update(ref(database, `rooms/${state.roomId}`), { status: 'LOBBY', currentQuestion: 0, currentQuestionDuration: state.room.questionDuration, questionStartedAt: 0, countdownStartedAt: 0, scoredQuestion: 0, roundWinnerUid: '' });
}

async function deleteRoom() {
  if (!isHost()) return;
  const { code } = state.room;
  await Promise.all([clearRoomAnswers(state.roomId), removeDirectChildren(`roomPlayers/${state.roomId}`), removeAnswerChildren(`roomVotes/${state.roomId}`)]);
  await remove(ref(database, `rooms/${state.roomId}`));
  await remove(ref(database, `roomCodes/${code}`));
  state.roomId = null;
  state.room = null;
  state.players = {};
  state.currentAnswers = {};
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  stopAnswerListener();
  stopAnswerStatusListener();
  stopVoteListener();
  window.switchScreen('ui-1');
}

function bindAction(selector, text, handler) {
  document.querySelectorAll(selector).forEach((button) => {
    if (!button.textContent.includes(text)) return;
    button.onclick = null;
    button.addEventListener('click', (event) => { event.preventDefault(); handler().catch((error) => showError(error.message)); });
  });
}

function bindGameAction(action, handler) {
  document.querySelectorAll(`[data-game-action="${action}"]`).forEach((button) => {
    button.onclick = null;
    button.addEventListener('click', (event) => { event.preventDefault(); handler().catch((error) => showError(error.message)); });
  });
}

function bindActions() {
  const editAnswer = async () => {
    if (state.room?.status !== 'QUESTION') throw new Error('La ronda ya terminó.');
    window.switchScreen('ui-7');
    if ($('#answer-input')) $('#answer-input').value = state.ownAnswer;
  };
  const actions = {
    'create-room': createRoom,
    'join-room': joinRoom,
    'start-game': startGame,
    'submit-answer': submitAnswer,
    'edit-answer': editAnswer,
    'next-question': nextQuestion,
    'reset-room': resetRoom,
    'delete-room': deleteRoom,
    'save-host-config': saveHostConfig
  };
  Object.entries(actions).forEach(([action, handler]) => bindGameAction(action, handler));
  if (!delegatedActionsBound) {
    delegatedActionsBound = true;
    document.addEventListener('click', (event) => {
      if (event.defaultPrevented) return;
      const voteTarget = event.target.closest?.('[data-vote-target]')?.dataset.voteTarget;
      if (voteTarget) {
        event.preventDefault();
        submitVote(voteTarget).catch((error) => showError(error.message));
        return;
      }
      const button = event.target.closest?.('[data-game-action]');
      const handler = button ? actions[button.dataset.gameAction] : null;
      if (!handler) return;
      event.preventDefault();
      handler().catch((error) => showError(error.message));
    });
  }
  $('[data-open-host-settings]')?.addEventListener('click', (event) => { event.preventDefault(); openHostSettings(); });
  document.querySelectorAll('[data-sound-toggle]').forEach((button) => button.addEventListener('click', () => {
    state.soundEnabled = !state.soundEnabled;
    localStorage.setItem('arenaSound', state.soundEnabled ? 'on' : 'off');
    updateSoundButtons();
    playSound('start');
  }));
  updateSoundButtons();
  $('[data-copy-code]')?.addEventListener('click', () => copyText(state.room?.code || '', 'Código copiado').catch((error) => showError(error.message)));
  $('[data-copy-link]')?.addEventListener('click', () => copyText(roomUrl(), 'Link de invitación copiado').catch((error) => showError(error.message)));
  let previewTimer;
  $('#join-code')?.addEventListener('input', (event) => {
    clearTimeout(previewTimer);
    previewTimer = setTimeout(() => previewRoom(event.target.value), 250);
  });
  $('[data-paste-code]')?.addEventListener('click', async () => {
    try {
      const value = cleanCode(await navigator.clipboard.readText());
      if ($('#join-code')) $('#join-code').value = value;
      await previewRoom(value);
    } catch (error) { showError(error.message); }
  });
  bindSettingButtons('[data-duration-options]', 'duration', [5, 10, 15, 20, 30], '[data-duration-summary]', (value) => `${value} SEGUNDOS`);
  bindSettingButtons('[data-host-duration-options]', 'duration', [5, 10, 15, 20, 30], '[data-host-duration-summary]', (value) => `${value} SEGUNDOS`);
  bindSettingButtons('[data-round-options]', 'rounds', [5, 10, 15, 20], '[data-round-summary]', (value) => `${value} RONDAS`);
  bindSettingButtons('[data-host-round-options]', 'rounds', [5, 10, 15, 20], '[data-host-round-summary]', (value) => `${value} RONDAS`);
  bindCustomDurationModal();
  $('[data-category-select]')?.addEventListener('change', (event) => {
    $('[data-category-summary]') && ($('[data-category-summary]').textContent = formatCategoryLabel(event.target.selectedOptions?.[0]?.textContent || event.target.value));
  });
  $('[data-host-category-select]')?.addEventListener('change', (event) => {
    $('[data-host-category-summary]') && ($('[data-host-category-summary]').textContent = formatCategoryLabel(event.target.selectedOptions?.[0]?.textContent || event.target.value));
  });
  $('[data-technique-select]')?.addEventListener('change', (event) => { state.settings.techniqueId = event.target.value; });
  $('[data-host-technique-select]')?.addEventListener('change', (event) => { state.settings.techniqueId = event.target.value; });
  $('[data-pressure-mode]')?.addEventListener('change', (event) => { state.settings.pressureMode = event.target.checked; });
  $('[data-host-pressure-mode]')?.addEventListener('change', (event) => { state.settings.pressureMode = event.target.checked; });
}

function openCustomDurationModal(currentValue, onApply) {
  customDurationApply = onApply;
  const modal = $('#custom-duration-modal');
  const input = $('#custom-duration-input');
  if (!modal || !input) return;
  input.value = String(currentValue || state.settings.duration || 10);
  modal.classList.remove('hidden');
  modal.classList.add('flex');
  input.focus();
  input.select();
}

function closeCustomDurationModal() {
  const modal = $('#custom-duration-modal');
  modal?.classList.add('hidden');
  modal?.classList.remove('flex');
  customDurationApply = null;
}

function bindCustomDurationModal() {
  $('[data-custom-duration-cancel]')?.addEventListener('click', closeCustomDurationModal);
  $('[data-custom-duration-form]')?.addEventListener('submit', (event) => {
    event.preventDefault();
    const value = Number.parseInt($('#custom-duration-input')?.value || '', 10);
    if (!Number.isInteger(value) || value < 5 || value > 120) return showError('El tiempo debe estar entre 5 y 120 segundos.');
    customDurationApply?.(value);
    closeCustomDurationModal();
  });
  $('#custom-duration-modal')?.addEventListener('click', (event) => {
    if (event.target.id === 'custom-duration-modal') closeCustomDurationModal();
  });
}

function bindSettingButtons(containerSelector, key, allowed, summarySelector, formatter) {
  const selectButton = (selectedButton, value) => {
    state.settings[key] = value;
    document.querySelectorAll(`${containerSelector} button`).forEach((item) => {
      item.classList.remove('bg-gradient-to-r', 'from-arena-pink', 'to-arena-orange', 'bg-arena-cardborder', 'text-white', 'font-bold', 'shadow-sm', 'border', 'border-arena-pink/50');
      item.classList.add('text-gray-400');
    });
    selectedButton.classList.remove('text-gray-400');
    selectedButton.classList.add('bg-gradient-to-r', 'from-arena-pink', 'to-arena-orange', 'text-white', 'font-bold');
    const summary = $(summarySelector);
    if (summary) summary.textContent = formatter(value);
  };
  settingPainters[containerSelector] = (value) => {
    const buttons = Array.from(document.querySelectorAll(`${containerSelector} button`));
    let selectedButton = buttons.find((button) => Number.parseInt(button.textContent, 10) === value && allowed.includes(value));
    if (!selectedButton && key === 'duration') {
      selectedButton = buttons.at(-1);
      if (selectedButton) selectedButton.textContent = `${value}s`;
    }
    if (selectedButton) selectButton(selectedButton, value);
  };

  document.querySelectorAll(`${containerSelector} button`).forEach((button) => {
    const value = Number.parseInt(button.textContent, 10);
    if (!allowed.includes(value)) return;
    button.addEventListener('click', () => {
      selectButton(button, value);
    });
  });
  if (key === 'duration') {
    const customButton = document.querySelector(`${containerSelector} button:last-child`);
    customButton?.addEventListener('click', () => {
      openCustomDurationModal(state.settings.duration, (value) => {
        customButton.textContent = `${value}s`;
        selectButton(customButton, value);
      });
    });
  }
}

window.addEventListener('DOMContentLoaded', async () => {
  localStorage.removeItem('arenaSession');
  retireLegacyAppCache().catch(() => {});
  bindActions();
  ['#host-nick', '#join-nick', '#join-code'].forEach((selector) => {
    const input = $(selector);
    if (input) input.value = '';
  });
  await ensureUser();
  await populateCategorySelectors();
  const routeCode = cleanCode(window.location.pathname.match(/^\/room\/([^/]+)/)?.[1] || '');
  $('[data-attempted-code]') && ($('[data-attempted-code]').textContent = routeCode || '-----');
  if (routeCode.length === 5 && $('#join-code')) {
    $('#join-code').value = routeCode;
    window.switchScreen('ui-3');
    await previewRoom(routeCode);
    return;
  }
});
onValue(ref(database, '.info/serverTimeOffset'), (snapshot) => { state.serverOffset = Number(snapshot.val() || 0); });
onValue(ref(database, '.info/connected'), async (snapshot) => {
  const connected = snapshot.val() === true;
  if (connected) state.hasConnectedOnce = true;
  $('#reconnect-banner')?.classList.toggle('hidden', connected || !state.hasConnectedOnce);
  if (connected && state.roomId && state.uid) {
    await set(ref(database, `roomPlayers/${state.roomId}/${state.uid}/connected`), true).catch(() => {});
    await onDisconnect(ref(database, `roomPlayers/${state.roomId}/${state.uid}/connected`)).set(false).catch(() => {});
  }
});
