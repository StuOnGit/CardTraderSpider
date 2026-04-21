/**
 * wishlistParser.js
 * Estrae le carte dalla pagina wishlist di CardTrader.
 * Struttura attesa: div.deck-table-row[data-uuid]
 */

/**
 * @typedef {Object} WishlistCard
 * @property {string} uuid       - Identificatore univoco riga
 * @property {string} dataId     - data-id numerico
 * @property {string} name       - Nome carta (normalizzato)
 * @property {string} nameRaw    - Nome carta originale
 * @property {string} edition    - Edizione selezionata (o "")
 * @property {string} condition  - Condizione (o "" = indifferente)
 * @property {string} language   - Lingua (o "" = indifferente)
 * @property {string} foil       - "true" | "false" | "" (indifferente)
 * @property {number} quantity   - Quantità desiderata
 */

/**
 * Normalizza il nome carta per il matching.
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Legge il value dell'option selezionata in un <select>.
 * Ritorna "" se nessuna option è selezionata o se il value è vuoto.
 */
function getSelectedValue(select) {
  if (!select) return '';
  const selected = select.querySelector('option[selected]') || select.querySelector('option:checked');
  return selected ? selected.value.trim() : '';
}

/**
 * Legge il testo dell'option selezionata in un <select>.
 */
function getSelectedText(select) {
  if (!select) return '';
  const selected = select.querySelector('option[selected]') || select.querySelector('option:checked');
  return selected ? selected.innerText.trim() : '';
}

/**
 * Estrae tutte le carte dalla pagina wishlist corrente.
 * @returns {WishlistCard[]}
 */
export function parseWishlistPage() {
  const rows = document.querySelectorAll('div.deck-table-row[data-uuid]');
  if (!rows.length) return [];

  const cards = [];

  rows.forEach(row => {
    try {
      const uuid = row.getAttribute('data-uuid') || '';
      const dataId = row.getAttribute('data-id') || '';

      // Nome carta
      const nameEl = row.querySelector('.deck-table-row__name a span');
      const nameRaw = nameEl ? nameEl.innerText.trim() : '';

      // Edizione — testo dell'option selezionata
      const expansionSelect = row.querySelector('.deck-table-row__expansion select');
      const edition = getSelectedText(expansionSelect);

      // Condizione — value dell'option selezionata ("" = indifferente)
      const conditionSelect = row.querySelector('.deck-table-row__condition select');
      const condition = getSelectedValue(conditionSelect);

      // Lingua — value dell'option selezionata ("" = indifferente)
      const languageSelect = row.querySelector('.deck-table-row__language select');
      const language = getSelectedValue(languageSelect);

      // Foil — value ("" = indifferente, "true" = sì, "false" = no)
      const foilSelect = row.querySelector('.deck-table-row__foil select');
      const foil = getSelectedValue(foilSelect);

      // Quantità
      const qtyInput = row.querySelector('.deck-table-row__quantity input[name="quantity"]');
      const quantity = qtyInput ? parseInt(qtyInput.value, 10) || 1 : 1;

      if (!nameRaw) return;

      cards.push({
        uuid,
        dataId,
        name: normalizeName(nameRaw),
        nameRaw,
        edition,
        condition,
        language,
        foil,
        quantity,
      });
    } catch (e) {
      console.warn('[CardTrader Assistant] Errore parsing riga wishlist:', e);
    }
  });

  return cards;
}

/**
 * Rileva se la pagina corrente è una pagina wishlist.
 */
export function isWishlistPage() {
  return document.querySelectorAll('div.deck-table-row[data-uuid]').length > 0;
}

/**
 * Legge il nome della wishlist dalla pagina (se disponibile nel titolo o heading).
 * @returns {string}
 */
export function getWishlistName() {
  // CardTrader mostra il nome della lista nell'heading della pagina
  const h1 = document.querySelector('h1, h2, .deck-title, [data-deck-name]');
  if (h1) return h1.innerText.trim();
  return document.title.replace('CardTrader', '').replace(/[-|]/g, '').trim() || 'Wishlist senza nome';
}
