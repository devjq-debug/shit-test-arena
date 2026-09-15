const STOPWORDS = new Set([
  'que', 'con', 'para', 'por', 'una', 'uno', 'los', 'las', 'del', 'pero', 'como', 'soy', 'eres', 'estoy', 'esta', 'este',
  'eso', 'esa', 'ese', 'tengo', 'tienes', 'muy', 'mas', 'más', 'bien', 'mal', 'solo', 'sólo', 'todo', 'nada', 'aqui',
  'aquí', 'porque', 'cuando', 'donde', 'dónde', 'quien', 'quién', 'hay', 'sin', 'mis', 'tus', 'sus', 'voy', 'vas',
  'me', 'te', 'se', 'lo', 'la', 'el', 'de', 'en', 'y', 'o', 'un', 'al', 'si', 'sí', 'no'
]);

const TECHNIQUE_LIBRARY = [
  {
    id: 'cambio-presion',
    label: 'Cambio de presión',
    description: 'Devuelve la evaluación a la otra persona sin sonar defensivo.',
    hints: ['cambio de presion', 'cambio de presión', 'devuelve', 'presion', 'presión', 'interrogatorio', 'modales'],
    patterns: [
      /\b(y t[uú]|mira qui[eé]n|tus modales|eso dices|vienes fuerte|interrogatorio|me estas evaluando|me est[aá]s evaluando)\b/i,
      /\b(te toca|ahora t[uú]|esa pregunta dice m[aá]s de ti|solo con las que preguntan|solo con las que hacen)\b/i
    ]
  },
  {
    id: 'malinterpretar',
    label: 'Malinterpretación',
    description: 'Lee la frase desde una intención favorable o lúdica.',
    hints: ['malinterpretar', 'reinterpretar', 'lectura favorable', 'a favor', 'doble sentido'],
    patterns: [
      /\b(te gusto|te parezco|me est[aá]s coqueteando|atractivo|irresistible|eso son[oó] a halago|lo tomar[eé] como halago)\b/i,
      /\b(asi empiezan|as[ií] empiezan|ya me estas|ya me est[aá]s|que directa)\b/i
    ]
  },
  {
    id: 'amplificar',
    label: 'Aceptar y amplificar',
    description: 'Acepta parcialmente la premisa y la lleva al absurdo para quitarle fuerza.',
    hints: ['amplificar', 'exageracion', 'exageración', 'absurdo', 'aceptar y amplificar'],
    patterns: [
      /\b(obvio|claramente|desde siempre|demasiado|mil|millones|nivel|doctorado|presidente|clasificado|secreto|estad[ií]sticas|informe)\b/i,
      /\b(tengo un equipo|manual|protocolo|ministerio|laboratorio|tesis|ranking mundial)\b/i
    ]
  },
  {
    id: 'desviar',
    label: 'Desvío',
    description: 'No responde literalmente y conduce la conversación hacia otro marco.',
    hints: ['desviar', 'indirecto', 'no justificarse', 'misterio', 'cambiar tema'],
    patterns: [
      /\b(depende|puede ser|quiz[aá]s|eso es confidencial|no puedo revelar|larga historia|hablamos de eso luego)\b/i,
      /\b(mejor dime|eso lo vemos|vamos paso a paso|primero lo importante)\b/i
    ]
  },
  {
    id: 'descualificacion',
    label: 'Descualificación controlada',
    description: 'Deja de demostrar valor y mete una incompatibilidad o defecto juguetón.',
    hints: ['descualificacion', 'descualificación', 'no necesidad', 'defecto', 'incompatibilidad'],
    patterns: [
      /\b(no soy para todo el mundo|tengo mis defectos|soy p[eé]simo|mal candidato|red flag|terrible opci[oó]n)\b/i,
      /\b(te aviso|bajo tus expectativas|no prometo|no califico)\b/i
    ]
  },
  {
    id: 'humor',
    label: 'Humor absurdo',
    description: 'Introduce ligereza o una imagen absurda sin atacar.',
    hints: ['humor', 'absurdo', 'broma', 'juego', 'ligereza'],
    patterns: [
      /\b(jaja|ja ja|xd|broma|cripto|nuclear|sem[aá]foro|fantasma|extraterrestre|agenda|excel|powerpoint|auditor[ií]a)\b/i,
      /\b(tomate|tribunal|juicio|multiverso|drag[oó]n|wifi)\b/i
    ]
  },
  {
    id: 'limites',
    label: 'Límite calibrado',
    description: 'Marca distancia o se retira cuando bromear no conviene.',
    hints: ['limites', 'límites', 'no perseguir', 'retirarse', 'contextual', 'respeto'],
    patterns: [
      /\b(todo bien|sin problema|lo respeto|tranquil[ao]|no pasa nada|me retiro|cu[ií]date|cuidate)\b/i,
      /\b(no va por ah[ií]|prefiero no|hasta aqu[ií]|si te incomoda)\b/i
    ]
  }
];

