/**
 * matcher.js
 * Matching engine: confronta le carte di un ordine con quelle di una o più wishlist.
 * Strategia: match sul nome normalizzato (Opzione A).
 */

/**
 * @typedef {Object} MatchResult
 * @property {string}   wishlistName   - Nome della wishlist/persona
 * @property {string}   wishlistId     - ID univoco della wishlist
 * @property {Array}    matched        - Carte trovate nell'ordine
 * @property {Array}    notInOrder     - Carte wishlist NON presenti nell'ordine
 * @property {number}   totalCost      - Costo totale delle carte matched
 * @property {number}   matchCount     - Numero di carte matched
 */

/**
 * Normalizza il nome per il confronto (deve essere identica a quella dei parser).
 */
function normalizeName(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/['']/g, "'")
    .replace(/\s+/g, ' ');
}

/**
 * Esegue il matching tra le carte di un ordine e le carte di una wishlist.
 *
 * @param {import('../parsers/orderParser').OrderCard[]} orderCards
 * @param {import('../parsers/wishlistParser').WishlistCard[]} wishlistCards
 * @param {string} wishlistName
 * @param {string} wishlistId
 * @returns {MatchResult}
 */
export function matchWishlistAgainstOrder(orderCards, wishlistCards, wishlistName, wishlistId) {
  // Costruisce una mappa nome → [OrderCard] per ricerca O(1)
  const orderMap = new Map();
  for (const card of orderCards) {
    const key = card.name; // già normalizzato dal parser
    if (!orderMap.has(key)) orderMap.set(key, []);
    orderMap.get(key).push(card);
  }

  const matched = [];
  const notInOrder = [];

  for (const wCard of wishlistCards) {
    const key = wCard.name;
    if (orderMap.has(key)) {
      const orderMatches = orderMap.get(key);

      // Calcola il costo coprendo SOLO la quantità richiesta dalla wishlist,
      // consumando le righe ordine in sequenza (prima riga prima).
      let qtyNeeded = wCard.quantity;
      let costForThisCard = 0;

      for (const oc of orderMatches) {
        if (qtyNeeded <= 0) break;
        const qtyTaken = Math.min(qtyNeeded, oc.quantity);
        costForThisCard += qtyTaken * oc.price;
        qtyNeeded -= qtyTaken;
      }

      matched.push({
        wishlistCard: wCard,
        orderCards: orderMatches,
        primaryOrder: orderMatches[0],
        // Costo calcolato sulla quantità richiesta, non su tutto l'ordine
        calculatedCost: Math.round(costForThisCard * 100) / 100,
        // Quante ne abbiamo coperte (può essere < wCard.quantity se ordine insufficiente)
        qtyCovered: wCard.quantity - Math.max(0, qtyNeeded),
      });
    } else {
      notInOrder.push(wCard);
    }
  }

  // Totale basato sui costi calcolati per quantità richiesta
  const totalCost = matched.reduce((sum, m) => sum + m.calculatedCost, 0);

  return {
    wishlistName,
    wishlistId,
    matched,
    notInOrder,
    totalCost: Math.round(totalCost * 100) / 100,
    matchCount: matched.length,
  };
}

/**
 * Esegue il matching su tutte le wishlist salvate.
 *
 * @param {import('../parsers/orderParser').OrderCard[]} orderCards
 * @param {Array<{id: string, name: string, cards: import('../parsers/wishlistParser').WishlistCard[]}>} wishlists
 * @returns {MatchResult[]}
 */
export function matchAllWishlists(orderCards, wishlists) {
  return wishlists.map(wl =>
    matchWishlistAgainstOrder(orderCards, wl.cards, wl.name, wl.id)
  );
}

/**
 * Trova le carte dell'ordine che NON appartengono a nessuna wishlist.
 *
 * @param {import('../parsers/orderParser').OrderCard[]} orderCards
 * @param {MatchResult[]} results
 * @returns {import('../parsers/orderParser').OrderCard[]}
 */
export function getUnmatchedOrderCards(orderCards, results) {
  // Raccoglie tutti i nomi matched in tutte le wishlist
  const matchedNames = new Set();
  for (const result of results) {
    for (const m of result.matched) {
      matchedNames.add(m.wishlistCard.name);
    }
  }
  return orderCards.filter(c => !matchedNames.has(c.name));
}
