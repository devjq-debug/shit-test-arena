import assert from 'node:assert/strict';
import { evaluateAnswer } from '../web/js/response-evaluator.js';

const tacticQuestion = {
  text: '¿Eso te funciona con todas?',
  technique: 'cambio de presión',
  recommendedAnswer: 'Solo con las que hacen interrogatorios.'
};

const requiredCases = [
  {
    name: 'edad literal',
    question: { text: '¿Cuántos años tienes?' },
    answer: '18 años',
    expect: (result) => {
      assert.equal(result.technique, 'SIN_TECNICA');
      assert.equal(result.flags.literal_answer, true);
      assert.equal(result.flags.accepted_frame, true);
      assert.ok(result.score <= 30, `score ${result.score} debe ser <= 30`);
    }
  },
  {
    name: 'sí literal',
    question: tacticQuestion,
    answer: 'si',
    expect: (result) => {
      assert.equal(result.technique, 'SIN_TECNICA');
      assert.equal(result.flags.literal_answer, true);
      assert.equal(result.flags.accepted_frame, true);
      assert.ok(result.score <= 30, `score ${result.score} debe ser <= 30`);
    }
  },
  {
    name: 'no literal',
    question: tacticQuestion,
    answer: 'no',
    expect: (result) => {
      assert.equal(result.technique, 'SIN_TECNICA');
      assert.equal(result.flags.literal_answer, true);
      assert.equal(result.flags.accepted_frame, true);
      assert.ok(result.score <= 30, `score ${result.score} debe ser <= 30`);
    }
  },
  {
    name: 'insulto puro',
    question: { text: '¿Por qué eres así?' },
    answer: 'eres una perra',
    expect: (result) => {
      assert.equal(result.technique, 'SIN_TECNICA');
      assert.equal(result.flags.pure_insult, true);
      assert.equal(result.flags.emotional_reaction, true);
      assert.ok(result.score <= 20, `score ${result.score} debe ser <= 20`);
    }
  },
  {
    name: 'justificación con validación',
    question: tacticQuestion,
    answer: 'Porque soy atractivo y sé hablar con mujeres.',
    expect: (result) => {
      assert.equal(result.flags.validation_seeking, true);
      assert.equal(result.flags.justification, true);
      assert.equal(result.flags.accepted_frame, true);
      assert.ok(result.score <= 35, `score ${result.score} debe ser <= 35`);
    }
  },
  {
    name: 'cambio de presión correcto',
    question: tacticQuestion,
    answer: 'Solo con las que hacen interrogatorios.',
    expect: (result, all) => {
      const badScores = all.filter((item) => item.name !== 'cambio de presión correcto').map((item) => item.result.score);
      assert.equal(result.flags.accepted_frame, false);
      assert.ok(result.score > Math.max(...badScores), `score ${result.score} debe superar malos ${badScores.join(', ')}`);
    }
  }
];

const benchmark = [
  ['vacía', tacticQuestion, '', 1, 5],
  ['insulto crudo', tacticQuestion, 'idiota', 1, 20],
  ['dato literal', { text: '¿Cuántos años tienes?' }, '18', 1, 30],
  ['sí seco', tacticQuestion, 'sí', 1, 30],
  ['no seco', tacticQuestion, 'no', 1, 30],
  ['irrelevante', tacticQuestion, 'la lavadora azul camina sobre Marte', 1, 20],
  ['defensiva', tacticQuestion, 'No soy así, de verdad no uso eso.', 10, 35],
  ['validación', tacticQuestion, 'Soy diferente y valgo la pena.', 10, 35],
  ['estatus', tacticQuestion, 'Porque soy atractivo y tengo dinero.', 20, 35],
  ['larga mala', tacticQuestion, 'No soy así porque yo siempre intento ser sincero y demostrar que soy diferente a todos los hombres que conociste antes.', 10, 45],
  ['neutral breve', tacticQuestion, 'Depende del día.', 38, 65],
  ['desvío simple', tacticQuestion, 'Puede ser, pero primero lo importante.', 45, 75],
  ['calma', tacticQuestion, 'Tranquila, eso lo vemos luego.', 45, 72],
  ['humor leve', tacticQuestion, 'Jaja, tengo el informe en un Excel secreto.', 55, 85],
  ['malinterpretar', tacticQuestion, 'Eso sonó a que te gusto.', 60, 82],
  ['amplificar', tacticQuestion, 'Obvio, tengo estadísticas y un comité revisando resultados.', 65, 94],
  ['cambio presión', tacticQuestion, 'Solo con las que hacen interrogatorios.', 65, 92],
  ['pregunta con marco', tacticQuestion, '¿Siempre haces entrevistas tan intensas?', 50, 82],
  ['descualificación', tacticQuestion, 'Te aviso que soy pésimo candidato para preguntas fáciles.', 62, 86],
  ['límite', { text: 'Eres muy intenso.', technique: 'límites' }, 'Todo bien, si te incomoda bajo el ritmo.', 65, 92],
  ['buena natural', tacticQuestion, 'Solo cuando la entrevistadora viene con clipboard.', 62, 86],
  ['muy buena presión', tacticQuestion, 'Solo con las que intentan auditarme antes del primer café.', 68, 94],
  ['humor fuerte', tacticQuestion, 'Claramente, tengo doctorado en sobrevivir interrogatorios.', 60, 90],
  ['desviar alto', tacticQuestion, 'Eso es confidencial; mejor dime qué tan seguido haces auditorías.', 65, 94],
  ['malinterpretar alto', tacticQuestion, 'Qué directa, lo tomaré como halago disfrazado.', 65, 94],
  ['amplificar alto', tacticQuestion, 'Desde siempre, el ministerio de coqueteo me exige reportes.', 65, 94],
  ['calibrada corta', tacticQuestion, 'Vienes fuerte; me gusta la energía.', 65, 92],
  ['creativa natural', tacticQuestion, 'Solo si la pregunta viene con sello oficial.', 62, 90],
  ['élite no copy', tacticQuestion, 'Esa pregunta dice más de tu radar que de mis tácticas.', 70, 98],
  ['élite pregunta', tacticQuestion, '¿Me estás evaluando o ya pasé a segunda ronda?', 70, 98]
];

const requiredResults = requiredCases.map((test) => ({ ...test, result: evaluateAnswer(test.answer, test.question) }));
for (const test of requiredResults) test.expect(test.result, requiredResults);

const benchmarkResults = benchmark.map(([name, question, answer, min, max]) => {
  const result = evaluateAnswer(answer, question);
  assert.ok(result.score >= min && result.score <= max, `${name}: score ${result.score} fuera de ${min}-${max}`);
  return { name, score: result.score, technique: result.technique, hardCap: result.hardCap };
});

assert.ok(benchmarkResults.length >= 30);
assert.ok(Math.min(...benchmarkResults.map((item) => item.score)) <= 5);
assert.ok(Math.max(...benchmarkResults.map((item) => item.score)) >= 88);
assert.ok(benchmarkResults.some((item) => item.score >= 10 && item.score <= 18));
assert.ok(benchmarkResults.some((item) => item.score >= 24 && item.score <= 35));
assert.ok(benchmarkResults.some((item) => item.score >= 45 && item.score <= 60));
assert.ok(benchmarkResults.some((item) => item.score >= 68 && item.score <= 80));
assert.ok(benchmarkResults.some((item) => item.score >= 88));

console.table(benchmarkResults);
