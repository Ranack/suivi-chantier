// ui.js - toast notifications + modal open/close helpers

// ========================================================================
// TOAST
// ========================================================================
let _toastTimer = null;
function toast(text, opts) {
  opts = opts || {};
  const t = document.getElementById('toast');
  document.getElementById('toast-text').textContent = text;
  // Remove any previous undo button
  const old = t.querySelector('.toast-undo');
  if (old) old.remove();
  t.classList.remove('has-undo');
  if (opts.undo) {
    const btn = document.createElement('button');
    btn.className = 'toast-undo';
    btn.textContent = 'Annuler';
    btn.addEventListener('click', () => {
      try { opts.undo(); } catch (e) { console.error(e); }
      t.classList.remove('show');
      if (_toastTimer) clearTimeout(_toastTimer);
    });
    t.appendChild(btn);
    t.classList.add('has-undo');
  }
  t.classList.add('show');
  if (_toastTimer) clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove('show'), opts.undo ? 5500 : 2800);
}

// ========================================================================
// MODAL
// ========================================================================
function openModal(id) {
  document.getElementById(id).classList.add('active');
  if (id === 'calendar-modal') renderCalEvents();
}
function closeModal(id) { document.getElementById(id).classList.remove('active'); }
document.querySelectorAll('.modal-overlay').forEach(o => {
  o.addEventListener('click', e => { if (e.target === o) o.classList.remove('active'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.active').forEach(m => m.classList.remove('active'));
});
