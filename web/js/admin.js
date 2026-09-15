import { changeCurrentPassword, signInAdmin, signOutCurrentUser, watchAuthState } from './auth.js?v=5';
import {
  createCategory,
  createQuestion,
  deleteCategory,
  deleteQuestion,
  isCurrentUserAdmin,
  listCategoriesForAdmin,
  listQuestionsForAdmin,
  seedDefaultQuestions,
  setQuestionActive,
  updateCategory,
  updateQuestion
} from './question-service.js?v=5';

const $ = (selector) => document.querySelector(selector);
const escapeHtml = (value = '') => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[char]));
const splitReferenceAnswers = (value = '') => String(value).split('\n').map((item) => item.trim()).filter(Boolean).slice(0, 8);

const state = {
  categories: [],
  questions: [],
  user: null
};

function showToast(message, isError = false) {
  const toast = $('#admin-toast');
  toast.textContent = message;
  toast.classList.toggle('border-red-500/40', isError);
  toast.classList.toggle('bg-red-950/95', isError);
  toast.classList.toggle('text-red-200', isError);
  toast.classList.toggle('border-emerald-500/40', !isError);
  toast.classList.toggle('bg-emerald-950/95', !isError);
  toast.classList.toggle('text-emerald-200', !isError);
  toast.classList.remove('hidden');
  setTimeout(() => toast.classList.add('hidden'), 3200);
}

function setLoginError(message = '') {
  const error = $('#login-error');
  error.textContent = message;
  error.classList.toggle('hidden', !message);
}

function setView(isAdmin) {
  $('#login-view').classList.toggle('hidden', isAdmin);
  $('#admin-view').classList.toggle('hidden', !isAdmin);
  $('#logout-btn').classList.toggle('hidden', !isAdmin);
}

function categoryName(categoryId) {
  return state.categories.find((category) => category.id === categoryId)?.name || 'Sin categoría';
}

function resetCategoryForm() {
  $('#category-id').value = '';
  $('#category-name').value = '';
  $('#category-active').checked = true;
}

function resetQuestionForm() {
  $('#question-id').value = '';
  $('#question-text').value = '';
  $('#question-recommended-answer').value = '';
  $('#question-reference-answers').value = '';
  $('#question-technique').value = '';
  $('#question-source').value = '';
  $('#question-difficulty').value = 'media';
  $('#question-active').checked = true;
  if ($('#question-category').options.length) $('#question-category').selectedIndex = 0;
}

function resetPasswordForm() {
  $('#current-password').value = '';
  $('#new-password').value = '';
  $('#confirm-password').value = '';
}

function renderCategorySelects() {
  const options = state.categories.map((category) => `<option value="${escapeHtml(category.id)}">${escapeHtml(category.name)}${category.active ? '' : ' · inactiva'}</option>`).join('');
  $('#question-category').innerHTML = options || '<option value="">Crea una categoría primero</option>';
  $('#question-filter-category').innerHTML = `<option value="">Todas las categorías</option>${options}`;
}

function renderCategories() {
  $('#category-count').textContent = `${state.categories.length}`;
  $('#category-list').innerHTML = state.categories.map((category) => `
    <article class="rounded-xl border border-arena-cardborder bg-arena-dark p-3">
      <div class="flex items-start justify-between gap-3">
        <div>
          <div class="text-sm font-bold text-white">${escapeHtml(category.name)}</div>
          <div class="mt-1 font-mono text-[10px] ${category.active ? 'text-emerald-400' : 'text-gray-500'}">${category.active ? 'ACTIVA' : 'INACTIVA'}</div>
        </div>
        <div class="flex gap-1">
          <button data-edit-category="${category.id}" class="rounded-lg border border-arena-cardborder px-2 py-1 text-[10px] font-bold text-gray-300">Editar</button>
          <button data-delete-category="${category.id}" class="rounded-lg border border-red-500/40 px-2 py-1 text-[10px] font-bold text-red-300">Eliminar</button>
        </div>
      </div>
    </article>
  `).join('') || '<p class="text-xs text-gray-500">No hay categorías todavía.</p>';
  renderCategorySelects();
}

