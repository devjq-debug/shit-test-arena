const STOPWORDS = new Set([
  'que', 'con', 'para', 'por', 'una', 'uno', 'los', 'las', 'del', 'pero', 'como', 'soy', 'eres', 'estoy', 'esta', 'este',
  'eso', 'esa', 'ese', 'tengo', 'tienes', 'muy', 'mas', 'más', 'bien', 'mal', 'solo', 'sólo', 'todo', 'nada', 'aqui',
  'aquí', 'porque', 'cuando', 'donde', 'dónde', 'quien', 'quién', 'hay', 'sin', 'mis', 'tus', 'sus', 'voy', 'vas',
  'me', 'te', 'se', 'lo', 'la', 'el', 'de', 'en', 'y', 'o', 'un', 'al', 'si', 'sí', 'no'
]);

const TECHNIQUE_LIBRARY = [
  { id: 'cambio-presion', label: 'Cambio de presión', description: 'Devuelve la evaluación a la otra persona sin sonar defensivo.', hints: ['cambio de presion', 'cambio de presión', 'devuelve', 'presion', 'presión', 'interrogatorio', 'modales'], patterns: [/\b(y t[uú]|mira qui[eé]n|tus modales|eso dices|vienes fuerte|interrogatorio|me estas evaluando|me est[aá]s evaluando|auditarme|auditor[ií]a)\b/i, /\b(te toca|ahora t[uú]|esa pregunta dice m[aá]s|solo con las que preguntan|solo con las que hacen|solo si la pregunta|solo si viene|solo cuando)\b/i] },
  { id: 'malinterpretar', label: 'Malinterpretación', description: 'Lee la frase desde una intención favorable o lúdica.', hints: ['malinterpretar', 'reinterpretar', 'lectura favorable', 'a favor', 'doble sentido'], patterns: [/\b(te gusto|te parezco|me est[aá]s coqueteando|atractivo|irresistible|eso son[oó] a halago|lo tomar[eé] como halago)\b/i, /\b(asi empiezan|as[ií] empiezan|ya me estas|ya me est[aá]s|que directa)\b/i] },
  { id: 'amplificar', label: 'Aceptar y amplificar', description: 'Acepta parcialmente la premisa y la lleva al absurdo para quitarle fuerza.', hints: ['amplificar', 'exageracion', 'exageración', 'absurdo', 'aceptar y amplificar'], patterns: [/\b(obvio|claramente|desde siempre|demasiado|mil|millones|nivel|doctorado|presidente|clasificado|secreto|estad[ií]sticas|informe)\b/i, /\b(tengo un equipo|manual|protocolo|ministerio|laboratorio|tesis|ranking mundial)\b/i] },
  { id: 'desviar', label: 'Desvío', description: 'No responde literalmente y conduce la conversación hacia otro marco.', hints: ['desviar', 'indirecto', 'no justificarse', 'misterio', 'cambiar tema'], patterns: [/\b(depende|puede ser|quiz[aá]s|eso es confidencial|no puedo revelar|larga historia|hablamos de eso luego)\b/i, /\b(mejor dime|eso lo vemos|vamos paso a paso|primero lo importante)\b/i] },
  { id: 'descualificacion', label: 'Descualificación controlada', description: 'Deja de demostrar valor y mete una incompatibilidad o defecto juguetón.', hints: ['descualificacion', 'descualificación', 'no necesidad', 'defecto', 'incompatibilidad'], patterns: [/\b(no soy para todo el mundo|tengo mis defectos|soy p[eé]simo|mal candidato|red flag|terrible opci[oó]n)\b/i, /\b(te aviso|bajo tus expectativas|no prometo|no califico)\b/i] },
  { id: 'humor', label: 'Humor absurdo', description: 'Introduce ligereza o una imagen absurda sin atacar.', hints: ['humor', 'absurdo', 'broma', 'juego', 'ligereza'], patterns: [/\b(jaja|ja ja|xd|broma|cripto|nuclear|sem[aá]foro|fantasma|extraterrestre|agenda|excel|powerpoint|auditor[ií]a)\b/i, /\b(tomate|tribunal|juicio|multiverso|drag[oó]n|wifi)\b/i] },
  { id: 'limites', label: 'Límite calibrado', description: 'Marca distancia o se retira cuando bromear no conviene.', hints: ['limites', 'límites', 'no perseguir', 'retirarse', 'contextual', 'respeto'], patterns: [/\b(todo bien|sin problema|lo respeto|tranquil[ao]|no pasa nada|me retiro|cu[ií]date|cuidate)\b/i, /\b(no va por ah[ií]|prefiero no|hasta aqu[ií]|si te incomoda)\b/i] }
];

