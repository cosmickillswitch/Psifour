// Shelf: books, magazines, comics, binders, notebooks and paper stacks on shelves you arrange, with readers that behave like the real thing.
(() => {
  'use strict';
  const $ = s => document.querySelector(s);
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    if (a) for (const k in a) { const v = a[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat(5)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let tt = 0; const toast = (m, ms) => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), ms || 2600); };

  // ---------- storage ----------
  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('psiphi-shelf', 2); r.onupgradeneeded = () => { for (const n of ['shelves', 'items', 'blobs', 'text']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (st, mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(st, mode), q = fn(t.objectStore(st)); let out; if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage is full')); }); };
  const all = st => tx(st, 'readonly', s => s.getAll());
  const put = (st, v) => tx(st, 'readwrite', s => s.put(v));
  const del = (st, id) => tx(st, 'readwrite', s => s.delete(id));
  const getBlob = id => tx('blobs', 'readonly', s => s.get(id)).then(r => r && r.blob);
  async function putBlob(blob) { const id = 'b' + uid(); await put('blobs', { id, blob }); return id; }
  // page text: words with boxes in page fractions, [[word, x, y, w, h], …], kept per page as 'itemId:page'
  const putText = (id, n, words) => put('text', { id: id + ':' + n, words });
  const getText = (id, n) => tx('text', 'readonly', s => s.get(id + ':' + n)).then(r => (r && r.words) || []);
  // pdf.js text items → words with boxes
  function pdfWords(tc, vp, L) {
    const out = [];
    for (const itx of tc.items) {
      const str = itx.str; if (!str || !str.trim()) continue;
      const t = L.Util.transform(vp.transform, itx.transform), fh = Math.hypot(t[2], t[3]) || 10, x0 = t[4], base = t[5], W = (itx.width || 0) * vp.scale || str.length * fh * 0.5;
      const re = /\S+/g; let m;
      while ((m = re.exec(str))) {
        const a = m.index / str.length, b = (m.index + m[0].length) / str.length;
        out.push([m[0], (x0 + W * a) / vp.width, (base - fh * 0.85) / vp.height, (W * (b - a)) / vp.width, (fh * 1.12) / vp.height].map((v, i) => i ? Math.round(v * 10000) / 10000 : v));
      }
    }
    return out;
  }
  const URLS = new Map();
  function urlOf(id) { if (!URLS.has(id)) URLS.set(id, getBlob(id).then(b => b ? URL.createObjectURL(b) : '')); return URLS.get(id); }

  let SHELVES = [], ITEMS = new Map(), mode = localStorage.getItem('shelf.view') || 'spines';
  const strip = o => JSON.parse(JSON.stringify(o));
  const saveShelf = s => put('shelves', strip(s));
  const saveItem = it => { it.updated = Date.now(); return put('items', strip(it)); };

  // ---------- kinds and looks ----------
  const KINDS = { book: ['📕', 'Book'], magazine: ['📰', 'Magazine'], comic: ['💥', 'Comic'], stack: ['📄', 'Paper stack'], binder: ['🗂', 'Binder'], notebook: ['📓', 'Notebook'] };
  const STYLES = [['oak', 'Oak'], ['walnut', 'Walnut'], ['white', 'White'], ['metal', 'Metal'], ['glass', 'Glass']];
  const COLOURS = ['#7a2e2e', '#24466e', '#2f5d3a', '#6b4b2a', '#3d2f52', '#1f1f24', '#8a6d2c', '#b4552c', '#2f6f73', '#c9c2b4', '#a33b62', '#4a5563'];
  const lum = c => { const n = parseInt(String(c).slice(1), 16); return ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11); };
  const textOn = c => lum(c) > 150 ? '#1d1a16' : '#f6efe2';
  const pageCount = it => it.pages.length;
  // physical size on the shelf (px), from the page shape and the page count
  function dims(it, face) {
    const p = it.pages[0] || { w: 600, h: 840 }, ar = clamp(p.h / p.w, 0.5, 1.9), n = pageCount(it);
    let H = it.kind === 'magazine' ? 196 : it.kind === 'comic' ? 176 : it.kind === 'binder' ? 190 : clamp(140 + (ar - 1.2) * 70, 128, 192);
    if (it.kind === 'stack') { const th = clamp(4 + n * 0.45, 6, 70); return { w: Math.round(H / ar * 0.95), h: Math.round(th + H / ar * 0.95 * 0.45) , th }; }
    if (face || it.kind === 'magazine' && mode === 'covers') return { w: Math.round(H / ar), h: Math.round(H) };
    const w = it.kind === 'magazine' ? clamp(6 + n * 0.05, 7, 16) : it.kind === 'comic' ? clamp(6 + n * 0.08, 7, 18) : it.kind === 'binder' ? clamp(34 + n * 0.06, 38, 70) : it.kind === 'notebook' ? clamp(14 + n * 0.12, 18, 40) : clamp(12 + n * 0.17, 16, 64);
    return { w: Math.round(w), h: Math.round(H) };
  }
  function itemEl(it) {
    const face = mode === 'covers' || it.kind === 'stack', d = dims(it, face && it.kind !== 'stack');
    const el = h('div', { class: 'it ' + (it.kind === 'magazine' ? 'mag ' : it.kind === 'comic' ? 'comic ' : '') + (face && it.kind !== 'stack' && it.lean ? 'lean' : ''), 'data-id': it.id, role: 'button', tabindex: 0, 'aria-label': it.title + (it.author ? ', ' + it.author : ''), title: it.title + (it.author ? ' — ' + it.author : ''), style: { width: d.w + 'px', height: d.h + 'px' } });
    const col = it.colour || '#6b4b2a', tc = textOn(col);
    if (it.kind === 'stack') {
      const st = h('div', { class: 'stack' }, h('div', { class: 'sheets', style: { height: d.th + 'px' } }), h('div', { class: 'top', style: { bottom: d.th + 'px', height: (d.w * (it.pages[0] ? it.pages[0].h / it.pages[0].w : 1.3) * 0.92) + 'px' } }, h('img', { alt: '' })));
      el.append(st); setImg(st.querySelector('img'), it);
    } else if (face) {
      const cv = h('div', { class: 'cover' }, it.cover ? h('img', { alt: '', src: it.cover }) : h('div', { class: 'ph', style: { background: col, color: tc } }, it.title, it.author ? h('small', { style: { fontWeight: 400, fontSize: '11px', marginTop: '8px' } }, it.author) : null));
      if (it.kind === 'magazine' || it.kind === 'comic') cv.append(h('div', { class: 'gl' }));
      el.append(cv);
    } else {
      const tex = it.tex || (it.kind === 'magazine' || it.kind === 'comic' ? 'gloss' : it.kind === 'binder' ? 'cloth' : 'cloth');
      const sp = h('div', { class: 'spine ' + tex, style: { background: col, color: tc } });
      if (it.kind === 'notebook') sp.append(h('span', { class: 'coil' }));
      else if (it.kind === 'binder') { sp.append(h('span', { class: 'ring', style: { top: '18%' } }), h('span', { class: 'ring', style: { bottom: '18%' } })); }
      if (d.w >= 12) sp.append(h('span', { class: 't', style: { fontSize: (d.w < 20 ? 9.5 : d.w < 30 ? 11 : 13) + 'px', background: it.kind === 'binder' ? 'rgba(255,255,255,.85)' : null, color: it.kind === 'binder' ? '#222' : null, padding: it.kind === 'binder' ? '6px 2px' : null } }, it.title));
      if (it.author && d.w >= 30) sp.append(h('span', { class: 'a' }, it.author.split(' ').pop()));
      el.append(sp);
    }
    if (it.pos > 0 && pageCount(it) > 1) el.append(h('div', { class: 'prog' }, h('i', { style: { width: Math.round(100 * (it.pos + 1) / pageCount(it)) + '%' } })));
    return el;
  }
  function setImg(img, it, i) { const p = it.pages[i || 0]; if (p) urlOf(p.b).then(u => { if (u) img.src = u; }); }

  // ---------- the room ----------
  function render() {
    const room = $('#room'), q = $('#q').value.trim().toLowerCase();
    room.textContent = '';
    $('#viewBtn').textContent = mode === 'covers' ? '▣ Covers' : '▥ Spines';
    if (!ITEMS.size && SHELVES.every(s => !s.order.length)) room.append(h('div', { class: 'welcome' }, h('h2', {}, 'Your shelves are empty'), h('p', {}, 'Add a PDF as a book, magazine, comic or binder, or turn photos of pages into a paper stack. From Psi Phi Notes or Logos, use ⇪ Send to › Shelf to put a notebook or document here.'), h('div', { style: { display: 'flex', gap: '8px', justifyContent: 'center', flexWrap: 'wrap', marginTop: '14px' } }, h('button', { class: 'btn primary', type: 'button', onclick: () => importPdf('book') }, '📕 Add a PDF'), h('button', { class: 'btn', type: 'button', onclick: () => importPhotos() }, '📄 Photos as a paper stack'))));
    for (const s of SHELVES) {
      const ids = s.order.filter(id => ITEMS.has(id) && (!q || (ITEMS.get(id).title + ' ' + (ITEMS.get(id).author || '')).toLowerCase().includes(q)));
      if (q && !ids.length) continue;
      const nm = h('span', { class: 'nm', contenteditable: 'true', spellcheck: 'false', role: 'textbox', 'aria-label': 'Shelf name' }, s.name);
      nm.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nm.blur(); } });
      nm.addEventListener('blur', () => { const v = nm.textContent.trim().slice(0, 40) || 'Shelf'; if (v !== s.name) { s.name = v; saveShelf(s); } });
      const row = h('div', { class: 'row', 'data-shelf': s.id });
      for (const id of ids) row.append(itemEl(ITEMS.get(id)));
      if (!ids.length) row.append(h('div', { class: 'empty-row' }, 'Drag things here, or ＋ Add'));
      room.append(h('section', { class: 'shelf ' + (s.style || 'oak'), 'data-shelf': s.id }, h('div', { class: 'shead' }, nm, h('span', { class: 'ct' }, ids.length + (ids.length === 1 ? ' item' : ' items')), h('span', { class: 'grow' }), h('button', { type: 'button', 'aria-label': 'Shelf options', onclick: e => shelfMenu(s, e.currentTarget) }, '⋯')), row, h('div', { class: 'plank' })));
    }
    if (!q) room.append(h('div', { style: { textAlign: 'center' } }, h('button', { class: 'btn', type: 'button', onclick: () => addShelf() }, '＋ New shelf')));
  }
  async function addShelf(name) { const s = { id: 's' + uid(), name: name || 'New shelf', style: STYLES[SHELVES.length % STYLES.length][0], order: [], n: SHELVES.length }; SHELVES.push(s); await saveShelf(s); render(); return s; }
  function saveOrder() { SHELVES.forEach((s, i) => { s.n = i; saveShelf(s); }); }
  function shelfMenu(s, anchor) {
    const i = SHELVES.indexOf(s);
    menu(anchor, m => {
      m.append(h('h5', {}, 'Wood and finish'));
      for (const [k, l] of STYLES) m.append(mi(s.style === k ? '●' : '○', l, () => { s.style = k; saveShelf(s); render(); }));
      m.append(h('hr'), mi('＋', 'Add to this shelf…', () => addMenu(anchor, s)));
      m.append(mi('⇅', 'Sort by title', () => { s.order.sort((a, b) => (ITEMS.get(a) || {}).title.localeCompare((ITEMS.get(b) || {}).title)); saveShelf(s); render(); }), mi('⇅', 'Sort by kind, then title', () => { s.order.sort((a, b) => { const A = ITEMS.get(a), B = ITEMS.get(b); return A.kind.localeCompare(B.kind) || A.title.localeCompare(B.title); }); saveShelf(s); render(); }));
      if (i > 0) m.append(mi('↑', 'Move shelf up', () => { [SHELVES[i - 1], SHELVES[i]] = [SHELVES[i], SHELVES[i - 1]]; saveOrder(); render(); }));
      if (i < SHELVES.length - 1) m.append(mi('↓', 'Move shelf down', () => { [SHELVES[i + 1], SHELVES[i]] = [SHELVES[i], SHELVES[i + 1]]; saveOrder(); render(); }));
      if (SHELVES.length > 1) m.append(h('hr'), mi('🗑', s.order.length ? 'Remove shelf (items move to the shelf above)' : 'Remove shelf', async () => { const to = SHELVES[i ? i - 1 : 1]; to.order.push(...s.order); SHELVES.splice(i, 1); await del('shelves', s.id); saveOrder(); render(); }));
    });
  }
  function menu(anchor, build) {
    document.querySelectorAll('.menu').forEach(m => m.remove());
    const m = h('div', { class: 'menu', role: 'menu' }); build(m); document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }, W = m.offsetWidth, H = m.offsetHeight;
    m.style.left = clamp(r.right - W, 6, innerWidth - W - 6) + 'px'; m.style.top = (r.bottom + 6 + H < innerHeight ? r.bottom + 6 : Math.max(6, r.top - H - 6)) + 'px';
    setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }; addEventListener('pointerdown', off, true); }, 0);
  }
  const mi = (ic, label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { document.querySelectorAll('.menu').forEach(m => m.remove()); fn(); } }, h('span', { style: { width: '22px', textAlign: 'center' } }, ic), label);
  function shelfOf(id) { return SHELVES.find(s => s.order.includes(id)); }

  // ---------- picking up and moving things: drag with a mouse, or press and hold with a finger ----------
  let drag = null;
  $('#room').addEventListener('pointerdown', e => {
    const el = e.target.closest('.it'); if (!el || e.button > 0) return;
    const id = el.dataset.id, start = { x: e.clientX, y: e.clientY, t: performance.now() };
    let holdT = null, live = false, pid = e.pointerId;
    const begin = () => {
      live = true; drag = { id, el, ghost: el.cloneNode(true) };
      const r = el.getBoundingClientRect();
      drag.dx = start.x - r.left; drag.dy = start.y - r.top;
      drag.ghost.classList.add('ghost'); drag.ghost.style.width = r.width + 'px'; drag.ghost.style.height = r.height + 'px';
      document.body.append(drag.ghost); el.classList.add('dragging');
      try { el.setPointerCapture(pid); } catch (er) { }
      if (navigator.vibrate) navigator.vibrate(10);
      place(start.x, start.y);
    };
    if (e.pointerType !== 'mouse') holdT = setTimeout(begin, 380);
    const mv = ev => {
      if (ev.pointerId !== pid) return;
      const dist = Math.hypot(ev.clientX - start.x, ev.clientY - start.y);
      if (!live) { if (e.pointerType === 'mouse' && dist > 6) begin(); else if (dist > 10) { clearTimeout(holdT); cleanup(); } return; }
      ev.preventDefault(); place(ev.clientX, ev.clientY);
    };
    const up = ev => {
      if (ev.pointerId !== pid) return;
      clearTimeout(holdT);
      if (live) finish(); else if (Math.hypot(ev.clientX - start.x, ev.clientY - start.y) < 10 && ev.type === 'pointerup') { if (performance.now() - start.t > 600) itemMenu(ITEMS.get(id), el); else openReader(id); }
      cleanup();
    };
    const cleanup = () => { removeEventListener('pointermove', mv); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); };
    addEventListener('pointermove', mv, { passive: false }); addEventListener('pointerup', up); addEventListener('pointercancel', up);
  });
  $('#room').addEventListener('contextmenu', e => { const el = e.target.closest('.it'); if (el) { e.preventDefault(); itemMenu(ITEMS.get(el.dataset.id), el); } });
  $('#room').addEventListener('keydown', e => { const el = e.target.closest('.it'); if (el && e.key === 'Enter') openReader(el.dataset.id); });
  // hold-to-drag must not also scroll the page
  $('#room').addEventListener('touchmove', e => { if (drag) e.preventDefault(); }, { passive: false });
  function place(x, y) {
    const g = drag.ghost; g.style.left = (x - drag.dx) + 'px'; g.style.top = (y - drag.dy) + 'px';
    document.querySelectorAll('.drop').forEach(d => d.remove());
    const under = document.elementFromPoint(x, y), row = under && (under.closest('.row') || (under.closest('.shelf') && under.closest('.shelf').querySelector('.row')));
    drag.target = null;
    if (!row) return;
    const items = [...row.querySelectorAll('.it:not(.dragging)')];
    let idx = items.length;
    for (let i = 0; i < items.length; i++) { const r = items[i].getBoundingClientRect(); if (x < r.left + r.width / 2) { idx = i; break; } }
    const mark = h('div', { class: 'drop' });
    if (idx < items.length) items[idx].before(mark); else row.append(mark);
    drag.target = { shelf: row.dataset.shelf, before: idx < items.length ? items[idx].dataset.id : null };
    // keep things in reach: scroll near the edges
    const rr = row.getBoundingClientRect();
    if (x > rr.right - 40) row.scrollLeft += 12; else if (x < rr.left + 40) row.scrollLeft -= 12;
    if (y > innerHeight - 60) scrollBy(0, 14); else if (y < 90) scrollBy(0, -14);
  }
  function finish() {
    const d = drag; drag = null; d.ghost.remove(); d.el.classList.remove('dragging'); document.querySelectorAll('.drop').forEach(x => x.remove());
    if (!d.target) return;
    const from = shelfOf(d.id), to = SHELVES.find(s => s.id === d.target.shelf); if (!to) return;
    if (from) from.order = from.order.filter(x => x !== d.id);
    const at = d.target.before ? to.order.indexOf(d.target.before) : -1;
    if (at < 0) to.order.push(d.id); else to.order.splice(at, 0, d.id);
    if (from && from !== to) saveShelf(from); saveShelf(to); render();
  }

  // ---------- adding things ----------
  let addTo = null;
  function addMenu(anchor, shelf) {
    addTo = shelf || null;
    menu(anchor, m => {
      m.append(h('h5', {}, 'From a PDF'));
      for (const k of ['book', 'magazine', 'comic', 'binder', 'notebook', 'stack']) m.append(mi(KINDS[k][0], 'As a ' + KINDS[k][1].toLowerCase(), () => importPdf(k)));
      m.append(h('hr'), mi('📄', 'Photos or scans as a paper stack', () => importPhotos('stack')), mi('📕', 'Photos or scans as a book', () => importPhotos('book')), h('hr'), mi('▭', 'New shelf', () => addShelf()));
    });
  }
  $('#addBtn').addEventListener('click', e => addMenu(e.currentTarget));
  $('#viewBtn').addEventListener('click', () => { mode = mode === 'covers' ? 'spines' : 'covers'; localStorage.setItem('shelf.view', mode); render(); });
  $('#q').addEventListener('input', render);
  let importKind = 'book';
  function importPdf(kind) { importKind = kind; $('#filePdf').click(); }
  function importPhotos(kind) { importKind = kind || 'stack'; $('#fileImg').click(); }
  function busy(msg) {
    let el = $('#busy'); if (!el) { el = h('div', { id: 'busy' }, h('div', {}, h('div', { class: 'm' }), h('progress', { max: 1, value: 0 }))); document.body.append(el); }
    el.querySelector('.m').textContent = msg; return { set: (v, m) => { el.querySelector('progress').value = v; if (m) el.querySelector('.m').textContent = m; }, done: () => el.remove() };
  }
  let pdfjsP = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfjsP || (pdfjsP = new Promise((res, rej) => { const s = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' }); s.onload = () => { window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(window.pdfjsLib); }; s.onerror = () => { pdfjsP = null; rej(new Error('Couldn’t load the PDF reader: the first PDF needs the internet.')); }; document.head.append(s); }));
  }
  const canvasBlob = (c, q) => new Promise(r => c.toBlob(r, 'image/jpeg', q || 0.86));
  function coverOf(c) { const k = 260 / Math.max(c.width, c.height), t = h('canvas'); t.width = Math.round(c.width * k); t.height = Math.round(c.height * k); t.getContext('2d').drawImage(c, 0, 0, t.width, t.height); return t; }
  function avgColour(c) { const t = h('canvas'); t.width = t.height = 8; const x = t.getContext('2d'); x.drawImage(c, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0; for (let i = 0; i < d.length; i += 4) { r += d[i]; g += d[i + 1]; b += d[i + 2]; } const n = d.length / 4; const f = v => Math.round(v / n * 0.72).toString(16).padStart(2, '0'); return '#' + f(r) + f(g) + f(b); }
  async function makeItem(over, canvases) {
    // canvases: async generator of [canvas, w, h]
    const it = Object.assign({ id: 'i' + uid(), kind: 'book', title: 'Untitled', author: '', pages: [], pos: 0, bookmarks: [], created: Date.now() }, over);
    for await (const [c, words] of canvases) {
      if (words && words.length) { await putText(it.id, it.pages.length, words); it.words = (it.words || 0) + words.length; }
      if (!it.pages.length) { const cv = coverOf(c); it.cover = cv.toDataURL('image/jpeg', 0.8); if (!it.colour) it.colour = avgColour(c); }
      it.pages.push({ b: await putBlob(await canvasBlob(c)), w: c.width, h: c.height });
      c.width = c.height = 0;
    }
    if (!it.pages.length) throw new Error('Nothing to add');
    ITEMS.set(it.id, it); await saveItem(it);
    const s = addTo || SHELVES[0] || await addShelf('My shelf'); s.order.push(it.id); await saveShelf(s); addTo = null;
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    render(); return it;
  }
  async function addFromPdf(file, kind, title) {
    const b = busy('Opening the PDF…');
    try {
      const L = await pdfjs(), buf = await file.arrayBuffer(), pdf = await L.getDocument({ data: new Uint8Array(buf) }).promise;
      let meta = {}; try { meta = (await pdf.getMetadata()).info || {}; } catch (e) { }
      const N = pdf.numPages;
      async function* gen() {
        for (let n = 1; n <= N; n++) {
          const page = await pdf.getPage(n), v1 = page.getViewport({ scale: 1 }), sc = Math.min(1800 / Math.max(v1.width, v1.height), 3), vp = page.getViewport({ scale: sc });
          const c = h('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height); const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: x, viewport: vp }).promise; b.set(n / N, 'Reading page ' + n + ' of ' + N + '…');
          let words = []; try { words = pdfWords(await page.getTextContent(), vp, L); } catch (e) { }
          yield [c, words];
        }
      }
      const it = await makeItem({ kind, title: (title || meta.Title || file.name.replace(/\.pdf$/i, '')).slice(0, 80), author: (meta.Author || '').slice(0, 60), rtl: false }, gen());
      toast('“' + it.title + '” is on the shelf: ' + it.pages.length + ' pages.');
    } catch (e) { toast(e.message || 'Couldn’t read that PDF.', 5000); }
    b.done();
  }
  async function addFromImages(files, kind, title) {
    const list = [...files].filter(f => f.type.startsWith('image/')); if (!list.length) return;
    const b = busy('Adding pages…');
    try {
      async function* gen() { let i = 0; for (const f of list) { const bm = await createImageBitmap(f), k = Math.min(1, 1800 / Math.max(bm.width, bm.height)), c = h('canvas'); c.width = Math.round(bm.width * k); c.height = Math.round(bm.height * k); c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height); b.set(++i / list.length); yield [c]; } }
      const it = await makeItem({ kind, title: (title || (list.length === 1 ? list[0].name.replace(/\.[^.]+$/, '') : 'Pages ' + new Date().toLocaleDateString())).slice(0, 80) }, gen());
      toast('Added “' + it.title + '”: ' + it.pages.length + ' page' + (it.pages.length > 1 ? 's' : '') + '.');
    } catch (e) { toast(e.message || 'Couldn’t add those pictures.'); }
    b.done();
  }
  $('#filePdf').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) addFromPdf(f, importKind); });
  $('#fileImg').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; addFromImages(fs, importKind); });
  addEventListener('dragover', e => { if ([...(e.dataTransfer || {}).types || []].includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => { const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (!fs.length) return; e.preventDefault(); const pdf = fs.find(f => f.type === 'application/pdf'); if (pdf) addFromPdf(pdf, 'book'); else addFromImages(fs, 'stack'); });

  // ---------- an item's details ----------
  function itemMenu(it, anchor) {
    if (!it) return;
    menu(anchor, m => m.append(
      mi('📖', 'Open', () => openReader(it.id)),
      mi('✎', 'Title, kind and look…', () => editDialog(it)),
      h('h5', {}, 'Move to shelf'), ...SHELVES.map(s => mi(shelfOf(it.id) === s ? '●' : '○', s.name, () => { const f = shelfOf(it.id); if (f) { f.order = f.order.filter(x => x !== it.id); saveShelf(f); } s.order.push(it.id); saveShelf(s); render(); })),
      h('hr'),
      window.PsiHub ? mi('✎', 'Open in Notes to write on it', () => sendTo('notes', it)) : null,
      mi('🔊', it.words ? 'Read aloud' : 'Find the words so it can be read aloud…', () => it.words ? openReader(it.id, true) : textMenu(it, anchor)),
      mi('🗑', 'Remove from the shelf', async () => { if (!confirm('Remove “' + it.title + '” and its pages?')) return; const f = shelfOf(it.id); if (f) { f.order = f.order.filter(x => x !== it.id); await saveShelf(f); } ITEMS.delete(it.id); await del('items', it.id); for (let n = 0; n < it.pages.length; n++) { await del('blobs', it.pages[n].b).catch(() => { }); await del('text', it.id + ':' + n).catch(() => { }); } render(); })));
  }
  function textMenu(it, anchor) {
    menu(anchor, m => m.append(h('h5', {}, 'Find the words in “' + it.title.slice(0, 30) + '”'),
      mi('⎘', 'From the same PDF (exact, instant)', () => { textFor = it; $('#fileText').click(); }),
      mi('👁', 'Recognise them in the pictures (OCR, needs the internet)', () => ocrItem(it))));
  }
  let textFor = null;
  const fileText = h('input', { id: 'fileText', type: 'file', accept: 'application/pdf,.pdf', hidden: true }); document.body.append(fileText);
  fileText.addEventListener('change', async e => {
    const f = e.target.files[0], it = textFor; e.target.value = ''; textFor = null; if (!f || !it) return;
    const b = busy('Finding the words…');
    try {
      const L = await pdfjs(), pdf = await L.getDocument({ data: new Uint8Array(await f.arrayBuffer()) }).promise;
      if (pdf.numPages !== it.pages.length) toast('That PDF has ' + pdf.numPages + ' pages; this item has ' + it.pages.length + '. Matching page by page.', 4500);
      let total = 0;
      for (let n = 1; n <= Math.min(pdf.numPages, it.pages.length); n++) { const page = await pdf.getPage(n), vp = page.getViewport({ scale: 1 }), w = pdfWords(await page.getTextContent(), vp, L); await putText(it.id, n - 1, w); total += w.length; b.set(n / it.pages.length); }
      it.words = total; await saveItem(it); render();
      toast(total ? 'Found ' + total.toLocaleString() + ' words. Tap 🔊 in the reader to listen.' : 'That PDF has no text in it (it may be scanned): try OCR instead.', 4500);
    } catch (er) { toast(er.message || 'Couldn’t read that PDF.', 5000); }
    b.done();
  });
  // OCR with Tesseract (loaded on first use, with its English model)
  let tessP = null;
  function tesseract() { return window.Tesseract ? Promise.resolve(window.Tesseract) : tessP || (tessP = new Promise((res, rej) => { const s = h('script', { src: 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js' }); s.onload = () => res(window.Tesseract); s.onerror = () => { tessP = null; rej(new Error('Couldn’t load the text recogniser: it needs the internet the first time.')); }; document.head.append(s); })); }
  async function ocrItem(it) {
    const b = busy('Loading the text recogniser…');
    try {
      const T = await tesseract(), worker = await T.createWorker('eng');
      let total = 0;
      for (let n = 0; n < it.pages.length; n++) {
        b.set(n / it.pages.length, 'Reading page ' + (n + 1) + ' of ' + it.pages.length + '…');
        const blob = await getBlob(it.pages[n].b), { data } = await worker.recognize(blob), W = it.pages[n].w, H = it.pages[n].h;
        const words = (data.words || []).filter(w => w.text && w.text.trim() && w.confidence > 30).map(w => [w.text, w.bbox.x0 / W, w.bbox.y0 / H, (w.bbox.x1 - w.bbox.x0) / W, (w.bbox.y1 - w.bbox.y0) / H].map((v, i) => i ? Math.round(v * 10000) / 10000 : v));
        await putText(it.id, n, words); total += words.length;
      }
      await worker.terminate(); it.words = total; await saveItem(it); render();
      toast('Recognised ' + total.toLocaleString() + ' words.', 4000);
    } catch (er) { toast(er.message || 'Text recognition failed.', 5000); }
    b.done();
  }
  function editDialog(it) {
    const d = h('dialog'), st = { kind: it.kind, colour: it.colour || COLOURS[0], tex: it.tex || 'cloth', rtl: !!it.rtl, lean: !!it.lean };
    const title = h('input', { type: 'text', value: it.title }), author = h('input', { type: 'text', value: it.author || '', placeholder: 'Author (optional)' });
    const kinds = h('div', { class: 'kinds' }), sws = h('div', { class: 'sws' }), texs = h('div', { class: 'kinds' });
    const draw = () => {
      kinds.textContent = ''; for (const k in KINDS) kinds.append(h('button', { type: 'button', class: st.kind === k ? 'on' : '', onclick: () => { st.kind = k; draw(); } }, KINDS[k][0] + ' ' + KINDS[k][1]));
      sws.textContent = ''; for (const c of [it.coverColour || '', ...COLOURS].filter(Boolean)) sws.append(h('i', { class: st.colour === c ? 'on' : '', style: { background: c }, onclick: () => { st.colour = c; draw(); } }));
      texs.textContent = ''; for (const [k, l] of [['cloth', 'Cloth'], ['leather', 'Leather + gilt'], ['gloss', 'Glossy']]) texs.append(h('button', { type: 'button', class: st.tex === k ? 'on' : '', onclick: () => { st.tex = k; draw(); } }, l));
    };
    draw();
    const rtl = h('input', { type: 'checkbox' }); rtl.checked = st.rtl;
    const lean = h('input', { type: 'checkbox' }); lean.checked = st.lean;
    d.append(h('div', { class: 'dlg' }, h('h2', {}, 'Details'), h('label', {}, 'Title'), title, h('label', {}, 'Author'), author, h('label', {}, 'Kind'), kinds, h('label', {}, 'Spine colour'), sws, h('label', {}, 'Spine finish'), texs,
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--ink)' } }, rtl, 'Reads right to left (manga, Arabic, Hebrew)'),
      h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', color: 'var(--ink)' } }, lean, 'Lean it when showing covers'),
      h('div', { class: 'acts' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => d.close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: async () => { Object.assign(it, { title: title.value.trim() || it.title, author: author.value.trim(), kind: st.kind, colour: st.colour, tex: st.tex, rtl: rtl.checked, lean: lean.checked }); await saveItem(it); d.close(); render(); } }, 'Save'))));
    document.body.append(d); d.addEventListener('close', () => d.remove()); d.showModal();
  }

  // ---------- Psi Phi: send and receive ----------
  async function sendTo(app, it, only) {
    const blobs = []; for (const p of (only != null ? [it.pages[only]] : it.pages)) blobs.push(await getBlob(p.b));
    if (only != null) return PsiHub.send(app, { kind: 'image', name: it.title + ' p' + (only + 1), blob: blobs[0] });
    return PsiHub.send(app, { kind: 'pages', name: it.title, blobs, sizes: it.pages.map(p => [p.w, p.h]) });
  }
  async function receive(p) {
    const name = (p.name || 'From ' + ((PsiHub.byId(p.from) || {}).short || 'Psi Phi')).slice(0, 80);
    const kind = p.shelfKind || (p.from === 'notes' ? 'notebook' : p.from === 'logos' ? 'book' : 'stack');
    if (p.kind === 'pages' || p.kind === 'image') {
      const blobs = p.kind === 'image' ? [p.blob] : p.blobs;
      async function* gen() { let n = 0; for (const bl of blobs) { const bm = await createImageBitmap(bl), c = h('canvas'); c.width = bm.width; c.height = bm.height; c.getContext('2d').drawImage(bm, 0, 0); yield [c, (p.texts || [])[n++] || []]; } }
      const it = await makeItem({ kind, title: name }, gen()); toast('“' + it.title + '” is on the shelf.'); return;
    }
    if (p.kind === 'pdf') { await addFromPdf(new File([p.blob], name + '.pdf', { type: 'application/pdf' }), 'book', name); return; }
    toast('Shelf takes pages, pictures and PDFs.');
  }

  // ---------- start ----------
  (async () => {
    SHELVES = (await all('shelves').catch(() => [])).sort((a, b) => (a.n || 0) - (b.n || 0));
    for (const it of await all('items').catch(() => [])) ITEMS.set(it.id, it);
    if (!SHELVES.length) { await addShelf('Reading'); await addShelf('Reference'); SHELVES[1].style = 'walnut'; saveShelf(SHELVES[1]); }
    // anything not on a shelf goes on the first
    const placed = new Set(SHELVES.flatMap(s => s.order)); const lost = [...ITEMS.keys()].filter(id => !placed.has(id)); if (lost.length) { SHELVES[0].order.push(...lost); saveShelf(SHELVES[0]); }
    render();
    if (window.PsiHub) {
      PsiHub.mountHome($('#top'), $('#top').firstElementChild);
      PsiHub.mountSend($('#top'), () => { const it = readerItem; if (!it) return []; return [{ to: 'notes', label: '“' + it.title + '” as a notebook to write on', make: async () => ({ kind: 'pages', name: it.title, blobs: await Promise.all(it.pages.map(p => getBlob(p.b))), sizes: it.pages.map(p => [p.w, p.h]) }) }, { to: 'studio', label: 'This page as a picture', make: async () => ({ kind: 'image', name: it.title, blob: await getBlob(it.pages[readerPos()].b) }) }, { to: 'tabula', label: 'This page to paint on', make: async () => ({ kind: 'image', name: it.title, blob: await getBlob(it.pages[readerPos()].b) }) }]; }, $('#viewBtn'));
      const pay = await PsiHub.take().catch(() => null); if (pay) await receive(pay).catch(e => toast('Couldn’t add that: ' + (e.message || e)));
      const open = new URLSearchParams(location.search).get('open'); if (open && ITEMS.has(open)) openReader(open);
    }
  })();

  // the reader lives in shelf-reader code below; these are shared with it
  let readerItem = null, readerPos = () => 0;
  window.ShelfCore = { $, h, clamp, toast, urlOf, getBlob, saveItem, getText, textMenu, ITEMS, render, menu, mi, sendTo, KINDS, setReader: (it, pos) => { readerItem = it; readerPos = pos; }, addFromPdf, addFromImages, receive, get SHELVES() { return SHELVES; } };
  function openReader(id, speak) { if (!window.ShelfReader) return; window.ShelfReader.open(ITEMS.get(id)); if (speak && window.ShelfSpeech) setTimeout(() => window.ShelfSpeech.show(true), 300); }
})();

// ---------- the reader: books and magazines turn their pages; paper stacks slide sheet by sheet ----------
(() => {
  'use strict';
  const C = window.ShelfCore, { $, h, clamp, toast, urlOf, saveItem } = C;
  const R = $('#reader'), stage = $('#stage'), zoomer = $('#zoomer');
  let it = null, N = 0, spread = false, k = 0, pw = 0, ph = 0, book = null, flip = null, Z = { k: 1, x: 0, y: 0 }, saveT = null;
  const isStack = () => it.kind === 'stack';
  const PAPER = { book: '#fbf8f1', notebook: '#fbf8f1', binder: '#ffffff', magazine: '#ffffff', comic: '#ffffff', stack: '#ffffff' };
  // spread k shows pages 2k-1 (left) and 2k (right): the cover sits alone on the right, like a real book
  const L = kk => spread ? 2 * kk - 1 : -1, Rp = kk => spread ? 2 * kk : kk;
  const valid = i => i >= 0 && i < N;
  const maxK = () => spread ? Math.floor(N / 2) : N - 1;
  const toK = p => spread ? Math.floor((p + 1) / 2) : p;
  const curPage = () => valid(Rp(k)) ? Rp(k) : Math.max(0, L(k));
  function open(item) {
    if (!item) return;
    it = item; N = it.pages.length; R.hidden = false; Z = { k: 1, x: 0, y: 0 };
    R.className = isStack() ? 'desk' : (it.kind === 'magazine' || it.kind === 'comic') ? 'mag' : '';
    $('#rTitle').textContent = it.title; $('#rSlider').max = Math.max(0, N - 1);
    document.documentElement.style.overflow = 'hidden';
    C.setReader(it, curPage);
    if (!history.state || !history.state.reader) history.pushState({ reader: 1 }, '');
    layout(); go(clamp(it.pos || 0, 0, N - 1));
  }
  function close() {
    if (R.hidden) return;
    if (window.ShelfSpeech) ShelfSpeech.stop(true);
    R.hidden = true; document.documentElement.style.overflow = ''; closeThumbs();
    it.pos = curPage(); saveItem(it); C.setReader(null, () => 0); it = null; C.render();
  }
  $('#rBack').addEventListener('click', () => { if (history.state && history.state.reader) history.back(); else close(); });
  addEventListener('popstate', () => close());
  function layout() {
    const SW = stage.clientWidth, SH = stage.clientHeight, p = it.pages[0] || { w: 600, h: 840 }, ar = p.h / p.w;
    spread = !isStack() && N > 1 && SW > SH * 1.05;
    ph = Math.min(SH * 0.92, (spread ? SW * 0.94 / 2 : SW * 0.92) * ar); pw = ph / ar;
    zoomer.textContent = '';
    if (isStack()) { book = h('div', { id: 'book' }); zoomer.append(book); placeBook(SW, SH, pw); return; }
    book = h('div', { id: 'book', class: (spread ? 'spread' : 'single') + (it.rtl ? ' mir' : '') });
    zoomer.append(book); placeBook(SW, SH, spread ? pw * 2 : pw);
  }
  function placeBook(SW, SH, W) { book.style.width = W + 'px'; book.style.height = ph + 'px'; book.style.left = (SW - W) / 2 + 'px'; book.style.top = (SH - ph) / 2 + 'px'; applyZoom(); }
  function img(i, cls) { const im = h('img', { alt: 'Page ' + (i + 1), class: cls || '' }); if (valid(i)) urlOf(it.pages[i].b).then(u => { if (u) im.src = u; }); if (it.rtl) im.style.transform = 'scaleX(-1)'; return im; }
  function pageEl(i, side) {
    const e = h('div', { class: 'pg ' + side, 'data-i': i, style: { width: pw + 'px', height: ph + 'px', left: (side === 'r' && spread ? pw : 0) + 'px', background: PAPER[it.kind] } }, img(i));
    // the curve of the paper into the spine, and a soft light across the page
    if (spread) e.append(h('div', { class: 'gut', style: { background: side === 'l' ? 'linear-gradient(to left, rgba(0,0,0,.28), rgba(0,0,0,.08) 5%, rgba(0,0,0,0) 12%, rgba(0,0,0,0) 92%, rgba(0,0,0,.05))' : 'linear-gradient(to right, rgba(0,0,0,.30), rgba(0,0,0,.09) 5%, rgba(0,0,0,0) 12%, rgba(0,0,0,0) 92%, rgba(0,0,0,.05))' } }));
    if (it.kind === 'magazine' || it.kind === 'comic') e.append(h('div', { class: 'gloss' }));
    return e;
  }
  function edges() {
    const before = spread ? Math.max(0, L(k)) : curPage(), after = N - 1 - curPage(), wd = n => clamp(n * 0.06, n ? 1.5 : 0, 9);
    const out = [];
    if (spread ? valid(L(k)) : before) out.push(h('div', { class: 'edge', style: { left: -wd(before) + 'px', width: wd(before) + 'px' } }));
    if (after) out.push(h('div', { class: 'edge', style: { left: (spread ? pw * 2 : pw) + 'px', width: wd(after) + 'px' } }));
    return out;
  }
  function draw() {
    if (isStack()) return drawStack();
    book.textContent = '';
    // hardbacks and binders sit on their cover boards
    if (it.kind === 'book' || it.kind === 'binder' || it.kind === 'notebook') { const pad = it.kind === 'notebook' ? 6 : 9, open = spread && valid(L(k)); book.append(h('div', { class: 'board', style: { left: (open || !spread ? -pad : pw - pad * 0.3) + 'px', width: (open ? pw * 2 + pad * 2 : pw + pad * 1.3) + 'px', top: -pad + 'px', height: ph + pad * 2 + 'px', background: it.colour || '#6b4b2a' } })); if (spread && valid(L(k)) && !valid(Rp(k))) { } }
    book.append(...edges());
    if (spread && valid(L(k))) book.append(pageEl(L(k), 'l'));
    if (valid(Rp(k))) book.append(pageEl(Rp(k), 'r'));
    for (let d = -2; d <= 3; d++) { const i = curPage() + d; if (valid(i)) urlOf(it.pages[i].b); }
    status(); if (window.ShelfSpeech) ShelfSpeech.paint();
  }
  function status() {
    const p = curPage(), l = spread && valid(L(k)) && valid(Rp(k)) ? (L(k) + 1) + '–' + (Rp(k) + 1) : String(p + 1);
    $('#rPage').textContent = l + ' / ' + N; $('#rSlider').value = p;
    $('#rBm').style.opacity = (it.bookmarks || []).includes(p) ? '1' : '.4';
    clearTimeout(saveT); saveT = setTimeout(() => { if (it) { it.pos = p; saveItem(it); } }, 800);
  }
  function go(p) { k = clamp(toK(p), 0, maxK()); if (isStack()) stackI = curPage(); draw(); }

  // ----- the turning leaf -----
  function makeFlip(dir) {
    const nk = k + dir; if (nk < 0 || nk > maxK()) return null;
    const leaf = h('div', { class: 'leaf', style: { width: pw + 'px', height: ph + 'px', left: (spread ? pw : 0) + 'px' } });
    const face = (i, back) => { const f = h('div', { class: 'face' + (back ? ' back' : ''), style: { background: PAPER[it.kind] } }); if (i === 'paper') { f.classList.add('paperback'); f.append(img(dir > 0 ? Rp(k) : Rp(nk))); } else f.append(img(i)); f.append(h('div', { class: 'sh' })); return f; };
    let front, back;
    if (spread) {
      if (dir > 0) { front = Rp(k); back = L(nk); const r = book.querySelector('.pg.r'); if (valid(Rp(nk))) { const n = pageEl(Rp(nk), 'r'); r ? r.replaceWith(n) : book.append(n); } else if (r) r.remove(); }
      else { front = Rp(nk); back = L(k); const l = book.querySelector('.pg.l'); if (valid(L(nk))) { const n = pageEl(L(nk), 'l'); l ? l.replaceWith(n) : book.prepend(n); } else if (l) l.remove(); }
    } else {
      if (dir > 0) { front = k; back = 'paper'; const r = book.querySelector('.pg.r'); if (r) r.replaceWith(pageEl(nk, 'r')); }
      else { front = nk; back = 'paper'; }
    }
    leaf.append(valid(front) || front === 'paper' ? face(front) : h('div', { class: 'face', style: { background: 'transparent' } }), valid(back) || back === 'paper' ? face(back, true) : h('div', { class: 'face back', style: { background: 'transparent' } }));
    book.append(leaf);
    const shF = leaf.firstChild.querySelector('.sh'), shB = leaf.lastChild.querySelector('.sh');
    const set = p => {
      p = clamp(p, 0, 1); const a = dir > 0 ? -180 * p : -180 * (1 - p), s = Math.sin(-a * Math.PI / 180);
      leaf.style.transform = `rotateY(${a}deg)`;
      if (shF) shF.style.background = `linear-gradient(to left, rgba(0,0,0,${0.35 * s}), rgba(0,0,0,${0.08 * s}) 40%, rgba(255,255,255,${0.12 * s}) 85%)`;
      if (shB) shB.style.background = `linear-gradient(to right, rgba(0,0,0,${0.3 * s}), rgba(0,0,0,0) 50%)`;
      if (!spread) leaf.style.opacity = dir > 0 ? (p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45) : (p > 0.45 ? 1 : p / 0.45);
      cur.p = p;
    };
    const cur = { p: 0, dir, set, done: () => { k = nk; draw(); }, cancel: () => draw() };
    set(0); return cur;
  }
  function animate(f, to, then) {
    const from = f.p, dur = 120 + 380 * Math.abs(to - from), t0 = performance.now();
    const step = t => { const u = clamp((t - t0) / dur, 0, 1), e = 1 - Math.pow(1 - u, 3); f.set(from + (to - from) * e); if (u < 1) requestAnimationFrame(step); else then(); };
    requestAnimationFrame(step);
  }
  let busy = false;
  function turn(dir) {
    if (busy || !it) return;
    if (isStack()) return stackTurn(dir);
    const f = makeFlip(dir); if (!f) return;
    busy = true; animate(f, 1, () => { f.done(); busy = false; });
  }
  $('#rPrev').addEventListener('click', () => turn(it && it.rtl ? 1 : -1));
  $('#rNext').addEventListener('click', () => turn(it && it.rtl ? -1 : 1));
  $('#rSlider').addEventListener('input', e => { $('#rPage').textContent = (+e.target.value + 1) + ' / ' + N; });
  $('#rSlider').addEventListener('change', e => go(+e.target.value));
  addEventListener('keydown', e => {
    if (R.hidden || document.querySelector('dialog[open]')) return;
    if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') { e.preventDefault(); turn(it.rtl ? -1 : 1); }
    else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); turn(it.rtl ? 1 : -1); }
    else if (e.key === 'Escape') { if ($('#thumbs')) closeThumbs(); else $('#rBack').click(); }
  });
  addEventListener('resize', () => { if (it) { layout(); draw(); } });
  // the player opening or closing changes the room for the book: fit it again
  let lastH = 0; new ResizeObserver(() => { const H = stage.clientHeight; if (!it || Math.abs(H - lastH) < 2) { lastH = H; return; } lastH = H; if (busy) return; const p = curPage(); layout(); go(p); }).observe(stage);

  // ----- the paper stack: the top sheet slides away to show the next -----
  let stackI = 0;
  const rnd = i => { const x = Math.sin(i * 12.9898) * 43758.5453; return x - Math.floor(x); };
  function sheetEl(i, depth) {
    const W = stage.clientWidth, H = stage.clientHeight, p = it.pages[i], ar = p.h / p.w, sh = Math.min(H * 0.86, W * 0.82 * ar), sw = sh / ar;
    const e = h('div', { class: 'sheet', style: { width: sw + 'px', height: sh + 'px', left: (W - sw) / 2 + 'px', top: (H - sh) / 2 + 'px', zIndex: 10 - depth } }, img(i));
    const r = depth ? (rnd(i) - 0.5) * 5 : 0, ox = depth ? (rnd(i + 7) - 0.5) * 16 : 0, oy = depth ? (rnd(i + 3) - 0.5) * 12 + depth * 3 : 0;
    e.style.transform = `translate(${ox}px,${oy}px) rotate(${r}deg)`; e._base = { ox, oy, r };
    return e;
  }
  function drawStack() {
    book.textContent = ''; book.style.left = '0px'; book.style.top = '0px'; book.style.width = '100%'; book.style.height = '100%';
    for (let d = 3; d >= 0; d--) { const i = stackI + d; if (valid(i)) { const e = sheetEl(i, d); if (!d) { e.classList.add('pg'); e.dataset.i = i; e.style.position = 'absolute'; } book.append(e); } }
    k = stackI; status(); if (window.ShelfSpeech) ShelfSpeech.paint();
  }
  function stackTurn(dir, fromDx) {
    const W = stage.clientWidth;
    if (dir > 0) {
      if (stackI >= N - 1) return;
      const top = book.querySelector('.sheet:last-child'); busy = true;
      top.style.transition = 'transform .35s cubic-bezier(.2,.7,.3,1), opacity .35s'; top.style.transform = `translate(${-W}px,40px) rotate(-18deg)`; top.style.opacity = '0';
      setTimeout(() => { stackI++; drawStack(); busy = false; }, 340);
    } else {
      if (stackI <= 0) return;
      busy = true; stackI--; const e = sheetEl(stackI, 0); e.style.transform = `translate(${-W}px,40px) rotate(-18deg)`; e.style.opacity = '0'; book.append(e);
      requestAnimationFrame(() => { e.style.transition = 'transform .35s cubic-bezier(.2,.7,.3,1), opacity .3s'; e.style.transform = 'none'; e.style.opacity = '1'; });
      setTimeout(() => { drawStack(); busy = false; }, 360);
    }
  }

  // ----- touch and mouse on the page: drag to turn, tap the edges, double-tap or pinch to zoom -----
  const ptrs = new Map(); let g = null, lastTap = 0, tapT = null;
  function applyZoom() { zoomer.style.transform = `translate(${Z.x}px,${Z.y}px) scale(${Z.k})`; }
  function zoomAt(k2, cx, cy) { k2 = clamp(k2, 1, 5); Z.x = cx - (cx - Z.x) * k2 / Z.k; Z.y = cy - (cy - Z.y) * k2 / Z.k; Z.k = k2; if (Z.k <= 1.01) Z = { k: 1, x: 0, y: 0 }; applyZoom(); }
  stage.addEventListener('pointerdown', e => {
    if (!it) return; const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top;
    ptrs.set(e.pointerId, { x, y }); try { stage.setPointerCapture(e.pointerId); } catch (er) { }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; if (g && g.flip) { g.flip.cancel(); } g = { pinch: true, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: Z.k, m: [(a.x + b.x) / 2, (a.y + b.y) / 2], z0: Object.assign({}, Z) }; return; }
    if (busy) return;
    g = { x0: x, y0: y, t0: performance.now(), moved: false, flip: null, last: x, lt: performance.now(), v: 0 };
  });
  stage.addEventListener('pointermove', e => {
    if (!g || !ptrs.has(e.pointerId)) return; const r = stage.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top; ptrs.set(e.pointerId, { x, y });
    if (g.pinch) { const [a, b] = [...ptrs.values()]; if (!b) return; const d = Math.hypot(a.x - b.x, a.y - b.y), k2 = clamp(g.k0 * d / g.d0, 1, 5); Z = Object.assign({}, g.z0); zoomAt(k2, g.m[0], g.m[1]); return; }
    const dx = x - g.x0, dy = y - g.y0;
    if (!g.moved && Math.hypot(dx, dy) > 8) g.moved = true;
    if (!g.moved) return;
    const t = performance.now(); g.v = (x - g.last) / Math.max(1, t - g.lt); g.last = x; g.lt = t;
    if (Z.k > 1) { Z.x += e.movementX || 0; Z.y += e.movementY || 0; if (!e.movementX && !e.movementY) { Z.x += x - (g.px || x); Z.y += y - (g.py || y); } g.px = x; g.py = y; applyZoom(); return; }
    const sdx = it.rtl && !isStack() ? -dx : dx;
    if (isStack()) { const top = book.querySelector('.sheet:last-child'); if (top) top.style.transform = `translate(${dx}px,${dy * 0.3}px) rotate(${dx * 0.03}deg)`; g.stackDx = dx; return; }
    if (!g.flip && !g.noflip) { g.flip = makeFlip(sdx < 0 ? 1 : -1); if (!g.flip) g.noflip = true; }
    if (g.flip) g.flip.set(Math.abs(sdx) / (pw * (spread ? 1.3 : 1.1)));
  });
  const end = e => {
    if (!ptrs.has(e.pointerId)) return; ptrs.delete(e.pointerId);
    if (!g) return;
    if (g.pinch) { if (!ptrs.size) g = null; return; }
    const G = g; g = null;
    if (isStack() && G.moved && Z.k === 1) {
      const top = book.querySelector('.sheet:last-child'), W = stage.clientWidth;
      if (G.stackDx < -W * 0.18 || G.v < -0.6) { if (stackI < N - 1) { stackTurn(1); return; } }
      else if (G.stackDx > W * 0.18 || G.v > 0.6) { if (top) { top.style.transition = 'transform .25s'; top.style.transform = 'none'; } stackTurn(-1); return; }
      if (top) { top.style.transition = 'transform .25s'; top.style.transform = 'none'; } return;
    }
    if (G.flip) { const fast = Math.abs(G.v) > 0.5 && Math.sign(G.v) === (it.rtl ? G.flip.dir : -G.flip.dir); const f = G.flip; busy = true; if (f.p > 0.33 || fast) animate(f, 1, () => { f.done(); busy = false; }); else animate(f, 0, () => { f.cancel(); busy = false; }); return; }
    if (G.moved) return;
    // a tap
    const W = stage.clientWidth, now = performance.now();
    if (now - lastTap < 300) { clearTimeout(tapT); lastTap = 0; if (Z.k > 1) { Z = { k: 1, x: 0, y: 0 }; applyZoom(); } else zoomAt(2.4, G.x0, G.y0); return; }
    lastTap = now;
    if (window.ShelfSpeech && ShelfSpeech.tapAt(e.clientX, e.clientY)) return;
    if (Z.k > 1) return;
    const side = G.x0 < W * 0.28 ? -1 : G.x0 > W * 0.72 ? 1 : 0;
    if (side) turn(it.rtl && !isStack() ? -side : side);
    else tapT = setTimeout(() => R.classList.toggle('calm'), 280);
  };
  stage.addEventListener('pointerup', end); stage.addEventListener('pointercancel', end);
  stage.addEventListener('wheel', e => { if (!it) return; e.preventDefault(); const r = stage.getBoundingClientRect(); if (e.ctrlKey || e.metaKey) zoomAt(Z.k * Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top); else if (Z.k > 1) { Z.x -= e.deltaX; Z.y -= e.deltaY; applyZoom(); } else if (Math.abs(e.deltaY) + Math.abs(e.deltaX) > 30 && !busy) turn((e.deltaY || e.deltaX) > 0 ? 1 : -1); }, { passive: false });
  stage.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  // ----- all pages, bookmarks, options -----
  function closeThumbs() { const t = $('#thumbs'); if (t) t.remove(); }
  $('#rThumbs').addEventListener('click', () => {
    if ($('#thumbs')) return closeThumbs();
    const box = h('div', { id: 'thumbs', style: { '--ar': (it.pages[0].w / it.pages[0].h).toFixed(3) } }), cp = curPage();
    const io = new IntersectionObserver(es => { for (const en of es) if (en.isIntersecting) { const im = en.target; urlOf(it.pages[+im.dataset.i].b).then(u => { im.src = u; }); io.unobserve(im); } }, { root: box, rootMargin: '300px' });
    it.pages.forEach((p, i) => { const im = h('img', { alt: 'Page ' + (i + 1), 'data-i': i }); io.observe(im); box.append(h('div', { class: 'tb' + (i === cp ? ' cur' : '') + ((it.bookmarks || []).includes(i) ? ' bm' : ''), onclick: () => { closeThumbs(); go(i); } }, im, 'Page ' + (i + 1))); });
    stage.append(box); const c = box.querySelector('.cur'); if (c) c.scrollIntoView({ block: 'center' });
  });
  $('#rBm').addEventListener('click', () => { const p = curPage(); it.bookmarks = it.bookmarks || []; const i = it.bookmarks.indexOf(p); if (i >= 0) it.bookmarks.splice(i, 1); else it.bookmarks.push(p); it.bookmarks.sort((a, b) => a - b); saveItem(it); status(); toast(i >= 0 ? 'Bookmark removed' : 'Bookmarked page ' + (p + 1)); });
  $('#rMore').addEventListener('click', e => C.menu(e.currentTarget, m => {
    if ((it.bookmarks || []).length) { m.append(h('h5', {}, 'Bookmarks')); for (const b of it.bookmarks) m.append(C.mi('🔖', 'Page ' + (b + 1), () => go(b))); m.append(h('hr')); }
    m.append(C.mi(it.rtl ? '●' : '○', 'Read right to left', () => { it.rtl = !it.rtl; saveItem(it); const p = curPage(); layout(); go(p); }));
    m.append(C.mi('⤢', 'Reset zoom', () => { Z = { k: 1, x: 0, y: 0 }; applyZoom(); }));
    if (window.PsiHub) m.append(h('hr'), C.mi('✎', 'Write on it in Notes (all pages)', () => C.sendTo('notes', it)), C.mi('✎', 'Just this page to Notes', () => C.sendTo('notes', it, curPage())));
  }));
  function shown() { if (!it) return []; if (isStack()) return [stackI]; return spread ? [L(k), Rp(k)].filter(valid) : [k]; }
  function follow(p) { if (!it || busy || shown().includes(p)) return; const nk = toK(p); if (isStack()) { if (p === stackI + 1) stackTurn(1); else { stackI = p; drawStack(); } return; } if (nk === k + 1) turn(1); else go(p); }
  window.ShelfReader = { open, close, turn, go, shown, follow, get item() { return it; }, get rtl() { return !!(it && it.rtl && !isStack()); }, get state() { return it && { k, spread, page: curPage(), N, zoom: Z.k }; } };
})();

// ---------- read aloud ----------
// Speech is spoken in short chunks (a sentence or two), each word mapped to where it is on its page.
// So every scrub, skip and speed change restarts instantly at an exact word, and the page follows along.
(() => {
  'use strict';
  const C = window.ShelfCore, { $, h, clamp, toast } = C, SS = window.speechSynthesis;
  const panel = $('#speak'), cap = $('#spCap'), pos = $('#spPos'), tip = $('#spTip');
  const LSg = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const LSs = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { } };
  const BASE_WPM = 165;
  const ABBR = /^(e\.g|i\.e|etc|vs|cf|al|fig|figs|eq|eqs|dr|mr|mrs|ms|prof|st|no|vol|pp|ch|sec|approx|ca|resp|incl|dept|univ|jr|sr|inc|ltd|co)\.$/i;
  let W = [], SENT = [], item = null, cur = 0, playing = false, gen = 0, rate = LSg('shelf.rate', 1), voiceURI = LSg('shelf.voice', ''), chunk = null, est = null, scrubbing = false, hold = null, resumeAfter = false;

  // ----- the words of a whole item -----
  async function load(it) {
    if (item === it && W.length) return true;
    item = it; W = []; SENT = [];
    if (!it.words) return false;
    for (let n = 0; n < it.pages.length; n++) for (const [t, x, y, w, hh] of await C.getText(it.id, n)) W.push({ t, say: t, p: n, x, y, w, h: hh });
    // words split across lines with a hyphen are spoken whole
    for (let i = 0; i < W.length - 1; i++) { const a = W[i], b = W[i + 1]; if (/[a-z]-$/.test(a.t) && /^[a-z]/.test(b.t) && b.y > a.y + a.h * 0.5) { a.say = a.t.slice(0, -1) + b.t; b.say = ''; } }
    SENT.push(0);
    for (let i = 0; i < W.length - 1; i++) { const t = W[i].t; if (/[.!?]["'”’)\]]*$/.test(t) && !ABBR.test(t) && !/^[A-Z]\.$/.test(t)) SENT.push(i + 1); else if (W[i + 1].p !== W[i].p && /[:;]$/.test(t)) SENT.push(i + 1); }
    cur = clamp(it.readPos || 0, 0, Math.max(0, W.length - 1));
    return W.length > 0;
  }
  const sentOf = i => { let lo = 0, hi = SENT.length - 1; while (lo < hi) { const m = (lo + hi + 1) >> 1; if (SENT[m] <= i) lo = m; else hi = m - 1; } return lo; };
  const wps = () => BASE_WPM * rate / 60;
  const fmt = s => { s = Math.max(0, Math.round(s)); const h2 = Math.floor(s / 3600), m = Math.floor(s / 60) % 60, x = s % 60; return (h2 ? h2 + ':' + String(m).padStart(2, '0') : m) + ':' + String(x).padStart(2, '0'); };

  // ----- voices -----
  function voices() {
    const all = SS ? SS.getVoices() : [], lang = (navigator.language || 'en-GB').toLowerCase();
    const score = v => (v.lang.toLowerCase() === lang ? 4 : v.lang.toLowerCase().startsWith(lang.slice(0, 2)) ? 2 : 0) + (/enhanced|premium|natural|neural/i.test(v.name) ? 1.5 : 0) + (v.localService ? 0.5 : 0);
    return all.slice().sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));
  }
  function fillVoices() {
    const sel = $('#spVoice'), list = voices(); sel.textContent = '';
    if (!list.length) { sel.append(h('option', { value: '' }, 'Default voice')); return; }
    if (!voiceURI || !list.some(v => v.voiceURI === voiceURI)) voiceURI = list[0].voiceURI;
    for (const v of list) sel.append(h('option', { value: v.voiceURI, selected: v.voiceURI === voiceURI ? true : null }, v.name.replace(/\s*\(.*\)$/, '') + ' · ' + v.lang));
  }
  if (SS) { SS.addEventListener ? SS.addEventListener('voiceschanged', fillVoices) : (SS.onvoiceschanged = fillVoices); }
  $('#spVoice').addEventListener('change', e => { voiceURI = e.target.value; LSs('shelf.voice', voiceURI); if (playing) speakFrom(cur); });

  // ----- speaking -----
  function makeChunk(from) {
    const s = sentOf(from); let end = SENT[s + 1] != null ? SENT[s + 1] : W.length;
    // short sentences travel together, so the voice keeps its rhythm
    let len = 0; for (let i = from; i < end; i++) len += W[i].say.length + 1;
    while (len < 160 && end < W.length) { const nx = SENT[sentOf(end) + 1] != null ? SENT[sentOf(end) + 1] : W.length; for (let i = end; i < nx; i++) len += W[i].say.length + 1; if (len > 320) break; end = nx; }
    let text = ''; const starts = [];
    for (let i = from; i < end; i++) { starts.push(text.length); if (W[i].say) text += W[i].say + ' '; }
    return { from, end, text: text.trim(), starts };
  }
  function stopSpeech() { gen++; clearInterval(est && est.timer); est = null; chunk = null; try { SS && SS.cancel(); } catch (e) { } }
  function speakFrom(i) {
    if (!SS) { toast('This browser can’t speak text.'); return; }
    stopSpeech(); playing = true; cur = clamp(i, 0, W.length); setBtn();
    next(cur);
  }
  function next(from) {
    if (from >= W.length) { playing = false; setBtn(); toast('The end.'); setPos(W.length - 1); return; }
    const my = ++gen, ch = makeChunk(from);
    if (!ch.text) { next(ch.end); return; }
    const u = new SpeechSynthesisUtterance(ch.text);
    const v = SS.getVoices().find(x => x.voiceURI === voiceURI); if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = rate; u.pitch = 1;
    let gotBoundary = false;
    u.onstart = () => {
      if (my !== gen) return;
      chunk = ch;
      // a timing estimate keeps the highlight moving when a voice gives no word events
      const weights = ch.starts.map((_, k) => (W[ch.from + k].say.length || 0) + 2.2), total = weights.reduce((a, b) => a + b, 0), dur = (ch.end - ch.from) / wps() * 1000, t0 = performance.now();
      est = { timer: setInterval(() => { if (my !== gen || gotBoundary) return; const f = (performance.now() - t0) / dur * total; let acc = 0, k = 0; while (k < weights.length - 1 && acc + weights[k] < f) { acc += weights[k]; k++; } setPos(ch.from + k); }, 60) };
    };
    u.onboundary = e => {
      if (my !== gen || (e.name && e.name !== 'word')) return;
      gotBoundary = true;
      let k = 0; while (k < ch.starts.length - 1 && ch.starts[k + 1] <= e.charIndex) k++;
      setPos(ch.from + k);
    };
    u.onend = () => { if (my !== gen) return; clearInterval(est && est.timer); next(ch.end); };
    u.onerror = e => { if (my !== gen || e.error === 'interrupted' || e.error === 'canceled') return; playing = false; setBtn(); toast('Speech stopped: ' + (e.error || 'error')); };
    SS.speak(u);
  }
  function pause() { if (!playing) return; stopSpeech(); playing = false; setBtn(); savePos(); }
  function toggle() { if (playing) pause(); else speakFrom(cur >= W.length - 1 ? 0 : cur); }
  function setBtn() { const b = $('#spPlay'); b.textContent = playing ? '❚❚' : '▶'; b.setAttribute('aria-label', playing ? 'Pause' : 'Play'); if (navigator.mediaSession) navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'; }
  let saveT = null; function savePos() { clearTimeout(saveT); saveT = setTimeout(() => { if (item) { item.readPos = cur; C.saveItem(item); } }, 600); }

  // ----- where we are: caption, scrubber, page, highlight -----
  function setPos(i, quiet) {
    i = clamp(i, 0, Math.max(0, W.length - 1)); const moved = i !== cur; cur = i;
    if (!W.length) return;
    const s = sentOf(i), a = SENT[s], b = SENT[s + 1] != null ? SENT[s + 1] : W.length;
    cap.textContent = '';
    for (let k = a; k < b; k++) { const sp = h('span', { 'data-w': k }, W[k].t); cap.append(k === i ? h('mark', {}, sp) : sp, ' '); }
    if (!scrubbing) pos.value = i;
    $('#spT0').textContent = fmt(i / wps()); $('#spT1').textContent = '−' + fmt((W.length - i) / wps());
    if (!quiet) window.ShelfReader.follow(W[i].p);
    paint();
    if (moved) savePos();
  }
  function paint() {
    document.querySelectorAll('.hlw,.hls').forEach(e => e.remove());
    if (panel.hidden || !W.length || !item || window.ShelfReader.item !== item) return;
    const w = W[cur], s = sentOf(cur), a = SENT[s], b = SENT[s + 1] != null ? SENT[s + 1] : W.length, rtl = window.ShelfReader.rtl;
    const box = (pgEl, o, cls) => { const e = h('div', { class: cls, style: { left: ((rtl ? 1 - o.x - o.w : o.x) * 100) + '%', top: (o.y * 100) + '%', width: (o.w * 100) + '%', height: (o.h * 100) + '%' } }); pgEl.append(e); };
    for (const pgEl of document.querySelectorAll('#book .pg[data-i]')) {
      const n = +pgEl.dataset.i;
      for (let k = a; k < b; k++) if (W[k].p === n && k !== cur) box(pgEl, W[k], 'hls');
      if (w.p === n) box(pgEl, w, 'hlw');
    }
  }
  // tapping a word on the page (or in the caption) reads from there
  function tapAt(cx, cy) {
    if (panel.hidden || !W.length) return false;
    const el = document.elementsFromPoint(cx, cy).find(e => e.matches && e.matches('#book .pg[data-i]')); if (!el) return false;
    const r = el.getBoundingClientRect(), n = +el.dataset.i; let fx = (cx - r.left) / r.width; const fy = (cy - r.top) / r.height;
    let best = -1, bd = Infinity;
    for (let k = 0; k < W.length; k++) { const o = W[k]; if (o.p !== n) continue; const dx = Math.max(o.x - fx, 0, fx - o.x - o.w), dy = Math.max(o.y - fy, 0, fy - o.y - o.h), d = dx * dx + dy * dy * 4; if (d < bd) { bd = d; best = k; } }
    if (best < 0 || bd > 0.0012) return false;
    speakFrom(best); return true;
  }
  cap.addEventListener('click', e => { const sp = e.target.closest('[data-w]'); if (sp) speakFrom(+sp.dataset.w); });

  // ----- scrubbing: the slider moves word by word; the page and caption follow while you drag -----
  pos.addEventListener('pointerdown', () => { if (!scrubbing) { scrubbing = true; resumeAfter = playing; if (playing) { stopSpeech(); playing = false; setBtn(); } } });
  pos.addEventListener('input', () => {
    if (!scrubbing) { scrubbing = true; resumeAfter = playing; if (playing) { stopSpeech(); playing = false; setBtn(); } }
    const i = +pos.value; setPos(i);
    const f = i / Math.max(1, W.length - 1); tip.style.display = 'block'; tip.style.left = (f * 100) + '%';
    tip.textContent = 'p ' + (W[i].p + 1) + ' · ' + fmt(i / wps()) + ' · “' + W.slice(SENT[sentOf(i)], SENT[sentOf(i)] + 7).map(w => w.t).join(' ') + '…”';
  });
  const endScrub = () => { if (!scrubbing) return; scrubbing = false; tip.style.display = 'none'; if (resumeAfter) speakFrom(+pos.value); };
  pos.addEventListener('change', endScrub); pos.addEventListener('pointerup', () => setTimeout(endScrub, 0)); pos.addEventListener('pointercancel', endScrub);

  // ----- ⏪ ⏩: a tap jumps 10 seconds; holding scrubs, getting faster the longer you hold -----
  function holdBtn(btn, dir) {
    btn.addEventListener('pointerdown', e => {
      e.preventDefault(); try { btn.setPointerCapture(e.pointerId); } catch (er) { }
      hold = { dir, t0: performance.now(), was: playing, moved: false, last: performance.now() };
      btn.classList.add('held');
      hold.timer = setInterval(() => {
        const held = performance.now() - hold.t0; if (held < 260) return;
        if (!hold.moved) { hold.moved = true; if (playing) { stopSpeech(); playing = false; setBtn(); } }
        // 4 words a tick at first, up to about a page a second after two seconds
        const speed = 4 + Math.min(1, (held - 260) / 2000) ** 2 * 40;
        setPos(cur + dir * Math.round(speed));
      }, 70);
    });
    const up = () => {
      if (!hold) return; clearInterval(hold.timer); btn.classList.remove('held');
      const H = hold; hold = null;
      if (!H.moved) { const jump = Math.round(wps() * 10); setPos(cur + dir * jump); if (H.was) speakFrom(cur); return; }
      // land on the start of the sentence, which sounds natural
      setPos(SENT[sentOf(cur)]); if (H.was) speakFrom(cur);
    };
    btn.addEventListener('pointerup', up); btn.addEventListener('pointercancel', up); btn.addEventListener('lostpointercapture', up);
  }
  holdBtn($('#spRw'), -1); holdBtn($('#spFf'), 1);
  function sentenceStep(dir) {
    const s = sentOf(cur);
    let t = dir > 0 ? (SENT[s + 1] != null ? SENT[s + 1] : W.length - 1) : (cur - SENT[s] > 2 ? SENT[s] : SENT[Math.max(0, s - 1)]);
    if (playing) speakFrom(t); else setPos(t);
  }
  $('#spPrevS').addEventListener('click', () => sentenceStep(-1));
  $('#spNextS').addEventListener('click', () => sentenceStep(1));
  $('#spPlay').addEventListener('click', toggle);

  // ----- speed: fine slider (0.05 steps), − and ＋, and presets; changes take effect at the current word -----
  let rateT = null;
  function setRate(r, now) {
    rate = Math.round(clamp(r, 0.5, 3) * 100) / 100; LSs('shelf.rate', rate);
    $('#spRate').value = rate; $('#spRateL').textContent = rate.toFixed(2) + '×';
    setPos(cur, true);
    clearTimeout(rateT); if (playing) rateT = setTimeout(() => speakFrom(cur), now ? 0 : 280);
  }
  $('#spRate').addEventListener('input', e => setRate(+e.target.value));
  $('#spSlow').addEventListener('click', () => setRate(rate - 0.05, true));
  $('#spFast').addEventListener('click', () => setRate(rate + 0.05, true));
  $('#spRateL').addEventListener('click', e => C.menu(e.currentTarget, m => { m.append(h('h5', {}, 'Reading speed')); for (const r of [0.6, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3]) m.append(C.mi(Math.abs(r - rate) < 0.001 ? '●' : '○', r.toFixed(2) + '×' + (r === 1 ? ' (normal)' : '') + ' · about ' + Math.round(BASE_WPM * r) + ' words a minute', () => setRate(r, true))); }));

  // ----- opening and closing the player -----
  async function show(start) {
    const it = window.ShelfReader.item; if (!it) return;
    if (!it.words) { C.textMenu(it, $('#rSpeak')); toast('This one has no text yet: choose how to find its words.', 4000); return; }
    if (!(await load(it))) { toast('No words found on these pages.'); return; }
    panel.hidden = false; $('#rSpeak').classList.add('on');
    pos.max = Math.max(0, W.length - 1); setRate(rate); fillVoices();
    // start from the page you're looking at, unless you were already reading on it
    const shownP = window.ShelfReader.shown();
    if (!shownP.includes(W[cur].p)) { const k = W.findIndex(w => shownP.includes(w.p)); if (k >= 0) cur = k; }
    setPos(cur, true);
    if (navigator.mediaSession) {
      try {
        navigator.mediaSession.metadata = new MediaMetadata({ title: it.title, artist: it.author || 'Shelf', artwork: it.cover ? [{ src: it.cover, sizes: '260x260', type: 'image/jpeg' }] : [] });
        const ms = navigator.mediaSession;
        ms.setActionHandler('play', () => { if (!playing) toggle(); }); ms.setActionHandler('pause', () => pause());
        ms.setActionHandler('seekbackward', () => { setPos(cur - Math.round(wps() * 10)); if (playing) speakFrom(cur); });
        ms.setActionHandler('seekforward', () => { setPos(cur + Math.round(wps() * 10)); if (playing) speakFrom(cur); });
        ms.setActionHandler('previoustrack', () => sentenceStep(-1)); ms.setActionHandler('nexttrack', () => sentenceStep(1));
      } catch (e) { }
    }
    if (start) speakFrom(cur);
  }
  function stop(hide) { pause(); if (hide) { panel.hidden = true; $('#rSpeak').classList.remove('on'); paint(); } }
  $('#rSpeak').addEventListener('click', () => { if (panel.hidden) show(false); else stop(true); });
  $('#spClose').addEventListener('click', () => stop(true));
  addEventListener('keydown', e => {
    if (panel.hidden || $('#reader').hidden || e.target.closest('input[type=text],select,textarea')) return;
    if (e.key === ' ') { e.preventDefault(); e.stopImmediatePropagation(); toggle(); }
    else if (e.key === ',') sentenceStep(-1); else if (e.key === '.') sentenceStep(1);
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && e.shiftKey) { e.preventDefault(); e.stopImmediatePropagation(); setPos(cur + (e.key === 'ArrowRight' ? 1 : -1) * Math.round(wps() * 10)); if (playing) speakFrom(cur); }
  }, true);
  window.ShelfSpeech = { show, stop, paint, tapAt, setRate, get state() { return { cur, words: W.length, playing, rate, sentence: sentOf(cur), sentences: SENT.length, word: W[cur] && W[cur].t, page: W[cur] && W[cur].p }; }, get words() { return W; } };
})();
