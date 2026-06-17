// features.js - knowledge/chat, smart sort, future works modal, calendar export, command palette

// ========================================================================
// KNOWLEDGE SEARCH + CHAT UI
// ========================================================================
function search(query) {
  const nq = normalize(query);
  if (!nq) return [];
  const tokens = nq.split(' ').filter(t => t.length > 1);

  const scored = state.knowledge.map(entry => {
    let score = 0;
    entry.kw.forEach(kw => {
      const nkw = normalize(kw);
      if (nq.includes(nkw)) score += nkw.length * 2;
      else tokens.forEach(t => { if (nkw.includes(t) || t.includes(nkw)) score += Math.min(nkw.length, t.length); });
    });
    tokens.forEach(t => { if (normalize(entry.title).includes(t)) score += t.length; });
    return { entry, score };
  }).filter(r => r.score > 0);

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, 2).map(r => r.entry);
}

// ========================================
// CHAT UI
// ========================================
const conv = document.getElementById('conv');
const qinput = document.getElementById('qinput');

function pushUser(text) {
  const el = document.createElement('div');
  el.className = 'msg user';
  el.textContent = text;
  conv.appendChild(el);
  conv.scrollTop = conv.scrollHeight;
}

function pushBot(results, queryText) {
  const wrap = document.createElement('div');
  wrap.className = 'msg bot';
  if (results.length === 0) {
    wrap.innerHTML = `<div class="intro-txt">Je n'ai rien trouvé pour « ${queryText} ». Essayez : acompte, MaPrimeRénov', pompe à chaleur, IBAN, artisan, délai…</div>`;
  } else {
    let html = '';
    results.forEach(r => {
      const body = typeof r.body === 'function' ? r.body() : r.body;
      html += `<div class="card-r"><div class="title">${r.title}</div>${body}<div class="source">↳ ${r.source}</div></div>`;
    });
    wrap.innerHTML = html;
  }
  conv.appendChild(wrap);
  conv.scrollTop = conv.scrollHeight;
}

function ask(q) {
  if (!q.trim()) return;
  pushUser(q);
  qinput.value = '';
  setTimeout(() => pushBot(search(q), q), 250);
}

document.getElementById('sendbtn').addEventListener('click', () => ask(qinput.value));
qinput.addEventListener('keydown', e => { if (e.key === 'Enter') ask(qinput.value); });
document.querySelectorAll('.chip').forEach(c => c.addEventListener('click', () => {
  ask(c.dataset.q);
  document.getElementById('assistant').scrollIntoView({ behavior: 'smooth', block: 'start' });
}));


// ========================================================================
// SMART PRIORITY SORTING (local heuristics, no network)
// ========================================================================
// Scores each travail à prévoir based on:
//   - category keywords (prereq → critical → energy → comfort → aesthetic → luxury)
//   - deadline proximity
//   - project context (ongoing chantier de-prioritizes non-urgent work)
// then maps score to a priority 1 / 2 / 3 and a short justification.

