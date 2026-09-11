import { ensurePlayerUser } from './auth.js?v=4';
import { fallbackQuestionText, loadGameCategories, pickQuestionsForRoom } from './question-service.js?v=3';
import { database, ref, set, update, get, onValue, onDisconnect, push, remove, runTransaction, serverTimestamp } from './game/realtime.js?v=2';

const state = { uid: null, roomId: null, room: null, players: {}, currentAnswers: {}, ownAnswer: '', activeQuestion: null, loadedAnswerQuestion: null, serverOffset: 0, hasConnectedOnce: false, unsubscribers: [], answerUnsubscribe: null, answerQuestion: null, answerStatusUnsubscribe: null, answerStatusQuestion: null, timer: null, closeTimer: null, countdownTimer: null, countdownPaintTimer: null, scoring: false, submittingAnswer: false, settings: { duration: 10, rounds: 10 } };
const settingPainters = {};
let customDurationApply = null;
let delegatedActionsBound = false;

const $ = (selector) => document.querySelector(selector);
const cleanCode = (value) => value.replace(/\s/g, '').toUpperCase();
const escapeHtml = (value = '') => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const isHost = () => Boolean(state.room && state.uid === state.room.hostUid);
const formatCategoryLabel = (value = 'Todas las categorías') => value.replace(/\s*\([^)]*\)/g, '').replace('Todas las categorías', 'Todas').toUpperCase();
const roomQuestionText = (room, number) => room?.questionSet?.[number - 1]?.text || room?.questions?.[number - 1]?.text || fallbackQuestionText(number - 1);

function selectedCategory(selector) {
  const select = $(selector);
  return {
    categoryId: select?.value || '',
    category: select?.selectedOptions?.[0]?.textContent?.trim() || 'Todas las categorías'
  };
}

function fillCategorySelect(select, categories, selectedId = '') {
  if (!select) return;
  select.innerHTML = categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}</option>`).join('');
  select.value = selectedId;
}

async function populateCategorySelectors() {
  const categories = await loadGameCategories();
  fillCategorySelect($('[data-category-select]'), categories);
  fillCategorySelect($('[data-host-category-select]'), categories);
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
  await Promise.all([removeAnswerChildren(`roomAnswers/${roomId}`), removeAnswerChildren(`roomAnswerStatus/${roomId}`)]);
}

function replaceReferenceText(room) {
  document.querySelectorAll('[data-question-text]').forEach((element) => { element.textContent = `“${room.questionText || fallbackQuestionText(0)}”`; });
  document.querySelectorAll('[data-room-code]').forEach((element) => { element.textContent = room.code; });
  document.querySelectorAll('[data-room-code-label]').forEach((element) => { element.textContent = `SALA: ${room.code}`; });
  document.querySelectorAll('[data-host-name]').forEach((element) => { element.textContent = room.hostName || 'Host'; });
  document.querySelectorAll('[data-room-link]').forEach((element) => { element.textContent = roomUrl(room.code); });
  document.querySelectorAll('[data-round-label]').forEach((element) => { element.textContent = `RONDA ${room.currentQuestion || 1} / ${room.roundCount}`; });
  document.querySelectorAll('[data-question-label]').forEach((element) => { element.textContent = `SHIT TEST #${String(room.currentQuestion || 1).padStart(2, '0')}`; });
  document.querySelectorAll('[data-countdown-copy]').forEach((element) => { element.textContent = Number(room.currentQuestion || 1) <= 1 ? 'La primera ronda está por comenzar.' : `La ronda ${room.currentQuestion} está por comenzar.`; });
  document.querySelectorAll('[data-room-duration-short]').forEach((element) => { element.textContent = `${room.questionDuration}s`; });
  document.querySelectorAll('[data-room-rounds-short]').forEach((element) => { element.textContent = String(room.roundCount); });
  document.querySelectorAll('[data-room-duration]').forEach((element) => { element.textContent = `${room.questionDuration} SEGUNDOS`; });
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
  const questionSet = await pickQuestionsForRoom({ categoryId, roundCount: state.settings.rounds });
  const questionOrder = questionSet.map((question) => question.id);
  const room = { hostUid: user.uid, hostName: nickname, code, status: 'LOBBY', currentQuestion: 0, questionOrder, questionSet, questionText: questionSet[0].text, questionStartedAt: 0, questionDuration: state.settings.duration, roundCount: state.settings.rounds, categoryId, category, randomOrder, createdAt: serverTimestamp(), scoredQuestion: 0 };
  const player = { nickname, score: 0, connected: true, joinedAt: serverTimestamp(), isHost: true };
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
  await set(ref(database, `roomPlayers/${roomId}/${user.uid}`), { nickname, score: 0, connected: true, joinedAt: serverTimestamp(), isHost: false });
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
  if (!['QUESTION', 'QUESTION_RESULTS'].includes(room.status)) {
    stopAnswerListener();
    stopAnswerStatusListener();
    state.currentAnswers = {};
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
    listenAnswerStatus();
    loadOwnAnswer(room.currentQuestion).catch((error) => {
      if (state.room?.status === 'QUESTION') showError(error.message);
    });
    startTimer(room.questionStartedAt, room.questionDuration);
    if (isHost()) scheduleQuestionClose(room.questionStartedAt, room.questionDuration);
  }
  if (room.status === 'QUESTION_RESULTS') { window.switchScreen('ui-10'); stopAnswerStatusListener(); listenAnswers(); }
  if (room.status === 'LEADERBOARD') { stopAnswerStatusListener(); window.switchScreen('ui-11'); renderLeaderboard(); }
  if (room.status === 'FINISHED') { stopAnswerStatusListener(); window.switchScreen('ui-11'); }
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
    document.querySelectorAll('[data-timer-number]').forEach((timer) => { timer.textContent = String(Math.ceil(remainingMs / 1000)).padStart(2, '0'); });
  };
  tick(); state.timer = setInterval(tick, 200);
}

