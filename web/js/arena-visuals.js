const rankForScore = (score = 0) => {
  if (score >= 900) return 'MAESTRO DEL MARCO';
  if (score >= 650) return 'EXPERTO';
  if (score >= 420) return 'RÁPIDO';
  if (score >= 220) return 'CALIBRADO';
  if (score >= 90) return 'IMPROVISADOR';
  return 'NOVATO';
};

const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const safeColor = (value, fallback = '#ff1a75') => /^#[0-9a-f]{6}$/i.test(String(value || '')) ? value : fallback;

let lastScreen = '';
let lastWinner = '';
let lastPunishedKey = '';

export function initArenaVisuals() {
  document.body.classList.add('arena-premium');
  window.addEventListener('arena-beat', (event) => {
    document.body.classList.toggle('beat-strong', Boolean(event.detail?.strong));
    window.setTimeout(() => document.body.classList.remove('beat-strong'), 160);
  });
}

export function setArenaScene(screenId = '') {
  if (screenId === lastScreen) return;
  lastScreen = screenId;
  const scene = ({
    'ui-1': 'home',
    'ui-2': 'setup',
    'ui-3': 'setup',
    'ui-4': 'lobby',
    'ui-5': 'lobby',
    'ui-6': 'countdown',
    'ui-7': 'question',
    'ui-8': 'question',
    'ui-9': 'question',
    'ui-10': 'reveal',
    'ui-11': 'final'
  })[screenId] || 'home';
  document.body.dataset.arenaScene = scene;
}

export function renderCharacterStages({ players = {}, currentUid = '', hostUid = '' } = {}) {
  const entries = Object.entries(players).slice(0, 8);
  document.querySelectorAll('[data-character-stage]').forEach((stage) => {
    stage.innerHTML = entries.map(([uid, player], index) => {
      const avatar = player.avatarUrl || '/assets/player/avatars/avatar_01.png';
      const accent = safeColor(player.color, player.isHost ? '#ff1a75' : '#f97316');
      const ready = player.connected ? 'LISTO' : 'OFF';
      const title = player.titleLabel || rankForScore(player.score || 0);
      const host = uid === hostUid || player.isHost;
      return `<article class="arena-character ${uid === currentUid ? 'is-you' : ''} ${host ? 'is-host' : ''}" style="--accent:${accent};--delay:${index * 90}ms">
        <div class="arena-character__halo"></div>
        <img src="${escapeHtml(avatar)}" alt="" class="arena-character__sprite"/>
        <div class="arena-character__shadow"></div>
        <div class="arena-character__tag">
          <strong>${escapeHtml(player.nickname || 'Jugador')}</strong>
          <span>${escapeHtml(title)} · ${ready}</span>
        </div>
      </article>`;
    }).join('') || '<div class="rounded-xl border border-arena-cardborder bg-black/30 p-4 text-center text-xs text-gray-400">La arena espera jugadores...</div>';
  });
}

export function showWinnerSequence(player, votes = 0) {
  if (!player) return;
  const key = `${player.nickname}-${player.score}-${votes}`;
  if (key === lastWinner) return;
  lastWinner = key;
  const overlay = document.querySelector('[data-arena-event-overlay]');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="arena-event arena-event--winner">
      <div class="arena-confetti"></div>
      <div class="arena-event__copy">
        <span>GANADOR DE LA RONDA</span>
        <h2>${escapeHtml(player.nickname || 'Jugador')}</h2>
        <p>${escapeHtml(player.titleLabel || rankForScore(player.score || 0))} · ${votes} votos · +MVP</p>
      </div>
      <img src="${escapeHtml(player.avatarUrl || '/assets/player/avatars/avatar_01.png')}" alt="" class="arena-event__character"/>
      <button type="button" data-close-arena-event>Siguiente</button>
    </div>`;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  window.setTimeout(() => overlay.classList.add('is-fading'), 3200);
  window.setTimeout(hideArenaEvent, 3900);
}

export function showPunishedSequence(player, reason = 'Respuesta demasiado directa o justificativa.') {
  if (!player) return;
  const key = `${player.nickname}-${reason}`;
  if (key === lastPunishedKey) return;
  lastPunishedKey = key;
  const overlay = document.querySelector('[data-arena-event-overlay]');
  if (!overlay) return;
  overlay.innerHTML = `
    <div class="arena-event arena-event--punished">
      <div class="tomato tomato-a">🍅</div><div class="tomato tomato-b">🍅</div><div class="tomato tomato-c">🍅</div>
      <div class="arena-event__copy">
        <span>CAÍSTE EN EL MARCO</span>
        <h2>${escapeHtml(player.nickname || 'Jugador')}</h2>
        <p>${escapeHtml(reason)}</p>
      </div>
      <img src="${escapeHtml(player.avatarUrl || '/assets/player/avatars/avatar_01.png')}" alt="" class="arena-event__character"/>
      <button type="button" data-close-arena-event>Continuar</button>
    </div>`;
  overlay.classList.remove('hidden');
  overlay.classList.add('flex');
  window.setTimeout(() => overlay.classList.add('is-fading'), 3000);
  window.setTimeout(hideArenaEvent, 3600);
}

export function hideArenaEvent() {
  const overlay = document.querySelector('[data-arena-event-overlay]');
  if (!overlay) return;
  overlay.classList.add('hidden');
  overlay.classList.remove('flex', 'is-fading');
  overlay.innerHTML = '';
}

export function renderFinalPodium(players = []) {
  const podium = document.querySelector('[data-final-podium]');
  if (!podium) return;
  const sorted = [...players].sort((a, b) => (b.score || 0) - (a.score || 0)).slice(0, 3);
  podium.innerHTML = sorted.map((player, index) => {
    const places = ['1', '2', '3'];
    return `<div class="podium-player podium-${places[index]}">
      <img src="${escapeHtml(player.avatarUrl || '/assets/player/avatars/avatar_01.png')}" alt=""/>
      <strong>${index === 0 ? '👑 ' : ''}${escapeHtml(player.nickname || 'Jugador')}</strong>
      <span>${player.score || 0} PTS</span>
    </div>`;
  }).join('');
}
