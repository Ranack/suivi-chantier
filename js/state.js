// state.js - data layer: storage primitives + projects seed + state proxy

// ========================================================================
// PERSISTENT STORAGE (localStorage)
// ========================================================================
const STORAGE_KEY = 'chantier-dashboard-state';

function loadStateFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed._version === 1 && parsed.projects) return parsed;
  } catch (e) { console.warn('loadStateFromStorage:', e); }
  return null;
}

let _saveTimer = null;
let _lastSaveAt = null;

function _serializeState() {
  // Strip transient flags before saving
  const cleanProjects = JSON.parse(JSON.stringify(projects));
  Object.values(cleanProjects).forEach(p => {
    (p.milestones || []).forEach(m => delete m.isNew);
    (p.works || []).forEach(w => delete w.isNew);
    (p.documents || []).forEach(d => delete d.isNew);
  });
  return {
    _version: 1,
    savedAt: new Date().toISOString(),
    projects: cleanProjects,
    activeProjectId
  };
}

function saveStateNow() {
  try {
    const data = _serializeState();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    _lastSaveAt = Date.now();
    renderSaveIndicator();
  } catch (e) {
    console.warn('saveStateNow failed:', e);
    // If quota exceeded, show toast
    if (typeof toast === 'function') toast('Sauvegarde impossible — espace local saturé');
  }
}

function scheduleSave() {
  if (_saveTimer) clearTimeout(_saveTimer);
  _saveTimer = setTimeout(saveStateNow, 400);
}

window.addEventListener('beforeunload', () => {
  if (_saveTimer) { clearTimeout(_saveTimer); saveStateNow(); }
});

