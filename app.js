/* ==========================================================================
   Guardaroba — app.js
   Vanilla JS + supabase-js v2. Zero build step.
   ========================================================================== */

// ─── Config ────────────────────────────────────────────────────────────────

const SUPABASE_URL = 'https://iochykvqiyrcswefqayq.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvY2h5a3ZxaXlyY3N3ZWZxYXlxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzM2NTU4ODcsImV4cCI6MjA4OTIzMTg4N30.spv4a5HyHYy6Mq8yJ48rNcqACoq6K3dREav-bIpJR7g';

// ─── Supabase client ────────────────────────────────────────────────────────

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ─── App state ──────────────────────────────────────────────────────────────

const state = {
  items: [],          // clothing_items_test joined with category + location
  categories: [],
  locations: [],
  view: 'category',   // 'category' | 'location'
  query: '',
  activeFilter: null, // id of the active category/location chip filter (null = all)
  openGroups: new Set(), // keys of expanded accordion groups
  selectedIds: new Set(), // item ids selected in bulk-select mode
  selecting: false,       // whether bulk-select mode is active
  loading: false,
  error: null,
};

// ─── Data layer ─────────────────────────────────────────────────────────────

async function fetchAll() {
  const [itemsRes, catsRes, locsRes] = await Promise.all([
    db.from('clothing_items')
      .select(`
        id, name, brand, color, size, notes, created_at, updated_at,
        category:categories_clothing!category_id(id, name, icon),
        location:locations!location_id(id, name, icon)
      `)
      .order('name'),

    db.from('categories_clothing').select('*').order('sort_order'),
    db.from('locations').select('*').order('sort_order'),
  ]);

  if (itemsRes.error) throw itemsRes.error;
  if (catsRes.error)  throw catsRes.error;
  if (locsRes.error)  throw locsRes.error;

  return {
    items: itemsRes.data,
    categories: catsRes.data,
    locations: locsRes.data,
  };
}

// ─── Utils ───────────────────────────────────────────────────────────────────

/** Case-insensitive, accent-insensitive match */
function normalise(str) {
  return (str ?? '').normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase();
}

function matchesQuery(item, q) {
  if (!q) return true;
  const n = normalise(q);
  return (
    normalise(item.name).includes(n) ||
    normalise(item.category?.name).includes(n) ||
    normalise(item.color).includes(n) ||
    normalise(item.brand).includes(n)
  );
}

/**
 * Derive a CSS hue (0-359) from a string — used for hang-tag badge colours.
 * Same string → always same colour.
 */
function hueFromString(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) & 0xffff;
  return h % 360;
}

/**
 * Attempt to map a colour name to a CSS hex — covers common Italian colour names
 * so the colour swatch in each row renders meaningfully.
 */
const COLOR_MAP = {
  bianco: '#f5f5f5', nero: '#1a1a1a', grigio: '#888', 'grigio melange': '#999',
  blu: '#3b6fd4', 'blu navy': '#1a2f6e', 'blu scuro': '#1c3461',
  verde: '#3a9c5b', 'verde militare': '#4a5e2a',
  rosso: '#c0392b', arancio: '#e67e22', giallo: '#f1c40f',
  marrone: '#7d5035', beige: '#d5b896', bianco: '#f5f5f5',
  viola: '#7d3c98', rosa: '#e391b0', argento: '#aab3bd', oro: '#c9a834',
  assortiti: 'linear-gradient(135deg,#e56b6b,#6bb5e5,#6be58a)',
};

function colorToCSS(colorStr) {
  if (!colorStr) return 'var(--border)';
  const key = colorStr.split('/')[0].trim().toLowerCase();
  return COLOR_MAP[key] ?? `hsl(${hueFromString(colorStr)} 50% 55%)`;
}

