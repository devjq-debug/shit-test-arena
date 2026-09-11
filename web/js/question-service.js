import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where
} from 'https://www.gstatic.com/firebasejs/11.10.0/firebase-firestore.js';
import { firestore } from './firebase-config.js?v=2';

export const DEFAULT_QUESTIONS = [
  'Seguro eres así con todas.',
  'Tienes cara de que te crees demasiado.',
  'Pensé que eras más divertido.',
  '¿Siempre necesitas llamar la atención?',
  'A ver, sorpréndeme.',
  '¿Qué te hace pensar que tenemos química?',
  'No pareces alguien fácil de sorprender.',
  '¿Qué estás evitando decir?',
  '¿También discutes contigo mismo?',
  'Cambia mi opinión sobre ti.',
  '¿Eso fue lo mejor que se te ocurrió?',
  '¿Siempre eres tan intenso?',
  'Todos te están mirando, ¿te pones nervioso?',
  'Véndeme tu mejor cualidad en diez segundos.',
  '¿De verdad crees que vas a impresionarme?',
  'No estoy segura de que seas tan interesante.',
  '¿Te molesta que tenga razón?',
  'Descríbete sin usar adjetivos.',
  '¿Qué tienes tú que no tenga cualquiera?',
  'No puedes responder con otra pregunta.'
];

const normalizeCategory = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const normalizeQuestion = (snapshot) => ({ id: snapshot.id, ...snapshot.data() });
const uniqueById = (items) => [...new Map(items.map((item) => [item.id, item])).values()];
const uniqueByText = (items) => [...new Map(items.map((item) => [String(item.text || '').trim().toLowerCase(), item])).values()].filter((item) => item.text);
const shuffle = (items) => [...items].sort(() => Math.random() - 0.5);

export const fallbackQuestionText = (index = 0) => DEFAULT_QUESTIONS[index % DEFAULT_QUESTIONS.length];

export function formatRoomQuestion(question) {
  return {
    id: question.id,
    text: question.text,
    categoryId: question.categoryId || 'fallback'
  };
}

function fallbackQuestionBank() {
  return DEFAULT_QUESTIONS.map((text, index) => ({
    id: `fallback-${index + 1}`,
    text,
    categoryId: 'fallback',
    active: true
  }));
}

export async function loadGameCategories() {
  try {
    const snapshot = await getDocs(query(collection(firestore, 'categories'), where('active', '==', true)));
    const categories = snapshot.docs.map(normalizeCategory).sort((a, b) => a.name.localeCompare(b.name, 'es'));
    return [{ id: '', name: 'Todas las categorías' }, ...categories];
  } catch {
    return [{ id: '', name: 'Todas las categorías' }];
  }
}

export async function loadActiveQuestions(categoryId = '') {
  const snapshot = await getDocs(query(collection(firestore, 'questions'), where('active', '==', true)));
  return snapshot.docs
    .map(normalizeQuestion)
    .filter((question) => typeof question.text === 'string' && question.text.trim())
    .filter((question) => !categoryId || question.categoryId === categoryId);
}

export async function pickQuestionsForRoom({ categoryId = '', roundCount = 10 } = {}) {
  let questions = [];
  try {
    questions = await loadActiveQuestions(categoryId);
    if (categoryId && questions.length < roundCount) {
      questions = uniqueById([...questions, ...(await loadActiveQuestions(''))]);
    }
  } catch {
    questions = [];
  }
  const bank = uniqueByText(uniqueById([...questions, ...fallbackQuestionBank()]));
  if (!bank.length) throw new Error('No hay preguntas disponibles para crear la sala.');
  return shuffle(bank).slice(0, Math.min(roundCount, bank.length)).map(formatRoomQuestion);
}

export async function isCurrentUserAdmin(uid) {
  if (!uid) return false;
  const snapshot = await getDoc(doc(firestore, 'admins', uid));
  return snapshot.exists() && snapshot.data()?.active === true;
}

export async function listCategoriesForAdmin() {
  const snapshot = await getDocs(collection(firestore, 'categories'));
  return snapshot.docs.map(normalizeCategory).sort((a, b) => a.name.localeCompare(b.name, 'es'));
}

export async function listQuestionsForAdmin() {
  const snapshot = await getDocs(collection(firestore, 'questions'));
  return snapshot.docs.map(normalizeQuestion).sort((a, b) => String(a.text).localeCompare(String(b.text), 'es'));
}

export async function createCategory({ name, active = true }) {
  return addDoc(collection(firestore, 'categories'), {
    name: name.trim(),
    active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateCategory(categoryId, { name, active }) {
  return updateDoc(doc(firestore, 'categories', categoryId), {
    name: name.trim(),
    active,
    updatedAt: serverTimestamp()
  });
}

export async function deleteCategory(categoryId) {
  return deleteDoc(doc(firestore, 'categories', categoryId));
}

export async function createQuestion({ text, categoryId, active = true }) {
  return addDoc(collection(firestore, 'questions'), {
    text: text.trim(),
    categoryId,
    active,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp()
  });
}

export async function updateQuestion(questionId, { text, categoryId, active }) {
  return updateDoc(doc(firestore, 'questions', questionId), {
    text: text.trim(),
    categoryId,
    active,
    updatedAt: serverTimestamp()
  });
}

export async function setQuestionActive(questionId, active) {
  return updateDoc(doc(firestore, 'questions', questionId), {
    active,
    updatedAt: serverTimestamp()
  });
}

export async function deleteQuestion(questionId) {
  return deleteDoc(doc(firestore, 'questions', questionId));
}

export async function seedDefaultQuestions() {
  const categories = await listCategoriesForAdmin();
  let general = categories.find((category) => category.name.toLowerCase() === 'general');
  if (!general) {
    const ref = await createCategory({ name: 'General', active: true });
    general = { id: ref.id, name: 'General', active: true };
  }
  const existingQuestions = await listQuestionsForAdmin();
  const existingTexts = new Set(existingQuestions.map((question) => String(question.text || '').trim().toLowerCase()));
  const missing = DEFAULT_QUESTIONS.filter((text) => !existingTexts.has(text.trim().toLowerCase()));
  await Promise.all(missing.map((text) => createQuestion({ text, categoryId: general.id, active: true })));
  return { category: general, created: missing.length };
}
