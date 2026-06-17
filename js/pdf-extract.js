// pdf-extract.js - PDF.js extraction engine + file upload + email paste

// ========================================================================
// EXTRACTION ENGINE
// ========================================================================
// French month name → number (handles accents and lowercase)
const FR_MONTHS = {
  'janvier': 1, 'fevrier': 2, 'mars': 3, 'avril': 4, 'mai': 5, 'juin': 6,
  'juillet': 7, 'aout': 8, 'septembre': 9, 'octobre': 10, 'novembre': 11, 'decembre': 12
};

function parseFrenchDates(text) {
  const re = /(?:lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche)?\s*(\d{1,2})(?:\s*er)?\s+(janvier|f[ée]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[ée]cembre)\s+(\d{4})/gi;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const monthKey = m[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const month = FR_MONTHS[monthKey];
    const year = parseInt(m[3], 10);
    if (!month || day < 1 || day > 31) continue;
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push({ iso, display: m[0].trim().replace(/\s+/g, ' '), index: m.index });
  }
  return out;
}

function parseNumericDates(text) {
  const re = /\b(0?[1-9]|[12][0-9]|3[01])[\/\-.](0?[1-9]|1[012])[\/\-.]((?:19|20)\d\d)\b/g;
  const out = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    const day = parseInt(m[1], 10);
    const month = parseInt(m[2], 10);
    const year = parseInt(m[3], 10);
    const iso = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    out.push({ iso, display: m[0], index: m.index });
  }
  return out;
}

// Event keywords near a date → it's a chantier event, not just a random date
const EVENT_RE = /\b(d[ée]but(?:e|ent|eront?|era|ait?)?s?|d[ée]marr(?:e|ent|er|era|ent)?|commenc(?:e|ent|er|era|eront)|intervention|rendez[- ]vous|r[ée]union|livraison|r[ée]ception|travaux|planifi[ée]e?s?|pr[ée]vu(?:e|es|s)?|installation|pose|visite|d[ée]pose|ach[èe]vement|chantier|finition|raccordement)\b/i;

function detectEvents(text, allDates) {
  return allDates.filter(d => {
    const start = Math.max(0, d.index - 100);
    const end = Math.min(text.length, d.index + d.display.length + 100);
    return EVENT_RE.test(text.slice(start, end));
  });
}

function extractEmailSubject(text) {
  const m = text.match(/(?:^|\n)\s*(?:objet|sujet|subject)\s*[:\-]\s*([^\n\r]+)/i);
  if (m) {
    let title = m[1].trim();
    title = title.replace(/\s*[–\-—]\s*\d.{0,30}$/, '').trim();
    return title.slice(0, 80);
  }
  const lines = text.split('\n').map(l => l.trim()).filter(l => l && l.length > 3 && !/^bonjour|^cordialement|^bien cord/i.test(l));
  return lines[0] ? lines[0].slice(0, 80) : 'Document';
}