function formatDate(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Bulk move ───────────────────────────────────────────────────────────────

async function bulkMoveTo(locationId, ids) {
  const targetIds = ids ?? [...state.selectedIds];
  if (!targetIds.length) return;

  const { error } = await db
    .from('clothing_items')
    .update({ location_id: locationId })
    .in('id', targetIds);

  if (error) { alert('Errore: ' + error.message); return; }

  exitSelectMode();
  await loadData();
}

// ─── Selection mode ───────────────────────────────────────────────────────────

function enterSelectMode(firstItemId) {
  state.selecting = true;
  state.selectedIds.clear();
  state.selectedIds.add(firstItemId);
  document.body.classList.add('is-selecting');
  updateSelectVisuals();
  showBulkBar();
}

function exitSelectMode() {
  state.selecting = false;
  state.selectedIds.clear();
  document.body.classList.remove('is-selecting');
  updateSelectVisuals();
  hideBulkBar();
}

function toggleSelect(itemId) {
  if (state.selectedIds.has(itemId)) {
    state.selectedIds.delete(itemId);
    if (state.selectedIds.size === 0) { exitSelectMode(); return; }
  } else {
    state.selectedIds.add(itemId);
  }
  updateSelectVisuals();
}

function updateSelectVisuals() {
  document.querySelectorAll('.swipe-wrap').forEach(wrap => {
    wrap.classList.toggle('is-selected', state.selectedIds.has(wrap.dataset.id));
  });
  const countEl = document.getElementById('bulkCount');
  if (countEl) {
    const n = state.selectedIds.size;
    countEl.textContent = `${n} selezionat${n === 1 ? 'o' : 'i'}`;
  }
}

function showBulkBar() {
  const bar = document.getElementById('bulkBar');
  const locsEl = document.getElementById('bulkLocations');
  locsEl.innerHTML = '';
  state.locations.forEach(loc => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bulk-loc-btn';
    btn.textContent = (loc.icon ? loc.icon + ' ' : '') + loc.name;
    btn.addEventListener('click', () => bulkMoveTo(loc.id));
    locsEl.appendChild(btn);
  });
  bar.hidden = false;
  requestAnimationFrame(() => bar.classList.add('is-visible'));
}

function hideBulkBar() {
  const bar = document.getElementById('bulkBar');
  bar.classList.remove('is-visible');
  bar.addEventListener('transitionend', () => { bar.hidden = true; }, { once: true });
}

// ─── Rendering helpers ───────────────────────────────────────────────────────

/**
 * Build a hang-tag badge element.
 * @param {string} label  display text
 * @param {string|null} emoji  optional leading emoji (no hue applied)
 * @param {number|null} hue   if set, colorise; else use --tag--plain class
 */
function tagEl(label, emoji = null, hue = null) {
  const span = document.createElement('span');
  span.className = hue !== null ? 'tag' : 'tag tag--plain';
  if (hue !== null) span.style.cssText = `--tag-hue:${hue}`;
  span.textContent = emoji ? `${emoji} ${label}` : label;
  return span;
}