const DEFENSIVE_PATTERNS = [
  /\b(no soy|no fui|no hice|yo no|te juro|cr[eé]eme|en serio|de verdad|te prometo|perd[oó]n|lo siento|disc[uú]lpame)\b/i,
  /\b(d[eé]jame explicar|dejame explicar|puedo explicarte|no me malinterpretes|no quise|no era mi intenci[oó]n)\b/i,
  /\b(porque yo|es que yo|lo que pasa es|para que veas|si me conocieras)\b/i
];

const NEEDY_PATTERNS = [
  /\b(porfa|por favor|dime|resp[oó]ndeme|no me ignores|te necesito|dame bola|dame una oportunidad|hazme caso)\b/i,
  /\b(soy diferente|yo si valgo|yo s[ií] valgo|valgo la pena|te voy a demostrar|quiero impresionarte)\b/i
];

const AGGRESSIVE_PATTERNS = [
  /\b(puta|zorra|imb[eé]cil|idiota|est[uú]pida|c[aá]llate|asco|basura|perra)\b/i,
  /\b(oblig|tienes que|debes|si no vas a|si no quieres|te callas)\b/i
];

const STATUS_BRAG_PATTERNS = [
  /\b(soy guapo|soy rico|tengo plata|tengo dinero|soy famoso|tengo carro|tengo coche|soy alfa|alto valor)\b/i,
  /\b(todas quieren|todas caen|me sobran|puedo tener a cualquiera)\b/i
];

const LITERAL_YES_NO_PATTERNS = [
  /^(s[ií]|claro|obvio|no|nunca|para nada|tal vez|quiz[aá]s)[\s.!?]*$/i,
  /^(s[ií]|no),?\s+(claro|obvio|soy|no soy|porque)/i
];

const CALM_PATTERNS = [/\b(tranquil[ao]|relax|calma|normal|sin drama|todo bien|relaj[ao]|suave)\b/i];
const PLAYFUL_PATTERNS = [/\b(jaja|ja ja|xd|guiño|broma|juego|informe|estad[ií]sticas|secreto|confidencial|tribunal|auditor[ií]a)\b/i];
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

function bestReferenceSimilarity(answer, question = {}) {
  const references = [
    question.recommendedAnswer,
    question.answer,
    ...(Array.isArray(question.referenceAnswers) ? question.referenceAnswers : [])
  ].filter(Boolean);
  return references.reduce((best, reference) => Math.max(best, lexicalSimilarity(answer, reference)), 0);
}

function requestedTechnique(question = {}) {
  const raw = normalize(`${question.technique || ''} ${question.text || ''} ${question.recommendedAnswer || ''}`);
  return TECHNIQUE_LIBRARY.find((technique) => technique.hints.some((hint) => raw.includes(normalize(hint)))) || null;
}

function inferQuestionFrame(question = {}) {
  const text = normalize(question.text || '');
  if (/(funciona|todas|siempre|ligas|coqueteas|usas)/.test(text)) return 'Te evalúan como alguien que usa una táctica o intenta impresionar.';
  if (/(guapo|bonito|atractivo|dinero|estatus|trabajo|auto|coche)/.test(text)) return 'Te empujan a demostrar valor o estatus.';
  if (/(serio|formal|novia|compromiso|solo quieres|jugador)/.test(text)) return 'Te ponen a defender intención, compromiso o reputación.';
  if (/(atreves|miedo|cobarde|puedes|capaz)/.test(text)) return 'Te intentan mover por reto o presión de ego.';
  if (/(vulgar|raro|intenso|creido|creído|pesado)/.test(text)) return 'Te etiquetan para ver si reaccionas o te justificas.';
  return 'La otra persona coloca una evaluación implícita y observa si aceptas defenderte.';
}

