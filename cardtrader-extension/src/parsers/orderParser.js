/**
 * orderParser.js
 * Estrae le carte dalla pagina ordine di CardTrader.
 * Struttura attesa: tbody > tr[data-future-order-line-id]
 */

/**
 * @typedef {Object} OrderCard
 * @property {string} lineId        - data-future-order-line-id
 * @property {string} name          - Nome carta (normalizzato)
 * @property {string} nameRaw       - Nome carta originale
 * @property {string} edition       - Nome edizione
 * @property {string} condition     - Condizione (es. "Moderately Played")
 * @property {string} language      - Lingua (es. "Italiano")
 * @property {string} editionNumber - Numero edizione (es. "#006")
 * @property {string} seller        - Username venditore
 * @property {number} quantity      - Quantità
 * @property {number} price         - Prezzo unitario in €
 * @property {number} totalPrice    - Prezzo totale (qty * price)
 */

/**
 * Normalizza il nome carta per il matching:
 * - lowercase
 * - trim
 * - rimuove apostrofi e trattini multipli
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Parsa il testo "1x €1.26" o "2x €10.00" → { quantity, price }
 */
function parseQtyPrice(text) {
  const match = text.replace(/\s/g, '').match(/(\d+)x€([\d.,]+)/i);
  if (!match) return { quantity: 1, price: 0 };
  const quantity = parseInt(match[1], 10);
  const price = parseFloat(match[2].replace(',', '.'));
  return { quantity, price };
}

/**
 * Estrae tutte le carte dalla pagina ordine corrente.
 * @returns {OrderCard[]}
 */
export function parseOrderPage() {
  const rows = document.querySelectorAll('tbody tr[data-future-order-line-id]');
  if (!rows.length) return [];

  const cards = [];

  rows.forEach(tr => {
    try {
      const lineId = tr.getAttribute('data-future-order-line-id') || '';
      const tds = tr.querySelectorAll('td');

      // td[3] — nome carta
      const nameEl = tr.querySelector('td a.text-primary > u');
      const nameRaw = nameEl ? nameEl.innerText.trim() : '';

      // td[4] — edizione (data-original-title dello span)
      const editionEl = tds[4]?.querySelector('span[data-original-title]');
      const edition = editionEl ? editionEl.getAttribute('data-original-title').trim() : '';

      // td[5] — condizione
      const condEl = tr.querySelector('.products-table__info--condition .badge-cond');
      const condition = condEl ? (condEl.getAttribute('data-original-title') || condEl.innerText).trim() : '';

      // td[5] — lingua
      const langEl = tr.querySelector('.products-table__info--language span[data-original-title]');
      const language = langEl ? langEl.getAttribute('data-original-title').trim() : '';

      // td[8] — numero edizione
      const editionNumEl = tds[8]?.querySelector('span');
      const editionNumber = editionNumEl ? editionNumEl.innerText.trim() : '';

      // td[9] — venditore
      const sellerEl = tds[9]?.querySelector('a.text-primary > u');
      const seller = sellerEl ? sellerEl.innerText.trim() : '';

      // td[12] — quantità + prezzo
      const qtyPriceEl = tr.querySelector('td.text-right.nowrap');
      const qtyPriceText = qtyPriceEl ? qtyPriceEl.innerText.trim() : '1x €0';
      const { quantity, price } = parseQtyPrice(qtyPriceText);

      if (!nameRaw) return; // salta righe senza nome

      cards.push({
        lineId,
        name: normalizeName(nameRaw),
        nameRaw,
        edition,
        condition,
        language,
        editionNumber,
        seller,
        quantity,
        price,
        totalPrice: Math.round(quantity * price * 100) / 100,
      });
    } catch (e) {
      console.warn('[CardTrader Assistant] Errore parsing riga ordine:', e);
    }
  });

  return cards;
}

/**
 * Rileva se la pagina corrente è una pagina ordine.
 */
export function isOrderPage() {
  return document.querySelectorAll('tbody tr[data-future-order-line-id]').length > 0;
}