/** Build a single item row wrapped in a swipe container */
function buildItemRow(item) {
  // ── Swipe wrapper ─────────────────────────────────────────────────────────
  const wrap = document.createElement('div');
  wrap.className = 'swipe-wrap';
  wrap.dataset.id = item.id;
  if (state.selectedIds.has(item.id)) wrap.classList.add('is-selected');

  // Swipe action sinistra → lavare
  const swipeActL = document.createElement('div');
  swipeActL.className = 'swipe-action swipe-action--left';
  swipeActL.setAttribute('aria-hidden', 'true');
  swipeActL.textContent = '🧺';

  // Swipe action destra → in uso
  const swipeActR = document.createElement('div');
  swipeActR.className = 'swipe-action swipe-action--right';
  swipeActR.setAttribute('aria-hidden', 'true');
  swipeActR.textContent = '🧍';

  // ── Item button ───────────────────────────────────────────────────────────
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'item-row';
  btn.dataset.id = item.id;

  // Selection checkbox (shown via CSS when body.is-selecting)
  const check = document.createElement('span');
  check.className = 'item-check';
  check.setAttribute('aria-hidden', 'true');

  const colorCSS = colorToCSS(item.color);

  const swatch = document.createElement('span');
  swatch.className = 'swatch';
  swatch.style.background = colorCSS;
  swatch.setAttribute('aria-hidden', 'true');

  const info = document.createElement('span');
  info.className = 'info';

  const nameEl = document.createElement('span');
  nameEl.className = 'item-name';
  nameEl.textContent = item.name;

  const metaEl = document.createElement('span');
  metaEl.className = 'item-meta';

  const parts = [];
  if (item.brand) parts.push(item.brand);
  if (item.size)  parts.push(item.size);
  if (item.color) parts.push(item.color);
  metaEl.textContent = parts.join(' · ');

  info.append(nameEl, metaEl);

  const tagWrap = document.createElement('span');
  if (state.view === 'category') {
    const loc = item.location;
    if (loc) tagWrap.appendChild(tagEl(loc.name, loc.icon ?? null, hueFromString(loc.name)));
  } else {
    const cat = item.category;
    if (cat) tagWrap.appendChild(tagEl(cat.name, cat.icon ?? null, hueFromString(cat.name)));
  }

  btn.append(check, swatch, info, tagWrap);

  // ── Touch: long-press + swipe left (lavare) + swipe right (in uso) ─────────
  //
  // Soglie:
  //   dx < -PEEK  → reveal parziale icona sinistra
  //   dx < -FULL  → commit immediato "a lavare" (Apple Mail style)
  //   dx >  FULL  → commit immediato "in uso"
  //
  const PEEK = 20;   // px prima di entrare in swipe mode
  const SNAP = 72;   // px revealed (snap position)
  const FULL = 160;  // px per commit automatico

  let lpTimer = null;
  let t0x = 0, t0y = 0;
  let swipeDir = 0;   // -1 sx | 0 nessuno | +1 dx
  let swipeMode = false;

  function snapBack() {
    btn.style.transition = 'transform 0.2s ease';
    btn.style.transform = '';
    swipeActL.style.opacity = '0';
    swipeActR.style.opacity = '0';
    setTimeout(() => { btn.style.transition = ''; }, 210);
  }

  function commitAction(dir) {
    // Animazione "vola via" poi aggiorna
    btn.style.transition = 'transform 0.18s ease';
    btn.style.transform = dir < 0 ? 'translateX(-110%)' : 'translateX(110%)';
    setTimeout(() => {
      btn.style.transition = '';
      btn.style.transform = '';
      if (dir < 0) {
        const lavare = state.locations.find(l => l.name === 'Lavare');
        if (lavare) bulkMoveTo(lavare.id, [item.id]);
      } else {
        const inUso = state.locations.find(l => l.name === 'In uso');
        if (inUso) bulkMoveTo(inUso.id, [item.id]);
      }
    }, 180);
  }

  btn.addEventListener('touchstart', e => {
    const t = e.touches[0];
    t0x = t.clientX; t0y = t.clientY;
    swipeMode = false;
    swipeDir = 0;

    lpTimer = setTimeout(() => {
      lpTimer = null;
      if (swipeMode) return;
      navigator.vibrate?.(30);
      if (!state.selecting) enterSelectMode(item.id);
      else toggleSelect(item.id);
    }, 500);
  }, { passive: true });

  btn.addEventListener('touchmove', e => {
    if (state.selecting) return;
    const t = e.touches[0];
    const dx = t.clientX - t0x;
    const dy = t.clientY - t0y;
    console.log('touchmove: dx=', dx, 'dy=', dy, 'swipeMode=', swipeMode);

    // Scroll verticale — annulla tutto
    if (!swipeMode && Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
      clearTimeout(lpTimer); lpTimer = null;
      return;
    }

    if (Math.abs(dx) > PEEK) {
      swipeMode = true;
      swipeDir = dx < 0 ? -1 : 1;
      clearTimeout(lpTimer); lpTimer = null;
    }

    if (!swipeMode) return;

    if (swipeDir < 0) {
      // ── Swipe sinistra → lavare ──────────────────────────────────────────
      const offset = Math.max(dx, -FULL - 20);
      btn.style.transform = `translateX(${offset}px)`;
      const progress = Math.min(1, Math.abs(offset) / SNAP);
      swipeActL.style.opacity = progress.toFixed(2);
      // Background si propaga lungo lo swipe
      wrap.classList.toggle('swipe-left', Math.abs(offset) > 10);
      swipeActL.classList.toggle('swipe-action--commit', offset < -FULL);
    } else {
      // ── Swipe destra → in uso ────────────────────────────────────────────
      const offset = Math.min(dx, FULL + 20);
      btn.style.transform = `translateX(${offset}px)`;
      const progress = Math.min(1, offset / SNAP);
      swipeActR.style.opacity = progress.toFixed(2);
      // Background si propaga lungo lo swipe
      wrap.classList.toggle('swipe-right', offset > 10);
      swipeActR.classList.toggle('swipe-action--commit', offset > FULL);
    }
  }, { passive: true });

  btn.addEventListener('touchend', e => {
    clearTimeout(lpTimer); lpTimer = null;
    if (!swipeMode) return;

    const dx = e.changedTouches[0].clientX - t0x;

    if (dx < -FULL) {
      commitAction(-1);
    } else if (dx > FULL) {
      commitAction(1);
    } else {
      snapBack();
    }

    swipeMode = false;
    swipeDir = 0;
    wrap.classList.remove('swipe-left', 'swipe-right');
    swipeActL.classList.remove('swipe-action--commit');
    swipeActR.classList.remove('swipe-action--commit');
  });

  // ── Click (fallback se swipe non scattato) ────────────────────────────────
  btn.addEventListener('click', () => {
    if (state.selecting) { toggleSelect(item.id); return; }
    openSheet(item);
  });

  wrap.append(swipeActR, swipeActL, btn);
  return wrap;
}

