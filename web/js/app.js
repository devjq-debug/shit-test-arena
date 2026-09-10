import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-app.js';
import { getAuth, signInAnonymously, onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-auth.js';
import { getDatabase, ref, set, update, get, onValue, onDisconnect, push, remove, runTransaction } from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-database.js';

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
const state = { uid: null, roomId: null, room: null, questionNumber: 1, unsubscribe: null };
const QUESTIONS = [
  'Seguro eres así con todas.', 'Tienes cara de que te crees demasiado.',
  'Pensé que eras más divertido.', '¿Siempre necesitas llamar la atención?',
  'A ver, sorpréndeme.', '¿Qué te hace pensar que tenemos química?',
  'No pareces alguien fácil de sorprender.', '¿Qué estás evitando decir?'
];

const $ = (selector) => document.querySelector(selector);
const cleanCode = (value) => value.replace(/\s/g, '').toUpperCase();
const showError = (message) => {
  const box = $('#join-status-error');
  if (box) { box.classList.remove('hidden'); box.classList.add('flex'); box.querySelector('div div:nth-child(2)')?.replaceChildren(document.createTextNode(message)); }
};
const setRoomLabels = (room) => document.querySelectorAll('body').forEach((body) => {
  body.innerHTML = body.innerHTML.replaceAll('K7P4Q', room.code).replaceAll('Jeanpiere', room.hostName || 'HOST');
});

async function ensureUser() {
  if (auth.currentUser) return auth.currentUser;
  return (await signInAnonymously(auth)).user;
}

async function claimRoomCode(code, roomId) {
  const result = await runTransaction(ref(database, `roomCodes/${code}`), (current) => current ?? roomId);
  return result.committed && result.snapshot.val() === roomId;
}

async function createRoom() {
  const user = await ensureUser();
  const nickname = ($('#host-nick')?.value || '').trim();
  if (!nickname) return showError('Escribe un nickname antes de crear la sala.');
  const roomId = push(ref(database, 'rooms')).key;
  let code = '';
  let claimed = false;
  for (let attempt = 0; attempt < 5 && !claimed; attempt += 1) {
    code = Array.from({ length: 5 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');
    claimed = await claimRoomCode(code, roomId);
  }
  if (!claimed) throw new Error('No se pudo reservar un código único. Inténtalo otra vez.');
  const now = { '.sv': 'timestamp' };
  const room = { hostUid: user.uid, hostName: nickname, code, status: 'LOBBY', currentQuestion: 0, questionStartedAt: 0, questionDuration: 10, createdAt: now, players: { [user.uid]: { nickname, score: 0, connected: true, joinedAt: now, isHost: true } } };
  try {
    await set(ref(database, `rooms/${roomId}`), room);
    await onDisconnect(ref(database, `rooms/${roomId}/players/${user.uid}/connected`)).set(false);
    state.roomId = roomId;
    subscribeRoom(roomId);
    window.switchScreen('ui-4');
  } catch (error) { await remove(ref(database, `roomCodes/${code}`)); throw error; }
}

async function joinRoom() {
  const user = await ensureUser();
  const code = cleanCode($('#join-code')?.value || '');
  const nickname = ($('#join-nick')?.value || '').trim();
  if (code.length !== 5 || !nickname) return showError('Introduce un código válido y tu nickname.');
  const codeSnapshot = await get(ref(database, `roomCodes/${code}`));
  if (!codeSnapshot.exists()) return showError('Sala no encontrada o ya cerrada.');
  const roomId = codeSnapshot.val();
  const roomSnapshot = await get(ref(database, `rooms/${roomId}`));
  const room = roomSnapshot.val();
  if (!room || room.status !== 'LOBBY') return showError('La sala ya comenzó o expiró.');
  await set(ref(database, `rooms/${roomId}/players/${user.uid}`), { nickname, score: 0, connected: true, joinedAt: { '.sv': 'timestamp' }, isHost: false });
  await onDisconnect(ref(database, `rooms/${roomId}/players/${user.uid}/connected`)).set(false);
  state.roomId = roomId;
  subscribeRoom(roomId);
  window.switchScreen('ui-5');
}

function subscribeRoom(roomId) {
  state.unsubscribe?.();
  state.unsubscribe = onValue(ref(database, `rooms/${roomId}`), (snapshot) => {
    state.room = snapshot.val();
    if (!state.room) return window.switchScreen('ui-14');
    setRoomLabels(state.room);
    const status = state.room.status;
    if (status === 'COUNTDOWN') window.switchScreen('ui-6');
    if (status === 'QUESTION') window.switchScreen('ui-7');
    if (status === 'QUESTION_RESULTS') window.switchScreen('ui-10');
    if (status === 'LEADERBOARD') window.switchScreen('ui-11');
    if (status === 'FINISHED') window.switchScreen('ui-14');
    updatePlayers(state.room.players || {});
    if (status === 'QUESTION') startTimer(state.room.questionStartedAt, state.room.questionDuration);
  });
}

function updatePlayers(players) {
  document.querySelectorAll('[data-player-list]').forEach((list) => {
    list.innerHTML = Object.values(players).map((player) => `<div class="flex items-center justify-between bg-arena-dark/70 p-3 rounded-xl border border-arena-cardborder/50"><span class="font-bold text-sm">${escapeHtml(player.nickname)}</span><span class="text-[10px] font-mono ${player.connected ? 'text-emerald-400' : 'text-gray-500'}">${player.connected ? 'CONECTADO' : 'AUSENTE'}</span></div>`).join('');
  });
}

function startTimer(startedAt, duration) {
  const tick = () => {
    const remaining = Math.max(0, duration - Math.floor((Date.now() - startedAt) / 1000));
    const timer = $('#timer-number');
    if (timer) timer.textContent = String(remaining).padStart(2, '0');
  };
  clearInterval(state.timer); tick(); state.timer = setInterval(tick, 250);
}

function escapeHtml(value) { return value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char])); }