function renderQuestions() {
  const search = $('#question-search').value.trim().toLowerCase();
  const filterCategory = $('#question-filter-category').value;
  const filtered = state.questions.filter((question) => {
    const haystack = [question.text, question.recommendedAnswer, question.technique, question.source].join(' ').toLowerCase();
    const matchesText = !search || haystack.includes(search);
    const matchesCategory = !filterCategory || question.categoryId === filterCategory;
    return matchesText && matchesCategory;
  });
  $('#question-count').textContent = `${filtered.length}/${state.questions.length} preguntas`;
  $('#question-list').innerHTML = filtered.map((question) => `
    <article class="rounded-2xl border ${question.active ? 'border-arena-cardborder' : 'border-gray-700/60 opacity-70'} bg-arena-dark p-4">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div class="text-sm font-bold leading-relaxed text-white">${escapeHtml(question.text)}</div>
          ${question.recommendedAnswer ? `<div class="mt-2 rounded-xl border border-arena-cardborder bg-arena-card/70 p-3 text-xs leading-relaxed text-gray-300"><span class="font-mono font-black uppercase text-arena-gold">Recomendada:</span> ${escapeHtml(question.recommendedAnswer)}</div>` : ''}
          <div class="mt-2 flex flex-wrap gap-2 font-mono text-[10px]">
            <span class="rounded-lg border border-arena-cardborder px-2 py-1 text-arena-gold">${escapeHtml(categoryName(question.categoryId))}</span>
            ${question.technique ? `<span class="rounded-lg border border-arena-cardborder px-2 py-1 text-gray-300">${escapeHtml(question.technique)}</span>` : ''}
            <span class="rounded-lg border border-arena-cardborder px-2 py-1 text-gray-400">${escapeHtml(question.difficulty || 'media')}</span>
            <span class="${question.active ? 'text-emerald-400' : 'text-gray-500'} rounded-lg border border-arena-cardborder px-2 py-1">${question.active ? 'ACTIVA' : 'INACTIVA'}</span>
          </div>
        </div>
        <div class="flex shrink-0 flex-wrap gap-2">
          <button data-edit-question="${question.id}" class="rounded-lg border border-arena-cardborder px-3 py-1.5 text-[10px] font-bold uppercase text-gray-300">Editar</button>
          <button data-toggle-question="${question.id}" class="rounded-lg border border-arena-cardborder px-3 py-1.5 text-[10px] font-bold uppercase text-gray-300">${question.active ? 'Desactivar' : 'Activar'}</button>
          <button data-delete-question="${question.id}" class="rounded-lg border border-red-500/40 px-3 py-1.5 text-[10px] font-bold uppercase text-red-300">Eliminar</button>
        </div>
      </div>
    </article>
  `).join('') || '<p class="rounded-xl border border-arena-cardborder bg-arena-dark p-4 text-center text-xs text-gray-500">No hay preguntas que coincidan.</p>';
}

function renderAll() {
  renderCategories();
  renderQuestions();
}

async function refreshData() {
  const [categories, questions] = await Promise.all([listCategoriesForAdmin(), listQuestionsForAdmin()]);
  state.categories = categories;
  state.questions = questions;
  renderAll();
}

async function handleLogin(event) {
  event.preventDefault();
  setLoginError('');
  try {
    await signInAdmin($('#admin-email').value.trim(), $('#admin-password').value);
  } catch (error) {
    setLoginError(error.message);
  }
}

async function handleCategorySubmit(event) {
  event.preventDefault();
  const id = $('#category-id').value;
  const payload = { name: $('#category-name').value, active: $('#category-active').checked };
  if (!payload.name.trim()) return showToast('Escribe un nombre de categoría.', true);
  if (id) await updateCategory(id, payload);
  else await createCategory(payload);
  resetCategoryForm();
  await refreshData();
  showToast('Categoría guardada.');
}

async function handleQuestionSubmit(event) {
  event.preventDefault();
  const id = $('#question-id').value;
  const payload = {
    text: $('#question-text').value,
    recommendedAnswer: $('#question-recommended-answer').value,
    referenceAnswers: splitReferenceAnswers($('#question-reference-answers').value),
    technique: $('#question-technique').value,
    source: $('#question-source').value,
    difficulty: $('#question-difficulty').value,
    categoryId: $('#question-category').value,
    active: $('#question-active').checked
  };
  if (!payload.text.trim()) return showToast('Escribe una pregunta.', true);
  if (!payload.categoryId) return showToast('Crea o selecciona una categoría.', true);
  if (id) await updateQuestion(id, payload);
  else await createQuestion(payload);
  resetQuestionForm();
  await refreshData();
  showToast('Pregunta guardada.');
}