export function detectTechnique(answer = '', question = {}) {
  const clean = String(answer || '');
  const expected = requestedTechnique(question);
  const scored = TECHNIQUE_LIBRARY.map((technique) => ({
    ...technique,
    hits: countMatches(clean, technique.patterns)
  })).sort((a, b) => b.hits - a.hits);
  if (scored[0]?.hits > 0) return scored[0];
  if (expected && !countMatches(clean, DEFENSIVE_PATTERNS) && !countMatches(clean, NEEDY_PATTERNS) && !countMatches(clean, STATUS_BRAG_PATTERNS) && !countMatches(clean, LITERAL_YES_NO_PATTERNS)) {
    return { ...expected, hits: 0.5 };
  }
  return { id: 'directa', label: 'Respuesta directa', description: 'Contesta la premisa casi literalmente.', hits: 0 };
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
  const normalized = normalize(clean);
  if (!clean) {
    return {
      score: 1,
      label: 'Sin respuesta',
      feedback: 'No se puede evaluar una respuesta vacía.',
      technique: 'Sin técnica',
      techniqueFit: 1,
      creativity: 1,
      naturality: 1,
      calibration: 1,
      frameControl: 1,
      frame: 'Sin respuesta',
      questionFrame: inferQuestionFrame(question),
      pressureMove: 'No hubo movimiento conversacional.',
      fellIntoFrame: true,
      soughtApproval: false,
      justified: false,
      copiedReference: false,
      whatWorked: 'Nada todavía: no hay material para analizar.',
      whatFailed: 'No respondió dentro del marco de práctica.',
      improvement: 'Escribe una respuesta breve que no busque aprobación.'
    };
  }

  const expected = requestedTechnique(question);
  const detected = detectTechnique(clean, question);
  const similarity = bestReferenceSimilarity(clean, question);
  const tokens = tokenize(clean);
  const wordCount = tokens.length;
  const defensive = countMatches(clean, DEFENSIVE_PATTERNS);
  const needy = countMatches(clean, NEEDY_PATTERNS);
  const aggressive = countMatches(clean, AGGRESSIVE_PATTERNS);
  const bragging = countMatches(clean, STATUS_BRAG_PATTERNS);
  const literal = countMatches(clean, LITERAL_YES_NO_PATTERNS);
  const calm = countMatches(clean, CALM_PATTERNS);
  const playful = countMatches(clean, PLAYFUL_PATTERNS);
  const usesQuestion = countMatches(clean, QUESTION_PATTERNS);
  const hasTechnique = detected.id !== 'directa' && detected.hits >= 1;
  const copiedReference = similarity > 0.78;
  const artificial = clean.length > 230 || /(.)\1{5,}/.test(normalized) || /[!?]{3,}/.test(clean);
  const tooShort = clean.length < 8 || wordCount < 2;
  const tooLong = clean.length > 190 || wordCount > 30;
  const fellIntoFrame = Boolean(defensive || needy || aggressive || bragging || literal);

  let frameControl = fellIntoFrame ? 30 : 68;
  if (hasTechnique) frameControl += 14;
  if (calm) frameControl += 8;
  if (playful) frameControl += 8;
  if (usesQuestion && !defensive) frameControl += 5;
  if (aggressive) frameControl -= 22;
  if (bragging) frameControl -= 18;
  if (literal) frameControl -= 16;

  let techniqueFit = detected.id === expected?.id && hasTechnique ? 88 : hasTechnique ? 72 : 36;
  if (!expected && hasTechnique) techniqueFit = 76;
  if (detected.id === 'limites' && /limite|l[ií]mite|respeto|incomoda|retir/.test(normalize(`${question.technique || ''} ${question.text || ''}`))) techniqueFit += 10;
  if (defensive || needy) techniqueFit -= 18;
  if (aggressive) techniqueFit -= 26;
  if (bragging) techniqueFit -= 16;
  if (literal) techniqueFit -= 12;
  if (copiedReference) techniqueFit -= 6;

  let creativity = 48 + (hasTechnique ? 12 : 0) + (playful ? 16 : 0) + (usesQuestion ? 5 : 0);
  creativity += Math.min(14, Math.max(0, wordCount - 3) * 2);
  if (copiedReference) creativity -= 34;
  if (tooShort) creativity -= 18;
  if (tooLong) creativity -= 10;
  if (normalized.split(' ').length !== new Set(normalized.split(' ')).size && wordCount > 8) creativity -= 5;

  let naturality = 62 + (clean.length <= 130 ? 12 : 0) + (calm ? 8 : 0) + (playful ? 5 : 0);
  if (tooLong) naturality -= 18;
  if (tooShort) naturality -= 12;
  if (artificial) naturality -= 18;
  if (aggressive) naturality -= 24;
  if (needy || defensive) naturality -= 12;

  let calibration = 60;
  if (!aggressive && !needy) calibration += 12;
  if (detected.id === 'limites') calibration += 6;
  if (playful && !aggressive) calibration += 8;
  if (aggressive) calibration -= 30;
  if (bragging) calibration -= 14;
  if (literal) calibration -= 10;
  if (defensive || needy) calibration -= 10;
  if (tooLong) calibration -= 8;
  if (/sexual|sexo|cama|desnuda|desnudo/i.test(clean) && !/sexual|intimidad|coqueteo/i.test(question.text || '')) calibration -= 18;

  frameControl = clamp(frameControl);
  techniqueFit = clamp(techniqueFit);
  creativity = clamp(creativity);
  naturality = clamp(naturality);
  calibration = clamp(calibration);

  let rawScore =
    frameControl * 0.30 +
    techniqueFit * 0.24 +
    naturality * 0.20 +
    calibration * 0.16 +
    creativity * 0.10;
  if (defensive && needy) rawScore -= 10;
  if (bragging && literal) rawScore -= 8;
  if (aggressive) rawScore -= 10;
  const score = clamp(rawScore);

  let label = 'Debe mejorar';
  if (score >= 86) label = 'Muy buena';
  else if (score >= 70) label = 'Buena';
  else if (score >= 52) label = 'Regular';

  const pressureMove = (() => {
    if (detected.id === 'cambio-presion') return 'Devolvió la evaluación hacia la otra persona.';
    if (detected.id === 'malinterpretar') return 'Transformó la presión en una lectura favorable o coqueta.';
    if (detected.id === 'amplificar') return 'Aceptó la premisa y la volvió absurda para desactivarla.';
    if (detected.id === 'desviar') return 'No compró la premisa literal y movió la conversación.';
    if (detected.id === 'descualificacion') return 'Dejó de demostrar valor y mostró no necesidad.';
    if (detected.id === 'limites') return 'Marcó distancia o respeto sin perseguir aprobación.';
    if (fellIntoFrame) return 'La presión siguió encima del jugador.';
    return 'Resistió parcialmente la presión, aunque faltó una técnica más clara.';
  })();

  const whatWorked = [];
  if (!fellIntoFrame) whatWorked.push('no se defendió de forma automática');
  if (hasTechnique) whatWorked.push(`aplicó ${detected.label.toLowerCase()}`);
  if (calm) whatWorked.push('transmitió calma');
  if (playful) whatWorked.push('metió juego o ligereza');
  if (!whatWorked.length) whatWorked.push('hay intención de responder, pero todavía sin control claro del marco');

  const whatFailed = [];
  if (defensive) whatFailed.push('empezó a justificarse');
  if (needy) whatFailed.push('buscó validación o aprobación');
  if (bragging) whatFailed.push('intentó demostrar valor/status');
  if (aggressive) whatFailed.push('confundió fuerza con agresividad');
  if (literal) whatFailed.push('respondió demasiado literal');
  if (copiedReference) whatFailed.push('copió demasiado la referencia y perdió creatividad');
  if (tooLong) whatFailed.push('se extendió más de lo necesario');
  if (artificial && !tooLong) whatFailed.push('sonó poco natural');
  if (!whatFailed.length) whatFailed.push('puede afinar brevedad, timing y naturalidad');

  let improvement = 'Hazla más breve, natural y con un reencuadre claro.';
  if (expected && detected.id !== expected.id && score < 75) improvement = `Prueba aplicar ${expected.label.toLowerCase()}: ${expected.description}`;
  if (defensive || needy) improvement = 'No expliques tu valor: responde desde calma y cambia la presión.';
  if (bragging) improvement = 'No intentes validarte con estatus; convierte la acusación en juego o absurdo.';
  if (aggressive) improvement = 'Baja agresividad: dominio del marco no es insultar ni imponer.';
  if (literal) improvement = 'Evita el sí/no directo; reinterpreta, amplifica o devuelve la evaluación.';
  if (copiedReference) improvement = 'Conserva la lógica de la referencia, pero dilo con tus propias palabras.';
  if (tooLong) improvement = 'Recorta explicación: una línea hablable suele tener más fuerza.';

  const feedback = [
    `Marco detectado: ${inferQuestionFrame(question)}`,
    `Técnica detectada: ${detected.label.toLowerCase()}.`,
    `Movimiento de presión: ${pressureMove}`,
    fellIntoFrame ? 'Diagnóstico: cayó en el marco.' : 'Diagnóstico: sostuvo o recuperó el marco.',
    copiedReference ? 'La frase se parece demasiado a una referencia; se reconoce la técnica, pero baja creatividad.' : ''
  ].filter(Boolean).join(' ');

  return {
    score,
    label,
    feedback,
    technique: detected.label,
    techniqueFit,
    creativity,
    naturality,
    calibration,
    frameControl,
    frame: fellIntoFrame ? 'Cayó en el marco' : 'Sostuvo marco',
    questionFrame: inferQuestionFrame(question),
    pressureMove,
    fellIntoFrame,
    soughtApproval: Boolean(needy),
    justified: Boolean(defensive),
    copiedReference,
    whatWorked: `Funcionó: ${whatWorked.join(', ')}.`,
    whatFailed: `Falló: ${whatFailed.join(', ')}.`,
    improvement
  };
}