const DEFENSIVE_PATTERNS = [/\b(no soy|no fui|no hice|yo no|te juro|cr[eé]eme|en serio|de verdad|te prometo|perd[oó]n|lo siento|disc[uú]lpame)\b/i, /\b(d[eé]jame explicar|dejame explicar|puedo explicarte|no me malinterpretes|no quise|no era mi intenci[oó]n)\b/i, /\b(porque yo|porque soy|es que yo|lo que pasa es|para que veas|si me conocieras)\b/i];
const NEEDY_PATTERNS = [/\b(porfa|por favor|resp[oó]ndeme|no me ignores|te necesito|dame bola|dame una oportunidad|hazme caso)\b/i, /\b(soy diferente|yo si valgo|yo s[ií] valgo|valgo la pena|te voy a demostrar|quiero impresionarte)\b/i];
const AGGRESSIVE_PATTERNS = [/\b(puta|zorra|imb[eé]cil|idiota|est[uú]pida|c[aá]llate|asco|basura|perra)\b/i, /\b(oblig|tienes que|debes|si no vas a|si no quieres|te callas)\b/i];
const STATUS_BRAG_PATTERNS = [/\b(soy guapo|soy atractivo|soy atractiva|soy rico|tengo plata|tengo dinero|soy famoso|tengo carro|tengo coche|soy alfa|alto valor)\b/i, /\b(todas quieren|todas caen|me sobran|puedo tener a cualquiera|s[eé] hablar con mujeres)\b/i];
const LITERAL_YES_NO_PATTERNS = [/^(s[ií]|claro|obvio|no|nunca|para nada|tal vez|quiz[aá]s)[\s.!?]*$/i, /^(s[ií]|no),?\s+(claro|obvio|soy|no soy|porque)/i, /^(puede ser|depende|ok|vale|ya|aj[aá])[\s.!?]*$/i];
const AGE_QUESTION_PATTERNS = [/\b(cuantos anos|cuantos años|edad|que edad|qué edad|anos tienes|años tienes)\b/i];
const LITERAL_FACT_PATTERNS = [/^\d{1,2}\s*(a[nñ]os)?$/i, /^\d{1,2}[,.]\d{1,2}$/, /^soy\s+(ingenier[oa]|doctor[ao]|abogad[oa]|arquitect[oa]|estudiante|empresari[oa]|programador[a]?|diseñador[a]?)$/i, /^trabajo\s+(en|como)\s+[\p{L}\s]{3,40}$/iu];
const CALM_PATTERNS = [/\b(tranquil[ao]|relax|calma|normal|sin drama|todo bien|relaj[ao]|suave)\b/i];
const PLAYFUL_PATTERNS = [/\b(jaja|ja ja|xd|guiño|broma|juego|informe|estad[ií]sticas|secreto|confidencial|tribunal|auditor[ií]a)\b/i];
const QUESTION_PATTERNS = [/\?/];

function normalize(value = '') {
  return String(value).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
}

function tokenize(value = '') {
  return normalize(value).split(' ').filter((token) => token.length > 2 && !STOPWORDS.has(token));
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
  const references = [question.recommendedAnswer, question.answer, ...(Array.isArray(question.referenceAnswers) ? question.referenceAnswers : [])].filter(Boolean);
  return references.reduce((best, reference) => Math.max(best, lexicalSimilarity(answer, reference)), 0);
}

function requestedTechnique(question = {}) {
  const raw = normalize(`${question.technique || ''} ${question.text || ''} ${question.recommendedAnswer || ''}`);
  return TECHNIQUE_LIBRARY.find((technique) => technique.hints.some((hint) => raw.includes(normalize(hint)))) || null;
}

function isAgeQuestion(question = {}) {
  const raw = normalize(question.text || '');
  return AGE_QUESTION_PATTERNS.some((pattern) => pattern.test(raw));
}

function hasSemanticOverlap(answer = '', question = {}) {
  const answerTokens = new Set(tokenize(answer));
  const questionTokens = tokenize(question.text || '');
  if (!answerTokens.size || !questionTokens.length) return true;
  return questionTokens.some((token) => answerTokens.has(token));
}

function sinTecnica() {
  return { id: 'sin_tecnica', label: 'SIN_TECNICA', description: 'No contiene una técnica conversacional reconocible.', hits: 0 };
}

