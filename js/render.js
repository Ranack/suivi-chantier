// render.js - render functions: progress, timeline, payments, pie, hero, works, future works, docs, notif banner

// ========================================================================
// GLOBAL PROGRESS (phase-weighted)
// ========================================================================
// Admin/finance milestones weigh 30%, chantier work 60%, reception 10%.
const ADMIN_MILESTONE_IDS = ['vt', 'devis', 'amb', 'mpr', 'proc', 'acompte'];
const RECEPTION_MILESTONE_IDS = ['fin'];
const PHASE_WEIGHTS = { admin: 30, travaux: 60, reception: 10 };

function computeProgress() {
  let adminDone = 0, adminTotal = 0;
  let travauxDone = 0, travauxTotal = 0;
  let receptionDone = 0, receptionTotal = 0;

  state.milestones.forEach(m => {
    const credit = m.status === 'done' ? 1 : m.status === 'current' ? 0.5 : 0;
    if (ADMIN_MILESTONE_IDS.includes(m.id)) {
      adminTotal += 1; adminDone += credit;
    } else if (RECEPTION_MILESTONE_IDS.includes(m.id)) {
      receptionTotal += 1; receptionDone += credit;
    } else {
      travauxTotal += 1; travauxDone += credit;
    }
  });

  const adminPct = adminTotal ? adminDone / adminTotal : 0;
  const travauxPct = travauxTotal ? travauxDone / travauxTotal : 0;
  const receptionPct = receptionTotal ? receptionDone / receptionTotal : 0;

  const overall = Math.round(
    adminPct * PHASE_WEIGHTS.admin +
    travauxPct * PHASE_WEIGHTS.travaux +
    receptionPct * PHASE_WEIGHTS.reception
  );

  let phaseName, phaseIdx;
  if (receptionPct >= 0.5)        { phaseName = 'Réception du chantier'; phaseIdx = 5; }
  else if (travauxPct >= 0.5)     { phaseName = 'Travaux avancés';        phaseIdx = 4; }
  else if (travauxPct > 0)        { phaseName = 'Travaux en cours';       phaseIdx = 4; }
  else if (adminPct >= 0.7)       { phaseName = 'Phase préparatoire';     phaseIdx = 3; }
  else if (adminPct >= 0.3)       { phaseName = 'Phase administrative';   phaseIdx = 2; }
  else                            { phaseName = 'Démarches initiales';    phaseIdx = 1; }

  const next = state.milestones.find(m => m.status === 'upcoming');

  return { pct: overall, phaseName, phaseIdx, next };
}

function renderProgress() {
  const CIRCUMFERENCE = 2 * Math.PI * 60;

  // Project without active chantier: show planning state instead of computed %
  if (state.active && !state.active.hasFinancials) {
    const fws = state.futureWorks || [];
    const sortedFw = [...fws].sort((a, b) => (a.priority || 99) - (b.priority || 99));
    const nextFw = sortedFw[0];

    document.getElementById('progress-bar-circle').style.strokeDashoffset = CIRCUMFERENCE;
    document.getElementById('progress-pct').textContent = '0';
    document.getElementById('progress-phase').textContent = 'En planification';
    document.getElementById('progress-badge').textContent = `Phase 0/5`;
    const nextEl = document.getElementById('progress-next');
    if (nextEl) {
      nextEl.innerHTML = nextFw
        ? `Idée prioritaire : <strong>${nextFw.title}</strong>${nextFw.deadline ? ' — ' + formatDateFr(nextFw.deadline) : ''}.`
        : 'Aucun travail planifié — ajoutez vos idées dans la section ci-dessous.';
    }
    return;
  }

  const { pct, phaseName, phaseIdx, next } = computeProgress();

  const circle = document.getElementById('progress-bar-circle');
  if (circle) circle.style.strokeDashoffset = CIRCUMFERENCE * (1 - pct / 100);

  const pctEl = document.getElementById('progress-pct');
  if (pctEl) pctEl.textContent = pct;

  const phaseEl = document.getElementById('progress-phase');
  if (phaseEl) phaseEl.textContent = phaseName;

  const badgeEl = document.getElementById('progress-badge');
  if (badgeEl) badgeEl.textContent = `Phase ${phaseIdx}/5`;

  const nextEl = document.getElementById('progress-next');
  if (nextEl && next) {
    nextEl.innerHTML = `Prochaine étape : <strong>${next.title}</strong>${next.sub ? ' · ' + next.sub : ''}${next.date ? ' — ' + formatDateFr(next.date) : ''}.`;
  } else if (nextEl) {
    nextEl.innerHTML = 'Aucune étape à venir — le chantier est terminé.';
  }
}