async function startGame() {
  if (!state.roomId || state.room?.hostUid !== state.uid) return;
  const startedAt = Date.now();
  await update(ref(database, `rooms/${state.roomId}`), { status: 'COUNTDOWN', currentQuestion: 0, questionStartedAt: startedAt });
  setTimeout(async () => { if (state.room?.hostUid === state.uid) await update(ref(database, `rooms/${state.roomId}`), { status: 'QUESTION', currentQuestion: 1, questionText: QUESTIONS[0], questionStartedAt: Date.now() }); }, 3000);
}

async function submitAnswer() {
  const answer = ($('#answer-input')?.value || '').trim();
  if (!answer || !state.roomId || !state.uid) return;
  await set(ref(database, `rooms/${state.roomId}/answers/${state.room.currentQuestion}/${state.uid}`), { answer, answeredAt: { '.sv': 'timestamp' } });
  window.switchScreen('ui-8');
}

function bindActions() {
  document.querySelectorAll('#screen-ui-2 button').forEach((button) => { if (button.textContent.includes('CREAR SALA')) { button.onclick = null; button.addEventListener('click', (event) => { event.preventDefault(); createRoom().catch((error) => showError(error.message)); }); } });
  document.querySelectorAll('#screen-ui-3 button').forEach((button) => { if (button.textContent.includes('ENTRAR A LA SALA')) { button.onclick = null; button.addEventListener('click', (event) => { event.preventDefault(); joinRoom().catch((error) => showError(error.message)); }); } });
  document.querySelectorAll('button').forEach((button) => { if (button.textContent.includes('COMENZAR PARTIDA')) { button.onclick = null; button.addEventListener('click', (event) => { event.preventDefault(); startGame().catch((error) => showError(error.message)); }); } });
  document.querySelectorAll('button').forEach((button) => { if (button.textContent.includes('ENVIAR RESPUESTA')) { button.onclick = null; button.addEventListener('click', (event) => { event.preventDefault(); submitAnswer().catch((error) => showError(error.message)); }); } });
}

onAuthStateChanged(auth, (user) => { state.uid = user?.uid || null; });
onValue(ref(database, '.info/connected'), (snapshot) => { $('#reconnect-banner')?.classList.toggle('hidden', snapshot.val() === true); });
ensureUser().catch((error) => console.error('[FIREBASE AUTH]', error));
window.addEventListener('DOMContentLoaded', bindActions);
