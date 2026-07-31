# Guardaroba.

Dashboard personale per consultare l'inventario del guardaroba dal telefono.

> **Stack**: HTML · CSS · JavaScript vanilla · Supabase · nessun framework · nessun build step

---

## Filosofia

- **99% lettura da mobile** — la dashboard è ottimizzata per consultazione rapida, non per inserimento dati
- **Le modifiche avvengono via Claude** usando il connettore Supabase MCP in linguaggio naturale:
  - *"Sposta tutti i pantaloni a lavare"*
  - *"Metti le scarpe da running nella valigia grande"*
  - *"Dove sono gli occhiali da sole?"*
- **Zero dipendenze di build** — si apre direttamente nel browser, nessun `npm install`
- **3 file** — `index.html`, `style.css`, `app.js`. Tutto qui (più `manifest.json`, `sw.js` per la PWA).

---

## Struttura

```
clothing-inventory/
├── index.html   # shell semantica + layout
├── style.css    # design system dark mode, mobile-first
├── app.js       # logica completa (Supabase client, render, search, sheet)
└── README.md
```

### `app.js` — sezioni interne

| Sezione | Responsabilità |
|---|---|
| **Config** | URL Supabase + anon key (due righe) |
| **Supabase client** | istanza unica `db` |
| **Data layer** | `fetchAll()` — un'unica query join |
| **Utils** | normalizzazione testo, swatch colori, hue deterministico |
| **Rendering** | `render()`, `renderStats()`, `buildGroup()`, `buildItemRow()` |
| **Sheet** | `openSheet(item)` / `closeSheet()` con animazione |
| **Events** | `initEvents()` — tutto il wiring degli eventi |
| **Boot** | polyfill `Object.groupBy` + avvio |

---

## Database (Supabase)

Progetto: `iochykvqiyrcswefqayq`

### Tabelle `_test`

```
categories_test    — id, name, icon, sort_order, created_at
locations_test     — id, name, icon, sort_order, created_at
clothing_items_test — id, name, category_id (FK), location_id (FK),
                      brand, color, size, notes, created_at, updated_at
```

Un trigger PostgreSQL aggiorna `updated_at` automaticamente ad ogni modifica.

**RLS**: le tabelle `_test` sono in lettura pubblica (anon key). Le scritture avvengono tramite service role (Claude MCP), che bypassa RLS.

### Posizioni disponibili

| Icona | Posizione |
|---|---|
| 🗄️ | Armadio |
| 🧍 | In uso |
| 🧺 | Lavare |
| 🧳 | Valigia grande |
| 👜 | Valigia piccola |
| 🎒 | Zaino |

---

## Come usare

### Aprire la dashboard

Apri `index.html` in un browser. Non serve un server locale — il client Supabase opera via HTTPS direttamente.

### Modificare i dati

Usa Claude con il connettore Supabase MCP. Esempi:

```
Sposta tutti i pantaloni a lavare
Metti le magliette nella valigia grande
Rimetti tutto nell'armadio
Dove sono le scarpe da running?
Aggiungi una felpa grigia Carhartt taglia L, posizione Armadio
```

### Ricerca

La barra di ricerca filtra in tempo reale su: **nome**, **categoria**, **colore**, **marca**. Durante la ricerca i chip e il toggle vengono nascosti automaticamente.

### Filtro rapido (chip)

Subito sotto il toggle compare una riga di chip scorrevole orizzontalmente:
- **Tutti** — mostra tutti i capi (default)
- **Un chip per ogni categoria/posizione** presente nel guardaroba — tocca per filtrare istantaneamente

I chip cambiano insieme al toggle: passando a "Per posizione" mostrano le posizioni, passando a "Per categoria" mostrano le categorie.

### Gruppi

Tocca l'intestazione di un gruppo per espanderlo/chiuderlo. Il toggle in cima passa tra raggruppamento per **categoria** e per **posizione**.

---

## Passaggio in produzione

1. Rinomina le tabelle rimuovendo il suffisso `_test`
2. In `app.js`, aggiorna i tre riferimenti alle tabelle:

```js
// Da:
db.from('clothing_items_test')
db.from('categories_test')
db.from('locations_test')

// A:
db.from('clothing_items')
db.from('categories')
db.from('locations')
```

---

## Design

- **Dark mode** di default, nessuna opzione light
- **Mobile first** — area tocco minima 52px, safe-area inset per notch
- **Hang-tag badge** — elemento distintivo: i badge categoria/posizione imitano i cartellini fisici dei vestiti (foro a sinistra, colore deterministico dal nome)
- **Tipografia**: Space Grotesk (display) · Inter (body) · IBM Plex Mono (label/meta)
- **Font di sistema** come fallback — nessuna dipendenza critica da Google Fonts

---

## Estendere il progetto

Possibili iterazioni future senza stravolgere l'architettura:

- ~~**Filtri rapidi** per posizione (chip row sotto la search)~~ ✅ implementato
- ~~**PWA** — aggiungere `manifest.json` + service worker per uso offline~~ ✅ implementato
- **Ordinamento** per data aggiornamento / nome / brand
- **Import CSV** — caricare un export dal cassetto via drag & drop
- **Foto capo** — colonna `image_url` su `clothing_items` + upload su Supabase Storage