// ========================================================================
// TIMELINE RENDER + editMilestoneDate
// ========================================================================
function renderTimeline() {
  const container = document.getElementById('tl-nodes');
  const track = document.querySelector('.tl-track');
  const scrollWrap = document.querySelector('.tl-scroll');
  if (!container) return;

  container.innerHTML = '';

  // 1. Compute progress dynamically: ratio of done (+ half-credit for current) to total
  const total = state.milestones.length || 1;
  const done = state.milestones.filter(m => m.status === 'done').length;
  const current = state.milestones.filter(m => m.status === 'current').length;
  const pct = Math.round(((done + current * 0.5) / total) * 100);
  if (track) track.style.setProperty('--tl-width', pct + '%');

  // 2. Scale the track and node-row width to the number of milestones
  const nodeWidth = 130;
  const minW = Math.max(900, total * nodeWidth);
  if (track) track.style.minWidth = minW + 'px';
  container.style.minWidth = minW + 'px';

  // 3. Render each node
  let newNodeEl = null;
  state.milestones.forEach(m => {
    const cls = m.status === 'done' ? 'done' : m.status === 'current' ? 'current' : '';
    const isFresh = m.isNew === true;
    const el = document.createElement('div');
    el.className = `tl-node ${cls}${isFresh ? ' tl-fresh' : ''}`;
    el.innerHTML = `
      <div class="date editable" data-id="${m.id}" title="Cliquer pour décaler la date">${formatDateShort(m.date)}</div>
      <div class="dot"></div>
      <div class="lbl">${m.title}</div>
      <div class="sub">${m.sub}</div>
    `;
    container.appendChild(el);
    if (isFresh) newNodeEl = el;
  });

  // Wire date editing
  container.querySelectorAll('.date.editable').forEach(dateEl => {
    dateEl.addEventListener('click', () => editMilestoneDate(dateEl.dataset.id, dateEl));
  });

  // 4. Auto-scroll horizontally to bring a newly-added node into view
  if (newNodeEl && scrollWrap) {
    setTimeout(() => {
      const left = newNodeEl.offsetLeft - scrollWrap.clientWidth / 2 + nodeWidth / 2;
      scrollWrap.scrollTo({ left: Math.max(0, left), behavior: 'smooth' });
      setTimeout(() => {
        state.milestones.forEach(m => { if (m.isNew) delete m.isNew; });
      }, 2500);
    }, 100);
  }

  // 5. Keep the global "Avancement" donut in sync
  renderProgress();
}
renderTimeline();

// Inline-edit a milestone date directly on the timeline
function editMilestoneDate(milestoneId, dateEl) {
  const m = state.milestones.find(x => x.id === milestoneId);
  if (!m) return;
  const oldDate = m.date;

  // Build an inline date input
  const input = document.createElement('input');
  input.type = 'date';
  input.value = oldDate;
  input.className = 'tl-date-input';
  dateEl.replaceWith(input);
  input.focus();
  // Some browsers expose showPicker(); call defensively
  try { if (input.showPicker) input.showPicker(); } catch (e) {}

  let committed = false;
  const restore = () => {
    if (committed) return;
    committed = true;
    renderTimeline();
  };
  const commit = () => {
    if (committed) return;
    committed = true;
    const newDate = input.value;
    if (!newDate || newDate === oldDate) {
      renderTimeline();
      return;
    }
    m.date = newDate;
    // Re-sort milestones chronologically
    state.milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderTimeline();
    renderNotificationBanner();
    scheduleSave();
    toast(`« ${m.title} » : ${formatDateFr(oldDate)} → ${formatDateFr(newDate)}`, {
      undo: () => {
        m.date = oldDate;
        state.milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
        renderTimeline();
        renderNotificationBanner();
        scheduleSave();
        toast('Date restaurée');
      }
    });
  };

  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
    else if (e.key === 'Escape') { e.preventDefault(); restore(); }
  });
}