/**
 * Build an accordion group.
 * @param {string} key   unique group key (category/location id)
 * @param {string} icon
 * @param {string} name
 * @param {Array}  items
 */
function buildGroup(key, icon, name, items) {
  const isOpen = state.openGroups.has(key);

  const group = document.createElement('div');
  group.className = 'group' + (isOpen ? ' is-open' : '');
  group.dataset.key = key;

  // Header
  const header = document.createElement('button');
  header.type = 'button';
  header.className = 'group-header';
  header.setAttribute('aria-expanded', isOpen ? 'true' : 'false');

  const iconEl = document.createElement('span');
  iconEl.className = 'group-icon';
  iconEl.setAttribute('aria-hidden', 'true');
  iconEl.textContent = icon ?? '📁';

  const nameEl = document.createElement('span');
  nameEl.className = 'group-name';
  nameEl.textContent = name;

  const countEl = document.createElement('span');
  countEl.className = 'group-count';
  countEl.textContent = items.length;

  const chevron = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  chevron.setAttribute('viewBox', '0 0 24 24');
  chevron.setAttribute('width', '16');
  chevron.setAttribute('height', '16');
  chevron.setAttribute('fill', 'none');
  chevron.setAttribute('stroke', 'currentColor');
  chevron.setAttribute('stroke-width', '2.5');
  chevron.setAttribute('stroke-linecap', 'round');
  chevron.setAttribute('stroke-linejoin', 'round');
  chevron.setAttribute('aria-hidden', 'true');
  chevron.classList.add('chevron');
  const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  poly.setAttribute('points', '9 18 15 12 9 6');
  chevron.appendChild(poly);

  header.append(iconEl, nameEl, countEl, chevron);

  // Body
  const bodyWrap = document.createElement('div');
  bodyWrap.className = 'group-body-wrap';

  const body = document.createElement('div');
  body.className = 'group-body';

  items.forEach(item => body.appendChild(buildItemRow(item)));
  bodyWrap.appendChild(body);

  // Toggle behaviour
  header.addEventListener('click', () => {
    const willOpen = !group.classList.contains('is-open');
    if (willOpen) state.openGroups.add(key); else state.openGroups.delete(key);
    group.classList.toggle('is-open', willOpen);
    header.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
  });

  group.append(header, bodyWrap);
  return group;
}

