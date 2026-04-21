/**
 * background.js — Service Worker
 * Gestisce lo storage delle wishlist e la comunicazione tra content script e popup.
 */

const STORAGE_KEY_WISHLISTS = 'ct_wishlists';
const STORAGE_KEY_LAST_ORDER = 'ct_last_order';

// ─── Handlers messaggi ────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const { type, payload } = message;

  switch (type) {

    // Salva una wishlist con nome e carte
    case 'SAVE_WISHLIST': {
      saveWishlist(payload).then(sendResponse);
      return true; // risposta asincrona
    }

    // Elimina una wishlist per ID
    case 'DELETE_WISHLIST': {
      deleteWishlist(payload.id).then(sendResponse);
      return true;
    }

    // Rinomina una wishlist
    case 'RENAME_WISHLIST': {
      renameWishlist(payload.id, payload.name).then(sendResponse);
      return true;
    }

    // Legge tutte le wishlist salvate
    case 'GET_WISHLISTS': {
      getWishlists().then(sendResponse);
      return true;
    }

    // Salva l'ultimo ordine parsato
    case 'SAVE_ORDER': {
      chrome.storage.local.set({ [STORAGE_KEY_LAST_ORDER]: payload }, () => {
        sendResponse({ ok: true });
      });
      return true;
    }

    // Legge l'ultimo ordine
    case 'GET_ORDER': {
      chrome.storage.local.get(STORAGE_KEY_LAST_ORDER, data => {
        sendResponse(data[STORAGE_KEY_LAST_ORDER] || null);
      });
      return true;
    }

    default:
      sendResponse({ error: 'Messaggio sconosciuto: ' + type });
  }
});

// ─── Funzioni storage ─────────────────────────────────────────────────────────

async function getWishlists() {
  return new Promise(resolve => {
    chrome.storage.local.get(STORAGE_KEY_WISHLISTS, data => {
      resolve(data[STORAGE_KEY_WISHLISTS] || []);
    });
  });
}

async function saveWishlist({ id, name, cards, source }) {
  const wishlists = await getWishlists();
  const existingIdx = wishlists.findIndex(w => w.id === id);

  const entry = {
    id: id || crypto.randomUUID(),
    name,
    cards,
    source,         // 'page' | 'csv'
    savedAt: Date.now(),
  };

  if (existingIdx >= 0) {
    wishlists[existingIdx] = entry;
  } else {
    wishlists.push(entry);
  }

  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY_WISHLISTS]: wishlists }, () => {
      resolve({ ok: true, id: entry.id, total: wishlists.length });
    });
  });
}

async function deleteWishlist(id) {
  const wishlists = await getWishlists();
  const filtered = wishlists.filter(w => w.id !== id);
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY_WISHLISTS]: filtered }, () => {
      resolve({ ok: true, total: filtered.length });
    });
  });
}

async function renameWishlist(id, newName) {
  const wishlists = await getWishlists();
  const wl = wishlists.find(w => w.id === id);
  if (!wl) return { ok: false, error: 'Wishlist non trovata' };
  wl.name = newName;
  return new Promise(resolve => {
    chrome.storage.local.set({ [STORAGE_KEY_WISHLISTS]: wishlists }, () => {
      resolve({ ok: true });
    });
  });
}