// ========================================================================
// PAYMENTS TABLE + editDate
// ========================================================================
function renderPayments() {
  const tbody = document.getElementById('pay-body');
  tbody.innerHTML = '';
  state.payments.forEach(p => {
    const tr = document.createElement('tr');
    const statusCls = p.status === 'paid' ? 'paid' : p.status === 'pending' ? 'pending' : 'upcoming';
    const statusLbl = p.status === 'paid' ? 'Payée' : p.status === 'pending' ? 'En attente' : 'À venir';
    tr.innerHTML = `
      <td><code style="font-family: 'Geist Mono', monospace; font-size: 12px; color: var(--text-2);">${p.ref}</code></td>
      <td style="color: var(--text-2);">${p.desc}</td>
      <td style="text-align: right; font-family: 'Geist Mono', monospace; font-variant-numeric: tabular-nums; font-weight: 500;">${p.amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</td>
      <td style="font-family: 'Geist Mono', monospace; color: var(--text-2); font-size: 12px;">${p.invoicedOn ? formatDateShort(p.invoicedOn) : '—'}</td>
      <td>
        <button class="pay-date-editable" data-id="${p.id}" data-field="paidOn">
          ${p.paidOn ? formatDateShort(p.paidOn) : '⊕ Définir'}
        </button>
      </td>
      <td><span class="pay-status ${statusCls}"><span class="pulse"></span> ${statusLbl}</span></td>
    `;
    tbody.appendChild(tr);
  });

  // Bind date editors
  document.querySelectorAll('.pay-date-editable').forEach(btn => {
    btn.addEventListener('click', () => editDate(btn));
  });

  // Update summary displayed in card stat
  const paid = state.payments.find(p => p.id === 'fa-124-2026-50');
  document.getElementById('paid-date-display').textContent =
    paid && paid.paidOn ? formatDateShort(paid.paidOn) : '—';
}

function editDate(btn) {
  const id = btn.dataset.id;
  const field = btn.dataset.field;
  const p = state.payments.find(x => x.id === id);
  const input = document.createElement('input');
  input.type = 'date';
  input.value = p[field] || '';
  btn.classList.add('editing');
  btn.innerHTML = '';
  btn.appendChild(input);
  input.focus();

  const commit = () => {
    if (input.value) {
      p[field] = input.value;
      if (field === 'paidOn' && p.status !== 'paid') p.status = 'paid';
      toast('Date de paiement mise à jour');
      scheduleSave();
    }
    updateFinancials();
  };
  input.addEventListener('blur', commit);
  input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); commit(); } });
}

renderPayments();

// ========================================

// ========================================================================
// PIE CHART
// ========================================================================
// These values feed the financing donut chart. They should match the active project's
// totalCost / mprAmount / ambAmount. The donut is hidden if hasFinancials === false.
const TOTAL_TTC = 100000;
const MPR_AMOUNT = 40000;
const AMB_AMOUNT = 4000;

const PIE_SLICES = [
  { id: 'mpr',   name: "Aide principale",    color: '#FF7A45' },
  { id: 'amb',   name: "Bonus / parrainage", color: '#FBBF24' },
  { id: 'paid',  name: "Déjà versé",         color: '#4ADE80' },
  { id: 'remain',name: "Solde à régler",     color: '#6B6B72' }
];

function computePieData() {
  const paid = state.payments
    .filter(p => p.status === 'paid')
    .reduce((s, p) => s + p.amount, 0);

  // Solde restant = Total - MPR - Amb - ce qui est déjà versé
  const remain = Math.max(0, TOTAL_TTC - MPR_AMOUNT - AMB_AMOUNT - paid);

  return {
    mpr: MPR_AMOUNT,
    amb: AMB_AMOUNT,
    paid: paid,
    remain: remain
  };
}