function detectOrg(text) {
  const patterns = [
    /(?:par l['']entreprise|par la soci[ée]t[ée]|r[ée]alis[ée]s?\s+par)\s+([A-ZÀ-Ý][\wÀ-ÿ&'\-. ]{2,40})/i,
    /(?:entreprise|soci[ée]t[ée])\s+([A-ZÀ-Ý][\wÀ-ÿ&'\-. ]{2,40})/i
  ];
  for (const re of patterns) {
    const m = text.match(re);
    if (m) {
      let org = m[1].trim().replace(/[,.;].*$/, '').trim();
      // Strip leading determinants captured by case-insensitive regex
      org = org.replace(/^(l['']entreprise|la soci[ée]t[ée]|l['']|la |le |les )\s*/i, '').trim();
      if (org.length >= 2) return org;
    }
  }
  return null;
}

function extractFromText(text) {
  const amountRe = /\b\d{1,3}(?:[ \u00A0]\d{3})*(?:,\d{2})?\s?€/g;
  const refRe = /\b(?:FA|DE|DEVRG|MPR|RAV|KRO|CERFA|P|FR)-?\d[A-Z0-9\-]*/gi;
  const siretRe = /\b\d{14}\b/g;
  const ibanRe = /FR\d{2}(?:[ ]?\d{4}){5}[ ]?\d{3}/g;

  const amounts = [...new Set(text.match(amountRe) || [])].slice(0, 8);
  const refs = [...new Set((text.match(refRe) || []).filter(r => r.length >= 4 && !r.match(/^\d/)))].slice(0, 6);
  const sirets = [...new Set(text.match(siretRe) || [])];
  const ibans = [...new Set(text.match(ibanRe) || [])];

  // Both date formats
  const numericDates = parseNumericDates(text);
  const frenchDates = parseFrenchDates(text);
  const allDates = [...numericDates, ...frenchDates].sort((a, b) => a.index - b.index);
  const seen = new Set();
  const uniqueDates = allDates.filter(d => {
    if (seen.has(d.iso)) return false;
    seen.add(d.iso);
    return true;
  });

  const dates = uniqueDates.map(d => d.display).slice(0, 8);
  const events = detectEvents(text, uniqueDates);
  const org = detectOrg(text);

  let type = 'Document';
  const low = text.toLowerCase();
  if (low.includes('facture')) type = 'Facture';
  else if (low.includes('devis')) type = 'Devis';
  else if (low.includes('procuration')) type = 'Procuration';
  else if (low.includes('maprimerenov') || low.includes('maprimerénov')) type = "MaPrimeRénov'";
  else if (low.includes('ambassadeur')) type = 'Contrat Ambassadeur';
  else if (low.includes('attestation')) type = 'Attestation';
  else if (low.includes('pv ') || low.includes('procès-verbal') || low.includes('proces-verbal')) type = 'Procès-verbal';
  else if (events.length > 0) type = 'Planification chantier';
  else if (low.includes('travaux') || low.includes('chantier') || low.includes('intervention')) type = 'Note de chantier';

  return { type, amounts, dates, refs, sirets, ibans, events, org };
}

function renderExtraction(info, container) {
  let html = `<div style="font-size: 11px; color: var(--text-3); margin-bottom: 14px;">Type détecté : <span style="color: var(--accent); font-weight: 600;">${info.type}</span>${info.org ? ` &nbsp;·&nbsp; Entreprise : <span style="color: var(--accent); font-weight: 600;">${info.org}</span>` : ''}</div>`;

  // Highlight events first — they're the most useful
  if (info.events && info.events.length) {
    html += `<div class="extract-group" style="background: rgba(255, 122, 69, 0.08); border: 1px solid rgba(255, 122, 69, 0.25); border-radius: 10px; padding: 14px 16px; margin-bottom: 16px;">
      <div class="extract-label" style="color: var(--accent);">⏱ Événements de chantier détectés</div>
      <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">` +
      info.events.map(ev => `
        <div style="display: flex; align-items: center; gap: 10px; font-size: 12px;">
          <span class="extract-tag date" style="font-weight: 600;">${ev.display}</span>
          <span style="color: var(--text-2);">→ sera ajouté à la chronologie</span>
        </div>
      `).join('') +
      `</div></div>`;
  }

  if (info.amounts.length) {
    html += `<div class="extract-group"><div class="extract-label">Montants</div><div class="extract-tags">` +
      info.amounts.map(a => `<span class="extract-tag amount">${a.trim()}</span>`).join('') +
      `</div></div>`;
  }
  if (info.dates.length) {
    html += `<div class="extract-group"><div class="extract-label">Dates trouvées</div><div class="extract-tags">` +
      info.dates.map(d => `<span class="extract-tag date">${d}</span>`).join('') +
      `</div></div>`;
  }
  if (info.refs.length) {
    html += `<div class="extract-group"><div class="extract-label">Références</div><div class="extract-tags">` +
      info.refs.map(r => `<span class="extract-tag ref">${r}</span>`).join('') +
      `</div></div>`;
  }
  if (info.sirets.length) {
    html += `<div class="extract-group"><div class="extract-label">SIRET</div><div class="extract-tags">` +
      info.sirets.map(s => `<span class="extract-tag">${s}</span>`).join('') +
      `</div></div>`;
  }
  if (info.ibans.length) {
    html += `<div class="extract-group"><div class="extract-label">IBAN</div><div class="extract-tags">` +
      info.ibans.map(b => `<span class="extract-tag">${b}</span>`).join('') +
      `</div></div>`;
  }
  if (!info.amounts.length && !info.dates.length && !info.refs.length && !info.events.length) {
    html += `<div style="font-size: 13px; color: var(--text-3); font-style: italic;">Aucune donnée structurée détectée. Vous pouvez tout de même ajouter ce document à la base.</div>`;
  }

  container.innerHTML = html;
}

function addDocumentToState(name, info, rawText, sourceLabel) {
  const id = 'user-' + Date.now();
  const today = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const summary = [
    info.events && info.events.length ? `${info.events.length} événement(s)` : '',
    info.amounts[0] ? `Montant ${info.amounts[0]}` : '',
    info.refs[0] ? `Réf ${info.refs[0]}` : '',
    info.org ? info.org : ''
  ].filter(Boolean).join(' · ') || 'Document ajouté manuellement';

  state.documents.unshift({
    id,
    icon: 'user',
    title: name,
    sub: summary,
    ref: info.refs[0] || (info.org || '—'),
    date: today,
    userAdded: true,
    isNew: true
  });

  // Knowledge base entry
  const kwTokens = new Set();
  name.toLowerCase().split(/[ ._\-:–]/).forEach(t => t.length > 2 && kwTokens.add(t));
  info.type.toLowerCase().split(' ').forEach(t => t.length > 2 && kwTokens.add(t));
  info.refs.forEach(r => kwTokens.add(r.toLowerCase()));
  if (info.org) kwTokens.add(info.org.toLowerCase());

  const bodyParts = [];
  bodyParts.push(`Type : <strong>${info.type}</strong>.`);
  if (info.org) bodyParts.push(`Entreprise : <strong>${info.org}</strong>.`);
  if (info.events && info.events.length) {
    const evDesc = info.events.map(e => `<strong>${e.display}</strong>`).join(', ');
    bodyParts.push(`Événement(s) prévu(s) : ${evDesc}.`);
  }
  if (info.amounts.length) bodyParts.push(`Montant(s) : ${info.amounts.map(a => `<strong>${a.trim()}</strong>`).join(', ')}.`);
  if (info.dates.length && !info.events.length) bodyParts.push(`Date(s) : ${info.dates.map(d => `<strong>${d}</strong>`).join(', ')}.`);
  if (info.refs.length) bodyParts.push(`Réf. : ${info.refs.map(r => `<strong>${r}</strong>`).join(', ')}.`);
  if (info.sirets.length) bodyParts.push(`SIRET : <strong>${info.sirets[0]}</strong>.`);
  if (info.ibans.length) bodyParts.push(`IBAN : <strong>${info.ibans[0]}</strong>.`);

  state.knowledge.push({
    id,
    kw: [...kwTokens, 'nouveau', 'ajouté', 'email'],
    title: name,
    body: bodyParts.join(' '),
    source: sourceLabel || name
  });

  // Add milestones for every detected event
  let addedMilestones = 0;
  if (info.events && info.events.length) {
    info.events.forEach((ev, i) => {
      const milestoneTitle = info.events.length > 1
        ? `${name} (${i + 1}/${info.events.length})`
        : name;
      state.milestones.push({
        id: id + '-evt-' + i,
        date: ev.iso,
        title: milestoneTitle.replace(/^Objet\s*:\s*/i, '').slice(0, 50),
        sub: info.org ? info.org : ev.display,
        status: 'upcoming',
        isNew: true
      });
      addedMilestones++;
    });
    state.milestones.sort((a, b) => new Date(a.date) - new Date(b.date));
    renderTimeline();
  }

  renderDocs();
  scheduleSave();
  return addedMilestones;
}


// ========================================================================
// FILE UPLOAD
// ========================================================================
const uploadZone = document.getElementById('upload-zone');
const fileInput = document.getElementById('file-input');

uploadZone.addEventListener('click', () => fileInput.click());
uploadZone.addEventListener('dragover', e => { e.preventDefault(); uploadZone.classList.add('dragover'); });
uploadZone.addEventListener('dragleave', () => uploadZone.classList.remove('dragover'));
uploadZone.addEventListener('drop', e => {
  e.preventDefault();
  uploadZone.classList.remove('dragover');
  handleFiles(e.dataTransfer.files);
});
fileInput.addEventListener('change', e => handleFiles(e.target.files));

async function handleFiles(fileList) {
  for (const file of fileList) await processFile(file);
}

async function processFile(file) {
  uploadZone.querySelector('.upload-title').textContent = `Analyse de ${file.name}...`;
  try {
    let text = '';
    if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
      text = await extractPdfText(file);
    } else if (file.type.startsWith('text/') || file.name.endsWith('.txt')) {
      text = await file.text();
    } else {
      // Image or other — no extraction, just store
      text = '';
    }
    const info = extractFromText(text);
    showExtractModal(file.name, info, text);
  } catch (err) {
    toast('Erreur lors de la lecture du fichier');
    console.error(err);
  } finally {
    uploadZone.querySelector('.upload-title').textContent = 'Déposez un document';
  }
}

async function extractPdfText(file) {
  const buf = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: buf }).promise;
  let text = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    text += content.items.map(it => it.str).join(' ') + '\n';
  }
  return text;
}