function classifyPrecheck(answer = '', question = {}) {
  const clean = String(answer || '').trim();
  const normalized = normalize(clean);
  const literalYesNo = countMatches(clean, LITERAL_YES_NO_PATTERNS) > 0;
  const literalFact = countMatches(clean, LITERAL_FACT_PATTERNS) > 0;
  const ageLiteral = isAgeQuestion(question) && /^\d{1,2}\s*(anos|años)?$/.test(normalized);
  const justification = countMatches(clean, DEFENSIVE_PATTERNS) > 0;
  const validationSeeking = countMatches(clean, NEEDY_PATTERNS) > 0 || countMatches(clean, STATUS_BRAG_PATTERNS) > 0;
  const insultMatches = countMatches(clean, AGGRESSIVE_PATTERNS);
  const hasReframeShape = TECHNIQUE_LIBRARY.some((technique) => countMatches(clean, technique.patterns) > 0) || countMatches(clean, PLAYFUL_PATTERNS) > 0 || countMatches(clean, QUESTION_PATTERNS) > 0;
  const pureInsult = insultMatches > 0 && !hasReframeShape;
  const semanticOverlap = hasSemanticOverlap(clean, question);
  const irrelevant = !semanticOverlap && !hasReframeShape && clean.length > 0 && !literalYesNo && !literalFact;
  const literalAnswer = literalYesNo || ageLiteral || (literalFact && !hasReframeShape);
  const emotionalReaction = pureInsult || justification || insultMatches > 0;
  const acceptedFrame = literalAnswer || justification || validationSeeking || pureInsult;
  const flags = { literal_answer: literalAnswer, pure_insult: pureInsult, justification, validation_seeking: validationSeeking, irrelevant, emotional_reaction: emotionalReaction, accepted_frame: acceptedFrame, semantic_overlap: semanticOverlap };
  const caps = [];
  if (irrelevant) caps.push({ reason: 'irrelevant', cap: 15 });
  if (pureInsult) caps.push({ reason: 'pure_insult', cap: 20 });
  if (literalAnswer) caps.push({ reason: 'literal_answer', cap: 30 });
  if (justification) caps.push({ reason: 'justification', cap: 35 });
  if (validationSeeking) caps.push({ reason: 'validation_seeking', cap: 35 });
  return { flags, hardCap: caps.reduce((min, item) => Math.min(min, item.cap), 100), capReasons: caps };
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
  const precheck = classifyPrecheck(clean, question);
  if (precheck.flags.literal_answer || precheck.flags.pure_insult || precheck.flags.irrelevant) return sinTecnica();
  const expected = requestedTechnique(question);
  const scored = TECHNIQUE_LIBRARY.map((technique) => ({ ...technique, hits: countMatches(clean, technique.patterns) })).sort((a, b) => b.hits - a.hits);
  if (scored[0]?.hits > 0) return scored[0];
  if (expected && !countMatches(clean, DEFENSIVE_PATTERNS) && !countMatches(clean, NEEDY_PATTERNS) && !countMatches(clean, STATUS_BRAG_PATTERNS) && !countMatches(clean, LITERAL_YES_NO_PATTERNS)) {
    return { ...expected, hits: 0.5 };
  }
  return sinTecnica();
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
      score: 1, rawScore: 1, hardCap: 1, capReasons: [{ reason: 'empty_answer', cap: 1 }],
      flags: { literal_answer: false, pure_insult: false, justification: false, validation_seeking: false, irrelevant: true, emotional_reaction: false, accepted_frame: true, semantic_overlap: false },
      label: 'Sin respuesta', feedback: 'No se puede evaluar una respuesta vacía.', technique: 'SIN_TECNICA',
      techniqueFit: 1, creativity: 1, naturality: 1, calibration: 1, frameControl: 1,
      frame: 'Sin respuesta', questionFrame: inferQuestionFrame(question), pressureMove: 'No hubo movimiento conversacional.',
      fellIntoFrame: true, soughtApproval: false, justified: false, copiedReference: false,
      whatWorked: 'Nada todavía: no hay material para analizar.', whatFailed: 'No respondió dentro del marco de práctica.', improvement: 'Escribe una respuesta breve que no busque aprobación.'
    };
  }

  const precheck = classifyPrecheck(clean, question);
  const expected = requestedTechnique(question);
  let detected = detectTechnique(clean, question);
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
  if (precheck.flags.literal_answer || precheck.flags.pure_insult || precheck.flags.irrelevant || (precheck.flags.accepted_frame && detected.hits < 1)) detected = sinTecnica();
  const hasTechnique = detected.id !== 'sin_tecnica' && detected.hits >= 1;
  const copiedReference = similarity > 0.78;
  const artificial = clean.length > 230 || /(.)\1{5,}/.test(normalized) || /[!?]{3,}/.test(clean);
  const tooShort = clean.length < 8 || wordCount < 2;
  const tooLong = clean.length > 190 || wordCount > 30;
  const fellIntoFrame = Boolean(precheck.flags.accepted_frame || defensive || needy || aggressive || bragging || literal);

  let frameControlPoints = fellIntoFrame ? 9 : 22;
  if (hasTechnique) frameControlPoints += 7;
  if (calm) frameControlPoints += 3;
  if (playful) frameControlPoints += 3;
  if (usesQuestion && !defensive) frameControlPoints += 2;
  if (precheck.flags.literal_answer) frameControlPoints -= 7;
  if (precheck.flags.justification) frameControlPoints -= 5;
  if (precheck.flags.validation_seeking) frameControlPoints -= 5;
  if (precheck.flags.pure_insult) frameControlPoints -= 8;
  if (precheck.flags.irrelevant) frameControlPoints -= 9;
  if (aggressive && !precheck.flags.pure_insult) frameControlPoints -= 5;
  if (bragging) frameControlPoints -= 4;
  frameControlPoints = clamp(frameControlPoints, 1, 35);

  let techniquePoints = hasTechnique ? 17 : 3;
  if (detected.id === expected?.id && hasTechnique) techniquePoints = 22;
  if (!expected && hasTechnique) techniquePoints = 18;
  if (detected.id === 'limites' && /limite|l[ií]mite|respeto|incomoda|retir/.test(normalize(`${question.technique || ''} ${question.text || ''}`))) techniquePoints += 2;
  if (defensive || needy) techniquePoints -= 5;
  if (aggressive) techniquePoints -= 7;
  if (bragging) techniquePoints -= 4;
  if (precheck.flags.literal_answer) techniquePoints -= 3;
  if (copiedReference) techniquePoints -= 2;
  techniquePoints = clamp(techniquePoints, 1, 25);

  let naturalityPoints = 9 + (clean.length <= 130 ? 2 : 0) + (calm ? 1 : 0) + (playful ? 1 : 0);
  if (tooLong) naturalityPoints -= 4;
  if (tooShort) naturalityPoints -= 4;
  if (artificial) naturalityPoints -= 4;
  if (aggressive) naturalityPoints -= 5;
  if (needy || defensive) naturalityPoints -= 3;
  if (precheck.flags.irrelevant) naturalityPoints -= 4;
  naturalityPoints = clamp(naturalityPoints, 1, 15);

  let creativityPoints = 6 + (hasTechnique ? 3 : 0) + (playful ? 3 : 0) + (usesQuestion ? 1 : 0);
  creativityPoints += Math.min(2, Math.max(0, wordCount - 3));
  if (copiedReference) creativityPoints -= 5;
  if (tooShort) creativityPoints -= 4;
  if (tooLong) creativityPoints -= 3;
  if (precheck.flags.literal_answer || precheck.flags.irrelevant) creativityPoints -= 4;
  if (normalized.split(' ').length !== new Set(normalized.split(' ')).size && wordCount > 8) creativityPoints -= 1;
  creativityPoints = clamp(creativityPoints, 1, 15);

  let calibrationPoints = 6;
  if (!aggressive && !needy) calibrationPoints += 1;
  if (detected.id === 'limites') calibrationPoints += 1;
  if (playful && !aggressive) calibrationPoints += 1;
  if (aggressive) calibrationPoints -= 5;
  if (bragging) calibrationPoints -= 3;
  if (precheck.flags.literal_answer) calibrationPoints -= 2;
  if (defensive || needy) calibrationPoints -= 2;
  if (tooLong) calibrationPoints -= 1;
  if (/sexual|sexo|cama|desnuda|desnudo/i.test(clean) && !/sexual|intimidad|coqueteo/i.test(question.text || '')) calibrationPoints -= 3;
  calibrationPoints = clamp(calibrationPoints, 1, 10);

  const capReasons = [...precheck.capReasons];
  if (detected.id === 'desviar' && wordCount <= 3 && !playful && !usesQuestion) capReasons.push({ reason: 'weak_evasion', cap: 58 });
  if (frameControlPoints < 10) capReasons.push({ reason: 'low_frame_control', cap: 49 });
  if (detected.id === 'sin_tecnica' && precheck.flags.accepted_frame) capReasons.push({ reason: 'sin_tecnica_accepted_frame', cap: 35 });
  const hardCap = capReasons.reduce((min, item) => Math.min(min, item.cap), precheck.hardCap);
  let rawScore = frameControlPoints + techniquePoints + naturalityPoints + creativityPoints + calibrationPoints;
  if (hasTechnique && !fellIntoFrame && (playful || usesQuestion) && wordCount >= 5) rawScore += 8;
  if (hasTechnique && !fellIntoFrame && detected.id === expected?.id && wordCount >= 6) rawScore += 4;
  const score = clamp(Math.min(rawScore, hardCap));
  const frameControl = clamp((frameControlPoints / 35) * 100);
  const techniqueFit = clamp((techniquePoints / 25) * 100);
  const naturality = clamp((naturalityPoints / 15) * 100);
  const creativity = clamp((creativityPoints / 15) * 100);
  const calibration = clamp((calibrationPoints / 10) * 100);

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
    return 'No hubo técnica conversacional reconocible.';
  })();

  const whatWorked = [];
  if (!fellIntoFrame) whatWorked.push('no se defendió de forma automática');
  if (hasTechnique) whatWorked.push(`aplicó ${detected.label.toLowerCase()}`);
  if (calm) whatWorked.push('transmitió calma');
  if (playful) whatWorked.push('metió juego o ligereza');
  if (!whatWorked.length) whatWorked.push('hay intención de responder, pero todavía sin control claro del marco');

  const whatFailed = [];
  if (precheck.flags.literal_answer) whatFailed.push('respondió literal sin reencuadre');
  if (precheck.flags.justification) whatFailed.push('se justificó');
  if (precheck.flags.validation_seeking) whatFailed.push('buscó validación o aprobación');
  if (precheck.flags.pure_insult) whatFailed.push('confundió respuesta fuerte con insulto directo');
  if (precheck.flags.irrelevant) whatFailed.push('respondió fuera del marco de la pregunta');
  if (bragging && !precheck.flags.validation_seeking) whatFailed.push('intentó demostrar valor/status');
  if (aggressive && !precheck.flags.pure_insult) whatFailed.push('subió agresividad sin calibración');
  if (copiedReference) whatFailed.push('copió demasiado la referencia y perdió creatividad');
  if (tooLong) whatFailed.push('se extendió más de lo necesario');
  if (artificial && !tooLong) whatFailed.push('sonó poco natural');
  if (!whatFailed.length) whatFailed.push('puede afinar brevedad, timing y naturalidad');

  let improvement = 'Hazla más breve, natural y con un reencuadre claro.';
  if (expected && detected.id !== expected.id && score < 75) improvement = `Prueba aplicar ${expected.label.toLowerCase()}: ${expected.description}`;
  if (defensive || needy) improvement = 'No expliques tu valor: responde desde calma y cambia la presión.';
  if (bragging) improvement = 'No intentes validarte con estatus; convierte la acusación en juego o absurdo.';
  if (aggressive) improvement = 'Baja agresividad: dominio del marco no es insultar ni imponer.';
  if (precheck.flags.literal_answer) improvement = 'Evita el sí/no o dato directo; reinterpreta, amplifica o devuelve la evaluación.';
  if (precheck.flags.irrelevant) improvement = 'Responde al marco de la pregunta; si esquivas, que sea con intención conversacional clara.';
  if (copiedReference) improvement = 'Conserva la lógica de la referencia, pero dilo con tus propias palabras.';
  if (tooLong) improvement = 'Recorta explicación: una línea hablable suele tener más fuerza.';

  const feedback = [
    `Marco detectado: ${inferQuestionFrame(question)}`,
    `Técnica detectada: ${detected.label.toLowerCase()}.`,
    `Movimiento de presión: ${pressureMove}`,
    fellIntoFrame ? 'Diagnóstico: cayó en el marco.' : 'Diagnóstico: sostuvo o recuperó el marco.',
    hardCap < 100 ? `Límite aplicado: máximo ${hardCap} por ${capReasons.map((item) => item.reason).join(', ')}.` : '',
    copiedReference ? 'La frase se parece demasiado a una referencia; se reconoce la técnica, pero baja creatividad.' : ''
  ].filter(Boolean).join(' ');

  return {
    score,
    rawScore: clamp(rawScore),
    hardCap,
    capReasons,
    flags: precheck.flags,
    scoringBreakdown: { frameControlPoints, techniquePoints, naturalityPoints, creativityPoints, calibrationPoints },
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
    soughtApproval: Boolean(needy || precheck.flags.validation_seeking),
    justified: Boolean(defensive || precheck.flags.justification),
    copiedReference,
    whatWorked: `Funcionó: ${whatWorked.join(', ')}.`,
    whatFailed: `Falló: ${whatFailed.join(', ')}.`,
    improvement
  };
}