function renderPieChart() {
  const data = computePieData();
  const svgG = document.getElementById('pie-slices');
  const legend = document.getElementById('pie-legend');
  svgG.innerHTML = '';
  legend.innerHTML = '';

  const radius = 70;
  const strokeWidth = 28;
  const cx = 100, cy = 100;
  let cumulative = 0;

  PIE_SLICES.forEach(slice => {
    const amount = data[slice.id];
    const pct = (amount / TOTAL_TTC) * 100;

    // SVG slice
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', cx);
    circle.setAttribute('cy', cy);
    circle.setAttribute('r', radius);
    circle.setAttribute('fill', 'transparent');
    circle.setAttribute('stroke', slice.color);
    circle.setAttribute('stroke-width', strokeWidth);
    circle.setAttribute('pathLength', 100);
    circle.setAttribute('stroke-dasharray', `${pct} ${100 - pct}`);
    circle.setAttribute('stroke-dashoffset', -cumulative);
    circle.setAttribute('data-slice', slice.id);
    circle.classList.add('pie-slice');
    if (slice.id === 'remain') circle.setAttribute('opacity', '0.5');
    circle.style.color = slice.color;
    svgG.appendChild(circle);

    cumulative += pct;

    // Legend item
    const item = document.createElement('div');
    item.className = 'pie-leg-item';
    item.dataset.slice = slice.id;
    const swatchStyle = slice.id === 'remain'
      ? `background: repeating-linear-gradient(-45deg, ${slice.color}, ${slice.color} 2px, transparent 2px, transparent 5px); border: 1px solid ${slice.color};`
      : `background: ${slice.color};`;
    item.innerHTML = `
      <div class="pie-leg-dot" style="${swatchStyle}"></div>
      <div class="pie-leg-info">
        <div class="pie-leg-name">${slice.name}</div>
        <div class="pie-leg-amount">${amount.toLocaleString('fr-FR', { minimumFractionDigits: 2 })} €</div>
      </div>
      <div class="pie-leg-pct">${pct.toFixed(1)}%</div>
    `;
    legend.appendChild(item);
  });

  // Bind interactivity
  bindPieHovers();
}

function bindPieHovers() {
  const center = document.getElementById('pie-center');
  const amountEl = document.getElementById('pie-amount');
  const subEl = document.getElementById('pie-sub');
  const pctEl = document.getElementById('pie-pct');
  const defaults = { amount: amountEl.innerHTML, sub: subEl.textContent };
  const data = computePieData();

  function activate(id) {
    const slice = PIE_SLICES.find(s => s.id === id);
    const amount = data[id];
    const pct = (amount / TOTAL_TTC) * 100;
    document.querySelectorAll('.pie-slice').forEach(c => {
      c.classList.toggle('dim', c.dataset.slice !== id);
      c.classList.toggle('hover', c.dataset.slice === id);
    });
    document.querySelectorAll('.pie-leg-item').forEach(x =>
      x.classList.toggle('active', x.dataset.slice === id)
    );
    amountEl.innerHTML = `${Math.round(amount).toLocaleString('fr-FR')}<span class="unit">€</span>`;
    amountEl.style.color = slice.color;
    subEl.textContent = slice.name;
    pctEl.textContent = `${pct.toFixed(1)}% du coût total`;
    center.classList.add('active');
  }

  function deactivate() {
    document.querySelectorAll('.pie-slice').forEach(c => {
      c.classList.remove('dim');
      c.classList.remove('hover');
    });
    document.querySelectorAll('.pie-leg-item').forEach(x => x.classList.remove('active'));
    amountEl.innerHTML = `104 237<span class="unit">€</span>`;
    amountEl.style.color = '';
    subEl.textContent = 'Coût total TTC';
    pctEl.textContent = '';
    center.classList.remove('active');
  }

  document.querySelectorAll('.pie-slice, .pie-leg-item').forEach(el => {
    el.addEventListener('mouseenter', () => activate(el.dataset.slice));
    el.addEventListener('mouseleave', deactivate);
  });
}