// ─── Filter chips ────────────────────────────────────────────────────────────

function renderFilterChips() {
  const container = document.getElementById('filterChips');
  container.innerHTML = '';

  const groups = state.view === 'category' ? state.categories : state.locations;
  if (!groups.length) return;

  // "Tutti" chip
  const allBtn = document.createElement('button');
  allBtn.type = 'button';
  allBtn.className = 'chip' + (state.activeFilter === null ? ' chip--active' : '');
  allBtn.textContent = 'Tutti';
  allBtn.addEventListener('click', () => {
    state.activeFilter = null;
    renderFilterChips();
    render();
  });
  container.appendChild(allBtn);

  // One chip per group that has at least one item
  const usedIds = new Set(
    state.items.map(i => (state.view === 'category' ? i.category?.id : i.location?.id))
  );

  groups.forEach(g => {
    if (!usedIds.has(g.id)) return;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'chip' + (state.activeFilter === g.id ? ' chip--active' : '');
    btn.textContent = (g.icon ? g.icon + ' ' : '') + g.name;
    btn.addEventListener('click', () => {
      state.activeFilter = state.activeFilter === g.id ? null : g.id;
      // When a filter is active, expand its group automatically
      if (state.activeFilter !== null) {
        state.openGroups.add(state.activeFilter);
      }
      renderFilterChips();
      render();
    });
    container.appendChild(btn);
  });
}

// ─── Main render ─────────────────────────────────────────────────────────────