function computeSmartPriority(fw, context) {
  const text = (fw.title + ' ' + (fw.desc || ''))
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  // Category keywords (accent-stripped)
  const PREREQ    = ['etat des lieux', 'diagnostic', 'audit', 'expertise', 'bilan', 'inspection', 'reflexion'];
  const CRITICAL  = ['toiture', 'charpente', 'fondation', 'structure', 'etancheite', 'humidite',
                     'infiltration', 'fuite', 'amiante', 'plomb', 'gaz', 'fissure', 'electrique',
                     'electricite', 'effondrement', 'securite', 'incendie', 'mise aux normes', 'assainissement'];
  const ENERGY    = ['isolation', 'chauffage', 'pompe a chaleur', ' pac ', 'fenetre', 'menuiserie',
                     'vmc', 'ventilation', 'thermique', 'chaudiere', 'double vitrage', 'dpe'];
  const COMFORT   = ['cuisine', 'salle de bain', 'sdb', 'plomberie', 'sanitaire', 'eau chaude'];
  const AESTHETIC = ['peinture', 'sol', 'parquet', 'jardin', 'terrasse', 'amenagement',
                     'salon', 'chambre', 'decoration', 'deco', 'mobilier', 'cloture'];
  const LUXURY    = ['piscine', 'sauna', 'jacuzzi', 'veranda', 'panneau solaire', 'panneaux solaire',
                     'photovoltaique', 'spa', 'extension'];

  const matches = (list) => list.some(kw => text.includes(kw));

  let category = 'standard';
  let categoryScore = 6;

  if (matches(PREREQ))         { category = 'prereq';    categoryScore = 28; }
  else if (matches(CRITICAL))  { category = 'critical';  categoryScore = 25; }
  else if (matches(ENERGY))    { category = 'energy';    categoryScore = 16; }
  else if (matches(COMFORT))   { category = 'comfort';   categoryScore = 10; }
  else if (matches(AESTHETIC)) { category = 'aesthetic'; categoryScore = 4; }
  else if (matches(LUXURY))    { category = 'luxury';    categoryScore = 2; }

  let score = categoryScore;

  // Deadline urgency
  let deadlineDesc = '';
  let deadlineScore = 0;
  if (fw.deadline) {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const d = new Date(fw.deadline);
    const days = Math.round((d - now) / 86400000);
    if (days < 0)         { deadlineScore = 35; deadlineDesc = 'échéance dépassée'; }
    else if (days <= 14)  { deadlineScore = 30; deadlineDesc = 'échéance imminente'; }
    else if (days <= 60)  { deadlineScore = 20; deadlineDesc = `échéance dans ${Math.round(days/7)} sem.`; }
    else if (days <= 180) { deadlineScore = 10; deadlineDesc = `échéance dans ${Math.round(days/30)} mois`; }
    else if (days <= 365) { deadlineScore = 4;  deadlineDesc = "échéance dans l'année"; }
    else                  { deadlineScore = 1;  deadlineDesc = 'échéance lointaine'; }
  }
  score += deadlineScore;

  // Context: de-prioritize non-essential while a chantier is active
  if (context.hasOngoingChantier && category !== 'prereq' && category !== 'critical') {
    score -= 4;
  }

  // Cost bump: a large investment slightly raises priority (planning effort)
  if (fw.cost && fw.cost > 15000) score += 3;

  // Build reason text
  const catLabels = {
    prereq:    'Prérequis avant les autres travaux',
    critical:  'Sécurité, étanchéité ou structure',
    energy:    'Performance énergétique',
    comfort:   'Confort sanitaire / cuisine',
    aesthetic: 'Aménagement esthétique',
    luxury:    "Projet d'agrément",
    standard:  'Évaluation standard'
  };
  let reason = catLabels[category];
  if (deadlineDesc) reason += ' · ' + deadlineDesc;
  if (reason.length > 90) reason = reason.slice(0, 87) + '…';

  // Map total score to priority
  let priority;
  if (score >= 30) priority = 1;
  else if (score >= 14) priority = 2;
  else priority = 3;

  return { priority, reason, score };
}

function aiSortFutureWorks() {
  const items = state.futureWorks || [];
  if (items.length === 0) { toast('Aucun travail à trier'); return; }
  if (items.length === 1) { toast('Un seul travail — rien à trier'); return; }

  // Snapshot for undo
  const snapshot = items.map(fw => ({
    id: fw.id,
    priority: fw.priority,
    aiReason: fw.aiReason || null
  }));

  const context = {
    hasOngoingChantier: !!state.active.hasFinancials,
    project: state.active
  };

  let changedCount = 0;
  items.forEach(fw => {
    const result = computeSmartPriority(fw, context);
    if (fw.priority !== result.priority) changedCount++;
    fw.priority = result.priority;
    fw.aiReason = result.reason;
  });

  renderFutureWorks();
  scheduleSave();

  const msg = changedCount > 0
    ? `✦ ${changedCount} priorité(s) reclassée(s)`
    : `✦ Priorités déjà cohérentes`;

  toast(msg, {
    undo: () => {
      snapshot.forEach(s => {
        const fw = state.futureWorks.find(f => f.id === s.id);
        if (fw) {
          fw.priority = s.priority;
          fw.aiReason = s.aiReason;
        }
      });
      renderFutureWorks();
      scheduleSave();
      toast('Tri annulé');
    }
  });
}

// ========================================================================
// FUTURE WORKS MODAL (add/edit)
// ========================================================================
// Edit/create state for future works modal
let editingFwId = null;