async function handlePasswordSubmit(event) {
  event.preventDefault();
  const currentPassword = $('#current-password').value;
  const newPassword = $('#new-password').value;
  const confirmPassword = $('#confirm-password').value;
  if (newPassword.length < 8) return showToast('La nueva clave debe tener al menos 8 caracteres.', true);
  if (newPassword !== confirmPassword) return showToast('La confirmación no coincide.', true);
  await changeCurrentPassword(currentPassword, newPassword);
  resetPasswordForm();
  showToast('Clave actualizada correctamente.');
}

function bindDelegatedActions() {
  document.addEventListener('click', async (event) => {
    const editCategoryId = event.target.closest('[data-edit-category]')?.dataset.editCategory;
    const deleteCategoryId = event.target.closest('[data-delete-category]')?.dataset.deleteCategory;
    const editQuestionId = event.target.closest('[data-edit-question]')?.dataset.editQuestion;
    const toggleQuestionId = event.target.closest('[data-toggle-question]')?.dataset.toggleQuestion;
    const deleteQuestionId = event.target.closest('[data-delete-question]')?.dataset.deleteQuestion;
    try {
      if (editCategoryId) {
        const category = state.categories.find((item) => item.id === editCategoryId);
        $('#category-id').value = category.id;
        $('#category-name').value = category.name;
        $('#category-active').checked = category.active;
      }
      if (deleteCategoryId && window.confirm('¿Eliminar esta categoría? Las preguntas existentes conservarán el ID hasta que las reasignes.')) {
        await deleteCategory(deleteCategoryId);
        await refreshData();
        showToast('Categoría eliminada.');
      }
      if (editQuestionId) {
        const question = state.questions.find((item) => item.id === editQuestionId);
        $('#question-id').value = question.id;
        $('#question-text').value = question.text;
        $('#question-recommended-answer').value = question.recommendedAnswer || '';
        $('#question-reference-answers').value = Array.isArray(question.referenceAnswers) ? question.referenceAnswers.join('\n') : '';
        $('#question-technique').value = question.technique || '';
        $('#question-source').value = question.source || '';
        $('#question-difficulty').value = question.difficulty || 'media';
        $('#question-category').value = question.categoryId;
        $('#question-active').checked = question.active;
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
      if (toggleQuestionId) {
        const question = state.questions.find((item) => item.id === toggleQuestionId);
        await setQuestionActive(toggleQuestionId, !question.active);
        await refreshData();
        showToast(question.active ? 'Pregunta desactivada.' : 'Pregunta activada.');
      }
      if (deleteQuestionId && window.confirm('¿Eliminar esta pregunta definitivamente?')) {
        await deleteQuestion(deleteQuestionId);
        await refreshData();
        showToast('Pregunta eliminada.');
      }
    } catch (error) {
      showToast(error.message, true);
    }
  });
}

function bindAdminUi() {
  $('#login-form').addEventListener('submit', handleLogin);
  $('#logout-btn').addEventListener('click', () => signOutCurrentUser());
  $('#category-form').addEventListener('submit', (event) => handleCategorySubmit(event).catch((error) => showToast(error.message, true)));
  $('#question-form').addEventListener('submit', (event) => handleQuestionSubmit(event).catch((error) => showToast(error.message, true)));
  $('#password-form').addEventListener('submit', (event) => handlePasswordSubmit(event).catch((error) => showToast(error.message, true)));
  $('#category-reset').addEventListener('click', resetCategoryForm);
  $('#question-reset').addEventListener('click', resetQuestionForm);
  $('#question-search').addEventListener('input', renderQuestions);
  $('#question-filter-category').addEventListener('change', renderQuestions);
  $('#seed-btn').addEventListener('click', async () => {
    try {
      const result = await seedDefaultQuestions();
      await refreshData();
      showToast(`Semilla importada: ${result.created} preguntas nuevas.`);
    } catch (error) {
      showToast(error.message, true);
    }
  });
  bindDelegatedActions();
}

bindAdminUi();
setView(false);

watchAuthState(async (user) => {
  state.user = user;
  if (!user) {
    setView(false);
    return;
  }
  try {
    const isPasswordUser = user.providerData.some((provider) => provider.providerId === 'password');
    if (user.isAnonymous || !isPasswordUser) {
      await signOutCurrentUser();
      setLoginError('Acceso privado: usa las credenciales autorizadas del administrador.');
      setView(false);
      return;
    }
    if (!(await isCurrentUserAdmin(user.uid))) {
      await signOutCurrentUser();
      setLoginError('Tu usuario existe, pero no está autorizado como administrador.');
      setView(false);
      return;
    }
    setView(true);
    await refreshData();
  } catch {
    await signOutCurrentUser();
    setLoginError('No se pudo validar el permiso de administrador.');
    setView(false);
  }
});