function render() {
  const content = document.getElementById('content');
  const emptyState = document.getElementById('emptyState');
  const errorState = document.getElementById('errorState');
  const viewToggle = document.getElementById('viewToggle');

  // Error
  if (state.error) {
    content.innerHTML = '';
    emptyState.hidden = true;
    errorState.textContent = `Errore: ${state.error.message ?? state.error}`;
    errorState.hidden = false;
    return;
  }
  errorState.hidden = true;

  const q = state.query;
  const searching = q.length > 0;

  // Apply text search first, then chip filter (only outside search mode)
  let filtered = state.items.filter(i => matchesQuery(i, q));
  if (!searching && state.activeFilter !== null) {
    filtered = filtered.filter(i =>
      state.view === 'category'
        ? i.category?.id === state.activeFilter
        : i.location?.id === state.activeFilter
    );
  }

  // ── Stats (always based on full dataset) ──────────────────────────────────
  renderStats();

  // ── Toggle and chips: disable / hide during search ────────────────────────
  viewToggle.classList.toggle('is-disabled', searching);
  document.getElementById('filterChips').classList.toggle('chips--hidden', searching);

  // Empty
  if (filtered.length === 0) {
    content.innerHTML = '';
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  content.innerHTML = '';

  // ── Search mode: flat list ────────────────────────────────────────────────
  if (q.length > 0) {
    const header = document.createElement('p');
    header.className = 'results-header';
    header.textContent = `${filtered.length} risultat${filtered.length === 1 ? 'o' : 'i'}`;
    content.appendChild(header);
    filtered.forEach(item => content.appendChild(buildItemRow(item)));
    return;
  }

  // ── Grouped mode ─────────────────────────────────────────────────────────
  if (state.view === 'category') {
    // Group by category, ordered by category.sort_order
    const catOrder = state.categories.map(c => c.id);
    const byCategory = Object.groupBy(filtered, i => i.category?.id ?? '__none__');

    catOrder.forEach(catId => {
      const items = byCategory[catId];
      if (!items?.length) return;
      const cat = state.categories.find(c => c.id === catId);
      content.appendChild(buildGroup(catId, cat?.icon, cat?.name ?? 'Senza categoria', items));
    });

    // Uncategorised
    if (byCategory['__none__']?.length) {
      content.appendChild(buildGroup('__none__', '❓', 'Senza categoria', byCategory['__none__']));
    }

  } else {
    // Group by location
    const locOrder = state.locations.map(l => l.id);
    const byLocation = Object.groupBy(filtered, i => i.location?.id ?? '__none__');

    locOrder.forEach(locId => {
      const items = byLocation[locId];
      if (!items?.length) return;
      const loc = state.locations.find(l => l.id === locId);
      content.appendChild(buildGroup(locId, loc?.icon, loc?.name ?? 'Senza posizione', items));
    });

    if (byLocation['__none__']?.length) {
      content.appendChild(buildGroup('__none__', '❓', 'Senza posizione', byLocation['__none__']));
    }
  }
}

function renderStats() {
  const row = document.getElementById('statsRow');
  const total = state.items.length;

  const inUso    = state.items.filter(i => i.location?.name === 'In uso').length;
  const daLavare = state.items.filter(i => i.location?.name === 'Lavare').length;
  // "Lavati" = tutto tranne in uso e da lavare (armadio, valigie, zaino, posizione nulla…)
  const lavati   = total - inUso - daLavare;

  row.innerHTML = '';

  const stats = [
    { value: total,    label: 'Capi totali' },
    { value: inUso,    label: 'In uso' },
    { value: daLavare, label: 'Da lavare' },
    { value: lavati,   label: 'Lavati' },
  ];

  stats.forEach(s => {
    const card = document.createElement('div');
    card.className = 'stat-card';
    card.innerHTML = `<div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div>`;
    row.appendChild(card);
  });
}

// ─── Detail sheet ────────────────────────────────────────────────────────────

function openSheet(item) {
  const overlay = document.getElementById('sheetOverlay');
  const sheetContent = document.getElementById('sheetContent');

  const catHue  = item.category ? hueFromString(item.category.name) : null;
  const locHue  = item.location ? hueFromString(item.location.name) : null;
  const colorCSS = colorToCSS(item.color);

  // Build tags row
  const tagsDiv = document.createElement('div');
  tagsDiv.className = 'sheet-tags';

  if (item.category) tagsDiv.appendChild(tagEl(item.category.name, item.category.icon, catHue));
  if (item.location) tagsDiv.appendChild(tagEl(item.location.name, item.location.icon, locHue));

  // Details table
  const dl = document.createElement('dl');
  dl.className = 'sheet-details';

  const fields = [
    { label: 'Marca',   value: item.brand },
    { label: 'Colore',  value: item.color, swatch: true },
    { label: 'Taglia',  value: item.size },
    { label: 'Posizione', value: item.location ? `${item.location.icon ?? ''} ${item.location.name}` : null },
    { label: 'Categoria', value: item.category ? `${item.category.icon ?? ''} ${item.category.name}` : null },
    { label: 'Aggiornato', value: formatDate(item.updated_at) },
  ];

  fields.forEach(f => {
    if (!f.value) return;
    const row = document.createElement('div');
    row.className = 'd-row';

    const dt = document.createElement('dt');
    dt.textContent = f.label;

    const dd = document.createElement('dd');

    if (f.swatch) {
      const sw = document.createElement('span');
      sw.className = 'swatch';
      sw.style.cssText = `background:${colorCSS};width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:6px;border-radius:50%;border:1px solid rgba(255,255,255,.15)`;
      dd.appendChild(sw);
      dd.appendChild(document.createTextNode(f.value));
    } else {
      dd.textContent = f.value;
    }

    row.append(dt, dd);
    dl.appendChild(row);
  });

  if (item.notes) {
    const row = document.createElement('div');
    row.className = 'd-row notes-row';
    row.innerHTML = `<dt>Note</dt><dd>${item.notes}</dd>`;
    dl.appendChild(row);
  }

  sheetContent.innerHTML = '';
  const title = document.createElement('h2');
  title.className = 'sheet-title';
  title.textContent = item.name;
  sheetContent.append(title, tagsDiv, dl);

  overlay.hidden = false;
  // rAF needed so the transition fires after display:block
  requestAnimationFrame(() => overlay.classList.add('is-visible'));
  document.body.style.overflow = 'hidden';
}

function closeSheet() {
  const overlay = document.getElementById('sheetOverlay');
  overlay.classList.remove('is-visible');
  overlay.addEventListener('transitionend', () => {
    overlay.hidden = true;
    document.body.style.overflow = '';
  }, { once: true });
}

// ─── Sync bar ────────────────────────────────────────────────────────────────

function setSyncLine(text) {
  document.getElementById('syncLine').textContent = text;
}

// ─── Data load ───────────────────────────────────────────────────────────────

async function loadData() {
  if (state.loading) return;
  state.loading = true;
  state.error = null;

  const refreshBtn = document.getElementById('refreshBtn');
  refreshBtn.classList.add('spinning');
  setSyncLine('Sincronizzazione…');

  try {
    const data = await fetchAll();
    state.items      = data.items;
    state.categories = data.categories;
    state.locations  = data.locations;

    // Open all groups by default on first load
    if (state.openGroups.size === 0) {
      const groupKeys = state.view === 'category'
        ? state.categories.map(c => c.id)
        : state.locations.map(l => l.id);
      groupKeys.forEach(k => state.openGroups.add(k));
    }

    const now = new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });
    setSyncLine(`Aggiornato alle ${now} · ${state.items.length} capi`);
    renderFilterChips();
    render();
  } catch (err) {
    state.error = err;
    setSyncLine('Errore durante il caricamento');
    render();
  } finally {
    state.loading = false;
    refreshBtn.classList.remove('spinning');
  }
}

