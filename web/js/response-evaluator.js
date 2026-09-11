const STOPWORDS = new Set([
  'que', 'con', 'para', 'por', 'una', 'uno', 'los', 'las', 'del', 'pero', 'como', 'soy', 'eres', 'estoy', 'esta', 'este',
  'eso', 'esa', 'ese', 'tengo', 'tienes', 'muy', 'mas', 'más', 'bien', 'mal', 'solo', 'sólo', 'todo', 'nada', 'aqui',
  'aquí', 'porque', 'cuando', 'donde', 'dónde', 'quien', 'quién', 'hay', 'sin', 'mis', 'tus', 'sus', 'voy', 'vas'
]);

const TECHNIQUE_LIBRARY = [
  {
    id: 'cambio-presion',
    label: 'Cambio de presión',
    hints: ['cambio de presión', 'devuelve', 'crítica', 'modales', 'presión'],
    patterns: [/\b(y t[uú]|mira qui[eé]n|tus modales|eso dices|vienes fuerte)\b/i, /\bdevuelv[eo]|te toca|ahora t[uú]\b/i]
  },
  {
    id: 'malinterpretar',
    label: 'Malinterpretar a favor',
    hints: ['malinterpretar', 'reinterpret', 'atractivo', 'señal', 'favor'],
    patterns: [/\b(te gusto|te parezco|me est[aá]s coqueteando|atractivo|irresistible|eso son[oó] a halago)\b/i]
  },
  {
    id: 'amplificar',
    label: 'Amplificar',
    hints: ['amplificar', 'exageración', 'absurda', 'historia inventada'],
    patterns: [/\b(obvio|desde siempre|demasiado|mil|millones|nivel|doctorado|presidente|clasificado|secreto)\b/i]
  },
  {
    id: 'desviar',
    label: 'Desviar',
    hints: ['desviar', 'indirecto', 'no justificarse', 'misterio'],
    patterns: [/\b(depende|puede ser|quiz[aá]s|eso es confidencial|no puedo revelar|larga historia)\b/i]
  },
  {
    id: 'humor',
    label: 'Humor absurdo',
    hints: ['absurdo', 'ilógico', 'broma', 'juego'],
    patterns: [/\b(jaja|ja ja|xd|broma|cripto|nuclear|sem[aá]foro|fantasma|extraterrestre|agenda)\b/i]
  },
  {
    id: 'limites',
    label: 'Límites',
    hints: ['límites', 'no perseguir', 'retirarse', 'contextual'],
    patterns: [/\b(todo bien|sin problema|lo respeto|tranquila|no pasa nada|me retiro|cuídate|cuidate)\b/i]
  }
];

const DEFENSIVE_PATTERNS = [
  /\b(no soy|no fui|no hice|te juro|cr[eé]eme|en serio|perd[oó]n|lo siento|disc[uú]lpame)\b/i,
  /\b(por favor|necesito|te necesito|hazme caso|dame una oportunidad|expl[ií]came)\b/i
];

const AGGRESSIVE_PATTERNS = [
  /\b(puta|zorra|imb[eé]cil|idiota|est[uú]pida|c[aá]llate|asco|basura)\b/i,
  /\b(oblig|tienes que|debes|si no vas a|si no quieres)\b/i
];

const NEEDY_PATTERNS = [/\b(porfa|por favor|dime|resp[oó]ndeme|no me ignores|te necesito|dame bola)\b/i];
const CALM_PATTERNS = [/\b(tranquil[ao]|relax|calma|normal|sin drama|todo bien|relaj[ao])\b/i];
const QUESTION_PATTERNS = [/\?/];

