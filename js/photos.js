// photos.js - photo gallery modal (avant/apres) + before/after slider + lightbox

// ========================================================================
// PHOTO MODAL UI logic
// ========================================================================
let _photoModalWorkId = null;
let _photoModalTab = 'before';

function ensureWorkPhotos(work) {
  if (!work.photos) work.photos = { before: [], after: [] };
  if (!Array.isArray(work.photos.before)) work.photos.before = [];
  if (!Array.isArray(work.photos.after)) work.photos.after = [];
  return work.photos;
}

function openWorkPhotos(workId) {
  const work = (state.works || []).find(w => w.id === workId);
  if (!work) return;
  ensureWorkPhotos(work);
  _photoModalWorkId = workId;
  _photoModalTab = 'before';
  const titleEl = document.getElementById('photos-modal-title');
  titleEl.textContent = work.title + (work.emTitle ? ' ' + work.emTitle : '');
  switchPhotoTab('before');
  refreshPhotoGrids();
  openModal('photos-modal');
}

function switchPhotoTab(tab) {
  _photoModalTab = tab;
  document.querySelectorAll('.photo-tab').forEach(b =>
    b.classList.toggle('active', b.dataset.tab === tab));
  document.querySelectorAll('.photo-panel').forEach(p =>
    p.classList.toggle('active', p.dataset.panel === tab));
  if (tab === 'compare') refreshCompare();
}

document.querySelectorAll('.photo-tab').forEach(b => {
  b.addEventListener('click', () => switchPhotoTab(b.dataset.tab));
});

async function refreshPhotoGrids() {
  const work = (state.works || []).find(w => w.id === _photoModalWorkId);
  if (!work) return;
  const photos = ensureWorkPhotos(work);
  document.getElementById('count-before').textContent = photos.before.length;
  document.getElementById('count-after').textContent = photos.after.length;
  await renderPhotoGrid('before', photos.before);
  await renderPhotoGrid('after', photos.after);
}

async function renderPhotoGrid(which, ids) {
  const grid = document.getElementById('grid-' + which);
  grid.innerHTML = '';
  if (!ids.length) {
    grid.innerHTML = `<div class="photo-empty" style="grid-column: 1 / -1;">Aucune photo « ${which === 'before' ? 'avant' : 'après'} »</div>`;
    return;
  }
  for (const id of ids) {
    const rec = await getPhotoRecord(id);
    if (!rec) continue;
    const url = await getPhotoUrl(id);
    const wrap = document.createElement('div');
    wrap.className = 'photo-thumb';
    const dateText = rec.takenAt
      ? new Date(rec.takenAt).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' })
      : '';
    wrap.innerHTML = `
      <img src="${url}" alt="photo">
      ${dateText ? `<div class="photo-date">${dateText}</div>` : ''}
      <button class="photo-del" data-id="${id}" title="Supprimer"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
    `;
    wrap.querySelector('img').addEventListener('click', () => openLightbox(url));
    wrap.querySelector('.photo-del').addEventListener('click', e => {
      e.stopPropagation();
      deleteWorkPhoto(_photoModalWorkId, which, id);
    });
    grid.appendChild(wrap);
  }
}

async function addPhotosToWork(workId, which, files) {
  const work = (state.works || []).find(w => w.id === workId);
  if (!work) return;
  const photos = ensureWorkPhotos(work);
  let added = 0;
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    try {
      const blob = await compressImage(file);
      const id = 'p-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      await savePhotoBlob(id, blob, {
        takenAt: file.lastModified || Date.now(),
        type: which,
        workId
      });
      photos[which].push(id);
      added++;
    } catch (e) {
      console.error('photo add failed:', e);
    }
  }
  scheduleSave();
  await refreshPhotoGrids();
  renderWorks();
  if (added > 0) {
    toast(`${added} photo${added > 1 ? 's' : ''} ajoutée${added > 1 ? 's' : ''}`);
  }
}

