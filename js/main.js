// main.js - PDF worker init + project switcher + switching + import + bootstrap

// ========================================================================
// PDF.js WORKER + TODAY DATE
// ========================================================================
if (window.pdfjsLib) {
  pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
}

// ========================================
// Today date
// ========================================
document.getElementById('today-date').textContent =
  new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

// ========================================================================
// PROJECT SWITCHER RENDER (dynamic dropdown)
// ========================================================================
// Build the project switcher dropdown from `projects` so it stays in sync
// with whatever state is loaded (seed, localStorage, or imported JSON).
function renderProjectSwitcher() {
  const dropdown = document.getElementById('ps-dropdown');
  if (!dropdown) return;
  dropdown.innerHTML = '';
  Object.values(projects).forEach(p => {
    const opt = document.createElement('div');
    opt.className = 'ps-option' + (p.id === activeProjectId ? ' active' : '');
    opt.dataset.id = p.id;
    const markClass = p.hasFinancials ? 'po-mark--primary' : 'po-mark--secondary';
    opt.innerHTML = `
      <div class="po-mark ${markClass}">${p.initials || (p.shortName || p.name || '?').slice(0, 2).toUpperCase()}</div>
      <div>
        <div class="po-name">${p.shortName || p.name || '(sans nom)'}</div>
        <div class="po-sub">${[p.location, p.region].filter(Boolean).join(' · ') || (p.subtitle || '')}</div>
      </div>
    `;
    dropdown.appendChild(opt);
  });

  // Action buttons row: add + manage
  const actions = document.createElement('div');
  actions.className = 'ps-actions';
  actions.innerHTML = `
    <button class="ps-action-btn primary" data-act="add" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
      Ajouter
    </button>
    <button class="ps-action-btn" data-act="manage" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
      Gérer
    </button>
  `;
  dropdown.appendChild(actions);
}

// ========================================================================
// SWITCH PROJECT
// ========================================================================
function switchProject(id) {
  if (!projects[id]) return;
  document.getElementById('project-switcher').classList.remove('open');
  if (id === activeProjectId) return;
  activeProjectId = id;
  document.title = `${projects[id].name} · Chantier`;
  renderProjectSwitcher();
  updateHero();
  renderAll();
  scheduleSave();
  toast(`Projet : ${projects[id].name}`);
  // Reset chat
  const conv = document.getElementById('conv');
  if (conv) {
    conv.innerHTML = `<div class="msg bot"><div class="intro-txt">Vous consultez maintenant ${projects[id].name}. Posez votre question.</div></div>`;
  }
}

// ========================================================================
// RENDER ALL
// ========================================================================
function renderAll() {
  if (state.active.hasFinancials) updateFinancials();
  renderTimeline();
  renderWorks();
  renderDocs();
  renderFutureWorks();
  renderNotificationBanner();
}

// ========================================================================
// SWITCHER WIRING
// ========================================================================
// Wire switcher (event delegation handles dynamically-rendered .ps-option entries)
document.getElementById('ps-trigger').addEventListener('click', e => {
  e.stopPropagation();
  document.getElementById('project-switcher').classList.toggle('open');
});
document.getElementById('ps-dropdown').addEventListener('click', e => {
  // Action buttons (+ / gear)
  const actBtn = e.target.closest('.ps-action-btn');
  if (actBtn) {
    document.getElementById('project-switcher').classList.remove('open');
    if (actBtn.dataset.act === 'add') openPropertyModal(null);
    else if (actBtn.dataset.act === 'manage') openManagePropertiesModal();
    return;
  }
  // Project row → switch
  const opt = e.target.closest('.ps-option');
  if (opt && opt.dataset.id) switchProject(opt.dataset.id);
});
document.addEventListener('click', e => {
  const sw = document.getElementById('project-switcher');
  if (sw && !sw.contains(e.target)) sw.classList.remove('open');
});

// Initial render of the switcher
renderProjectSwitcher();

// ========================================================================
// IMPORT (restore from .json backup)
// ========================================================================
document.getElementById('import-state-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    if (parsed._version !== 1 || !parsed.projects || typeof parsed.projects !== 'object') {
      toast('Fichier invalide ou format incompatible');
      return;
    }
    // Stash current state for undo
    const backup = _serializeState();
    projects = parsed.projects;
    if (parsed.activeProjectId && projects[parsed.activeProjectId]) {
      activeProjectId = parsed.activeProjectId;
    } else {
      activeProjectId = Object.keys(projects)[0];
    }
    saveStateNow();
    document.title = `${projects[activeProjectId].name} · Chantier`;
    renderProjectSwitcher();
    updateHero();
    renderAll();
    const when = parsed.savedAt ? new Date(parsed.savedAt).toLocaleDateString('fr-FR') : 'inconnue';
    toast(`Sauvegarde du ${when} restaurée`, {
      undo: () => {
        projects = backup.projects;
        activeProjectId = backup.activeProjectId;
        saveStateNow();
        renderProjectSwitcher();
        updateHero();
        renderAll();
        toast('Import annulé');
      }
    });
  } catch (err) {
    console.error(err);
    toast('Impossible de lire ce fichier');
  } finally {
    e.target.value = '';
  }
});

// Initial render of dynamic project bits
updateHero();
renderWorks();
renderFutureWorks();



// ========================================================================
// INITIAL TITLE + NOTIFICATION + SAVE-INDICATOR
// ========================================================================
// Set initial document title
document.title = `${state.active.name} · Chantier`;
renderNotificationBanner();

// If state was loaded from storage, surface that fact in the save indicator
if (_loaded) {
  _lastSaveAt = _loaded.savedAt ? new Date(_loaded.savedAt).getTime() : Date.now();
  renderSaveIndicator();
}

// ========================================================================
// SMOOTH-SCROLL NAV (IntersectionObserver)
// ========================================================================
const navItems = document.querySelectorAll('.nav-item');
const sections = ['overview', 'assistant', 'timeline', 'works', 'finance', 'payments', 'documents', 'contacts'];
const io = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      navItems.forEach(n => n.classList.remove('active'));
      const id = e.target.id;
      const match = document.querySelector(`.nav-item[href="#${id}"]`);
      if (match) match.classList.add('active');
    }
  });
}, { threshold: 0.3 });

sections.forEach(id => {
  const el = document.getElementById(id);
  if (el) io.observe(el);
});
