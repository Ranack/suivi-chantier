// properties.js - property add / edit / delete + management panel

// ========================================================================
// PROPERTY MANAGEMENT
// ========================================================================
// Helpers (_slugify, _generatePropertyId, _generateInitials) are in utils.js

let _editingPropertyId = null;

function openPropertyModal(propertyId) {
  _editingPropertyId = propertyId;
  const title = document.getElementById('property-modal-title');
  const saveBtn = document.getElementById('prop-save-btn');

  const fields = {
    name: document.getElementById('prop-name'),
    shortName: document.getElementById('prop-shortname'),
    initials: document.getElementById('prop-initials'),
    location: document.getElementById('prop-location'),
    region: document.getElementById('prop-region'),
    address: document.getElementById('prop-address'),
    hasFinancials: document.getElementById('prop-hasfinancials'),
    totalCost: document.getElementById('prop-totalcost'),
    mprAmount: document.getElementById('prop-mpramount'),
    ambAmount: document.getElementById('prop-ambamount')
  };

  if (propertyId) {
    const p = projects[propertyId];
    if (!p) return;
    title.textContent = 'Modifier la propriété';
    saveBtn.textContent = 'Mettre à jour';
    fields.name.value       = p.name || '';
    fields.shortName.value  = p.shortName || '';
    fields.initials.value   = p.initials || '';
    fields.location.value   = p.location || '';
    fields.region.value     = p.region || '';
    fields.address.value    = (p.address || '').replace(/^\[|\]$/g, '');
    fields.hasFinancials.checked = !!p.hasFinancials;
    fields.totalCost.value  = p.totalCost || '';
    fields.mprAmount.value  = p.mprAmount || '';
    fields.ambAmount.value  = p.ambAmount || '';
  } else {
    title.textContent = 'Nouvelle propriété';
    saveBtn.textContent = 'Créer';
    Object.values(fields).forEach(f => {
      if (f.type === 'checkbox') f.checked = false;
      else f.value = '';
    });
  }
  _refreshPropertyFinanceSection();
  openModal('property-modal');
  setTimeout(() => fields.name.focus(), 60);
}

function _refreshPropertyFinanceSection() {
  const checked = document.getElementById('prop-hasfinancials').checked;
  document.getElementById('prop-finance-section').classList.toggle('disabled', !checked);
}
document.getElementById('prop-hasfinancials').addEventListener('change', _refreshPropertyFinanceSection);

// Auto-suggest initials as the user types the name (only if user hasn't typed any)
document.getElementById('prop-name').addEventListener('input', e => {
  const initialsField = document.getElementById('prop-initials');
  if (!initialsField.dataset.userEdited) {
    initialsField.value = _generateInitials(e.target.value);
  }
});
document.getElementById('prop-initials').addEventListener('input', e => {
  e.target.dataset.userEdited = e.target.value ? '1' : '';
  e.target.value = e.target.value.toUpperCase().slice(0, 3);
});