async function deleteWorkPhoto(workId, which, photoId) {
  const work = (state.works || []).find(w => w.id === workId);
  if (!work) return;
  const photos = ensureWorkPhotos(work);
  const idx = photos[which].indexOf(photoId);
  if (idx < 0) return;
  photos[which].splice(idx, 1);
  await deletePhotoRecord(photoId);
  clearPhotoUrl(photoId);
  scheduleSave();
  await refreshPhotoGrids();
  if (_photoModalTab === 'compare') refreshCompare();
  renderWorks();
  toast('Photo supprimée');
}

// Wire drop zones + file inputs
function wirePhotoUploadFor(which) {
  const drop = document.getElementById('drop-' + which);
  const input = document.getElementById('file-' + which);
  drop.addEventListener('click', () => input.click());
  drop.addEventListener('dragover', e => { e.preventDefault(); drop.classList.add('dragover'); });
  drop.addEventListener('dragleave', () => drop.classList.remove('dragover'));
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.classList.remove('dragover');
    if (_photoModalWorkId && e.dataTransfer.files) {
      addPhotosToWork(_photoModalWorkId, which, e.dataTransfer.files);
    }
  });
  input.addEventListener('change', e => {
    if (_photoModalWorkId) addPhotosToWork(_photoModalWorkId, which, e.target.files);
    e.target.value = '';
  });
}
wirePhotoUploadFor('before');
wirePhotoUploadFor('after');

// Lightbox
function openLightbox(url) {
  document.getElementById('lightbox-img').src = url;
  document.getElementById('lightbox').classList.add('active');
}

// Before/After comparison
async function refreshCompare() {
  const work = (state.works || []).find(w => w.id === _photoModalWorkId);
  if (!work) return;
  const photos = ensureWorkPhotos(work);
  const empty = document.getElementById('ba-empty');
  const sliderWrap = document.getElementById('ba-slider-wrap');
  if (!photos.before.length || !photos.after.length) {
    empty.style.display = '';
    sliderWrap.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  sliderWrap.style.display = '';

  const selBefore = document.getElementById('ba-select-before');
  const selAfter = document.getElementById('ba-select-after');
  selBefore.innerHTML = '';
  selAfter.innerHTML = '';
  photos.before.forEach((id, i) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `Avant #${i + 1}`;
    selBefore.appendChild(opt);
  });
  photos.after.forEach((id, i) => {
    const opt = document.createElement('option');
    opt.value = id;
    opt.textContent = `Après #${i + 1}`;
    selAfter.appendChild(opt);
  });

  async function updateImages() {
    const beforeUrl = await getPhotoUrl(selBefore.value);
    const afterUrl = await getPhotoUrl(selAfter.value);
    document.getElementById('ba-before-img').src = beforeUrl;
    document.getElementById('ba-after-img').src = afterUrl;
  }
  selBefore.onchange = updateImages;
  selAfter.onchange = updateImages;
  await updateImages();
  initBASlider();
}

let _baSliderWired = false;
function initBASlider() {
  if (_baSliderWired) return;
  _baSliderWired = true;
  const slider = document.getElementById('ba-slider');
  const afterWrap = document.getElementById('ba-after-wrap');
  const handle = document.getElementById('ba-handle');

  let dragging = false;
  const setPos = (clientX) => {
    const rect = slider.getBoundingClientRect();
    const pct = Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
    afterWrap.style.width = pct + '%';
    handle.style.left = pct + '%';
  };

  slider.addEventListener('mousedown', e => { dragging = true; setPos(e.clientX); });
  window.addEventListener('mousemove', e => { if (dragging) setPos(e.clientX); });
  window.addEventListener('mouseup', () => { dragging = false; });
  slider.addEventListener('touchstart', e => { dragging = true; setPos(e.touches[0].clientX); });
  window.addEventListener('touchmove', e => { if (dragging) setPos(e.touches[0].clientX); }, { passive: true });
  window.addEventListener('touchend', () => { dragging = false; });
}
