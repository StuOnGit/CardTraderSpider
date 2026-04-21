/**
 * content.js — Content Script principale
 * Rileva il tipo di pagina, parsa i dati, inietta l'overlay GUI.
 *
 * Nota: i moduli ES non sono supportati direttamente nei content script MV3
 * (richiedono bundling). Questo file usa IIFE con funzioni inline estratte
 * dai moduli per semplicità di distribuzione senza bundler.
 * Per produzione, usare esbuild/rollup per bundlare tutto in content.js.
 */

(function () {
  'use strict';

  // ─── Normalizzazione (condivisa con parser) ─────────────────────────────────
  function normalizeName(name) {
    return name.toLowerCase().trim().replace(/['']/g, "'").replace(/\s+/g, ' ');
  }

  // ─── ORDER PARSER ───────────────────────────────────────────────────────────
  function parseQtyPrice(text) {
    const match = text.replace(/\s/g, '').match(/(\d+)x€([\d.,]+)/i);
    if (!match) return { quantity: 1, price: 0 };
    return {
      quantity: parseInt(match[1], 10),
      price: parseFloat(match[2].replace(',', '.')),
    };
  }

  function parseOrderPage() {
    const rows = document.querySelectorAll('tbody tr[data-future-order-line-id]');
    const cards = [];
    rows.forEach(tr => {
      try {
        const tds = tr.querySelectorAll('td');
        const nameEl = tr.querySelector('td a.text-primary > u');
        const nameRaw = nameEl ? nameEl.innerText.trim() : '';
        if (!nameRaw) return;

        const editionEl = tds[4]?.querySelector('span[data-original-title]');
        const edition = editionEl ? editionEl.getAttribute('data-original-title').trim() : '';

        const condEl = tr.querySelector('.products-table__info--condition .badge-cond');
        const condition = condEl ? (condEl.getAttribute('data-original-title') || condEl.innerText).trim() : '';

        const langEl = tr.querySelector('.products-table__info--language span[data-original-title]');
        const language = langEl ? langEl.getAttribute('data-original-title').trim() : '';

        const editionNumEl = tds[8]?.querySelector('span');
        const editionNumber = editionNumEl ? editionNumEl.innerText.trim() : '';

        const sellerEl = tds[9]?.querySelector('a.text-primary > u');
        const seller = sellerEl ? sellerEl.innerText.trim() : '';

        const qtyPriceEl = tr.querySelector('td.text-right.nowrap');
        const { quantity, price } = parseQtyPrice(qtyPriceEl ? qtyPriceEl.innerText.trim() : '1x €0');

        cards.push({
          lineId: tr.getAttribute('data-future-order-line-id') || '',
          name: normalizeName(nameRaw),
          nameRaw, edition, condition, language, editionNumber, seller,
          quantity, price,
          totalPrice: Math.round(quantity * price * 100) / 100,
        });
      } catch (e) {
        console.warn('[CT Assistant] Errore riga ordine:', e);
      }
    });
    return cards;
  }

  // ─── WISHLIST PARSER ────────────────────────────────────────────────────────
  function getSelectedValue(select) {
    if (!select) return '';
    const opt = select.querySelector('option[selected]') || select.querySelector('option:checked');
    return opt ? opt.value.trim() : '';
  }
  function getSelectedText(select) {
    if (!select) return '';
    const opt = select.querySelector('option[selected]') || select.querySelector('option:checked');
    return opt ? opt.innerText.trim() : '';
  }

  function parseWishlistPage() {
    const rows = document.querySelectorAll('div.deck-table-row[data-uuid]');
    const cards = [];
    rows.forEach(row => {
      try {
        const nameEl = row.querySelector('.deck-table-row__name a span');
        const nameRaw = nameEl ? nameEl.innerText.trim() : '';
        if (!nameRaw) return;

        const qtyInput = row.querySelector('.deck-table-row__quantity input[name="quantity"]');

        cards.push({
          uuid: row.getAttribute('data-uuid') || '',
          dataId: row.getAttribute('data-id') || '',
          name: normalizeName(nameRaw),
          nameRaw,
          edition: getSelectedText(row.querySelector('.deck-table-row__expansion select')),
          condition: getSelectedValue(row.querySelector('.deck-table-row__condition select')),
          language: getSelectedValue(row.querySelector('.deck-table-row__language select')),
          foil: getSelectedValue(row.querySelector('.deck-table-row__foil select')),
          quantity: qtyInput ? (parseInt(qtyInput.value, 10) || 1) : 1,
        });
      } catch (e) {
        console.warn('[CT Assistant] Errore riga wishlist:', e);
      }
    });
    return cards;
  }

  function getWishlistName() {
    const el = document.querySelector('h1, h2, .deck-title, [data-deck-name]');
    if (el) return el.innerText.trim();
    return document.title.replace('CardTrader', '').replace(/[-|]/g, '').trim() || 'Wishlist senza nome';
  }

  // ─── MATCHER ────────────────────────────────────────────────────────────────
  function matchWishlistAgainstOrder(orderCards, wishlistCards, wishlistName, wishlistId) {
    const orderMap = new Map();
    for (const card of orderCards) {
      if (!orderMap.has(card.name)) orderMap.set(card.name, []);
      orderMap.get(card.name).push(card);
    }

    const matched = [], notInOrder = [];
    for (const wCard of wishlistCards) {
      if (orderMap.has(wCard.name)) {
        const orderMatches = orderMap.get(wCard.name);
        let qtyNeeded = wCard.quantity;
        let calculatedCost = 0;
        for (const oc of orderMatches) {
          if (qtyNeeded <= 0) break;
          const qtyTaken = Math.min(qtyNeeded, oc.quantity);
          calculatedCost += qtyTaken * oc.price;
          qtyNeeded -= qtyTaken;
        }
        matched.push({
          wishlistCard: wCard,
          orderCards: orderMatches,
          primaryOrder: orderMatches[0],
          calculatedCost: Math.round(calculatedCost * 100) / 100,
          qtyCovered: wCard.quantity - Math.max(0, qtyNeeded),
        });
      } else {
        notInOrder.push(wCard);
      }
    }

    const totalCost = matched.reduce((s, m) => s + m.calculatedCost, 0);
    return { wishlistName, wishlistId, matched, notInOrder, totalCost: Math.round(totalCost * 100) / 100, matchCount: matched.length };
  }

  function getUnmatchedOrderCards(orderCards, results) {
    const matchedNames = new Set(results.flatMap(r => r.matched.map(m => m.wishlistCard.name)));
    return orderCards.filter(c => !matchedNames.has(c.name));
  }

  // ─── RILEVAMENTO PAGINA ─────────────────────────────────────────────────────
  const isOrder = () => document.querySelectorAll('tbody tr[data-future-order-line-id]').length > 0;
  const isWishlist = () => document.querySelectorAll('div.deck-table-row[data-uuid]').length > 0;

  // ─── OVERLAY UI ─────────────────────────────────────────────────────────────
  let overlayEl = null;
  let overlayVisible = false;

  function sendMessage(type, payload) {
    return new Promise(resolve => chrome.runtime.sendMessage({ type, payload }, resolve));
  }

  function toggleOverlay() {
    if (!overlayEl) return;
    overlayVisible = !overlayVisible;
    overlayEl.classList.toggle('ct-overlay--visible', overlayVisible);
  }

  function createFAB() {
    const fab = document.createElement('button');
    fab.id = 'ct-fab';
    fab.title = 'CardTrader Assistant';
    fab.innerHTML = `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>`;
    fab.addEventListener('click', toggleOverlay);
    document.body.appendChild(fab);
    return fab;
  }

  function createOverlay() {
    const el = document.createElement('div');
    el.id = 'ct-overlay';
    el.innerHTML = `
      <div class="ct-header">
        <span class="ct-logo">CT Assistant</span>
        <div class="ct-header-actions">
          <button class="ct-btn ct-btn--ghost" id="ct-refresh">↺ Aggiorna</button>
          <button class="ct-btn ct-btn--ghost ct-close" id="ct-close">✕</button>
        </div>
      </div>
      <div class="ct-body" id="ct-body">
        <div class="ct-loading">Caricamento...</div>
      </div>
    `;
    document.body.appendChild(el);

    el.querySelector('#ct-close').addEventListener('click', toggleOverlay);
    el.querySelector('#ct-refresh').addEventListener('click', () => renderOverlay());

    overlayEl = el;
    return el;
  }

  // ─── RENDER ─────────────────────────────────────────────────────────────────

  async function renderOverlay() {
    const body = document.getElementById('ct-body');
    if (!body) return;
    body.innerHTML = '<div class="ct-loading">Analisi in corso...</div>';

    if (isWishlist()) {
      await renderWishlistView(body);
    } else if (isOrder()) {
      await renderOrderView(body);
    } else {
      body.innerHTML = '<div class="ct-empty">Naviga su una pagina ordine o wishlist di CardTrader.</div>';
    }
  }

  async function renderWishlistView(body) {
    const cards = parseWishlistPage();
    const name = getWishlistName();
    const id = crypto.randomUUID();

    body.innerHTML = `
      <div class="ct-section">
        <div class="ct-section-title">Wishlist rilevata</div>
        <div class="ct-wishlist-name">${escHtml(name)}</div>
        <div class="ct-stat">${cards.length} carte trovate</div>
        <div class="ct-name-input-row">
          <input class="ct-input" id="ct-wl-name" type="text" value="${escHtml(name)}" placeholder="Nome persona/wishlist">
          <button class="ct-btn ct-btn--primary" id="ct-save-wl">Salva wishlist</button>
        </div>
      </div>
      <div class="ct-section">
        <div class="ct-section-title">Carte (${cards.length})</div>
        <div class="ct-card-list">
          ${cards.map(c => `
            <div class="ct-card-item">
              <span class="ct-card-name">${escHtml(c.nameRaw)}</span>
              <span class="ct-card-meta">${escHtml(c.condition || '—')} · ${escHtml(c.language || 'Indiff.')} · ×${c.quantity}</span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    document.getElementById('ct-save-wl').addEventListener('click', async () => {
      const customName = document.getElementById('ct-wl-name').value.trim() || name;
      const res = await sendMessage('SAVE_WISHLIST', { id, name: customName, cards, source: 'page' });
      if (res?.ok) showToast(`Wishlist "${customName}" salvata!`);
    });
  }

  async function renderOrderView(body) {
    const orderCards = parseOrderPage();
    const wishlists = await sendMessage('GET_WISHLISTS', null) || [];

    // Salva ordine corrente
    await sendMessage('SAVE_ORDER', orderCards);

    if (!wishlists.length) {
      body.innerHTML = `
        <div class="ct-section">
          <div class="ct-section-title">Ordine rilevato — ${orderCards.length} carte</div>
          <div class="ct-empty">Nessuna wishlist salvata. Vai su una pagina wishlist e salvala prima di fare il matching.</div>
        </div>
      `;
      return;
    }

    const results = wishlists.map(wl => matchWishlistAgainstOrder(orderCards, wl.cards, wl.name, wl.id));
    const unmatched = getUnmatchedOrderCards(orderCards, results);

    let html = `<div class="ct-tabs" id="ct-tabs">`;

    // Tab per ogni wishlist
    results.forEach((r, i) => {
      html += `<button class="ct-tab${i === 0 ? ' ct-tab--active' : ''}" data-tab="${i}">${escHtml(r.wishlistName)} <span class="ct-badge">${r.matchCount}</span></button>`;
    });
    html += `<button class="ct-tab" data-tab="unmatched">Altro <span class="ct-badge ct-badge--muted">${unmatched.length}</span></button>`;
    html += `</div><div id="ct-tab-content">`;

    // Contenuto per ogni wishlist
    results.forEach((r, i) => {
      html += `<div class="ct-tab-panel${i === 0 ? ' ct-tab-panel--active' : ''}" data-panel="${i}">`;
      html += `<div class="ct-summary">
        <div class="ct-summary-stat"><span class="ct-summary-num">${r.matchCount}</span><span class="ct-summary-label">carte trovate</span></div>
        <div class="ct-summary-stat"><span class="ct-summary-num">€${r.totalCost.toFixed(2)}</span><span class="ct-summary-label">totale</span></div>
        <div class="ct-summary-stat"><span class="ct-summary-num">${r.notInOrder.length}</span><span class="ct-summary-label">mancanti</span></div>
      </div>`;

      if (r.matched.length) {
        html += `<div class="ct-section-title">Trovate nell'ordine</div><div class="ct-card-list">`;
        r.matched.forEach(m => {
          const oc = m.primaryOrder;
          html += `<div class="ct-card-item ct-card-item--match">
            <div class="ct-card-main">
              <span class="ct-card-name">${escHtml(oc.nameRaw)}</span>
              <span class="ct-card-edition">${escHtml(oc.edition)}</span>
            </div>
            <div class="ct-card-right">
              <span class="ct-card-cond">${escHtml(oc.condition)}</span>
              <span class="ct-card-price">×${m.qtyCovered} €${m.calculatedCost.toFixed(2)}</span>
            </div>
          </div>`;
        });
        html += `</div>`;
      }

      if (r.notInOrder.length) {
        html += `<div class="ct-section-title ct-section-title--muted">Non nell'ordine</div><div class="ct-card-list">`;
        r.notInOrder.forEach(c => {
          html += `<div class="ct-card-item ct-card-item--missing">
            <span class="ct-card-name">${escHtml(c.nameRaw)}</span>
            <span class="ct-card-meta">×${c.quantity}</span>
          </div>`;
        });
        html += `</div>`;
      }

      html += `</div>`; // panel
    });

    // Panel "Altro" — carte non in nessuna wishlist
    html += `<div class="ct-tab-panel" data-panel="unmatched">`;
    if (unmatched.length) {
      html += `<div class="ct-section-title">Carte non in nessuna wishlist</div><div class="ct-card-list">`;
      unmatched.forEach(c => {
        html += `<div class="ct-card-item">
          <div class="ct-card-main">
            <span class="ct-card-name">${escHtml(c.nameRaw)}</span>
            <span class="ct-card-edition">${escHtml(c.edition)}</span>
          </div>
          <div class="ct-card-right">
            <span class="ct-card-price">×${c.quantity} €${c.totalPrice.toFixed(2)}</span>
          </div>
        </div>`;
      });
      html += `</div>`;
    } else {
      html += `<div class="ct-empty">Tutte le carte sono associate a una wishlist.</div>`;
    }
    html += `</div></div>`; // panel + tab-content

    body.innerHTML = html;

    // Gestione tab
    body.querySelectorAll('.ct-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        body.querySelectorAll('.ct-tab').forEach(t => t.classList.remove('ct-tab--active'));
        body.querySelectorAll('.ct-tab-panel').forEach(p => p.classList.remove('ct-tab-panel--active'));
        tab.classList.add('ct-tab--active');
        const panelId = tab.dataset.tab;
        body.querySelector(`[data-panel="${panelId}"]`)?.classList.add('ct-tab-panel--active');
      });
    });
  }

  // ─── UTILITÀ ────────────────────────────────────────────────────────────────
  function escHtml(str) {
    return String(str || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function showToast(msg) {
    const t = document.createElement('div');
    t.className = 'ct-toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.classList.add('ct-toast--visible'), 10);
    setTimeout(() => { t.classList.remove('ct-toast--visible'); setTimeout(() => t.remove(), 300); }, 2500);
  }

  // ─── INIT ───────────────────────────────────────────────────────────────────
  function init() {
    if (document.getElementById('ct-overlay')) return; // già iniettato
    createOverlay();
    createFAB();

    // Auto-apri se siamo su pagina ordine o wishlist
    if (isOrder() || isWishlist()) {
      setTimeout(() => {
        toggleOverlay();
        renderOverlay();
      }, 800);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})(); // IIFE (Immediately Invoked Function Expression) per isolare scope e permettere funzioni inline senza bundler