document.getElementById('prop-save-btn').addEventListener('click', () => {
  const name = document.getElementById('prop-name').value.trim();
  if (!name) {
    toast('Donnez un nom à la propriété');
    document.getElementById('prop-name').focus();
    return;
  }
  const hasFin = document.getElementById('prop-hasfinancials').checked;
  const location = document.getElementById('prop-location').value.trim();
  const region   = document.getElementById('prop-region').value.trim();
  const data = {
    name,
    shortName: document.getElementById('prop-shortname').value.trim() || name,
    initials: document.getElementById('prop-initials').value.trim().toUpperCase().slice(0, 3) || _generateInitials(name),
    location,
    region,
    address: document.getElementById('prop-address').value.trim(),
    hasFinancials: hasFin,
    hasWorks: hasFin,
    totalCost: hasFin ? (parseFloat(document.getElementById('prop-totalcost').value) || 0) : 0,
    mprAmount: hasFin ? (parseFloat(document.getElementById('prop-mpramount').value) || 0) : 0,
    ambAmount: hasFin ? (parseFloat(document.getElementById('prop-ambamount').value) || 0) : 0,
    tagline:   (hasFin ? 'Rénovation en cours' : 'Sans chantier en cours') + (region ? ' · ' + region : ''),
    badge:     hasFin ? 'Chantier actif' : 'Résidence secondaire',
    titleName: document.getElementById('prop-shortname').value.trim() || name,
    titleEm:   location ? '— ' + location + '.' : '',
    subtitle:  location || '',
    description: '',
    meta: { dpe: '—', sauts: '—', cat: '—', duree: '—' }
  };

  if (_editingPropertyId && projects[_editingPropertyId]) {
    // Edit existing — preserve existing collections
    const p = projects[_editingPropertyId];
    Object.assign(p, data);
    const editedId = _editingPropertyId;
    _editingPropertyId = null;
    closeModal('property-modal');
    renderProjectSwitcher();
    if (editedId === activeProjectId) {
      document.title = `${p.name} · Chantier`;
      updateHero();
      renderAll();
    }
    // Refresh manage modal if open
    if (document.getElementById('manage-properties-modal').classList.contains('active')) {
      renderManageProperties();
    }
    scheduleSave();
    toast('Propriété mise à jour');
  } else {
    // Create new — initialize empty collections then auto-switch to it
    const id = _generatePropertyId(name);
    projects[id] = Object.assign({ id }, data, {
      payments: [],
      milestones: [],
      documents: [],
      knowledge: [],
      works: [],
      futureWorks: []
    });
    _editingPropertyId = null;
    closeModal('property-modal');
    // Auto-switch so the user immediately sees their new empty project
    const previousActiveId = activeProjectId;
    activeProjectId = id;
    document.title = `${data.name} · Chantier`;
    renderProjectSwitcher();
    updateHero();
    renderAll();
    // Refresh manage modal if open
    if (document.getElementById('manage-properties-modal').classList.contains('active')) {
      renderManageProperties();
    }
    scheduleSave();
    toast(`« ${name} » ajoutée et activée`, {
      undo: () => {
        delete projects[id];
        activeProjectId = previousActiveId;
        document.title = `${projects[previousActiveId].name} · Chantier`;
        renderProjectSwitcher();
        updateHero();
        renderAll();
        if (document.getElementById('manage-properties-modal').classList.contains('active')) {
          renderManageProperties();
        }
        scheduleSave();
        toast('Création annulée');
      }
    });
  }
});

function openManagePropertiesModal() {
  renderManageProperties();
  openModal('manage-properties-modal');
}

function renderManageProperties() {
  const list = document.getElementById('prop-list');
  const entries = Object.values(projects);
  list.innerHTML = '';
  entries.forEach(p => {
    const row = document.createElement('div');
    row.className = 'prop-row' + (p.id === activeProjectId ? ' active' : '');
    const markClass = p.hasFinancials ? 'primary' : 'secondary';
    const onlyOne = entries.length <= 1;
    row.innerHTML = `
      <div class="prop-mark ${markClass}">${p.initials || _generateInitials(p.name)}</div>
      <div class="prop-info">
        <div class="prop-name">
          ${p.name}
          ${p.id === activeProjectId ? '<span class="active-tag">Active</span>' : ''}
        </div>
        <div class="prop-meta">${[p.location, p.region].filter(Boolean).join(' · ') || '—'}</div>
      </div>
      <div class="prop-actions">
        <button data-act="switch" data-id="${p.id}" title="Activer ce projet" ${p.id === activeProjectId ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
        <button data-act="edit" data-id="${p.id}" title="Modifier">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
        </button>
        <button class="prop-del" data-act="del" data-id="${p.id}" title="Supprimer" ${onlyOne ? 'disabled' : ''}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
        </button>
      </div>
    `;
    list.appendChild(row);
  });
  // Wire actions
  list.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      const act = btn.dataset.act;
      if (act === 'switch') {
        switchProject(id);
        renderManageProperties();
      } else if (act === 'edit') {
        closeModal('manage-properties-modal');
        openPropertyModal(id);
      } else if (act === 'del') {
        deleteProperty(id);
      }
    });
  });
}

function deleteProperty(id) {
  if (!projects[id]) return;
  if (Object.keys(projects).length <= 1) {
    toast('Impossible — c\'est la seule propriété');
    return;
  }
  const removed = projects[id];
  const wasActive = id === activeProjectId;
  // Take a structural snapshot for undo
  const snapshot = JSON.parse(JSON.stringify(removed));
  delete projects[id];
  // If we deleted the active project, switch to another
  if (wasActive) {
    activeProjectId = Object.keys(projects)[0];
    document.title = `${projects[activeProjectId].name} · Chantier`;
    updateHero();
    renderAll();
  }
  renderProjectSwitcher();
  renderManageProperties();
  scheduleSave();
  toast(`« ${removed.name} » supprimée`, {
    undo: () => {
      projects[id] = snapshot;
      if (wasActive) {
        activeProjectId = id;
        document.title = `${snapshot.name} · Chantier`;
        updateHero();
        renderAll();
      }
      renderProjectSwitcher();
      renderManageProperties();
      scheduleSave();
      toast('Suppression annulée');
    }
  });
}