function showExtractModal(filename, info, rawText) {
  document.getElementById('extract-filename').textContent = filename;
  renderExtraction(info, document.getElementById('extract-body'));
  const btn = document.getElementById('extract-add-btn');
  btn.onclick = () => {
    const added = addDocumentToState(filename, info, rawText, `Document ajouté — ${filename}`);
    closeModal('extract-modal');
    if (added > 0) {
      toast(`Document ajouté · ${added} événement(s) ajouté(s) à la chronologie`);
    } else {
      toast('Document ajouté à votre dossier');
    }
  };
  openModal('extract-modal');
}


// ========================================================================
// EMAIL PASTE
// ========================================================================
document.getElementById('paste-analyze-btn').addEventListener('click', () => {
  const text = document.getElementById('paste-input').value;
  if (!text.trim()) { toast('Collez d\'abord un email'); return; }
  const info = extractFromText(text);
  renderExtraction(info, document.getElementById('paste-results-body'));
  document.getElementById('paste-results').classList.add('show');
  document.getElementById('paste-save-btn').style.display = 'inline-flex';

  document.getElementById('paste-save-btn').onclick = () => {
    const subject = extractEmailSubject(text);
    const added = addDocumentToState(subject, info, text, 'Email collé');
    closeModal('paste-modal');
    document.getElementById('paste-input').value = '';
    document.getElementById('paste-results').classList.remove('show');
    document.getElementById('paste-save-btn').style.display = 'none';
    if (added > 0) {
      toast(`Email ajouté · ${added} événement(s) ajouté(s) à la chronologie`);
    } else {
      toast('Email ajouté à votre dossier');
    }
  };
});