// ========================================================================
// MASTER UPDATE (called whenever financials change)
// ========================================================================
function updateFinancials() {
  renderPayments();
  renderPieChart();

  const data = computePieData();
  const paidStr = data.paid.toLocaleString('fr-FR', { minimumFractionDigits: 2 });
  const remainStr = data.remain.toLocaleString('fr-FR', { minimumFractionDigits: 2 });

  // Acompte card value
  const acompteEl = document.getElementById('acompte-stat-val');
  if (acompteEl) {
    const parts = paidStr.split(',');
    acompteEl.innerHTML = `${parts[0]}<span class="unit">,${parts[1] || '00'} €</span>`;
  }

  // Solde final card value
  const soldeEl = document.getElementById('solde-final-val');
  if (soldeEl) {
    const parts = remainStr.split(',');
    soldeEl.innerHTML = `${parts[0]}<span class="unit">,${parts[1] || '00'} €</span>`;
  }

  // Reste avec bonus inline (already existed)
  const inlineEl = document.getElementById('reste-acompte-inline');
  if (inlineEl) inlineEl.textContent = paidStr + ' €';
}

// Initial render
updateFinancials();


// ========================================================================
// HERO
// ========================================================================
function updateHero() {
  const p = state.active;
  document.getElementById('hero-tagline').textContent = p.tagline;

  const badge = document.getElementById('hero-badge');
  badge.textContent = '● ' + p.badge.toUpperCase();
  // Secondary residences (no active chantier) get the cool green badge
  if (!p.hasFinancials) {
    badge.style.background = 'rgba(74, 222, 128, 0.12)';
    badge.style.color = '#4ADE80';
  } else {
    badge.style.background = '';
    badge.style.color = '';
  }

  document.getElementById('hero-name').textContent = p.titleName + ' ';
  document.getElementById('hero-em').textContent = p.titleEm;
  document.getElementById('hero-desc').textContent = p.description;
  document.getElementById('meta-dpe').textContent = p.meta.dpe;
  document.getElementById('meta-sauts').textContent = p.meta.sauts;
  document.getElementById('meta-cat').textContent = p.meta.cat;
  document.getElementById('meta-duree').textContent = p.meta.duree;

  // Sidebar trigger
  const mark = document.getElementById('ps-mark');
  mark.textContent = p.initials;
  // Secondary residences (no financials) get a cooler gradient; primary gets warm
  mark.style.background = p.hasFinancials
    ? 'linear-gradient(135deg, var(--accent), #FF5A9F)'
    : 'linear-gradient(135deg, #4ADE80, #06B6D4)';
  document.getElementById('ps-name').textContent = p.shortName || p.name;
  document.getElementById('ps-sub').textContent = p.subtitle || '';

  // Show/hide sections based on project capabilities
  document.querySelectorAll('.requires-financials').forEach(el => {
    el.style.display = p.hasFinancials ? '' : 'none';
  });
  document.querySelectorAll('.requires-works').forEach(el => {
    el.style.display = p.hasWorks ? '' : 'none';
  });

  // Sidebar active state
  document.querySelectorAll('.ps-option').forEach(opt => {
    opt.classList.toggle('active', opt.dataset.id === p.id);
  });

  // Modal label
  const fwName = document.getElementById('fw-project-name');
  if (fwName) fwName.textContent = p.name;
}

