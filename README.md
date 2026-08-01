# Guardaroba.

Dashboard personale per consultare l'inventario del guardaroba dal telefono.

> **Stack**: HTML · CSS · JavaScript vanilla · Supabase · nessun framework · nessun build step

---

## Filosofia

- **99% lettura da mobile** — la dashboard è ottimizzata per consultazione rapida, non per inserimento dati
- **Le modifiche avvengono via Claude** usando il connettore Supabase MCP in linguaggio naturale:
  - *"Sposta tutti i pantaloni a lavare"*
  - *"Metti le magliette nella valigia"*
  - *"Dove sono le felpe?"*
- **Zero dipendenze di build** — si apre direttamente nel browser, nessun `npm install`
- **3 file** — `index.html`, `style.css`, `app.js`. Tutto qui (più `manifest.json`, `sw.js` per la PWA).

---

## Struttura

```
guardaroba/
├── index.html   # shell semantica + layout
├── style.css    # design system dark mode, mobile-first
├── app.js       # logica completa (Supabase client, render, search, sheet)
├── manifest.json # PWA manifest
├── sw.js        # service worker (offline-first)
└── README.md
```

### `app.js` — sezioni interne

| Sezione | Responsabilità |
|---|---|
| **Config** | URL Supabase + anon key |
| **Supabase client** | istanza unica `db` con relazioni |
| **Data layer** | `fetchAll()` — query join con `categories_clothing` e `locations` |
| **Utils** | normalizzazione testo, swatch colori, hue deterministico |
| **Rendering** | `render()`, `renderStats()`, `buildGroup()`, `buildItemRow()` |
| **Sheet** | `openSheet(item)` / `closeSheet()` con animazione |
| **Events** | `initEvents()` — touch, swipe, long-press, bulk select |
| **Boot** | polyfill `Object.groupBy` + avvio |

---

## Database (Supabase)

Progetto: `iochykvqiyrcswefqayq`

### Tabelle di produzione

```
categories_clothing — id, name, icon, sort_order, created_at
locations           — id, name, icon, sort_order, created_at
clothing_items      — id, name, category_id (FK → categories_clothing), 
                      location_id (FK → locations),
                      brand, color, size, notes, created_at, updated_at
```

**Trigger**: PostgreSQL aggiorna `updated_at` automaticamente su ogni UPDATE di `clothing_items`.

**RLS**: 
- Lettura pubblica su tutte le tabelle (anon key)
- UPDATE consentito sulla tabella `clothing_items` da anon key (per swipe e bulk move)
- Modifiche ai dati di categorie/posizioni tramite Claude MCP Supabase (service role)

### Categorie

```
🛏️  Magliette Pigiama
🏠  Pantaloni Casa
⏱️  Pantaloni Corti
📏  Pantaloni Lunghi
🏃  Pantaloni Sport
💪  Magliette Sport
👕  Magliette
🧥  Felpe e Maglioni
```

### Posizioni disponibili

```
🗄️  Armadio
🧍  In uso
🧺  Lavare
🧳  Valigia
```

---

## Come usare

### Aprire la dashboard

Apri `index.html` nel browser. Non serve un server locale — il client Supabase opera via HTTPS.

**PWA**: L'app è installabile come app nativa su iOS/Android grazie a `manifest.json` e `sw.js`. Funziona anche offline per consultazione (i dati sono cachati).

### Ricerca

La barra di ricerca filtra in tempo reale su: **nome**, **categoria**, **colore**, **marca**. Durante la ricerca i chip e il toggle vengono nascosti automaticamente.

### Filtro rapido (chip)

Subito sotto il toggle compare una riga di chip scorrevole orizzontalmente:
- **Tutti** — mostra tutti i capi (default)
- **Un chip per ogni categoria/posizione** — tocca per filtrare istantaneamente

I chip cambiano insieme al toggle: passando a "Per posizione" mostrano le posizioni, passando a "Per categoria" mostrano le categorie.

### Selezione multipla e azioni bulk

**Long-press** (≈500ms) su un capo per entrare in **modalità selezione**. Una barra grigia appare in basso con:
- Contatore di capi selezionati
- Pulsanti per **tutte le posizioni** disponibili
- Tasto "Annulla" per uscire

Tap sui capi per aggiungerli/toglierli dalla selezione. Una volta selezionati, tappa una posizione per spostarli.

