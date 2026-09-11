const STORAGE_KEY = 'arenaPlayerProfile';
const ASSET_BASE = '/assets/player';

export const PROFILE_OPTIONS = {
  avatars: [
    { id: 'avatar_01', label: 'Rayo', src: `${ASSET_BASE}/avatars/avatar_01.png` },
    { id: 'avatar_02', label: 'Fuego', src: `${ASSET_BASE}/avatars/avatar_02.png` },
    { id: 'avatar_03', label: 'Sombra', src: `${ASSET_BASE}/avatars/avatar_03.png` },
    { id: 'avatar_04', label: 'Neón', src: `${ASSET_BASE}/avatars/avatar_04.png` },
    { id: 'avatar_05', label: 'Rebelde', src: `${ASSET_BASE}/avatars/avatar_05.png` },
    { id: 'avatar_06', label: 'Arena', src: `${ASSET_BASE}/avatars/avatar_06.png` }
  ],
  colors: ['#ff1a75', '#f97316', '#fbbf24', '#10b981', '#38bdf8', '#a855f7'],
  frames: [
    { id: 'clean', label: 'Clean', className: 'border-arena-cardborder' },
    { id: 'pink', label: 'Pink glow', className: 'border-arena-pink shadow-glow-pink' },
    { id: 'gold', label: 'Gold rank', className: 'border-arena-gold shadow-[0_0_20px_rgba(251,191,36,0.2)]' },
    { id: 'orange', label: 'Orange heat', className: 'border-arena-orange shadow-glow-orange' }
  ],
  titles: [
    { id: 'rookie', label: 'Novato', badge: `${ASSET_BASE}/ranks/rank_01.png` },
    { id: 'calibrado', label: 'Calibrado', badge: `${ASSET_BASE}/ranks/rank_02.png` },
    { id: 'firme', label: 'Firme', badge: `${ASSET_BASE}/ranks/rank_03.png` },
    { id: 'arena', label: 'Arena King', badge: `${ASSET_BASE}/ranks/rank_04.png` }
  ],
  effects: [
    { id: 'none', label: 'Sin efecto' },
    { id: 'spark', label: 'Chispa', src: `${ASSET_BASE}/effects/effect_01.png` },
    { id: 'smoke', label: 'Humo', src: `${ASSET_BASE}/effects/effect_02.png` },
    { id: 'impact', label: 'Impacto', src: `${ASSET_BASE}/effects/effect_03.png` },
    { id: 'flash', label: 'Flash', src: `${ASSET_BASE}/effects/effect_04.png` }
  ],
  reactions: [
    { id: 'r1', label: '🔥', src: `${ASSET_BASE}/reactions/reaction_01.png` },
    { id: 'r2', label: '⚡', src: `${ASSET_BASE}/reactions/reaction_02.png` },
    { id: 'r3', label: '💀', src: `${ASSET_BASE}/reactions/reaction_03.png` },
    { id: 'r4', label: '👑', src: `${ASSET_BASE}/reactions/reaction_04.png` }
  ]
};

const DEFAULT_PROFILE = {
  nickname: '',
  avatar: PROFILE_OPTIONS.avatars[0].id,
  color: PROFILE_OPTIONS.colors[0],
  frame: PROFILE_OPTIONS.frames[1].id,
  title: PROFILE_OPTIONS.titles[0].id,
  effect: PROFILE_OPTIONS.effects[1].id,
  reactions: ['r1', 'r2', 'r3']
};

const byId = (items, id) => items.find((item) => item.id === id) || items[0];
const safeText = (value = '') => String(value).trim().slice(0, 20);

export function getProfileAsset(profile = getPlayerProfile()) {
  return {
    avatar: byId(PROFILE_OPTIONS.avatars, profile.avatar),
    frame: byId(PROFILE_OPTIONS.frames, profile.frame),
    title: byId(PROFILE_OPTIONS.titles, profile.title),
    effect: byId(PROFILE_OPTIONS.effects, profile.effect),
    reactions: PROFILE_OPTIONS.reactions.filter((reaction) => profile.reactions?.includes(reaction.id)).slice(0, 3)
  };
}

export function getPlayerProfile() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
    return sanitizeProfile({ ...DEFAULT_PROFILE, ...saved });
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

export function hasCompleteProfile(profile = getPlayerProfile()) {
  return Boolean(safeText(profile.nickname));
}

export function sanitizeProfile(profile) {
  const avatarIds = new Set(PROFILE_OPTIONS.avatars.map((item) => item.id));
  const frameIds = new Set(PROFILE_OPTIONS.frames.map((item) => item.id));
  const titleIds = new Set(PROFILE_OPTIONS.titles.map((item) => item.id));
  const effectIds = new Set(PROFILE_OPTIONS.effects.map((item) => item.id));
  const reactionIds = new Set(PROFILE_OPTIONS.reactions.map((item) => item.id));
  return {
    nickname: safeText(profile.nickname),
    avatar: avatarIds.has(profile.avatar) ? profile.avatar : DEFAULT_PROFILE.avatar,
    color: PROFILE_OPTIONS.colors.includes(profile.color) ? profile.color : DEFAULT_PROFILE.color,
    frame: frameIds.has(profile.frame) ? profile.frame : DEFAULT_PROFILE.frame,
    title: titleIds.has(profile.title) ? profile.title : DEFAULT_PROFILE.title,
    effect: effectIds.has(profile.effect) ? profile.effect : DEFAULT_PROFILE.effect,
    reactions: [...new Set(Array.isArray(profile.reactions) ? profile.reactions : DEFAULT_PROFILE.reactions)]
      .filter((id) => reactionIds.has(id))
      .slice(0, 3)
  };
}

export function savePlayerProfile(profile) {
  const next = sanitizeProfile(profile);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new CustomEvent('arena-profile-updated', { detail: next }));
  return next;
}

export function randomPlayerProfile(current = getPlayerProfile()) {
  const pick = (items) => items[Math.floor(Math.random() * items.length)];
  const shuffledReactions = [...PROFILE_OPTIONS.reactions].sort(() => Math.random() - 0.5).slice(0, 3).map((item) => item.id);
  return sanitizeProfile({
    ...current,
    avatar: pick(PROFILE_OPTIONS.avatars).id,
    color: pick(PROFILE_OPTIONS.colors),
    frame: pick(PROFILE_OPTIONS.frames).id,
    title: pick(PROFILE_OPTIONS.titles).id,
    effect: pick(PROFILE_OPTIONS.effects).id,
    reactions: shuffledReactions
  });
}

export function profileForRoom(profile = getPlayerProfile()) {
  const safe = sanitizeProfile(profile);
  const assets = getProfileAsset(safe);
  return {
    nickname: safe.nickname,
    avatar: safe.avatar,
    avatarUrl: assets.avatar.src,
    color: safe.color,
    frame: safe.frame,
    title: safe.title,
    titleLabel: assets.title.label,
    effect: safe.effect,
    reactions: safe.reactions
  };
}