// ========================================================================
// WORKS RENDER
// ========================================================================
function renderWorks() {
  const grid = document.getElementById('works-grid');
  const card = document.getElementById('works');
  const badge = document.getElementById('works-badge');
  if (!grid) return;

  const works = state.works || [];
  grid.innerHTML = '';

  if (!works.length) {
    grid.innerHTML = `<div class="empty-section" style="grid-column: 1 / -1;">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg></div>
      <div class="empty-title">Aucun poste de travaux planifié</div>
      <div class="empty-sub">Les chantiers planifiés apparaîtront ici. Vous pouvez insérer des travaux depuis la section « Travaux à prévoir » ci-dessous.</div>
    </div>`;
    if (badge) badge.textContent = '0 poste';
    return;
  }

  // Totals for badge
  const totalHT = works.reduce((s, w) => s + (w.amount || 0), 0);
  if (badge) badge.textContent = `${works.length} poste${works.length > 1 ? 's' : ''} · ${totalHT.toLocaleString('fr-FR')} € HT`;

  works.forEach(w => {
    ensureWorkPhotos(w);
    const beforeCount = w.photos.before.length;
    const afterCount = w.photos.after.length;
    const hasPhotos = beforeCount + afterCount > 0;
    const el = document.createElement('div');
    el.className = `work w-${w.span || 4}${w.priority ? ' priority' : ''}${w.source === 'promoted' ? ' from-future' : ''}${w.isNew ? ' is-new' : ''}`;
    el.dataset.id = w.id;
    const statusTag = w.priority ? 'Poste majeur' : (w.source === 'promoted' ? 'Ajouté' : 'Planifié');
    const numStr = String(w.num).padStart(2, '0');
    el.innerHTML = `
      <div class="work-head">
        <span>N° ${numStr} · ${w.category}</span>
        <span class="work-tag">${statusTag}</span>
      </div>
      <h3>${w.title}${w.emTitle ? ` <em>${w.emTitle.startsWith('—') || w.emTitle.startsWith('&') ? '' : '— '}${w.emTitle}</em>` : ''}</h3>
      <ul class="work-specs">
        ${(w.specs || []).map(s => `<li>${s}</li>`).join('')}
      </ul>
      <div class="work-foot">
        <div class="work-amount">${(w.amount || 0).toLocaleString('fr-FR')}<span class="cur"> € HT</span></div>
        <div class="work-artisan">${w.artisan || '—'}</div>
      </div>
      <div class="work-photos-row">
        <button class="work-photos-btn ${hasPhotos ? 'has-photos' : ''}" data-photos-id="${w.id}" title="Photos avant/après">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
          ${hasPhotos ? `<span class="count">${beforeCount} avant · ${afterCount} après</span>` : 'Photos avant/après'}
        </button>
      </div>
    `;
    grid.appendChild(el);
    if (w.isNew) setTimeout(() => { w.isNew = false; }, 700);
  });

  // Wire photo buttons
  grid.querySelectorAll('.work-photos-btn').forEach(btn => {
    btn.addEventListener('click', () => openWorkPhotos(btn.dataset.photosId));
  });
}


// ========================================================================
// FUTURE WORKS RENDER + delete/promote handlers
// ========================================================================
function groupFutureByYear(items) {
  const groups = new Map();
  items.forEach(fw => {
    const year = fw.deadline ? new Date(fw.deadline).getFullYear() : null;
    const key = year ? String(year) : '__untimed';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(fw);
  });
  // Sort: years ascending, then untimed last
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === '__untimed') return 1;
    if (b === '__untimed') return -1;
    return parseInt(a, 10) - parseInt(b, 10);
  });
  return keys.map(k => ({ key: k, items: groups.get(k).sort((a, b) => (a.priority || 99) - (b.priority || 99)) }));
}

