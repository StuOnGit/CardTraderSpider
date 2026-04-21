# CardTrader Assistant — Chrome Extension

Estensione Chrome che confronta in real-time le carte di un **ordine CardTrader** con le tue **wishlist**, categorizzandole per persona.

---

## Installazione (modalità sviluppatore)

1. Apri Chrome e vai su `chrome://extensions/`
2. Attiva **Modalità sviluppatore** (toggle in alto a destra)
3. Clicca **Carica estensione non pacchettizzata**
4. Seleziona la cartella `cardtrader-extension`
5. L'estensione è attiva — vedrai l'icona nella barra degli strumenti

> **Nota sulle icone**: la cartella `icons/` è vuota. Aggiungi tre PNG (16×16, 48×48, 128×128) oppure rimuovi il blocco `"icons"` dal `manifest.json` per evitare errori in sviluppo.

---

## Come usarla

### 1. Salva una wishlist da CardTrader

1. Vai sulla pagina di una wishlist su CardTrader (es. `cardtrader.com/it/decks/123456`)
2. Il pannello si apre automaticamente
3. Assegna un nome alla wishlist (es. "Alessandro") e clicca **Salva wishlist**
4. Ripeti per ogni persona

### 2. Importa una wishlist da CSV

Dal **popup** dell'estensione (icona nella barra):
- Clicca "Scegli file CSV"
- Formato atteso: `Nome carta, Edizione, Condizione, Lingua, Quantità`
- Dai un nome alla wishlist e il file viene salvato

Esempio CSV:
```
Black Lotus,,Near Mint,EN,1
Mox Pearl,Alpha,,,2
Counterspell,,Moderately Played,IT,4
```

### 3. Fai il matching sull'ordine

1. Vai sulla pagina dell'ordine su CardTrader
2. Il pannello si apre automaticamente
3. Vedrai un tab per ogni wishlist salvata con:
   - Quante carte sono nell'ordine
   - Il costo totale di quelle carte
   - Le carte non presenti nell'ordine
   - Un tab "Altro" per le carte non associate a nessuna wishlist

---

## Struttura file

```
cardtrader-extension/
├── manifest.json              # Configurazione estensione MV3
├── popup.html                 # Popup del bottone estensione
├── popup.js                   # Logica popup (lista wishlist + import CSV)
├── icons/                     # Icone estensione (da aggiungere)
└── src/
    ├── content.js             # Content script (parser + overlay + matcher)
    ├── overlay.css            # Stili del pannello overlay
    ├── background.js          # Service worker (storage + messaggi)
    ├── parsers/
    │   ├── orderParser.js     # Parser pagina ordine (modulo ES, per bundling)
    │   └── wishlistParser.js  # Parser pagina wishlist (modulo ES, per bundling)
    └── matching/
        └── matcher.js         # Matching engine (modulo ES, per bundling)
```

> I file in `src/parsers/` e `src/matching/` sono moduli ES documentati separatamente.
> La logica è già inline in `content.js` per funzionare senza bundler.

---

## Logica di matching

Il matching usa **solo il nome della carta** (Opzione A):
- Il nome viene normalizzato (lowercase, trim, apostrofi uniformi)
- Una carta della wishlist fa match se il suo nome normalizzato è uguale a quello di una carta nell'ordine
- Se lo stesso nome compare in più righe ordine (edizioni diverse), vengono associate tutte
- Condizione e lingua della wishlist sono mostrate come metadati ma **non filtrano** il match

---

## Estendere il progetto

### Aggiungere fuzzy matching (futuro)
Sostituire il confronto esatto in `matcher.js` con una distanza di Levenshtein per gestire varianti di nomi.

### Aggiungere export
Aggiungere un bottone "Esporta CSV" nel pannello overlay che scarica le carte matched per categoria.

### Bundling per produzione
Usare `esbuild` per bundlare i moduli ES in un singolo `content.js`:
```bash
npx esbuild src/content.js --bundle --outfile=dist/content.js
```