function openFutureModal(fwId) {
  editingFwId = fwId || null;
  const titleEl = document.getElementById('fw-modal-title');
  if (editingFwId) {
    const fw = state.futureWorks.find(f => f.id === editingFwId);
    if (!fw) { editingFwId = null; return openFutureModal(); }
    if (titleEl) titleEl.textContent = 'Éditer un travail à prévoir';
    document.getElementById('fw-title').value = fw.title || '';
    document.getElementById('fw-desc').value = fw.desc || '';
    document.getElementById('fw-cost').value = fw.cost || '';
    document.getElementById('fw-deadline').value = fw.deadline || '';
    document.getElementById('fw-priority').value = String(fw.priority || 2);
  } else {
    if (titleEl) titleEl.textContent = 'Nouveau travail à prévoir';
    document.getElementById('fw-title').value = '';
    document.getElementById('fw-desc').value = '';
    document.getElementById('fw-cost').value = '';
    document.getElementById('fw-deadline').value = '';
    document.getElementById('fw-priority').value = '2';
  }
  openModal('future-modal');
  setTimeout(() => document.getElementById('fw-title').focus(), 120);
}

document.getElementById('fw-save').addEventListener('click', () => {
  const title = document.getElementById('fw-title').value.trim();
  if (!title) { toast('Donnez au moins un titre'); return; }
  const data = {
    title,
    desc: document.getElementById('fw-desc').value.trim(),
    cost: parseFloat(document.getElementById('fw-cost').value) || null,
    priority: parseInt(document.getElementById('fw-priority').value, 10),
    deadline: document.getElementById('fw-deadline').value || null
  };
  if (editingFwId) {
    const fw = state.futureWorks.find(f => f.id === editingFwId);
    if (fw) Object.assign(fw, data);
    editingFwId = null;
    closeModal('future-modal');
    renderFutureWorks();
    scheduleSave();
    toast('Travail mis à jour');
  } else {
    const fw = Object.assign({ id: 'fw-' + Date.now() }, data);
    state.futureWorks.push(fw);
    closeModal('future-modal');
    renderFutureWorks();
    scheduleSave();
    toast('Travail ajouté');
  }
});

// ========================================================================
// CALENDAR EXPORT (.ics + Google Calendar)
// ========================================================================
// Note: formatICSDate lives in utils.js

function buildICS() {
  const proj = state.active;
  const projLabel = proj.shortName || proj.name;
  const projLocation = proj.address || proj.location || '';
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:-//Chantier ${projLabel}//FR`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH'
  ];

  state.milestones.forEach(m => {
    const dt = formatICSDate(m.date);
    const end = formatICSDate(new Date(new Date(m.date).getTime() + 86400000).toISOString());
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${m.id}@chantier-${proj.id}`);
    lines.push(`DTSTAMP:${dt}T090000Z`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:Chantier ${projLabel} · ${m.title}`);
    lines.push(`DESCRIPTION:${m.sub}${projLocation ? ' — ' + projLocation : ''}`);
    if (projLocation) lines.push(`LOCATION:${projLocation.replace(/,/g, '\\,')}`);
    lines.push('END:VEVENT');
  });

  state.payments.filter(p => p.paidOn || p.invoicedOn).forEach(p => {
    const date = p.paidOn || p.invoicedOn;
    const dt = formatICSDate(date);
    const end = formatICSDate(new Date(new Date(date).getTime() + 86400000).toISOString());
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:pay-${p.id}@chantier-${proj.id}`);
    lines.push(`DTSTAMP:${dt}T090000Z`);
    lines.push(`DTSTART;VALUE=DATE:${dt}`);
    lines.push(`DTEND;VALUE=DATE:${end}`);
    lines.push(`SUMMARY:Paiement ${p.ref} · ${p.amount.toLocaleString('fr-FR')} €`);
    lines.push(`DESCRIPTION:${p.desc}`);
    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n');
}

document.getElementById('ics-download').addEventListener('click', () => {
  const ics = buildICS();
  const blob = new Blob([ics], { type: 'text/calendar' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  const safeName = (state.active.shortName || state.active.name || 'projet')
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '-');
  a.download = `chantier-${safeName}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Fichier .ics téléchargé — importez-le dans Google Agenda');
});