function exportStateToFile() {
  const data = _serializeState();
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const date = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `chantier-${date}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast('Sauvegarde téléchargée');
}

function renderSaveIndicator() {
  const status = document.getElementById('save-status');
  const time = document.getElementById('save-time');
  if (!status || !time) return;
  if (!_lastSaveAt) {
    status.textContent = 'En attente';
    time.textContent = 'rien à sauvegarder';
    return;
  }
  status.textContent = 'Sauvegardé';
  const secs = Math.round((Date.now() - _lastSaveAt) / 1000);
  if (secs < 5) time.textContent = "à l'instant";
  else if (secs < 60) time.textContent = `il y a ${secs} sec`;
  else if (secs < 3600) time.textContent = `il y a ${Math.round(secs / 60)} min`;
  else time.textContent = `il y a ${Math.round(secs / 3600)} h`;
}
// Refresh the indicator every 15 sec so "il y a X min" stays accurate
setInterval(renderSaveIndicator, 15000);


// ========================================================================
// PHOTO STORAGE (IndexedDB)
// ========================================================================
// localStorage caps around 5-10 MB; photos easily exceed that.
// IndexedDB allows much more (typically up to 50% of free disk).

const PHOTO_DB_NAME = 'chantier-dashboard-photos';
const PHOTO_STORE = 'photos';
let _photoDbPromise = null;

function openPhotoDB() {
  if (_photoDbPromise) return _photoDbPromise;
  _photoDbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(PHOTO_DB_NAME, 1);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(PHOTO_STORE)) {
        db.createObjectStore(PHOTO_STORE, { keyPath: 'id' });
      }
    };
  });
  return _photoDbPromise;
}

async function savePhotoBlob(id, blob, meta) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).put({ id, blob, ...meta });
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getPhotoRecord(id) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readonly');
    const r = tx.objectStore(PHOTO_STORE).get(id);
    r.onsuccess = () => res(r.result || null);
    r.onerror = () => rej(r.error);
  });
}

async function deletePhotoRecord(id) {
  const db = await openPhotoDB();
  return new Promise((res, rej) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    tx.objectStore(PHOTO_STORE).delete(id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

// Compress an image file to fit display use without bloating storage
async function compressImage(file, maxDim = 1800, quality = 0.78) {
  const dataUrl = await new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
  const img = await new Promise((res, rej) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = rej;
    i.src = dataUrl;
  });
  let { width, height } = img;
  if (width > maxDim || height > maxDim) {
    const r = Math.min(maxDim / width, maxDim / height);
    width = Math.round(width * r);
    height = Math.round(height * r);
  }
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  canvas.getContext('2d').drawImage(img, 0, 0, width, height);
  return new Promise((res, rej) => {
    canvas.toBlob(b => b ? res(b) : rej(new Error('toBlob failed')), 'image/jpeg', quality);
  });
}

// In-memory cache of object URLs so we don't recreate them every render
const _photoUrlCache = new Map();
async function getPhotoUrl(id) {
  if (_photoUrlCache.has(id)) return _photoUrlCache.get(id);
  const rec = await getPhotoRecord(id);
  if (!rec || !rec.blob) return null;
  const url = URL.createObjectURL(rec.blob);
  _photoUrlCache.set(id, url);
  return url;
}
function clearPhotoUrl(id) {
  const url = _photoUrlCache.get(id);
  if (url) { URL.revokeObjectURL(url); _photoUrlCache.delete(id); }
}

// ========================================

// ========================================================================
// MULTI-PROJECT STATE (projects seed + active id + state proxy)
// ========================================================================
let projects = {
  main: {
    id: 'main',
    initials: 'MP',
    name: 'Maison principale',
    shortName: 'Principale',
    subtitle: 'Réf. EXEMPLE-001',
    badge: 'Résidence principale',
    location: 'Votre commune',
    region: 'Votre région',
    address: '[Votre adresse complète]',
    tagline: 'Rénovation globale · Démo',
    titleName: 'Maison principale',
    titleEm: '— exemple de chantier.',
    description: "Projet de rénovation énergétique exemple. Remplacez ces données par votre propre projet : importez vos PDF (devis, factures, attribution d'aides), saisissez vos jalons, et le dashboard se met à jour automatiquement.",
    meta: { dpe: 'F', sauts: '4', cat: 'Modeste', duree: '6 mois' },
    totalCost: 100000,
    mprAmount: 40000,
    ambAmount: 4000,
    hasFinancials: true,
    hasWorks: true,
    payments: [
      {
        id: 'pay-acompte',
        ref: 'FA-EXEMPLE-001',
        desc: 'Acompte sur devis',
        amount: 20000,
        invoicedOn: '2026-03-15',
        paidOn: '2026-03-18',
        status: 'paid'
      },
      {
        id: 'pay-solde',
        ref: 'Facture de solde',
        desc: 'Facture de fin de chantier (estimation)',
        amount: 36000,
        invoicedOn: null,
        paidOn: null,
        status: 'upcoming'
      }
    ],
    milestones: [
      { id: 'ms-visite', date: '2025-09-15', title: 'Visite technique', sub: 'Diagnostic préalable', status: 'done' },
      { id: 'ms-devis',  date: '2025-10-20', title: 'Signature du devis', sub: '100 000 € TTC', status: 'done' },
      { id: 'ms-aide',   date: '2026-01-15', title: "Attribution de l'aide", sub: '40 000 €', status: 'done' },
      { id: 'ms-procuration', date: '2026-02-10', title: 'Procuration signée', sub: 'Mandat administratif', status: 'done' },
      { id: 'ms-acompte', date: '2026-03-18', title: 'Acompte payé', sub: '20 000 €', status: 'current' },
      { id: 'ms-demarrage', date: '2026-09-01', title: 'Démarrage chantier', sub: 'À planifier', status: 'upcoming' },
      { id: 'ms-reception', date: '2026-12-31', title: 'Réception des travaux', sub: 'Objectif fin de chantier', status: 'upcoming' }
    ],
    documents: [],
    knowledge: [],
    works: [
      { id: 'w-ite', source: 'devis', num: 1, category: 'Enveloppe', priority: true, status: 'planned', span: 7,
        title: "Isolation par l'extérieur", emTitle: 'ITE',
        specs: [
          '150 m² · ép. 160 mm · R ≥ 4,4',
          'Isolant laine de roche + enduit minéral',
          'Échafaudage et appuis inclus'
        ],
        amount: 35000, artisan: 'Artisan exemple · RGE' },
      { id: 'w-pac', source: 'devis', num: 2, category: 'Chauffage', priority: true, status: 'planned', span: 5,
        title: 'Pompe à chaleur', emTitle: 'air/eau',
        specs: [
          'Puissance 10 kW · A+++',
          'SCOP > 4,5',
          'Régulation connectée'
        ],
        amount: 14000, artisan: 'Artisan exemple · RGE QPAC' },
      { id: 'w-menui', source: 'devis', num: 3, category: 'Ouvertures', priority: false, status: 'planned', span: 6,
        title: 'Menuiseries', emTitle: 'fenêtres & portes',
        specs: [
          '12 fenêtres double vitrage argon',
          'Uw ≤ 1,3',
          '2 portes ALU monobloc'
        ],
        amount: 25000, artisan: 'Menuisier exemple' },
      { id: 'w-vmc', source: 'devis', num: 4, category: 'Air', priority: false, status: 'planned', span: 4,
        title: 'VMC', emTitle: 'hygro-réglable',
        specs: [
          'Type A · classe B',
          'Caisson silencieux',
          'Gaines acoustiques'
        ],
        amount: 4000, artisan: 'Artisan exemple' },
      { id: 'w-comb', source: 'devis', num: 5, category: 'Enveloppe', priority: false, status: 'planned', span: 4,
        title: 'Combles', emTitle: 'perdus',
        specs: [
          'Soufflage R ≥ 7',
          'Trappe et protections',
          'Bilan thermique inclus'
        ],
        amount: 2000, artisan: 'Artisan exemple' }
    ],
    futureWorks: [
      { id: 'fw-jardin', title: 'Aménagement extérieur', desc: 'Terrasse et plantations à étudier après la fin du chantier principal.', cost: 6000, priority: 3, deadline: '2027-04-01', stage: 'idee' },
      { id: 'fw-solaire', title: 'Panneaux solaires', desc: 'Étudier la rentabilité après isolation. Toit bien orienté.', cost: 12000, priority: 2, deadline: null, stage: 'idee' }
    ]
  },
  secondary: {
    id: 'secondary',
    initials: 'RS',
    name: 'Résidence secondaire',
    shortName: 'Secondaire',
    subtitle: 'Maison de vacances',
    badge: 'Résidence secondaire',
    location: 'Votre lieu de vacances',
    region: 'Votre région',
    address: '[Adresse de la résidence]',
    tagline: 'Résidence secondaire · Démo',
    titleName: 'Résidence secondaire',
    titleEm: '— exemple.',
    description: "Deuxième bien, sans chantier en cours. Sert à planifier des travaux futurs en mode brainstorm. Démontre la capacité multi-projet du dashboard.",
    meta: { dpe: '—', sauts: '—', cat: '—', duree: '—' },
    totalCost: 0,
    mprAmount: 0,
    ambAmount: 0,
    hasFinancials: false,
    hasWorks: false,
    payments: [],
    milestones: [
      { id: 'sec-acquis', date: '2020-06-15', title: 'Acquisition', sub: 'Achat du bien', status: 'done' }
    ],
    documents: [],
    knowledge: [],
    works: [],
    futureWorks: [
      { id: 'fw-diag', title: 'État des lieux général', desc: 'Diagnostic complet avant de planifier des travaux : humidité, toiture, menuiseries, plomberie.', cost: null, priority: 1, deadline: '2027-04-15', stage: 'idee' },
      { id: 'fw-toit', title: 'Rénovation toiture', desc: 'À étudier après diagnostic.', cost: null, priority: 2, deadline: null, stage: 'idee' },
      { id: 'fw-salon', title: 'Aménagement salon', desc: 'Repenser l\'espace de vie.', cost: 5000, priority: 3, deadline: null, stage: 'idee' }
    ]
  }
};

let activeProjectId = 'main';

// Restore from localStorage if available (must run before any render).
// Defensive: if the saved state's project IDs don't match the seed schema
// (e.g. you imported a JSON from a different version), ignore it and fall back
// to the seed. Prevents the UI from breaking when keys don't line up.
const _seedKeys = Object.keys(projects);
const _loaded = loadStateFromStorage();
if (_loaded && _loaded.projects && typeof _loaded.projects === 'object') {
  const loadedKeys = Object.keys(_loaded.projects);
  const schemaMatches = loadedKeys.some(k => _seedKeys.includes(k));
  if (schemaMatches) {
    projects = _loaded.projects;
    if (_loaded.activeProjectId && projects[_loaded.activeProjectId]) {
      activeProjectId = _loaded.activeProjectId;
    } else {
      activeProjectId = Object.keys(projects)[0];
    }
  } else {
    console.warn('Stored state has incompatible project IDs — using seed data');
  }
}

// Proxy: keep `state.X` working everywhere; reads/writes go to the active project
const state = {
  get payments()       { return projects[activeProjectId].payments; },
  set payments(v)      { projects[activeProjectId].payments = v; },
  get milestones()     { return projects[activeProjectId].milestones; },
  set milestones(v)    { projects[activeProjectId].milestones = v; },
  get documents()      { return projects[activeProjectId].documents; },
  set documents(v)     { projects[activeProjectId].documents = v; },
  get knowledge()      { return projects[activeProjectId].knowledge; },
  set knowledge(v)     { projects[activeProjectId].knowledge = v; },
  get futureWorks()    { return projects[activeProjectId].futureWorks; },
  set futureWorks(v)   { projects[activeProjectId].futureWorks = v; },
  get works()          { return projects[activeProjectId].works; },
  set works(v)         { projects[activeProjectId].works = v; },
  get active()         { return projects[activeProjectId]; }
};


// ========================================
// KNOWLEDGE BASE (seeded only on first run — populated as you import documents)
// ========================================
// Empty by default. Importing PDFs via the "Documents" section auto-detects and adds
// entries here. You can also push entries manually inside the project definition above.


// ========================================