**Swipe a sinistra** su un singolo capo rivela 🧺 (manda a lavare).  
**Swipe a destra** su un singolo capo rivela 🧍 (segna in uso).  
Utile per azioni veloci senza modalità selezione.

### Gruppi e toggle

Tocca l'intestazione di un gruppo per espanderlo/chiuderlo. Il toggle in cima passa tra raggruppamento per **categoria** e per **posizione**.

### Statistiche

La riga di stat in alto mostra:
- **Capi totali**
- **In uso** — quanti capi stai indossando
- **Da lavare** — quanti aspettano il bucato
- **Lavati** — quanti sono in armadio/valigia/zaino (puliti)

---

## Modificare i dati

Usa Claude con il connettore Supabase MCP per modifiche in linguaggio naturale:

```
Sposta tutti i pantaloni a lavare
Aggiungi una maglietta grigia Adidas taglia M, in armadio
Dove sono le felpe?
Metti tutto in uso
Rimetti i capi in armadio dalla valigia
```

Claude eseguirà le operazioni usando il suo accesso service role, che bypassa RLS e ha scrittura completa.

---

## Design

- **Dark mode** di default, nessuna opzione light
- **Mobile first** — area tocco minima 52px, `safe-area-inset` per notch
- **Hang-tag badge** — elemento distintivo: badge categoria/posizione imitano cartellini fisici (foro a sinistra, colore deterministico dal nome)
- **Tipografia**: 
  - Space Grotesk (display, titoli)
  - Inter (body, testo)
  - IBM Plex Mono (label, metadati)
- **Font di sistema** come fallback — zero dipendenze critiche da CDN

### Colori

- `--bg: #12141a` — sfondo principale (blu-carbone)
- `--accent: #d4a15a` — accento ottone (come filo etichette)
- `--surface: #1c202a` — superfici elevate
- `--danger: #c25b5b` — azioni distruttive (swipe a lavare)

---

## Estendere il progetto

Possibili iterazioni senza stravolgere l'architettura:

- ✅ **Filtri rapidi** (chip row)
- ✅ **PWA** (offline-first, installabile)
- ✅ **Selezione multipla e bulk move**
- ✅ **Swipe actions** (lavare, in uso)
- [ ] **Ordinamento** per data modifica / nome / brand
- [ ] **Import CSV** — caricare elenco capi via drag & drop
- [ ] **Foto capo** — colonna `image_url` + Supabase Storage
- [ ] **Tag personalizzati** — etichette custom per capi (es. "Vacanza", "Smart casual")
- [ ] **Statistiche avanzate** — frecuenza uso, ultimi indossati, preferiti
- [ ] **Condivisione lista** — condividi "cosa mettere stasera" con amici

---

## Troubleshooting

### Errore: "Could not find a relationship"
Assicurati che la query `fetchAll()` in `app.js` usi la sintassi corretta:
```js
category:categories_clothing!category_id(id, name, icon)
location:locations!location_id(id, name, icon)
```

### L'app non carica i dati
Verifica che:
1. Le 3 tabelle (`categories_clothing`, `locations`, `clothing_items`) esistono in Supabase
2. Le RLS policies consentono SELECT alla anon key
3. La rete ha connessione HTTPS
4. Il servizio worker non sta bloccando le richieste

### Offline ma app non risponde
Il service worker cachea la shell statica (`index.html`, `style.css`, `app.js`) ma **non** i dati Supabase. Se sei offline:
- Puoi consultare gli ultimi dati cachati
- Non puoi aggiornare o fare ricerche
- Riconnettiti per sincronizzare

---

## Stack tecnico

- **Frontend**: HTML5 + CSS3 (grid/flexbox) + vanilla JavaScript (no framework)
- **Backend**: Supabase (PostgreSQL + RLS)
- **Auth**: Anon key per lettura e update app; service role per Claude MCP
- **PWA**: `manifest.json` + `sw.js` (Cache-first per shell, Network-first per Supabase)
- **Fonts**: Google Fonts (preconnect) + fallback sistema
- **Browser**: Mobile-first, supporta iOS 13+, Android 7+

---

## Note sulla privacy

- Tutti i dati rimangono nel progetto Supabase privato
- L'app è completamente client-side (no backend custom)
- Nessun tracking, nessun analytics
- Offline mode conserva i dati in cache locale (IndexedDB via sw.js)