// ─── Event wiring ────────────────────────────────────────────────────────────

function initEvents() {
  // Search
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearch');

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.trim();
    state.query = q;
    clearBtn.hidden = q.length === 0;
    render();
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    state.query = '';
    clearBtn.hidden = true;
    searchInput.focus();
    render();
  });

  // View toggle
  document.getElementById('viewToggle').addEventListener('click', e => {
    const btn = e.target.closest('.toggle-btn');
    if (!btn || btn.classList.contains('is-active')) return;

    document.querySelectorAll('.toggle-btn').forEach(b => {
      b.classList.toggle('is-active', b === btn);
      b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
    });

    state.view = btn.dataset.view;
    state.activeFilter = null;
    // Re-compute open groups for new view dimension
    state.openGroups.clear();
    const keys = state.view === 'category'
      ? state.categories.map(c => c.id)
      : state.locations.map(l => l.id);
    keys.forEach(k => state.openGroups.add(k));

    renderFilterChips();
    render();
  });

  // Refresh
  document.getElementById('refreshBtn').addEventListener('click', loadData);

  // Bulk bar: cancel
  document.getElementById('bulkCancel').addEventListener('click', exitSelectMode);

  // Sheet close
  document.getElementById('sheetClose').addEventListener('click', closeSheet);
  document.getElementById('sheetOverlay').addEventListener('click', e => {
    if (e.target === e.currentTarget) closeSheet();
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeSheet();
  });
}

// ─── Boot ────────────────────────────────────────────────────────────────────

// Object.groupBy polyfill (Safari <17.4 & older Chrome)
if (!Object.groupBy) {
  Object.groupBy = (arr, fn) =>
    arr.reduce((acc, item) => {
      const key = fn(item);
      (acc[key] ??= []).push(item);
      return acc;
    }, {});
}

(function boot() {
  initEvents();
  loadData();
})();
