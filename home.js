// Psi Phi Home: every app, and every file from every app, in folders you make.
(() => {
  'use strict';
  const APPS = PsiHub.APPS, $ = s => document.querySelector(s), ST = PsiHub.store;
  function h(tag, a, ...kids) {
    const el = document.createElement(tag);
    if (a) for (const k in a) { const v = a[k]; if (v == null || v === false) continue; if (k.startsWith('on')) el.addEventListener(k.slice(2), v); else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v); else if (k === 'html') el.innerHTML = v; else el.setAttribute(k, v === true ? '' : v); }
    for (const c of kids.flat(5)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
  let tt = 0; const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); };
  const LS = (k, d) => { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } };
  const NEW = { studio: null, notes: 'notes.html?new=notebook', clayform: 'clayform.html?new=head', tabula: 'tabula.html?new=new', '8bit': '8bit.html?new=32', logos: 'logos.html?new=doc', calsheet: 'calsheet.html?new=sheet', final: null, shelf: 'shelf.html' };
  const FCOLS = ['#5b8def', '#e0a458', '#83c167', '#fc6255', '#c08bf0', '#5cd0b3', '#9b9bab'];

  // ---------- apps ----------
  $('#apps').append(...APPS.map(a => h('a', { class: 'app', href: a.file, title: a.desc }, h('span', { class: 'ic', style: { background: a.colour } }, a.icon), h('b', {}, a.short), NEW[a.id] ? h('button', { class: 'new', type: 'button', title: 'New in ' + a.short, 'aria-label': 'New in ' + a.short, onclick: e => { e.preventDefault(); newIn(a.id); } }, '＋') : null)));
  // installing to the iPad's Home Screen
  const standalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone;
  if (!standalone && !LS('home.tipHidden', false)) $('#tip').append(h('div', { class: 'tipbar' }, h('span', {}, '📲'), h('span', { class: 'grow' }, h('b', {}, 'Keep Psi Phi on your Home Screen: '), 'in Safari tap Share, then “Add to Home Screen”. It opens here, works offline and keeps your files on this device.'), h('button', { class: 'btn', type: 'button', onclick: e => { localStorage.setItem('home.tipHidden', 'true'); e.currentTarget.closest('.tipbar').remove(); } }, 'Got it')));

  // ---------- reading every app's files (never creating another app's database) ----------
  function readStore(name, store) {
    return new Promise(res => {
      let r; try { r = indexedDB.open(name); } catch (e) { return res([]); }
      r.onupgradeneeded = () => { try { r.transaction.abort(); } catch (e) { } };
      r.onerror = () => res([]);
      r.onsuccess = () => { const d = r.result; if (!d.objectStoreNames.contains(store)) { d.close(); return res([]); } const out = []; const q = d.transaction(store).objectStore(store).openCursor(); q.onsuccess = () => { const c = q.result; if (!c) { d.close(); return res(out); } out.push(c.value); c.continue(); }; q.onerror = () => { d.close(); res(out); }; };
    });
  }
  let FILES = [], FOLDERS = [], PLACES = new Map(), here = LS('home.folder', null), appFilter = 'all', selecting = false, picked = new Set();
  async function load() {
    const out = [], add = (app, id, name, at, extra) => out.push(Object.assign({ key: app + ':' + id, app, id, name: name || 'Untitled', at: at || 0 }, extra));
    for (const p of LS('bstudio.index', [])) add('studio', p.id, p.name, p.updated, { open: () => { localStorage.setItem('bstudio.current', JSON.stringify(p.id)); location.href = 'index.html'; } });
    for (const p of LS('clayframe.projects', [])) add('clayform', p.id, p.name, p.at, { href: 'clayform.html?proj=' + encodeURIComponent(p.id) });
    const [notes, logos, cal, art, px, fin, shelf] = await Promise.all([readStore('psiphi-notes', 'items'), readStore('psiphi-logos', 'docs'), readStore('psiphi-calsheet', 'books'), readStore('biostage-artwork', 'projects'), readStore('biostage-pixelart', 'projects'), readStore('psiphi-final', 'projects'), readStore('psiphi-shelf', 'items')]);
    for (const d of notes) if (d.kind !== 'folder' && !d.trashed) add('notes', d.id, d.name, d.updated, { thumb: d.thumb, sub: d.kind === 'board' ? 'Whiteboard' : d.pdf ? 'PDF' : 'Notebook', href: 'notes.html?open=' + encodeURIComponent(d.id), created: d.created });
    for (const d of logos) add('logos', d.id, d.name, d.updated, { text: d.text, href: 'logos.html?proj=' + encodeURIComponent(d.id) });
    for (const d of cal) add('calsheet', d.id, d.name, d.updated, { href: 'calsheet.html?proj=' + encodeURIComponent(d.id) });
    for (const d of art) add('tabula', d.id, d.name, d.updated, { thumb: d.thumb, href: 'tabula.html?proj=' + encodeURIComponent(d.id) });
    for (const d of px) add('8bit', d.id, d.name, d.updated, { thumb: d.thumb, pixel: true, href: '8bit.html?proj=' + encodeURIComponent(d.id) });
    for (const d of fin) add('final', d.id, d.name, d.updated, { href: 'finalstage.html' });
    for (const d of shelf) add('shelf', d.id, d.title, d.updated, { thumb: d.cover, sub: '📚 ' + (d.kind === 'stack' ? 'Paper stack' : d.kind[0].toUpperCase() + d.kind.slice(1)), href: 'shelf.html?open=' + encodeURIComponent(d.id) });
    FILES = out;
    FOLDERS = await ST.all('folders').catch(() => []);
    PLACES = new Map((await ST.all('places').catch(() => [])).map(p => [p.key, p]));
    if (here && !FOLDERS.some(f => f.id === here)) here = null;
    // something made with "＋ New here" goes into the folder it was made from
    const pend = LS('home.pending', null);
    if (pend && Date.now() - pend.t < 36e5) {
      const fresh = FILES.filter(f => f.app === pend.app && f.at >= pend.t - 2000 && !PLACES.get(f.key)).sort((a, b) => b.at - a.at)[0];
      if (fresh) { await place(fresh.key, pend.folder); localStorage.removeItem('home.pending'); toast('Filed “' + fresh.name + '” in ' + ((FOLDERS.find(f => f.id === pend.folder) || {}).name || 'the folder')); }
    } else if (pend) localStorage.removeItem('home.pending');
    render();
  }
  async function place(key, folder, extra) {
    const cur = PLACES.get(key) || { key }; const v = Object.assign({}, cur, { folder: folder || null }, extra || {});
    PLACES.set(key, v); await ST.put('places', v);
  }
  const folderOf = f => (PLACES.get(f.key) || {}).folder || null;
  const pinned = f => !!(PLACES.get(f.key) || {}).pinned;
  const children = id => FOLDERS.filter(f => (f.parent || null) === id).sort((a, b) => a.name.localeCompare(b.name));
  const pathTo = id => { const out = []; let f = FOLDERS.find(x => x.id === id), n = 0; while (f && n++ < 30) { out.unshift(f); f = FOLDERS.find(x => x.id === f.parent); } return out; };
  const inside = id => { const set = new Set([id]); let grew = true; while (grew) { grew = false; for (const f of FOLDERS) if (f.parent && set.has(f.parent) && !set.has(f.id)) { set.add(f.id); grew = true; } } return set; };
  function when(t) { if (!t) return ''; const d = new Date(t), n = new Date(); if (d.toDateString() === n.toDateString()) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }); }
  const openFile = f => { if (f.open) f.open(); else location.href = f.href; };

  // ---------- drawing ----------
  const FOLDER_SVG = c => `<svg viewBox="0 0 100 76" aria-hidden="true"><path d="M4 12a6 6 0 0 1 6-6h24l8 8h48a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="${c}" opacity=".75"/><path d="M4 24a6 6 0 0 1 6-6h80a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="${c}"/></svg>`;
  function fileCard(f) {
    const a = PsiHub.byId(f.app) || { colour: '#888', icon: '?', short: f.app };
    const card = h('div', { class: 'card' + (picked.has(f.key) ? ' sel' : ''), tabindex: 0, role: 'link', draggable: 'true', 'aria-label': f.name + ', ' + a.short },
      h('div', { class: 'th' }, f.thumb ? h('img', { src: f.thumb, alt: '', style: f.pixel ? { imageRendering: 'pixelated', objectFit: 'contain' } : null }) : h('span', { class: 'big' }, a.icon), h('span', { class: 'tag', style: { background: a.colour } }, f.sub || a.short), pinned(f) ? h('span', { class: 'pin' }, '📌') : null),
      h('div', { class: 'nm' }, f.name), h('div', { class: 'dt' }, when(f.at)),
      h('span', { class: 'tick' }), h('button', { class: 'more', type: 'button', 'aria-label': 'Options for ' + f.name, onclick: e => { e.stopPropagation(); fileMenu(f, e.currentTarget); } }, '⋯'));
    card.addEventListener('click', () => { if (selecting) { picked.has(f.key) ? picked.delete(f.key) : picked.add(f.key); card.classList.toggle('sel'); selBar(); } else openFile(f); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter') card.click(); });
    card.addEventListener('contextmenu', e => { e.preventDefault(); fileMenu(f, { x: e.clientX, y: e.clientY }); });
    card.addEventListener('dragstart', e => { e.dataTransfer.setData('text/psiphi-file', selecting && picked.size ? [...picked].join('\n') : f.key); e.dataTransfer.effectAllowed = 'move'; });
    return card;
  }
  function folderCard(fo) {
    const all = inside(fo.id), n = FILES.filter(f => all.has(folderOf(f))).length + children(fo.id).length;
    const card = h('div', { class: 'card folder', tabindex: 0, role: 'link', draggable: 'true', 'aria-label': 'Folder ' + fo.name }, h('div', { class: 'th', html: FOLDER_SVG(fo.colour || FCOLS[0]) }, h('span', { class: 'count' }, n + (n === 1 ? ' item' : ' items'))), h('div', { class: 'nm' }, fo.name), h('div', { class: 'dt' }, 'Folder'),
      h('button', { class: 'more', type: 'button', 'aria-label': 'Options for ' + fo.name, onclick: e => { e.stopPropagation(); folderMenu(fo, e.currentTarget); } }, '⋯'));
    card.querySelector('.nm').title = 'Tap to rename';
    card.querySelector('.nm').addEventListener('click', e => { e.stopPropagation(); renameFolder(fo); });
    card.addEventListener('click', () => { if (selecting) return; go(fo.id); });
    card.addEventListener('keydown', e => { if (e.key === 'Enter') go(fo.id); });
    card.addEventListener('dragstart', e => e.dataTransfer.setData('text/psiphi-folder', fo.id));
    dropTarget(card, fo.id);
    return card;
  }
  // desktop drag and drop onto folders and breadcrumbs
  function dropTarget(el, folderId) {
    el.addEventListener('dragover', e => { const t = e.dataTransfer.types; if (t.includes('text/psiphi-file') || t.includes('text/psiphi-folder')) { e.preventDefault(); el.classList.add('dropok'); } });
    el.addEventListener('dragleave', () => el.classList.remove('dropok'));
    el.addEventListener('drop', async e => {
      e.preventDefault(); el.classList.remove('dropok');
      const keys = e.dataTransfer.getData('text/psiphi-file'), fid = e.dataTransfer.getData('text/psiphi-folder');
      if (keys) { for (const k of keys.split('\n')) await place(k, folderId); picked.clear(); toast('Moved'); render(); }
      else if (fid && fid !== folderId && !inside(fid).has(folderId)) { const f = FOLDERS.find(x => x.id === fid); f.parent = folderId; await ST.put('folders', f); render(); }
    });
  }
  function go(id) { here = id; localStorage.setItem('home.folder', JSON.stringify(id)); $('#q').value = ''; render(); }
  function render() {
    const q = $('#q').value.trim().toLowerCase(), sort = $('#sort').value;
    const cmp = sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'app' ? (a, b) => a.app.localeCompare(b.app) || b.at - a.at : (a, b) => b.at - a.at;
    // recent strip (only at the top level, when not searching)
    const rec = $('#recent'); rec.textContent = '';
    const recent = [...FILES].sort((a, b) => b.at - a.at).slice(0, 10);
    $('#recentSec').hidden = !!q || !!here || !recent.length;
    for (const f of recent) rec.append(fileCard(f));
    // crumbs
    const cr = $('#crumbs'); cr.textContent = '';
    const top = h('span', { onclick: () => go(null) }, q ? 'Search' : 'All files'); dropTarget(top, null); cr.append(top);
    if (!q) for (const f of pathTo(here)) { cr.append('›'); const s = h('span', { onclick: () => f.id === here ? renameFolder(f) : go(f.id), title: f.id === here ? 'Tap to rename' : null }, f.name); dropTarget(s, f.id); cr.append(s); }
    // app chips
    const used = APPS.filter(a => FILES.some(f => f.app === a.id)), ch = $('#chips'); ch.textContent = '';
    if (used.length > 1) ch.append(...[{ id: 'all', icon: '', short: 'All' }].concat(used).map(a => h('button', { type: 'button', class: 'chip' + (appFilter === a.id ? ' on' : ''), onclick: () => { appFilter = a.id; render(); } }, (a.icon ? a.icon + ' ' : '') + a.short)));
    $('#newHere').hidden = !!q;
    const box = $('#files'); box.textContent = '';
    const okApp = f => appFilter === 'all' || f.app === appFilter;
    if (q) {
      const list = FILES.filter(f => okApp(f) && (f.name.toLowerCase().includes(q) || String(f.text || '').toLowerCase().includes(q))).sort(cmp);
      const folders = FOLDERS.filter(f => f.name.toLowerCase().includes(q));
      if (!list.length && !folders.length) { box.append(h('div', { class: 'empty' }, 'Nothing matches “' + q + '”.')); return; }
      box.append(h('div', { class: 'grid' }, folders.map(folderCard), list.map(fileCard))); return;
    }
    const subs = children(here), files = FILES.filter(f => okApp(f) && folderOf(f) === here).sort((a, b) => (pinned(b) - pinned(a)) || cmp(a, b));
    if (!subs.length && !files.length) { box.append(h('div', { class: 'empty' }, here ? 'This folder is empty. Use ⋯ › Move to folder on any file, drag files onto it, or ＋ New here.' : 'Nothing here yet. Open an app above to make something.')); return; }
    box.append(h('div', { class: 'grid' }, subs.map(folderCard), files.map(fileCard)));
    if (!here && FOLDERS.length && files.length) box.prepend(h('div', { class: 'empty', style: { padding: '0 0 10px', fontSize: '13px' } }, 'Files not in a folder:'));
  }

  // ---------- menus ----------
  function menu(anchor, build) {
    document.querySelectorAll('.menu').forEach(m => m.remove());
    const m = h('div', { class: 'menu', role: 'menu' }); build(m); document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y }, W = m.offsetWidth, H = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(innerWidth - W - 6, r.right - W)) + 'px'; m.style.top = (r.bottom + 6 + H < innerHeight ? r.bottom + 6 : Math.max(6, r.top - H - 6)) + 'px';
    setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }; addEventListener('pointerdown', off, true); }, 0);
  }
  const mi = (ic, label, fn) => h('button', { type: 'button', role: 'menuitem', onclick: () => { document.querySelectorAll('.menu').forEach(m => m.remove()); fn(); } }, h('span', { style: { width: '22px', textAlign: 'center' } }, ic), label);
  function folderPicker(anchor, title, done, exclude) {
    menu(anchor, m => {
      m.append(h('h5', {}, title), mi('🏠', 'All files (no folder)', () => done(null)));
      const walk = (p, d) => { for (const f of children(p)) { if (exclude && exclude.has(f.id)) continue; const b = mi('📁', f.name, () => done(f.id)); b.style.paddingLeft = 10 + d * 16 + 'px'; m.append(b); walk(f.id, d + 1); } };
      walk(null, 0);
      m.append(h('hr'), mi('＋', 'New folder…', async () => { const f = await newFolder(); if (f) done(f.id); }));
    });
  }
  function fileMenu(f, anchor) {
    menu(anchor, m => m.append(
      mi('↗', 'Open in ' + ((PsiHub.byId(f.app) || {}).short || 'its app'), () => openFile(f)),
      f.app === 'notes' ? mi('◫', 'Open in Notes beside another note', () => { location.href = 'notes.html?open=' + encodeURIComponent(f.id); }) : null,
      mi('📌', pinned(f) ? 'Unpin' : 'Pin to the top of its folder', async () => { await place(f.key, folderOf(f), { pinned: !pinned(f) }); render(); }),
      mi('➜', 'Move to folder…', () => folderPicker(anchor, 'Move “' + f.name + '” to', async id => { await place(f.key, id); toast('Moved to ' + (id ? FOLDERS.find(x => x.id === id).name : 'All files')); render(); })),
      folderOf(f) ? mi('⤴', 'Take out of this folder', async () => { await place(f.key, null); render(); }) : null));
  }
  function folderMenu(fo, anchor) {
    menu(anchor, m => {
      m.append(mi('📂', 'Open', () => go(fo.id)), mi('✎', 'Rename…', () => renameFolder(fo)),
        mi('➜', 'Move into…', () => folderPicker(anchor, 'Move “' + fo.name + '” into', async id => { fo.parent = id; await ST.put('folders', fo); render(); }, inside(fo.id))));
      m.append(h('div', { class: 'cols' }, ...FCOLS.map(c => h('i', { style: { background: c }, title: 'Colour', onclick: async () => { document.querySelectorAll('.menu').forEach(x => x.remove()); fo.colour = c; await ST.put('folders', fo); render(); } }))));
      m.append(h('hr'), mi('🗑', 'Delete folder (its files move up a level)', async () => {
        for (const f of FILES) if (folderOf(f) === fo.id) await place(f.key, fo.parent || null);
        for (const c of FOLDERS) if (c.parent === fo.id) { c.parent = fo.parent || null; await ST.put('folders', c); }
        FOLDERS = FOLDERS.filter(x => x !== fo); await ST.del('folders', fo.id); if (here === fo.id) here = fo.parent || null; render();
      }));
    });
  }
  function askName(title, value) {
    return new Promise(res => {
      const d = h('dialog', { style: { background: '#26262d', color: 'var(--ink)', border: '1px solid var(--rule)', borderRadius: '16px', padding: '18px', width: 'min(420px,92vw)' } });
      const inp = h('input', { type: 'text', value: value || '', 'aria-label': title, style: { width: '100%', background: 'var(--panel)', border: '1px solid var(--rule)', borderRadius: '10px', padding: '10px 12px', marginTop: '6px' } });
      const ok = () => { const v = inp.value.trim(); d.close(); res(v || null); };
      inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      d.append(h('div', { style: { fontWeight: 700, fontSize: '17px' } }, title), inp, h('div', { style: { display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '14px' } }, h('button', { class: 'btn', type: 'button', onclick: () => { d.close(); res(null); } }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: ok }, 'Save')));
      d.addEventListener('cancel', () => res(null)); d.addEventListener('close', () => setTimeout(() => d.remove(), 50));
      document.body.append(d); d.showModal(); setTimeout(() => { inp.focus(); inp.select(); }, 30);
    });
  }
  async function renameFolder(fo) { const n = await askName('Rename folder', fo.name); if (n) { fo.name = n.slice(0, 60); await ST.put('folders', fo); render(); } }
  async function newFolder() {
    const n = await askName('New folder', 'New folder'); if (!n) return null;
    const f = { id: 'f' + uid(), name: n.slice(0, 60), parent: here, colour: FCOLS[FOLDERS.length % FCOLS.length], created: Date.now() };
    FOLDERS.push(f); await ST.put('folders', f); render(); return f;
  }
  function newIn(app) {
    if (here) localStorage.setItem('home.pending', JSON.stringify({ app, folder: here, t: Date.now() }));
    location.href = NEW[app];
  }
  $('#newFolder').addEventListener('click', () => newFolder());
  $('#newHere').addEventListener('click', e => menu(e.currentTarget, m => { m.append(h('h5', {}, here ? 'New, filed in this folder' : 'New')); for (const a of APPS) if (NEW[a.id]) m.append(mi(a.icon, a.name, () => newIn(a.id))); }));
  function selBar() {
    let b = $('.selbar'); if (!selecting) { if (b) b.remove(); return; }
    if (!b) { b = h('div', { class: 'selbar' }); document.body.append(b); }
    b.textContent = '';
    b.append(h('span', { style: { padding: '0 6px', color: 'var(--muted)' } }, picked.size + ' selected'),
      h('button', { class: 'btn', type: 'button', disabled: !picked.size || null, onclick: e => folderPicker(e.currentTarget, 'Move ' + picked.size + ' to', async id => { for (const k of picked) await place(k, id); picked.clear(); toast('Moved'); render(); selBar(); }) }, '➜ Move to…'),
      h('button', { class: 'btn', type: 'button', disabled: !picked.size || null, onclick: async () => { for (const k of picked) await place(k, (PLACES.get(k) || {}).folder || null, { pinned: true }); picked.clear(); render(); selBar(); } }, '📌 Pin'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => { selecting = false; picked.clear(); document.body.classList.remove('selecting'); $('#selBtn').classList.remove('on'); render(); selBar(); } }, 'Done'));
  }
  $('#selBtn').addEventListener('click', () => { selecting = !selecting; picked.clear(); document.body.classList.toggle('selecting', selecting); $('#selBtn').classList.toggle('on', selecting); render(); selBar(); });
  $('#sort').addEventListener('change', render);
  $('#q').addEventListener('input', render);
  load();
  addEventListener('pageshow', e => { if (e.persisted) load(); });
  window.PsiHome = { load, get files() { return FILES; }, get folders() { return FOLDERS; }, place, go, render };
})();