function gcalUrl(m) {
  const proj = state.active;
  const projLabel = proj.shortName || proj.name;
  const dt = formatICSDate(m.date);
  const end = formatICSDate(new Date(new Date(m.date).getTime() + 86400000).toISOString());
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: `Chantier ${projLabel} · ${m.title}`,
    dates: `${dt}/${end}`,
    details: `${m.sub}${proj.subtitle ? ' — ' + proj.subtitle : ''}`,
    location: proj.address || proj.location || ''
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function renderCalEvents() {
  const wrap = document.getElementById('cal-events');
  wrap.innerHTML = '';
  state.milestones.forEach(m => {
    const el = document.createElement('div');
    el.className = 'cal-event';
    el.innerHTML = `
      <div class="date">${formatDateShort(m.date)}</div>
      <div class="t">${m.title} <span style="color: var(--text-3); font-weight: 400;">· ${m.sub}</span></div>
      <a class="gcal" href="${gcalUrl(m)}" target="_blank" rel="noopener">+ Agenda</a>
    `;
    wrap.appendChild(el);
  });
}

// ========================================================================
// COMMAND PALETTE (Cmd/Ctrl+K)
// ========================================================================
const ICONS = {
  section:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>',
  document:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
  work:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>',
  future:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>',
  milestone: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>',
  action:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="13 17 18 12 13 7"/><polyline points="6 17 11 12 6 7"/></svg>',
  project:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>'
};

function cmdkBuildItems() {
  const items = [];
  // Sections
  [
    { id: 'overview', label: 'Vue d\'ensemble' },
    { id: 'assistant', label: 'Assistant' },
    { id: 'timeline', label: 'Chronologie' },
    { id: 'works', label: 'Travaux planifiés' },
    { id: 'future-works', label: 'Travaux à prévoir' },
    { id: 'finance', label: 'Financement' },
    { id: 'payments', label: 'Paiements' },
    { id: 'documents', label: 'Documents' },
    { id: 'contacts', label: 'Contacts' }
  ].forEach(s => {
    const el = document.getElementById(s.id);
    if (el && el.offsetParent !== null) {
      items.push({
        group: 'Navigation', icon: 'section',
        title: s.label,
        sub: 'Aller à la section',
        action: () => { el.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
      });
    }
  });
  // Projects
  Object.values(projects).forEach(p => {
    if (p.id !== activeProjectId) {
      items.push({
        group: 'Projets', icon: 'project',
        title: `Basculer vers ${p.name}`,
        sub: `${p.location} · ${p.region}`,
        action: () => switchProject(p.id)
      });
    }
  });
  // Actions
  const acts = [
    { title: 'Ajouter un document', sub: 'Importer un PDF / image', fn: () => document.getElementById('file-input').click() },
    { title: 'Coller un email', sub: 'Extraction auto', fn: () => openModal('paste-modal') },
    { title: 'Exporter l\'agenda', sub: 'Fichier .ics ou Google Agenda', fn: () => openModal('calendar-modal') },
    { title: 'Ajouter un travail à prévoir', sub: 'Nouveau chantier futur', fn: () => openFutureModal() }
  ];
  acts.forEach(a => items.push({
    group: 'Actions', icon: 'action', title: a.title, sub: a.sub, action: a.fn
  }));
  // Documents
  (state.documents || []).forEach(d => items.push({
    group: 'Documents', icon: 'document',
    title: d.title, sub: d.sub, meta: d.date,
    action: () => { document.getElementById('documents').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
  // Works
  (state.works || []).forEach(w => items.push({
    group: 'Travaux planifiés', icon: 'work',
    title: w.title + (w.emTitle ? ' ' + w.emTitle : ''),
    sub: `N° ${String(w.num).padStart(2, '0')} · ${w.category} · ${w.artisan}`,
    meta: w.amount ? `${w.amount.toLocaleString('fr-FR')} € HT` : '',
    action: () => { document.getElementById('works').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
  // Future works
  (state.futureWorks || []).forEach(fw => items.push({
    group: 'Travaux à prévoir', icon: 'future',
    title: fw.title, sub: fw.desc || 'Pas de description',
    meta: fw.deadline ? formatDateFr(fw.deadline) : 'Sans date',
    action: () => openFutureModal(fw.id)
  }));
  // Milestones
  (state.milestones || []).forEach(m => items.push({
    group: 'Jalons', icon: 'milestone',
    title: m.title, sub: m.sub || '',
    meta: formatDateFr(m.date),
    action: () => { document.getElementById('timeline').scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }));
  return items;
}

const cmdk = {
  open: false,
  items: [],
  filtered: [],
  active: 0
};

function cmdkOpen() {
  cmdk.open = true;
  cmdk.items = cmdkBuildItems();
  cmdk.filtered = cmdk.items;
  cmdk.active = 0;
  document.getElementById('cmdk-overlay').classList.add('active');
  const input = document.getElementById('cmdk-input');
  input.value = '';
  cmdkRender();
  setTimeout(() => input.focus(), 50);
}

function cmdkClose() {
  cmdk.open = false;
  document.getElementById('cmdk-overlay').classList.remove('active');
}

function cmdkSearch(q) {
  const nq = (q || '').toLowerCase().trim();
  if (!nq) {
    cmdk.filtered = cmdk.items;
  } else {
    cmdk.filtered = cmdk.items.filter(it => {
      const hay = (it.title + ' ' + (it.sub || '') + ' ' + it.group).toLowerCase();
      return hay.includes(nq);
    });
  }
  cmdk.active = 0;
  cmdkRender();
}

function cmdkRender() {
  const results = document.getElementById('cmdk-results');
  const count = document.getElementById('cmdk-count');
  results.innerHTML = '';
  count.textContent = `${cmdk.filtered.length} résultat${cmdk.filtered.length > 1 ? 's' : ''}`;

  if (!cmdk.filtered.length) {
    results.innerHTML = '<div class="cmdk-empty">Aucun résultat — essayez un autre mot.</div>';
    return;
  }

  // Group by group
  const groups = {};
  cmdk.filtered.forEach((it, i) => {
    it._idx = i;
    if (!groups[it.group]) groups[it.group] = [];
    groups[it.group].push(it);
  });

  // Maintain a stable order of groups
  const groupOrder = ['Navigation', 'Actions', 'Projets', 'Documents', 'Travaux planifiés', 'Travaux à prévoir', 'Jalons'];
  groupOrder.forEach(g => {
    if (!groups[g]) return;
    const label = document.createElement('div');
    label.className = 'cmdk-group-label';
    label.textContent = g;
    results.appendChild(label);
    groups[g].forEach(it => {
      const el = document.createElement('div');
      el.className = 'cmdk-item' + (it._idx === cmdk.active ? ' active' : '');
      el.dataset.idx = it._idx;
      el.innerHTML = `
        <div class="cmdk-icon-box">${ICONS[it.icon] || ICONS.section}</div>
        <div class="cmdk-body">
          <div class="cmdk-title">${it.title}</div>
          <div class="cmdk-sub">${it.sub || ''}</div>
        </div>
        ${it.meta ? `<div class="cmdk-meta">${it.meta}</div>` : ''}
      `;
      el.addEventListener('click', () => cmdkActivate(it._idx));
      el.addEventListener('mouseenter', () => {
        cmdk.active = it._idx;
        cmdkUpdateActive();
      });
      results.appendChild(el);
    });
  });
  cmdkScrollActive();
}

function cmdkUpdateActive() {
  document.querySelectorAll('.cmdk-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.idx, 10) === cmdk.active);
  });
  cmdkScrollActive();
}

function cmdkScrollActive() {
  const el = document.querySelector('.cmdk-item.active');
  if (el) el.scrollIntoView({ block: 'nearest' });
}

function cmdkActivate(idx) {
  const item = cmdk.filtered[idx];
  if (!item) return;
  cmdkClose();
  setTimeout(() => { try { item.action(); } catch (e) { console.error(e); } }, 80);
}

// Wire UI
document.getElementById('cmdk-trigger').addEventListener('click', cmdkOpen);
document.getElementById('cmdk-input').addEventListener('input', e => cmdkSearch(e.target.value));
document.getElementById('cmdk-overlay').addEventListener('click', e => {
  if (e.target.id === 'cmdk-overlay') cmdkClose();
});

// Keyboard
document.addEventListener('keydown', e => {
  // Open
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
    e.preventDefault();
    if (cmdk.open) cmdkClose(); else cmdkOpen();
    return;
  }
  if (!cmdk.open) return;
  if (e.key === 'Escape') { e.preventDefault(); cmdkClose(); }
  else if (e.key === 'ArrowDown') {
    e.preventDefault();
    cmdk.active = Math.min(cmdk.filtered.length - 1, cmdk.active + 1);
    cmdkUpdateActive();
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    cmdk.active = Math.max(0, cmdk.active - 1);
    cmdkUpdateActive();
  } else if (e.key === 'Enter') {
    e.preventDefault();
    cmdkActivate(cmdk.active);
  }
});