function normalize(value = '') {
  return String(value)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenize(value = '') {
  return normalize(value)
    .split(' ')
    .filter((token) => token.length > 2 && !STOPWORDS.has(token));
}

function clamp(value, min = 1, max = 100) {
  return Math.max(min, Math.min(max, Math.round(value)));
}

function countMatches(answer, patterns) {
  return patterns.reduce((total, pattern) => total + (pattern.test(answer) ? 1 : 0), 0);
}

function lexicalSimilarity(answer, reference) {
  const answerTokens = new Set(tokenize(answer));
  const referenceTokens = new Set(tokenize(reference));
  if (!answerTokens.size || !referenceTokens.size) return 0;
  let overlap = 0;
  answerTokens.forEach((token) => {
    if (referenceTokens.has(token)) overlap += 1;
  });
  return overlap / Math.max(answerTokens.size, referenceTokens.size);
}

function requestedTechnique(question = {}) {
  const raw = normalize(`${question.technique || ''} ${question.text || ''}`);
  return TECHNIQUE_LIBRARY.find((technique) => technique.hints.some((hint) => raw.includes(normalize(hint)))) || null;
}

export function detectTechnique(answer = '', question = {}) {
  const clean = String(answer || '');
  const scored = TECHNIQUE_LIBRARY.map((technique) => ({
    ...technique,
    hits: countMatches(clean, technique.patterns) + technique.hints.filter((hint) => normalize(question.technique || '').includes(normalize(hint))).length
  })).sort((a, b) => b.hits - a.hits);
  return scored[0]?.hits > 0 ? scored[0] : { id: 'directa', label: 'Respuesta directa', hits: 0 };
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
    return {
      score: 1,
      label: 'Sin respuesta',
      feedback: 'No se puede evaluar una respuesta vacía.',
      technique: 'Sin técnica',
      techniqueFit: 1,
      creativity: 1,
      naturality: 1,
      frame: 'Sin respuesta',
      fellIntoFrame: true,
      improvement: 'Escribe una respuesta breve que no busque aprobación.'
    };
  }

  const expected = requestedTechnique(question);
  const detected = detectTechnique(clean, question);
  const similarity = lexicalSimilarity(clean, question.recommendedAnswer || '');
  const wordCount = tokenize(clean).length;
  const defensive = countMatches(clean, DEFENSIVE_PATTERNS);
  const aggressive = countMatches(clean, AGGRESSIVE_PATTERNS);
  const needy = countMatches(clean, NEEDY_PATTERNS);
  const calm = countMatches(clean, CALM_PATTERNS);
  const usesQuestion = countMatches(clean, QUESTION_PATTERNS);
  const hasHumor = detected.id === 'humor' || /\b(jaja|ja ja|xd|broma)\b/i.test(clean);

  let techniqueFit = detected.id === expected?.id ? 86 : detected.hits ? 68 : 45;
  if (!expected && detected.hits) techniqueFit = 72;
  if (defensive || needy) techniqueFit -= 18;
  if (aggressive) techniqueFit -= 28;
  if (similarity > 0.78) techniqueFit -= 20;

  let creativity = 45 + Math.min(25, wordCount * 3) + (hasHumor ? 14 : 0) + (usesQuestion ? 7 : 0) + (detected.hits ? 8 : 0);
  if (similarity > 0.78) creativity -= 30;
  if (clean.length > 230) creativity -= 12;
  if (clean.length < 12) creativity -= 20;

  let naturality = 62 + (calm ? 10 : 0) + (clean.length <= 140 ? 8 : 0) - defensive * 14 - needy * 16 - aggressive * 30;
  if (clean.length > 220) naturality -= 12;
  if (/(.)\1{5,}/.test(normalize(clean))) naturality -= 25;

  const fellIntoFrame = Boolean(defensive || needy || aggressive);
  let frameScore = fellIntoFrame ? 38 : 74;
  if (calm || hasHumor || detected.hits) frameScore += 10;
  if (similarity > 0.78) frameScore -= 8;

  techniqueFit = clamp(techniqueFit);
  creativity = clamp(creativity);
  naturality = clamp(naturality);
  frameScore = clamp(frameScore);
  const score = clamp(techniqueFit * 0.34 + creativity * 0.24 + naturality * 0.24 + frameScore * 0.18);

  let label = 'Debe mejorar';
  if (score >= 84) label = 'Muy buena';
  else if (score >= 68) label = 'Buena';
  else if (score >= 50) label = 'Regular';

  const feedbackParts = [];
  feedbackParts.push(`Detecté ${detected.label.toLowerCase()}.`);
  if (expected && detected.id !== expected.id) feedbackParts.push(`La lógica pedida iba más por ${expected.label.toLowerCase()}.`);
  if (similarity > 0.78) feedbackParts.push('Se parece demasiado a la referencia; suma menos por copiar.');
  if (fellIntoFrame) feedbackParts.push('Cayó en el marco por justificarse, perseguir aprobación o atacar.');
  else feedbackParts.push('No cae fuerte en el marco y conserva control.');
  if (hasHumor) feedbackParts.push('El humor ayuda a bajar presión.');
  if (clean.length > 190) feedbackParts.push('Recorta: una respuesta más corta suele sonar más natural.');

  let improvement = 'Hazla más breve, juguetona y con menos explicación.';
  if (expected && detected.id !== expected.id) improvement = `Prueba aplicar ${expected.label.toLowerCase()} sin copiar la frase de referencia.`;
  if (aggressive) improvement = 'Baja agresividad: una respuesta fuerte no necesita insultar.';
  if (defensive || needy) improvement = 'Evita justificarte o pedir aprobación; responde desde calma.';
  if (similarity > 0.78) improvement = 'Cambia las palabras y conserva solo la lógica.';

  return {
    score,
    label,
    feedback: feedbackParts.join(' '),
    technique: detected.label,
    techniqueFit,
    creativity,
    naturality,
    frame: fellIntoFrame ? 'Cayó en el marco' : 'Sostuvo marco',
    fellIntoFrame,
    improvement
  };
}
