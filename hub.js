// Psi Phi hub: the shared app list, a Home button, and "Send to…" between the apps.
// A transfer is parked in IndexedDB ('psiphi-hub' → 'inbox') and the target app opens with ?inbox=<id> and takes it.
(() => {
  'use strict';
  const APPS = [
    { id: 'studio', file: 'index.html', name: 'Psi Phi Studio', short: 'Studio', icon: 'Ψ', colour: '#58C4DD', desc: 'Animate science: maths, logic, molecules, proteins, anatomy, 3D' },
    { id: 'notes', file: 'notes.html', name: 'Psi Phi Notes', short: 'Notes', icon: '✎', colour: '#E0A458', desc: 'Notebooks, whiteboards and PDFs, written by hand or typed' },
    { id: 'clayform', file: 'clayform.html', name: 'ClayForm', short: 'ClayForm', icon: '◕', colour: '#E9A15B', desc: 'Sculpt, rig and pose 3D clay and puppets' },
    { id: 'tabula', file: 'tabula.html', name: 'Tabula', short: 'Tabula', icon: '🖌', colour: '#C08BF0', desc: 'Paint, ink and animate frame by frame' },
    { id: '8bit', file: '8bit.html', name: '8-Bit', short: '8-Bit', icon: '▦', colour: '#83C167', desc: 'Pixel art, palettes and sprite animation' },
    { id: 'logos', file: 'logos.html', name: 'Logos', short: 'Logos', icon: '¶', colour: '#F0AC5F', desc: 'Documents and scripts' },
    { id: 'calsheet', file: 'calsheet.html', name: 'Calsheet', short: 'Calsheet', icon: '▤', colour: '#5CD0B3', desc: 'Spreadsheets, formulas and charts' },
    { id: 'final', file: 'finalstage.html', name: 'Final Stage', short: 'Final Stage', icon: '🎬', colour: '#FC6255', desc: 'Cut and finish videos' },
    { id: 'shelf', file: 'shelf.html', name: 'Shelf', short: 'Shelf', icon: '📚', colour: '#C9935E', desc: 'Books, magazines, comics and paper stacks on shelves you arrange' }
  ];
  const byId = id => APPS.find(a => a.id === id);
  const QS = new URLSearchParams(location.search);
  const EMBED = QS.get('embed') === '1';
  const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
  const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);

  let dbp = null;
  const db = () => dbp || (dbp = new Promise((res, rej) => { const r = indexedDB.open('psiphi-hub', 2); r.onupgradeneeded = () => { const d = r.result; for (const [n, k] of [['inbox', 'id'], ['folders', 'id'], ['places', 'key']]) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: k }); }; r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); }));
  const tx = async (mode, fn, store) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction(store || 'inbox', mode), q = fn(t.objectStore(store || 'inbox')); let out; if (q) q.onsuccess = () => { out = q.result; }; t.oncomplete = () => res(out); t.onerror = () => rej(t.error); }); };

  // CSS shared by the hub's menu and button, so every app gets the same look
  const css = `.hub-home{display:inline-grid;place-items:center;width:34px;height:34px;border-radius:9px;color:inherit;text-decoration:none;flex:none;border:1px solid transparent}
.hub-home:hover{background:rgba(255,255,255,.08)}.hub-home svg{width:20px;height:20px}
.hub-send{display:inline-flex;align-items:center;gap:5px;height:34px;padding:0 10px;border-radius:9px;border:1px solid rgba(255,255,255,.14);background:transparent;color:inherit;cursor:pointer;font:inherit;font-size:13px;white-space:nowrap;flex:none}
.hub-send:hover{background:rgba(255,255,255,.08)}
.hub-menu{position:fixed;z-index:9999;min-width:250px;max-width:min(360px,94vw);max-height:70vh;overflow:auto;background:#2b2b33;color:#ededf3;border:1px solid #3a3a46;border-radius:12px;box-shadow:0 12px 40px rgba(0,0,0,.5);padding:5px;font:14px/1.3 -apple-system,system-ui,sans-serif}
.hub-menu h5{margin:8px 10px 4px;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#9b9bab}
.hub-menu button{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:none;background:transparent;color:inherit;padding:8px 10px;border-radius:8px;cursor:pointer;font:inherit}
.hub-menu button:hover{background:#34343e}.hub-menu .ic{width:26px;height:26px;border-radius:7px;display:grid;place-items:center;flex:none;font-size:14px;color:#111}
.hub-menu .sub{display:block;font-size:12px;color:#9b9bab}
.hub-toast{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);background:#33333d;color:#ededf3;padding:10px 16px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,.5);z-index:9999;font:13.5px -apple-system,system-ui,sans-serif;max-width:90vw}`;
  function addCSS() { if (document.getElementById('hub-css')) return; const s = document.createElement('style'); s.id = 'hub-css'; s.textContent = css; document.head.append(s); }
  function toast(msg, ms) { const t = document.createElement('div'); t.className = 'hub-toast'; t.textContent = msg; document.body.append(t); setTimeout(() => t.remove(), ms || 2600); }

  const HOME_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11 12 4l9 7"/><path d="M5 10v10h5v-6h4v6h5V10"/></svg>';
  // a Home button at the start of an app's top bar (not when the app is shown inside another one)
  function mountHome(bar, before) {
    if (!bar || EMBED || inFrame) return null;
    addCSS();
    const a = document.createElement('a'); a.className = 'hub-home'; a.href = 'home.html'; a.title = 'Home: all Psi Phi apps and files'; a.setAttribute('aria-label', 'Home'); a.innerHTML = HOME_SVG;
    a.addEventListener('click', e => { if (window.PsiHubBeforeLeave) { e.preventDefault(); Promise.resolve(window.PsiHubBeforeLeave()).finally(() => { location.href = 'home.html'; }); } });
    if (before) bar.insertBefore(a, before); else bar.prepend(a);
    return a;
  }
  // offers: () => [{ to: 'notes', label: 'This page as a picture', make: async () => payload } | { to, label, run: () => {} }]
  function mountSend(bar, offers, before) {
    if (!bar || EMBED) return null;
    addCSS();
    const b = document.createElement('button'); b.type = 'button'; b.className = 'hub-send'; b.title = 'Send to another Psi Phi app'; b.innerHTML = '<span aria-hidden="true">⇪</span><span>Send to</span>';
    b.addEventListener('click', () => sendMenu(b, offers()));
    if (before) bar.insertBefore(b, before); else bar.append(b);
    return b;
  }
  function closeMenu() { document.querySelectorAll('.hub-menu').forEach(m => m.remove()); }
  function sendMenu(anchor, list) {
    closeMenu(); addCSS();
    const m = document.createElement('div'); m.className = 'hub-menu'; m.setAttribute('role', 'menu');
    if (!list.length) { m.innerHTML = '<h5>Send to</h5><div style="padding:8px 10px;color:#9b9bab">Nothing to send from here yet. Select something first.</div>'; }
    else {
      const head = document.createElement('h5'); head.textContent = 'Send to another app'; m.append(head);
      for (const o of list) {
        const app = byId(o.to); if (!app) continue;
        const btn = document.createElement('button'); btn.type = 'button';
        btn.innerHTML = `<span class="ic" style="background:${app.colour}">${app.icon}</span><span><b></b><span class="sub"></span></span>`;
        btn.querySelector('b').textContent = app.short; btn.querySelector('.sub').textContent = o.label;
        btn.addEventListener('click', async () => {
          closeMenu();
          try {
            if (o.run) { await o.run(); return; }
            toast('Preparing…', 30000);
            const payload = await o.make(); document.querySelectorAll('.hub-toast').forEach(t => t.remove());
            if (!payload) return;
            await send(o.to, payload);
          } catch (e) { document.querySelectorAll('.hub-toast').forEach(t => t.remove()); toast('Couldn’t send it: ' + (e.message || e), 4500); }
        });
        m.append(btn);
      }
    }
    document.body.append(m);
    const r = anchor.getBoundingClientRect(), W = m.offsetWidth, H = m.offsetHeight;
    m.style.left = Math.max(6, Math.min(innerWidth - W - 6, r.right - W)) + 'px';
    m.style.top = (r.bottom + 6 + H < innerHeight ? r.bottom + 6 : Math.max(6, r.top - H - 6)) + 'px';
    setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }; addEventListener('pointerdown', off, true); }, 0);
  }
  // park the payload, then open the target (inside Notes' side-by-side panes, Notes routes it instead)
  async function send(to, payload) {
    const app = byId(to); if (!app) throw new Error('No such app');
    const id = 'x' + uid();
    await tx('readwrite', st => st.put(Object.assign({}, payload, { id, to, from: payload.from || current(), created: Date.now() })));
    if (window.PsiHubBeforeLeave) await window.PsiHubBeforeLeave();
    if (inFrame && !EMBED) { try { parent.postMessage({ type: 'hub-send', to, id }, '*'); return; } catch (e) { } }
    location.href = app.file + '?inbox=' + id;
  }
  function current() { const f = location.pathname.split('/').pop() || 'index.html'; const a = APPS.find(x => x.file === f); return a ? a.id : ''; }
  async function get(id) { return tx('readonly', st => st.get(id)); }
  async function drop(id) { return tx('readwrite', st => st.delete(id)); }
  // the transfer this page was opened with, if any (taken once, then removed from the URL and the inbox)
  async function take() {
    const id = QS.get('inbox'); if (!id) return null;
    const p = await get(id).catch(() => null);
    await drop(id).catch(() => { });
    try { const u = new URL(location.href); u.searchParams.delete('inbox'); history.replaceState(null, '', u.pathname + (u.search || '') + u.hash); } catch (e) { }
    return p || null;
  }
  // old transfers (opened but never taken) are cleared after a day
  setTimeout(() => tx('readwrite', st => { const q = st.openCursor(); q.onsuccess = () => { const c = q.result; if (!c) return; if (Date.now() - (c.value.created || 0) > 864e5) c.delete(); c.continue(); }; return null; }).catch(() => { }), 4000);

  // helpers for building payloads
  const canvasBlob = (c, type, q) => new Promise(r => c.toBlob(r, type || 'image/png', q));
  function csvToHTML(csv, header) {
    const rows = String(csv || '').trim().split(/\r?\n/).map(l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; });
    const e = s => String(s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return '<table>' + rows.map((r, i) => '<tr>' + r.map(c => (i === 0 && header !== false ? '<th>' : '<td>') + e(c) + (i === 0 && header !== false ? '</th>' : '</td>')).join('') + '</tr>').join('') + '</table>';
  }
  function tableToCSV(table) { return [...table.rows].map(r => [...r.cells].map(c => { const t = c.innerText.replace(/\s+/g, ' ').trim(); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(',')).join('\n'); }
  // CPK-ish atom colours (0..1) and van der Waals radii (Å) for turning structures into clay
  const ELEM = { H: [[0.92, 0.92, 0.92], 1.1], C: [[0.35, 0.35, 0.38], 1.7], N: [[0.2, 0.35, 0.95], 1.55], O: [[0.92, 0.18, 0.15], 1.52], S: [[0.95, 0.8, 0.2], 1.8], P: [[1, 0.5, 0], 1.8], F: [[0.5, 0.9, 0.3], 1.47], Cl: [[0.3, 0.85, 0.3], 1.75], Br: [[0.6, 0.15, 0.1], 1.85], I: [[0.5, 0.1, 0.6], 1.98], Fe: [[0.85, 0.45, 0.2], 1.94], Mg: [[0.4, 0.8, 0.3], 1.73], Ca: [[0.5, 0.5, 0.5], 2.31], Na: [[0.6, 0.4, 0.9], 2.27], K: [[0.55, 0.3, 0.85], 2.75], Zn: [[0.5, 0.5, 0.7], 1.39] };
  function atomsToBalls(atoms, scale) {
    return atoms.map(a => { const el = (a.el || 'C').replace(/^(.)(.*)$/, (m, x, y) => x.toUpperCase() + y.toLowerCase()), e = ELEM[el] || [[0.8, 0.4, 0.8], 1.8]; return [a.x * scale, a.y * scale, a.z * scale, e[1] * scale, e[0][0], e[0][1], e[0][2]]; });
  }

  // cross-app folders: folders {id, name, parent, colour}; places {key: 'app:id', folder, pinned}
  const store = {
    all: name => tx('readonly', st => st.getAll(), name),
    put: (name, v) => tx('readwrite', st => st.put(v), name),
    del: (name, k) => tx('readwrite', st => st.delete(k), name)
  };
  window.PsiHub = { store, APPS, byId, EMBED, inFrame, mountHome, mountSend, sendMenu, send, take, get, drop, toast, canvasBlob, csvToHTML, tableToCSV, atomsToBalls, ELEM };
})();
