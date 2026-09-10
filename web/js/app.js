import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, onDisconnect, push, remove, runTransaction, serverTimestamp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

const firebaseConfig = {
  apiKey: 'AIzaSyBiIfbrs7lqQl3Bn1uwpcHlx6Abja35aeg',
  authDomain: 'shit-test-3bf22.firebaseapp.com',
  databaseURL: 'https://shit-test-3bf22-default-rtdb.firebaseio.com',
  projectId: 'shit-test-3bf22',
  storageBucket: 'shit-test-3bf22.firebasestorage.app',
  messagingSenderId: '317278684294',
  appId: '1:317278684294:web:2d6d577acec9ba08e4bd07'
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const database = getDatabase(app);
const state = { uid: null, roomId: null, room: null, players: {}, ownAnswer: '', loadedAnswerQuestion: null, serverOffset: 0, unsubscribers: [], answerUnsubscribe: null, answerQuestion: null, timer: null, closeTimer: null, countdownTimer: null, countdownPaintTimer: null, scoring: false, settings: { duration: 10, rounds: 10 } };
const QUESTIONS = [
  'Seguro eres así con todas.', 'Tienes cara de que te crees demasiado.',
  'Pensé que eras más divertido.', '¿Siempre necesitas llamar la atención?',
  'A ver, sorpréndeme.', '¿Qué te hace pensar que tenemos química?',
  'No pareces alguien fácil de sorprender.', '¿Qué estás evitando decir?',
  '¿También discutes contigo mismo?', 'Cambia mi opinión sobre ti.',
  '¿Eso fue lo mejor que se te ocurrió?', '¿Siempre eres tan intenso?',
  'Todos te están mirando, ¿te pones nervioso?', 'Véndeme tu mejor cualidad en diez segundos.',
  '¿De verdad crees que vas a impresionarme?', 'No estoy segura de que seas tan interesante.',
  '¿Te molesta que tenga razón?', 'Descríbete sin usar adjetivos.',
  '¿Qué tienes tú que no tenga cualquiera?', 'No puedes responder con otra pregunta.'
];

const $ = (selector) => document.querySelector(selector);
const cleanCode = (value) => value.replace(/\s/g, '').toUpperCase();
const escapeHtml = (value = '') => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const isHost = () => Boolean(state.room && state.uid === state.room.hostUid);

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

async function retireLegacyFlutterCache() {
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

function replaceReferenceText(room) {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  while (walker.nextNode()) {
    const node = walker.currentNode;
    node.textContent = node.textContent
      .replaceAll('K7P4Q', room.code)
      .replaceAll('Jeanpiere', room.hostName || 'HOST');
  }
  document.querySelectorAll('[data-question-text]').forEach((element) => { element.textContent = `“${room.questionText || QUESTIONS[0]}”`; });
  document.querySelectorAll('[data-room-link]').forEach((element) => { element.textContent = roomUrl(room.code); });
  document.querySelectorAll('[data-round-label]').forEach((element) => { element.textContent = `RONDA ${room.currentQuestion || 1} / ${room.roundCount}`; });
  document.querySelectorAll('[data-question-label]').forEach((element) => { element.textContent = `SHIT TEST #${String(room.currentQuestion || 1).padStart(2, '0')}`; });
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

async function ensureUser() {
  const user = auth.currentUser || (await signInAnonymously(auth)).user;
  state.uid = user.uid;
  return user;
}

async function claimRoomCode(code, roomId, hostUid) {
  const reservation = { roomId, hostUid };
  const result = await runTransaction(ref(database, `roomCodes/${code}`), (current) => current ?? reservation);
  return result.committed && result.snapshot.val()?.roomId === roomId;
}

async function createRoom() {
  const user = await ensureUser();
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
  const category = $('[data-category-select]')?.value || 'Todas las categorías';
  const indexes = [...Array(QUESTIONS.length).keys()];
  const questionOrder = (randomOrder ? indexes.sort(() => Math.random() - 0.5) : indexes).slice(0, state.settings.rounds);
  const room = { hostUid: user.uid, hostName: nickname, code, status: 'LOBBY', currentQuestion: 0, questionOrder, questionText: QUESTIONS[questionOrder[0]], questionStartedAt: 0, questionDuration: state.settings.duration, roundCount: state.settings.rounds, category, randomOrder, createdAt: serverTimestamp(), scoredQuestion: 0 };
  const player = { nickname, score: 0, connected: true, joinedAt: serverTimestamp(), isHost: true };
  try {
    await set(ref(database, `rooms/${roomId}`), room);
    await set(ref(database, `roomPlayers/${roomId}/${user.uid}`), player);
    await enterSession(roomId, room.code);
  } catch (error) {
    await Promise.allSettled([remove(ref(database, `roomPlayers/${roomId}`)), remove(ref(database, `roomAnswers/${roomId}`))]);
    await remove(ref(database, `rooms/${roomId}`)).catch(() => {});
    await remove(ref(database, `roomCodes/${code}`)).catch(() => {});
    throw error;
  }
}

async function joinRoom() {
  const user = await ensureUser();
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
  localStorage.setItem('arenaSession', JSON.stringify({ roomId, code }));
  await set(ref(database, `roomPlayers/${roomId}/${state.uid}/connected`), true);
  await onDisconnect(ref(database, `roomPlayers/${roomId}/${state.uid}/connected`)).set(false);
  subscribeRoom(roomId);
}

function subscribeRoom(roomId) {
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  stopAnswerListener();
  state.unsubscribers.push(onValue(ref(database, `rooms/${roomId}`), (snapshot) => {
    state.room = snapshot.val();
    if (!state.room) { localStorage.removeItem('arenaSession'); return window.switchScreen('ui-14'); }
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
  if (room.status !== 'QUESTION') clearInterval(state.timer);
  if (room.status !== 'COUNTDOWN') clearInterval(state.countdownPaintTimer);
  if (room.status !== 'QUESTION_RESULTS') stopAnswerListener();
  if (room.status === 'LOBBY') {
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
    loadOwnAnswer(room.currentQuestion).catch((error) => {
      if (state.room?.status === 'QUESTION') showError(error.message);
    });
    startTimer(room.questionStartedAt, room.questionDuration);
    if (isHost()) scheduleQuestionClose(room.questionStartedAt, room.questionDuration);
  }
  if (room.status === 'QUESTION_RESULTS') { window.switchScreen('ui-10'); listenAnswers(); }
  if (room.status === 'LEADERBOARD') { window.switchScreen('ui-11'); renderLeaderboard(); }
  if (room.status === 'FINISHED') window.switchScreen('ui-11');
}

async function loadOwnAnswer(question) {
  if (state.loadedAnswerQuestion === question) return;
  state.loadedAnswerQuestion = question;
  const snapshot = await get(ref(database, `roomAnswers/${state.roomId}/${question}/${state.uid}`));
  state.ownAnswer = snapshot.val()?.answer || '';
  if (state.ownAnswer && $('#answer-input')) $('#answer-input').value = state.ownAnswer;
  document.querySelectorAll('[data-own-answer]').forEach((element) => { element.textContent = state.ownAnswer ? `“${state.ownAnswer}”` : 'Sin respuesta todavía.'; });
  renderWaitingStatus();
}

function renderPlayers() {
  const players = Object.entries(state.players).sort(([, a], [, b]) => (b.isHost ? 1 : 0) - (a.isHost ? 1 : 0));
  document.querySelectorAll('[data-player-count]').forEach((element) => { element.textContent = `(${players.length}/8)`; });
  document.querySelectorAll('[data-player-list]').forEach((list) => {
    list.innerHTML = players.map(([uid, player]) => `<div class="bg-arena-dark/80 p-2.5 rounded-xl border ${player.isHost ? 'border-arena-pink/40' : 'border-arena-cardborder'} flex items-center justify-between"><div class="flex items-center gap-2.5"><span class="w-8 h-8 rounded-lg bg-arena-pink/15 text-arena-pink flex items-center justify-center">${player.isHost ? '👑' : '⚡'}</span><div><div class="text-xs font-bold text-white">${escapeHtml(player.nickname)}${uid === state.uid ? ' (Tú)' : ''}</div><div class="text-[10px] font-mono text-gray-400">${player.score || 0} PTS</div></div></div><span class="text-[9px] font-mono ${player.connected ? 'text-emerald-400' : 'text-gray-500'}">${player.connected ? '✓ LISTO' : 'AUSENTE'}</span></div>`).join('');
  });
  renderWaitingStatus();
}

function renderWaitingStatus() {
  const players = Object.entries(state.players);
  document.querySelectorAll('[data-answer-status]').forEach((list) => {
    list.innerHTML = players.map(([uid, player]) => `<span class="${uid === state.uid && state.ownAnswer ? 'text-emerald-400' : 'text-gray-500'} font-bold">${escapeHtml(player.nickname)} ${uid === state.uid && state.ownAnswer ? '✓' : '...'}</span>`).join('');
  });
  document.querySelectorAll('[data-response-count]').forEach((element) => { element.textContent = `${state.ownAnswer ? 1 : 0}/${players.length} respondieron`; });
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
        const questionIndex = state.room.questionOrder?.[number - 1] ?? ((number - 1) % QUESTIONS.length);
        await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION', questionText: QUESTIONS[questionIndex], questionStartedAt: serverTimestamp() });
      }
    }, delay + 100);
  }
}

async function beginQuestion(number) {
  state.ownAnswer = '';
  state.loadedAnswerQuestion = null;
  await update(ref(database, `rooms/${state.roomId}`), { status: 'COUNTDOWN', currentQuestion: number, countdownStartedAt: serverTimestamp() });
}

async function startGame() {
  if (!isHost()) throw new Error('Solo el host puede iniciar la partida.');
  await beginQuestion(1);
}

async function submitAnswer() {
  const answer = ($('#answer-input')?.value || '').trim();
  if (!answer || !state.roomId || !state.uid || state.room?.status !== 'QUESTION') return;
  await set(ref(database, `roomAnswers/${state.roomId}/${state.room.currentQuestion}/${state.uid}`), { answer, answeredAt: serverTimestamp() });
  state.ownAnswer = answer;
  document.querySelectorAll('[data-own-answer]').forEach((element) => { element.textContent = `“${answer}”`; });
  renderWaitingStatus();
  window.switchScreen('ui-8');
}

function listenAnswers() {
  const question = state.room.currentQuestion;
  if (state.answerQuestion === question && state.answerUnsubscribe) return;
  stopAnswerListener();
  state.answerQuestion = question;
  state.answerUnsubscribe = onValue(ref(database, `roomAnswers/${state.roomId}/${question}`), async (snapshot) => {
    const answers = snapshot.val() || {};
    renderAnswers(answers);
    if (isHost() && (state.room.scoredQuestion || 0) < question) await scoreAnswers(question, answers);
  }, (error) => showError(error.message));
}

function stopAnswerListener() {
  state.answerUnsubscribe?.();
  state.answerUnsubscribe = null;
  state.answerQuestion = null;
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
  list.innerHTML = Object.entries(answers).map(([uid, item]) => { const player = state.players[uid] || { nickname: 'Jugador' }; return `<div class="bg-arena-card border ${player.isHost ? 'border-arena-pink/50' : 'border-arena-orange/40'} rounded-xl p-3 shadow-card"><div class="flex items-center gap-2 mb-2"><span>${player.isHost ? '👑' : '⚡'}</span><span class="text-xs font-bold text-white">${escapeHtml(player.nickname)}</span></div><div class="text-[10px] font-mono text-gray-400">PUSO:</div><div class="bg-arena-dark p-2.5 rounded-lg border border-arena-cardborder text-sm italic">“${escapeHtml(item.answer)}”</div></div>`; }).join('') || '<div class="text-center text-xs text-gray-400">Nadie respondió esta ronda.</div>';
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
  target.classList.remove('hidden');
  $('#hist-by-round')?.classList.add('hidden');
  target.innerHTML = Object.values(state.players).sort((a, b) => (b.score || 0) - (a.score || 0)).map((player, index) => `<div class="bg-arena-dark/90 p-3 rounded-xl border border-arena-cardborder flex justify-between"><span class="font-bold">#${index + 1} ${escapeHtml(player.nickname)}</span><span class="font-mono text-arena-gold">${player.score || 0} PTS</span></div>`).join('');
}

async function resetRoom() {
  if (!isHost()) return;
  await remove(ref(database, `roomAnswers/${state.roomId}`));
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
  await Promise.all([remove(ref(database, `roomAnswers/${state.roomId}`)), remove(ref(database, `roomPlayers/${state.roomId}`))]);
  await remove(ref(database, `rooms/${state.roomId}`));
  await remove(ref(database, `roomCodes/${code}`));
  localStorage.removeItem('arenaSession');
  state.roomId = null;
  state.room = null;
  state.players = {};
  state.unsubscribers.forEach((unsubscribe) => unsubscribe());
  state.unsubscribers = [];
  stopAnswerListener();
  window.switchScreen('ui-1');
}

function bindAction(selector, text, handler) {
  document.querySelectorAll(selector).forEach((button) => {
    if (!button.textContent.includes(text)) return;
    button.onclick = null;
    button.addEventListener('click', (event) => { event.preventDefault(); handler().catch((error) => showError(error.message)); });
  });
}

function bindActions() {
  bindAction('#screen-ui-2 button', 'CREAR SALA', createRoom);
  bindAction('#screen-ui-3 button', 'ENTRAR A LA SALA', joinRoom);
  bindAction('#screen-ui-4 button', 'COMENZAR PARTIDA', startGame);
  bindAction('#screen-ui-7 button', 'ENVIAR RESPUESTA', submitAnswer);
  bindAction('#screen-ui-8 button', 'EDITAR RESPUESTA', async () => {
    if (state.room?.status !== 'QUESTION') throw new Error('La ronda ya terminó.');
    window.switchScreen('ui-7');
    if ($('#answer-input')) $('#answer-input').value = state.ownAnswer;
  });
  bindAction('#screen-ui-10 button', 'SIGUIENTE SHIT TEST', nextQuestion);
  bindAction('#screen-ui-11 button', 'JUGAR OTRA VEZ', resetRoom);
  bindAction('#screen-ui-11 button', 'CREAR NUEVA SALA', deleteRoom);
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
  bindSettingButtons('[data-round-options]', 'rounds', [5, 10, 15, 20], '[data-round-summary]', (value) => `${value} RONDAS`);
}

function bindSettingButtons(containerSelector, key, allowed, summarySelector, formatter) {
  document.querySelectorAll(`${containerSelector} button`).forEach((button) => {
    const value = Number.parseInt(button.textContent, 10);
    if (!allowed.includes(value)) return;
    button.addEventListener('click', () => {
      state.settings[key] = value;
      document.querySelectorAll(`${containerSelector} button`).forEach((item) => {
        item.classList.remove('bg-gradient-to-r', 'from-arena-pink', 'to-arena-orange', 'bg-arena-cardborder', 'text-white', 'font-bold', 'shadow-sm', 'border', 'border-arena-pink/50');
        item.classList.add('text-gray-400');
      });
      button.classList.remove('text-gray-400');
      button.classList.add('bg-gradient-to-r', 'from-arena-pink', 'to-arena-orange', 'text-white', 'font-bold');
      const summary = $(summarySelector);
      if (summary) summary.textContent = formatter(value);
    });
  });
  if (key === 'duration') {
    document.querySelector(`${containerSelector} button:last-child`)?.addEventListener('click', () => {
      const value = Number.parseInt(window.prompt('Segundos por respuesta (5–120):', String(state.settings.duration)) || '', 10);
      if (!Number.isInteger(value) || value < 5 || value > 120) return showError('El tiempo debe estar entre 5 y 120 segundos.');
      state.settings.duration = value;
      const summary = $(summarySelector);
      if (summary) summary.textContent = formatter(value);
    });
  }
}

async function recoverSession() {
  const saved = JSON.parse(localStorage.getItem('arenaSession') || 'null');
  if (!saved?.roomId) return;
  try {
    const room = (await get(ref(database, `rooms/${saved.roomId}`))).val();
    const player = (await get(ref(database, `roomPlayers/${saved.roomId}/${state.uid}`))).val();
    if (!room || !player) return localStorage.removeItem('arenaSession');
    await enterSession(saved.roomId, saved.code);
  } catch { localStorage.removeItem('arenaSession'); }
}

window.addEventListener('DOMContentLoaded', async () => {
  retireLegacyFlutterCache().catch(() => {});
  bindActions();
  await ensureUser();
  const routeCode = cleanCode(window.location.pathname.match(/^\/room\/([^/]+)/)?.[1] || '');
  if (routeCode.length === 5 && $('#join-code')) {
    $('#join-code').value = routeCode;
    window.switchScreen('ui-3');
    await previewRoom(routeCode);
    const saved = JSON.parse(localStorage.getItem('arenaSession') || 'null');
    if (saved?.code === routeCode) await recoverSession();
    return;
  }
  await recoverSession();
});
onValue(ref(database, '.info/serverTimeOffset'), (snapshot) => { state.serverOffset = Number(snapshot.val() || 0); });
onValue(ref(database, '.info/connected'), async (snapshot) => {
  $('#reconnect-banner')?.classList.toggle('hidden', snapshot.val() === true);
  if (snapshot.val() === true && state.roomId && state.uid) {
    await set(ref(database, `roomPlayers/${state.roomId}/${state.uid}/connected`), true);
    await onDisconnect(ref(database, `roomPlayers/${state.roomId}/${state.uid}/connected`)).set(false);
  }
});