function scheduleQuestionClose(startedAt, duration) {
  clearTimeout(state.closeTimer);
  const delay = Math.max(0, startedAt + duration * 1000 - (Date.now() + state.serverOffset));
  state.closeTimer = setTimeout(async () => {
    if (isHost() && state.room?.status === 'QUESTION') await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION_RESULTS' });
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
    if (display) display.textContent = String(remaining || 1);
  };
  paint();
  state.countdownPaintTimer = setInterval(paint, 100);
  const delay = Math.max(0, finishAt - (Date.now() + state.serverOffset));
  if (isHost()) {
    state.countdownTimer = setTimeout(async () => {
      if (state.room?.status === 'COUNTDOWN') {
        clearInterval(state.countdownPaintTimer);
        const number = Number(state.room.currentQuestion || 1);
        await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION', questionText: roomQuestionText(state.room, number), questionStartedAt: serverTimestamp() });
      }
    }, delay + 100);
  }
}

async function beginQuestion(number) {
  resetLocalQuestionState(number);
  if (isHost()) await clearRoomAnswers(state.roomId);
  await update(ref(database, `rooms/${state.roomId}`), { status: 'COUNTDOWN', currentQuestion: number, countdownStartedAt: serverTimestamp() });
}

function resetLocalQuestionState(question) {
  state.activeQuestion = question;
  state.ownAnswer = '';
  state.currentAnswers = {};
  state.loadedAnswerQuestion = null;
  clearAnswerFields();
  renderWaitingStatus();
}

function clearLocalQuestionState() {
  state.activeQuestion = null;
  state.ownAnswer = '';
  state.currentAnswers = {};
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

async function scoreAnswers(question, answers) {
  if (state.scoring) return;
  state.scoring = true;
  try {
    await Promise.all(Object.keys(answers).map((uid) => runTransaction(ref(database, `roomPlayers/${state.roomId}/${uid}`), (player) => {
      if (!player || player.scoredQuestions?.[question]) return undefined;
      return { ...player, score: Number(player.score || 0) + 100, scoredQuestions: { ...(player.scoredQuestions || {}), [question]: true } };
    })));
    await update(ref(database, `rooms/${state.roomId}`), { scoredQuestion: question });
  } finally {
    state.scoring = false;
  }
}

function renderAnswers(answers) {
  const list = $('[data-answer-list]');
  if (!list) return;
  list.innerHTML = Object.entries(answers).map(([uid, item]) => { const player = state.players[uid] || { nickname: 'Jugador' }; return `<div class="self-start bg-arena-card border ${player.isHost ? 'border-arena-pink/50' : 'border-arena-orange/40'} rounded-xl p-3 shadow-card"><div class="flex items-center gap-2 mb-2"><span>${player.isHost ? '👑' : '⚡'}</span><span class="text-xs font-bold text-white break-words">${escapeHtml(player.nickname)}</span></div><div class="text-[10px] font-mono text-gray-400">PUSO:</div><div class="bg-arena-dark p-2.5 rounded-lg border border-arena-cardborder text-sm italic whitespace-pre-wrap break-words">“${escapeHtml(item.answer)}”</div></div>`; }).join('') || '<div class="text-center text-xs text-gray-400">Nadie respondió esta ronda.</div>';
}

async function nextQuestion() {
  if (!isHost()) throw new Error('Esperando al host.');
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
  target.innerHTML = players.sort((a, b) => (b.score || 0) - (a.score || 0)).map((player, index) => `<div class="bg-arena-dark/90 p-3 rounded-xl border border-arena-cardborder flex justify-between"><span class="font-bold">#${index + 1} ${escapeHtml(player.nickname)}</span><span class="font-mono text-arena-gold">${player.score || 0} PTS</span></div>`).join('') || '<div class="bg-arena-dark/90 p-3 rounded-xl border border-arena-cardborder text-center text-gray-400">Sin jugadores registrados.</div>';
}

function syncHostSettingsPanel() {
  state.settings.duration = Number(state.room?.questionDuration || state.settings.duration);
  state.settings.rounds = Number(state.room?.roundCount || state.settings.rounds);
  settingPainters['[data-host-duration-options]']?.(state.settings.duration);
  settingPainters['[data-host-round-options]']?.(state.settings.rounds);
  const select = $('[data-host-category-select]');
  if (select) select.value = state.room?.categoryId || '';
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
  const randomOrder = state.room.randomOrder !== false;
  const questionSet = await pickQuestionsForRoom({ categoryId, roundCount });
  const questionOrder = questionSet.map((question) => question.id);
  await update(ref(database, `rooms/${state.roomId}`), {
    category,
    categoryId,
    currentQuestion: 0,
    questionDuration,
    questionOrder,
    questionSet,
    questionText: questionSet[0].text,
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
    scoreReset[`${uid}/scoredQuestions`] = null;
  });
  if (Object.keys(scoreReset).length) await update(ref(database, `roomPlayers/${state.roomId}`), scoreReset);
  await update(ref(database, `rooms/${state.roomId}`), { status: 'LOBBY', currentQuestion: 0, questionStartedAt: 0, countdownStartedAt: 0, scoredQuestion: 0 });
}

async function deleteRoom() {
  if (!isHost()) return;
  const { code } = state.room;
  await Promise.all([clearRoomAnswers(state.roomId), removeDirectChildren(`roomPlayers/${state.roomId}`)]);
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
      const button = event.target.closest?.('[data-game-action]');
      const handler = button ? actions[button.dataset.gameAction] : null;
      if (!handler) return;
      event.preventDefault();
      handler().catch((error) => showError(error.message));
    });
  }
  $('[data-open-host-settings]')?.addEventListener('click', (event) => { event.preventDefault(); openHostSettings(); });
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
