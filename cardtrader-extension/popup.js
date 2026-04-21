/**
 * popup.js — Logica del popup
 * Mostra le wishlist salvate, permette di eliminarle e importare da CSV.
 */

function sendMessage(type, payload) {
  return new Promise(resolve => chrome.runtime.sendMessage({ type, payload }, resolve));
}

function escHtml(str) {
  return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Render lista wishlist ────────────────────────────────────────────────────
async function renderWishlistList() {
  const wishlists = await sendMessage('GET_WISHLISTS', null) || [];
  const container = document.getElementById('wl-list');

  if (!wishlists.length) {
    container.innerHTML = '<div class="empty">Nessuna wishlist salvata.</div>';
    return;
  }

  container.innerHTML = wishlists.map(wl => `
    <div class="wl-item" data-id="${escHtml(wl.id)}">
      <div>
        <div class="wl-item-name">${escHtml(wl.name)}</div>
        <div class="wl-item-meta">${wl.cards.length} carte · ${wl.source === 'csv' ? 'CSV' : 'Pagina CT'}</div>
      </div>
      <button class="wl-delete" data-id="${escHtml(wl.id)}" title="Elimina">✕</button>
    </div>
  `).join('');

  container.querySelectorAll('.wl-delete').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.getAttribute('data-id');
      await sendMessage('DELETE_WISHLIST', { id });
      renderWishlistList();
    });
  });
}

// ─── Import CSV ───────────────────────────────────────────────────────────────
/**
 * Formato CSV atteso (semplice, senza header obbligatorio):
 * Nome carta, Edizione, Condizione, Lingua, Quantità
 * Esempio:
 *   Black Lotus,,Near Mint,EN,1
 *   Mox Pearl,Alpha,,,2
 *
 * Il nome è l'unico campo obbligatorio.
 */
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  const cards = [];

  // Salta prima riga se sembra un header
  const startIdx = lines[0]?.toLowerCase().includes('nome') ? 1 : 0;

  for (let i = startIdx; i < lines.length; i++) {
    const cols = lines[i].split(',').map(c => c.trim());
    const nameRaw = cols[0] || '';
    if (!nameRaw) continue;

    cards.push({
      uuid: crypto.randomUUID(),
      dataId: '',
      name: nameRaw.toLowerCase().trim().replace(/['']/g, "'").replace(/\s+/g, ' '),
      nameRaw,
      edition: cols[1] || '',
      condition: cols[2] || '',
      language: cols[3] || '',
      foil: '',
      quantity: parseInt(cols[4], 10) || 1,
    });
  }

  return cards;
}

document.getElementById('csv-input').addEventListener('change', async function () {
  const file = this.files[0];
  if (!file) return;

  const statusEl = document.getElementById('csv-status');
  const nameInput = document.getElementById('csv-name');

  try {
    const text = await file.text();
    const cards = parseCsv(text);

    if (!cards.length) {
      statusEl.textContent = 'Nessuna carta trovata nel CSV.';
      statusEl.className = 'status err';
      statusEl.style.display = 'block';
      return;
    }

    const name = nameInput.value.trim() || file.name.replace('.csv', '').replace('.txt', '');
    const res = await sendMessage('SAVE_WISHLIST', {
      id: crypto.randomUUID(),
      name,
      cards,
      source: 'csv',
    });

    if (res?.ok) {
      statusEl.textContent = `✓ "${name}" salvata — ${cards.length} carte`;
      statusEl.className = 'status ok';
      nameInput.value = '';
      this.value = '';
      renderWishlistList();
    }
  } catch (e) {
    statusEl.textContent = 'Errore lettura file: ' + e.message;
    statusEl.className = 'status err';
  }

  statusEl.style.display = 'block';
});

// ─── Init ─────────────────────────────────────────────────────────────────────
renderWishlistList();