function renderFutureWorks() {
  const list = document.getElementById('future-list');
  if (!list) return;
  const fws = state.futureWorks || [];
  list.innerHTML = '';

  if (!fws.length) {
    list.innerHTML = `<div class="empty-section">
      <div class="empty-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg></div>
      <div class="empty-title">Aucun travail planifié</div>
      <div class="empty-sub">Cliquez sur « Ajouter » pour noter une idée de chantier futur.</div>
    </div>`;
    return;
  }

  const groups = groupFutureByYear(fws);
  groups.forEach(({ key, items }) => {
    const group = document.createElement('div');
    group.className = 'fw-year-group';
    const label = key === '__untimed' ? 'Sans échéance' : key;
    const labelCls = key === '__untimed' ? 'fw-year-label untimed' : 'fw-year-label';
    group.innerHTML = `
      <div class="fw-year-head">
        <div class="${labelCls}">${label}</div>
        <div class="fw-year-line"></div>
        <div class="fw-year-count">${items.length} travail${items.length > 1 ? 'aux' : ''}</div>
      </div>
      <div class="fw-year-grid"></div>
    `;
    const grid = group.querySelector('.fw-year-grid');

    items.forEach(fw => {
      const prioLabel = fw.priority === 1 ? 'Priorité haute' : fw.priority === 2 ? 'Priorité moyenne' : 'Priorité basse';
      const el = document.createElement('div');
      el.className = `fw-item priority-${fw.priority}`;
      el.innerHTML = `
        <div class="fw-head">
          <div class="fw-title-row">
            <div class="fw-prio-badge">${prioLabel}</div>
            <div class="fw-title">${fw.title}</div>
          </div>
          <button class="fw-del" data-id="${fw.id}" title="Supprimer">×</button>
        </div>
        ${fw.desc ? `<div class="fw-desc">${fw.desc}</div>` : '<div class="fw-desc" style="font-style: italic; color: var(--text-3);">Pas de description.</div>'}
        ${fw.aiReason ? `<div class="fw-ai-reason"><span class="ai-tag">✦ Analyse</span><span>${fw.aiReason}</span></div>` : ''}
        <div class="fw-meta">
          ${fw.cost ? `<span class="fw-tag cost">${fw.cost.toLocaleString('fr-FR')} €</span>` : '<span class="fw-tag">Coût à estimer</span>'}
          ${fw.deadline ? `<span class="fw-tag deadline">${formatDateFr(fw.deadline)}</span>` : '<span class="fw-tag">Date à définir</span>'}
        </div>
        <div class="fw-actions">
          <button class="fw-promote" data-id="${fw.id}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            Insérer dans les travaux
          </button>
        </div>
      `;
      grid.appendChild(el);
    });
    list.appendChild(group);
  });

  // Bind buttons
  document.querySelectorAll('.fw-del').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const idx = state.futureWorks.findIndex(f => f.id === id);
      if (idx === -1) return;
      const removed = state.futureWorks[idx];
      state.futureWorks.splice(idx, 1);
      renderFutureWorks();
      scheduleSave();
      toast(`« ${removed.title} » supprimé`, {
        undo: () => {
          state.futureWorks.splice(idx, 0, removed);
          renderFutureWorks();
          scheduleSave();
          toast('Restauré');
        }
      });
    });
  });
  document.querySelectorAll('.fw-promote').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      promoteFutureWork(btn.dataset.id);
    });
  });
  // Card body click → edit
  document.querySelectorAll('.fw-item').forEach(card => {
    card.addEventListener('click', e => {
      // Ignore clicks on the action buttons
      if (e.target.closest('.fw-del') || e.target.closest('.fw-promote')) return;
      const id = card.querySelector('.fw-del')?.dataset.id;
      if (id) openFutureModal(id);
    });
  });
}

