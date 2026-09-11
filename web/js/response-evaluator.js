const STOPWORDS = new Set([
  'que', 'con', 'para', 'por', 'una', 'uno', 'los', 'las', 'del', 'pero', 'como', 'soy', 'eres', 'estoy', 'esta', 'este',
  'eso', 'esa', 'ese', 'tengo', 'tienes', 'muy', 'mas', 'más', 'bien', 'mal', 'solo', 'sólo', 'todo', 'nada', 'aqui',
  'aquí', 'porque', 'cuando', 'donde', 'dónde', 'quien', 'quién'
]);

const POSITIVE_PATTERNS = [
  /\b(depende|tal vez|puede ser|quiz[aá]s|solo si|s[oó]lo si)\b/i,
  /\b(jaja|ja ja|xd|broma|juego|jugando)\b/i,
  /\b(tranquil[ao]|relax|calma|sin drama|normal)\b/i,
  /\b(me gusta|interesante|buena pregunta|te doy|vamos)\b/i,
  /\?/
];

const DEFENSIVE_PATTERNS = [
  /\b(no soy|no fui|no hice|te juro|cr[eé]eme|en serio|perd[oó]n|lo siento|disc[uú]lpame)\b/i,
  /\b(por favor|necesito|te necesito|hazme caso|dame una oportunidad)\b/i
];

const AGGRESSIVE_PATTERNS = [
  /\b(puta|zorra|imb[eé]cil|idiota|est[uú]pida|c[aá]llate|asco|basura)\b/i,
  /\b(oblig|tienes que|debes|si no vas a|si no quieres)\b/i
];

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokens(value = '') {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function overlapScore(answer, reference) {
  const answerTokens = new Set(tokens(answer));
  const referenceTokens = new Set(tokens(reference));
  if (!answerTokens.size || !referenceTokens.size) return 0;
  let overlap = 0;
  answerTokens.forEach((token) => {
    if (referenceTokens.has(token)) overlap += 1;
  });
  return Math.min(18, Math.round((overlap / Math.min(answerTokens.size, referenceTokens.size)) * 18));
}

function patternScore(answer, patterns, points) {
  return patterns.reduce((total, pattern) => total + (pattern.test(answer) ? points : 0), 0);
}

function lengthAdjustment(answer) {
  const length = answer.trim().length;
  if (length < 4) return -34;
  if (length < 12) return -14;
  if (length > 260) return -16;
  if (length > 190) return -8;
  return 0;
}

function repetitionPenalty(answer) {
  const normalized = normalize(answer);
  if (/(.)\1{5,}/.test(normalized)) return -20;
  const words = normalized.split(' ').filter(Boolean);
  if (words.length >= 6 && new Set(words).size <= Math.ceil(words.length / 3)) return -18;
  return 0;
}

export function getCurrentRoomQuestion(room) {
  const index = Math.max(0, Number(room?.currentQuestion || 1) - 1);
  return room?.questionSet?.[index] || room?.questions?.[index] || null;
}

export function recommendedAnswerForRoom(room) {
  const question = getCurrentRoomQuestion(room);
  return question?.recommendedAnswer || question?.answer || 'Respuesta recomendada pendiente de cargar.';
}

export function evaluateAnswer(answer = '', question = {}) {
  const clean = String(answer || '').trim();
  if (!clean) {
    return { score: 1, label: 'Sin respuesta', feedback: 'No se puede evaluar una respuesta vacía.' };
  }

  const reference = [question.recommendedAnswer, question.technique, question.text].filter(Boolean).join(' ');
  let score = 46;
  score += overlapScore(clean, reference);
  score += patternScore(clean, POSITIVE_PATTERNS, 7);
  score -= patternScore(clean, DEFENSIVE_PATTERNS, 9);
  score -= patternScore(clean, AGGRESSIVE_PATTERNS, 18);
  score += lengthAdjustment(clean);
  score += repetitionPenalty(clean);

  const uniqueTokens = new Set(tokens(clean));
  if (uniqueTokens.size >= 4) score += 8;
  if (uniqueTokens.size >= 8) score += 5;

  score = Math.max(1, Math.min(100, Math.round(score)));

  let label = 'Debe mejorar';
  let feedback = 'La respuesta todavía suena poco calibrada o demasiado débil.';
  if (score >= 82) {
    label = 'Muy buena';
    feedback = 'Buena mezcla de calma, marco propio y respuesta breve.';
  } else if (score >= 65) {
    label = 'Buena';
    feedback = 'Funciona, aunque puede tener más humor o menos explicación.';
  } else if (score >= 45) {
    label = 'Regular';
    feedback = 'Tiene una idea usable, pero falta seguridad, juego o precisión.';
  }

  return { score, label, feedback };
}
