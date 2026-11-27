// Psi Phi Notes: notebooks, whiteboards and PDFs, written by hand or typed, with everything Psi Phi Studio can make.
(() => {
  'use strict';
  const $ = (s, r = document) => r.querySelector(s);
  function h(tag, attrs, ...kids) {
    const el = tag === 'svg' || tag === 'path' ? document.createElementNS('http://www.w3.org/2000/svg', tag) : document.createElement(tag);
    if (attrs) for (const k in attrs) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k === 'html') el.innerHTML = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    for (const c of kids.flat(9)) if (c != null && c !== false) el.append(c.nodeType ? c : String(c));
    return el;
  }
  const uid = () => Date.now().toString(36).slice(-6) + Math.random().toString(36).slice(2, 7);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };
  const DPR = () => Math.min(3, window.devicePixelRatio || 1);
  let toastT = null;
  function toast(msg, ms) { const t = $('#toast'); t.textContent = msg; t.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove('show'), ms || 2600); }
  function fmtDate(t) { const d = new Date(t), now = new Date(); if (d.toDateString() === now.toDateString()) return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); return d.toLocaleDateString([], { day: 'numeric', month: 'short', year: d.getFullYear() === now.getFullYear() ? undefined : 'numeric' }); }

  // ---------- settings ----------
  const DEF = {
    tool: 'pen',
    pen: { style: 'ball', c: '#1d1d1f', w: 2.4 },
    hl: { c: '#ffe14d', w: 16 },
    er: { mode: 'stroke', w: 16, hlOnly: false },
    shape: { kind: 'auto', c: '#1d1d1f', w: 2.4, fill: '', dash: false },
    lasso: { mode: 'free' },
    text: { font: 'sans', size: 18, c: '#1d1d1f' },
    pencilOnly: false, autoPencil: true, holdSnap: true, scroll: 'v', stab: 0.5, pressureAmt: 1, predict: true,
    swatches: ['#1d1d1f', '#2f6fde', '#d93b3b', '#2a9d5c', '#e08a1e', '#8a4fd8', '#ffffff'],
    hlSwatches: ['#ffe14d', '#9df07a', '#7ad7f0', '#f59ad3', '#ffb15c', '#c7c7cc']
  };
  const S = LS.get('psiphi-notes.settings', null) || {};
  for (const k in DEF) if (S[k] == null) S[k] = JSON.parse(JSON.stringify(DEF[k])); else if (typeof DEF[k] === 'object' && !Array.isArray(DEF[k])) S[k] = Object.assign({}, DEF[k], S[k]);
  const saveS = () => LS.set('psiphi-notes.settings', S);

  // ---------- storage: IndexedDB with items (library), docs (pages and contents) and blobs (pictures, PDFs, videos) ----------
  let dbP = null, dbConn = null;
  function db() {
    return dbP || (dbP = new Promise((res, rej) => {
      const r = indexedDB.open('psiphi-notes', 1);
      r.onupgradeneeded = () => { for (const n of ['items', 'docs', 'blobs']) if (!r.result.objectStoreNames.contains(n)) r.result.createObjectStore(n, { keyPath: 'id' }); };
      r.onsuccess = () => { dbConn = r.result; res(r.result); }; r.onerror = () => rej(r.error);
    }));
  }
  async function tx(store, mode, fn) {
    const d = dbConn || await db();   // when already open, the request starts at once (matters when the page is closing)
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), q = fn(t.objectStore(store));
      let out; if (q && 'onsuccess' in q) q.onsuccess = () => { out = q.result; };
      t.oncomplete = () => res(out); t.onerror = () => rej(t.error); t.onabort = () => rej(t.error || new Error('Storage full?'));
    });
  }
  const dbAll = s => tx(s, 'readonly', st => st.getAll());
  const dbGet = (s, id) => tx(s, 'readonly', st => st.get(id));
  const dbPut = (s, v) => tx(s, 'readwrite', st => st.put(v));
  const dbDel = (s, id) => tx(s, 'readwrite', st => st.delete(id));
  async function putBlob(blob, pre) { const id = (pre || 'b') + '_' + uid(); await dbPut('blobs', { id, blob }); return id; }
  const URLS = new Map(), IMGS = new Map();
  function blobURL(id) {
    if (!URLS.has(id)) URLS.set(id, dbGet('blobs', id).then(r => r ? URL.createObjectURL(r.blob) : null).catch(() => null));
    return URLS.get(id);
  }
  async function blobOf(id) { const r = await dbGet('blobs', id).catch(() => null); return r ? r.blob : null; }
  // pictures for canvas drawing: returns the image when ready, otherwise starts loading and redraws when it arrives
  function imgNow(id) {
    let e = IMGS.get(id);
    if (!e) {
      e = { img: null }; IMGS.set(id, e);
      blobURL(id).then(u => { if (!u) return; const im = new Image(); im.onload = () => { e.img = im; redrawAll(); }; im.src = u; });
    }
    return e.img;
  }
  function imgLoad(id) { return blobURL(id).then(u => new Promise(res => { if (!u) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = u; })); }

  // ---------- papers ----------
  const SIZES = { a4: [794, 1123, 'A4'], a4l: [1123, 794, 'A4 landscape'], letter: [816, 1056, 'US Letter'], a5: [559, 794, 'A5'], square: [900, 900, 'Square'], wide: [1280, 720, '16:9 slide'], phone: [600, 1060, 'Tall'] };
  const PAPERS = [['blank', 'Blank'], ['lined', 'Lined'], ['narrow', 'Narrow lined'], ['grid', 'Squared'], ['dots', 'Dotted'], ['cornell', 'Cornell'], ['music', 'Music staves'], ['iso', 'Isometric'], ['todo', 'To-do'], ['story', 'Storyboard']];
  const PCOLS = [['#ffffff', 'White'], ['#fbf6e9', 'Cream'], ['#fff6bf', 'Yellow'], ['#eef3f8', 'Blue grey'], ['#f1f1f1', 'Grey'], ['#26272c', 'Dark'], ['#111214', 'Black'], ['#1f3a2e', 'Chalkboard']];
  const COVERS = ['#2f6fde', '#d93b3b', '#2a9d5c', '#e08a1e', '#8a4fd8', '#1d1d1f', '#0f766e', '#be185d', '#a16207', '#475569'];
  const isDark = c => { const n = parseInt(String(c || '#fff').slice(1).padEnd(6, 'f'), 16); return ((n >> 16 & 255) * 0.3 + (n >> 8 & 255) * 0.59 + (n & 255) * 0.11) < 120; };
  function drawPaper(ctx, pg, vx0, vy0, vx1, vy1, z) {
    const P = pg.paper || { type: 'blank', color: '#ffffff' }, dark = isDark(P.color);
    const line = dark ? 'rgba(255,255,255,0.17)' : 'rgba(70,110,190,0.30)', strong = dark ? 'rgba(255,120,120,0.35)' : 'rgba(220,80,80,0.42)';
    const W = pg.w, H = pg.h, x0 = Math.max(0, vx0), y0 = Math.max(0, vy0), x1 = Math.min(W, vx1), y1 = Math.min(H, vy1);
    ctx.lineWidth = Math.max(0.6, 1 / z) * 0.9;
    const hl = (y, c) => { ctx.strokeStyle = c || line; ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x1, y); ctx.stroke(); };
    const vl = (x, c, ya, yb) => { ctx.strokeStyle = c || line; ctx.beginPath(); ctx.moveTo(x, ya == null ? y0 : ya); ctx.lineTo(x, yb == null ? y1 : yb); ctx.stroke(); };
    const t = P.type, sp = P.sp || ({ lined: 32, narrow: 24, grid: 19, dots: 19, iso: 22, todo: 40, cornell: 30 }[t] || 30);
    if (t === 'lined' || t === 'narrow' || t === 'cornell' || t === 'todo') {
      const top = t === 'todo' ? 90 : 96;
      for (let y = top + Math.max(0, Math.ceil((y0 - top) / sp)) * sp; y <= y1; y += sp) hl(y);
      if (t === 'cornell') { vl(W * 0.28, strong, top - sp, H - 150); hl(H - 150, strong); hl(top - sp, strong); }
      else if (t === 'todo') { for (let y = top + Math.max(0, Math.ceil((y0 - top) / sp)) * sp; y <= y1; y += sp) { ctx.strokeStyle = line; ctx.strokeRect(46, y - 28, 18, 18); } }
      else vl(72, strong);
    } else if (t === 'grid') {
      for (let y = Math.ceil(y0 / sp) * sp; y <= y1; y += sp) hl(y);
      for (let x = Math.ceil(x0 / sp) * sp; x <= x1; x += sp) vl(x);
    } else if (t === 'dots' || t === 'iso') {
      if (sp * z < 4) return;
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.32)' : 'rgba(60,70,100,0.42)';
      const r = Math.max(0.9, 1.1 / z) * 1.1, dy = t === 'iso' ? sp * 0.866 : sp;
      for (let j = Math.ceil(y0 / dy), y = j * dy; y <= y1; j++, y = j * dy) { const off = t === 'iso' && (j & 1) ? sp / 2 : 0; for (let x = Math.ceil((x0 - off) / sp) * sp + off; x <= x1; x += sp) { ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill(); } }
    } else if (t === 'music') {
      const gap = 9, staff = gap * 4, step = staff + 52;
      for (let s = 80; s + staff < H - 40; s += step) { if (s > y1 || s + staff < y0) continue; for (let k = 0; k < 5; k++) { ctx.strokeStyle = dark ? 'rgba(255,255,255,0.4)' : 'rgba(30,30,40,0.55)'; ctx.beginPath(); ctx.moveTo(50, s + k * gap); ctx.lineTo(W - 50, s + k * gap); ctx.stroke(); } }
    } else if (t === 'story') {
      const cols = W > H ? 3 : 2, rows = W > H ? 2 : 3, m = 40, gw = (W - m * (cols + 1)) / cols, gh = (H - m * (rows + 1)) / rows - 50;
      ctx.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(30,30,40,0.5)';
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) { const x = m + c * (gw + m), y = m + r * (gh + 50 + m); ctx.strokeRect(x, y, gw, gh); ctx.strokeStyle = line; for (let k = 1; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(x, y + gh + k * 18); ctx.lineTo(x + gw, y + gh + k * 18); ctx.stroke(); } ctx.strokeStyle = dark ? 'rgba(255,255,255,0.45)' : 'rgba(30,30,40,0.5)'; }
    }
  }
  // the endless backdrop of a whiteboard
  function drawBoardPaper(ctx, P, vx0, vy0, vx1, vy1, z) {
    const dark = isDark(P.color), t = P.type;
    if (t === 'blank') return;
    let sp = P.sp || 24; while (sp * z < 12) sp *= 4;
    if (t === 'grid' || t === 'lined') {
      ctx.lineWidth = 1 / z; ctx.strokeStyle = dark ? 'rgba(255,255,255,0.10)' : 'rgba(70,110,190,0.20)'; ctx.beginPath();
      for (let y = Math.floor(vy0 / sp) * sp; y <= vy1; y += sp) { ctx.moveTo(vx0, y); ctx.lineTo(vx1, y); }
      if (t === 'grid') for (let x = Math.floor(vx0 / sp) * sp; x <= vx1; x += sp) { ctx.moveTo(x, vy0); ctx.lineTo(x, vy1); }
      ctx.stroke();
    } else {
      ctx.fillStyle = dark ? 'rgba(255,255,255,0.22)' : 'rgba(60,70,100,0.30)';
      const r = 1.3 / z;
      for (let y = Math.floor(vy0 / sp) * sp; y <= vy1; y += sp) for (let x = Math.floor(vx0 / sp) * sp; x <= vx1; x += sp) ctx.fillRect(x - r, y - r, r * 2, r * 2);
    }
  }

  // ---------- ink ----------
  // Strokes are stored as the raw pen samples [x, y, pressure, …]. Drawing them:
  //  1. stabilise: each point is pulled only part of the way towards the next sample (more when you move slowly,
  //     less when you move fast), which removes the shake without making fast writing lag;
  //  2. give every point a radius from pressure (or speed, for fingers), with soft tapers on the expressive pens;
  //  3. offset left and right to make an outline, round the ends, split at sharp corners;
  //  4. draw the outline with curves through the midpoints, so the edge is smooth at any zoom.
  const PEN_STYLES = [['ball', 'Ballpoint'], ['fountain', 'Fountain'], ['brush', 'Brush pen'], ['pencil', 'Pencil'], ['mono', 'Fineliner']];
  const INK = {
    ball: { th: 0.3, ts: 0, te: 0, sim: false },
    fountain: { th: 0.6, ts: 0.6, te: 1.6, sim: true, nib: true },
    brush: { th: 0.85, ts: 1.6, te: 3.2, sim: true },
    pencil: { th: 0.35, ts: 0.4, te: 0.6, sim: false },
    mono: { th: 0, ts: 0, te: 0, sim: false },
    hl: { th: 0, ts: 0, te: 0, sim: false, flat: true }
  };
  function inkOpts(s) {
    const st = INK[s.tool === 'hl' ? 'hl' : s.style] || INK.ball, size = s.w;
    return { size, th: st.th * (s.pa == null ? 1 : s.pa), ts: s._noTs ? 0 : st.ts * size * 3, te: st.te * size * 3, sim: st.sim && !!s.sim, nib: st.nib, flat: st.flat, sl: s.sl == null ? 0.5 : s.sl };
  }
  // stabilised points: [x, y, pressure, step, runningLength]
  function stabilise(raw, sl, size, extra) {
    const n = raw.length / 3, out = [];
    if (!n) return out;
    const tMin = 0.12 + (1 - sl) * 0.88;
    let x = raw[0], y = raw[1], len = 0;
    out.push([x, y, raw[2], 0, 0]);
    const add = (ix, iy, p, t) => {
      const nx = x + (ix - x) * t, ny = y + (iy - y) * t, d = Math.hypot(nx - x, ny - y);
      if (d < 0.05) return;
      len += d; out.push([nx, ny, p, d, len]); x = nx; y = ny;
    };
    for (let i = 1; i < n; i++) {
      const ix = raw[i * 3], iy = raw[i * 3 + 1], gap = Math.hypot(ix - x, iy - y);
      // variable stabilisation: slow, careful movement gets the most smoothing
      const t = Math.min(1, tMin + (1 - tMin) * Math.min(1, gap / (size * 6 + 6)) * 0.7);
      add(ix, iy, raw[i * 3 + 2], t);
    }
    // catch up with the pen tip (and any predicted points) so the line never trails behind
    const tail = extra ? raw.slice(-3).concat(extra) : raw.slice(-3);
    for (let i = 0; i < tail.length; i += 3) { const tx = tail[i], ty = tail[i + 1], d = Math.hypot(tx - x, ty - y), k = Math.max(1, Math.ceil(d / Math.max(0.6, size * 0.4))); const x0 = x, y0 = y; for (let j = 1; j <= k; j++) add(x0 + (tx - x0) * j / k, y0 + (ty - y0) * j / k, tail[i + 2], 1); }
    return relax(out, 1 + Math.round(sl * 3));
  }
  // light relaxation: each point eased towards its neighbours' average (ends stay put); removes hand tremor
  function relax(P, passes) {
    const n = P.length; if (n < 4) return P;
    for (let k = 0; k < passes; k++) {
      const q = P.map(p => p.slice());
      for (let i = 1; i < n - 1; i++) { q[i][0] = (P[i - 1][0] + 2 * P[i][0] + P[i + 1][0]) / 4; q[i][1] = (P[i - 1][1] + 2 * P[i][1] + P[i + 1][1]) / 4; }
      P = q;
    }
    let len = 0; P[0][3] = 0; P[0][4] = 0;
    for (let i = 1; i < n; i++) { const d = Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]); P[i][3] = d; len += d; P[i][4] = len; }
    return P;
  }
  function outlinePath(P, o, done, path, bbAcc) {
    const n = P.length; if (!n) return;
    const total = P[n - 1][4], rad = new Float32Array(n);
    let pp = o.sim ? 0.5 : P[0][2];
    for (let i = 0; i < n; i++) {
      let p;
      if (o.sim) { const v = Math.min(1, P[i][3] / o.size), rp = Math.min(1, 1 - v); pp = Math.min(1, pp + (rp - pp) * v * 0.275); p = pp; }
      else { pp += (P[i][2] - pp) * 0.45; p = pp; }
      let r = o.size / 2 * (1 + o.th * (Math.pow(clamp(p, 0.001, 1), 0.65) * 2 - 1));
      if (o.ts) { const u = Math.min(1, P[i][4] / o.ts); r *= 0.18 + 0.82 * (1 - (1 - u) * (1 - u)); }
      if (o.te && done) { const u = Math.min(1, (total - P[i][4]) / o.te); r *= 0.12 + 0.88 * (1 - (1 - u) * (1 - u)); }
      rad[i] = Math.max(o.size * 0.06, r);
    }
    if (n === 1 || total < 0.4) { // a dot
      const r = rad[0]; path.moveTo(P[0][0] + r, P[0][1]); path.arc(P[0][0], P[0][1], r, 0, Math.PI * 2);
      bbAcc(P[0][0] - r, P[0][1] - r, P[0][0] + r, P[0][1] + r); return;
    }
    // directions over a short distance, so sample noise can't flip the edges
    const dirAt = (i) => {
      let a = i, b = i; const reach = Math.max(0.8, rad[i] * 0.6);
      while (a > 0 && P[i][4] - P[a][4] < reach) a--;
      while (b < n - 1 && P[b][4] - P[i][4] < reach) b++;
      let dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1], d = Math.hypot(dx, dy) || 1;
      return [dx / d, dy / d];
    };
    const dirs = []; for (let i = 0; i < n; i++) dirs.push(dirAt(i));
    // pieces split at sharp corners (each gets round ends, so corners stay crisp and filled)
    const cuts = [0];
    for (let i = 1; i < n - 1; i++) {
      const a = dirs[Math.max(0, i - 1)], b = dirs[Math.min(n - 1, i + 1)];
      if (a[0] * b[0] + a[1] * b[1] < -0.1 && P[i][4] - P[cuts[cuts.length - 1]][4] > rad[i]) cuts.push(i);
    }
    cuts.push(n - 1);
    for (let k = 0; k < cuts.length - 1; k++) piece(cuts[k], cuts[k + 1], k === 0, k === cuts.length - 2);
    function piece(i0, i1, first, lastPiece) {
      const L = [], R = [];
      let lastLen = -1e9;
      for (let i = i0; i <= i1; i++) {
        if (i !== i0 && i !== i1 && P[i][4] - lastLen < Math.max(0.25, rad[i] * 0.3)) continue;
        lastLen = P[i][4];
        let [dx, dy] = dirs[i]; if (i === i1 && i !== i0) [dx, dy] = dirs[Math.max(i0, i - 1)];
        let r = rad[i];
        if (o.nib) r *= 0.55 + 0.6 * Math.abs(Math.sin(Math.atan2(dy, dx) - Math.PI / 4));
        const x = P[i][0], y = P[i][1], nx = -dy * r, ny = dx * r;
        L.push([x + nx, y + ny]); R.push([x - nx, y - ny]);
        bbAcc(x - r, y - r, x + r, y + r);
      }
      const cap = (cx, cy, from, r, dir) => { const out = [], a0 = Math.atan2(from[1] - cy, from[0] - cx); for (let j = 1; j < 8; j++) { const a = a0 + dir * Math.PI * j / 8; out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } return out; };
      const e = P[i1], s0 = P[i0];
      const flatEnd = o.flat, endCap = flatEnd ? [] : cap(e[0], e[1], L[L.length - 1], Math.hypot(L[L.length - 1][0] - e[0], L[L.length - 1][1] - e[1]), -1);
      const startCap = flatEnd ? [] : cap(s0[0], s0[1], R[0], Math.hypot(R[0][0] - s0[0], R[0][1] - s0[1]), -1);
      let poly = L.concat(endCap, R.reverse(), startCap);
      // keep every piece wound the same way, so overlaps never cancel out
      let area = 0; for (let j = 0; j < poly.length; j++) { const a = poly[j], b = poly[(j + 1) % poly.length]; area += a[0] * b[1] - b[0] * a[1]; }
      if (area < 0) poly = poly.reverse();
      const m = poly.length;
      if (m < 3) return;
      const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
      let s = mid(poly[m - 1], poly[0]); path.moveTo(s[0], s[1]);
      for (let j = 0; j < m; j++) { const c = poly[j], nm = mid(c, poly[(j + 1) % m]); path.quadraticCurveTo(c[0], c[1], nm[0], nm[1]); }
      path.closePath();
      // tight bends: a disc fills the pinch where the inner edge folds over
      for (let i = i0 + 1; i < i1; i++) {
        const a = dirs[i - 1], b = dirs[i + 1], turn = Math.acos(clamp(a[0] * b[0] + a[1] * b[1], -1, 1)), ds = Math.max(0.01, P[i + 1][4] - P[i - 1][4]);
        if (rad[i] * turn / ds > 0.7) { const r = rad[i] * (o.nib ? 0.55 + 0.6 * Math.abs(Math.sin(Math.atan2(dirs[i][1], dirs[i][0]) - Math.PI / 4)) : 1); path.moveTo(P[i][0] + r, P[i][1]); path.arc(P[i][0], P[i][1], r, 0, Math.PI * 2); }
      }
    }
  }
  function strokePath(s, extra, live) {
    const path = new Path2D();
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const acc = (a, b, c, d) => { if (a < x0) x0 = a; if (b < y0) y0 = b; if (c > x1) x1 = c; if (d > y1) y1 = d; };
    if (s.shape) { // shapes stay geometric: an exact polyline with round joins
      const p = s.pts; path.moveTo(p[0], p[1]); for (let i = 3; i < p.length; i += 3) { path.lineTo(p[i], p[i + 1]); } if (s.closed) path.closePath();
      for (let i = 0; i < p.length; i += 3) acc(p[i] - s.w, p[i + 1] - s.w, p[i] + s.w, p[i + 1] + s.w);
      if (s.fill && s.closed && !live) { const f = new Path2D(); f.moveTo(p[0], p[1]); for (let i = 3; i < p.length; i += 3) f.lineTo(p[i], p[i + 1]); f.closePath(); s._fp = f; }
    } else {
      const o = inkOpts(s);
      outlinePath(stabilise(s.pts, o.sl, o.size, extra), o, !live, path, acc);
    }
    if (!live) s._bb = isFinite(x0) ? [x0, y0, x1, y1] : [0, 0, 0, 0];
    return path;
  }
  const PAT = new Map();
  function pencilPattern(ctx, c) {
    if (PAT.has(c)) return PAT.get(c);
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const x = cv.getContext('2d');
    const im = x.createImageData(64, 64), n = parseInt(c.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    for (let i = 0; i < 64 * 64; i++) { const a = Math.random(); im.data[i * 4] = r; im.data[i * 4 + 1] = g; im.data[i * 4 + 2] = b; im.data[i * 4 + 3] = a < 0.18 ? 70 : a < 0.45 ? 170 : 235; }
    x.putImageData(im, 0, 0);
    const p = ctx.createPattern(cv, 'repeat'); PAT.set(c, p); return p;
  }
  function paintInk(ctx, s, path, darkPaper) {
    ctx.save();
    if (s._fp) { ctx.fillStyle = s.fill; ctx.globalAlpha = s.fillA == null ? 1 : s.fillA; ctx.fill(s._fp); ctx.globalAlpha = 1; }
    if (s.tool === 'hl') { ctx.globalAlpha = darkPaper ? 0.45 : 0.42; if (!darkPaper) ctx.globalCompositeOperation = 'multiply'; }
    const style = s.style === 'pencil' && s.tool !== 'hl' ? pencilPattern(ctx, s.c) : s.c;
    if (s.style === 'pencil' && s.tool !== 'hl') ctx.globalAlpha = 0.95;
    if (s.shape) {
      ctx.lineWidth = s.w; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = style;
      if (s.dash) ctx.setLineDash([s.w * 3, s.w * 2.5]);
      ctx.stroke(path);
    } else { ctx.fillStyle = style; ctx.fill(path, 'nonzero'); }
    ctx.restore();
  }
  function drawStroke(ctx, s, darkPaper) { if (!s._p) s._p = strokePath(s); paintInk(ctx, s, s._p, darkPaper); }
  const bbOf = s => { if (s.t === 'ink') { if (!s._bb) s._p = strokePath(s); return s._bb; } return objBB(s); };
  function objBB(o) {
    const w = o.w * (o.k || 1), hh = (o.t === 'text' ? (o.h || 40) : o.h) * (o.k || 1), r = o.rot || 0;
    if (!r) return [o.x, o.y, o.x + w, o.y + hh];
    const cx = o.x + w / 2, cy = o.y + hh / 2, c = Math.abs(Math.cos(r)), sn = Math.abs(Math.sin(r)), ew = (w * c + hh * sn) / 2, eh = (w * sn + hh * c) / 2;
    return [cx - ew, cy - eh, cx + ew, cy + eh];
  }
  function segDist(px, py, x1, y1, x2, y2) { const dx = x2 - x1, dy = y2 - y1, l = dx * dx + dy * dy; let t = l ? ((px - x1) * dx + (py - y1) * dy) / l : 0; t = clamp(t, 0, 1); return Math.hypot(px - x1 - t * dx, py - y1 - t * dy); }
  function strokeDist(s, x, y) { const p = s.pts; let m = Infinity; if (p.length === 3) return Math.hypot(p[0] - x, p[1] - y); for (let i = 0; i < p.length - 3; i += 3) m = Math.min(m, segDist(x, y, p[i], p[i + 1], p[i + 3], p[i + 4])); return m; }
  function inPoly(poly, x, y) { let c = false; for (let i = 0, j = poly.length - 2; i < poly.length; j = i, i += 2) { const xi = poly[i], yi = poly[i + 1], xj = poly[j], yj = poly[j + 1]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; }

  // ---------- shape recognition (hold the pen still at the end of a stroke, or use the shape tool) ----------
  function simplify(pts, tol) { // Douglas-Peucker on [x,y] pairs
    if (pts.length <= 2) return pts.slice();
    let md = 0, mi = 0; const a = pts[0], b = pts[pts.length - 1];
    for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i][0], pts[i][1], a[0], a[1], b[0], b[1]); if (d > md) { md = d; mi = i; } }
    if (md <= tol) return [a, b];
    return simplify(pts.slice(0, mi + 1), tol).slice(0, -1).concat(simplify(pts.slice(mi), tol));
  }
  function ellipsePts(cx, cy, rx, ry, rot) { const out = [], N = 72; for (let i = 0; i <= N; i++) { const a = i / N * Math.PI * 2, x = Math.cos(a) * rx, y = Math.sin(a) * ry; out.push([cx + x * Math.cos(rot || 0) - y * Math.sin(rot || 0), cy + x * Math.sin(rot || 0) + y * Math.cos(rot || 0)]); } return out; }
  function arrowPts(x1, y1, x2, y2, w) { const a = Math.atan2(y2 - y1, x2 - x1), L = Math.max(10, w * 5); return [[x1, y1], [x2, y2], [x2 - L * Math.cos(a - 0.45), y2 - L * Math.sin(a - 0.45)], [x2, y2], [x2 - L * Math.cos(a + 0.45), y2 - L * Math.sin(a + 0.45)]]; }
  function shapeFromBox(kind, x1, y1, x2, y2, w) {
    const l = Math.min(x1, x2), r = Math.max(x1, x2), t = Math.min(y1, y2), b = Math.max(y1, y2);
    if (kind === 'line') return { pts: [[x1, y1], [x2, y2]], closed: false };
    if (kind === 'arrow') return { pts: arrowPts(x1, y1, x2, y2, w), closed: false };
    if (kind === 'rect') return { pts: [[l, t], [r, t], [r, b], [l, b], [l, t]], closed: true };
    if (kind === 'ellipse') return { pts: ellipsePts((l + r) / 2, (t + b) / 2, (r - l) / 2, (b - t) / 2), closed: true };
    if (kind === 'triangle') return { pts: [[(l + r) / 2, t], [r, b], [l, b], [(l + r) / 2, t]], closed: true };
    if (kind === 'diamond') return { pts: [[(l + r) / 2, t], [r, (t + b) / 2], [(l + r) / 2, b], [l, (t + b) / 2], [(l + r) / 2, t]], closed: true };
    if (kind === 'star') { const cx = (l + r) / 2, cy = (t + b) / 2, out = []; for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, k = i % 2 ? 0.42 : 1; out.push([cx + Math.cos(a) * (r - l) / 2 * k, cy + Math.sin(a) * (b - t) / 2 * k]); } return { pts: out, closed: true }; }
    if (kind === 'axes') return { pts: [[l, t], [l, b], [r, b]], closed: false };
    return null;
  }
  function recognise(flat) {
    const pts = []; for (let i = 0; i < flat.length; i += 3) pts.push([flat[i], flat[i + 1]]);
    if (pts.length < 4) return null;
    let len = 0; for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    const a = pts[0], b = pts[pts.length - 1], chord = Math.hypot(b[0] - a[0], b[1] - a[1]);
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const p of pts) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); y0 = Math.min(y0, p[1]); y1 = Math.max(y1, p[1]); }
    const diag = Math.hypot(x1 - x0, y1 - y0);
    if (diag < 8) return null;
    if (chord > len * 0.88) { // a straight line; snap near-horizontal and near-vertical
      let [ex, ey] = b; const ang = Math.atan2(ey - a[1], ex - a[0]), sn = Math.round(ang / (Math.PI / 12)) * Math.PI / 12;
      if (Math.abs(ang - sn) < 0.06) { ex = a[0] + Math.cos(sn) * chord; ey = a[1] + Math.sin(sn) * chord; }
      return { kind: 'line', pts: [a, [ex, ey]], closed: false };
    }
    const closed = chord < Math.max(diag * 0.28, 14);
    if (!closed) {
      const sp = simplify(pts, diag * 0.07);
      if (sp.length === 3) return { kind: 'poly', pts: sp, closed: false };
      return null;
    }
    const ring = pts.concat([pts[0]]), sp = simplify(ring, diag * 0.085);
    let corners = sp.slice(0, -1);
    if (corners.length > 2) { const f = corners[0], l = corners[corners.length - 1]; if (Math.hypot(f[0] - l[0], f[1] - l[1]) < diag * 0.12) corners.pop(); }
    if (corners.length === 3) return { kind: 'triangle', pts: corners.concat([corners[0]]), closed: true };
    if (corners.length === 4) {
      // near-axis-aligned quads become clean rectangles
      const angs = corners.map((p, i) => { const q = corners[(i + 1) % 4]; return Math.atan2(q[1] - p[1], q[0] - p[0]); });
      const axis = angs.every(t => { const m = Math.abs(((t % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2)); return Math.min(m, Math.PI / 2 - m) < 0.22; });
      if (axis) return { kind: 'rect', pts: [[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]], closed: true };
      return { kind: 'poly', pts: corners.concat([corners[0]]), closed: true };
    }
    if (corners.length === 5 || corners.length === 6) {
      // distinct polygon if the edges are straight; otherwise it was a wobbly ellipse
      let err = 0; for (const p of pts) { let m = Infinity; for (let i = 0; i < corners.length; i++) { const u = corners[i], v = corners[(i + 1) % corners.length]; m = Math.min(m, segDist(p[0], p[1], u[0], u[1], v[0], v[1])); } err += m; }
      if (err / pts.length < diag * 0.018) return { kind: 'poly', pts: corners.concat([corners[0]]), closed: true };
    }
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2; let rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
    if (Math.abs(rx - ry) < Math.max(rx, ry) * 0.12) rx = ry = (rx + ry) / 2;
    return { kind: 'ellipse', pts: ellipsePts(cx, cy, rx, ry), closed: true };
  }
  const flatten = (pts, p) => { const out = []; for (const q of pts) out.push(q[0], q[1], p == null ? 0.6 : p); return out; };

  // ---------- library and documents ----------
  let ITEMS = [];
  const DOCS = new Map();
  const FONTS = {
    sans: ['Sans', '"IBM Plex Sans",system-ui,sans-serif'], serif: ['Serif', '"IBM Plex Serif",Georgia,serif'], latex: ['LaTeX (Latin Modern)', '"LM","Latin Modern Roman",serif'],
    mono: ['Mono', '"IBM Plex Mono",ui-monospace,monospace'], hand: ['Handwriting', '"Noteworthy","Bradley Hand","Segoe Print","Comic Sans MS",cursive'],
    round: ['Rounded', 'ui-rounded,"SF Pro Rounded","Nunito",system-ui,sans-serif'], marker: ['Marker', '"Marker Felt","Chalkboard SE","Comic Sans MS",cursive'], system: ['System', '-apple-system,system-ui,sans-serif']
  };
  const strip = o => JSON.parse(JSON.stringify(o, (k, v) => (k[0] === '_' ? undefined : v)));
  const itemOf = id => ITEMS.find(i => i.id === id);
  async function saveItem(it) { it.updated = it.updated || Date.now(); await dbPut('items', strip(it)).catch(e => toast('Couldn’t save: ' + e.message)); }
  async function loadDoc(id) {
    if (DOCS.has(id)) return DOCS.get(id);
    const d = await dbGet('docs', id).catch(() => null);
    if (!d) return null;
    d._u = []; d._r = []; DOCS.set(id, d); return d;
  }
  const saveTimers = new Map();
  function scheduleSave(doc) {
    clearTimeout(saveTimers.get(doc.id));
    saveTimers.set(doc.id, setTimeout(function go() { if (panes.some(p => p.act)) { saveTimers.set(doc.id, setTimeout(go, 400)); return; } saveDocNow(doc); }, 500));
  }
  async function saveDocNow(doc) {
    clearTimeout(saveTimers.get(doc.id)); saveTimers.delete(doc.id);
    try { await dbPut('docs', strip(doc)); } catch (e) { toast('Couldn’t save this note: ' + (e.message || 'storage is full')); return; }
    const it = itemOf(doc.id); if (it) { it.updated = Date.now(); await saveItem(it); }
    scheduleThumb(doc);
  }
  const thumbTimers = new Map();
  function scheduleThumb(doc) { doc._thumbDirty = true; if (!$('#library').hidden) makeThumb(doc); }
  function makeThumb(doc) {
    clearTimeout(thumbTimers.get(doc.id)); doc._thumbDirty = false;
    thumbTimers.set(doc.id, setTimeout(async () => {
      const it = itemOf(doc.id); if (!it || !doc.pages[0]) return;
      try { const c = await renderPage(doc, doc.pages[0], doc.kind === 'board' ? null : 240 / doc.pages[0].w, { thumb: true, maxW: 320 }); it.thumb = c.toDataURL('image/jpeg', 0.72); await saveItem(it); if (!$('#library').hidden) renderLibrary(); } catch (e) { }
    }, 50));
  }
  function flushAll() { for (const d of DOCS.values()) if (saveTimers.has(d.id)) saveDocNow(d); }
  addEventListener('pagehide', flushAll);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAll(); });

  function newPage(doc, over) {
    const ref = doc.pages && doc.pages.length ? doc.pages[doc.pages.length - 1] : null;
    const pg = { id: 'p' + uid(), w: ref ? ref.w : 794, h: ref ? ref.h : 1123, paper: ref ? Object.assign({}, ref.paper) : { type: 'lined', color: '#ffffff' }, items: [] };
    delete pg.paper.bgId;
    return Object.assign(pg, over || {});
  }
  async function createDoc(kind, opt) {
    const id = (kind === 'board' ? 'w' : 'n') + uid(), now = Date.now();
    const it = { id, kind, name: opt.name || (kind === 'board' ? 'Whiteboard' : 'Notebook'), parent: opt.parent || null, created: now, updated: now, cover: opt.cover || COVERS[Math.floor(Math.random() * COVERS.length)], pdf: !!opt.pdf };
    const doc = { id, kind, pages: [] };
    if (kind === 'board') doc.pages = [{ id: 'p' + uid(), infinite: true, w: 0, h: 0, paper: { type: opt.paper || 'dots', color: opt.color || '#fbfbfa' }, items: [] }];
    else if (opt.pages) doc.pages = opt.pages;
    else { const [w, hh] = SIZES[opt.size || 'a4']; doc.pages = [{ id: 'p' + uid(), w, h: hh, paper: { type: opt.paper || 'lined', color: opt.color || '#ffffff' }, items: [] }]; }
    doc._u = []; doc._r = [];
    ITEMS.push(it); DOCS.set(id, doc);
    await dbPut('docs', strip(doc)); await saveItem(it);
    return it;
  }

  // ---------- undo: each change swaps a page's item list (or the page list) for a new one ----------
  function changed(doc) {
    scheduleSave(doc);
    for (const p of panes) if (p.doc === doc) { p.layout(); p.syncObjs(); p.draw(); }
    updUndo();
  }
  function setItems(doc, pg, arr) { doc._u.push({ pg, pid: pg.id, before: pg.items, after: arr }); if (doc._u.length > 200) doc._u.shift(); doc._r = []; pg.items = arr; changed(doc); }
  function setPages(doc, arr) { doc._u.push({ pages: true, before: doc.pages, after: arr }); doc._r = []; doc.pages = arr; changed(doc); for (const p of panes) if (p.doc === doc) p.refreshThumbs(); }
  function undoDoc(doc, dir) {
    const from = dir < 0 ? doc._u : doc._r, to = dir < 0 ? doc._r : doc._u, op = from.pop();
    if (!op) return false;
    if (op.pages) doc.pages = dir < 0 ? op.before : op.after; else (doc.pages.find(x => x.id === op.pid) || op.pg).items = dir < 0 ? op.before : op.after;
    to.push(op);
    for (const p of panes) if (p.doc === doc) { p.clearSel(); if (op.pages) p.refreshThumbs(); }
    changed(doc); return true;
  }
  function updUndo() { const p = active, d = p && p.doc; $('#undoBtn').disabled = !(d && d._u.length); $('#redoBtn').disabled = !(d && d._r.length); }

  // ---------- painting text boxes onto a canvas: the browser lays the text out, we copy it word by word ----------
  function textEl(o) {
    const el = h('div', { class: 'tx' + (o.sticky ? ' sticky' : '') });
    el.innerHTML = o.html || '';
    el.style.width = o.w + 'px';
    el.style.fontFamily = (FONTS[o.font] || FONTS.sans)[1];
    el.style.fontSize = (o.size || 18) + 'px';
    el.style.color = o.c || '#1d1d1f';
    if (o.sticky) el.style.background = o.sticky;
    return el;
  }
  function paintText(ctx, o) {
    const host = $('#measure'), el = textEl(o);
    host.append(el);
    const base = el.getBoundingClientRect(), H = el.offsetHeight, W = el.offsetWidth;
    ctx.save();
    objTransform(ctx, o, W, H);
    if (o.sticky) { ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.shadowBlur = 12; ctx.shadowOffsetY = 4; ctx.fillStyle = o.sticky; ctx.fillRect(0, 0, W, H); ctx.restore(); }
    const rel = r => [r.left - base.left, r.top - base.top, r.width, r.height];
    // table cells, then list markers
    for (const cell of el.querySelectorAll('td,th')) { const cs = getComputedStyle(cell), [x, y, w, hh] = rel(cell.getBoundingClientRect()); if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { ctx.fillStyle = cs.backgroundColor; ctx.fillRect(x, y, w, hh); } ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, hh - 1); }
    const range = document.createRange();
    for (const li of el.querySelectorAll('li')) {
      const cs = getComputedStyle(li), list = li.parentElement, fs = parseFloat(cs.fontSize);
      const fr = (() => { const w = document.createTreeWalker(li, NodeFilter.SHOW_TEXT); let n; while ((n = w.nextNode())) if (n.nodeValue.trim()) { range.selectNodeContents(n); const r = range.getClientRects()[0]; if (r) return r; } return li.getBoundingClientRect(); })();
      const [x, y, , hh] = rel(fr), lx = li.getBoundingClientRect().left - base.left;
      ctx.fillStyle = cs.color; ctx.strokeStyle = cs.color;
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      if (list.classList.contains('check')) { const s = fs * 0.85; ctx.lineWidth = 1.5; ctx.strokeRect(lx - fs * 1.45, y + (hh - s) / 2, s, s); if (li.classList.contains('done')) ctx.fillRect(lx - fs * 1.45 + 3, y + (hh - s) / 2 + 3, s - 6, s - 6); }
      else if (list.tagName === 'OL') { const i = [...list.children].indexOf(li) + 1; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillText(i + '.', lx - fs * 0.35, y + hh / 2); ctx.textAlign = 'left'; }
      else { ctx.beginPath(); ctx.arc(lx - fs * 0.75, y + hh / 2, fs * 0.16, 0, 7); ctx.fill(); }
    }
    const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node;
    while ((node = walk.nextNode())) {
      const txt = node.nodeValue; if (!txt.trim()) continue;
      const par = node.parentElement, cs = getComputedStyle(par);
      ctx.font = cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily;
      let deco = '', bgc = '';
      for (let e = par; e && e !== el.parentElement; e = e.parentElement) { const c = getComputedStyle(e); if (c.textDecorationLine && c.textDecorationLine !== 'none') deco += ' ' + c.textDecorationLine; if (!bgc && e.tagName !== 'TD' && e.tagName !== 'TH' && e !== el && c.backgroundColor && c.backgroundColor !== 'rgba(0, 0, 0, 0)' && c.display === 'inline') bgc = c.backgroundColor; }
      const sup = cs.verticalAlign === 'super' || cs.verticalAlign === 'sub';
      const re = /\S+/g; let m;
      while ((m = re.exec(txt))) {
        range.setStart(node, m.index); range.setEnd(node, m.index + m[0].length);
        const rects = range.getClientRects(); if (!rects.length) continue;
        // a word broken over lines: paint each piece separately
        const parts = rects.length === 1 ? [[m[0], rects[0]]] : (() => { const out = []; let s = m.index; for (let k = m.index + 1; k <= m.index + m[0].length; k++) { range.setStart(node, s); range.setEnd(node, k); if (range.getClientRects().length > 1 || k === m.index + m[0].length) { const end = range.getClientRects().length > 1 ? k - 1 : k; range.setEnd(node, end); out.push([txt.slice(s, end), range.getClientRects()[0]]); s = end; } } return out; })();
        for (const [word, r0] of parts) {
          if (!r0) continue;
          ctx.textBaseline = 'alphabetic'; const [x, y, w, hh] = rel(r0), mt = ctx.measureText(word);
          const fa = mt.fontBoundingBoxAscent || parseFloat(cs.fontSize) * 0.8, fd = mt.fontBoundingBoxDescent || parseFloat(cs.fontSize) * 0.2;
          const bl = y + (hh - (fa + fd)) / 2 + fa;
          if (bgc) { ctx.fillStyle = bgc; ctx.fillRect(x - 1, y, w + 2, hh); }
          ctx.fillStyle = cs.color; ctx.textBaseline = 'alphabetic'; ctx.fillText(word, x, bl);
          if (deco) { ctx.strokeStyle = cs.color; ctx.lineWidth = Math.max(1, parseFloat(cs.fontSize) / 14); const lines = []; if (deco.includes('underline')) lines.push(bl + fd * 0.45); if (deco.includes('line-through')) lines.push(bl - fa * 0.3); for (const ly of lines) { ctx.beginPath(); ctx.moveTo(x, ly); ctx.lineTo(x + w + (sup ? 0 : 0), ly); ctx.stroke(); } }
        }
      }
    }
    for (const hr of el.querySelectorAll('hr')) { const [x, y, w] = rel(hr.getBoundingClientRect()); ctx.strokeStyle = 'rgba(0,0,0,0.3)'; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + w, y); ctx.stroke(); }
    ctx.restore();
    el.remove();
  }
  // objects keep a box (x, y, w, h) scaled by k and turned about its centre by rot
  function pageWords(pg) {
    const out = [], host = $('#measure'), rg = document.createRange();
    for (const o of pg.items) {
      if (o.t !== 'text') continue;
      const el = textEl(o); host.append(el); const B = el.getBoundingClientRect(), k = o.k || 1;
      const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn;
      while ((tn = tw.nextNode())) { const re = /\S+/g; let m; while ((m = re.exec(tn.nodeValue))) { rg.setStart(tn, m.index); rg.setEnd(tn, m.index + m[0].length); const r = rg.getClientRects()[0]; if (!r) continue; const x = o.x + (r.left - B.left) * k, y = o.y + (r.top - B.top) * k; out.push([m[0], x / pg.w, y / pg.h, r.width * k / pg.w, r.height * k / pg.h]); } }
      el.remove();
    }
    return out;
  }
  function objTransform(ctx, o, w, hh) {
    const k = o.k || 1, W = w * k, H = hh * k;
    ctx.translate(o.x + W / 2, o.y + H / 2); if (o.rot) ctx.rotate(o.rot); ctx.translate(-W / 2, -H / 2); ctx.scale(k, k);
  }
  function cssTransform(o, w, hh) { const k = o.k || 1, W = w * k, H = hh * k; return `translate(${W / 2}px,${H / 2}px) rotate(${o.rot || 0}rad) translate(${-W / 2}px,${-H / 2}px) scale(${k})`; }

  function contentBB(pg) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const it of pg.items) { const b = bbOf(it); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); }
    return isFinite(x0) ? [x0, y0, x1, y1] : null;
  }
  // a page (or a whiteboard's contents) as a picture, for thumbnails, export and printing
  async function renderPage(doc, pg, scale, opt) {
    opt = opt || {};
    let ox = 0, oy = 0, W = pg.w, H = pg.h;
    if (pg.infinite) { const b = opt.region || contentBB(pg) || [-400, -300, 400, 300], pad = 40; ox = b[0] - pad; oy = b[1] - pad; W = b[2] - b[0] + pad * 2; H = b[3] - b[1] + pad * 2; }
    if (scale == null) scale = Math.min(2, (opt.maxW || 2400) / W);
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(W * scale)); c.height = Math.max(1, Math.round(H * scale));
    const ctx = c.getContext('2d');
    const P = pg.paper || { color: '#fff' }, dark = isDark(P.color);
    ctx.fillStyle = P.color || '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.setTransform(scale, 0, 0, scale, -ox * scale, -oy * scale);
    if (pg.bg) { const im = await imgLoad(pg.bg); if (im) ctx.drawImage(im, 0, 0, pg.w, pg.h); }
    if (pg.infinite) drawBoardPaper(ctx, P, ox, oy, ox + W, oy + H, scale); else drawPaper(ctx, pg, 0, 0, W, H, scale);
    for (const o of pg.items) {
      if (o.t === 'ink') continue;
      if (o.t === 'text') { if (opt.thumb && scale < 0.4) { ctx.save(); objTransform(ctx, o, o.w, o.h || 40); if (o.sticky) { ctx.fillStyle = o.sticky; ctx.fillRect(0, 0, o.w, o.h || 160); } ctx.fillStyle = 'rgba(40,40,50,0.45)'; const lh = (o.size || 18) * 1.4; for (let y = (o.sticky ? 16 : 4); y < (o.h || 30) - lh * 0.4; y += lh) ctx.fillRect(o.sticky ? 16 : 6, y + lh * 0.3, (o.w - 30) * (0.6 + 0.4 * ((y * 7) % 10) / 10), lh * 0.38); ctx.restore(); } else paintText(ctx, o); continue; }
      const id = o.blob; if (!id) continue;
      const im = await imgLoad(id); if (!im) continue;
      ctx.save(); objTransform(ctx, o, o.w, o.h); ctx.drawImage(im, 0, 0, o.w, o.h); ctx.restore();
    }
    for (const pass of [1, 0]) for (const o of pg.items) if (o.t === 'ink' && (o.tool === 'hl') === !!pass) drawStroke(ctx, o, dark);
    return c;
  }

  // ---------- PDF: each page a JPEG, wrapped in the smallest valid PDF ----------
  function makePDF(pages) {
    const enc = new TextEncoder(), chunks = [], offs = []; let len = 0;
    const push = b => { if (typeof b === 'string') b = enc.encode(b); chunks.push(b); len += b.length; };
    const obj = (n, body) => { offs[n] = len; push(n + ' 0 obj\n'); if (Array.isArray(body)) body.forEach(push); else push(body); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const N = pages.length, kids = [];
    for (let i = 0; i < N; i++) kids.push((3 + i * 3) + ' 0 R');
    obj(1, '<< /Type /Catalog /Pages 2 0 R >>');
    obj(2, '<< /Type /Pages /Kids [' + kids.join(' ') + '] /Count ' + N + ' >>');
    pages.forEach((p, i) => {
      const pn = 3 + i * 3, wpt = (p.w * 0.75).toFixed(2), hpt = (p.h * 0.75).toFixed(2);
      const content = 'q ' + wpt + ' 0 0 ' + hpt + ' 0 0 cm /Im' + i + ' Do Q';
      obj(pn, '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + wpt + ' ' + hpt + '] /Resources << /XObject << /Im' + i + ' ' + (pn + 2) + ' 0 R >> >> /Contents ' + (pn + 1) + ' 0 R >>');
      obj(pn + 1, ['<< /Length ' + content.length + ' >>\nstream\n', content, '\nendstream']);
      obj(pn + 2, ['<< /Type /XObject /Subtype /Image /Width ' + p.pw + ' /Height ' + p.ph + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n', p.jpeg, '\nendstream']);
    });
    const xref = len, total = 3 + N * 3;
    let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let i = 1; i < total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF');
    return new Blob(chunks, { type: 'application/pdf' });
  }
  async function exportPDF(doc, onlyPage) {
    const it = itemOf(doc.id), list = onlyPage ? [onlyPage] : doc.pages, out = [];
    toast('Preparing the PDF…', 60000);
    for (let i = 0; i < list.length; i++) {
      const pg = list[i];
      const c = await renderPage(doc, pg, pg.infinite ? null : 2, { maxW: 3000 });
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.9));
      out.push({ jpeg: new Uint8Array(await blob.arrayBuffer()), pw: c.width, ph: c.height, w: pg.infinite ? c.width / 2 : pg.w, h: pg.infinite ? c.height / 2 : pg.h });
      toast('Preparing the PDF… page ' + (i + 1) + ' of ' + list.length, 60000);
    }
    const pdf = makePDF(out);
    toast('PDF ready: ' + out.length + ' page' + (out.length > 1 ? 's' : '') + ', ' + (pdf.size / 1e6).toFixed(1) + ' MB');
    saveFile(pdf, ((it && it.name) || 'Notes').replace(/[\\/:*?"<>|]+/g, '-') + '.pdf');
  }
  async function saveFile(blob, name) {
    try { const f = new File([blob], name, { type: blob.type }); if (navigator.canShare && navigator.canShare({ files: [f] })) { await navigator.share({ files: [f], title: name }); return; } } catch (e) { if (e && e.name === 'AbortError') return; }
    const a = h('a', { href: URL.createObjectURL(blob), download: name }); document.body.append(a); a.click(); a.remove();
  }
  async function printDoc(doc) {
    toast('Preparing to print…', 30000);
    const box = h('div', { id: 'printOut' });
    for (const pg of doc.pages) { const c = await renderPage(doc, pg, pg.infinite ? null : 2, { maxW: 2400 }); box.append(h('img', { src: c.toDataURL('image/jpeg', 0.9) })); }
    document.body.append(box); toast('Printing…');
    setTimeout(() => { window.print(); setTimeout(() => box.remove(), 1500); }, 300);
  }

  // ---------- PDF import, with pdf.js (loaded on first use) ----------
  let pdfjsP = null;
  function pdfjs() {
    if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
    return pdfjsP || (pdfjsP = new Promise((res, rej) => {
      const s = h('script', { src: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js' });
      s.onload = () => { const L = window.pdfjsLib; if (!L) return rej(new Error('pdf.js didn’t load')); L.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'; res(L); };
      s.onerror = () => { pdfjsP = null; rej(new Error('Couldn’t load the PDF reader. Opening PDFs needs the internet the first time.')); };
      document.head.append(s);
    }));
  }
  // every page becomes a picture background with your ink and notes on top
  async function pdfToPages(file, onProg) {
    const L = await pdfjs(), buf = await file.arrayBuffer();
    const pdfId = await putBlob(new Blob([buf], { type: 'application/pdf' }), 'pdf');
    const pdf = await L.getDocument({ data: new Uint8Array(buf.slice(0)) }).promise;
    const pages = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const page = await pdf.getPage(n), vp1 = page.getViewport({ scale: 1 });
      const w = Math.round(vp1.width * 96 / 72), hh = Math.round(vp1.height * 96 / 72);
      const sc = Math.min(2200 / Math.max(vp1.width, vp1.height), 3.2), vp = page.getViewport({ scale: sc });
      const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await page.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88));
      const bg = await putBlob(blob, 'pg');
      pages.push({ id: 'p' + uid(), w, h: hh, paper: { type: 'blank', color: '#ffffff' }, bg, pdf: { id: pdfId, n }, items: [] });
      if (onProg) onProg(n, pdf.numPages);
      c.width = c.height = 0;
    }
    return pages;
  }

  // ---------- panes: each shows one notebook, whiteboard or Psi Phi app; several sit side by side ----------
  const panes = [];
  let active = null;
  const ICON = {
    close: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>',
    thumbs: '<svg viewBox="0 0 24 24"><rect x="4" y="3" width="7" height="8" rx="1"/><rect x="13" y="3" width="7" height="8" rx="1"/><rect x="4" y="13" width="7" height="8" rx="1"/><rect x="13" y="13" width="7" height="8" rx="1"/></svg>',
    swap: '<svg viewBox="0 0 24 24"><path d="M7 7h13l-4-4M17 17H4l4 4"/></svg>'
  };
  const nowMs = () => performance.now();
  class Pane {
    constructor() {
      this.el = h('section', { class: 'pane', 'aria-label': 'Note' });
      this.titleEl = h('span', { class: 'pt', title: 'Switch document', onclick: e => switchMenu(this, e.currentTarget) });
      this.pgEl = h('span', { class: 'pg' });
      this.head = h('div', { class: 'phead' }, h('button', { class: 'tb', type: 'button', title: 'Pages', 'aria-label': 'Pages', html: ICON.thumbs, onclick: () => { setActive(this); this.toggleThumbs(); } }), this.titleEl, this.pgEl,
        h('button', { class: 'tb', type: 'button', title: 'Swap with the next pane', 'aria-label': 'Swap panes', html: ICON.swap, onclick: () => swapPane(this) }),
        h('button', { class: 'tb pclose', type: 'button', title: 'Close this pane', 'aria-label': 'Close pane', html: ICON.close, onclick: () => closePane(this) }));
      this.vp = h('div', { class: 'vp' });
      this.bg = h('canvas'); this.world = h('div', { class: 'world' }); this.ink = h('canvas'); this.live = h('canvas'); this.ui = h('div', { class: 'ui' });
      this.zoomBtn = h('button', { class: 'fab zoomlab', type: 'button', title: 'Fit to the pane', onclick: () => { this.fit(); this.draw(); } }, '100%');
      this.addPgBtn = h('button', { class: 'fab', type: 'button', onclick: () => addPageAfter(this, this.doc.pages.length - 1) }, '＋ Page');
      this.foot = h('div', { class: 'pfoot' }, this.addPgBtn, this.zoomBtn);
      try { this.live.getContext('2d', { desynchronized: true }); } catch (e) { }
      this.vp.append(this.bg, this.world, this.ink, this.live, this.ui, this.foot);
      this.el.append(this.head, this.vp);
      this.el.addEventListener('pointerdown', () => setActive(this), true);
      this.view = { x: 0, y: 0, z: 1 }; this.offs = []; this.objEls = new Map(); this.pageEls = new Map();
      this.ptrs = new Map(); this.act = null; this.sel = null; this.editing = null; this.hide = null; this.hires = new Map();
      this.flex = 1;
      this.bindInput();
      new ResizeObserver(() => {
        if (!this.doc || !this.W) return;
        if (this.needFit) { this.needFit = false; this.fit(); }
        else if (this.autoFit && this.doc.kind !== 'board' && this.lastW && Math.abs(this.lastW - this.W) > 2) { const cp = this.currentPage(); this.fit(); this.layout(); this.gotoPage(cp); }
        this.lastW = this.W; this.clampView(); this.draw();
      }).observe(this.vp);
    }
    get W() { return this.vp.clientWidth; } get H() { return this.vp.clientHeight; }
    open(doc) {
      this.endEdit(); this.clearSel();
      if (this.frame) { this.frame.remove(); this.frame = null; this.vp.hidden = false; }
      this.kind = 'doc'; this.doc = doc; this.item = itemOf(doc.id); this.app = null;
      for (const el of this.pageEls.values()) el.remove();
      this.pageEls.clear(); this.objEls.clear(); this.hires.clear();
      this.el.classList.toggle('board', doc.kind === 'board');
      this.addPgBtn.hidden = doc.kind === 'board';
      this.layout();
      if (doc.view && doc.kind === 'board') Object.assign(this.view, doc.view); else if (this.W) this.fit(); else this.needFit = true;
      requestAnimationFrame(() => { if (this.doc === doc && !this.W) return; if (this.doc === doc && doc.kind !== 'board') { if (doc.lastPage) this.gotoPage(Math.min(doc.lastPage, doc.pages.length - 1), true); } this.draw(); });
      this.title(); this.syncObjs(); this.draw();
      if (this.thumbsEl) this.refreshThumbs();
    }
    openApp(src, name) {
      this.endEdit(); this.clearSel();
      this.kind = 'app'; this.doc = null; this.item = null; this.app = { src, name };
      if (this.thumbsEl) { this.thumbsEl.remove(); this.thumbsEl = null; }
      if (this.frame) this.frame.remove();
      this.vp.hidden = true;
      this.frame = h('iframe', { src, title: name, allow: 'camera; fullscreen; clipboard-read; clipboard-write; gamepad' });
      this.el.append(this.frame);
      this.title();
    }
    title() {
      const t = this.kind === 'app' ? this.app.name : (this.item ? this.item.name : 'Untitled');
      this.titleEl.textContent = t; this.pgEl.textContent = '';
      if (active === this) { $('#docTitle').value = t; $('#docTitle').disabled = this.kind === 'app'; }
      renderPaneTabs();
    }
    // ----- layout of pages in world space -----
    layout() {
      const d = this.doc; if (!d) return;
      this.offs = [];
      if (d.kind === 'board') { this.offs.push({ x: 0, y: 0 }); return; }
      let a = 0; const gap = 30, hz = S.scroll === 'h';
      for (const pg of d.pages) { this.offs.push(hz ? { x: a, y: -pg.h / 2 } : { x: -pg.w / 2, y: a }); a += (hz ? pg.w : pg.h) + gap; }
      this.extent = a - gap;
    }
    fit() {
      const d = this.doc; if (!d || !this.W) return;
      if (d.kind === 'board') { const b = contentBB(d.pages[0]); if (b) { const z = clamp(Math.min(this.W / (b[2] - b[0] + 160), this.H / (b[3] - b[1] + 160)), 0.1, 1.5); this.view = { z, x: this.W / 2 - (b[0] + b[2]) / 2 * z, y: this.H / 2 - (b[1] + b[3]) / 2 * z }; } else this.view = { x: this.W / 2, y: this.H / 2, z: 1 }; return; }
      this.autoFit = true;
      const maxW = Math.max(...d.pages.map(p => p.w)), maxH = Math.max(...d.pages.map(p => p.h));
      if (S.scroll === 'h') { const z = clamp((this.H - 40) / maxH, 0.15, 2); this.view = { z, x: 20, y: this.H / 2 }; }
      else { const z = clamp(Math.min((this.W - 32) / maxW, 1.6), 0.15, 3); this.view = { z, x: this.W / 2, y: 16 }; }
    }
    clampView() {
      const d = this.doc; if (!d || d.kind === 'board') return;
      const v = this.view, hz = S.scroll === 'h', maxW = Math.max(...d.pages.map(p => p.w)) * v.z, maxH = Math.max(...d.pages.map(p => p.h)) * v.z;
      if (!hz) {
        if (maxW <= this.W) v.x = this.W / 2; else v.x = clamp(v.x, this.W - maxW / 2 - 20, maxW / 2 + 20);
        v.y = clamp(v.y, this.H * 0.6 - this.extent * v.z, this.H * 0.4);
      } else {
        if (maxH <= this.H) v.y = this.H / 2; else v.y = clamp(v.y, this.H - maxH / 2 - 20, maxH / 2 + 20);
        v.x = clamp(v.x, this.W * 0.6 - this.extent * v.z, this.W * 0.4);
      }
    }
    toWorld(sx, sy) { const v = this.view; return [(sx - v.x) / v.z, (sy - v.y) / v.z]; }
    // which page a screen point is on (with page-local coordinates)
    pageAt(sx, sy, loose) {
      const d = this.doc; if (!d) return null;
      const [wx, wy] = this.toWorld(sx, sy);
      if (d.kind === 'board') return { pg: d.pages[0], i: 0, x: wx, y: wy };
      let best = null, bd = Infinity;
      d.pages.forEach((pg, i) => {
        const o = this.offs[i], lx = wx - o.x, ly = wy - o.y;
        if (lx >= 0 && ly >= 0 && lx <= pg.w && ly <= pg.h) { best = { pg, i, x: lx, y: ly }; bd = 0; }
        else if (loose) { const dd = Math.hypot(Math.max(0, -lx, lx - pg.w), Math.max(0, -ly, ly - pg.h)); if (dd < bd) { bd = dd; best = { pg, i, x: clamp(lx, 0, pg.w), y: clamp(ly, 0, pg.h) }; } }
      });
      return best;
    }
    local(i, sx, sy) { const [wx, wy] = this.toWorld(sx, sy), o = this.offs[i]; return [wx - o.x, wy - o.y]; }
    visible() {
      const d = this.doc, v = this.view, out = []; if (!d) return out;
      if (d.kind === 'board') return [0];
      const [x0, y0] = this.toWorld(0, 0), [x1, y1] = this.toWorld(this.W, this.H);
      d.pages.forEach((pg, i) => { const o = this.offs[i]; if (o.x < x1 && o.x + pg.w > x0 && o.y < y1 && o.y + pg.h > y0) out.push(i); });
      return out;
    }
    currentPage() {
      const d = this.doc; if (!d || d.kind === 'board') return 0;
      const [cx, cy] = this.toWorld(this.W / 2, this.H / 2); let best = 0, bd = Infinity;
      d.pages.forEach((pg, i) => { const o = this.offs[i], dd = S.scroll === 'h' ? Math.abs(cx - (o.x + pg.w / 2)) : Math.abs(cy - (o.y + pg.h / 2)); if (dd < bd) { bd = dd; best = i; } });
      return best;
    }
    gotoPage(i, instant) {
      const d = this.doc; if (!d || d.kind === 'board') return;
      const o = this.offs[i]; if (!o) return;
      if (S.scroll === 'h') this.view.x = 20 - o.x * this.view.z; else this.view.y = 16 - o.y * this.view.z;
      this.clampView(); this.draw();
    }
    // ----- drawing -----
    draw() { if (this.raf) return; this.raf = requestAnimationFrame(() => { this.raf = 0; this._draw(); }); }
    liveSoon() { if (this.lraf) return; this.lraf = requestAnimationFrame(() => { this.lraf = 0; this.drawLive(); }); }
    sizeCanvas(c) { const r = DPR(), w = Math.round(this.W * r), hh = Math.round(this.H * r); if (c.width !== w || c.height !== hh) { c.width = w; c.height = hh; c.style.width = this.W + 'px'; c.style.height = this.H + 'px'; } }
    _draw() {
      const d = this.doc; if (!d || this.kind !== 'doc' || !this.W) return;
      const r = DPR(), v = this.view;
      for (const c of [this.bg, this.ink, this.live]) this.sizeCanvas(c);
      this.world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
      const vis = this.visible(), vkey = vis.join(',');
      if (vkey !== this.vkey) { this.vkey = vkey; this.syncObjs(); }
      // paper
      const b = this.bg.getContext('2d'); b.setTransform(1, 0, 0, 1, 0, 0); b.clearRect(0, 0, this.bg.width, this.bg.height);
      const [wx0, wy0] = this.toWorld(0, 0), [wx1, wy1] = this.toWorld(this.W, this.H);
      if (d.kind === 'board') {
        const P = d.pages[0].paper; b.fillStyle = P.color; b.fillRect(0, 0, this.bg.width, this.bg.height);
        b.setTransform(r * v.z, 0, 0, r * v.z, r * v.x, r * v.y); drawBoardPaper(b, P, wx0, wy0, wx1, wy1, v.z);
      } else for (const i of vis) {
        const pg = d.pages[i], o = this.offs[i];
        b.setTransform(r * v.z, 0, 0, r * v.z, r * (v.x + o.x * v.z), r * (v.y + o.y * v.z));
        b.save(); b.shadowColor = 'rgba(0,0,0,0.35)'; b.shadowBlur = 10 * r; b.shadowOffsetY = 2 * r; b.fillStyle = pg.paper.color || '#fff'; b.fillRect(0, 0, pg.w, pg.h); b.restore();
        if (pg.bg) { const hi = this.hires.get(pg.id), im = hi && hi.z >= v.z * r * 0.9 ? hi.c : imgNow(pg.bg); if (im) b.drawImage(im, 0, 0, pg.w, pg.h); if (pg.pdf && im && (im.naturalWidth || im.width) / pg.w < v.z * r * 0.85) this.wantHires(pg); }
        b.save(); b.beginPath(); b.rect(0, 0, pg.w, pg.h); b.clip(); drawPaper(b, pg, wx0 - o.x, wy0 - o.y, wx1 - o.x, wy1 - o.y, v.z); b.restore();
      }
      // ink
      const k = this.ink.getContext('2d'); k.setTransform(1, 0, 0, 1, 0, 0); k.clearRect(0, 0, this.ink.width, this.ink.height);
      for (const i of vis) {
        const pg = d.pages[i], o = this.offs[i], dark = isDark(pg.paper.color);
        k.setTransform(r * v.z, 0, 0, r * v.z, r * (v.x + o.x * v.z), r * (v.y + o.y * v.z));
        k.save(); if (!pg.infinite) { k.beginPath(); k.rect(0, 0, pg.w, pg.h); k.clip(); }
        const lx0 = wx0 - o.x, ly0 = wy0 - o.y, lx1 = wx1 - o.x, ly1 = wy1 - o.y;
        for (const pass of [1, 0]) for (const s of pg.items) {
          if (s.t !== 'ink' || (s.tool === 'hl') !== !!pass || (this.hide && this.hide.has(s.id))) continue;
          const bb = bbOf(s); if (bb[2] < lx0 || bb[0] > lx1 || bb[3] < ly0 || bb[1] > ly1) continue;
          drawStroke(k, s, dark);
        }
        k.restore();
      }
      this.drawLive();
      this.drawUI();
      this.zoomBtn.textContent = Math.round(v.z * 100) + '%';
      if (d.kind !== 'board') { const cp = this.currentPage(); this.pgEl.textContent = (cp + 1) + ' / ' + d.pages.length; if (cp !== d.lastPage) { d.lastPage = cp; if (this.thumbsEl) this.markThumb(); } }
      else { clearTimeout(this.vt); this.vt = setTimeout(() => { d.view = Object.assign({}, this.view); scheduleSave(d); }, 800); }
    }
    wantHires(pg) {
      if (this.hiT) return;
      this.hiT = setTimeout(async () => {
        this.hiT = 0;
        try {
          const L = await pdfjs(), z = this.view.z * DPR(), key = pg.pdf.id;
          if (!this.pdfDocs) this.pdfDocs = new Map();
          if (!this.pdfDocs.has(key)) { const bl = await blobOf(key); if (!bl) return; this.pdfDocs.set(key, await L.getDocument({ data: new Uint8Array(await bl.arrayBuffer()) }).promise); }
          const page = await this.pdfDocs.get(key).getPage(pg.pdf.n), vp1 = page.getViewport({ scale: 1 });
          const sc = Math.min(z * pg.w / vp1.width, 4096 / Math.max(vp1.width, vp1.height)), vp = page.getViewport({ scale: sc });
          const c = document.createElement('canvas'); c.width = Math.round(vp.width); c.height = Math.round(vp.height);
          const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await page.render({ canvasContext: ctx, viewport: vp }).promise;
          const old = this.hires.get(pg.id); if (old) old.c.width = 0;
          this.hires.set(pg.id, { c, z: c.width / pg.w }); if (this.hires.size > 3) { const [k0, v0] = this.hires.entries().next().value; v0.c.width = 0; this.hires.delete(k0); }
          this.draw();
        } catch (e) { }
      }, 350);
    }
    drawLive() {
      const c = this.live, x = c.getContext('2d'), r = DPR(), v = this.view;
      x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, c.width, c.height);
      const a = this.act, place = i => { const o = this.offs[i]; x.setTransform(r * v.z, 0, 0, r * v.z, r * (v.x + o.x * v.z), r * (v.y + o.y * v.z)); };
      if (this.sel && this.selT && this.doc) { // transformed preview of the selected ink
        const pg = this.doc.pages[this.sel.i]; place(this.sel.i); const M = this.selM();
        x.transform(M[0], M[1], M[2], M[3], M[4], M[5]);
        for (const s of pg.items) if (s.t === 'ink' && this.sel.ids.has(s.id)) drawStroke(x, s, isDark(pg.paper.color));
      }
      if (!a) return;
      if (a.kind === 'stroke' || a.kind === 'shape') {
        place(a.i); if (!a.pg.infinite) { x.beginPath(); x.rect(0, 0, a.pg.w, a.pg.h); x.clip(); }
        const st = a.s, dark = isDark(a.pg.paper.color);
        if (a.kind === 'stroke' && !a.snapped && !st.shape) {
          // long strokes: older stretches are frozen, so each frame only rebuilds the recent tail
          const n = st.pts.length / 3; a.frozen = a.frozen || []; a.fz = a.fz || 0;
          if (n - a.fz > 360) { const end = n - 120; a.frozen.push(strokePath(Object.assign({}, st, { pts: st.pts.slice(Math.max(0, a.fz - 1) * 3, end * 3), _noTs: a.fz > 0 }), null, true)); a.fz = end; }
          for (const fp of a.frozen) paintInk(x, st, fp, dark);
          if (st.pts.length) paintInk(x, st, strokePath(a.fz ? Object.assign({}, st, { pts: st.pts.slice((a.fz - 1) * 3), _noTs: true }) : st, a.pred, true), dark);
        } else if (st.pts.length) paintInk(x, st, strokePath(st, null, true), dark);
      }
      else if (a.kind === 'lasso') {
        place(a.i); x.lineWidth = 1.5 / v.z; x.setLineDash([6 / v.z, 5 / v.z]); x.strokeStyle = '#2b8fd6'; x.fillStyle = 'rgba(43,143,214,0.08)';
        x.beginPath(); if (S.lasso.mode === 'rect') { const [x0, y0] = a.p0, [x1, y1] = a.p1 || a.p0; x.rect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0)); } else { x.moveTo(a.poly[0], a.poly[1]); for (let i = 2; i < a.poly.length; i += 2) x.lineTo(a.poly[i], a.poly[i + 1]); x.closePath(); }
        x.fill(); x.stroke();
      } else if (a.kind === 'erase' && a.cur) {
        place(a.i); x.lineWidth = 1.2 / v.z; x.strokeStyle = 'rgba(90,90,100,0.9)'; x.fillStyle = 'rgba(255,255,255,0.35)';
        x.beginPath(); x.arc(a.cur[0], a.cur[1], a.r, 0, 7); x.fill(); x.stroke();
      } else if (a.kind === 'textbox' && a.p1) {
        place(a.i); x.lineWidth = 1.5 / v.z; x.setLineDash([5 / v.z, 4 / v.z]); x.strokeStyle = '#2b8fd6'; x.strokeRect(a.p0[0], a.p0[1], a.p1[0] - a.p0[0], Math.max(30, a.p1[1] - a.p0[1]));
      }
    }
    // ----- DOM objects: pictures, figures and text live as elements in a transformed layer, under the ink -----
    syncObjs() {
      const d = this.doc; if (!d) return;
      const vis = new Set(this.visible());
      if (d.kind !== 'board') for (const i of [...vis]) { vis.add(i - 1); vis.add(i + 1); }
      const keepPages = new Set(), keepObjs = new Set();
      d.pages.forEach((pg, i) => {
        if (!vis.has(i)) return;
        keepPages.add(pg.id);
        let pe = this.pageEls.get(pg.id);
        if (!pe) { pe = h('div', { class: 'page' + (pg.infinite ? '' : ' clip') }); this.pageEls.set(pg.id, pe); this.world.append(pe); }
        const o = this.offs[i]; pe.style.left = o.x + 'px'; pe.style.top = o.y + 'px'; pe.style.width = (pg.w || 0) + 'px'; pe.style.height = (pg.h || 0) + 'px';
        pe.classList.toggle('dark', isDark(pg.paper.color));
        let prev = null;
        for (const it of pg.items) {
          if (it.t === 'ink') continue;
          keepObjs.add(it.id);
          let el = this.objEls.get(it.id);
          if (this.editing && this.editing.id === it.id) { el = this.editing.el; }
          else if (!el || el._it !== it) { const nel = this.makeObjEl(it); if (el) el.replaceWith(nel); el = nel; this.objEls.set(it.id, el); }
          if (el.parentElement !== pe || el.previousElementSibling !== prev) { if (prev) prev.after(el); else pe.prepend(el); }
          prev = el;
          if (it.t === 'text' && !(this.editing && this.editing.id === it.id)) { const hh = el.offsetHeight; if (hh && Math.abs(hh - (it.h || 0)) > 1) it.h = hh; }
        }
      });
      for (const [id, pe] of this.pageEls) if (!keepPages.has(id)) { pe.remove(); this.pageEls.delete(id); }
      for (const [id, el] of this.objEls) if (!keepObjs.has(id) || !el.isConnected) { if (!(this.editing && this.editing.id === id)) { el.remove(); this.objEls.delete(id); } }
    }
    makeObjEl(it) {
      let el;
      if (it.t === 'text') { el = textEl(it); el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.transform = cssTransform(it, it.w, it.h || 40); el.style.transformOrigin = '0 0'; }
      else {
        el = h('div', { class: 'obj' + (it.t === 'fig' ? ' fig' : '') }, h('img', { alt: it.name || '', style: it.pixel ? { imageRendering: 'pixelated' } : null }));
        blobURL(it.blob).then(u => { if (u) el.firstChild.src = u; });
        el.style.left = it.x + 'px'; el.style.top = it.y + 'px'; el.style.width = it.w + 'px'; el.style.height = it.h + 'px';
        el.style.transformOrigin = '0 0'; el.style.transform = cssTransform(it, it.w, it.h);
        if (it.video || (it.frames && it.frames.length > 1)) { const b = h('button', { class: 'playfig', type: 'button', 'aria-label': 'Play' }, '▶'); b.addEventListener('pointerdown', e => e.stopPropagation()); b.addEventListener('click', e => { e.stopPropagation(); this.playObj(it, el); }); el.append(b); }
        if (it.t === 'fig') el.append(h('span', { class: 'badge' }, it.video ? 'Ψ video' : 'Ψ'));
      }
      el._it = it; el.dataset.id = it.id;
      return el;
    }
    async playObj(it, el) {
      const old = el.querySelector('video'); if (old) { old.remove(); el.querySelector('img').hidden = false; return; }
      const btn = el.querySelector('.playfig');
      if (it.video) {
        const u = await blobURL(it.video); if (!u) return toast('The video for this figure isn’t on this device.');
        const v = h('video', { src: u, playsinline: true, autoplay: true, controls: true });
        v.addEventListener('pointerdown', e => e.stopPropagation());
        v.addEventListener('ended', () => { v.remove(); el.querySelector('img').hidden = false; if (btn) btn.hidden = false; });
        el.querySelector('img').hidden = true; if (btn) btn.hidden = true; el.prepend(v); v.play().catch(() => { });
      } else if (it.frames) {
        const urls = await Promise.all(it.frames.map(blobURL)), img = el.querySelector('img');
        if (el._anim) { clearInterval(el._anim); el._anim = 0; img.src = urls[0]; btn.textContent = '▶'; return; }
        let f = 0; btn.textContent = '❚❚';
        el._anim = setInterval(() => { f = (f + 1) % urls.length; img.src = urls[f]; if (!el.isConnected) clearInterval(el._anim); }, 1000 / (it.fps || 12));
      }
    }
    // ----- selection -----
    clearSel() { if (!this.sel) return; this.sel = null; this.selT = null; this.hide = null; this.ui.textContent = ''; this.draw(); }
    select(i, ids) {
      this.endEdit();
      if (!ids.length) return this.clearSel();
      this.sel = { i, ids: new Set(ids) }; this.selT = null; this.draw();
    }
    selItems() { if (!this.sel || !this.doc) return []; const pg = this.doc.pages[this.sel.i]; return pg ? pg.items.filter(x => this.sel.ids.has(x.id)) : []; }
    selBB() { let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity; for (const it of this.selItems()) { const b = bbOf(it); x0 = Math.min(x0, b[0]); y0 = Math.min(y0, b[1]); x1 = Math.max(x1, b[2]); y1 = Math.max(y1, b[3]); } return isFinite(x0) ? [x0, y0, x1, y1] : null; }
    selM() { const T = this.selT; if (!T) return [1, 0, 0, 1, 0, 0]; const c = Math.cos(T.r) * T.s, s = Math.sin(T.r) * T.s; return [c, s, -s, c, T.ox + T.dx - (c * T.ox - s * T.oy), T.oy + T.dy - (s * T.ox + c * T.oy)]; }
    drawUI() {
      const ui = this.ui; ui.textContent = '';
      if (!this.sel || !this.doc) return;
      const items = this.selItems(); if (!items.length) { this.sel = null; return; }
      const bb = this.selBB(), o = this.offs[this.sel.i], v = this.view, M = this.selM();
      const corners = [[bb[0], bb[1]], [bb[2], bb[1]], [bb[2], bb[3]], [bb[0], bb[3]]].map(([x, y]) => { const X = M[0] * x + M[2] * y + M[4], Y = M[1] * x + M[3] * y + M[5]; return [v.x + (o.x + X) * v.z, v.y + (o.y + Y) * v.z]; });
      const xs = corners.map(c => c[0]), ys = corners.map(c => c[1]);
      const L = Math.min(...xs), T = Math.min(...ys), R = Math.max(...xs), B = Math.max(...ys);
      ui.append(h('div', { class: 'selbox', style: { left: L - 4 + 'px', top: T - 4 + 'px', width: R - L + 8 + 'px', height: B - T + 8 + 'px' } }));
      // live element previews for objects
      for (const it of items) if (it.t !== 'ink') { const el = this.objEls.get(it.id); if (el) el.style.transform = this.selT ? `translate(${-it.x}px,${-it.y}px) matrix(${M.join(',')}) translate(${it.x}px,${it.y}px) ${cssTransform(it, it.w, it.t === 'text' ? it.h || 40 : it.h)}` : cssTransform(it, it.w, it.t === 'text' ? it.h || 40 : it.h); }
      if (this.selT && this.selT.dragging) return;
      const hd = (x, y, mode, cls) => { const e = h('div', { class: 'hd ' + (cls || ''), style: { left: x + 'px', top: y + 'px' } }); e.addEventListener('pointerdown', ev => this.handleDown(ev, mode)); ui.append(e); };
      hd(L - 4, T - 4, 'nw'); hd(R + 4, T - 4, 'ne'); hd(R + 4, B + 4, 'se'); hd(L - 4, B + 4, 'sw');
      hd((L + R) / 2, T - 30, 'rot', 'rot');
      if (items.length === 1 && items[0].t === 'text') hd(R + 4, (T + B) / 2, 'width', 'wd');
      this.selBar(items, (L + R) / 2, T - 96 < 6 ? B + 16 : T - 96);
    }
    selBar(items, cx, y) {
      const one = items.length === 1 ? items[0] : null, B = (label, fn, title) => h('button', { type: 'button', title: title || label, onclick: e => { e.stopPropagation(); fn(e); } }, label);
      const bar = h('div', { class: 'selbar' });
      bar.addEventListener('pointerdown', e => e.stopPropagation());
      if (one && one.t === 'fig') bar.append(B('✎ Edit figure', () => editFigure(this, one)));
      if (one && one.t === 'text') bar.append(B('✎ Edit', () => this.startEdit(this.doc.pages[this.sel.i], one)));
      if (one && one.link) bar.append(B('↗ Open beside', () => openLinked(one.link)));
      if (one && (one.video || one.frames)) bar.append(B('▶', () => { const el = this.objEls.get(one.id); if (el) this.playObj(one, el); }, 'Play'));
      bar.append(B('Copy', () => copySel(this)), B('Cut', () => { copySel(this); deleteSel(this); }), B('Duplicate', () => duplicateSel(this)));
      if (items.some(x => x.t === 'ink' || x.t === 'text')) {
        const sws = h('span', { class: 'sws' });
        for (const c of S.swatches.slice(0, 6)) { const i = h('i', { style: { background: c }, title: 'Colour' }); i.addEventListener('click', e => { e.stopPropagation(); recolourSel(this, c); }); sws.append(i); }
        bar.append(sws);
      }
      bar.append(B('⇡', () => orderSel(this, 1), 'Bring to front'), B('⇣', () => orderSel(this, -1), 'Send to back'), B('🗑', () => deleteSel(this), 'Delete'));
      bar.style.left = clamp(cx, 160, Math.max(160, this.W - 160)) + 'px'; bar.style.top = clamp(y, 6, this.H - 50) + 'px';
      this.ui.append(bar);
    }
    handleDown(e, mode) {
      e.stopPropagation(); e.preventDefault();
      const r = this.vp.getBoundingClientRect(), bb = this.selBB(), o = this.offs[this.sel.i];
      const P = [(bb[0] + bb[2]) / 2, (bb[1] + bb[3]) / 2];
      const opp = { nw: [bb[2], bb[3]], ne: [bb[0], bb[3]], se: [bb[0], bb[1]], sw: [bb[2], bb[1]] }[mode];
      const origin = mode === 'rot' ? P : mode === 'width' ? [bb[0], bb[1]] : opp;
      const start = this.local(this.sel.i, e.clientX - r.left, e.clientY - r.top);
      this.selT = { dx: 0, dy: 0, s: 1, r: 0, ox: origin[0], oy: origin[1], dragging: true, mode, wd: 0 };
      this.hide = new Set(this.sel.ids);
      const d0 = Math.hypot(start[0] - origin[0], start[1] - origin[1]) || 1, a0 = Math.atan2(start[1] - origin[1], start[0] - origin[0]);
      const move = ev => {
        const p = this.local(this.sel.i, ev.clientX - r.left, ev.clientY - r.top), T = this.selT;
        if (mode === 'rot') { let a = Math.atan2(p[1] - origin[1], p[0] - origin[0]) - a0; const sn = Math.round(a / (Math.PI / 12)) * Math.PI / 12; if (Math.abs(a - sn) < 0.05) a = sn; T.r = a; }
        else if (mode === 'width') { T.wd = p[0] - start[0]; }
        else T.s = clamp(Math.hypot(p[0] - origin[0], p[1] - origin[1]) / d0, 0.05, 40);
        if (mode === 'width') this.previewWidth(T.wd); else this.draw();
      };
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up); removeEventListener('pointercancel', up); this.applyXform(); };
      addEventListener('pointermove', move); addEventListener('pointerup', up); addEventListener('pointercancel', up);
      this.draw();
    }
    previewWidth(dw) { const it = this.selItems()[0], el = this.objEls.get(it.id); if (el) el.style.width = Math.max(60, it.w + dw / (it.k || 1)) + 'px'; this.drawUI(); }
    applyXform() {
      const T = this.selT; if (!T) return;
      const pg = this.doc.pages[this.sel.i], M = this.selM();
      const mp = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
      const noop = T.mode === 'width' ? Math.abs(T.wd) < 0.5 : Math.abs(T.dx) + Math.abs(T.dy) < 0.01 && Math.abs(T.s - 1) < 1e-4 && Math.abs(T.r) < 1e-4;
      this.selT = null; this.hide = null;
      if (noop) { this.syncObjs(); this.draw(); return; }
      const arr = pg.items.map(it => {
        if (!this.sel.ids.has(it.id)) return it;
        const n = Object.assign({}, it); delete n._p; delete n._bb; delete n._fp;
        if (T.mode === 'width') { n.w = Math.max(60, it.w + T.wd / (it.k || 1)); return n; }
        if (it.t === 'ink') { const p = it.pts, q = new Array(p.length); for (let i = 0; i < p.length; i += 3) { const [x, y] = mp(p[i], p[i + 1]); q[i] = Math.round(x * 100) / 100; q[i + 1] = Math.round(y * 100) / 100; q[i + 2] = p[i + 2]; } n.pts = q; n.w = it.w * T.s; return n; }
        const k = it.k || 1, hh = it.t === 'text' ? (it.h || 40) : it.h, W = it.w * k, H = hh * k, [cx, cy] = mp(it.x + W / 2, it.y + H / 2);
        if (it.t === 'text') { n.k = k * T.s; } else { n.w = it.w * T.s; n.h = it.h * T.s; }
        const W2 = (it.t === 'text' ? it.w * n.k : n.w), H2 = (it.t === 'text' ? hh * n.k : n.h);
        n.x = cx - W2 / 2; n.y = cy - H2 / 2; n.rot = (it.rot || 0) + T.r; if (Math.abs(n.rot) < 1e-4) delete n.rot;
        return n;
      });
      setItems(this.doc, pg, arr);
    }
    // ----- text editing -----
    startEdit(pg, it, isNew, before) {
      this.endEdit(); this.clearSel();
      const i = this.doc.pages.indexOf(pg); if (i < 0) return;
      this.syncObjs();
      let el = this.objEls.get(it.id);
      if (!el) { this.gotoPage(i); this.syncObjs(); el = this.objEls.get(it.id); if (!el) return; }
      el.contentEditable = 'true'; el.classList.add('editing'); el.spellcheck = true;
      this.editing = { pg, id: it.id, el, it, isNew, before };
      el.addEventListener('input', () => { this.draw(); });
      el.focus();
      const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r);
      renderOpts();
    }
    endEdit() {
      const E = this.editing; if (!E) return;
      this.editing = null;
      const el = E.el; el.contentEditable = 'false'; el.classList.remove('editing');
      let html = el.innerHTML.replace(/<br>$/, '');
      const empty = !el.textContent.trim() && !el.querySelector('img,table,hr,li');
      const pg = E.pg, cur = pg.items.find(x => x.id === E.id);
      if (!cur) { renderOpts(); return; }
      if (empty) { if (E.isNew) { pg.items = E.before; this.objEls.delete(E.id); el.remove(); changed(this.doc); } else setItems(this.doc, pg, pg.items.filter(x => x.id !== E.id)); renderOpts(); return; }
      if (html === E.it.html && !E.isNew) { renderOpts(); return; }
      const n = Object.assign({}, cur, { html, h: el.offsetHeight });
      el._it = n; this.objEls.set(n.id, el);
      const arr = pg.items.map(x => x.id === E.id ? n : x);
      if (E.isNew) { pg.items = E.before; } // so the undo step is "add this text"
      setItems(this.doc, pg, arr);
      renderOpts();
    }
    // ----- input -----
    bindInput() {
      const vp = this.vp;
      vp.addEventListener('pointerdown', e => this.down(e));
      const keep = e => e.target.closest && e.target.closest('button,video,input,select,.tx.editing,.selbar,.hd');
      vp.addEventListener('touchstart', e => { if (!keep(e)) e.preventDefault(); }, { passive: false });
      vp.addEventListener('touchmove', e => { if (!keep(e)) e.preventDefault(); }, { passive: false });
      vp.addEventListener('pointermove', e => this.move(e));
      vp.addEventListener('pointerup', e => this.up(e));
      vp.addEventListener('pointercancel', e => this.up(e, true));
      vp.addEventListener('lostpointercapture', e => { if (this.ptrs.has(e.pointerId)) this.up(e, true); });
      vp.addEventListener('wheel', e => {
        if (!this.doc) return; e.preventDefault();
        const r = vp.getBoundingClientRect(), sx = e.clientX - r.left, sy = e.clientY - r.top, v = this.view;
        if (e.ctrlKey || e.metaKey) { this.autoFit = false; const z = clamp(v.z * Math.exp(-e.deltaY * 0.012), this.doc.kind === 'board' ? 0.05 : 0.15, 8); v.x = sx - (sx - v.x) * z / v.z; v.y = sy - (sy - v.y) * z / v.z; v.z = z; }
        else { v.x -= e.deltaX; v.y -= e.deltaY; }
        this.clampView(); this.draw();
      }, { passive: false });
      // Safari's trackpad pinch
      vp.addEventListener('gesturestart', e => e.preventDefault());
      vp.addEventListener('dblclick', e => { const r = vp.getBoundingClientRect(), hit = this.pageAt(e.clientX - r.left, e.clientY - r.top); if (!hit) return; const o = this.hitObj(hit.pg, hit.x, hit.y); if (o && o.t === 'text') this.startEdit(hit.pg, o); else if (o && o.t === 'fig') editFigure(this, o); });
      vp.addEventListener('contextmenu', e => e.preventDefault());
    }
    sp(e) { const r = this.vr || this.vp.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
    down(e) {
      if (!this.doc) return;
      if (e.target.closest('.hd,.selbar,.playfig,video,.pfoot,.tx.editing')) return;
      if (this.editing && !e.target.closest('.tx.editing')) { this.endEdit(); if (S.tool === 'text') { this.ignoreUntilUp = e.pointerId; return; } }
      this.vr = this.vp.getBoundingClientRect();
      const [sx, sy] = this.sp(e), t = nowMs(), type = e.pointerType || 'mouse';
      this.ptrs.set(e.pointerId, { x: sx, y: sy, x0: sx, y0: sy, type, t });
      try { this.vp.setPointerCapture(e.pointerId); } catch (er) { }
      e.preventDefault();
      const touches = [...this.ptrs.values()].filter(p => p.type === 'touch');
      if (type === 'touch' && touches.length >= 2) {
        if (this.act && this.act.touch) { if (t - this.act.t0 < 300 || this.act.small) this.cancelAct(); else return; }
        if (!this.act && !this.pinch) this.startPinch(touches);
        this.taps = this.taps && t - this.taps.t < 400 ? Object.assign(this.taps, { n: Math.max(this.taps.n, touches.length) }) : { n: touches.length, t, moved: false };
        return;
      }
      if (type === 'touch') { if (this.act && this.act.pen) return; this.taps = { n: 1, t, moved: false }; }
      if (type === 'pen' && S.autoPencil && !S.pencilOnly) { S.pencilOnly = true; saveS(); toast('Apple Pencil found: the Pencil writes, fingers scroll and zoom. Change this in ⋯ › Settings.', 4500); }
      if (type === 'pen' && this.act && this.act.touch) this.cancelAct();
      const tool = S.tool;
      const panLike = tool === 'hand' || e.button === 1 || spaceDown || (type === 'touch' && S.pencilOnly);
      if (panLike) { this.act = { kind: 'pan', touch: type === 'touch', t0: t, id: e.pointerId, s0: [sx, sy], small: true, last: [sx, sy], vel: [0, 0], lt: t, tap: tool !== 'hand' }; return; }
      this.startTool(tool, e, sx, sy, type);
    }
    startTool(tool, e, sx, sy, type) {
      const t = nowMs(), base = { touch: type === 'touch', pen: type === 'pen', t0: t, id: e.pointerId, small: true, s0: [sx, sy] };
      const hit = this.pageAt(sx, sy, tool === 'lasso' || tool === 'text');
      // inside an existing selection, any tool moves it
      if (this.sel) {
        const bb = this.selBB(), o = this.offs[this.sel.i], [wx, wy] = this.toWorld(sx, sy), lx = wx - o.x, ly = wy - o.y, pad = 10 / this.view.z;
        if (bb && lx > bb[0] - pad && lx < bb[2] + pad && ly > bb[1] - pad && ly < bb[3] + pad) { this.act = Object.assign(base, { kind: 'move', i: this.sel.i, p0: [lx, ly] }); this.selT = { dx: 0, dy: 0, s: 1, r: 0, ox: 0, oy: 0, dragging: true }; this.hide = new Set(this.sel.ids); return; }
        this.clearSel();
        if (tool !== 'lasso') { /* a tap outside just deselects */ }
      }
      if (!hit) { this.act = Object.assign(base, { kind: 'pan', last: [sx, sy], vel: [0, 0], lt: t, tap: false }); return; }
      const P = type === 'pen' ? clamp(e.pressure || 0.5, 0.02, 1) : 0.5;
      if (tool === 'pen' || tool === 'hl' || (tool === 'shape' && S.shape.kind === 'auto')) {
        const st = tool === 'hl' ? { tool: 'hl', c: S.hl.c, w: S.hl.w } : tool === 'shape' ? { tool: 'pen', style: 'mono', c: S.shape.c, w: S.shape.w } : { tool: 'pen', style: S.pen.style, c: S.pen.c, w: S.pen.w };
        const s = Object.assign({ id: uid(), t: 'ink', pts: [hit.x, hit.y, P], sl: Math.round(S.stab * 100) / 100, pa: S.pressureAmt, sim: type !== 'pen' || undefined }, st);
        this.act = Object.assign(base, { kind: 'stroke', pg: hit.pg, i: hit.i, s, auto: tool === 'shape', anchor: [sx, sy], still: t });
        this.armSnap();
      } else if (tool === 'shape') {
        const s = { id: uid(), t: 'ink', tool: 'pen', style: 'mono', c: S.shape.c, w: S.shape.w, pts: [], shape: S.shape.kind, fill: S.shape.fill || undefined, dash: S.shape.dash || undefined };
        this.act = Object.assign(base, { kind: 'shape', pg: hit.pg, i: hit.i, s, p0: [hit.x, hit.y] });
      } else if (tool === 'eraser') {
        this.act = Object.assign(base, { kind: 'erase', pg: hit.pg, i: hit.i, before: hit.pg.items, r: Math.max(S.er.w / 2, 5 / this.view.z), last: [hit.x, hit.y], cur: [hit.x, hit.y], changed: false });
        hit.pg.items = hit.pg.items.slice();
        this.eraseSeg(hit.x, hit.y, hit.x, hit.y);
      } else if (tool === 'lasso') {
        this.act = Object.assign(base, { kind: 'lasso', pg: hit.pg, i: hit.i, poly: [hit.x, hit.y], p0: [hit.x, hit.y], len: 0 });
      } else if (tool === 'text') {
        this.act = Object.assign(base, { kind: 'textbox', pg: hit.pg, i: hit.i, p0: [hit.x, hit.y] });
      }
      this.drawLive();
    }
    armSnap() {
      clearTimeout(this.snapT);
      if (!this.act || (!S.holdSnap && !this.act.auto) || this.act.s.tool === 'hl') return;
      this.snapT = setTimeout(() => {
        const a = this.act; if (!a || a.kind !== 'stroke' || a.snapped || a.s.pts.length < 18 || !(S.holdSnap || a.auto)) return;
        const rec = recognise(a.s.pts); if (!rec) return;
        a.snapped = rec; a.s.shape = rec.kind; a.s.closed = rec.closed; a.s.style = 'mono';
        a.s.pts = flatten(rec.pts); this.liveSoon();
      }, 520);
    }
    cancelAct() {
      const a = this.act; if (!a) return;
      clearTimeout(this.snapT);
      if (a.kind === 'erase') { a.pg.items = a.before; this.draw(); }
      if (a.kind === 'move') { this.selT = null; this.hide = null; }
      this.act = null; this.drawLive(); this.draw();
    }
    startPinch(touches) {
      const [a, b] = touches; this.gesture = true; this.pinch = { a: a, b: b, d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, m0: [(a.x + b.x) / 2, (a.y + b.y) / 2], v0: Object.assign({}, this.view) };
    }
    move(e) {
      const P = this.ptrs.get(e.pointerId); if (!P) return;
      const [sx, sy] = this.sp(e); P.x = sx; P.y = sy;
      if (this.taps && Math.hypot(sx - P.x0, sy - P.y0) > 10) this.taps.moved = true;
      if (this.pinch) {
        const tp = [...this.ptrs.values()].filter(p => p.type === 'touch'); if (tp.length < 2) return;
        const [a, b] = tp, d = Math.hypot(a.x - b.x, a.y - b.y), m = [(a.x + b.x) / 2, (a.y + b.y) / 2], v0 = this.pinch.v0;
        if (Math.abs(d / this.pinch.d0 - 1) > 0.04) this.autoFit = false;
        const z = clamp(v0.z * d / this.pinch.d0, this.doc.kind === 'board' ? 0.05 : 0.15, 8);
        const wx = (this.pinch.m0[0] - v0.x) / v0.z, wy = (this.pinch.m0[1] - v0.y) / v0.z;
        this.view = { z, x: m[0] - wx * z, y: m[1] - wy * z };
        this.clampView(); this.draw(); return;
      }
      const a = this.act; if (!a || a.id !== e.pointerId) return;
      if (Math.hypot(sx - a.s0[0], sy - a.s0[1]) > 6) a.small = false;
      if (a.kind === 'pan') {
        const t = nowMs(), dx = sx - a.last[0], dy = sy - a.last[1], dt = Math.max(1, t - a.lt);
        a.vel = [dx / dt * 16, dy / dt * 16]; a.last = [sx, sy]; a.lt = t;
        this.view.x += dx; this.view.y += dy; this.clampView(); this.draw(); return;
      }
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e], list = evs.length ? evs : [e];
      if (a.kind === 'stroke') {
        if (a.snapped) {
          if (a.snapped.kind === 'line') { const [lx, ly] = this.local(a.i, sx, sy); a.s.pts = flatten([a.snapped.pts[0], [lx, ly]]); this.liveSoon(); }
          return;
        }
        const minD = 0.2 / this.view.z;
        for (const ce of list) {
          const [cx, cy] = this.sp(ce), [lx, ly] = this.local(a.i, cx, cy), p = a.s.pts, n = p.length;
          if (Math.hypot(lx - p[n - 3], ly - p[n - 2]) < minD) continue;
          const pr = ce.pointerType === 'pen' ? clamp(ce.pressure || 0.5, 0.02, 1) : 0.5;
          p.push(Math.round(lx * 100) / 100, Math.round(ly * 100) / 100, Math.round(pr * 1000) / 1000);
        }
        if (Math.hypot(sx - a.anchor[0], sy - a.anchor[1]) > 4) { a.anchor = [sx, sy]; this.armSnap(); }
        // predicted points (Safari 18.2+, Chrome) draw a little ahead of the pen to hide latency; they're never stored
        a.pred = null;
        if (S.predict && e.getPredictedEvents && e.pointerType === 'pen') { const pr = e.getPredictedEvents(), lastP = a.s.pts[a.s.pts.length - 1]; if (pr && pr.length) { a.pred = []; for (const pe of pr.slice(0, 2)) { const [qx, qy] = this.sp(pe), [lx, ly] = this.local(a.i, qx, qy); a.pred.push(lx, ly, lastP); } } }
        this.liveSoon(); return;
      }
      const [lx, ly] = this.local(a.i, sx, sy);
      if (a.kind === 'shape') { const sh = shapeFromBox(a.s.shape, a.p0[0], a.p0[1], lx, ly, a.s.w); if (sh) { a.s.pts = flatten(sh.pts); a.s.closed = sh.closed; } this.liveSoon(); }
      else if (a.kind === 'erase') { for (const ce of list) { const [cx, cy] = this.sp(ce), [ex, ey] = this.local(a.i, cx, cy); this.eraseSeg(a.last[0], a.last[1], ex, ey); a.last = [ex, ey]; } a.cur = [lx, ly]; this.draw(); }
      else if (a.kind === 'lasso') { if (S.lasso.mode === 'rect') a.p1 = [lx, ly]; else { const p = a.poly; a.len += Math.hypot(lx - p[p.length - 2], ly - p[p.length - 1]); p.push(lx, ly); } this.drawLive(); }
      else if (a.kind === 'textbox') { a.p1 = [lx, ly]; this.drawLive(); }
      else if (a.kind === 'move') { this.selT.dx = lx - a.p0[0]; this.selT.dy = ly - a.p0[1]; this.draw(); }
    }
    up(e, cancelled) {
      const P = this.ptrs.get(e.pointerId); if (!P) return;
      this.ptrs.delete(e.pointerId);
      if (this.ignoreUntilUp === e.pointerId) { this.ignoreUntilUp = null; return; }
      const touchesLeft = [...this.ptrs.values()].filter(p => p.type === 'touch').length;
      if (this.gesture) {
        if (touchesLeft < 2) this.pinch = null;
        if (touchesLeft === 0) {
          this.gesture = false;
          if (this.taps && this.taps.n >= 2 && !this.taps.moved && nowMs() - this.taps.t < 400) { const n = this.taps.n; this.taps = null; if (n === 2) doUndo(-1); else doUndo(1); }
          this.taps = null;
        }
        return;
      }
      const a = this.act; if (!a || a.id !== e.pointerId) return;
      this.act = null; clearTimeout(this.snapT);
      const [sx, sy] = this.sp(e);
      if (cancelled && a.kind !== 'pan') { if (a.kind === 'erase') a.pg.items = a.before; if (a.kind === 'move') { this.selT = null; this.hide = null; } this.draw(); return; }
      if (a.kind === 'pan') {
        if (a.tap && a.small) { this.tapAt(sx, sy); return; }
        if (a.touch && Math.hypot(a.vel[0], a.vel[1]) > 1.5 && nowMs() - a.lt < 80) this.glide(a.vel);
        return;
      }
      if (a.kind === 'stroke') {
        const s = a.s;
        if (a.auto && !a.snapped && s.pts.length > 9) { const rec = recognise(s.pts); if (rec) { s.shape = rec.kind; s.closed = rec.closed; s.style = 'mono'; s.pts = flatten(rec.pts); } }
        if (s.pts.length === 3) s.pts.push(s.pts[0] + 0.05, s.pts[1] + 0.05, s.pts[2]);
        if (s.shape) { s.fill = (a.auto ? S.shape.fill : '') || undefined; if (a.auto && S.shape.dash) s.dash = true; }
        if (s.fill && !s.closed) delete s.fill;
        s._p = null;
        setItems(this.doc, a.pg, a.pg.items.concat([s]));
        this.drawLive(); return;
      }
      if (a.kind === 'shape') {
        if (a.s.pts.length >= 6) { if (!a.s.closed) delete a.s.fill; setItems(this.doc, a.pg, a.pg.items.concat([a.s])); }
        this.drawLive(); return;
      }
      if (a.kind === 'erase') {
        if (a.changed) { const after = a.pg.items; a.pg.items = a.before; setItems(this.doc, a.pg, after); } else { a.pg.items = a.before; }
        this.draw(); return;
      }
      if (a.kind === 'lasso') {
        const pg = a.pg, ids = [];
        if (a.small || (S.lasso.mode === 'free' && a.len * this.view.z < 14)) { const [lx, ly] = this.local(a.i, sx, sy); this.tapAt(sx, sy, true); this.drawLive(); return; }
        let poly = a.poly;
        if (S.lasso.mode === 'rect') { const [x0, y0] = a.p0, [x1, y1] = a.p1 || a.p0; poly = [x0, y0, x1, y0, x1, y1, x0, y1]; }
        for (const it of pg.items) {
          if (it.t === 'ink') { const p = it.pts, n = p.length / 3, step = Math.max(1, Math.floor(n / 40)); let inside = 0, tot = 0; for (let i = 0; i < n; i += step) { tot++; if (inPoly(poly, p[i * 3], p[i * 3 + 1])) inside++; } if (inside / tot >= 0.5) ids.push(it.id); }
          else { const b = bbOf(it); if (inPoly(poly, (b[0] + b[2]) / 2, (b[1] + b[3]) / 2)) ids.push(it.id); }
        }
        this.drawLive();
        if (ids.length) this.select(a.i, ids);
        return;
      }
      if (a.kind === 'textbox') {
        const pg = a.pg;
        if (a.small) { const [lx, ly] = this.local(a.i, sx, sy), o = this.hitObj(pg, lx, ly, true); if (o && o.t === 'text') { if (this.toggleCheck(pg, o, sx, sy)) return; this.startEdit(pg, o); return; } }
        const x0 = a.p1 ? Math.min(a.p0[0], a.p1[0]) : a.p0[0], w = a.p1 && Math.abs(a.p1[0] - a.p0[0]) > 40 ? Math.abs(a.p1[0] - a.p0[0]) : Math.min(380, pg.infinite ? 380 : pg.w - x0 - 20);
        this.newText(pg, x0, a.p0[1] - 14, Math.max(80, w));
        this.drawLive(); return;
      }
      if (a.kind === 'move') { if (a.small) { this.selT = null; this.hide = null; this.draw(); return; } this.selT.dragging = false; this.applyXform(); return; }
    }
    glide(vel) {
      let [vx, vy] = vel; const step = () => { if (this.act || this.pinch) return; vx *= 0.93; vy *= 0.93; this.view.x += vx; this.view.y += vy; this.clampView(); this.draw(); if (Math.hypot(vx, vy) > 0.4) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    }
    newText(pg, x, y, w, extra) {
      const it = Object.assign({ id: uid(), t: 'text', x, y, w, h: 34, html: '', font: S.text.font, size: S.text.size, c: S.text.c }, extra || {});
      const before = pg.items; pg.items = pg.items.concat([it]);
      this.syncObjs(); this.startEdit(pg, it, true, before);
      return it;
    }
    // topmost thing under a point: objects first (they sit under the ink but are easier to hit), then ink
    hitObj(pg, x, y, objsOnly) {
      for (let i = pg.items.length - 1; i >= 0; i--) {
        const it = pg.items[i]; if (it.t === 'ink') continue;
        const k = it.k || 1, W = it.w * k, H = (it.t === 'text' ? (it.h || 40) : it.h) * k, cx = it.x + W / 2, cy = it.y + H / 2, r = -(it.rot || 0);
        const dx = x - cx, dy = y - cy, ux = dx * Math.cos(r) - dy * Math.sin(r), uy = dx * Math.sin(r) + dy * Math.cos(r);
        if (Math.abs(ux) <= W / 2 && Math.abs(uy) <= H / 2) return it;
      }
      if (objsOnly) return null;
      const tol = 8 / this.view.z;
      for (let i = pg.items.length - 1; i >= 0; i--) { const it = pg.items[i]; if (it.t !== 'ink') continue; const b = bbOf(it); if (x < b[0] - tol || x > b[2] + tol || y < b[1] - tol || y > b[3] + tol) continue; if (strokeDist(it, x, y) <= it.w / 2 + tol) return it; }
      return null;
    }
    toggleCheck(pg, it, sx, sy) {
      const el = this.objEls.get(it.id); if (!el) return false;
      const t = document.elementFromPoint(sx + this.vr.left, sy + this.vr.top), li = t && t.closest && t.closest('ul.check > li');
      if (!li || !el.contains(li)) return false;
      const lr = li.getBoundingClientRect(); if (sx + this.vr.left > lr.left + 4) return false;
      li.classList.toggle('done');
      setItems(this.doc, pg, pg.items.map(x => x.id === it.id ? Object.assign({}, x, { html: el.innerHTML }) : x));
      return true;
    }
    tapAt(sx, sy, fromLasso) {
      const hit = this.pageAt(sx, sy); if (!hit) return;
      const o = this.hitObj(hit.pg, hit.x, hit.y, !fromLasso && S.tool !== 'lasso');
      if (o && o.t === 'text' && this.toggleCheck(hit.pg, o, sx, sy)) return;
      if (S.tool === 'text' && o && o.t === 'text') { this.startEdit(hit.pg, o); return; }
      if (o && (fromLasso || S.tool === 'lasso' || S.tool === 'hand' || S.pencilOnly)) { this.select(hit.i, [o.id]); return; }
      this.clearSel();
    }
    // ----- erasing -----
    eraseSeg(x1, y1, x2, y2) {
      const a = this.act, pg = a.pg, r = a.r, segL = Math.hypot(x2 - x1, y2 - y1), n = Math.max(1, Math.ceil(segL / (r * 0.5)));
      const ex0 = Math.min(x1, x2) - r, ex1 = Math.max(x1, x2) + r, ey0 = Math.min(y1, y2) - r, ey1 = Math.max(y1, y2) + r;
      const out = []; let touched = false;
      for (const s of pg.items) {
        if (s.t !== 'ink' || (S.er.hlOnly && s.tool !== 'hl')) { out.push(s); continue; }
        const b = bbOf(s); if (b[2] < ex0 || b[0] > ex1 || b[3] < ey0 || b[1] > ey1) { out.push(s); continue; }
        const rr = r + s.w * 0.4;
        if (S.er.mode === 'stroke') {
          let hitIt = false; for (let k = 0; k <= n && !hitIt; k++) { const t = k / n; if (strokeDist(s, x1 + (x2 - x1) * t, y1 + (y2 - y1) * t) <= rr) hitIt = true; }
          if (hitIt) { touched = true; continue; } out.push(s); continue;
        }
        // partial: densify, drop covered points, keep the remaining runs as new strokes
        const p = s.pts, dense = [];
        const step = Math.max(0.5, r / 3);
        for (let i = 0; i < p.length; i += 3) { if (i) { const dx = p[i] - p[i - 3], dy = p[i + 1] - p[i - 2], dd = Math.hypot(dx, dy), m = Math.floor(dd / step); for (let k = 1; k < m; k++) { const t = k / m; dense.push(p[i - 3] + dx * t, p[i - 2] + dy * t, p[i - 1] + (p[i + 2] - p[i - 1]) * t); } } dense.push(p[i], p[i + 1], p[i + 2]); }
        const runs = []; let cur = [], hitAny = false;
        for (let i = 0; i < dense.length; i += 3) { const d = segDist(dense[i], dense[i + 1], x1, y1, x2, y2); if (d <= rr) { hitAny = true; if (cur.length) runs.push(cur); cur = []; } else cur.push(dense[i], dense[i + 1], dense[i + 2]); }
        if (cur.length) runs.push(cur);
        if (!hitAny) { out.push(s); continue; }
        touched = true;
        for (const run of runs) { if (run.length < 6) continue; const ns = Object.assign({}, s, { id: uid(), pts: run.map(v => Math.round(v * 100) / 100) }); delete ns._p; delete ns._bb; delete ns._fp; if (ns.closed) { ns.closed = false; delete ns.fill; } out.push(ns); }
      }
      if (touched) { pg.items.length = 0; pg.items.push(...out); a.changed = true; }
    }
    // ----- page thumbnails -----
    toggleThumbs() {
      if (this.kind !== 'doc' || this.doc.kind === 'board') { toast('A whiteboard is one endless page.'); return; }
      if (this.thumbsEl) { this.thumbsEl.remove(); this.thumbsEl = null; return; }
      this.thumbsEl = h('div', { class: 'thumbs', 'aria-label': 'Pages' }); this.el.append(this.thumbsEl); this.refreshThumbs();
    }
    refreshThumbs() {
      const box = this.thumbsEl; if (!box || !this.doc) return;
      clearTimeout(this.thT);
      this.thT = setTimeout(async () => {
        const d = this.doc, frag = document.createDocumentFragment();
        const cards = d.pages.map((pg, i) => { const c = h('div', { class: 'thumb', onclick: () => { this.gotoPage(i); } }, h('div', { class: 'cv' }), h('div', { class: 'n' }, 'Page ' + (i + 1)), h('button', { class: 'tm', type: 'button', 'aria-label': 'Page options', onclick: e => { e.stopPropagation(); pageMenu(this, i, e.currentTarget); } }, '⋯')); frag.append(c); return c; });
        frag.append(h('button', { class: 'btn addpg', type: 'button', onclick: () => addPageAfter(this, d.pages.length - 1) }, '＋ Add page'));
        box.textContent = ''; box.append(frag); this.markThumb();
        for (let i = 0; i < d.pages.length; i++) { if (this.doc !== d || !this.thumbsEl) return; const pg = d.pages[i]; const c = await renderPage(d, pg, 150 / pg.w, { thumb: true }); c.style.width = '150px'; cards[i].querySelector('.cv').append(c); }
      }, 120);
    }
    markThumb() { if (!this.thumbsEl) return; const cp = this.currentPage(); this.thumbsEl.querySelectorAll('.thumb').forEach((t, i) => t.classList.toggle('cur', i === cp)); }
    // where new things go: the middle of what you're looking at
    insertPoint() {
      const d = this.doc; if (!d) return null;
      if (d.kind === 'board') { const [x, y] = this.toWorld(this.W / 2, this.H / 2); return { pg: d.pages[0], i: 0, x, y, maxW: 640 / this.view.z }; }
      const i = this.currentPage(), pg = d.pages[i], [lx, ly] = this.local(i, this.W / 2, this.H / 2);
      return { pg, i, x: clamp(lx, 40, pg.w - 40), y: clamp(ly, 40, pg.h - 40), maxW: Math.min(pg.w * 0.8, this.W * 0.8 / this.view.z) };
    }
  }

  // ---------- pane management ----------
  const panesEl = $('#panes');
  let spaceDown = false;
  function layoutPanes() {
    panesEl.querySelectorAll('.divider').forEach(d => d.remove());
    const cur = [...panesEl.children];
    if (cur.length !== panes.length || cur.some((el, i) => el !== panes[i].el)) { for (const el of cur) if (!panes.some(p => p.el === el)) el.remove(); panes.forEach(p => { if (p.el.parentElement !== panesEl || [...panesEl.children].indexOf(p.el) !== panes.indexOf(p)) panesEl.append(p.el); }); }
    panes.forEach((p, i) => { p.el.style.flex = p.flex + ' 1 0'; if (i) p.el.before(divider(panes[i - 1], p)); });
    panesEl.classList.toggle('only1', panes.length <= 1);
    renderPaneTabs(); saveSession();
    for (const p of panes) if (p.doc) { p.clampView(); p.draw(); }
  }
  function divider(a, b) {
    const d = h('div', { class: 'divider', role: 'separator', 'aria-label': 'Resize panes' });
    d.addEventListener('pointerdown', e => {
      e.preventDefault(); d.setPointerCapture(e.pointerId);
      const wa = a.el.offsetWidth, wb = b.el.offsetWidth, tot = a.flex + b.flex, x0 = e.clientX;
      const mv = ev => { const dx = ev.clientX - x0, na = clamp(wa + dx, 220, wa + wb - 220); a.flex = tot * na / (wa + wb); b.flex = tot - a.flex; a.el.style.flex = a.flex + ' 1 0'; b.el.style.flex = b.flex + ' 1 0'; };
      const up = () => { d.removeEventListener('pointermove', mv); d.removeEventListener('pointerup', up); saveSession(); };
      d.addEventListener('pointermove', mv); d.addEventListener('pointerup', up);
    });
    return d;
  }
  function renderPaneTabs() {
    const t = $('#ptabs'); t.textContent = '';
    if (panes.length < 2) return;
    panes.forEach(p => t.append(h('button', { type: 'button', class: p === active ? 'on' : '', onclick: () => { setActive(p); layoutPanes(); } }, p.kind === 'app' ? p.app.name : p.item ? p.item.name : 'Note')));
  }
  function setActive(p) {
    if (active === p) return;
    if (active) { active.el.classList.remove('active'); if (active.editing) active.endEdit(); }
    active = p; if (p) { p.el.classList.add('active'); p.title(); }
    updUndo(); renderOpts(); renderPaneTabs();
  }
  function newPane() { const p = new Pane(); panes.push(p); layoutPanes(); setActive(p); return p; }
  async function openItem(id, beside) {
    const it = itemOf(id); if (!it || it.kind === 'folder') return;
    const doc = await loadDoc(id); if (!doc) { toast('That note couldn’t be opened.'); return; }
    let p;
    if (beside && panes.length < 3) p = newPane();
    else if (beside) p = panes.find(x => x !== active) || active;
    else p = active || newPane();
    hideLibrary();
    p.open(doc); setActive(p); p.title(); saveSession(); updUndo();
    return p;
  }
  function openAppPane(src, name, beside) {
    let p;
    if (beside !== false && panes.length && panes.length < 3) p = newPane();
    else p = beside === false ? (active || newPane()) : (panes.find(x => x !== active) || active || newPane());
    hideLibrary(); p.openApp(src, name); setActive(p); renderOpts(); saveSession(); return p;
  }
  function closePane(p) {
    if (p.editing) p.endEdit();
    if (p.doc) saveDocNow(p.doc);
    const i = panes.indexOf(p); if (i < 0) return;
    if (panes.length === 1) { showLibrary(); return; }
    panes.splice(i, 1); p.el.remove();
    if (active === p) { active = null; setActive(panes[Math.max(0, i - 1)]); }
    layoutPanes();
  }
  function swapPane(p) {
    const i = panes.indexOf(p); if (panes.length < 2) return toast('Open another note beside this one first (◫ in the top bar).');
    const j = i === panes.length - 1 ? i - 1 : i + 1; [panes[i], panes[j]] = [panes[j], panes[i]];
    panes.forEach(x => panesEl.append(x.el)); layoutPanes();
  }
  function saveSession() {
    LS.set('psiphi-notes.session', { panes: panes.map(p => p.kind === 'app' ? { app: p.app.src, name: p.app.name, flex: p.flex } : p.doc ? { doc: p.doc.id, flex: p.flex } : null).filter(Boolean), active: panes.indexOf(active) });
  }
  const redrawAll = () => { for (const p of panes) if (p.doc) p.draw(); };
  function doUndo(dir) { const p = active; if (!p || !p.doc) return; if (p.editing) { p.endEdit(); } if (!undoDoc(p.doc, dir)) toast(dir < 0 ? 'Nothing to undo' : 'Nothing to redo', 1200); else toast(dir < 0 ? '↶ Undo' : '↷ Redo', 800); }
  $('#undoBtn').addEventListener('click', () => doUndo(-1));
  $('#redoBtn').addEventListener('click', () => doUndo(1));

  // ---------- tools ----------
  const TOOLS = [
    ['pen', 'Pen (P)', '<svg viewBox="0 0 24 24"><path d="M4 20l1.5-5L16 4.5a2.1 2.1 0 0 1 3 3L8.5 18 4 20z"/><path d="M14 6.5l3 3"/></svg>'],
    ['hl', 'Highlighter (H)', '<svg viewBox="0 0 24 24"><path d="M9 15l-4 4h6l1.5-1.5"/><path d="M9 15l3.5 3.5L20 11l-3.5-3.5z"/><path d="M14 5l5 5"/></svg>'],
    ['eraser', 'Eraser (E)', '<svg viewBox="0 0 24 24"><path d="M8 20h12"/><path d="M5.5 15.5 14 7a2 2 0 0 1 2.8 0l2.2 2.2a2 2 0 0 1 0 2.8L11 20H9z"/><path d="M9.5 11.5l5 5"/></svg>'],
    ['lasso', 'Lasso: select, move, resize (L)', '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="9" rx="8" ry="5.5" stroke-dasharray="3 2.5"/><path d="M7 13c-1 2 0 4 2 4s2 2 1 4"/></svg>'],
    ['shape', 'Shapes (S)', '<svg viewBox="0 0 24 24"><circle cx="8" cy="8" r="4.5"/><rect x="11" y="11" width="9" height="9" rx="1"/></svg>'],
    ['text', 'Text (T)', '<svg viewBox="0 0 24 24"><path d="M5 6V4h14v2M12 4v16M9 20h6"/></svg>'],
    ['hand', 'Scroll and select (space)', '<svg viewBox="0 0 24 24"><path d="M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11.5V6a1.5 1.5 0 0 1 3 0v8c0 4-2.5 7-6 7-2.5 0-4-1-5.5-3L3.6 14.6a1.5 1.5 0 0 1 2.3-1.9L8 15"/></svg>']
  ];
  function buildTools() {
    const box = $('#tools'); box.textContent = '';
    for (const [id, label, ic] of TOOLS) {
      const b = h('button', { type: 'button', class: 'tb' + (S.tool === id ? ' on' : ''), title: label, 'aria-label': label, 'aria-pressed': S.tool === id ? 'true' : 'false', html: ic, onclick: () => setTool(id) });
      const col = id === 'pen' ? S.pen.c : id === 'hl' ? S.hl.c : id === 'shape' ? S.shape.c : id === 'text' ? S.text.c : null;
      if (col) b.append(h('i', { class: 'dot', style: { background: col } }));
      box.append(b);
    }
  }
  function setTool(id) {
    if (S.tool === id && active && active.editing) { active.endEdit(); }
    S.tool = id; saveS();
    for (const p of panes) { if (p.editing) p.endEdit(); if (id !== 'lasso' && id !== 'hand') { /* keep a fresh selection only for moving tools */ } }
    buildTools(); renderOpts();
  }
  const optsEl = $('#opts');
  function swatchRow(list, cur, pick, onAdd) {
    const out = list.map(c => h('button', { type: 'button', class: 'sw' + (c.toLowerCase() === String(cur).toLowerCase() ? ' on' : ''), style: { background: c }, title: c, 'aria-label': 'Colour ' + c, onclick: () => pick(c) }));
    const inp = h('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(cur) ? cur : '#000000', 'aria-label': 'Choose any colour' });
    inp.addEventListener('change', () => { onAdd(inp.value); pick(inp.value); });
    out.push(h('span', { class: 'sw add', title: 'Any colour' }, inp));
    return out;
  }
  const addSw = (key, c) => { const L = S[key]; if (!L.includes(c)) { L.unshift(c); if (L.length > 12) L.pop(); } saveS(); };
  const widthChips = (vals, cur, set, scale) => vals.map(w => h('button', { type: 'button', class: 'chip' + (Math.abs(w - cur) < 0.01 ? ' on' : ''), title: 'Width ' + w, onclick: () => set(w) }, h('span', { class: 'wdot', style: { width: Math.max(3, Math.min(20, w * scale)) + 'px', height: Math.max(3, Math.min(20, w * scale)) + 'px' } })));
  const chip = (label, on, fn, title) => h('button', { type: 'button', class: 'chip' + (on ? ' on' : ''), title: title || label, onclick: fn }, label);
  const slider = (label, min, max, step, val, set) => { const i = h('input', { type: 'range', min, max, step, value: val, style: { width: '110px' } }); i.addEventListener('input', () => set(+i.value)); return h('label', {}, label, i); };
  function renderOpts() {
    optsEl.textContent = '';
    const p = active;
    if (p && p.kind === 'app') { optsEl.append(h('span', { style: { color: 'var(--muted)', fontSize: '13px' } }, p.app.name + ' is open in this pane. Tap a note pane to write in it.')); return; }
    if (p && p.editing) return textBar();
    const t = S.tool, re = () => { saveS(); buildTools(); renderOpts(); };
    if (t === 'pen') {
      optsEl.append(...PEN_STYLES.map(([k, l]) => chip(l, S.pen.style === k, () => { S.pen.style = k; re(); })), h('span', { class: 'sep' }));
      optsEl.append(...widthChips([0.8, 1.6, 2.4, 4, 7], S.pen.w, w => { S.pen.w = w; re(); }, 2), slider('', 0.4, 24, 0.2, S.pen.w, v => { S.pen.w = v; saveS(); }), h('span', { class: 'sep' }));
      optsEl.append(...swatchRow(S.swatches, S.pen.c, c => { S.pen.c = c; re(); }, c => addSw('swatches', c)), h('span', { class: 'sep' }));
      optsEl.append(slider('Steadiness', 0, 1, 0.05, S.stab, v => { S.stab = v; saveS(); }), slider('Pressure', 0, 1.6, 0.1, S.pressureAmt, v => { S.pressureAmt = v; saveS(); }));
    } else if (t === 'hl') {
      optsEl.append(...widthChips([8, 14, 22, 34], S.hl.w, w => { S.hl.w = w; re(); }, 0.55), h('span', { class: 'sep' }));
      optsEl.append(...swatchRow(S.hlSwatches, S.hl.c, c => { S.hl.c = c; re(); }, c => addSw('hlSwatches', c)));
      optsEl.append(h('span', { class: 'sep' }), slider('Steadiness', 0, 1, 0.05, S.stab, v => { S.stab = v; saveS(); }), h('label', {}, 'Hold still at the end of a line to straighten it'));
    } else if (t === 'eraser') {
      optsEl.append(chip('Whole strokes', S.er.mode === 'stroke', () => { S.er.mode = 'stroke'; re(); }), chip('Partial', S.er.mode === 'partial', () => { S.er.mode = 'partial'; re(); }), h('span', { class: 'sep' }));
      optsEl.append(...[[6, 'S'], [16, 'M'], [34, 'L'], [70, 'XL']].map(([w, l]) => chip(l, S.er.w === w, () => { S.er.w = w; re(); }, 'Eraser size')), h('span', { class: 'sep' }));
      optsEl.append(chip('Highlighter only', S.er.hlOnly, () => { S.er.hlOnly = !S.er.hlOnly; re(); }), h('span', { class: 'sep' }), chip('Clear page…', false, () => clearPage()));
    } else if (t === 'lasso') {
      optsEl.append(chip('Freehand', S.lasso.mode === 'free', () => { S.lasso.mode = 'free'; re(); }), chip('Rectangle', S.lasso.mode === 'rect', () => { S.lasso.mode = 'rect'; re(); }), h('span', { class: 'sep' }),
        h('label', {}, 'Circle ink or pictures to select them, or tap one. Drag to move, corners to resize, the top dot to turn.'), h('span', { class: 'sep' }), chip('Select all on page', false, () => selectAll()), chip('Paste', false, () => pasteClip()));
    } else if (t === 'shape') {
      const K = [['auto', '✎ Draw & snap'], ['line', '╱ Line'], ['arrow', '→ Arrow'], ['rect', '▭ Rectangle'], ['ellipse', '◯ Ellipse'], ['triangle', '△ Triangle'], ['diamond', '◇ Diamond'], ['star', '☆ Star'], ['axes', '⌞ Axes']];
      optsEl.append(...K.map(([k, l]) => chip(l, S.shape.kind === k, () => { S.shape.kind = k; re(); })), h('span', { class: 'sep' }));
      optsEl.append(...widthChips([1.2, 2.4, 4, 7], S.shape.w, w => { S.shape.w = w; re(); }, 2), h('span', { class: 'sep' }));
      optsEl.append(...swatchRow(S.swatches, S.shape.c, c => { S.shape.c = c; re(); }, c => addSw('swatches', c)), h('span', { class: 'sep' }));
      optsEl.append(h('label', {}, 'Fill'), chip('None', !S.shape.fill, () => { S.shape.fill = ''; re(); }), ...['#ffe14d', '#9df07a', '#7ad7f0', '#f59ad3', '#e5e5ea', '#1d1d1f'].map(c => h('button', { type: 'button', class: 'sw' + (S.shape.fill === c ? ' on' : ''), style: { background: c }, onclick: () => { S.shape.fill = c; re(); } })), chip('Dashed', S.shape.dash, () => { S.shape.dash = !S.shape.dash; re(); }));
    } else if (t === 'text') {
      optsEl.append(fontSelect(S.text.font, v => { S.text.font = v; re(); }), sizeSelect(S.text.size, v => { S.text.size = v; re(); }), h('span', { class: 'sep' }));
      optsEl.append(...swatchRow(S.swatches, S.text.c, c => { S.text.c = c; re(); }, c => addSw('swatches', c)), h('span', { class: 'sep' }), h('label', {}, 'Tap to type · drag to set the width · tap a text box to edit it'));
    } else {
      optsEl.append(h('label', {}, 'Drag to scroll, pinch to zoom, tap a picture or text to select it. Two-finger tap undoes, three-finger tap redoes.'));
    }
  }
  function fontSelect(cur, set) { const s = h('select', { 'aria-label': 'Font' }); for (const k in FONTS) s.append(h('option', { value: k, selected: k === cur ? true : null }, FONTS[k][0])); s.addEventListener('change', () => set(s.value)); return s; }
  function sizeSelect(cur, set) { const s = h('select', { 'aria-label': 'Size' }); for (const v of [10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48, 60, 72, 96]) s.append(h('option', { value: v, selected: v === cur ? true : null }, v + ' pt')); s.addEventListener('change', () => set(+s.value)); return s; }

  // ---------- rich text formatting while a text box is being edited ----------
  let savedRange = null;
  document.addEventListener('selectionchange', () => { const p = active; if (!p || !p.editing) return; const s = getSelection(); if (s.rangeCount && p.editing.el.contains(s.anchorNode)) savedRange = s.getRangeAt(0).cloneRange(); });
  function restoreRange() { const p = active; if (!p || !p.editing) return false; const el = p.editing.el; el.focus({ preventScroll: true }); if (savedRange && el.contains(savedRange.startContainer)) { const s = getSelection(); s.removeAllRanges(); s.addRange(savedRange); } return true; }
  function ex(cmd, val) { if (!restoreRange()) return; try { document.execCommand('styleWithCSS', false, cmd === 'hiliteColor' || cmd === 'foreColor' || cmd === 'fontName'); } catch (e) { } document.execCommand(cmd, false, val); afterFormat(); }
  function afterFormat() { const p = active; if (p && p.editing) { const s = getSelection(); if (s.rangeCount) savedRange = s.getRangeAt(0).cloneRange(); p.draw(); } }
  function setFontSize(px) {
    if (!restoreRange()) return;
    const el = active.editing.el, s = getSelection();
    if (s.isCollapsed) { el.style.fontSize = px + 'px'; const it = active.editing.it; it.size = px; return; }
    try { document.execCommand('styleWithCSS', false, false); } catch (e) { }
    document.execCommand('fontSize', false, '7');
    el.querySelectorAll('font[size="7"]').forEach(f => { const sp = h('span', { style: { fontSize: px + 'px' } }); while (f.firstChild) sp.append(f.firstChild); f.replaceWith(sp); });
    el.querySelectorAll('span').forEach(sp => { if (sp.style.fontSize === 'xxx-large' || sp.style.fontSize === '-webkit-xxx-large') sp.style.fontSize = px + 'px'; });
    afterFormat();
  }
  function blockAt() { const s = getSelection(); let n = s.anchorNode; while (n && n.nodeType !== 1) n = n.parentNode; return n; }
  function textBar() {
    const p = active, E = p.editing, it = E.it;
    const B = (label, title, fn, style) => { const b = h('button', { type: 'button', class: 'tb', title, 'aria-label': title, style: style || null }, label); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', fn); return b; };
    const fs = fontSelect(it.font || 'sans', v => { restoreRange(); const s = getSelection(); if (s.isCollapsed) { E.el.style.fontFamily = FONTS[v][1]; E.it.font = v; S.text.font = v; saveS(); } else ex('fontName', FONTS[v][1].split(',')[0].replace(/"/g, '')); });
    const sz = sizeSelect(it.size || 18, v => setFontSize(v));
    const blk = h('select', { 'aria-label': 'Paragraph style' }, ...[['p', 'Body'], ['h1', 'Title'], ['h2', 'Heading'], ['h3', 'Subheading'], ['blockquote', 'Quote'], ['pre', 'Code']].map(([v, l]) => h('option', { value: v }, l)));
    blk.addEventListener('change', () => ex('formatBlock', '<' + blk.value + '>'));
    const cols = S.swatches.slice(0, 7).map(c => { const b = h('button', { type: 'button', class: 'sw', style: { background: c }, title: 'Text colour' }); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => ex('foreColor', c)); return b; });
    const any = h('input', { type: 'color', value: '#1d1d1f' }); any.addEventListener('change', () => { addSw('swatches', any.value); ex('foreColor', any.value); });
    const hls = ['#ffe14d', '#9df07a', '#7ad7f0', '#f59ad3', 'transparent'].map(c => { const b = h('button', { type: 'button', class: 'sw', style: { background: c === 'transparent' ? 'repeating-linear-gradient(45deg,#666 0 3px,#999 3px 6px)' : c, borderRadius: '6px' }, title: c === 'transparent' ? 'No highlight' : 'Highlight' }); b.addEventListener('pointerdown', e => e.preventDefault()); b.addEventListener('mousedown', e => e.preventDefault()); b.addEventListener('click', () => ex('hiliteColor', c)); return b; });
    optsEl.append(fs, sz, blk, h('span', { class: 'sep' }),
      B(h('b', {}, 'B'), 'Bold', () => ex('bold')), B(h('i', {}, 'I'), 'Italic', () => ex('italic')), B(h('u', {}, 'U'), 'Underline', () => ex('underline')), B(h('s', {}, 'S'), 'Strikethrough', () => ex('strikeThrough')),
      B('x²', 'Superscript', () => ex('superscript')), B('x₂', 'Subscript', () => ex('subscript')), h('span', { class: 'sep' }),
      ...cols, h('span', { class: 'sw add', title: 'Any colour' }, any), h('span', { class: 'sep' }), ...hls, h('span', { class: 'sep' }),
      B('⇤', 'Align left', () => ex('justifyLeft')), B('↔', 'Centre', () => ex('justifyCenter')), B('⇥', 'Align right', () => ex('justifyRight')), B('☰', 'Justify', () => ex('justifyFull')), h('span', { class: 'sep' }),
      B('•', 'Bullets', () => ex('insertUnorderedList')), B('1.', 'Numbered list', () => ex('insertOrderedList')),
      B('☑', 'Checklist', () => { ex('insertUnorderedList'); const n = blockAt(), ul = n && n.closest('ul'); if (ul) ul.classList.add('check'); afterFormat(); }),
      B('⇠', 'Outdent', () => ex('outdent')), B('⇢', 'Indent', () => ex('indent')), h('span', { class: 'sep' }),
      B('▦', 'Insert table', () => tableDialog()), B('🔗', 'Link', async () => { const u = await promptText('Link address', 'https://'); if (u) ex('createLink', u); }), B('―', 'Line', () => ex('insertHorizontalRule')),
      B('⌫', 'Clear formatting', () => { ex('removeFormat'); ex('formatBlock', '<p>'); }), h('span', { class: 'sep' }),
      h('button', { type: 'button', class: 'btn primary', style: { height: '32px' }, onclick: () => p.endEdit() }, 'Done'));
  }
  async function tableDialog() {
    const r = await formDialog('Insert a table', [['rows', 'Rows', '3'], ['cols', 'Columns', '3']], 'Insert');
    if (!r) return;
    const R = clamp(+r.rows || 3, 1, 40), C = clamp(+r.cols || 3, 1, 12);
    let html = '<table><tr>' + Array.from({ length: C }, (_, i) => '<th>Heading ' + (i + 1) + '</th>').join('') + '</tr>';
    for (let i = 1; i < R; i++) html += '<tr>' + '<td><br></td>'.repeat(C) + '</tr>';
    ex('insertHTML', html + '</table><p><br></p>');
  }

  // ---------- small dialogs and menus ----------
  function closeMenus() { document.querySelectorAll('.menu').forEach(m => m.remove()); }
  function menu(anchor, build) {
    closeMenus();
    const m = h('div', { class: 'menu', role: 'menu' }); build(m);
    document.body.append(m);
    const r = anchor.getBoundingClientRect ? anchor.getBoundingClientRect() : { left: anchor.x, right: anchor.x, top: anchor.y, bottom: anchor.y };
    const W = m.offsetWidth, H = m.offsetHeight;
    m.style.left = clamp(r.right - W, 6, innerWidth - W - 6) + 'px';
    m.style.top = (r.bottom + 6 + H < innerHeight ? r.bottom + 6 : Math.max(6, r.top - H - 6)) + 'px';
    setTimeout(() => { const off = e => { if (!m.contains(e.target)) { m.remove(); removeEventListener('pointerdown', off, true); } }; addEventListener('pointerdown', off, true); }, 0);
    return m;
  }
  const mi = (icon, label, fn, sub) => h('button', { type: 'button', role: 'menuitem', onclick: () => { closeMenus(); fn(); } }, h('span', { class: 'ic' }, icon), h('span', {}, label), sub ? h('span', { class: 'sub' }, sub) : null);
  function dialog(build) {
    const d = h('dialog'); const box = h('div', { class: 'dlg' }); d.append(box);
    document.body.append(d);
    const done = new Promise(res => { build(box, v => { d.close(); res(v); }); d.addEventListener('cancel', () => res(null)); d.addEventListener('close', () => { setTimeout(() => d.remove(), 50); res(null); }); });
    d.showModal(); return done;
  }
  function formDialog(title, fields, ok) {
    return dialog((box, close) => {
      const ins = fields.map(([k, l, v]) => [k, h('input', { type: 'text', value: v || '' })]);
      box.append(h('h2', {}, title), ...ins.flatMap(([k, i], n) => [h('label', { class: 'f' }, fields[n][1]), i]), h('div', { class: 'row end' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: () => close(Object.fromEntries(ins.map(([k, i]) => [k, i.value]))) }, ok || 'OK')));
      ins.forEach(([, i]) => i.addEventListener('keydown', e => { if (e.key === 'Enter') close(Object.fromEntries(ins.map(([k, x]) => [k, x.value]))); }));
      setTimeout(() => ins[0] && ins[0][1].select(), 30);
    });
  }
  const promptText = async (label, v) => { const r = await formDialog(label, [['v', label, v]]); return r ? r.v : null; };
  const confirmDlg = (msg, ok) => dialog((box, close) => box.append(h('p', { style: { margin: '4px 0 6px', lineHeight: '1.5' } }, msg), h('div', { class: 'row end' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => close(false) }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: () => close(true) }, ok || 'OK'))));

  // ---------- selection actions ----------
  let CLIP = null;
  function cloneItem(it, dx, dy) {
    const n = JSON.parse(JSON.stringify(strip(it))); n.id = uid();
    if (n.t === 'ink') { for (let i = 0; i < n.pts.length; i += 3) { n.pts[i] += dx; n.pts[i + 1] += dy; } } else { n.x += dx; n.y += dy; }
    return n;
  }
  function copySel(p) { const items = p.selItems(); if (!items.length) return; CLIP = { items: items.map(strip), bb: p.selBB(), from: p.doc.pages[p.sel.i].id, n: 0 }; toast('Copied ' + items.length + ' item' + (items.length > 1 ? 's' : '')); }
  function deleteSel(p) { const pg = p.doc.pages[p.sel.i], ids = p.sel.ids; p.clearSel(); setItems(p.doc, pg, pg.items.filter(x => !ids.has(x.id))); }
  function duplicateSel(p) { const pg = p.doc.pages[p.sel.i], items = p.selItems().map(it => cloneItem(it, 24, 24)); setItems(p.doc, pg, pg.items.concat(items)); p.select(p.sel.i, items.map(x => x.id)); }
  function recolourSel(p, c) { const pg = p.doc.pages[p.sel.i]; setItems(p.doc, pg, pg.items.map(it => { if (!p.sel.ids.has(it.id)) return it; if (it.t === 'ink') { const n = Object.assign({}, it, { c }); delete n._p; return n; } if (it.t === 'text') return Object.assign({}, it, it.sticky ? { sticky: c === '#1d1d1f' ? '#ffe88a' : c } : { c }); return it; })); }
  function orderSel(p, dir) { const pg = p.doc.pages[p.sel.i], inS = pg.items.filter(x => p.sel.ids.has(x.id)), out = pg.items.filter(x => !p.sel.ids.has(x.id)); setItems(p.doc, pg, dir > 0 ? out.concat(inS) : inS.concat(out)); }
  function selectAll() { const p = active; if (!p || !p.doc) return; const i = p.currentPage(), pg = p.doc.pages[i]; if (!pg.items.length) return toast('This page is empty.'); setTool('lasso'); p.select(i, pg.items.map(x => x.id)); }
  function pasteClip() {
    const p = active; if (!p || !p.doc) return; if (!CLIP) return toast('Nothing copied yet: select with the lasso, then Copy.');
    const at = p.insertPoint(); CLIP.n++;
    let dx, dy;
    if (CLIP.from === at.pg.id) { dx = dy = 24 * CLIP.n; } else { dx = at.x - (CLIP.bb[0] + CLIP.bb[2]) / 2; dy = at.y - (CLIP.bb[1] + CLIP.bb[3]) / 2; }
    const items = CLIP.items.map(it => cloneItem(it, dx, dy));
    setItems(p.doc, at.pg, at.pg.items.concat(items)); p.select(at.i, items.map(x => x.id));
  }
  async function clearPage() {
    const p = active; if (!p || !p.doc) return; const pg = p.doc.pages[p.currentPage()];
    if (!pg.items.length) return toast('This page is already empty.');
    if (await confirmDlg('Clear everything written and placed on this page? (Undo brings it back.)', 'Clear page')) setItems(p.doc, pg, []);
  }

  // ---------- pages ----------
  function addPageAfter(p, i, over) {
    const d = p.doc, ref = d.pages[i] || d.pages[d.pages.length - 1];
    const pg = newPage(d, Object.assign({ w: ref.w, h: ref.h, paper: Object.assign({}, ref.paper) }, over || {}));
    const arr = d.pages.slice(); arr.splice(i + 1, 0, pg); setPages(d, arr);
    p.layout(); requestAnimationFrame(() => { p.gotoPage(i + 1); });
    toast('Added page ' + (i + 2));
  }
  function pageMenu(p, i, anchor) {
    const d = p.doc;
    menu(anchor, m => m.append(
      mi('↑', 'Add page before', () => { const ref = d.pages[i], pg = newPage(d, { w: ref.w, h: ref.h, paper: Object.assign({}, ref.paper) }); const a = d.pages.slice(); a.splice(i, 0, pg); setPages(d, a); }),
      mi('↓', 'Add page after', () => addPageAfter(p, i)),
      mi('⧉', 'Duplicate page', () => { const src = d.pages[i], pg = JSON.parse(JSON.stringify(strip(src))); pg.id = 'p' + uid(); pg.items.forEach(x => x.id = uid()); const a = d.pages.slice(); a.splice(i + 1, 0, pg); setPages(d, a); }),
      mi('▤', 'Paper and size…', () => paperDialog(p, i)),
      i > 0 ? mi('⇡', 'Move up', () => { const a = d.pages.slice(); [a[i - 1], a[i]] = [a[i], a[i - 1]]; setPages(d, a); }) : null,
      i < d.pages.length - 1 ? mi('⇣', 'Move down', () => { const a = d.pages.slice(); [a[i + 1], a[i]] = [a[i], a[i + 1]]; setPages(d, a); }) : null,
      mi('⤓', 'Export this page as PDF', () => exportPDF(d, d.pages[i])),
      h('hr'),
      d.pages.length > 1 ? mi('🗑', 'Delete page', () => { const a = d.pages.slice(); a.splice(i, 1); setPages(d, a); toast('Deleted page ' + (i + 1) + ' (undo brings it back)'); }) : null));
  }
  function paperPreview(type, color, w, hh) {
    const c = h('canvas'); c.width = w * 2; c.height = hh * 2; c.style.width = w + 'px'; c.style.height = hh + 'px';
    const x = c.getContext('2d'); x.fillStyle = color; x.fillRect(0, 0, c.width, c.height); x.scale(c.width / 794, c.height / 1123);
    drawPaper(x, { w: 794, h: 1123, paper: { type, color } }, 0, 0, 794, 1123, 0.6); return c;
  }
  // choose paper, colour and size, for a new notebook or for pages of an open one
  function paperPicker(state, box) {
    const draw = () => {
      box.textContent = '';
      box.append(h('label', { class: 'f' }, 'Paper'), h('div', { class: 'opts' }, ...PAPERS.map(([k, l]) => h('div', { class: 'opt' + (state.type === k ? ' on' : ''), onclick: () => { state.type = k; draw(); } }, paperPreview(k, state.color, 48, 66), l))));
      box.append(h('label', { class: 'f' }, 'Paper colour'), h('div', { class: 'cols' }, ...PCOLS.map(([c, l]) => h('i', { class: state.color === c ? 'on' : '', title: l, style: { background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25)' }, onclick: () => { state.color = c; draw(); } }))));
      if (state.size !== undefined) { const s = h('select', {}, ...Object.entries(SIZES).map(([k, v]) => h('option', { value: k, selected: k === state.size ? true : null }, v[2]))); s.addEventListener('change', () => { state.size = s.value; }); box.append(h('label', { class: 'f' }, 'Page size'), s); }
    };
    draw();
  }
  function paperDialog(p, i) {
    const d = p.doc, pg = d.pages[i], st = { type: pg.paper.type, color: pg.paper.color, size: Object.keys(SIZES).find(k => SIZES[k][0] === pg.w && SIZES[k][1] === pg.h) || 'a4' };
    if (pg.bg) delete st.size;
    dialog((box, close) => {
      const inner = h('div'); paperPicker(st, inner);
      const apply = all => { const pages = d.pages.map((x, j) => { if (!all && j !== i) return x; const n = Object.assign({}, x, { paper: { type: st.type, color: st.color } }); if (st.size && !x.bg) { n.w = SIZES[st.size][0]; n.h = SIZES[st.size][1]; } return n; }); setPages(d, pages); close(true); };
      box.append(h('h2', {}, 'Paper'), inner, h('div', { class: 'row end' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn', type: 'button', onclick: () => apply(true) }, 'All pages'), h('button', { class: 'btn primary', type: 'button', onclick: () => apply(false) }, 'This page')));
    });
  }

  // ---------- inserting: pictures, text, stickies, tables, PDFs, and anything from Psi Phi Studio ----------
  const PSI_CATS = [['add', '＋', 'Basics: titles, arrows, shapes, labels'], ['text', 'T', 'Text and titles'], ['shapes', '◯', 'Shapes'], ['graphs', '∿', 'Graphs, plots and charts'], ['logic', '∀', 'Logic, inference rules, axioms'], ['physics', '⚛', 'Physics'], ['maths', '∑', 'Maths'], ['prob', 'P', 'Probability'],
    ['nodes', '⋰', 'Nodes and diagrams'], ['geometry', '∞', 'Geometry'], ['3d', '⬢', '3D shapes and sculpts'], ['molecules', '⌬', 'Molecules'], ['pdbs', '🧬', 'Proteins (PDB)'], ['anatomy', '❦', 'Anatomy'], ['cell', '◉', 'Cell biology'], ['stickers', '★', 'Stickers'], ['media', '▨', 'Media'], ['library', '❖', 'Your saved library']];
  const STICKIES = ['#ffe88a', '#bdf0a8', '#a8e1f5', '#f9c2e0', '#ffd0a1', '#e2d4ff'];
  function insertMenu(anchor) {
    const p = active;
    if (!p || p.kind !== 'doc') return toast('Open a notebook or whiteboard first.');
    menu(anchor, m => {
      m.append(h('h5', {}, 'Insert'),
        mi('🖼', 'Photo or picture…', () => $('#fileImg').click()), mi('📷', 'Camera…', () => $('#fileCam').click()),
        mi('T', 'Text box', () => { const at = p.insertPoint(); setTool('text'); p.newText(at.pg, at.x - 160, at.y - 20, 320); }),
        h('div', { style: { display: 'flex', gap: '6px', padding: '6px 10px', alignItems: 'center' } }, h('span', { style: { color: 'var(--muted)', fontSize: '13px', marginRight: '4px' } }, 'Sticky note'), ...STICKIES.map(c => h('i', { style: { width: '24px', height: '24px', borderRadius: '5px', background: c, cursor: 'pointer', display: 'inline-block' }, onclick: () => { closeMenus(); const at = p.insertPoint(); p.newText(at.pg, at.x - 110, at.y - 100, 220, { sticky: c, size: 20, font: 'hand' }); } }))),
        mi('▦', 'Table', () => { const at = p.insertPoint(); const it = p.newText(at.pg, at.x - 200, at.y - 60, 400); setTimeout(() => { restoreRange(); document.execCommand('insertHTML', false, '<table><tr><th>Heading</th><th>Heading</th><th>Heading</th></tr><tr><td><br></td><td><br></td><td><br></td></tr><tr><td><br></td><td><br></td><td><br></td></tr></table><p><br></p>'); }, 60); }),
        mi('◯', 'Shape', () => setTool('shape')),
        p.doc.kind !== 'board' ? mi('📄', 'New page after this one', () => addPageAfter(p, p.currentPage())) : null,
        p.doc.kind !== 'board' ? mi('⎘', 'PDF pages into this notebook…', () => { pdfTarget = p; $('#filePdf').click(); }) : null,
        h('hr'), h('h5', {}, 'From Psi Phi Studio'),
        mi('Ψ', 'Psi Phi stage: anything at all…', () => openFigure(p, {})),
        h('div', { class: 'mgrid' }, ...PSI_CATS.map(([id, ic, l]) => mi(ic, l, () => openFigure(p, { tray: id })))),
        h('hr'), h('h5', {}, 'Studios'),
        mi('◕', 'ClayForm 3D sculpt…', () => clayMenu(anchor, p)),
        mi('🖌', 'Tabula drawing or animation', () => openStudio(p, 'tabula', 'art')),
        mi('▦', '8-Bit pixel art', () => openStudio(p, '8bit', 'px')),
        mi('¶', 'Logos document: text, table or picture', () => openStudio(p, 'logos', 'logos')),
        mi('▤', 'Calsheet: table or chart', () => openStudio(p, 'calsheet', 'calc')),
        h('hr'), h('h5', {}, 'Side by side'),
        mi('◫', 'Open an app beside this note…', () => appMenu(anchor)));
    });
  }
  function clayMenu(anchor, p) {
    const K = [['head', '◕ Clay head to sculpt'], ['blob', '● Clay ball'], ['puppet', '🪆 Puppet mannequin'], ['biped', '🚶 Biped (walk cycle)'], ['quadruped', '🐕 Quadruped'], ['octopus', '🐙 Octopus'], ['hexapod', '🐜 Hexapod'], ['octopod', '🕷 Spider']];
    menu(anchor, m => { m.append(h('h5', {}, 'ClayForm: sculpt, rig and pose, then add to the note')); for (const [k, l] of K) m.append(mi('', l, () => openFigure(p, { clay: k }))); });
  }
  const APPS = [['index.html', 'Ψ Psi Phi Studio'], ['logos.html', '¶ Logos'], ['calsheet.html', '▤ Calsheet'], ['tabula.html', '🖌 Tabula'], ['clayform.html', '◕ ClayForm'], ['8bit.html', '▦ 8-Bit'], ['finalstage.html', '🎬 Final Stage'], ['notes.html?pane=1', '✎ Psi Phi Notes (another window)']];
  function appMenu(anchor) {
    menu(anchor, m => {
      m.append(h('h5', {}, 'A note beside this one'));
      const recent = ITEMS.filter(i => i.kind !== 'folder' && !i.trashed).sort((a, b) => b.updated - a.updated).slice(0, 8);
      for (const it of recent) m.append(mi(it.kind === 'board' ? '▢' : '📓', it.name, () => openItem(it.id, true)));
      m.append(mi('⌂', 'Choose from the library…', () => { besideNext = true; showLibrary(); toast('Pick a note: it opens beside the current one.'); }), h('hr'), h('h5', {}, 'A Psi Phi app beside your note'));
      for (const [src, l] of APPS.slice(0, 7)) m.append(mi(l.split(' ')[0], l.slice(l.indexOf(' ') + 1), () => openAppPane(src, l.slice(l.indexOf(' ') + 1))));
    });
  }
  let besideNext = false, pdfTarget = null;
  function switchMenu(p, anchor) {
    menu(anchor, m => {
      m.append(h('h5', {}, 'Show in this pane'));
      const recent = ITEMS.filter(i => i.kind !== 'folder' && !i.trashed).sort((a, b) => b.updated - a.updated).slice(0, 10);
      for (const it of recent) m.append(mi(it.kind === 'board' ? '▢' : '📓', it.name, async () => { const d = await loadDoc(it.id); if (d) { p.open(d); setActive(p); p.title(); saveSession(); } }));
      m.append(h('hr'));
      for (const [src, l] of APPS.slice(0, 7)) m.append(mi(l.split(' ')[0], l.slice(l.indexOf(' ') + 1), () => { p.openApp(src, l.slice(l.indexOf(' ') + 1)); setActive(p); renderOpts(); saveSession(); }));
    });
  }
  function fitBox(at, w, hh, maxW) { const k = Math.min(1, (maxW || at.maxW || 500) / w, (at.pg.infinite ? 1e9 : (at.pg.h * 0.8)) / hh); return [w * k, hh * k]; }
  function place(p, at, it) {
    if (!at.pg.infinite) { it.x = clamp(it.x, 0, Math.max(0, at.pg.w - it.w)); it.y = clamp(it.y, 0, Math.max(0, at.pg.h - it.h)); }
    const pg = p.doc.pages.find(x => x.id === at.pg.id) || at.pg;
    setItems(p.doc, pg, pg.items.concat([it]));
    p.select(p.doc.pages.indexOf(pg), [it.id]);
  }
  function imgSize(blob) { return new Promise(res => { const u = URL.createObjectURL(blob), im = new Image(); im.onload = () => { res({ w: im.naturalWidth, h: im.naturalHeight, im }); }; im.onerror = () => res(null); im.src = u; }); }
  async function prepImage(blob) {
    const s = await imgSize(blob); if (!s) return null;
    const big = Math.max(s.w, s.h);
    if (big <= 2600 && blob.size < 4e6) return { blob, w: s.w, h: s.h };
    const k = Math.min(1, 2600 / big), c = h('canvas'); c.width = Math.round(s.w * k); c.height = Math.round(s.h * k);
    c.getContext('2d').drawImage(s.im, 0, 0, c.width, c.height);
    const type = blob.type === 'image/png' ? 'image/png' : 'image/jpeg';
    return { blob: await new Promise(r => c.toBlob(r, type, 0.9)), w: c.width, h: c.height };
  }
  async function insertImages(files, p) {
    p = p || active; if (!p || !p.doc) return;
    let n = 0;
    for (const f of files) {
      if (!f.type.startsWith('image/')) continue;
      const r = await prepImage(f); if (!r) { toast('Couldn’t read ' + (f.name || 'that picture')); continue; }
      const at = p.insertPoint(), id = await putBlob(r.blob, 'img'), [w, hh] = fitBox(at, r.w, r.h, at.maxW * 0.7);
      place(p, at, { id: uid(), t: 'img', x: at.x - w / 2 + n * 24, y: at.y - hh / 2 + n * 24, w, h: hh, blob: id, name: f.name || 'Picture' });
      n++;
    }
  }
  $('#fileImg').addEventListener('change', e => { insertImages([...e.target.files]); e.target.value = ''; });
  $('#fileCam').addEventListener('change', e => { insertImages([...e.target.files]); e.target.value = ''; });
  $('#filePdf').addEventListener('change', async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const target = pdfTarget; pdfTarget = null;
    try {
      const pages = await pdfToPages(f, (n, N) => toast('Reading the PDF… page ' + n + ' of ' + N, 60000));
      if (target && target.doc) { const d = target.doc, i = target.currentPage(), a = d.pages.slice(); a.splice(i + 1, 0, ...pages); setPages(d, a); target.layout(); target.gotoPage(i + 1); toast('Added ' + pages.length + ' PDF page' + (pages.length > 1 ? 's' : '') + '. Write on them with any pen.'); }
      else { const it = await createDoc('notebook', { name: f.name.replace(/\.pdf$/i, ''), pages, pdf: true, parent: libFolder }); toast('Imported ' + pages.length + ' pages. Annotate with any pen; export to share.'); await openItem(it.id, besideNext); besideNext = false; }
    } catch (err) { toast(err.message || 'Couldn’t open that PDF.', 5000); }
  });

  // ---------- overlays: Psi Phi Studio in figure mode, and the studios ----------
  let OV = null;
  function openOverlay(src, o) {
    if (OV) return;
    const frame = h('iframe', { src, title: o.title, allow: 'camera; fullscreen; clipboard-read; clipboard-write; gamepad' });
    const useBtn = o.useLabel ? h('button', { class: 'btn primary', type: 'button', disabled: true }, 'Loading…') : null;
    let ready = false, waiting = null;
    const close = () => { removeEventListener('message', onMsg); clearInterval(pinger); clearTimeout(waiting); ov.remove(); OV = null; };
    const bar = h('div', { class: 'ovbar' }, h('b', {}, o.title), h('span', { class: 'grow', style: { color: 'var(--muted)', fontSize: '12.5px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, o.help || ''), h('button', { class: 'btn quiet', type: 'button', onclick: close }, 'Cancel'), useBtn);
    if (!o.bar) bar.hidden = true;
    const ov = h('div', { id: 'ov', role: 'dialog', 'aria-label': o.title }, bar, frame);
    const reset = () => { clearTimeout(waiting); if (useBtn) { useBtn.disabled = false; useBtn.textContent = o.useLabel; } };
    const pinger = setInterval(() => { if (ready) return clearInterval(pinger); try { frame.contentWindow.postMessage({ type: 'st-ping' }, '*'); } catch (e) { } }, 1000);
    setTimeout(() => { if (!ready) { bar.hidden = false; reset(); } }, 12000);
    function onMsg(e) {
      if (e.source !== frame.contentWindow) return;
      const d = e.data || {};
      if (d.type === 'st-ready') { ready = true; clearInterval(pinger); reset(); }
      else if (d.type === 'st-cancel') { if (o.figure) close(); else reset(); }
      else if (d.type === 'st-error') { reset(); toast('Couldn’t bring it in: ' + d.message, 5000); }
      else if (d.type === 'st-result') { clearTimeout(waiting); Promise.resolve(o.onResult(d)).then(keep => { if (!keep) close(); else reset(); }).catch(err => { toast('Couldn’t add it: ' + (err.message || err), 5000); reset(); }); }
    }
    addEventListener('message', onMsg);
    if (useBtn) useBtn.addEventListener('click', () => { useBtn.disabled = true; useBtn.textContent = 'Preparing…'; try { frame.contentWindow.postMessage({ type: 'st-export' }, '*'); } catch (e) { } waiting = setTimeout(reset, 180000); });
    document.body.append(ov); OV = { ov, close };
  }
  function openFigure(p, q, editIt) {
    if (!p || !p.doc) return;
    const at = editIt ? null : p.insertPoint(), pgId = editIt ? p.doc.pages[p.sel ? p.sel.i : p.currentPage()].id : at.pg.id;
    const pg = p.doc.pages.find(x => x.id === pgId), paper = (pg && pg.paper.color) || '#ffffff';
    const qs = new URLSearchParams({ embed: '1', figure: '1', aspect: '4:3', bg: editIt && editIt.bg ? editIt.bg : (isDark(paper) ? paper : '#FFFFFF'), t: Date.now() });
    for (const k in q) if (q[k] != null) qs.set(k, q[k]);
    if (editIt) { if (!LS.set('psiphi-notes.fig', editIt.scene)) return toast('Not enough room to open this figure for editing.'); qs.set('edit', '1'); }
    openOverlay('index.html?' + qs, { title: 'Ψ Psi Phi Studio', figure: true, onResult: d => figureResult(p, d, editIt, at) });
  }
  async function figureResult(p, d, editIt, at) {
    if (d.kind !== 'figure') return;
    const blob = d.png instanceof Blob ? d.png : new Blob([d.png], { type: 'image/png' });
    const id = await putBlob(blob, 'fig'), vid = d.video ? await putBlob(d.video, 'vid') : null;
    const base = { blob: id, video: vid || undefined, scene: d.scene, bg: d.bg, name: (d.name || 'Figure').slice(0, 40), dur: d.duration, link: undefined };
    if (editIt) {
      const pg = p.doc.pages.find(x => x.items.some(i => i.id === editIt.id)); if (!pg) return;
      setItems(p.doc, pg, pg.items.map(x => x.id === editIt.id ? Object.assign({}, x, base, { h: x.w * d.h / d.w }) : x));
      toast('Updated the figure.'); return;
    }
    const [w, hh] = fitBox(at, d.w * 0.3, d.h * 0.3);
    place(p, at, Object.assign({ id: uid(), t: 'fig', x: at.x - w / 2, y: at.y - hh / 2, w, h: hh }, base));
    toast(vid ? 'Added the figure with its animation: tap ▶ to play.' : 'Added the figure. Select it and tap ✎ Edit figure to change it.', 3500);
  }
  function editFigure(p, it) { openFigure(p, {}, it); }
  function csvToTable(csv, header) {
    const rows = (window.Sci2D ? null : null) || csv.trim().split(/\r?\n/).map(l => { const out = []; let cur = '', q = false; for (let i = 0; i < l.length; i++) { const c = l[i]; if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; } else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c; } out.push(cur); return out; });
    return '<table>' + rows.map((r, i) => '<tr>' + r.map(c => (i === 0 && header !== false ? '<th>' : '<td>') + esc(c) + (i === 0 && header !== false ? '</th>' : '</td>')).join('') + '</tr>').join('') + '</table>';
  }
  function openStudio(p, file, kind) {
    const at = p.insertPoint();
    const names = { tabula: ['🖌 Tabula', 'Paint or animate, then tap ✓ Add to note.'], '8bit': ['▦ 8-Bit', 'Draw pixels, then tap ✓ Add to note.'], logos: ['¶ Logos', 'Select text, a table or a picture (or nothing for the whole page), then ✓ Add to note.'], calsheet: ['▤ Calsheet', 'Select cells, then ✓ Add to note for a table or chart.'] }[file];
    openOverlay(file + '.html?embed=1&new=' + (kind === 'logos' ? 'doc' : '') + '&t=' + Date.now(), { title: names[0], help: names[1], bar: true, useLabel: '✓ Add to note', onResult: d => studioResult(p, at, d) });
  }
  async function studioResult(p, at, d) {
    const link = d.app === 'calsheet' || d.app === 'logos' ? { app: d.app, id: d.projId } : d.projId ? { app: d.kind === 'sprite' ? '8bit' : 'tabula', id: d.projId } : undefined;
    if (d.kind === 'panel') { openLinked({ app: d.source || d.app, id: d.projId }); return; }
    if (d.kind === 'text') {
      const lines = String(d.text || '').split('\n'), html = d.heading ? '<h2>' + esc(lines.join(' ')) + '</h2>' : lines.map(l => '<div>' + (esc(l) || '<br>') + '</div>').join('');
      const w = Math.min(at.maxW, 520); place(p, at, { id: uid(), t: 'text', x: at.x - w / 2, y: at.y - 40, w, h: 80, html, font: d.font === 'mono' ? 'mono' : d.font === 'main' ? 'latex' : 'sans', size: S.text.size, c: S.text.c, link }); return;
    }
    if (d.kind === 'table') { const w = Math.min(at.maxW, 560); place(p, at, { id: uid(), t: 'text', x: at.x - w / 2, y: at.y - 60, w, h: 120, html: csvToTable(d.csv || '', d.header), font: 'sans', size: 15, c: '#1d1d1f', link }); return; }
    if (d.kind === 'chart') { LS.set('psiphi-notes.seed', Object.assign({}, d, { type: undefined })); setTimeout(() => openFigure(p, { seed: '1' }), 80); return; }
    if (d.kind === 'image') { const id = await putBlob(new Blob([d.buf], { type: 'image/png' }), 'img'), [w, hh] = fitBox(at, d.w * 0.5, d.h * 0.5); place(p, at, { id: uid(), t: 'img', x: at.x - w / 2, y: at.y - hh / 2, w, h: hh, blob: id, name: d.name, link }); return; }
    let frames = [];
    if (d.kind === 'sprite') {
      const sheet = await imgSize(new Blob([d.buf], { type: 'image/png' })); if (!sheet) return;
      const fw = sheet.w / (d.cols || 1), fh = sheet.h / (d.rows || 1), sc = Math.max(1, Math.floor(512 / Math.max(fw, fh)));
      for (let f = 0; f < (d.frames || 1); f++) { const c = h('canvas'); c.width = fw * sc; c.height = fh * sc; const x = c.getContext('2d'); x.imageSmoothingEnabled = false; x.drawImage(sheet.im, (f % d.cols) * fw, Math.floor(f / d.cols) * fh, fw, fh, 0, 0, c.width, c.height); frames.push(await putBlob(await new Promise(r => c.toBlob(r, 'image/png')), 'px')); }
    } else for (const b of d.bufs || []) frames.push(await putBlob(new Blob([b], { type: 'image/png' }), 'art'));
    if (!frames.length) return;
    const W = d.kind === 'sprite' ? 256 : d.w * 0.5, H = d.kind === 'sprite' ? 256 * d.h / d.w : d.h * 0.5, [w, hh] = fitBox(at, W, H);
    place(p, at, { id: uid(), t: 'img', x: at.x - w / 2, y: at.y - hh / 2, w, h: hh, blob: frames[0], frames: frames.length > 1 ? frames : undefined, fps: d.fps || 12, name: d.name, link, pixel: d.kind === 'sprite' || undefined });
    if (frames.length > 1) toast('Added a ' + frames.length + '-frame animation: tap ▶ to play it.');
  }
  function openLinked(link) {
    const map = { logos: ['logos.html', 'Logos'], calsheet: ['calsheet.html', 'Calsheet'], tabula: ['tabula.html', 'Tabula'], '8bit': ['8bit.html', '8-Bit'] }[link.app];
    if (!map) return; openAppPane(map[0] + '?proj=' + encodeURIComponent(link.id), map[1]);
  }

  // ---------- library ----------
  let libFolder = null, libTrash = false;
  const lib = $('#library');
  function showLibrary() { flushAll(); lib.hidden = false; for (const d of DOCS.values()) if (d._thumbDirty) makeThumb(d); $('#libClose').hidden = !panes.length || (panes.length === 1 && !panes[0].doc && !panes[0].app); renderLibrary(); }
  function hideLibrary() { lib.hidden = true; }
  $('#libBtn').addEventListener('click', showLibrary);
  $('#libClose').addEventListener('click', () => { besideNext = false; hideLibrary(); });
  $('#libSearch').addEventListener('input', () => renderLibrary());
  $('#libSort').addEventListener('change', () => renderLibrary());
  const FOLDER_SVG = '<svg viewBox="0 0 100 76"><path d="M4 12a6 6 0 0 1 6-6h24l8 8h48a6 6 0 0 1 6 6v46a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="#5b8def"/><path d="M4 24a6 6 0 0 1 6-6h80a6 6 0 0 1 6 6v42a6 6 0 0 1-6 6H10a6 6 0 0 1-6-6z" fill="#7aa5f7"/></svg>';
  function folderPath(id) { const out = []; let f = itemOf(id), n = 0; while (f && n++ < 40) { out.unshift(f); f = itemOf(f.parent); } return out; }
  function renderLibrary() {
    const side = $('#libSide'), main = $('#libMain'), q = $('#libSearch').value.trim().toLowerCase(), sort = $('#libSort').value;
    side.textContent = ''; main.textContent = '';
    const live = ITEMS.filter(i => !i.trashed);
    const fi = (icon, label, on, fn, depth) => h('div', { class: 'fi' + (on ? ' on' : ''), style: { paddingLeft: 9 + (depth || 0) * 14 + 'px' }, onclick: fn }, h('span', {}, icon), h('span', {}, label));
    side.append(fi('📚', 'All notes', !libFolder && !libTrash, () => { libFolder = null; libTrash = false; renderLibrary(); }));
    const tree = (parent, depth) => { for (const f of live.filter(i => i.kind === 'folder' && (i.parent || null) === parent).sort((a, b) => a.name.localeCompare(b.name))) { const row = fi('📁', f.name, libFolder === f.id && !libTrash, () => { libFolder = f.id; libTrash = false; renderLibrary(); }, depth); row.append(h('button', { type: 'button', 'aria-label': 'Options for ' + f.name, style: { marginLeft: 'auto', border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', padding: '0 4px' }, onclick: e => { e.stopPropagation(); itemMenu(f, e.currentTarget); } }, '⋯')); row.addEventListener('contextmenu', e => { e.preventDefault(); itemMenu(f, { x: e.clientX, y: e.clientY }); }); side.append(row); tree(f.id, depth + 1); } };
    side.append(h('h4', {}, 'Folders')); tree(null, 0);
    side.append(h('h4', {}, 'More'), fi('🗑', 'Recently deleted', libTrash, () => { libTrash = true; renderLibrary(); }));
    side.append(h('h4', {}, 'Psi Phi'), ...APPS.slice(0, 7).map(([src, l]) => fi(l.split(' ')[0], l.slice(l.indexOf(' ') + 1), false, () => openAppPane(src, l.slice(l.indexOf(' ') + 1), panes.length ? true : false))));
    // breadcrumbs
    const crumbs = h('div', { class: 'crumbs' });
    if (libTrash) crumbs.append(h('span', {}, 'Recently deleted'));
    else if (q) crumbs.append(h('span', {}, 'Search: “' + q + '”'));
    else { crumbs.append(h('span', { onclick: () => { libFolder = null; renderLibrary(); } }, 'All notes')); for (const f of folderPath(libFolder)) crumbs.append('›', h('span', { title: f.id === libFolder ? 'Tap to rename' : null, onclick: async () => { if (f.id !== libFolder) { libFolder = f.id; renderLibrary(); return; } const n = await promptText('Rename folder', f.name); if (n && n.trim()) { f.name = n.trim().slice(0, 80); await saveItem(f); renderLibrary(); } } }, f.name)); }
    main.append(crumbs);
    let list = libTrash ? ITEMS.filter(i => i.trashed) : q ? live.filter(i => i.name.toLowerCase().includes(q)) : live.filter(i => (i.parent || null) === libFolder);
    const cmp = sort === 'name' ? (a, b) => a.name.localeCompare(b.name) : sort === 'created' ? (a, b) => (b.created || 0) - (a.created || 0) : (a, b) => (b.updated || 0) - (a.updated || 0);
    list = list.filter(i => i.kind === 'folder').sort((a, b) => a.name.localeCompare(b.name)).concat(list.filter(i => i.kind !== 'folder').sort(cmp));
    if (libTrash && list.length) main.append(h('div', { style: { marginBottom: '14px' } }, h('button', { class: 'btn danger', type: 'button', onclick: async () => { if (!(await confirmDlg('Delete everything in Recently deleted for good?', 'Delete for good'))) return; for (const it of ITEMS.filter(i => i.trashed)) await destroy(it); renderLibrary(); } }, 'Empty Recently deleted')));
    if (!list.length) {
      main.append(h('div', { class: 'empty' }, libTrash ? 'Nothing here. Deleted notes wait here until you empty it.' : q ? 'No notes match.' : h('div', {}, h('p', {}, 'No notes here yet.'), h('div', { class: 'row', style: { justifyContent: 'center', display: 'flex', gap: '8px', flexWrap: 'wrap' } }, h('button', { class: 'btn primary', type: 'button', onclick: () => newNotebookDialog() }, '📓 New notebook'), h('button', { class: 'btn', type: 'button', onclick: () => newBoard() }, '▢ New whiteboard'), h('button', { class: 'btn', type: 'button', onclick: () => importPdf() }, '⎘ Import a PDF'), h('button', { class: 'btn', type: 'button', onclick: () => newFolder() }, '📁 New folder')))));
      return;
    }
    const grid = h('div', { class: 'grid' });
    for (const it of list) {
      let cover;
      if (it.kind === 'folder') { const n = live.filter(x => x.parent === it.id).length; cover = h('div', { class: 'cover folder', html: FOLDER_SVG }); cover.append(h('span', { class: 'kind', style: { left: '8px' } }, n + ' item' + (n === 1 ? '' : 's'))); }
      else if (it.kind === 'board') { cover = h('div', { class: 'cover board' }, it.thumb ? h('img', { src: it.thumb, alt: '' }) : null, h('span', { class: 'kind', style: { left: '8px' } }, 'WHITEBOARD')); }
      else { cover = h('div', { class: 'cover nb', style: { background: it.cover } }, it.thumb && (it.pdf || it.showThumb !== false) ? h('img', { src: it.thumb, alt: '' }) : h('span', { class: 'ttl' }, it.name), h('span', { class: 'kind' }, it.pdf ? 'PDF' : 'NOTEBOOK')); }
      const card = h('div', { class: 'card', onclick: () => { if (libTrash) return; if (it.kind === 'folder') { libFolder = it.id; $('#libSearch').value = ''; renderLibrary(); } else { openItem(it.id, besideNext); besideNext = false; } } }, cover, h('div', { class: 'nm', title: it.name }, it.name), h('div', { class: 'dt' }, it.kind === 'folder' ? 'Folder' : fmtDate(it.updated)));
      const more = h('button', { class: 'more', type: 'button', 'aria-label': 'Options for ' + it.name, onclick: e => { e.stopPropagation(); itemMenu(it, e.currentTarget); } }, '⋯');
      card.append(more); grid.append(card);
    }
    main.append(grid);
  }
  function itemMenu(it, anchor) {
    menu(anchor, m => {
      if (it.trashed) { m.append(mi('↺', 'Put back', async () => { delete it.trashed; if (it.parent && !itemOf(it.parent)) it.parent = null; await saveItem(it); renderLibrary(); }), mi('🗑', 'Delete for good', async () => { if (await confirmDlg('Delete “' + it.name + '” for good?', 'Delete')) { await destroy(it); renderLibrary(); } })); return; }
      if (it.kind !== 'folder') m.append(mi('↗', 'Open', () => openItem(it.id)), mi('◫', 'Open beside the current note', () => openItem(it.id, true)));
      else m.append(mi('📂', 'Open', () => { libFolder = it.id; renderLibrary(); }));
      m.append(mi('✎', 'Rename', async () => { const n = await promptText('Name', it.name); if (n && n.trim()) { it.name = n.trim().slice(0, 80); it.updated = Date.now(); await saveItem(it); renderLibrary(); for (const p of panes) if (p.item === it) p.title(); } }),
        mi('➜', 'Move to folder…', () => moveDialog(it)));
      if (it.kind !== 'folder') {
        m.append(mi('⧉', 'Duplicate', async () => { const d = await loadDoc(it.id); const copy = JSON.parse(JSON.stringify(strip(d))); copy.pages.forEach(p => { p.id = 'p' + uid(); }); const n = await createDoc(it.kind, { name: it.name + ' copy', parent: it.parent, cover: it.cover, pages: copy.pages, pdf: it.pdf }); if (it.kind === 'board') { const nd = DOCS.get(n.id); nd.pages = copy.pages; await saveDocNow(nd); } n.thumb = it.thumb; await saveItem(n); renderLibrary(); }),
          mi('⤓', 'Export as PDF', async () => exportPDF(await loadDoc(it.id))));
        if (it.kind === 'notebook') m.append(h('div', { style: { display: 'flex', gap: '5px', padding: '6px 10px', flexWrap: 'wrap' } }, h('span', { style: { color: 'var(--muted)', fontSize: '12.5px', width: '100%' } }, 'Cover'), ...COVERS.map(c => h('i', { style: { width: '22px', height: '22px', borderRadius: '5px', background: c, cursor: 'pointer', display: 'inline-block' }, onclick: async () => { closeMenus(); it.cover = c; it.showThumb = false; await saveItem(it); renderLibrary(); } })), h('button', { type: 'button', style: { width: 'auto', padding: '2px 8px' }, onclick: async () => { closeMenus(); it.showThumb = true; await saveItem(it); renderLibrary(); } }, 'First page')));
      }
      m.append(h('hr'), mi('🗑', 'Delete', async () => { await trash(it); renderLibrary(); }));
    });
  }
  async function trash(it) {
    const now = Date.now(), mark = async x => { x.trashed = now; await saveItem(x); for (const c of ITEMS.filter(y => y.parent === x.id && !y.trashed)) await mark(c); };
    await mark(it);
    for (const p of panes.slice()) if (p.item && p.item.trashed) closePane(p);
    toast('Moved “' + it.name + '” to Recently deleted.');
  }
  async function destroy(it) {
    ITEMS = ITEMS.filter(x => x !== it); await dbDel('items', it.id);
    if (it.kind !== 'folder') { const d = await loadDoc(it.id); if (d) { const ids = new Set(); for (const pg of d.pages) { if (pg.bg) ids.add(pg.bg); if (pg.pdf) ids.add(pg.pdf.id); for (const x of pg.items) { if (x.blob) ids.add(x.blob); if (x.video) ids.add(x.video); (x.frames || []).forEach(f => ids.add(f)); } } for (const b of ids) await dbDel('blobs', b).catch(() => { }); } DOCS.delete(it.id); await dbDel('docs', it.id); }
  }
  function moveDialog(it) {
    dialog((box, close) => {
      const choose = async id => { if (id === it.id || folderPath(id).some(f => f.id === it.id)) return toast('A folder can’t go inside itself.'); it.parent = id; await saveItem(it); close(true); renderLibrary(); };
      const list = h('div', { style: { maxHeight: '50vh', overflowY: 'auto' } });
      list.append(h('div', { class: 'fi', style: { padding: '8px', cursor: 'pointer' }, onclick: () => choose(null) }, '📚 All notes (top level)'));
      const tree = (parent, depth) => { for (const f of ITEMS.filter(i => i.kind === 'folder' && !i.trashed && (i.parent || null) === parent && i.id !== it.id)) { list.append(h('div', { class: 'fi', style: { padding: '8px 8px 8px ' + (8 + depth * 16) + 'px', cursor: 'pointer', borderRadius: '8px' }, onclick: () => choose(f.id) }, '📁 ' + f.name)); tree(f.id, depth + 1); } };
      tree(null, 1);
      box.append(h('h2', {}, 'Move “' + it.name + '”'), list, h('div', { class: 'row end' }, h('button', { class: 'btn', type: 'button', onclick: async () => { const n = await promptText('New folder name', 'New folder'); if (n) { const f = await newFolder(n, true); choose(f.id); } } }, '📁 New folder'), h('button', { class: 'btn quiet', type: 'button', onclick: () => close(null) }, 'Cancel')));
    });
  }
  async function newFolder(name, silent) {
    name = name || await promptText('Folder name', 'New folder'); if (!name) return null;
    const f = { id: 'f' + uid(), kind: 'folder', name: name.trim().slice(0, 80), parent: libFolder, created: Date.now(), updated: Date.now() };
    ITEMS.push(f); await saveItem(f); if (!silent) renderLibrary(); return f;
  }
  async function newBoard() { const it = await createDoc('board', { name: 'Whiteboard ' + (ITEMS.filter(i => i.kind === 'board').length + 1), parent: libFolder }); await openItem(it.id, besideNext); besideNext = false; }
  function importPdf() { pdfTarget = null; $('#filePdf').click(); }
  function newNotebookDialog() {
    const st = { type: 'lined', color: '#ffffff', size: 'a4' }; let cover = COVERS[ITEMS.length % COVERS.length];
    dialog((box, close) => {
      const name = h('input', { type: 'text', value: 'Notebook ' + (ITEMS.filter(i => i.kind === 'notebook').length + 1) });
      const pk = h('div'); paperPicker(st, pk);
      const cv = h('div', { class: 'cols' }); const drawC = () => { cv.textContent = ''; for (const c of COVERS) cv.append(h('i', { class: c === cover ? 'on' : '', style: { background: c }, onclick: () => { cover = c; drawC(); } })); }; drawC();
      box.append(h('h2', {}, 'New notebook'), h('label', { class: 'f' }, 'Name'), name, h('label', { class: 'f' }, 'Cover'), cv, pk,
        h('div', { class: 'row end' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => close(null) }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: async () => { close(true); const it = await createDoc('notebook', { name: name.value.trim() || 'Notebook', paper: st.type, color: st.color, size: st.size, cover, parent: libFolder }); await openItem(it.id, besideNext); besideNext = false; } }, 'Create')));
      setTimeout(() => name.select(), 30);
    });
  }
  function newMenu(anchor) {
    menu(anchor, m => m.append(mi('📓', 'Notebook…', () => newNotebookDialog()), mi('▢', 'Whiteboard (endless page)', () => newBoard()), mi('⎘', 'Import a PDF…', () => importPdf()), mi('📁', 'Folder', () => newFolder()), h('hr'), h('h5', {}, 'Open a Psi Phi app beside'), ...APPS.slice(0, 7).map(([src, l]) => mi(l.split(' ')[0], l.slice(l.indexOf(' ') + 1), () => openAppPane(src, l.slice(l.indexOf(' ') + 1), panes.length ? true : false)))));
  }
  $('#libNew').addEventListener('click', e => newMenu(e.currentTarget));

  // ---------- top bar ----------
  $('#insBtn').addEventListener('click', e => insertMenu(e.currentTarget));
  $('#pagesBtn').addEventListener('click', () => { if (active) active.toggleThumbs(); });
  $('#splitBtn').addEventListener('click', e => appMenu(e.currentTarget));
  $('#docTitle').addEventListener('change', async e => { const p = active; if (!p || !p.item) return; p.item.name = e.target.value.trim().slice(0, 80) || p.item.name; await saveItem(p.item); p.title(); });
  $('#docTitle').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });
  $('#moreBtn').addEventListener('click', e => {
    const p = active, d = p && p.doc, tick = on => on ? '✓' : '';
    menu(e.currentTarget, m => {
      if (d) m.append(mi('⤓', 'Export as PDF', () => exportPDF(d)), d.kind !== 'board' ? mi('⤓', 'Export this page as PDF', () => exportPDF(d, d.pages[p.currentPage()])) : null,
        mi('🖨', 'Print…', () => printDoc(d)), mi('▤', d.kind === 'board' ? 'Background…' : 'Paper and size…', () => d.kind === 'board' ? boardBgDialog(p) : paperDialog(p, p.currentPage())),
        d.kind !== 'board' ? mi('⇅', S.scroll === 'h' ? 'Scroll pages up and down' : 'Scroll pages sideways', () => { S.scroll = S.scroll === 'h' ? 'v' : 'h'; saveS(); for (const x of panes) if (x.doc) { x.layout(); x.fit(); x.syncObjs(); x.draw(); } }) : null,
        mi('⌕', 'Fit to the pane', () => { p.fit(); p.draw(); }), mi('⌫', 'Clear page…', () => clearPage()), h('hr'));
      m.append(h('h5', {}, 'Writing'),
        mi('✎', 'Only the Pencil draws (fingers scroll)', () => { S.pencilOnly = !S.pencilOnly; saveS(); toast(S.pencilOnly ? 'Fingers now scroll and zoom; the Pencil draws.' : 'Fingers draw too.'); }, tick(S.pencilOnly)),
        mi('✐', 'Switch that on when a Pencil is used', () => { S.autoPencil = !S.autoPencil; saveS(); }, tick(S.autoPencil)),
        mi('◿', 'Hold at the end of a stroke to make a shape', () => { S.holdSnap = !S.holdSnap; saveS(); }, tick(S.holdSnap)),
        mi('➹', 'Draw slightly ahead of the Pencil (hides lag)', () => { S.predict = !S.predict; saveS(); }, tick(S.predict)),
        h('hr'), mi('?', 'Gestures and tips', () => helpDialog()), mi('Ψ', 'Back to Psi Phi Studio', () => { flushAll(); location.href = 'index.html'; }));
    });
  });
  function boardBgDialog(p) {
    const pg = p.doc.pages[0], st = { type: pg.paper.type, color: pg.paper.color };
    dialog((box, close) => {
      const draw = () => { inner.textContent = ''; inner.append(h('label', { class: 'f' }, 'Pattern'), h('div', { class: 'opts' }, ...[['dots', 'Dots'], ['grid', 'Grid'], ['lined', 'Lines'], ['blank', 'Plain']].map(([k, l]) => h('div', { class: 'opt' + (st.type === k ? ' on' : ''), onclick: () => { st.type = k; draw(); } }, l))), h('label', { class: 'f' }, 'Colour'), h('div', { class: 'cols' }, ...PCOLS.map(([c, l]) => h('i', { class: st.color === c ? 'on' : '', title: l, style: { background: c, boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.25)' }, onclick: () => { st.color = c; draw(); } })))); };
      const inner = h('div'); draw();
      box.append(h('h2', {}, 'Whiteboard background'), inner, h('div', { class: 'row end' }, h('button', { class: 'btn quiet', type: 'button', onclick: () => close() }, 'Cancel'), h('button', { class: 'btn primary', type: 'button', onclick: () => { setPages(p.doc, [Object.assign({}, pg, { paper: st })]); close(); } }, 'Apply')));
    });
  }
  function helpDialog() {
    dialog((box, close) => box.append(h('h2', {}, 'Psi Phi Notes'), h('div', { style: { lineHeight: '1.6', fontSize: '13.5px', maxHeight: '60vh', overflowY: 'auto' }, html:
      '<b>Writing.</b> Pen, highlighter, eraser, lasso, shapes and text are along the top; their options are just below. Hold the pen still at the end of a stroke to turn it into a clean line, rectangle, ellipse or triangle.<br>' +
      '<b>Gestures.</b> Pinch to zoom, two fingers to scroll. Tap with two fingers to undo, three to redo. With an Apple Pencil, fingers scroll and the Pencil writes (change in ⋯).<br>' +
      '<b>Selecting.</b> With the lasso, circle ink or pictures, or tap one. Drag to move, use the corners to resize and the top dot to turn. Copy, paste, duplicate and recolour from the bar above it.<br>' +
      '<b>Insert ＋.</b> Photos, camera, text, sticky notes, tables, PDF pages, and anything from Psi Phi Studio: maths, logic, probability, molecules, proteins, anatomy, 3D, charts, ClayForm sculpts, Tabula drawings, 8-Bit pixel art, Logos and Calsheet. Choose “With animation” in the studio to bring the motion too; tap ▶ on the figure to play it. Select a figure and tap ✎ Edit figure to change it later.<br>' +
      '<b>Side by side.</b> ◫ opens another note, a PDF, or any Psi Phi app beside this one (up to three). Drag the bar between them to resize; ⇄ swaps.<br>' +
      '<b>Keys.</b> P pen · H highlighter · E eraser · L lasso · S shapes · T text · space to scroll · ⌘Z / ⇧⌘Z · ⌘C ⌘X ⌘V ⌘D · Delete.' }),
      h('div', { class: 'row end' }, h('button', { class: 'btn primary', type: 'button', onclick: () => close() }, 'Close'))));
  }

  // ---------- keys and paste ----------
  addEventListener('keydown', e => {
    if (e.key === ' ' && !e.target.closest('input,textarea,select,[contenteditable="true"]')) { spaceDown = true; e.preventDefault(); }
    if (e.target.closest('input,textarea,select,[contenteditable="true"]') || document.querySelector('dialog[open]')) { if (e.key === 'Escape' && active && active.editing) active.endEdit(); return; }
    if (OV) { if (e.key === 'Escape') OV.close(); return; }
    const p = active, mod = e.metaKey || e.ctrlKey, k = e.key.toLowerCase();
    if (mod && k === 'z') { e.preventDefault(); doUndo(e.shiftKey ? 1 : -1); return; }
    if (mod && k === 'y') { e.preventDefault(); doUndo(1); return; }
    if (p && p.sel && mod && k === 'c') { e.preventDefault(); copySel(p); return; }
    if (p && p.sel && mod && k === 'x') { e.preventDefault(); copySel(p); deleteSel(p); return; }
    if (p && p.sel && mod && k === 'd') { e.preventDefault(); duplicateSel(p); return; }
    if (mod && k === 'a') { e.preventDefault(); selectAll(); return; }
    if (p && p.sel && (e.key === 'Delete' || e.key === 'Backspace')) { e.preventDefault(); deleteSel(p); return; }
    if (e.key === 'Escape') { closeMenus(); if (p) p.clearSel(); return; }
    if (mod) return;
    const map = { p: 'pen', h: 'hl', e: 'eraser', l: 'lasso', s: 'shape', t: 'text' };
    if (map[k]) setTool(map[k]);
    if ((e.key === 'ArrowDown' || e.key === 'PageDown') && p && p.doc) p.gotoPage(Math.min(p.doc.pages.length - 1, p.currentPage() + 1));
    if ((e.key === 'ArrowUp' || e.key === 'PageUp') && p && p.doc) p.gotoPage(Math.max(0, p.currentPage() - 1));
  });
  addEventListener('keyup', e => { if (e.key === ' ') spaceDown = false; });
  document.addEventListener('paste', e => {
    const p = active; if (!p || !p.doc || OV) return;
    if (p.editing) { // keep pasted text tidy: plain text unless it is a table
      const html = e.clipboardData.getData('text/html');
      if (html && /<table/i.test(html)) return;
      const t = e.clipboardData.getData('text/plain'); if (t) { e.preventDefault(); document.execCommand('insertText', false, t); }
      return;
    }
    if (e.target.closest && e.target.closest('input,textarea')) return;
    const files = [...(e.clipboardData.files || [])].filter(f => f.type.startsWith('image/'));
    if (files.length) { e.preventDefault(); insertImages(files, p); return; }
    const t = e.clipboardData.getData('text/plain');
    if (CLIP && (!t || t === CLIP.text)) { e.preventDefault(); pasteClip(); return; }
    if (t) { e.preventDefault(); const at = p.insertPoint(), w = Math.min(420, at.maxW); place(p, at, { id: uid(), t: 'text', x: at.x - w / 2, y: at.y - 20, w, h: 40, html: t.split('\n').map(l => '<div>' + (esc(l) || '<br>') + '</div>').join(''), font: S.text.font, size: S.text.size, c: S.text.c }); }
  });
  // drop pictures and PDFs straight onto a note
  addEventListener('dragover', e => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) e.preventDefault(); });
  addEventListener('drop', e => {
    const fs = [...((e.dataTransfer && e.dataTransfer.files) || [])]; if (!fs.length) return; e.preventDefault();
    const imgs = fs.filter(f => f.type.startsWith('image/')), pdf = fs.find(f => f.type === 'application/pdf');
    if (imgs.length && active && active.doc) insertImages(imgs);
    if (pdf) { const dt = new DataTransfer(); dt.items.add(pdf); pdfTarget = !lib.hidden ? null : active && active.doc && active.doc.kind !== 'board' ? active : null; const inp = $('#filePdf'); inp.files = dt.files; inp.dispatchEvent(new Event('change')); }
  });
  addEventListener('resize', () => { for (const p of panes) if (p.doc) { p.clampView(); p.draw(); } });

  // ---------- start ----------
  (async () => {
    buildTools(); renderOpts();
    ITEMS = (await dbAll('items').catch(() => [])) || [];
    // fonts change text heights: re-measure once they are in
    if (document.fonts) document.fonts.ready.then(() => { for (const p of panes) if (p.doc) { p.objEls.forEach(el => el.remove()); p.objEls.clear(); p.syncObjs(); p.draw(); } });
    const QS = new URLSearchParams(location.search), ses = LS.get('psiphi-notes.session', null);
    if (QS.get('open')) { await openItem(QS.get('open')); }
    else if (QS.get('new') === 'board') await newBoard();
    else if (QS.get('new') === 'notebook') { const it = await createDoc('notebook', {}); await openItem(it.id); }
    else if (!QS.get('pane') && ses && ses.panes && ses.panes.length) {
      for (const sp of ses.panes) {
        if (sp.doc && itemOf(sp.doc) && !itemOf(sp.doc).trashed) { const d = await loadDoc(sp.doc); if (!d) continue; const p = new Pane(); p.flex = sp.flex || 1; panes.push(p); layoutPanes(); p.open(d); }
        else if (sp.app) { const p = new Pane(); p.flex = sp.flex || 1; panes.push(p); layoutPanes(); p.openApp(sp.app, sp.name); }
      }
      if (panes.length) { setActive(panes[clamp(ses.active || 0, 0, panes.length - 1)]); hideLibrary(); }
    }
    hubSetup();
    const pay = window.PsiHub ? await PsiHub.take().catch(() => null) : null;
    if (pay) await hubReceive(pay, panes.find(p => p.doc && p === active)).catch(e => toast('Couldn’t bring that in: ' + (e.message || e)));
    if (!panes.length) showLibrary();
    updUndo();
  })();
  // ---------- moving things between the Psi Phi apps ----------
  async function selectionPicture(p) {
    const d = p.doc, i = p.sel ? p.sel.i : p.currentPage(), pg = d.pages[i];
    if (p.sel) {
      const bb = p.selBB(), pad = 16, ids = p.sel.ids;
      const tmp = Object.assign({}, pg, { items: pg.items.filter(x => ids.has(x.id)), paper: { type: 'blank', color: pg.paper.color }, bg: null, infinite: true });
      return renderPage(d, tmp, null, { region: [bb[0] - pad, bb[1] - pad, bb[2] + pad, bb[3] + pad], maxW: 2400 });
    }
    return renderPage(d, pg, pg.infinite ? null : 2, { maxW: 2400 });
  }
  function selectedText(p) {
    const i = p.sel ? p.sel.i : p.currentPage(), pg = p.doc.pages[i];
    return pg.items.filter(x => x.t === 'text' && (!p.sel || p.sel.ids.has(x.id)));
  }
  function hubOffers() {
    const p = active; if (!p || !p.doc) return [];
    const what = p.sel ? 'The selection' : (p.doc.kind === 'board' ? 'This whiteboard' : 'This page'), out = [];
    const pic = async () => ({ kind: 'image', name: (p.item && p.item.name) || 'Notes', blob: await PsiHub.canvasBlob(await selectionPicture(p)) });
    const one = p.sel && p.selItems().length === 1 ? p.selItems()[0] : null;
    if (one && one.t === 'fig' && one.scene) out.push({ to: 'studio', label: 'Open this figure as a Studio project', make: () => ({ kind: 'scene', scene: one.scene, name: one.name }) });
    out.push({ to: 'studio', label: what + ' as a picture in your scene', make: pic });
    out.push({ to: 'tabula', label: what + ' as a canvas to paint on', make: pic });
    out.push({ to: 'final', label: what + ' as a still for a video', make: pic });
    out.push({ to: 'shelf', label: p.doc.kind === 'board' ? 'This whiteboard as a page on your shelf' : 'This notebook on your shelf, to read like a book', make: async () => {
      const blobs = [], sizes = [], texts = [];
      for (const pg of p.doc.pages) { const c = await renderPage(p.doc, pg, pg.infinite ? null : 1.6, { maxW: 1800 }); blobs.push(await new Promise(r => c.toBlob(r, 'image/jpeg', 0.88))); sizes.push([c.width, c.height]); texts.push(pg.infinite ? [] : pageWords(pg)); }
      return { kind: 'pages', name: (p.item && p.item.name) || 'Notebook', blobs, sizes, texts, shelfKind: p.item && p.item.pdf ? 'book' : 'notebook' };
    } });
    const texts = selectedText(p);
    if (texts.length) out.push({ to: 'logos', label: (p.sel ? 'Selected' : 'This page’s') + ' typed text into a document', make: () => ({ kind: 'html', html: texts.map(t => t.html).join('<p><br></p>'), name: (p.item && p.item.name) || 'Notes' }) });
    const tableIn = texts.find(t => /<table/i.test(t.html));
    if (tableIn) out.push({ to: 'calsheet', label: 'The table as a spreadsheet', make: () => { const d = document.createElement('div'); d.innerHTML = tableIn.html; return { kind: 'table', csv: PsiHub.tableToCSV(d.querySelector('table')), name: 'Table from Notes' }; } });
    return out;
  }
  async function hubReceive(pay, p) {
    if (!p || !p.doc) {
      p = panes.find(x => x.doc);
      if (!p) { const it = await createDoc('notebook', { name: 'From ' + ((PsiHub.byId(pay.from) || {}).short || 'Psi Phi') }); p = await openItem(it.id); }
    }
    setActive(p);
    const at = p.insertPoint(), from = (PsiHub.byId(pay.from) || {}).name || 'another app';
    if (pay.kind === 'image') { await insertImages([pay.blob instanceof File ? pay.blob : new File([pay.blob], (pay.name || 'Picture') + '.png', { type: pay.blob.type || 'image/png' })], p); if (pay.pixel) { const it = p.selItems()[0]; if (it) { it.pixel = true; p.objEls.delete(it.id); p.syncObjs(); } } }
    else if (pay.kind === 'pages') {
      // a book or stack from the Shelf: each page becomes a notebook page to write on
      const pages = [];
      for (const b of pay.blobs) { const im = await imgSize(b); if (!im) continue; const k = 794 / im.w; pages.push({ id: 'p' + uid(), w: 794, h: Math.round(im.h * k), paper: { type: 'blank', color: '#ffffff' }, bg: await putBlob(b, 'pg'), items: [] }); }
      if (!pages.length) return toast('Those pages couldn’t be read.');
      const it = await createDoc('notebook', { name: pay.name || 'From the Shelf', pages, pdf: pay.from === 'shelf' ? false : true });
      await openItem(it.id); toast('“' + it.name + '”: ' + pages.length + ' pages to write on.'); return;
    }
    else if (pay.kind === 'figure') await figureResult(p, { kind: 'figure', png: pay.png, w: pay.w, h: pay.h, scene: pay.scene, bg: pay.bg, name: pay.name, video: pay.video }, null, at);
    else if (pay.kind === 'frames') { const bufs = []; for (const b of pay.blobs) bufs.push(await b.arrayBuffer()); const im = await imgSize(pay.blobs[0]); await studioResult(p, at, { kind: 'frames', bufs, w: im ? im.w : 400, h: im ? im.h : 300, fps: pay.fps, name: pay.name }); }
    else if (pay.kind === 'html' || pay.kind === 'text' || pay.kind === 'table') {
      const html = pay.kind === 'html' ? pay.html : pay.kind === 'table' ? PsiHub.csvToHTML(pay.csv, pay.header) : String(pay.text || '').split('\n').map(l => '<div>' + (esc(l) || '<br>') + '</div>').join('');
      const w = Math.min(at.maxW, 520); place(p, at, { id: uid(), t: 'text', x: at.x - w / 2, y: at.y - 40, w, h: 80, html, font: 'sans', size: pay.kind === 'table' ? 15 : S.text.size, c: S.text.c });
    } else if (pay.kind === 'video') {
      const vid = await putBlob(pay.blob, 'vid'), u = URL.createObjectURL(pay.blob);
      const poster = await new Promise(res => { const v = document.createElement('video'); v.muted = true; v.playsInline = true; v.src = u; v.onloadeddata = () => { v.currentTime = Math.min(0.5, (v.duration || 1) / 3); }; v.onseeked = () => { const c = document.createElement('canvas'); c.width = v.videoWidth; c.height = v.videoHeight; c.getContext('2d').drawImage(v, 0, 0); c.toBlob(b => res({ b, w: c.width, h: c.height }), 'image/jpeg', 0.85); }; v.onerror = () => res(null); });
      if (!poster) return toast('Couldn’t read that video.');
      const id = await putBlob(poster.b, 'fig'), [w, hh] = fitBox(at, poster.w * 0.4, poster.h * 0.4);
      place(p, at, { id: uid(), t: 'fig', x: at.x - w / 2, y: at.y - hh / 2, w, h: hh, blob: id, video: vid, name: pay.name || 'Video' });
    } else return toast('Notes can’t open that kind of item.');
    toast('Added “' + (pay.name || 'item') + '” from ' + from + '.');
  }
  function hubSetup() {
    if (!window.PsiHub) return;
    PsiHub.mountHome($('#top'), $('#libBtn'));
    PsiHub.mountHome($('#libTop'), $('#libTop').firstChild);
    PsiHub.mountSend($('#top'), hubOffers, $('#moreBtn'));
    window.PsiHubBeforeLeave = () => flushAll();
    // apps shown side by side send through here: to Notes means "onto my note", to another app opens it in that pane
    addEventListener('message', async e => {
      const d = e.data || {}; if (d.type !== 'hub-send') return;
      const pane = panes.find(p => p.frame && p.frame.contentWindow === e.source); if (!pane) return;
      if (d.to === 'notes') { const pay = await PsiHub.get(d.id); await PsiHub.drop(d.id); if (pay) await hubReceive(pay, panes.find(p => p.doc && p === active) || panes.find(p => p.doc)); return; }
      const app = PsiHub.byId(d.to); if (app) { pane.openApp(app.file + '?inbox=' + d.id, app.name); saveSession(); }
    });
  }
  window.PsiNotes = { __strokePath: strokePath, hubReceive, hubOffers, get panes() { return panes; }, get active() { return active; }, get items() { return ITEMS; }, DOCS, S, setTool, openItem, createDoc, renderPage, exportPDF, makePDF, recognise, openFigure, figureResult, studioResult, insertImages, pdfToPages, setItems, undoDoc, showLibrary, openAppPane };
})();