function promoteFutureWork(fwId) {
  const idx = state.futureWorks.findIndex(f => f.id === fwId);
  if (idx === -1) return;
  const fw = state.futureWorks[idx];

  // Build new work entry
  const nextNum = (state.works || []).length + 1;
  const work = {
    id: 'w-promoted-' + Date.now(),
    source: 'promoted',
    num: nextNum,
    category: 'Ajouté',
    priority: false,
    title: fw.title,
    emTitle: '',
    specs: fw.desc ? [fw.desc] : ['Détails à compléter'],
    amount: fw.cost || 0,
    artisan: 'Artisan à choisir',
    status: 'planned',
    span: 4,
    isNew: true
  };

  if (!state.works) state.works = [];
  state.works.push(work);

  // Create a timeline milestone if there's a deadline
  let milestoneId = null;
  if (fw.deadline) {
    milestoneId = 'm-' + work.id;
    state.milestones.push({
      id: milestoneId,
      date: fw.deadline,
      title: fw.title,
      sub: '✦ Inséré depuis travaux à prévoir',
      status: 'upcoming',
      isNew: true
    });
    state.milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
  }

  // Remove from future
  state.futureWorks.splice(idx, 1);

  // Re-render
  renderWorks();
  renderFutureWorks();
  renderTimeline();
  renderNotificationBanner();

  toast(`« ${fw.title} » inséré dans les travaux`, {
    undo: () => {
      // Remove the work
      const wIdx = state.works.findIndex(w => w.id === work.id);
      if (wIdx > -1) state.works.splice(wIdx, 1);
      // Remove the milestone if any
      if (milestoneId) {
        const mIdx = state.milestones.findIndex(m => m.id === milestoneId);
        if (mIdx > -1) state.milestones.splice(mIdx, 1);
      }
      // Restore the future work
      state.futureWorks.splice(idx, 0, fw);
      renderWorks();
      renderFutureWorks();
      renderTimeline();
      renderNotificationBanner();
      scheduleSave();
      toast('Insertion annulée');
    }
  });
  scheduleSave();

  // Scroll to works section to make the new card visible
  setTimeout(() => {
    document.getElementById('works').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 200);
}


// ========================================================================
// DOCUMENTS RENDER
// ========================================================================
function docIcon(type) {
  const icons = {
    invoice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>',
    user: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>'
  };
  return icons[type] || icons.file;
}

function renderDocs() {
  const list = document.getElementById('docs-list');
  list.innerHTML = '';
  state.documents.forEach((d, i) => {
    const el = document.createElement('div');
    el.className = 'doc-item' + (d.isNew ? ' new' : '');
    el.innerHTML = `
      <div class="doc-icon-sm ${d.userAdded ? 'user' : ''}">${docIcon(d.userAdded ? 'user' : d.icon)}</div>
      <div class="doc-info">
        <div class="title">${d.title}</div>
        <div class="sub">${d.sub}</div>
      </div>
      <div class="doc-ref-sm">${d.ref}</div>
      <div class="doc-date-sm">${d.date}</div>
      <div class="doc-arrow-sm">→</div>
    `;
    list.appendChild(el);
    if (d.isNew) setTimeout(() => d.isNew = false, 500);
  });
  document.getElementById('docs-badge').textContent = `${state.documents.length} pièce${state.documents.length > 1 ? 's' : ''}`;
  document.getElementById('kb-count').textContent = state.documents.length;
}
renderDocs();


// ========================================================================
// NOTIFICATION BANNER (next upcoming event)
// ========================================================================
function renderNotificationBanner() {
  const banner = document.getElementById('notif-banner');
  if (!banner) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find next upcoming milestone (today or future, status not 'done')
  const upcoming = (state.milestones || [])
    .filter(m => m.status !== 'done')
    .filter(m => {
      const d = new Date(m.date);
      d.setHours(0, 0, 0, 0);
      return d >= today;
    })
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const next = upcoming[0];

  if (!next) {
    banner.classList.add('empty');
    return;
  }
  banner.classList.remove('empty');

  const nextDate = new Date(next.date);
  nextDate.setHours(0, 0, 0, 0);
  const diffDays = Math.round((nextDate - today) / (1000 * 60 * 60 * 24));

  document.getElementById('notif-title-text').textContent = next.title;

  let countdownText, countdownClass = '';
  if (diffDays === 0) {
    countdownText = "Aujourd'hui";
    countdownClass = 'urgent';
  } else if (diffDays === 1) {
    countdownText = 'Demain';
    countdownClass = 'urgent';
  } else if (diffDays <= 7) {
    countdownText = `dans ${diffDays} jours`;
    countdownClass = 'urgent';
  } else if (diffDays <= 30) {
    countdownText = `dans ${diffDays} jours`;
  } else if (diffDays <= 90) {
    const weeks = Math.round(diffDays / 7);
    countdownText = `dans ${weeks} semaines`;
  } else {
    const months = Math.round(diffDays / 30);
    countdownText = `dans ${months} mois`;
  }

  const meta = document.getElementById('notif-meta');
  meta.innerHTML = `
    <span class="countdown ${countdownClass}">${countdownText}</span>
    <span>${formatDateFr(next.date)}</span>
    <span style="color: var(--text-3);">·</span>
    <span>${next.sub || ''}</span>
  `;

  banner.onclick = () => {
    document.getElementById('timeline').scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
}
