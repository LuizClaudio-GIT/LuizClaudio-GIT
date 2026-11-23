/* Ramifica — mapas mentais para o celular */
(() => {
'use strict';
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const PALETTES = {
  vibrante: { name: 'Vibrante', c: ['#E2557A', '#F08A3E', '#D9A423', '#3FAE7A', '#2F9ED6', '#6C63E0', '#B05CD6', '#1FA8A0'] },
  pastel:   { name: 'Pastel',   c: ['#E58FA6', '#EFAA7C', '#D9BD62', '#86C495', '#7DB6E0', '#9D96E3', '#C493DB', '#7CC8BF'] },
  oceano:   { name: 'Oceano',   c: ['#1F6FB2', '#2AA7C9', '#18998B', '#4F86F7', '#3A4FB8', '#3FB6E0', '#2D7F9E', '#6F8FEA'] },
  floresta: { name: 'Floresta', c: ['#2F8F5B', '#7BA23F', '#B5892E', '#3E7C6E', '#8C6B3E', '#5FA36A', '#A65F3A', '#4D8F8F'] },
  terra:    { name: 'Terra',    c: ['#C0603A', '#D49A3A', '#8A6E4B', '#B5473A', '#9C7A2F', '#7E5A44', '#C98A5B', '#6E7F4E'] },
  grafite:  { name: 'Grafite',  c: ['#5E6A80', '#7A8599', '#4A5568', '#8D97A8', '#3F4A5C', '#6B7689', '#9AA3B3', '#535E72'] },
};
const EMOJIS = ['💡', '⭐', '❓', '✅', '⚠️', '🎯', '📌', '🔥', '🧠', '❤️', '💰', '📅', '🚀', '📚', '🛠️', '✨'];
const KEY = 'nebulosa.v1', PKEY = 'nebulosa.prefs', CLIPKEY = 'ramifica.clip';
const inFrame = (() => { try { return window.self !== window.top; } catch (e) { return true; } })();
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const uid = () => Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => (s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const icon = n => `<svg class="i" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const short = (s, n = 28) => { s = (s || 'Nova ideia').replace(/\s+/g, ' '); return s.length > n ? s.slice(0, n - 1) + '…' : s; };
const isWide = () => matchMedia('(min-width: 700px)').matches;
const isStandalone = () => matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const URL_RE = /https?:\/\/[^\s<>"']+/gi;
const fmtSize = b => b < 1024 ? b + ' B' : b < 1048576 ? (b / 1024).toFixed(0) + ' KB' : (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
const fmtDate = t => new Date(t).toLocaleString('pt-BR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
function prettyUrl(u) { try { const x = new URL(u); return x.hostname.replace(/^www\./, '') + (x.pathname.length > 1 ? x.pathname.replace(/\/$/, '').slice(0, 32) : ''); } catch (e) { return u; } }
function vibrate() { try { navigator.vibrate && navigator.vibrate(8); } catch (e) {} }
function openUrl(u) { const a = document.createElement('a'); a.href = u; a.target = '_blank'; a.rel = 'noopener'; document.body.append(a); a.click(); a.remove(); }

/* ================= armazenamento: IndexedDB, com reserva no localStorage ================= */
let db = { maps: {} };
let prefs = { theme: 'system', panel: true, lastBackup: 0, seen: false, minimap: 'auto' };
let storageOk = true, idb = null;
function idbOpen() {
  return new Promise((res, rej) => {
    const r = indexedDB.open('ramifica', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      if (!d.objectStoreNames.contains('maps')) d.createObjectStore('maps', { keyPath: 'id' });
      if (!d.objectStoreNames.contains('blobs')) d.createObjectStore('blobs');
      if (!d.objectStoreNames.contains('snaps')) d.createObjectStore('snaps', { keyPath: 'sid' }).createIndex('map', 'mapId');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.onblocked = () => rej(new Error('bloqueado'));
  });
}
function tx(name, mode, fn) {
  return new Promise((res, rej) => {
    const t = idb.transaction(name, mode), req = fn(t.objectStore(name));
    t.oncomplete = () => res(req ? req.result : undefined);
    t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
  });
}
function lsWrite() { localStorage.setItem(KEY, JSON.stringify(db)); }
const Store = {
  async init() { try { if (!window.indexedDB) throw 0; idb = await idbOpen(); } catch (e) { idb = null; } },
  async loadMaps() {
    if (idb) { const arr = await tx('maps', 'readonly', s => s.getAll()); const o = {}; for (const m of arr) o[m.id] = m; return o; }
    try { const d = JSON.parse(localStorage.getItem(KEY) || 'null'); return (d && d.maps) || {}; } catch (e) { return {}; }
  },
  putMap(m) { if (idb) return tx('maps', 'readwrite', s => s.put(m)); lsWrite(); return Promise.resolve(); },
  delMap(id) { if (idb) return tx('maps', 'readwrite', s => s.delete(id)); lsWrite(); return Promise.resolve(); },
  putBlob(id, b) { return idb ? tx('blobs', 'readwrite', s => s.put(b, id)) : Promise.reject(new Error('sem armazenamento de arquivos')); },
  getBlob(id) { return idb ? tx('blobs', 'readonly', s => s.get(id)) : Promise.resolve(null); },
  delBlob(id) { return idb ? tx('blobs', 'readwrite', s => s.delete(id)) : Promise.resolve(); },
  blobKeys() { return idb ? tx('blobs', 'readonly', s => s.getAllKeys()) : Promise.resolve([]); },
  addSnap(sn) { return idb ? tx('snaps', 'readwrite', s => s.put(sn)) : Promise.resolve(); },
  snaps(mapId) { return idb ? tx('snaps', 'readonly', s => s.index('map').getAll(mapId)) : Promise.resolve([]); },
  allSnaps() { return idb ? tx('snaps', 'readonly', s => s.getAll()) : Promise.resolve([]); },
  delSnap(sid) { return idb ? tx('snaps', 'readwrite', s => s.delete(sid)) : Promise.resolve(); },
};
const dirty = new Set();
function storageFail() { if (storageOk) toast('Não consegui salvar neste aparelho. Exporte um backup para não perder nada.'); storageOk = false; }
async function persist() {
  const ids = [...dirty]; dirty.clear();
  for (const id of ids) { const m = db.maps[id]; if (!m) continue; try { await Store.putMap(m); storageOk = true; } catch (e) { storageFail(); } }
  snapshotTick();
}
let saveT = null;
function save(touch = true) { if (M) { if (touch) M.updated = Date.now(); dirty.add(M.id); } clearTimeout(saveT); saveT = setTimeout(persist, 400); }
function saveMap(m) { dirty.add(m.id); return persist(); }
function flush() { clearTimeout(saveT); persist(); }
async function deleteMap(id) {
  delete db.maps[id];
  try { await Store.delMap(id); for (const s of await Store.snaps(id)) await Store.delSnap(s.sid); } catch (e) { storageFail(); }
  gcBlobs();
}
function savePrefs() { try { localStorage.setItem(PKEY, JSON.stringify(prefs)); } catch (e) {} }
addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
addEventListener('pagehide', flush);

/* histórico de versões */
const lastSnap = {};
function snapData(m) { return JSON.stringify({ root: m.root, nodes: m.nodes, links: m.links, groups: m.groups, auto: m.auto, dir: m.dir, style: m.style }); }
async function snapshotTick(force = false) {
  if (!idb || !M) return;
  const now = Date.now(), m = M;
  if (!force && now - (lastSnap[m.id] || 0) < 10 * 60e3) return;
  lastSnap[m.id] = now;
  const data = snapData(m);
  try {
    const list = (await Store.snaps(m.id)).sort((a, b) => b.at - a.at);
    if (list[0] && list[0].data === data) return;
    await Store.addSnap({ sid: uid(), mapId: m.id, at: now, count: Object.keys(m.nodes).length, data });
    for (const s of list.slice(29)) await Store.delSnap(s.sid);
  } catch (e) {}
}
async function openHistory() {
  if (!idb) { toast('O histórico precisa do app instalado ou de um navegador com armazenamento completo.'); return; }
  await snapshotTick(true);
  const list = (await Store.snaps(M.id)).sort((a, b) => b.at - a.at);
  modal({
    title: 'Histórico de versões',
    html: `<p>Uma versão é guardada quando você abre o mapa e a cada 10 minutos de edição. Ficam as 30 mais recentes.</p>` +
      (list.length ? `<div class="menu">${list.map((s, i) => `<button data-sid="${s.sid}">${icon('history')}<span>${fmtDate(s.at)}${i === 0 ? ' · mais recente' : ''}<small>${s.count} ideia${s.count > 1 ? 's' : ''}</small></span></button>`).join('')}</div>` : '<p>Ainda não há versões guardadas deste mapa.</p>'),
    onMount: mEl => mEl.querySelector('.menu')?.addEventListener('click', e => {
      const b = e.target.closest('[data-sid]'); if (!b) return;
      const s = list.find(x => x.sid === b.dataset.sid); closeModal(); restoreSnap(s);
    }),
  });
}
function restoreSnap(s) {
  pushUndo();
  const o = JSON.parse(s.data);
  M.nodes = o.nodes; M.links = o.links || []; M.groups = o.groups || []; M.auto = o.auto !== false; M.dir = o.dir || 'both';
  M.style = { ...M.style, ...(o.style || {}) }; if (o.root) M.root = o.root;
  normalizeMap(M);
  sel = null; focusId = null; multi.clear(); updFocus(); applyStyle();
  renderNodes(); renderEdges(); refreshSelUI(true); updTitle(); save(); fit(true);
  toast(`Versão de ${fmtDate(s.at)} restaurada`, 'Desfazer', undo);
}
async function gcBlobs() {
  if (!idb) return;
  try {
    const keys = await Store.blobKeys(); if (!keys.length) return;
    let refs = JSON.stringify(Object.values(db.maps)) + JSON.stringify((await Store.allSnaps()).map(s => s.data));
    try { refs += localStorage.getItem(CLIPKEY) || ''; } catch (e) {}
    for (const k of keys) if (!refs.includes(k)) await Store.delBlob(k);
  } catch (e) {}
}
const urlCache = new Map();
async function blobUrl(id) {
  if (urlCache.has(id)) return urlCache.get(id);
  const b = await Store.getBlob(id); if (!b) return null;
  const u = URL.createObjectURL(b); urlCache.set(id, u); return u;
}
function setBlobSrc(img, id) { const u = urlCache.get(id); if (u) img.src = u; else blobUrl(id).then(u2 => { if (u2) img.src = u2; }); }

/* ================= texto em tópicos <-> ideias ================= */
function parseOutline(text) {
  const out = [], stack = [{ ind: -1, children: out }]; let last = null;
  for (const raw of String(text).replace(/\r/g, '').split('\n')) {
    if (!raw.trim()) continue;
    const ind = raw.match(/^\s*/)[0].replace(/\t/g, '    ').length;
    let t = raw.trim();
    if (/^>/.test(t) && last) { last.note = (last.note ? last.note + '\n' : '') + t.replace(/^>\s?/, ''); continue; }
    t = t.replace(/^#+\s+/, '').replace(/^([-*•+]|\d+[.)])\s+/, '');
    let done = null;
    const m = t.match(/^\[( |x|X)\]\s*/);
    if (m) { done = m[1] !== ' '; t = t.slice(m[0].length); }
    const item = { text: t, note: '', done, children: [] };
    while (stack.length > 1 && stack[stack.length - 1].ind >= ind) stack.pop();
    stack[stack.length - 1].children.push(item);
    stack.push({ ind, children: item.children });
    last = item;
  }
  return out;
}
function singleItem(text) {
  const lines = String(text).replace(/\r/g, '').split('\n').map(l => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const urls = [...new Set(String(text).match(URL_RE) || [])];
  const isUrlOnly = l => /^https?:\/\/\S+$/i.test(l);
  let title = lines.find(l => !isUrlOnly(l)) || prettyUrl(urls[0]);
  let note = lines.filter(l => l !== title && !isUrlOnly(l)).join('\n');
  if (title.length > 140) { const cut = title.slice(0, 120).replace(/\s+\S*$/, '') + '…'; note = title + (note ? '\n' + note : ''); title = cut; }
  return [{ text: title, note, done: null, links: urls.map(u => ({ url: u, title: '' })), children: [] }];
}
function countItems(items) { return items.reduce((a, it) => a + 1 + countItems(it.children || []), 0); }
function newNode(text, parent) {
  return { id: uid(), text: text || '', parent, children: [], x: 0, y: 0, color: null, note: '', emoji: '', shape: 'auto', collapsed: false, done: null, date: null, links: [], files: [], img: null };
}
function addItems(m, parentId, items, mark) {
  const p = m.nodes[parentId];
  for (const it of items) {
    const n = newNode(it.text, parentId);
    n.note = it.note || ''; n.done = it.done ?? null; n.links = it.links ? it.links.slice() : []; n.x = p.x; n.y = p.y;
    if (/^https?:\/\/\S+$/i.test(n.text)) { n.links.push({ url: n.text, title: '' }); n.text = prettyUrl(n.text); }
    m.nodes[n.id] = n; p.children.push(n.id);
    if (mark) mark.add(n.id);
    addItems(m, n.id, it.children || [], mark);
  }
}
function normalizeMap(m) {
  m.links = m.links || []; m.groups = m.groups || []; m.dir = m.dir || 'both';
  if (m.auto === undefined) m.auto = true;
  m.style = { palette: 'vibrante', edge: 'curva', font: 'padrao', ...(m.style || {}) };
  if (m.style.palette === 'mono') m.style.palette = 'grafite';
  for (const n of Object.values(m.nodes)) { n.links = n.links || []; n.files = n.files || []; if (n.date === undefined) n.date = null; if (n.img === undefined) n.img = null; }
  return m;
}
function mapFromItems(items) {
  const first = items[0] || { text: 'Ideia central', note: '', children: [] };
  const m = normalizeMap({ id: uid(), created: Date.now(), updated: Date.now(), root: null, nodes: {}, view: null });
  const r = newNode(first.text, null); r.note = first.note || ''; r.links = first.links || [];
  m.root = r.id; m.nodes[r.id] = r;
  addItems(m, r.id, [...(first.children || []), ...items.slice(1)]);
  const pos = computeLayout(m);
  for (const id in pos) Object.assign(m.nodes[id], pos[id]);
  return m;
}
const mapFromOutline = text => mapFromItems(parseOutline(text));
function freeRoots(m = M) { return Object.values(m.nodes).filter(n => !n.parent && n.id !== m.root).map(n => n.id); }
function toOutline(m, id = m.root, d = 0) {
  const n = m.nodes[id];
  const box = n.done === true ? '[x] ' : n.done === false ? '[ ] ' : '';
  const label = (n.emoji ? n.emoji + ' ' : '') + (n.text || '…').replace(/\n/g, ' ') + (n.date ? ` (${n.date})` : '');
  let s = d === 0 ? `# ${label}\n` : '  '.repeat(d - 1) + '- ' + box + label + '\n';
  if (n.note) s += n.note.split('\n').map(l => '  '.repeat(d) + '> ' + l).join('\n') + '\n';
  for (const l of n.links || []) s += '  '.repeat(d) + '> ' + l.url + '\n';
  if (d === 0 && n.children.length) s += '\n';
  for (const c of n.children) s += toOutline(m, c, d + 1);
  if (d === 0) for (const f of freeRoots(m)) s += toOutline(m, f, 1);
  return s;
}

/* ================= estado do editor ================= */
let M = null, sel = null, focusId = null, editorOpen = false;
let size = {}, elMap = new Map(), visible = [], visSet = new Set();
let undoStack = [], redoStack = [];
let edit = null, linkFrom = null;
let searchHits = new Set(), hitList = [], hitIdx = -1;
let curTab = 'ideia', tok = {};
let multi = new Set(), selMode = false, present = null;
const born = new Set();
const N = id => M.nodes[id];
const stageEl = $('#stage'), worldEl = $('#world'), nodesEl = $('#nodes'), edgesEl = $('#edges'), measureEl = $('#measure');
const panelEl = $('#panel'), bodyEl = $('#panel-body');

function readTokens() {
  const cs = getComputedStyle(document.documentElement);
  for (const k of ['bg', 'surface', 'surface-2', 'ink', 'muted', 'line', 'accent']) tok[k] = cs.getPropertyValue('--' + k).trim();
}
function hexToRgb(h) { h = (h || '#888').replace('#', ''); if (h.length === 3) h = h.split('').map(c => c + c).join(''); const n = parseInt(h.slice(0, 6), 16) || 0; return [n >> 16 & 255, n >> 8 & 255, n & 255]; }
function mix(a, b, t) { const A = hexToRgb(a), B = hexToRgb(b); return '#' + A.map((v, i) => Math.round(v * t + B[i] * (1 - t)).toString(16).padStart(2, '0')).join(''); }
function onColor(h) { const [r, g, b] = hexToRgb(h); return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6 ? '#141A26' : '#FFFFFF'; }
function hashIdx(s, n) { let h = 0; for (const c of s) h = (h * 31 + c.charCodeAt(0)) | 0; return Math.abs(h) % n; }
function pal(m = M) { return (PALETTES[m && m.style && m.style.palette] || PALETTES.vibrante).c; }
function colorOf(id, m = M) {
  let n = m.nodes[id]; const P = pal(m);
  while (n) {
    if (n.color) return n.color;
    if (!n.parent) return n.id === m.root ? null : P[hashIdx(n.id, P.length)];
    const p = m.nodes[n.parent];
    if (p.id === m.root) return P[p.children.indexOf(n.id) % P.length];
    n = p;
  }
  return null;
}
function topOf(id, m = M) { let n = m.nodes[id]; while (n.parent) n = m.nodes[n.parent]; return n.id; }
function depth(id, m = M) { let d = 0, n = m.nodes[id]; while (n && n.parent) { d++; n = m.nodes[n.parent]; } return n && n.id !== m.root ? d + 1 : d; }
function subtree(id, acc = []) { acc.push(id); for (const c of N(id).children) subtree(c, acc); return acc; }
function isAncestor(a, b) { let n = N(b); while (n && n.parent) { if (n.parent === a) return true; n = N(n.parent); } return false; }
function countDesc(id) { return subtree(id).length - 1; }
function est(n, m) { if (n.img) return { w: (n.img.dw || 180) + 12, h: Math.round((n.img.dw || 180) * n.img.h / n.img.w) + 50 }; const len = (n.emoji ? 2 : 0) + Math.min((n.text || 'Nova ideia').length, 34); const root = m && n.id === m.root; return { w: Math.max(60, 30 + len * (root ? 11 : 7.6)), h: root ? 50 : 36 }; }
function sizeOf(id, m = M) { return (m === M && size[id]) || est(m.nodes[id], m); }
function sideOf(id) { if (M.dir === 'down') return 0; if (topOf(id) !== M.root) return 1; return N(id).x < N(M.root).x ? -1 : 1; }
function isRoot(id) { return id === M.root; }

/* ================= layout automático ================= */
function computeLayout(m) {
  const pos = {}, r = m.nodes[m.root];
  const kids = n => n.collapsed ? [] : n.children;
  const S = id => sizeOf(id, m);
  const frees = freeRoots(m);
  if (m.dir === 'down') {
    const HG = 18, VG = 64, span = {};
    const sw = id => { const ks = kids(m.nodes[id]); const c = ks.length ? ks.reduce((a, k) => a + sw(k), 0) + HG * (ks.length - 1) : 0; return span[id] = Math.max(S(id).w, c); };
    const place = (id, x, y) => {
      pos[id] = { x, y };
      const ks = kids(m.nodes[id]); if (!ks.length) return;
      const tot = ks.reduce((a, k) => a + span[k], 0) + HG * (ks.length - 1);
      let cx = x - tot / 2; const h = S(id).h, rowH = Math.max(...ks.map(k => S(k).h));
      for (const k of ks) { place(k, cx + span[k] / 2, y + h / 2 + VG + rowH / 2); cx += span[k] + HG; }
    };
    for (const t of [r.id, ...frees]) { sw(t); place(t, m.nodes[t].x, m.nodes[t].y); }
    return pos;
  }
  const HG = 54, VG = 14, sh = {};
  const hs = id => { const ks = kids(m.nodes[id]); const c = ks.length ? ks.reduce((a, k) => a + hs(k), 0) + VG * (ks.length - 1) : 0; return sh[id] = Math.max(S(id).h, c); };
  const place = (id, x, y, dir) => {
    pos[id] = { x, y };
    const ks = kids(m.nodes[id]); if (!ks.length) return;
    const tot = ks.reduce((a, k) => a + sh[k], 0) + VG * (ks.length - 1);
    let cy = y - tot / 2; const w = S(id).w;
    for (const k of ks) { place(k, x + dir * (w / 2 + HG + S(k).w / 2), cy + sh[k] / 2, dir); cy += sh[k] + VG; }
  };
  hs(r.id);
  pos[r.id] = { x: r.x, y: r.y };
  const ks = kids(r), G = VG * 1.6;
  let right = ks, left = [];
  if (m.dir !== 'right' && ks.length > 1) {
    const total = ks.reduce((a, k) => a + sh[k] + G, 0);
    let acc = 0; right = []; left = [];
    for (const k of ks) { if (right.length === 0 || acc + (sh[k] + G) / 2 <= total / 2) { right.push(k); acc += sh[k] + G; } else left.push(k); }
  }
  const rw = S(r.id).w;
  for (const [group, dir] of [[right, 1], [left, -1]]) {
    const tot = group.reduce((a, k) => a + sh[k], 0) + G * (group.length - 1);
    let cy = r.y - tot / 2;
    for (const k of group) { place(k, r.x + dir * (rw / 2 + HG * 1.4 + S(k).w / 2), cy + sh[k] / 2, dir); cy += sh[k] + G; }
  }
  for (const f of frees) { hs(f); place(f, m.nodes[f].x, m.nodes[f].y, 1); }
  return pos;
}

/* ================= desenho ================= */
const VIRT = 220;
let virtOn = false, rendered = null;
const sizeByKey = new Map();
function computeVisible() {
  visible = [];
  const walk = id => { visible.push(id); const n = N(id); if (!n.collapsed) n.children.forEach(walk); };
  if (focusId && M.nodes[focusId]) walk(focusId); else { walk(M.root); freeRoots().forEach(walk); }
  visSet = new Set(visible);
}
function nodeColors(id) {
  const base = colorOf(id) || tok.ink;
  return { c: base, tint: mix(base, tok.surface, 0.16), soft: mix(base, tok.surface, 0.5), on: onColor(base) };
}
function nodeKey(id) {
  const n = N(id);
  return [Math.min(depth(id), 2), n.shape, n.emoji, n.done == null ? '' : 't', n.note ? 1 : 0, n.img ? n.img.dw + 'x' + n.img.w + 'x' + n.img.h : '', n.links.length ? 1 : 0, n.files.length ? 1 : 0, M.style.font, n.text].join('|');
}
function todayStr() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
function dueClass(n) { if (n.done === true) return 'ok'; const t = todayStr(); return n.date < t ? 'late' : n.date === t ? 'today' : ''; }
function dueLabel(s) {
  const t = todayStr(); if (s === t) return 'Hoje';
  const d = new Date(s + 'T12:00'), diff = Math.round((d - new Date(t + 'T12:00')) / 864e5);
  if (diff === 1) return 'Amanhã'; if (diff === -1) return 'Ontem';
  return d.toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' }).replace('.', '');
}
function buildNodeEl(id) {
  const n = N(id), d = depth(id);
  const el = document.createElement('div');
  let cls = 'node d' + Math.min(d, 2);
  if (n.shape !== 'auto') cls += ' shape-' + n.shape;
  if (n.img) cls += ' has-img';
  if (id === sel && !multi.size) cls += ' sel';
  if (multi.has(id)) cls += ' msel';
  if (n.done === true) cls += ' done';
  if (searchHits.has(id)) cls += ' match';
  if (linkFrom === id) cls += ' linking';
  if (born.has(id)) cls += ' born';
  if (present && !present.set.has(id)) cls += ' dim';
  el.className = cls; el.dataset.id = id;
  const col = nodeColors(id);
  el.style.cssText = `left:${n.x}px;top:${n.y}px;--c:${col.c};--tint:${col.tint};--soft:${col.soft};--on:${col.on}`;
  let row = el;
  if (n.img) {
    const im = document.createElement('img');
    im.className = 'nimg'; im.alt = ''; im.draggable = false;
    im.width = n.img.dw; im.height = Math.round(n.img.dw * n.img.h / n.img.w);
    setBlobSrc(im, n.img.id);
    el.style.width = (n.img.dw + 12) + 'px';
    row = document.createElement('div'); row.className = 'nrow';
    el.append(im, row);
  }
  if (n.done !== null && n.done !== undefined) { const ck = document.createElement('span'); ck.className = 'chk'; row.append(ck); }
  if (n.emoji) { const e = document.createElement('span'); e.className = 'emo'; e.textContent = n.emoji; row.append(e); }
  const t = document.createElement('span'); t.className = 'txt'; t.textContent = n.text; row.append(t);
  if (n.note) row.insertAdjacentHTML('beforeend', '<svg class="i ni" aria-label="Tem nota"><use href="#i-note"/></svg>');
  if (n.links.length) row.insertAdjacentHTML('beforeend', '<svg class="i ni nlink" aria-label="Tem link"><use href="#i-link"/></svg>');
  if (n.files.length) row.insertAdjacentHTML('beforeend', '<svg class="i ni" aria-label="Tem anexo"><use href="#i-clip"/></svg>');
  if (n.date) { const c = document.createElement('span'); c.className = 'due ' + dueClass(n); c.textContent = dueLabel(n.date); el.append(c); }
  if (n.collapsed && n.children.length) {
    const b = document.createElement('span');
    b.className = 'badge ' + (M.dir === 'down' ? 'b' : sideOf(id) < 0 ? 'l' : 'r');
    b.textContent = countDesc(id); b.title = 'Expandir';
    el.append(b);
  }
  return el;
}
function measureIds(ids) {
  if (sizeByKey.size > 6000) sizeByKey.clear();
  const miss = [], seen = new Set();
  for (const id of ids) { const k = nodeKey(id); if (!sizeByKey.has(k) && !seen.has(k)) { seen.add(k); miss.push([id, k]); } }
  if (miss.length) {
    const frag = document.createDocumentFragment();
    const els = miss.map(([id, k]) => { const e = buildNodeEl(id); e.classList.remove('born', 'sel', 'msel', 'match', 'dim'); e.style.left = '0px'; e.style.top = '0px'; frag.append(e); return [k, e]; });
    measureEl.replaceChildren(frag);
    for (const [k, e] of els) sizeByKey.set(k, { w: e.offsetWidth, h: e.offsetHeight });
    measureEl.replaceChildren();
  }
  for (const id of ids) size[id] = sizeByKey.get(nodeKey(id));
}
function viewRect(margin = 0) {
  const v = M.view, W = stageEl.clientWidth || 400, H = stageEl.clientHeight || 600, mx = W * margin, my = H * margin;
  return { x0: (-v.x - mx) / v.k, y0: (-v.y - my) / v.k, x1: (W - v.x + mx) / v.k, y1: (H - v.y + my) / v.k };
}
function inRect(id, r) { const n = N(id), s = size[id] || sizeOf(id); return n.x + s.w / 2 > r.x0 && n.x - s.w / 2 < r.x1 && n.y + s.h / 2 > r.y0 && n.y - s.h / 2 < r.y1; }
function renderNodes(opts = {}) {
  computeVisible();
  measureIds(visible);
  virtOn = !opts.all && visible.length > VIRT;
  let ids = visible;
  if (virtOn) {
    rendered = viewRect(0.8);
    ids = visible.filter(id => id === sel || multi.has(id) || (edit && edit.id === id) || inRect(id, rendered));
  } else rendered = null;
  const frag = document.createDocumentFragment();
  elMap.clear();
  for (const id of ids) { const el = buildNodeEl(id); frag.append(el); elMap.set(id, el); }
  nodesEl.replaceChildren(frag);
  born.clear();
  drawMinimapSoon();
}
function placeEls() { for (const [id, el] of elMap) { const n = M.nodes[id]; if (n) { el.style.left = n.x + 'px'; el.style.top = n.y + 'px'; } } }
function edgeD(pid, cid) {
  const p = N(pid), c = N(cid), ps = sizeOf(pid), cs = sizeOf(cid);
  const dx = c.x - p.x, dy = c.y - p.y, st = M.style.edge;
  const vertical = M.dir === 'down' || Math.abs(dx) < (ps.w + cs.w) / 2 - 4;
  if (vertical) {
    const s = dy >= 0 ? 1 : -1;
    const sx = p.x, sy = p.y + s * ps.h / 2, ex = c.x, ey = c.y - s * cs.h / 2, my = (sy + ey) / 2;
    if (st === 'reta') return `M${sx} ${sy}L${ex} ${ey}`;
    if (st === 'cotovelo') return `M${sx} ${sy}V${my}H${ex}V${ey}`;
    return `M${sx} ${sy}C${sx} ${my} ${ex} ${my} ${ex} ${ey}`;
  }
  const s = dx >= 0 ? 1 : -1;
  const sx = isRoot(pid) ? p.x + s * ps.w * 0.3 : p.x + s * ps.w / 2;
  const sy = !isRoot(pid) && p.shape === 'plain' ? p.y + ps.h / 2 : p.y;
  const ex = c.x - s * cs.w / 2, ey = c.shape === 'plain' ? c.y + cs.h / 2 : c.y;
  if (st === 'reta') return `M${sx} ${sy}L${ex} ${ey}`;
  if (st === 'cotovelo') { const mx = isRoot(pid) ? p.x + s * (ps.w / 2 + 24) : sx + (ex - sx) * 0.5; return `M${sx} ${sy}H${mx}V${ey}H${ex}`; }
  return `M${sx} ${sy}C${sx + (ex - sx) * 0.55} ${sy} ${sx + (ex - sx) * 0.45} ${ey} ${ex} ${ey}`;
}
function borderPt(n, s, tx, ty) {
  const dx = tx - n.x, dy = ty - n.y;
  const k = 1 / Math.max(Math.abs(dx) / (s.w / 2 + 6), Math.abs(dy) / (s.h / 2 + 6), 1e-6);
  return [n.x + dx * k, n.y + dy * k];
}
function linkD(a, b) {
  const A = N(a), B = N(b);
  const [sx, sy] = borderPt(A, sizeOf(a), B.x, B.y), [ex, ey] = borderPt(B, sizeOf(b), A.x, A.y);
  const mx = (sx + ex) / 2, my = (sy + ey) / 2, len = Math.hypot(ex - sx, ey - sy);
  const nx = -(ey - sy) / (len || 1), ny = (ex - sx) / (len || 1), off = Math.min(80, len * 0.25);
  return `M${sx} ${sy}Q${mx + nx * off} ${my + ny * off} ${ex} ${ey}`;
}
function edgeWidth(d) { return d === 1 ? 4.5 : d === 2 ? 3 : 2; }
function groupRects() {
  const out = [];
  for (const g of M.groups) {
    const ids = new Set();
    for (const id of g.ids) if (M.nodes[id]) { const walk = i => { if (visSet.has(i)) ids.add(i); const n = N(i); if (!n.collapsed) n.children.forEach(walk); }; walk(id); }
    if (!ids.size) continue;
    const bb = bbox([...ids]), lab = g.label ? 20 : 0;
    const color = g.color || colorOf(g.ids.find(i => M.nodes[i])) || tok.muted;
    out.push({ g, color, x: bb.x - 18, y: bb.y - 18 - lab, w: bb.w + 36, h: bb.h + 36 + lab, set: ids });
  }
  return out;
}
function renderEdges() {
  let s = `<defs><marker id="arw" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${tok.muted}"/></marker></defs>`;
  for (const r of groupRects()) {
    const dim = present && ![...r.set].some(i => present.set.has(i)) ? ' opacity=".15"' : '';
    s += `<g${dim}><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}" rx="22" fill="${r.color}" fill-opacity=".09" stroke="${r.color}" stroke-opacity=".5" stroke-width="1.5"/>`;
    if (r.g.label) s += `<text class="glabel" x="${r.x + 16}" y="${r.y + 22}" fill="${r.color}">${esc(r.g.label)}</text>`;
    s += '</g>';
  }
  for (const id of visible) {
    const n = N(id);
    if (!n.parent || !visSet.has(n.parent)) continue;
    if (virtOn && !inRect(id, rendered) && !inRect(n.parent, rendered)) continue;
    const dim = present && !present.set.has(id) ? ' opacity=".12"' : '';
    s += `<path d="${edgeD(n.parent, id)}" stroke="${colorOf(id) || tok.ink}" stroke-width="${edgeWidth(depth(id))}" fill="none" stroke-linecap="round" stroke-linejoin="round"${dim}/>`;
  }
  for (const L of M.links) {
    if (!visSet.has(L.a) || !visSet.has(L.b)) continue;
    s += `<path class="lnk" d="${linkD(L.a, L.b)}" marker-end="url(#arw)"${present && !(present.set.has(L.a) && present.set.has(L.b)) ? ' opacity=".12"' : ''}/>`;
  }
  edgesEl.innerHTML = s;
}
let layAnim = 0;
function relayout(anim = true) {
  renderNodes();
  const pos = computeLayout(M), mapRef = M;
  cancelAnimationFrame(layAnim);
  if (!anim || reduceMotion) { for (const id in pos) Object.assign(N(id), pos[id]); placeEls(); renderEdges(); if (virtOn && !edit) renderNodes(); return; }
  const from = {};
  for (const id in pos) from[id] = { x: N(id).x, y: N(id).y };
  const st = performance.now();
  const step = now => {
    if (M !== mapRef) return;
    const p = Math.min(1, (now - st) / 280), e = 1 - Math.pow(1 - p, 3);
    for (const id in pos) { const n = M.nodes[id]; if (!n) continue; n.x = from[id].x + (pos[id].x - from[id].x) * e; n.y = from[id].y + (pos[id].y - from[id].y) * e; }
    placeEls(); renderEdges();
    if (p < 1) layAnim = requestAnimationFrame(step);
    else { save(false); if (virtOn && !edit) { renderNodes(); renderEdges(); } drawMinimapSoon(); }
  };
  layAnim = requestAnimationFrame(step);
}
function applyStyle() { stageEl.dataset.font = M.style.font; }

/* ================= visão (pan/zoom) ================= */
let virtRaf = 0;
function applyView() {
  const v = M.view;
  worldEl.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.k})`;
  const g = 24 * v.k;
  stageEl.style.backgroundSize = `${g}px ${g}px`;
  stageEl.style.backgroundPosition = `${v.x}px ${v.y}px`;
  if (virtOn && rendered && !virtRaf) {
    const r = viewRect(0);
    if (r.x0 < rendered.x0 || r.y0 < rendered.y0 || r.x1 > rendered.x1 || r.y1 > rendered.y1) {
      virtRaf = requestAnimationFrame(() => { virtRaf = 0; if (!edit && !(gst && gst.type === 'drag')) { renderNodes(); renderEdges(); } });
    }
  }
  drawMinimapSoon();
  if (coach) positionRing();
}
let viewSaveT;
function saveView() { clearTimeout(viewSaveT); viewSaveT = setTimeout(() => save(false), 600); }
let viewAnim = 0;
function animateView(t, anim = true) {
  cancelAnimationFrame(viewAnim);
  if (!anim || reduceMotion) { Object.assign(M.view, t); applyView(); saveView(); return; }
  const f = { ...M.view }, st = performance.now();
  const step = now => {
    if (!M) return;
    const p = Math.min(1, (now - st) / 300), e = 1 - Math.pow(1 - p, 3);
    M.view.x = f.x + (t.x - f.x) * e; M.view.y = f.y + (t.y - f.y) * e; M.view.k = f.k + (t.k - f.k) * e;
    applyView();
    if (p < 1) viewAnim = requestAnimationFrame(step); else saveView();
  };
  viewAnim = requestAnimationFrame(step);
}
function bbox(ids) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const id of ids) { const n = N(id), s = sizeOf(id); a = Math.min(a, n.x - s.w / 2); b = Math.min(b, n.y - s.h / 2); c = Math.max(c, n.x + s.w / 2); d = Math.max(d, n.y + s.h / 2); }
  return { x: a, y: b, w: c - a, h: d - b };
}
function fit(anim = true, ids = visible) {
  if (!ids.length) return;
  const bb = bbox(ids), W = stageEl.clientWidth, H = stageEl.clientHeight;
  const padX = 28, padTop = 30, padBot = present ? 100 : sel ? 100 : 40;
  const k = clamp(Math.min((W - padX * 2 - 60) / bb.w, (H - padTop - padBot) / bb.h), 0.12, present ? 1.6 : 1.3);
  animateView({ k, x: W / 2 - (bb.x + bb.w / 2) * k, y: padTop + (H - padTop - padBot) / 2 - (bb.y + bb.h / 2) * k }, anim);
}
function centerOn(id, anim = true, yFrac = 0.42) {
  const n = N(id), v = M.view, W = stageEl.clientWidth, H = stageEl.clientHeight, k = Math.max(v.k, 0.6);
  animateView({ k, x: W / 2 - n.x * k, y: H * yFrac - n.y * k }, anim);
}
function ensureVisible(id) {
  const el = elMap.get(id); if (!el) { centerOn(id); return; }
  const r = el.getBoundingClientRect(), s = stageEl.getBoundingClientRect(), m = 20;
  if (r.left < s.left + m || r.right > s.right - m || r.top < s.top + m || r.bottom > s.bottom - 100 || M.view.k < 0.5) centerOn(id, true, 0.38);
}
function zoomAt(cx, cy, k) {
  const v = M.view; k = clamp(k, 0.12, 3);
  const wx = (cx - v.x) / v.k, wy = (cy - v.y) / v.k;
  v.k = k; v.x = cx - wx * k; v.y = cy - wy * k; applyView(); saveView();
}
function centerWorld() { const v = M.view; return { x: (stageEl.clientWidth / 2 - v.x) / v.k, y: (stageEl.clientHeight / 2 - v.y) / v.k }; }

/* ---- minimapa ---- */
let mmRaf = 0;
function drawMinimapSoon() { if (mmRaf) return; mmRaf = requestAnimationFrame(() => { mmRaf = 0; drawMinimap(); }); }
function minimapOn() {
  if (!M || !editorOpen || present) return false;
  const p = prefs.minimap || 'auto';
  if (p === 'off') return false;
  if (p === 'on') return true;
  return visible.length > 30;
}
function drawMinimap() {
  const cv = $('#minimap'), on = minimapOn() && $('#searchbar').hidden;
  cv.hidden = !on; if (!on || !visible.length) return;
  const dpr = devicePixelRatio || 1, W = 150, H = 100;
  if (cv.width !== W * dpr) { cv.width = W * dpr; cv.height = H * dpr; }
  const ctx = cv.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
  const bb = bbox(visible), pad = 8;
  const s = Math.min((W - pad * 2) / bb.w, (H - pad * 2) / bb.h);
  const ox = pad + (W - pad * 2 - bb.w * s) / 2 - bb.x * s, oy = pad + (H - pad * 2 - bb.h * s) / 2 - bb.y * s;
  for (const id of visible) {
    const n = N(id), z = sizeOf(id);
    ctx.fillStyle = colorOf(id) || tok.ink;
    ctx.fillRect(ox + (n.x - z.w / 2) * s, oy + (n.y - z.h / 2) * s, Math.max(2, z.w * s), Math.max(1.5, z.h * s));
  }
  const vr = viewRect(0);
  ctx.strokeStyle = tok.accent; ctx.lineWidth = 1.6;
  ctx.strokeRect(ox + vr.x0 * s, oy + vr.y0 * s, (vr.x1 - vr.x0) * s, (vr.y1 - vr.y0) * s);
  cv._map = { s, ox, oy };
}
(() => {
  const cv = $('#minimap');
  const go = e => {
    if (!cv._map || !M) return;
    const r = cv.getBoundingClientRect(), { s, ox, oy } = cv._map;
    const wx = (e.clientX - r.left - ox) / s, wy = (e.clientY - r.top - oy) / s, k = M.view.k;
    cancelAnimationFrame(viewAnim);
    M.view.x = stageEl.clientWidth / 2 - wx * k; M.view.y = stageEl.clientHeight / 2 - wy * k; applyView(); saveView();
  };
  cv.addEventListener('pointerdown', e => { e.stopPropagation(); cv.setPointerCapture(e.pointerId); cv._drag = true; go(e); });
  cv.addEventListener('pointermove', e => { if (cv._drag) go(e); });
  cv.addEventListener('pointerup', () => { cv._drag = false; });
  cv.addEventListener('pointercancel', () => { cv._drag = false; });
})();

/* ================= desfazer ================= */
function snap() { return JSON.stringify({ root: M.root, nodes: M.nodes, links: M.links, groups: M.groups, auto: M.auto, dir: M.dir, style: M.style }); }
function pushUndo() { undoStack.push(snap()); if (undoStack.length > 120) undoStack.shift(); redoStack = []; updUndo(); }
function restore(s) {
  const o = JSON.parse(s);
  Object.assign(M, { root: o.root, nodes: o.nodes, links: o.links, groups: o.groups || [], auto: o.auto, dir: o.dir, style: o.style });
  if (sel && !M.nodes[sel]) sel = null;
  if (focusId && !M.nodes[focusId]) focusId = null;
  multi = new Set([...multi].filter(id => M.nodes[id]));
  cancelAnimationFrame(layAnim);
  applyStyle(); renderNodes(); renderEdges(); refreshSelUI(true); updMulti(); updTitle(); updFocus(); save();
}
function undo() { if (edit) commitEdit(); if (!undoStack.length) return; redoStack.push(snap()); restore(undoStack.pop()); updUndo(); }
function redo() { if (!redoStack.length) return; undoStack.push(snap()); restore(redoStack.pop()); updUndo(); }
function updUndo() { $('#btn-undo').disabled = !undoStack.length; $('#btn-redo').disabled = !redoStack.length; }

/* ================= ações nas ideias ================= */
function afterChange() {
  save();
  if (M.auto) relayout(true); else { renderNodes(); renderEdges(); }
  refreshSelUI(false);
  if (curTab !== 'ideia' && panelVisible()) renderPanel();
  updUndo(); updTitle();
}
function placeNew(n, p) {
  if (M.auto) { n.x = p.x; n.y = p.y; return; }
  const ps = sizeOf(p.id);
  let side = isRoot(p.id) ? 1 : (sideOf(p.id) || 1);
  if (isRoot(p.id) && M.dir !== 'right') { const r = p.children.filter(c => N(c).x >= p.x).length, l = p.children.length - r; side = r <= l ? 1 : -1; }
  const sibs = p.children.map(N).filter(c => (c.x >= p.x ? 1 : -1) === side);
  if (M.dir === 'down') { n.x = sibs.length ? Math.max(...sibs.map(s => s.x)) + 140 : p.x; n.y = p.y + ps.h / 2 + 80; return; }
  n.x = p.x + side * (ps.w / 2 + 110);
  n.y = sibs.length ? Math.max(...sibs.map(s => s.y)) + 52 : p.y;
}
function addChild(pid) {
  if (edit) commitEdit();
  const p = N(pid); if (!p) return;
  pushUndo();
  p.collapsed = false;
  const n = newNode('', pid); placeNew(n, p);
  M.nodes[n.id] = n; p.children.push(n.id); born.add(n.id);
  vibrate(); emit('add');
  afterChange();
  startEdit(n.id, true);
}
function addSibling(id) {
  if (edit) commitEdit();
  const n = N(id); if (!n) return;
  if (isRoot(id)) return addChild(id);
  if (!n.parent) return addFree(n.x, n.y + sizeOf(id).h / 2 + 50);
  pushUndo();
  const p = N(n.parent), s = newNode('', p.id);
  if (M.auto) { s.x = n.x; s.y = n.y; } else if (M.dir === 'down') { s.x = n.x + sizeOf(id).w / 2 + 70; s.y = n.y; } else { s.x = n.x; s.y = n.y + sizeOf(id).h / 2 + 30; }
  M.nodes[s.id] = s; p.children.splice(p.children.indexOf(id) + 1, 0, s.id); born.add(s.id);
  vibrate(); emit('add');
  afterChange();
  startEdit(s.id, true);
}
function addFree(x, y) {
  if (edit) commitEdit();
  pushUndo();
  const n = newNode('', null); n.x = x; n.y = y;
  M.nodes[n.id] = n; born.add(n.id);
  if (focusId) { focusId = null; updFocus(); }
  vibrate();
  afterChange();
  startEdit(n.id, true);
}
function removeNodeRaw(id) {
  const n = N(id), ids = subtree(id);
  if (n.parent) { const p = N(n.parent); p.children = p.children.filter(c => c !== id); }
  const s = new Set(ids);
  ids.forEach(i => { delete M.nodes[i]; multi.delete(i); });
  M.links = M.links.filter(l => !s.has(l.a) && !s.has(l.b));
  for (const g of M.groups) g.ids = g.ids.filter(i => !s.has(i));
  M.groups = M.groups.filter(g => g.ids.length);
  if (focusId && s.has(focusId)) { focusId = null; updFocus(); }
}
function deleteNodes(ids) {
  if (edit) commitEdit();
  ids = topSelected(ids.filter(id => M.nodes[id] && !isRoot(id)));
  if (!ids.length) return;
  pushUndo();
  let cnt = 0; const parent = N(ids[0]).parent;
  for (const id of ids) { cnt += subtree(id).length; removeNodeRaw(id); }
  sel = null; multi.clear();
  afterChange(); updMulti();
  if (ids.length === 1 && parent && M.nodes[parent]) select(parent); else refreshSelUI(true);
  toast(cnt > 1 ? `${cnt} ideias excluídas` : 'Ideia excluída', 'Desfazer', undo);
}
const deleteNode = id => deleteNodes([id]);
function toggleCollapse(id) {
  const n = N(id); if (!n || !n.children.length) return;
  pushUndo(); n.collapsed = !n.collapsed;
  afterChange();
}
function toggleDone(id) { const n = N(id); pushUndo(); n.done = !n.done; vibrate(); afterChange(); }
function setColor(ids, c) { pushUndo(); for (const id of ids) if (M.nodes[id]) N(id).color = c || null; afterChange(); }
function reparent(id, tid) {
  const n = N(id), t = N(tid);
  if (n.parent) { const old = N(n.parent); old.children = old.children.filter(c => c !== id); }
  t.children.push(id); n.parent = tid; t.collapsed = false;
  if (!M.auto) {
    const side = !isRoot(tid) ? (sideOf(tid) || 1) : (n.x >= t.x ? 1 : -1);
    const nx = t.x + side * (sizeOf(tid).w / 2 + 70 + sizeOf(id).w / 2), ny = t.y + (t.children.length - 1) * 20;
    const dx = nx - n.x, dy = ny - n.y;
    for (const i of subtree(id)) { N(i).x += dx; N(i).y += dy; }
  }
}
function reorder(id) {
  const n = N(id), p = N(n.parent), by = M.dir === 'down' ? 'x' : 'y';
  if (isRoot(p.id) && M.dir === 'both') {
    const R = p.children.filter(c => N(c).x >= p.x).sort((a, b) => N(a).y - N(b).y);
    const L = p.children.filter(c => N(c).x < p.x).sort((a, b) => N(a).y - N(b).y);
    p.children = [...R, ...L];
  } else p.children.sort((a, b) => N(a)[by] - N(b)[by]);
}
function detach(id) {
  const n = N(id); if (!n || !n.parent) return;
  pushUndo();
  const old = N(n.parent); old.children = old.children.filter(c => c !== id); n.parent = null;
  for (const i of subtree(id)) { N(i).x += 40; N(i).y += 60; }
  afterChange();
  toast('Agora é uma ideia solta. Arraste-a sobre outra ideia para prendê-la de novo.');
}
function topSelected(ids) { const s = new Set(ids); return ids.filter(id => { let n = N(id); while (n && n.parent) { if (s.has(n.parent)) return false; n = N(n.parent); } return true; }); }
function groupNodes(ids) {
  ids = topSelected(ids.filter(id => M.nodes[id])); if (!ids.length) return;
  pushUndo();
  M.groups.push({ id: uid(), ids, label: '', color: null });
  afterChange();
  toast('Grupo criado. Dê um nome a ele em Detalhes.', 'Nomear', () => { select(ids[0]); openPanel('ideia'); setTimeout(() => $('[data-glabel]')?.focus(), 300); });
}

/* ---- copiar, colar e duplicar ---- */
let clip = null;
function serial(id) {
  const n = N(id);
  return { text: n.text, note: n.note, emoji: n.emoji, color: n.color, shape: n.shape, done: n.done, date: n.date, links: n.links.map(l => ({ ...l })), files: n.files.map(f => ({ ...f })), img: n.img ? { ...n.img } : null, collapsed: n.collapsed, children: n.children.map(serial) };
}
function copyNodes(ids) {
  ids = topSelected(ids.filter(id => M.nodes[id])); if (!ids.length) return;
  clip = ids.map(serial);
  try { localStorage.setItem(CLIPKEY, JSON.stringify(clip)); } catch (e) {}
  const text = ids.map(id => toOutline(M, id, 1)).join('');
  try { navigator.clipboard && navigator.clipboard.writeText(text).catch(() => {}); } catch (e) {}
  toast(ids.length > 1 ? `${ids.length} ramos copiados` : 'Ramo copiado');
}
function loadClip() { if (clip) return clip; try { clip = JSON.parse(localStorage.getItem(CLIPKEY) || 'null'); } catch (e) {} return clip; }
function insertSerial(m, parentId, it, x, y, mark) {
  const n = newNode(it.text, parentId);
  Object.assign(n, { note: it.note || '', emoji: it.emoji || '', color: it.color || null, shape: it.shape || 'auto', done: it.done ?? null, date: it.date || null, links: (it.links || []).map(l => ({ ...l })), files: (it.files || []).map(f => ({ ...f })), img: it.img ? { ...it.img } : null, collapsed: !!it.collapsed });
  n.x = x; n.y = y;
  m.nodes[n.id] = n;
  if (parentId) m.nodes[parentId].children.push(n.id);
  if (mark) mark.add(n.id);
  for (const c of it.children || []) insertSerial(m, n.id, c, x, y, mark);
  return n.id;
}
async function pasteInto(targetId) {
  let items = loadClip();
  if (!items || !items.length) { try { const t = await navigator.clipboard.readText(); const parsed = parseOutline(t); if (parsed.length) items = parsed; } catch (e) {} }
  if (!items || !items.length) { toast('Nada para colar. Copie um ramo primeiro.'); return; }
  pushUndo();
  const t = targetId ? N(targetId) : null, c = centerWorld();
  const ids = items.map((it, i) => insertSerial(M, targetId || null, it, t ? t.x : c.x, t ? t.y : c.y + i * 70, born));
  if (t) t.collapsed = false;
  afterChange();
  toast(ids.length > 1 ? `${ids.length} ramos colados` : 'Ramo colado');
}
function duplicate(id) {
  if (isRoot(id)) return;
  pushUndo();
  const n = N(id), nid = insertSerial(M, n.parent, serial(id), n.x, n.y + (n.parent ? 0 : 80), born);
  if (n.parent) { const ch = N(n.parent).children; ch.pop(); ch.splice(ch.indexOf(id) + 1, 0, nid); }
  afterChange(); select(nid);
  toast('Ramo duplicado');
}

/* ---- edição de texto no próprio mapa ---- */
let shiftDown = false;
function startEdit(id, isNew = false) {
  if (edit) commitEdit();
  if (!visSet.has(id)) reveal(id);
  select(id);
  let el = elMap.get(id);
  if (!el) { renderNodes(); renderEdges(); el = elMap.get(id); }
  if (!el) return;
  const t = el.querySelector('.txt');
  edit = { id, t, orig: N(id).text, isNew };
  el.classList.add('editing');
  t.contentEditable = 'plaintext-only';
  if (t.contentEditable !== 'plaintext-only') t.contentEditable = 'true';
  t.focus({ preventScroll: true });
  const r = document.createRange(); r.selectNodeContents(t);
  const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  t.addEventListener('keydown', onEditKey);
  t.addEventListener('beforeinput', onEditBefore);
  t.addEventListener('input', onEditInput);
  t.addEventListener('blur', () => { if (edit && edit.t === t) commitEdit(); });
  setTimeout(() => edit && edit.id === id && ensureVisible(id), 280);
  if (coach) setTimeout(positionRing, 60);
}
function onEditKey(e) {
  e.stopPropagation();
  shiftDown = e.shiftKey;
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); const id = edit.id; commitEdit(); if (e.ctrlKey || e.metaKey) addSibling(id); }
  else if (e.key === 'Tab') { e.preventDefault(); const id = edit.id; commitEdit(); if (M.nodes[id]) addChild(id); }
  else if (e.key === 'Escape') { e.preventDefault(); if (!edit.isNew) edit.t.textContent = edit.orig; commitEdit(); }
}
function onEditBefore(e) { if ((e.inputType === 'insertParagraph' || e.inputType === 'insertLineBreak') && !shiftDown) { e.preventDefault(); commitEdit(); } }
function onEditInput() {
  if (!edit) return;
  const el = elMap.get(edit.id);
  size[edit.id] = { w: el.offsetWidth, h: el.offsetHeight };
  renderEdges();
}
function commitEdit() {
  if (!edit) return;
  const { id, t, orig, isNew } = edit;
  edit = null; shiftDown = false;
  const txt = t.innerText.replace(/ /g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  t.contentEditable = 'false';
  try { getSelection().removeAllRanges(); } catch (e) {}
  const n = M && M.nodes[id]; if (!n) return;
  emit('commit');
  if (isNew && !txt) { removeNodeRaw(id); undoStack.pop(); updUndo(); afterChange(); select(n.parent || null); return; }
  if (txt !== orig) {
    if (!isNew) pushUndo();
    n.text = txt;
    if (/^https?:\/\/\S+$/i.test(txt)) { n.links.push({ url: txt, title: '' }); n.text = prettyUrl(txt); }
  }
  afterChange();
  const ft = $('#f-text'); if (ft && sel === id && document.activeElement !== ft) ft.value = n.text;
}

/* ---- seleção ---- */
function select(id) {
  if (sel !== id) {
    sel = id;
    for (const [i, el] of elMap) el.classList.toggle('sel', i === id && !multi.size);
    refreshSelUI(true);
  }
  if (id) emit('select');
}
function refreshSelUI(panelToo) {
  const nb = $('#nodebar');
  nb.hidden = !sel || !M.nodes[sel] || selMode || multi.size > 0 || !!present;
  stageEl.classList.toggle('has-sel', !nb.hidden || !$('#multibar').hidden);
  if (nb.hidden && !multi.size) $('#colorpop').hidden = true;
  if (sel && M.nodes[sel]) {
    $('#nb-del').disabled = isRoot(sel);
    if (!$('#colorpop').hidden) renderColorPop();
  }
  if (panelToo && panelVisible() && !panelEl.contains(document.activeElement)) renderPanel();
  else if (panelToo && curTab === 'estrutura') renderPanel();
}
function colorTargets() { return multi.size ? [...multi] : sel ? [sel] : []; }
function renderColorPop() {
  const ids = colorTargets(); if (!ids.length) return;
  const cur = N(ids[0]).color, P = pal();
  $('#colorpop').innerHTML = `<button class="sw auto ${!cur ? 'on' : ''}" data-col="" aria-label="Cor automática">A</button>` +
    P.map(c => `<button class="sw ${cur === c ? 'on' : ''}" data-col="${c}" style="--sw:${c}" aria-label="Cor ${c}"></button>`).join('') +
    `<label class="sw custom" aria-label="Outra cor"><input type="color" id="pop-color" value="${colorOf(ids[0]) || '#888888'}"></label>`;
}
$('#colorpop').addEventListener('click', e => { const b = e.target.closest('[data-col]'); if (b) { setColor(colorTargets(), b.dataset.col); renderColorPop(); } });
$('#colorpop').addEventListener('change', e => { if (e.target.id === 'pop-color') { setColor(colorTargets(), e.target.value); renderColorPop(); } });
$('#nb-child').onclick = () => sel && addChild(sel);
$('#nb-sib').onclick = () => sel && addSibling(sel);
$('#nb-edit').onclick = () => sel && startEdit(sel);
$('#nb-color').onclick = () => { const p = $('#colorpop'); p.hidden = !p.hidden; if (!p.hidden) renderColorPop(); };
$('#nb-details').onclick = () => openPanel('ideia');
$('#nb-more').onclick = () => sel && nodeMenu(sel);
$('#nb-del').onclick = () => sel && deleteNode(sel);
function nodeMenu(id) {
  const n = N(id), root = isRoot(id);
  const items = [
    { k: 'copy', icon: 'copy', label: 'Copiar ramo', sub: 'Também vai como texto para outros apps' },
    { k: 'paste', icon: 'paste', label: 'Colar dentro desta ideia' },
  ];
  if (!root) items.push({ k: 'dup', icon: 'copy', label: 'Duplicar ramo' });
  if (n.children.length) items.push({ k: 'collapse', icon: n.collapsed ? 'expand' : 'collapse', label: n.collapsed ? 'Expandir ramo' : 'Recolher ramo' });
  items.push('-', { k: 'group', icon: 'group', label: 'Agrupar este ramo', sub: 'Desenha uma moldura em volta' });
  if (n.parent) items.push({ k: 'detach', icon: 'detach', label: 'Soltar do ramo', sub: 'Vira uma ideia solta no mapa' });
  items.push({ k: 'focus', icon: 'focus', label: focusId === id ? 'Sair do foco' : 'Focar só neste ramo' },
    { k: 'present', icon: 'present', label: 'Apresentar a partir daqui' },
    { k: 'select', icon: 'select', label: 'Selecionar várias ideias' });
  menuModal(short(n.text, 34), items, k => {
    if (k === 'copy') copyNodes([id]);
    else if (k === 'paste') pasteInto(id);
    else if (k === 'dup') duplicate(id);
    else if (k === 'collapse') toggleCollapse(id);
    else if (k === 'group') groupNodes([id]);
    else if (k === 'detach') detach(id);
    else if (k === 'focus') setFocus(focusId === id ? null : id);
    else if (k === 'present') startPresent(id);
    else if (k === 'select') { setSelMode(true); toggleMulti(id); }
  });
}
function reveal(id) {
  let changed = false, n = N(id);
  while (n.parent) { const p = N(n.parent); if (p.collapsed) { p.collapsed = false; changed = true; } n = p; }
  if (focusId && focusId !== id && !isAncestor(focusId, id)) { focusId = null; updFocus(); changed = true; }
  if (changed) { if (M.auto) relayout(false); else { renderNodes(); renderEdges(); } }
}

/* ---- seleção múltipla ---- */
function setSelMode(on) {
  if (edit) commitEdit();
  selMode = on; stageEl.classList.toggle('selecting', on); $('#btn-select').classList.toggle('on', on);
  if (on) { if (sel) multi.add(sel); toast('Toque nas ideias para marcar, ou arraste no fundo para marcar uma área.'); }
  else multi.clear();
  updMulti(); renderNodes(); renderEdges();
}
function toggleMulti(id) {
  if (multi.has(id)) multi.delete(id); else multi.add(id);
  const el = elMap.get(id); if (el) { el.classList.toggle('msel', multi.has(id)); }
  for (const [i, e] of elMap) e.classList.toggle('sel', i === sel && !multi.size);
  updMulti();
}
function updMulti() {
  const on = selMode || multi.size > 0;
  $('#multibar').hidden = !on || !!present;
  $('#multi-count').textContent = multi.size ? `${multi.size} marcada${multi.size > 1 ? 's' : ''}` : 'Toque para marcar';
  $$('#multibar [data-need]').forEach(b => b.disabled = !multi.size);
  refreshSelUI(false);
}
$('#btn-select').onclick = () => setSelMode(!selMode);
$('#mb-color').onclick = () => { const p = $('#colorpop'); p.hidden = !p.hidden; if (!p.hidden) renderColorPop(); };
$('#mb-group').onclick = () => { groupNodes([...multi]); setSelMode(false); };
$('#mb-copy').onclick = () => copyNodes([...multi]);
$('#mb-del').onclick = () => { deleteNodes([...multi]); setSelMode(false); };
$('#mb-done').onclick = () => setSelMode(false);

/* ================= gestos ================= */
const ptrs = new Map();
let gst = null, lpTimer = 0, lastTap = { id: null, t: 0 }, lastEmpty = { t: 0, x: 0, y: 0 }, marqueeEl = null;
stageEl.addEventListener('pointerdown', e => {
  if (e.target.closest('[data-ui]')) return;
  if (edit && e.target.closest('.node')?.dataset.id === edit.id) return;
  if (e.button > 0) return;
  cancelAnimationFrame(viewAnim);
  stageEl.setPointerCapture(e.pointerId);
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (ptrs.size === 1) {
    const nodeEl = e.target.closest('.node');
    gst = { type: nodeEl ? 'node' : (selMode ? 'marquee' : 'pan'), id: nodeEl?.dataset.id, sx: e.clientX, sy: e.clientY, vx: M.view.x, vy: M.view.y, moved: false,
      badge: !!e.target.closest('.badge'), chk: !!e.target.closest('.chk'), img: !!e.target.closest('.nimg'), lnk: !!e.target.closest('.nlink'), mod: e.ctrlKey || e.metaKey || e.shiftKey };
    if (nodeEl && !linkFrom && !selMode && !present) {
      clearTimeout(lpTimer);
      lpTimer = setTimeout(() => { if (gst && gst.type === 'node' && !gst.moved) { gst.type = 'none'; select(gst.id); vibrate(); openPanel('ideia'); } }, 520);
    }
  } else if (ptrs.size === 2) {
    clearTimeout(lpTimer);
    if (gst && gst.type === 'drag') finishDrag(gst, null);
    if (gst && gst.type === 'marquee') endMarquee(false);
    const [a, b] = [...ptrs.values()], r = stageEl.getBoundingClientRect();
    gst = { type: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y) || 1, k0: M.view.k, c0: { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top }, v0: { ...M.view } };
  }
});
stageEl.addEventListener('pointermove', e => {
  if (!ptrs.has(e.pointerId) || !gst) return;
  ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (gst.type === 'pinch' && ptrs.size >= 2) {
    const [a, b] = [...ptrs.values()], r = stageEl.getBoundingClientRect();
    const d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2 - r.left, y: (a.y + b.y) / 2 - r.top };
    const k = clamp(gst.k0 * d / gst.d0, 0.12, 3);
    const wx = (gst.c0.x - gst.v0.x) / gst.k0, wy = (gst.c0.y - gst.v0.y) / gst.k0;
    M.view.k = k; M.view.x = c.x - wx * k; M.view.y = c.y - wy * k; applyView();
    gst.moved = true;
    return;
  }
  const dx = e.clientX - gst.sx, dy = e.clientY - gst.sy, dist = Math.hypot(dx, dy);
  if (gst.type === 'pan') {
    if (dist > 4) { gst.moved = true; stageEl.classList.add('panning'); }
    M.view.x = gst.vx + dx; M.view.y = gst.vy + dy; applyView();
  } else if (gst.type === 'marquee') {
    if (dist > 6) {
      gst.moved = true;
      if (!marqueeEl) { marqueeEl = document.createElement('div'); marqueeEl.className = 'marquee'; stageEl.append(marqueeEl); }
      const r = stageEl.getBoundingClientRect();
      const x = Math.min(e.clientX, gst.sx) - r.left, y = Math.min(e.clientY, gst.sy) - r.top;
      Object.assign(marqueeEl.style, { left: x + 'px', top: y + 'px', width: Math.abs(dx) + 'px', height: Math.abs(dy) + 'px' });
      gst.ex = e.clientX; gst.ey = e.clientY;
    }
  } else if (gst.type === 'node') {
    if (dist > 7 && !linkFrom && !present) {
      clearTimeout(lpTimer);
      gst.moved = true; gst.type = 'drag';
      pushUndo();
      const roots = multi.has(gst.id) && multi.size > 1 ? topSelected([...multi]) : [gst.id];
      gst.roots = roots;
      gst.ids = [...new Set(roots.flatMap(r => subtree(r)))]; gst.idSet = new Set(gst.ids);
      gst.start = gst.ids.map(i => [i, N(i).x, N(i).y]);
      if (!multi.size && sel !== gst.id) select(gst.id);
      for (const r of roots) elMap.get(r)?.classList.add('dragging');
    } else if (dist > 7) gst.moved = true;
  }
  if (gst.type === 'drag') {
    const k = M.view.k;
    for (const [i, x, y] of gst.start) { N(i).x = x + dx / k; N(i).y = y + dy / k; }
    placeEls(); renderEdges();
    const under = document.elementFromPoint(e.clientX, e.clientY)?.closest?.('.node');
    const tid = under?.dataset.id;
    const ok = tid && !gst.idSet.has(tid) && !(gst.roots.length === 1 && tid === N(gst.id).parent) ? tid : null;
    if (ok !== gst.target) { if (gst.target) elMap.get(gst.target)?.classList.remove('drop'); gst.target = ok; if (ok) { elMap.get(ok)?.classList.add('drop'); vibrate(); } }
  }
});
function endMarquee(apply) {
  if (marqueeEl) { marqueeEl.remove(); marqueeEl = null; }
  if (!apply || !gst || gst.ex === undefined) return;
  const r = stageEl.getBoundingClientRect(), v = M.view;
  const x0 = (Math.min(gst.sx, gst.ex) - r.left - v.x) / v.k, x1 = (Math.max(gst.sx, gst.ex) - r.left - v.x) / v.k;
  const y0 = (Math.min(gst.sy, gst.ey) - r.top - v.y) / v.k, y1 = (Math.max(gst.sy, gst.ey) - r.top - v.y) / v.k;
  let c = 0;
  for (const id of visible) { const n = N(id); if (n.x > x0 && n.x < x1 && n.y > y0 && n.y < y1 && !multi.has(id)) { multi.add(id); c++; } }
  if (c) { renderNodes(); updMulti(); vibrate(); }
}
function endPointer(e) {
  if (!ptrs.has(e.pointerId)) return;
  ptrs.delete(e.pointerId);
  clearTimeout(lpTimer);
  stageEl.classList.remove('panning');
  if (!gst) return;
  if (gst.type === 'pinch') {
    saveView(); emit('pan');
    if (ptrs.size === 1) { const [p] = [...ptrs.values()]; gst = { type: 'pan', sx: p.x, sy: p.y, vx: M.view.x, vy: M.view.y, moved: true }; }
    else gst = null;
    return;
  }
  if (ptrs.size) return;
  const G = gst; gst = null;
  if (e.type === 'pointercancel') { if (G.type === 'drag') finishDrag(G, null); if (G.type === 'marquee') { gst = G; endMarquee(false); gst = null; } return; }
  if (G.type === 'drag') { finishDrag(G, G.target); return; }
  if (G.type === 'marquee') { gst = G; endMarquee(G.moved); gst = null; return; }
  if (present) { if (!G.moved) presentGo(e.clientX - stageEl.getBoundingClientRect().left < stageEl.clientWidth * 0.25 ? -1 : 1); return; }
  if (G.type === 'pan') {
    if (G.moved) { saveView(); emit('pan'); return; }
    if (linkFrom) { linkFrom = null; renderNodes(); toast('Conexão cancelada'); return; }
    const now = Date.now();
    if (now - lastEmpty.t < 330 && Math.hypot(e.clientX - lastEmpty.x, e.clientY - lastEmpty.y) < 30) {
      const r = stageEl.getBoundingClientRect(), v = M.view;
      lastEmpty.t = 0;
      addFree((e.clientX - r.left - v.x) / v.k, (e.clientY - r.top - v.y) / v.k);
      return;
    }
    lastEmpty = { t: now, x: e.clientX, y: e.clientY };
    if (sel) select(null);
    $('#colorpop').hidden = true;
    return;
  }
  if (G.type === 'node' && !G.moved) tapNode(G);
}
stageEl.addEventListener('pointerup', endPointer);
stageEl.addEventListener('pointercancel', endPointer);
function tapNode(G) {
  const id = G.id;
  if (linkFrom) {
    if (id !== linkFrom && !M.links.some(l => (l.a === linkFrom && l.b === id) || (l.a === id && l.b === linkFrom))) {
      pushUndo(); M.links.push({ a: linkFrom, b: id }); linkFrom = null; afterChange(); toast('Ideias conectadas');
      if (curTab === 'ideia') renderPanel();
    } else { linkFrom = null; renderNodes(); }
    return;
  }
  if (selMode || G.mod) { if (G.mod && !selMode && sel && !multi.size) multi.add(sel); toggleMulti(id); return; }
  if (G.chk) { toggleDone(id); return; }
  if (G.badge) { toggleCollapse(id); return; }
  if (sel === id && G.img) { viewImage(id); return; }
  if (sel === id && G.lnk) { const l = N(id).links[0]; if (l) openUrl(l.url); return; }
  const now = Date.now();
  if (sel === id && (now - lastTap.t > 120)) startEdit(id);
  else select(id);
  lastTap = { id, t: now };
}
function finishDrag(G, tid) {
  for (const r of G.roots || [G.id]) elMap.get(r)?.classList.remove('dragging');
  if (G.target) elMap.get(G.target)?.classList.remove('drop');
  const n = N(G.id);
  if (tid) {
    for (const r of G.roots) reparent(r, tid);
    toast(`${G.roots.length > 1 ? G.roots.length + ' ideias movidas' : 'Movida'} para “${short(N(tid).text)}”`);
  } else if (M.auto && n.parent && G.roots.length === 1) reorder(G.id);
  afterChange();
}
stageEl.addEventListener('wheel', e => {
  e.preventDefault();
  const r = stageEl.getBoundingClientRect(), px = e.clientX - r.left, py = e.clientY - r.top;
  if (e.ctrlKey || (e.deltaX === 0 && Math.abs(e.deltaY) >= 40 && e.deltaMode === 0 && Number.isInteger(e.deltaY)) || e.deltaMode === 1) {
    zoomAt(px, py, M.view.k * Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0018)));
  } else { M.view.x -= e.deltaX; M.view.y -= e.deltaY; applyView(); saveView(); }
}, { passive: false });
stageEl.addEventListener('dblclick', e => { const n = e.target.closest('.node'); if (n && !edit && !selMode && !present) startEdit(n.dataset.id); });
new ResizeObserver(() => {
  if (!M || !editorOpen) return;
  const W = stageEl.clientWidth, H = stageEl.clientHeight;
  if (stageEl._w) { M.view.x += (W - stageEl._w) / 2; M.view.y += (H - stageEl._h) / 2; applyView(); }
  stageEl._w = W; stageEl._h = H;
  if (edit) setTimeout(() => edit && ensureVisible(edit.id), 60);
}).observe(stageEl);

$('#zoom-in').onclick = () => zoomAt(stageEl.clientWidth / 2, stageEl.clientHeight / 2, M.view.k * 1.25);
$('#zoom-out').onclick = () => zoomAt(stageEl.clientWidth / 2, stageEl.clientHeight / 2, M.view.k / 1.25);
$('#btn-fit').onclick = () => fit(true);
$('#btn-organize').onclick = () => organize();
$('#btn-free').onclick = () => { const c = centerWorld(); addFree(c.x, c.y - 40); };
function organize() {
  pushUndo();
  const wasAuto = M.auto; M.auto = true;
  relayout(true);
  setTimeout(() => fit(true), 300);
  save();
  toast(wasAuto ? 'Mapa organizado' : 'Mapa organizado. A organização automática foi ligada.');
}

/* ================= teclado ================= */
addEventListener('keydown', e => {
  if (!$('#modal').hidden) { if (e.key === 'Escape') closeModal(); return; }
  if (!editorOpen) return;
  if (present) {
    if (['ArrowRight', 'ArrowDown', ' ', 'PageDown', 'Enter'].includes(e.key)) { e.preventDefault(); presentGo(1); }
    else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace'].includes(e.key)) { e.preventDefault(); presentGo(-1); }
    else if (e.key === 'Escape') stopPresent();
    return;
  }
  const t = e.target, inField = /INPUT|TEXTAREA|SELECT/.test(t.tagName) || t.isContentEditable;
  const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
  if (mod && k === 'z' && !inField) { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && k === 'y' && !inField) { e.preventDefault(); redo(); return; }
  if (mod && k === 'f') { e.preventDefault(); openSearch(); return; }
  if (inField) return;
  if (mod && k === 'c') { const ids = colorTargets(); if (ids.length) { e.preventDefault(); copyNodes(ids); } return; }
  if (mod && k === 'v') { e.preventDefault(); pasteInto(sel); return; }
  if (mod && k === 'd') { e.preventDefault(); if (sel) duplicate(sel); return; }
  if (mod && k === 'a') { e.preventDefault(); if (!selMode) setSelMode(true); visible.forEach(id => multi.add(id)); renderNodes(); updMulti(); return; }
  if (e.key === 'Escape') { if (selMode || multi.size) setSelMode(false); else select(null); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && multi.size) { e.preventDefault(); deleteNodes([...multi]); setSelMode(false); return; }
  if (!sel) { if (['Enter', 'Tab', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.key)) { e.preventDefault(); select(focusId || M.root); } return; }
  switch (e.key) {
    case 'Tab': e.preventDefault(); addChild(sel); break;
    case 'Enter': e.preventDefault(); addSibling(sel); break;
    case 'F2': case ' ': e.preventDefault(); startEdit(sel); break;
    case 'Delete': case 'Backspace': e.preventDefault(); deleteNode(sel); break;
    case 'ArrowUp': case 'ArrowDown': case 'ArrowLeft': case 'ArrowRight': e.preventDefault(); nav(e.key); break;
  }
});
function nav(key) {
  const n = N(sel), near = list => list.sort((a, b) => Math.abs(N(a).y - n.y) - Math.abs(N(b).y - n.y))[0];
  let to = null;
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    if (!n.parent) return;
    const side = sideOf(sel), sib = N(n.parent).children.filter(c => visSet.has(c) && sideOf(c) === side).sort((a, b) => N(a).y - N(b).y);
    to = sib[sib.indexOf(sel) + (key === 'ArrowUp' ? -1 : 1)];
  } else {
    const dir = key === 'ArrowRight' ? 1 : -1;
    const kids = n.collapsed ? [] : n.children.filter(c => visSet.has(c));
    if (isRoot(sel)) to = near(kids.filter(c => sideOf(c) === dir));
    else if ((sideOf(sel) || 1) === dir) to = near(kids);
    else to = n.parent;
  }
  if (to) { select(to); ensureVisible(to); }
}

/* ================= busca e foco ================= */
function openSearch() { $('#searchbar').hidden = false; drawMinimapSoon(); const i = $('#search-input'); i.focus(); i.select(); }
function closeSearch() { $('#searchbar').hidden = true; $('#search-input').value = ''; $('#search-count').textContent = ''; searchHits = new Set(); hitList = []; if (M && editorOpen) { renderNodes(); } }
function doSearch() {
  const q = norm($('#search-input').value.trim());
  hitList = q ? Object.values(M.nodes).filter(n => norm(n.text).includes(q) || norm(n.note).includes(q) || n.emoji === q || n.links.some(l => norm(l.url + ' ' + (l.title || '')).includes(q))).map(n => n.id) : [];
  searchHits = new Set(hitList); hitIdx = -1;
  $('#search-count').textContent = q ? (hitList.length ? `${hitList.length} encontrada${hitList.length > 1 ? 's' : ''}` : 'Nada encontrado') : '';
  renderNodes();
}
function nextHit() {
  if (!hitList.length) return;
  hitIdx = (hitIdx + 1) % hitList.length;
  const id = hitList[hitIdx];
  reveal(id); select(id); centerOn(id); renderNodes(); renderEdges();
  $('#search-count').textContent = `${hitIdx + 1} de ${hitList.length}`;
}
$('#btn-search').onclick = () => $('#searchbar').hidden ? openSearch() : closeSearch();
$('#search-close').onclick = closeSearch;
$('#search-next').onclick = nextHit;
$('#search-input').addEventListener('input', doSearch);
$('#search-input').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); nextHit(); } if (e.key === 'Escape') closeSearch(); });
function setFocus(id) {
  focusId = id && !isRoot(id) ? id : null;
  updFocus(); renderNodes(); renderEdges();
  setTimeout(() => fit(true), 30);
  if (curTab === 'ideia') renderPanel();
}
function updFocus() {
  $('#focusbar').hidden = !focusId;
  if (focusId && M.nodes[focusId]) $('#focus-label').textContent = 'Foco: ' + short(N(focusId).text, 32);
}
$('#focus-exit').onclick = () => setFocus(null);

/* ================= apresentação ================= */
function startPresent(fromId) {
  if (edit) commitEdit();
  if (selMode) setSelMode(false);
  const start = fromId || focusId || M.root;
  const steps = [];
  const walk = id => { const n = N(id); const kids = n.collapsed ? [] : n.children; if (kids.length || id === start) steps.push(id); kids.forEach(walk); };
  walk(start);
  if (!fromId && !focusId) freeRoots().forEach(walk);
  steps.push('__all');
  present = { steps, i: 0, set: new Set(), start };
  select(null); closeSearch(); closePanel(); $('#colorpop').hidden = true;
  $('#editor').classList.add('presenting');
  updMulti();
  try { const p = document.documentElement.requestFullscreen && document.documentElement.requestFullscreen(); if (p && p.catch) p.catch(() => {}); } catch (e) {}
  setTimeout(showStep, 80);
}
function showStep() {
  if (!present) return;
  const s = present.steps[present.i];
  let ids;
  if (s === '__all') { computeVisible(); ids = present.start === M.root ? visible.slice() : subtree(present.start).filter(i => visSet.has(i)); }
  else { const n = N(s); ids = [s, ...(n.collapsed ? [] : n.children)]; }
  present.set = new Set(ids);
  renderNodes(); renderEdges();
  fit(true, ids);
  $('#pres-label').textContent = s === '__all' ? 'Visão geral' : short(N(s).text, 44);
  $('#pres-count').textContent = `${present.i + 1} de ${present.steps.length}`;
  $('#pres-prev').disabled = present.i === 0;
  $('#pres-next').querySelector('span').textContent = present.i === present.steps.length - 1 ? 'Concluir' : 'Avançar';
}
function presentGo(d) { if (!present) return; const j = present.i + d; if (j < 0) return; if (j >= present.steps.length) { stopPresent(); return; } present.i = j; showStep(); }
function stopPresent() {
  if (!present) return;
  present = null;
  $('#editor').classList.remove('presenting');
  try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) {}
  updMulti(); renderNodes(); renderEdges(); setTimeout(() => fit(true), 60);
}
$('#pres-prev').onclick = () => presentGo(-1);
$('#pres-next').onclick = () => presentGo(1);
$('#pres-exit').onclick = stopPresent;

/* ================= painel / folha ================= */
function panelVisible() { return isWide() ? prefs.panel : panelEl.classList.contains('open'); }
function applyPanelPref() { $('#workspace').classList.toggle('panel-off', !prefs.panel); }
function openPanel(tab) {
  if (tab) curTab = tab;
  if (isWide()) { prefs.panel = true; savePrefs(); applyPanelPref(); }
  else panelEl.classList.add('open');
  $('#colorpop').hidden = true;
  renderPanel();
  if (tab === 'ideia') emit('details');
}
function closePanel() { panelEl.classList.remove('open'); }
$('#btn-panel').onclick = () => {
  if (isWide()) { prefs.panel = !prefs.panel; savePrefs(); applyPanelPref(); if (prefs.panel) renderPanel(); }
  else if (panelEl.classList.contains('open')) closePanel();
  else openPanel(sel ? curTab : (curTab === 'ideia' ? 'estrutura' : curTab));
};
$('#panel-close').onclick = closePanel;
$('#sheet-backdrop').onclick = closePanel;
panelEl.querySelector('.tabs').addEventListener('click', e => { const b = e.target.closest('[data-tab]'); if (b) { curTab = b.dataset.tab; renderPanel(); } });
(() => {
  let y0 = null;
  panelEl.addEventListener('touchstart', e => { if (e.target.closest('.p-head,.sheet-grab') && !isWide()) y0 = e.touches[0].clientY; }, { passive: true });
  panelEl.addEventListener('touchmove', e => { if (y0 !== null && e.touches[0].clientY - y0 > 70) { closePanel(); y0 = null; } }, { passive: true });
  panelEl.addEventListener('touchend', () => { y0 = null; });
})();
function renderPanel() {
  if (!M) return;
  panelEl.querySelectorAll('.tabs button').forEach(b => { b.classList.toggle('on', b.dataset.tab === curTab); b.setAttribute('aria-selected', b.dataset.tab === curTab); });
  const st = bodyEl.scrollTop;
  if (curTab === 'ideia') renderIdeia();
  else if (curTab === 'estrutura') renderOutlineTab();
  else renderMapaTab();
  bodyEl.scrollTop = st;
}
function bindLive(el, fn, relayoutOnBlur = true) {
  let pushed = false;
  el.addEventListener('focus', () => { pushed = false; });
  el.addEventListener('input', () => { if (!pushed) { pushUndo(); pushed = true; } fn(el.value); save(); renderNodes(); renderEdges(); });
  el.addEventListener('blur', () => { if (pushed && relayoutOnBlur && M.auto) relayout(true); });
}
function groupsOf(id) { return M.groups.filter(g => g.ids.some(gid => gid === id || isAncestor(gid, id))); }
function renderIdeia() {
  if (!sel || !M.nodes[sel]) {
    bodyEl.innerHTML = `<div class="empty">${icon('details')}<b>Nenhuma ideia selecionada</b><span>Toque numa ideia do mapa para editar texto, notas, imagem, data, links, anexos e conexões.</span></div>`;
    return;
  }
  const id = sel, n = N(id), P = pal();
  const links = M.links.map((l, i) => ({ l, i })).filter(({ l }) => l.a === id || l.b === id);
  const groups = groupsOf(id);
  bodyEl.innerHTML = `
    <label class="fld"><span>Texto</span><textarea id="f-text" rows="2">${esc(n.text)}</textarea></label>
    <div class="fld"><span>Imagem</span>${n.img ? `
      <img class="img-prev" id="f-img" alt="Imagem da ideia">
      <div class="seg" id="f-imgsize">${[[120, 'Pequena'], [180, 'Média'], [260, 'Grande']].map(([v, l]) => `<button data-v="${v}" class="${n.img.dw === v ? 'on' : ''}">${l}</button>`).join('')}</div>
      <div class="row"><button class="btn sm" id="f-img-change">${icon('image')} Trocar</button><button class="btn sm danger" id="f-img-del">${icon('trash')} Remover</button></div>`
      : `<button class="btn ghost" id="f-img-add">${icon('image')} Adicionar imagem ou foto</button>`}</div>
    <div class="fld"><span>Ícone</span><div class="emojis">${['', ...EMOJIS].map(e => `<button class="emo-b ${n.emoji === e ? 'on' : ''}" data-emo="${e}" aria-label="${e ? 'Ícone ' + e : 'Sem ícone'}">${e || icon('close')}</button>`).join('')}</div></div>
    <div class="fld"><span>Cor do ramo</span><div class="swatches">
      <button class="sw auto ${!n.color ? 'on' : ''}" data-col="" aria-label="Cor automática">A</button>
      ${P.map(c => `<button class="sw ${n.color === c ? 'on' : ''}" data-col="${c}" style="--sw:${c}" aria-label="Cor ${c}"></button>`).join('')}
      <label class="sw custom ${n.color && !P.includes(n.color) ? 'on' : ''}" aria-label="Outra cor"><input type="color" id="f-color" value="${colorOf(id) || '#888888'}"></label>
    </div></div>
    <div class="fld"><span>Formato</span><div class="seg" id="f-shape">${[['auto', 'Padrão'], ['pill', 'Cápsula'], ['box', 'Caixa'], ['plain', 'Sublinhado']].map(([v, l]) => `<button data-shape="${v}" class="${n.shape === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="fld"><span>Data e tarefa</span>
      <div class="row"><input type="date" id="f-date" value="${n.date || ''}" aria-label="Data">${n.date ? `<button class="icon-btn" id="f-date-del" aria-label="Remover data">${icon('close')}</button>` : ''}</div>
      <label class="toggle"><input type="checkbox" id="f-task" ${n.done !== null && n.done !== undefined ? 'checked' : ''}><span>É uma tarefa <small style="color:var(--muted)">(mostra uma caixinha para marcar)</small></span></label>
    </div>
    <label class="fld"><span>Notas</span><textarea id="f-note" rows="5" placeholder="Detalhes, lembretes, por que isso importa…">${esc(n.note)}</textarea></label>
    <div class="fld"><span>Links</span>
      <div class="links">${n.links.map((l, i) => `<div class="lrow"><a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.title || prettyUrl(l.url))}<small>${esc(prettyUrl(l.url).split('/')[0])}</small></a><button class="icon-btn" data-lcopy="${i}" aria-label="Copiar link">${icon('copy')}</button><button class="icon-btn" data-ldel="${i}" aria-label="Remover link">${icon('close')}</button></div>`).join('')}</div>
      <div class="row"><input type="url" id="f-url" placeholder="Cole um endereço (https://…)" inputmode="url"><button class="btn sm" id="f-url-add">${icon('plus')} Adicionar</button></div>
    </div>
    <div class="fld"><span>Anexos</span>
      <div class="links">${n.files.map((f, i) => `<div class="lrow"><span>${esc(f.name)}<small>${fmtSize(f.size)}</small></span><button class="icon-btn" data-fopen="${i}" aria-label="Abrir ${esc(f.name)}">${icon('next')}</button><button class="icon-btn" data-fshare="${i}" aria-label="Compartilhar ou salvar">${icon('download')}</button><button class="icon-btn" data-fdel="${i}" aria-label="Remover anexo">${icon('close')}</button></div>`).join('')}</div>
      <button class="btn ghost" id="f-att">${icon('clip')} Anexar arquivo</button>
    </div>
    <div class="fld"><span>Conexões</span>
      <div class="links">${links.length ? links.map(({ l, i }) => { const o = l.a === id ? l.b : l.a; return `<div class="lrow"><span>${l.a === id ? '→' : '←'} ${esc(short(N(o).text, 40))}</span><button class="icon-btn" data-unlink="${i}" aria-label="Remover conexão">${icon('close')}</button></div>`; }).join('') : '<p class="hint">Ligue esta ideia a outra de qualquer ramo, com uma linha tracejada.</p>'}</div>
      <button class="btn ghost" id="f-link">${icon('link')} Conectar a outra ideia</button>
    </div>
    <div class="fld"><span>Grupos</span>
      <div class="links">${groups.map(g => `<div class="lrow"><input type="text" data-glabel="${g.id}" value="${esc(g.label)}" placeholder="Nome do grupo"><button class="icon-btn" data-gdel="${g.id}" aria-label="Desfazer grupo">${icon('close')}</button></div>`).join('')}</div>
      ${groups.length ? '' : `<button class="btn ghost" id="f-group">${icon('group')} Agrupar este ramo</button>`}
    </div>
    <div class="actions">
      <button class="btn" id="f-dump">${icon('dump')} Despejar várias ideias aqui</button>
      <button class="btn" id="f-focus">${icon('focus')} ${focusId === id ? 'Sair do foco' : 'Focar só neste ramo'}</button>
      <button class="btn" id="f-present">${icon('present')} Apresentar a partir daqui</button>
      ${n.parent ? `<button class="btn" id="f-detach">${icon('detach')} Soltar do ramo</button>` : ''}
      ${!isRoot(id) ? `<button class="btn danger" id="f-del">${icon('trash')} Excluir ideia${n.children.length ? ' e subideias' : ''}</button>` : ''}
    </div>`;
  const on = (q, fn, ev = 'click') => { const el = $(q, bodyEl); if (el) el.addEventListener(ev, fn); };
  bindLive($('#f-text'), v => { N(id).text = v.trim(); updTitle(); });
  bindLive($('#f-note'), v => { N(id).note = v; });
  if (n.img) { setBlobSrc($('#f-img'), n.img.id); on('#f-img', () => viewImage(id)); }
  on('#f-img-add', () => pickImage(id)); on('#f-img-change', () => pickImage(id));
  on('#f-img-del', () => { pushUndo(); N(id).img = null; afterChange(); renderPanel(); });
  on('#f-imgsize', e => { const b = e.target.closest('[data-v]'); if (!b) return; pushUndo(); N(id).img.dw = +b.dataset.v; afterChange(); renderPanel(); });
  bodyEl.querySelector('.emojis').onclick = e => { const b = e.target.closest('[data-emo]'); if (!b) return; pushUndo(); N(id).emoji = b.dataset.emo; afterChange(); renderPanel(); };
  bodyEl.querySelector('.swatches').onclick = e => { const b = e.target.closest('[data-col]'); if (!b) return; setColor([id], b.dataset.col); renderPanel(); };
  on('#f-color', e => { setColor([id], e.target.value); renderPanel(); }, 'change');
  on('#f-shape', e => { const b = e.target.closest('[data-shape]'); if (!b) return; pushUndo(); N(id).shape = b.dataset.shape; afterChange(); renderPanel(); });
  on('#f-date', e => { pushUndo(); N(id).date = e.target.value || null; afterChange(); renderPanel(); }, 'change');
  on('#f-date-del', () => { pushUndo(); N(id).date = null; afterChange(); renderPanel(); });
  on('#f-task', e => { pushUndo(); N(id).done = e.target.checked ? false : null; afterChange(); }, 'change');
  const addUrl = () => {
    let u = $('#f-url').value.trim(); if (!u) return;
    if (!/^[a-z]+:\/\//i.test(u)) u = 'https://' + u;
    try { new URL(u); } catch (e) { toast('Esse endereço não parece válido.'); return; }
    pushUndo(); N(id).links.push({ url: u, title: '' }); afterChange(); renderPanel();
  };
  on('#f-url-add', addUrl);
  on('#f-url', e => { if (e.key === 'Enter') { e.preventDefault(); addUrl(); } }, 'keydown');
  bodyEl.onclick = e => {
    const t = e.target.closest('[data-ldel],[data-lcopy],[data-fopen],[data-fshare],[data-fdel],[data-unlink],[data-gdel]'); if (!t) return;
    const d = t.dataset;
    if (d.ldel !== undefined) { pushUndo(); N(id).links.splice(+d.ldel, 1); afterChange(); renderPanel(); }
    else if (d.lcopy !== undefined) { const u = N(id).links[+d.lcopy].url; navigator.clipboard?.writeText(u).then(() => toast('Link copiado')).catch(() => copyModal('Link', u)); }
    else if (d.fopen !== undefined) openAttachment(N(id).files[+d.fopen], false);
    else if (d.fshare !== undefined) openAttachment(N(id).files[+d.fshare], true);
    else if (d.fdel !== undefined) { pushUndo(); N(id).files.splice(+d.fdel, 1); afterChange(); renderPanel(); }
    else if (d.unlink !== undefined) { pushUndo(); M.links.splice(+d.unlink, 1); afterChange(); renderPanel(); }
    else if (d.gdel !== undefined) { pushUndo(); M.groups = M.groups.filter(g => g.id !== d.gdel); afterChange(); renderPanel(); }
  };
  $$('[data-glabel]', bodyEl).forEach(inp => { const g = M.groups.find(x => x.id === inp.dataset.glabel); bindLive(inp, v => { g.label = v; }, false); });
  on('#f-att', () => pickFiles(id));
  on('#f-link', () => { linkFrom = id; closePanel(); renderNodes(); toast('Agora toque na ideia que você quer conectar', 'Cancelar', () => { linkFrom = null; renderNodes(); }, 7000); });
  on('#f-group', () => { groupNodes([id]); renderPanel(); });
  on('#f-dump', () => openDump(id));
  on('#f-focus', () => { closePanel(); setFocus(focusId === id ? null : id); });
  on('#f-present', () => startPresent(id));
  on('#f-detach', () => { detach(id); renderPanel(); });
  on('#f-del', () => deleteNode(id));
}
function renderOutlineTab() {
  bodyEl.onclick = null;
  const rows = [];
  const walk = (id, d) => {
    const n = N(id);
    rows.push(`<div class="orow ${id === sel ? 'on' : ''} ${isRoot(id) ? 'root' : ''}" style="--d:${d}" data-id="${id}">
      <button class="ocaret" ${n.children.length ? '' : 'disabled'} data-tog="${id}" aria-label="${n.collapsed ? 'Expandir' : 'Recolher'}">${n.children.length ? (n.collapsed ? '▸' : '▾') : ''}</button>
      <span class="odot" style="background:${colorOf(id) || tok.ink}"></span>
      <span class="otxt">${n.done === true ? '☑ ' : n.done === false ? '☐ ' : ''}${esc((n.emoji ? n.emoji + ' ' : '') + (n.text || 'Nova ideia'))}</span>
      ${n.note ? `<span class="onote">${icon('note')}</span>` : ''}${n.collapsed && n.children.length ? `<small style="color:var(--muted)">+${countDesc(id)}</small>` : ''}</div>`);
    if (!n.collapsed) n.children.forEach(c => walk(c, d + 1));
  };
  walk(M.root, 0);
  const frees = freeRoots();
  if (frees.length) { rows.push('<div class="ohead">Ideias soltas</div>'); frees.forEach(f => walk(f, 0)); }
  bodyEl.innerHTML = `<p class="hint">O mesmo mapa em forma de lista. Toque numa linha para ir até ela.</p><div class="outline">${rows.join('')}</div>`;
  bodyEl.querySelector('.outline').onclick = e => {
    const tg = e.target.closest('[data-tog]'); if (tg) { toggleCollapse(tg.dataset.tog); renderPanel(); return; }
    const r = e.target.closest('[data-id]'); if (!r) return;
    const id = r.dataset.id; reveal(id); select(id); centerOn(id);
    if (!isWide()) closePanel(); else renderPanel();
  };
}
function stats() {
  const ns = Object.values(M.nodes), tasks = ns.filter(n => n.done !== null && n.done !== undefined);
  let maxD = 0; for (const n of ns) maxD = Math.max(maxD, depth(n.id));
  return { total: ns.length, tasks: tasks.length, done: tasks.filter(n => n.done).length, depth: maxD };
}
function renderMapaTab() {
  bodyEl.onclick = null;
  const s = stats(), st = M.style, t = todayStr();
  const dated = Object.values(M.nodes).filter(n => n.date).sort((a, b) => a.date.localeCompare(b.date));
  bodyEl.innerHTML = `
    <div class="stats">
      <div class="stat"><b>${s.total}</b><small>ideias</small></div>
      <div class="stat"><b>${s.depth}</b><small>níveis</small></div>
      <div class="stat"><b>${s.tasks ? `${s.done}/${s.tasks}` : '—'}</b><small>tarefas feitas</small></div>
    </div>
    ${dated.length ? `<div class="fld"><span>Datas</span><div class="dlist">${dated.slice(0, 12).map(n => `<button class="drow" data-go="${n.id}"><span class="dd ${n.done === true ? '' : n.date < t ? 'late' : n.date === t ? 'today' : ''}">${dueLabel(n.date)}</span><span>${n.done === true ? '☑ ' : ''}${esc(short(n.text, 40))}</span></button>`).join('')}</div></div>` : ''}
    <div class="fld"><span>Cores</span><div class="pals" id="m-pal">${Object.entries(PALETTES).map(([k, p]) => `<button class="pal ${st.palette === k ? 'on' : ''}" data-pal="${k}">${p.name}<i>${p.c.slice(0, 6).map(c => `<b style="background:${c}"></b>`).join('')}</i></button>`).join('')}</div></div>
    <div class="fld"><span>Linhas</span><div class="seg" id="m-edge">${[['curva', 'Curvas'], ['cotovelo', 'Em degrau'], ['reta', 'Retas']].map(([v, l]) => `<button data-v="${v}" class="${st.edge === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="fld"><span>Letra</span><div class="seg hand" id="m-font">${[['padrao', 'Padrão'], ['manuscrita', 'Manuscrita'], ['serifa', 'Serifada']].map(([v, l]) => `<button data-v="${v}" class="${st.font === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="fld"><span>Desenho do mapa</span><div class="seg" id="m-dir">${[['both', 'Dois lados'], ['right', 'Para a direita'], ['down', 'Para baixo']].map(([v, l]) => `<button data-v="${v}" class="${M.dir === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <label class="toggle"><input type="checkbox" id="m-auto" ${M.auto ? 'checked' : ''}><span>Organizar sozinho <small style="color:var(--muted)">Com isso desligado, você posiciona cada ideia onde quiser.</small></span></label>
    <div class="fld"><span>Minimapa</span><div class="seg" id="m-mini">${[['auto', 'Automático'], ['on', 'Sempre'], ['off', 'Nunca']].map(([v, l]) => `<button data-v="${v}" class="${(prefs.minimap || 'auto') === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="actions">
      <button class="btn" data-act="present">${icon('present')} Apresentar o mapa</button>
      <button class="btn" data-act="history">${icon('history')} Histórico de versões</button>
      <button class="btn" data-act="dump-root">${icon('dump')} Despejo rápido na ideia central</button>
    </div>
    <div class="fld"><span>Exportar</span><div class="actions">
      <button class="btn" data-act="png">${icon('image')} Imagem (PNG)</button>
      <button class="btn" data-act="pdf">${icon('file')} PDF com mapa e lista</button>
      <button class="btn" data-act="md">${icon('note')} Lista de tópicos (texto)</button>
      <button class="btn" data-act="opml">${icon('file')} OPML (para outros apps)</button>
      <button class="btn" data-act="json">${icon('download')} Arquivo do Ramifica</button>
    </div></div>
    <div class="fld"><span>Tema</span><div class="seg" id="m-theme">${[['system', 'Do sistema'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, l]) => `<button data-v="${v}" class="${prefs.theme === v ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <button class="btn ghost" data-act="tutorial">${icon('help')} Ver tutorial</button>`;
  const seg = (q, fn) => $(q, bodyEl).onclick = e => { const b = e.target.closest('[data-v]'); if (b) fn(b.dataset.v); };
  $('#m-pal').onclick = e => { const b = e.target.closest('[data-pal]'); if (!b) return; pushUndo(); M.style.palette = b.dataset.pal; afterChange(); renderPanel(); };
  seg('#m-edge', v => { pushUndo(); M.style.edge = v; afterChange(); renderPanel(); });
  seg('#m-font', v => { pushUndo(); M.style.font = v; applyStyle(); afterChange(); renderPanel(); });
  seg('#m-dir', v => { if (v === M.dir) return; pushUndo(); M.dir = v; M.auto = true; relayout(true); setTimeout(() => fit(true), 300); save(); renderPanel(); });
  seg('#m-mini', v => { prefs.minimap = v; savePrefs(); drawMinimap(); renderPanel(); });
  seg('#m-theme', v => { prefs.theme = v; savePrefs(); applyTheme(); renderPanel(); });
  $('#m-auto').onchange = e => { pushUndo(); M.auto = e.target.checked; if (M.auto) relayout(true); save(); };
  bodyEl.querySelectorAll('[data-act]').forEach(b => b.onclick = () => runAction(b.dataset.act));
  bodyEl.querySelectorAll('[data-go]').forEach(b => b.onclick = () => { const id = b.dataset.go; reveal(id); select(id); centerOn(id); if (!isWide()) closePanel(); });
}
function runAction(a) {
  if (a === 'dump-root') openDump(M.root);
  else if (a === 'png') exportPNG();
  else if (a === 'pdf') exportPDF();
  else if (a === 'md') exportOutline();
  else if (a === 'opml') deliver(new Blob([toOPML(M)], { type: 'text/x-opml' }), fileSafe(N(M.root).text) + '.opml');
  else if (a === 'json') exportMapFile(M);
  else if (a === 'organize') organize();
  else if (a === 'panel-map') openPanel('mapa');
  else if (a === 'theme') cycleTheme();
  else if (a === 'present') startPresent(null);
  else if (a === 'history') openHistory();
  else if (a === 'select') setSelMode(true);
  else if (a === 'paste') pasteInto(sel);
  else if (a === 'tutorial') { closePanel(); startCoach(); }
}
$('#btn-more').onclick = () => {
  menuModal('Opções do mapa', [
    { k: 'organize', icon: 'organize', label: 'Organizar mapa', sub: 'Alinha todas as ideias automaticamente' },
    { k: 'dump-root', icon: 'dump', label: 'Despejo rápido', sub: 'Escreva várias ideias de uma vez' },
    { k: 'present', icon: 'present', label: 'Apresentar', sub: 'Percorre o mapa ramo por ramo' },
    { k: 'select', icon: 'select', label: 'Selecionar várias ideias' },
    { k: 'paste', icon: 'paste', label: 'Colar', sub: sel ? 'Dentro da ideia selecionada' : 'Como ideia solta' },
    '-',
    { k: 'panel-map', icon: 'palette', label: 'Estilo e desenho', sub: 'Cores, linhas, letra, direção' },
    { k: 'history', icon: 'history', label: 'Histórico de versões', sub: 'Volte o mapa para como estava antes' },
    '-',
    { k: 'png', icon: 'image', label: 'Exportar imagem (PNG)' },
    { k: 'pdf', icon: 'file', label: 'Exportar PDF', sub: 'Mapa e lista de tópicos' },
    { k: 'md', icon: 'note', label: 'Exportar como lista de tópicos' },
    { k: 'opml', icon: 'file', label: 'Exportar OPML', sub: 'Abre no XMind, MindNode, Obsidian e outros' },
    { k: 'json', icon: 'download', label: 'Salvar arquivo deste mapa' },
    '-',
    { k: 'theme', icon: 'moon', label: 'Mudar tema', sub: themeLabel() },
    { k: 'tutorial', icon: 'help', label: 'Ver tutorial' },
  ], runAction);
};

/* ================= imagens e anexos ================= */
let pickTarget = null;
function pickImage(id) { if (!idb) { toast('Imagens precisam do app instalado (ou de um navegador com armazenamento completo).'); return; } pickTarget = id; $('#img-in').click(); }
function pickFiles(id) { if (!idb) { toast('Anexos precisam do app instalado (ou de um navegador com armazenamento completo).'); return; } pickTarget = id; $('#att-in').click(); }
$('#img-in').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f && pickTarget && M.nodes[pickTarget]) await addImage(pickTarget, f); });
$('#att-in').addEventListener('change', async e => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length && pickTarget && M.nodes[pickTarget]) await addFiles(pickTarget, fs); });
async function addImage(id, file) {
  try {
    const bmp = await createImageBitmap(file);
    const sc = Math.min(1, 1400 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * sc), h = Math.round(bmp.height * sc);
    const cv = document.createElement('canvas'); cv.width = w; cv.height = h; cv.getContext('2d').drawImage(bmp, 0, 0, w, h);
    let blob = await new Promise(r => cv.toBlob(r, 'image/webp', 0.86));
    if (!blob) blob = await new Promise(r => cv.toBlob(r, 'image/jpeg', 0.86));
    const bid = 'blob-' + uid();
    await Store.putBlob(bid, blob);
    pushUndo();
    N(id).img = { id: bid, w, h, dw: (N(id).img && N(id).img.dw) || 180 };
    afterChange(); renderPanel();
    toast('Imagem adicionada');
  } catch (err) { toast('Não consegui abrir essa imagem.'); }
}
async function addFiles(id, files) {
  const add = [];
  for (const f of files) {
    if (f.size > 25e6) { toast(`“${f.name}” passa de 25 MB e não foi anexado.`); continue; }
    const fid = 'blob-' + uid();
    try { await Store.putBlob(fid, f); add.push({ id: fid, name: f.name, type: f.type || 'application/octet-stream', size: f.size }); } catch (e) { storageFail(); }
  }
  if (!add.length) return;
  pushUndo(); N(id).files.push(...add); afterChange(); renderPanel();
  toast(add.length > 1 ? `${add.length} arquivos anexados` : 'Arquivo anexado');
}
async function openAttachment(f, share) {
  const b = await Store.getBlob(f.id);
  if (!b) { toast('Esse anexo não está mais neste aparelho.'); return; }
  if (share) { deliver(new Blob([b], { type: f.type }), f.name); return; }
  if (/^(image|text|audio|video)\//.test(f.type) || f.type === 'application/pdf') { const u = await blobUrl(f.id); openUrl(u); }
  else deliver(new Blob([b], { type: f.type }), f.name);
}
async function viewImage(id) {
  const n = N(id); if (!n.img) return;
  const u = await blobUrl(n.img.id); if (!u) return;
  modal({ title: short(n.text || 'Imagem', 40), wide: true, html: `<div class="viewer"><img src="${u}" alt="${esc(n.text)}"></div>` });
}

/* ================= despejo rápido e captura ================= */
function openDump(targetId, forNew = false) {
  const tgt = forNew ? null : N(targetId);
  modal({
    title: forNew ? 'Despejo rápido' : `Despejar ideias em “${short(tgt.text, 24)}”`,
    wide: true,
    html: `<p>${forNew ? 'A primeira linha vira a ideia central.' : 'Cada linha vira uma ideia.'} Comece a linha com espaços para criar uma subideia. Uma linha começando com &gt; vira nota da ideia de cima.</p>
      <textarea id="dump-text" spellcheck="true" placeholder="${forNew ? 'Mudança de casa\n  Orçamento\n    Frete\n    Móveis novos\n  Bairros\n  > ver perto do trabalho\n  Prazos' : 'Ideia\n  subideia\n  outra subideia\nOutra ideia'}"></textarea>
      <div class="dump-tools">
        <button class="btn" id="d-in">${icon('indent')} Recuar linha</button>
        <button class="btn" id="d-out">${icon('outdent')} Voltar recuo</button>
        <span class="hint" id="d-count" style="align-self:center"></span>
      </div>`,
    actions: [{ label: 'Cancelar' }, { label: forNew ? 'Criar mapa' : 'Adicionar ao mapa', kind: 'primary', run: () => {
      const text = $('#dump-text').value, items = parseOutline(text);
      if (!items.length) { toast('Escreva pelo menos uma ideia'); return false; }
      if (forNew) { const m = mapFromItems(items); db.maps[m.id] = m; saveMap(m); openMap(m.id); return; }
      pushUndo(); N(targetId).collapsed = false;
      addItems(M, targetId, items, born);
      M.auto = true;
      afterChange(); setTimeout(() => fit(true), 320);
      toast(`${countItems(items)} ideias adicionadas`);
    } }],
    onMount: () => {
      const ta = $('#dump-text'); ta.focus();
      const upd = () => { const c = countItems(parseOutline(ta.value)); $('#d-count').textContent = c ? `${c} ideia${c > 1 ? 's' : ''}` : ''; };
      ta.addEventListener('input', upd);
      const shift = dir => {
        const v = ta.value, st = ta.selectionStart, en = ta.selectionEnd;
        const ls = v.lastIndexOf('\n', st - 1) + 1;
        let le = v.indexOf('\n', en); if (le < 0) le = v.length;
        const block = v.slice(ls, le).split('\n').map(l => dir > 0 ? '  ' + l : l.replace(/^( {1,2}|\t)/, '')).join('\n');
        ta.value = v.slice(0, ls) + block + v.slice(le);
        const delta = block.length - (le - ls);
        ta.setSelectionRange(Math.max(ls, st + (dir > 0 ? 2 : Math.min(0, delta))), en + delta);
        ta.focus(); upd();
      };
      ta.addEventListener('keydown', e => { if (e.key === 'Tab') { e.preventDefault(); shift(e.shiftKey ? -1 : 1); } });
      $('#d-in').onclick = () => shift(1); $('#d-out').onclick = () => shift(-1);
    },
  });
}
function recentMaps() { return Object.values(db.maps).sort((x, y) => (y.updated || 0) - (x.updated || 0)); }
function ensureInbox(m) {
  const r = m.nodes[m.root];
  const found = r.children.find(c => m.nodes[c].inbox);
  if (found) return found;
  const n = newNode('📥 Entrada', r.id); n.inbox = true; n.x = r.x; n.y = r.y;
  m.nodes[n.id] = n; r.children.unshift(n.id);
  return n.id;
}
function openCapture(text, single) {
  const maps = recentMaps();
  const dest = prefs.capDest && db.maps[prefs.capDest] ? prefs.capDest : (editorOpen && M ? M.id : maps[0]?.id || '__new');
  let mode = single ? 'one' : 'lines';
  modal({
    title: single ? 'Guardar no Ramifica' : 'Captura rápida',
    wide: true,
    html: `<textarea id="cap-text" rows="7" placeholder="Escreva o que veio à cabeça. Uma ideia por linha, se quiser.">${esc(text)}</textarea>
      <div class="seg" id="cap-mode"><button data-v="one" class="${mode === 'one' ? 'on' : ''}">Tudo numa ideia</button><button data-v="lines" class="${mode === 'lines' ? 'on' : ''}">Uma ideia por linha</button></div>
      <label class="fld"><span>Guardar em</span><select id="cap-map">${maps.map(m => `<option value="${m.id}" ${m.id === dest ? 'selected' : ''}>${esc(short(m.nodes[m.root].text, 44))}</option>`).join('')}<option value="__new" ${dest === '__new' ? 'selected' : ''}>＋ Novo mapa</option></select></label>
      <label class="toggle" id="cap-inbox-row"><input type="checkbox" id="cap-inbox" ${prefs.capInbox !== false ? 'checked' : ''}><span>Guardar no ramo 📥 Entrada <small style="color:var(--muted)">para organizar com calma depois</small></span></label>`,
    actions: [{ label: 'Cancelar' }, { label: 'Guardar', kind: 'primary', run: () => {
      const txt = $('#cap-text').value, to = $('#cap-map').value, inbox = $('#cap-inbox').checked;
      const items = mode === 'one' ? singleItem(txt) : parseOutline(txt);
      if (!items.length) { toast('Escreva alguma coisa para guardar'); return false; }
      prefs.capDest = to; prefs.capInbox = inbox; savePrefs();
      let m;
      if (to === '__new') { m = mapFromItems(items); db.maps[m.id] = m; }
      else {
        m = normalizeMap(db.maps[to]);
        const open = editorOpen && M === m;
        if (open) { if (edit) commitEdit(); pushUndo(); }
        const target = inbox ? ensureInbox(m) : m.root;
        m.nodes[target].collapsed = false;
        addItems(m, target, items, open ? born : null);
        m.updated = Date.now();
        if (!open && m.auto) { const pos = computeLayout(m); for (const id in pos) Object.assign(m.nodes[id], pos[id]); }
        if (open) afterChange();
      }
      saveMap(m);
      if (!(editorOpen && M === m)) renderHome();
      toast(`Guardado em “${short(m.nodes[m.root].text, 24)}”`, editorOpen && M === m ? null : 'Abrir', () => openMap(m.id), 5000);
    } }],
    onMount: () => {
      $('#cap-mode').onclick = e => { const b = e.target.closest('[data-v]'); if (!b) return; mode = b.dataset.v; $$('#cap-mode button').forEach(x => x.classList.toggle('on', x === b)); };
      const sync = () => { $('#cap-inbox-row').hidden = $('#cap-map').value === '__new'; };
      $('#cap-map').onchange = sync; sync();
      const ta = $('#cap-text'); ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length);
    },
  });
}

/* ================= exportar ================= */
async function deliver(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  try {
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: name }); return; }
  } catch (e) { if (e.name === 'AbortError') return; }
  if (!inFrame) {
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
    document.body.append(a); a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 3000);
    toast('Arquivo salvo em Downloads'); return;
  }
  if (blob.type.startsWith('image/')) {
    const url = URL.createObjectURL(blob);
    modal({ title: 'Imagem do mapa', html: `<p>Toque e segure a imagem para salvar ou compartilhar.</p><img class="preview-img" src="${url}" alt="Imagem do mapa mental">`, actions: [{ label: 'Fechar', kind: 'primary' }] });
  } else if (/^(text\/|application\/json)/.test(blob.type) || /opml/.test(blob.type)) copyModal(name, await blob.text());
  else toast('Para salvar arquivos, use o Ramifica instalado no celular.');
}
function copyModal(title, text) {
  modal({ title, html: `<p>Copie o conteúdo abaixo e cole onde quiser.</p><textarea id="copy-text" rows="12" readonly>${esc(text)}</textarea>`,
    actions: [{ label: 'Fechar' }, { label: 'Copiar', kind: 'primary', run: () => {
      const ta = $('#copy-text');
      Promise.resolve(navigator.clipboard && navigator.clipboard.writeText(text)).then(() => toast('Copiado')).catch(() => { ta.focus(); ta.select(); toast('Selecionei o texto. Use Copiar do teclado.'); });
      return false;
    } }] });
}
const fileSafe = s => (s || 'mapa').replace(/[\\/:*?"<>|\n]+/g, ' ').trim().slice(0, 50) || 'mapa';
async function exportOutline() {
  const text = toOutline(M);
  try { if (navigator.share && !inFrame) { await navigator.share({ title: N(M.root).text, text }); return; } } catch (e) { if (e.name === 'AbortError') return; }
  copyModal('Lista de tópicos', text);
}
function blobToDataURL(b) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(b); }); }
function dataURLToBlob(u) { const [h, d] = u.split(','); const type = (h.match(/data:([^;]+)/) || [])[1] || 'application/octet-stream'; const bin = atob(d); const a = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return new Blob([a], { type }); }
async function blobsFor(maps) {
  const ids = new Set();
  for (const m of maps) for (const n of Object.values(m.nodes)) { if (n.img) ids.add(n.img.id); for (const f of n.files || []) ids.add(f.id); }
  const out = {};
  for (const id of ids) { const b = await Store.getBlob(id); if (b) out[id] = await blobToDataURL(b); }
  return out;
}
async function exportMapFile(m) {
  const blob = new Blob([JSON.stringify({ app: 'ramifica', version: 2, exported: Date.now(), maps: [m], blobs: await blobsFor([m]) })], { type: 'application/json' });
  deliver(blob, fileSafe(m.nodes[m.root].text) + '.ramifica.json');
}
async function exportBackup() {
  const maps = Object.values(db.maps);
  const blob = new Blob([JSON.stringify({ app: 'ramifica', version: 2, exported: Date.now(), maps, blobs: await blobsFor(maps) })], { type: 'application/json' });
  const d = new Date(), name = `ramifica-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  prefs.lastBackup = Date.now(); savePrefs(); renderHome();
  deliver(blob, name);
}
function toOPML(m) {
  const x = s => esc(s).replace(/\n/g, '&#10;');
  const o = id => { const n = m.nodes[id]; const a = `text="${x((n.emoji ? n.emoji + ' ' : '') + (n.text || ''))}"${n.note ? ` _note="${x(n.note)}"` : ''}`; return n.children.length ? `<outline ${a}>${n.children.map(o).join('')}</outline>` : `<outline ${a}/>`; };
  return `<?xml version="1.0" encoding="UTF-8"?>\n<opml version="2.0"><head><title>${x(m.nodes[m.root].text)}</title></head><body>${o(m.root)}${freeRoots(m).map(o).join('')}</body></opml>`;
}
async function renderMapCanvas(maxScale = 2.5) {
  if (edit) commitEdit();
  try { await document.fonts.ready; } catch (e) {}
  renderNodes({ all: true }); renderEdges();
  await Promise.all([...nodesEl.querySelectorAll('img')].map(im => im.decode ? im.decode().catch(() => {}) : null));
  const ids = visible, bb0 = bbox(ids), gr = groupRects();
  let x0 = bb0.x, y0 = bb0.y, x1 = bb0.x + bb0.w, y1 = bb0.y + bb0.h;
  for (const r of gr) { x0 = Math.min(x0, r.x); y0 = Math.min(y0, r.y); x1 = Math.max(x1, r.x + r.w); y1 = Math.max(y1, r.y + r.h); }
  for (const id of ids) if (N(id).date) y0 = Math.min(y0, N(id).y - sizeOf(id).h / 2 - 16);
  const pad = 48, W = x1 - x0 + pad * 2, H = y1 - y0 + pad * 2;
  const scale = Math.min(maxScale, 7000 / Math.max(W, H));
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(W * scale); cv.height = Math.ceil(H * scale);
  const ctx = cv.getContext('2d');
  ctx.scale(scale, scale); ctx.fillStyle = tok.bg; ctx.fillRect(0, 0, W, H);
  ctx.translate(pad - x0, pad - y0);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  for (const r of gr) {
    ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 22);
    ctx.globalAlpha = .09; ctx.fillStyle = r.color; ctx.fill();
    ctx.globalAlpha = .5; ctx.strokeStyle = r.color; ctx.lineWidth = 1.5; ctx.stroke(); ctx.globalAlpha = 1;
    if (r.g.label) { ctx.font = '700 13px Figtree, sans-serif'; ctx.fillStyle = r.color; ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left'; ctx.fillText(r.g.label, r.x + 16, r.y + 22); }
  }
  for (const id of ids) {
    const n = N(id); if (!n.parent || !visSet.has(n.parent)) continue;
    ctx.strokeStyle = colorOf(id) || tok.ink; ctx.lineWidth = edgeWidth(depth(id));
    ctx.stroke(new Path2D(edgeD(n.parent, id)));
  }
  ctx.save(); ctx.setLineDash([7, 7]); ctx.strokeStyle = tok.muted; ctx.lineWidth = 2;
  for (const L of M.links) if (visSet.has(L.a) && visSet.has(L.b)) ctx.stroke(new Path2D(linkD(L.a, L.b)));
  ctx.restore();
  for (const id of ids) {
    const el = elMap.get(id); if (!el) continue;
    const n = N(id), s = sizeOf(id), cs = getComputedStyle(el);
    const x = n.x - s.w / 2, y = n.y - s.h / 2;
    const rad = Math.min(parseFloat(cs.borderTopLeftRadius) || 0, s.h / 2);
    ctx.beginPath(); ctx.roundRect(x, y, s.w, s.h, rad);
    if (cs.backgroundColor && cs.backgroundColor !== 'rgba(0, 0, 0, 0)') { ctx.fillStyle = cs.backgroundColor; ctx.fill(); }
    const bt = parseFloat(cs.borderTopWidth), bbw = parseFloat(cs.borderBottomWidth);
    if (bt > 0) { ctx.strokeStyle = cs.borderTopColor; ctx.lineWidth = bt; ctx.beginPath(); ctx.roundRect(x + bt / 2, y + bt / 2, s.w - bt, s.h - bt, Math.max(0, rad - bt / 2)); ctx.stroke(); }
    else if (bbw > 0) { ctx.fillStyle = cs.borderBottomColor; ctx.fillRect(x, y + s.h - bbw, s.w, bbw); }
    const er = el.getBoundingClientRect(), k = er.width / el.offsetWidth || 1;
    const parts = el.querySelectorAll('.txt,.emo,.chk,.nimg');
    for (const part of parts) {
      const pr = part.getBoundingClientRect();
      const px = x + (pr.left - er.left) / k, py = y + (pr.top - er.top) / k, pw = pr.width / k, ph = pr.height / k;
      if (part.classList.contains('nimg')) { ctx.save(); ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 8); ctx.clip(); try { ctx.drawImage(part, px, py, pw, ph); } catch (e) {} ctx.restore(); continue; }
      if (part.classList.contains('chk')) {
        const c = getComputedStyle(part);
        ctx.beginPath(); ctx.roundRect(px + 1, py + 1, pw - 2, ph - 2, 5);
        if (n.done) { ctx.fillStyle = c.borderTopColor; ctx.fill(); }
        ctx.strokeStyle = c.borderTopColor; ctx.lineWidth = 2; ctx.stroke(); continue;
      }
      const pcs = getComputedStyle(part);
      ctx.font = `${pcs.fontWeight} ${pcs.fontSize} ${pcs.fontFamily}`;
      ctx.fillStyle = pcs.color; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
      const lh = parseFloat(pcs.lineHeight) || parseFloat(pcs.fontSize) * 1.3;
      const lines = wrapLines(ctx, part.textContent || (part.classList.contains('txt') ? 'Nova ideia' : ''), pw + 1);
      let ty = py + (ph - lines.length * lh) / 2 + lh / 2;
      if (n.done === true && part.classList.contains('txt')) ctx.globalAlpha = .6;
      for (const ln of lines) { ctx.fillText(ln, px + pw / 2, ty); ty += lh; }
      ctx.globalAlpha = 1;
    }
    if (n.date) {
      const c = el.querySelector('.due'), ccs = getComputedStyle(c), cr = c.getBoundingClientRect();
      const cx = x + (cr.left - er.left) / k, cy = y + (cr.top - er.top) / k, cw = cr.width / k, ch = cr.height / k;
      ctx.beginPath(); ctx.roundRect(cx, cy, cw, ch, ch / 2); ctx.fillStyle = ccs.backgroundColor; ctx.fill(); ctx.strokeStyle = ccs.borderTopColor; ctx.lineWidth = 1.5; ctx.stroke();
      ctx.font = `700 11px ${ccs.fontFamily}`; ctx.fillStyle = ccs.color; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.textContent, cx + cw / 2, cy + ch / 2 + .5);
    }
  }
  renderNodes(); renderEdges();
  return { cv, w: W, h: H };
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of String(text).split('\n')) {
    let line = '';
    for (const w of para.split(/(\s+)/)) {
      const t = line + w;
      if (ctx.measureText(t).width > maxW && line.trim()) { out.push(line.trim()); line = w.trimStart(); }
      else line = t;
    }
    out.push(line.trim());
  }
  return out;
}
async function exportPNG() {
  toast('Gerando imagem…');
  const { cv } = await renderMapCanvas();
  cv.toBlob(b => b ? deliver(b, fileSafe(N(M.root).text) + '.png') : toast('Não consegui gerar a imagem. Tente com menos ideias visíveis.'), 'image/png');
}
function outlinePages() {
  const PW = 1190, PH = 1684, MG = 100, pages = [];
  let cv, ctx, y;
  const newPage = () => { cv = document.createElement('canvas'); cv.width = PW; cv.height = PH; ctx = cv.getContext('2d'); ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, PW, PH); ctx.textBaseline = 'top'; y = MG; pages.push(cv); };
  newPage();
  const write = (txt, indent, font, color, lh, dot) => {
    ctx.font = font;
    const lines = wrapLines(ctx, txt, PW - MG * 2 - indent);
    lines.forEach((l, i) => {
      if (y + lh > PH - MG) newPage();
      if (i === 0 && dot) { ctx.fillStyle = dot; ctx.beginPath(); ctx.arc(MG + indent - 16, y + lh * 0.45, 6, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = font; ctx.fillStyle = color; ctx.fillText(l, MG + indent, y); y += lh;
    });
  };
  const r = N(M.root);
  write((r.emoji ? r.emoji + ' ' : '') + (r.text || 'Mapa'), 0, '800 46px "Bricolage Grotesque", Figtree, sans-serif', '#182033', 58);
  if (r.note) write(r.note, 0, 'italic 400 24px Figtree, sans-serif', '#5E6A80', 34);
  y += 24;
  const walk = (id, d) => {
    const n = N(id), ind = 30 + (d - 1) * 40;
    const label = (n.done === true ? '☑ ' : n.done === false ? '☐ ' : '') + (n.emoji ? n.emoji + ' ' : '') + (n.text || '…') + (n.date ? `  · ${dueLabel(n.date)}` : '');
    if (d === 1) y += 12;
    write(label, ind, d === 1 ? '700 30px Figtree, sans-serif' : '400 26px Figtree, sans-serif', '#182033', d === 1 ? 42 : 38, colorOf(id) || '#182033');
    if (n.note) write(n.note, ind, 'italic 400 22px Figtree, sans-serif', '#5E6A80', 32);
    for (const l of n.links) write(l.url, ind, '400 20px Figtree, sans-serif', '#2F6FB2', 30);
    n.children.forEach(c => walk(c, d + 1));
  };
  r.children.forEach(c => walk(c, 1));
  const frees = freeRoots();
  if (frees.length) { y += 20; write('Ideias soltas', 0, '700 30px Figtree, sans-serif', '#5E6A80', 44); frees.forEach(f => walk(f, 1)); }
  return pages;
}
function jpegBytes(cv) { const d = atob(cv.toDataURL('image/jpeg', 0.9).split(',')[1]); const a = new Uint8Array(d.length); for (let i = 0; i < d.length; i++) a[i] = d.charCodeAt(i); return a; }
function buildPdf(pages) {
  const enc = new TextEncoder(), parts = [], offs = [];
  let off = 0;
  const push = x => { const b = typeof x === 'string' ? enc.encode(x) : x; parts.push(b); off += b.length; };
  const n = pages.length, total = 2 + n * 3;
  push('%PDF-1.4\n%ÿÿ\n');
  const obj = (i, fn) => { offs[i] = off; push(`${i} 0 obj\n`); fn(); push('\nendobj\n'); };
  obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
  obj(2, () => push(`<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 3} 0 R`).join(' ')}] /Count ${n} >>`));
  pages.forEach((p, i) => {
    const po = 3 + i * 3, io = po + 1, co = po + 2;
    obj(po, () => push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.pw.toFixed(2)} ${p.ph.toFixed(2)}] /Resources << /XObject << /Im${i} ${io} 0 R >> >> /Contents ${co} 0 R >>`));
    obj(io, () => { push(`<< /Type /XObject /Subtype /Image /Width ${p.w} /Height ${p.h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${p.jpg.length} >>\nstream\n`); push(p.jpg); push('\nendstream'); });
    const c = `q ${p.pw.toFixed(2)} 0 0 ${p.ph.toFixed(2)} 0 0 cm /Im${i} Do Q`;
    obj(co, () => push(`<< /Length ${c.length} >>\nstream\n${c}\nendstream`));
  });
  const xref = off;
  let x = `xref\n0 ${total + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= total; i++) x += String(offs[i]).padStart(10, '0') + ' 00000 n \n';
  push(x + `trailer\n<< /Size ${total + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`);
  return new Blob(parts, { type: 'application/pdf' });
}
async function exportPDF() {
  toast('Gerando PDF…');
  try { await document.fonts.ready; } catch (e) {}
  const { cv, w, h } = await renderMapCanvas(2);
  const sc = Math.min(1, 1600 / Math.max(w, h)) * 0.75;
  const pages = [{ jpg: jpegBytes(cv), w: cv.width, h: cv.height, pw: w * sc, ph: h * sc }];
  for (const p of outlinePages()) pages.push({ jpg: jpegBytes(p), w: p.width, h: p.height, pw: 595.28, ph: 841.89 });
  deliver(buildPdf(pages), fileSafe(N(M.root).text) + '.pdf');
}

/* ================= importar ================= */
async function importFile(f) {
  const name = f.name.toLowerCase();
  try {
    if (name.endsWith('.xmind')) return addImported(await parseXMind(await f.arrayBuffer()), 'XMind');
    if (name.endsWith('.mm')) return addImported(parseFreeMind(await f.text()), 'FreeMind');
    if (name.endsWith('.opml') || name.endsWith('.xml')) return addImported(parseOPML(await f.text()), 'OPML');
    return importText(await f.text(), f.name);
  } catch (e) { toast('Não consegui ler esse arquivo. ' + (e && e.message ? e.message : '')); }
}
function addImported(roots, label) {
  let c = 0;
  for (const r of roots) { if (!r || !r.text && !(r.children || []).length) continue; const m = mapFromItems([r]); db.maps[m.id] = m; dirty.add(m.id); c++; }
  persist(); renderHome();
  toast(c ? `${c} mapa${c > 1 ? 's' : ''} importado${c > 1 ? 's' : ''} do ${label}` : 'Não encontrei ideias nesse arquivo.');
}
function xmlDoc(text) { const d = new DOMParser().parseFromString(text, 'application/xml'); if (d.querySelector('parsererror')) throw new Error('O arquivo está corrompido.'); return d; }
const kidsByTag = (el, tag) => [...el.children].filter(c => c.localName === tag);
function parseOPML(text) {
  const d = xmlDoc(text), body = d.querySelector('body'); if (!body) return [];
  const conv = el => ({ text: el.getAttribute('text') || el.getAttribute('title') || '', note: el.getAttribute('_note') || '', children: kidsByTag(el, 'outline').map(conv) });
  const tops = kidsByTag(body, 'outline').map(conv);
  if (tops.length === 1) return tops;
  return [{ text: d.querySelector('head > title')?.textContent || 'Mapa importado', note: '', children: tops }];
}
function parseFreeMind(text) {
  const d = xmlDoc(text), root = d.querySelector('map > node'); if (!root) return [];
  const conv = el => {
    let t = el.getAttribute('TEXT') || '', note = '';
    for (const rc of kidsByTag(el, 'richcontent')) { const v = rc.textContent.replace(/\s+\n/g, '\n').trim(); if (rc.getAttribute('TYPE') === 'NOTE') note = v; else if (!t) t = v; }
    return { text: t, note, children: kidsByTag(el, 'node').map(conv) };
  };
  return [conv(root)];
}
async function parseXMind(buf) {
  const files = await unzip(buf);
  if (files['content.json']) {
    const sheets = JSON.parse(files['content.json']);
    const conv = t => ({ text: t.title || '', note: (t.notes && t.notes.plain && t.notes.plain.content) || '', children: [...((t.children && t.children.attached) || []), ...((t.children && t.children.detached) || [])].map(conv) });
    return (Array.isArray(sheets) ? sheets : [sheets]).map(s => s.rootTopic && conv(s.rootTopic));
  }
  if (files['content.xml']) {
    const d = xmlDoc(files['content.xml']);
    const conv = tp => {
      const title = kidsByTag(tp, 'title')[0]?.textContent || '';
      const note = tp.querySelector(':scope > notes > plain')?.textContent || '';
      const ch = kidsByTag(tp, 'children')[0];
      const kids = ch ? kidsByTag(ch, 'topics').flatMap(ts => kidsByTag(ts, 'topic')) : [];
      return { text: title, note, children: kids.map(conv) };
    };
    return [...d.getElementsByTagName('sheet')].map(s => { const tp = kidsByTag(s, 'topic')[0]; return tp && conv(tp); });
  }
  throw new Error('Não encontrei o conteúdo do mapa dentro do arquivo XMind.');
}
async function unzip(buf) {
  const dv = new DataView(buf), u8 = new Uint8Array(buf); let e = -1;
  for (let i = buf.byteLength - 22; i >= Math.max(0, buf.byteLength - 66000); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('O arquivo compactado está corrompido.');
  const count = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true);
  const out = {}, dec = new TextDecoder();
  for (let k = 0; k < count; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) break;
    const method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nlen = dv.getUint16(p + 28, true), xlen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true), loff = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
    p += 46 + nlen + xlen + clen;
    if (!/^content\.(json|xml)$/.test(name)) continue;
    const ds = loff + 30 + dv.getUint16(loff + 26, true) + dv.getUint16(loff + 28, true);
    const data = u8.subarray(ds, ds + csize);
    out[name] = method === 0 ? dec.decode(data) : await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).text();
  }
  return out;
}
async function importText(text, fname) {
  let data = null;
  try { data = JSON.parse(text); } catch (e) {}
  if (data && Array.isArray(data.maps)) {
    if (data.blobs && idb) for (const [id, u] of Object.entries(data.blobs)) { try { await Store.putBlob(id, dataURLToBlob(u)); } catch (e) {} }
    let n = 0;
    for (const m of data.maps) {
      if (!m || !m.nodes || !m.root || !m.nodes[m.root]) continue;
      normalizeMap(m);
      const ex = db.maps[m.id];
      if (!ex || (m.updated || 0) >= (ex.updated || 0)) { db.maps[m.id] = m; dirty.add(m.id); n++; }
    }
    await persist(); renderHome();
    toast(n ? `${n} mapa${n > 1 ? 's' : ''} importado${n > 1 ? 's' : ''}` : 'Nada novo para importar: seus mapas já estão atualizados');
    return;
  }
  if (data) { toast('Este arquivo não é um backup do Ramifica.'); return; }
  const items = parseOutline(text);
  if (!items.length) { toast('O arquivo está vazio.'); return; }
  const m = mapFromItems(items); db.maps[m.id] = m; await saveMap(m); renderHome();
  toast(`Mapa “${short(m.nodes[m.root].text)}” criado a partir de ${fname || 'texto'}`);
}
$('#file-in').addEventListener('change', async e => { const f = e.target.files[0]; e.target.value = ''; if (f) importFile(f); });

/* ================= modal e aviso ================= */
function modal({ title, html, actions = [], onMount, wide }) {
  const m = $('#modal');
  m.innerHTML = `<div class="dlg ${wide ? 'wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="dlg-t">
    <header><h2 id="dlg-t">${esc(title)}</h2><button class="icon-btn" data-close aria-label="Fechar">${icon('close')}</button></header>
    <div class="dlg-body">${html}</div>
    ${actions.length ? `<footer>${actions.map((a, i) => `<button class="btn ${a.kind || ''}" data-act="${i}">${a.label}</button>`).join('')}</footer>` : ''}</div>`;
  m.hidden = false;
  m.onclick = e => {
    if (e.target === m || e.target.closest('[data-close]')) { closeModal(); return; }
    const b = e.target.closest('footer [data-act]');
    if (b) { const a = actions[+b.dataset.act]; const r = a.run ? a.run() : undefined; if (r !== false) closeModal(); }
  };
  if (onMount) onMount(m);
}
function closeModal() { const m = $('#modal'); m.hidden = true; m.innerHTML = ''; }
function menuModal(title, items, onPick) {
  modal({ title, html: `<div class="menu">${items.map(it => it === '-' ? '<hr>' : `<button data-k="${it.k}" class="${it.danger ? 'danger' : ''}">${icon(it.icon)}<span>${esc(it.label)}${it.sub ? `<small>${esc(it.sub)}</small>` : ''}</span></button>`).join('')}</div>`,
    onMount: m => m.querySelector('.menu').addEventListener('click', e => { const b = e.target.closest('[data-k]'); if (b) { closeModal(); onPick(b.dataset.k); } }) });
}
let toastT;
function toast(msg, actLabel, act, ms = 3600) {
  const t = $('#toast');
  t.innerHTML = `<span>${esc(msg)}</span>${actLabel ? `<button>${esc(actLabel)}</button>` : ''}`;
  if (actLabel) t.querySelector('button').onclick = () => { hideToast(); act(); };
  t.classList.add('show');
  clearTimeout(toastT); toastT = setTimeout(hideToast, ms);
}
function hideToast() { $('#toast').classList.remove('show'); }

/* ================= tutorial interativo ================= */
const COACH = [
  { text: 'Esta é a ideia central do seu mapa. Toque nela para selecionar.', target: () => M && elMap.get(M.root), wait: 'select' },
  { text: 'Agora toque em Subideia para abrir um ramo.', target: () => $('#nb-child'), wait: 'add' },
  { text: 'Escreva uma ideia e toque em ↵ no teclado para confirmar.', target: () => edit && elMap.get(edit.id), wait: 'commit' },
  { text: 'Arraste o fundo para passear pelo mapa. Com dois dedos, faça pinça para dar zoom.', wait: 'pan', btn: 'Entendi' },
  { text: 'Segure o dedo numa ideia (ou toque em Detalhes) para pôr notas, imagem, data, links e anexos.', wait: 'details', btn: 'Pular' },
  { text: 'Toque duas vezes no fundo para criar uma ideia solta, fora dos ramos. O botão + faz o mesmo.', target: () => $('#btn-free'), btn: 'Próximo' },
  { text: 'Mente cheia? Em ⋯ você encontra o Despejo rápido: uma ideia por linha e o mapa se monta sozinho.', target: () => $('#btn-more'), btn: 'Próximo' },
  { text: 'Pronto! Para ver este guia de novo, toque em ⋯ e depois em Ver tutorial.', btn: 'Começar a usar' },
];
let coach = null;
function startCoach() { if (!editorOpen) return; coach = { i: 0 }; showCoach(); }
function showCoach() {
  if (!coach) return;
  const s = COACH[coach.i], c = $('#coach');
  c.hidden = false;
  c.innerHTML = `<p>${esc(s.text)}</p><div class="crow"><small>${coach.i + 1} de ${COACH.length}</small><button class="skip" id="coach-skip">${coach.i === COACH.length - 1 ? 'Fechar' : 'Pular tutorial'}</button>${s.btn ? `<button class="next" id="coach-next">${esc(s.btn)}</button>` : ''}</div>`;
  $('#coach-skip').onclick = endCoach;
  const nx = $('#coach-next'); if (nx) nx.onclick = () => coachAdvance();
  positionRing();
}
function positionRing() {
  const ring = $('#coach-ring');
  if (!coach) { ring.hidden = true; return; }
  const s = COACH[coach.i], t = s.target && s.target();
  if (!t || !t.isConnected) { ring.hidden = true; return; }
  const r = t.getBoundingClientRect();
  if (!r.width) { ring.hidden = true; return; }
  ring.hidden = false;
  Object.assign(ring.style, { left: r.left - 8 + 'px', top: r.top - 8 + 'px', width: r.width + 16 + 'px', height: r.height + 16 + 'px' });
}
function coachAdvance() { if (!coach) return; coach.i++; if (coach.i >= COACH.length) endCoach(); else setTimeout(showCoach, 200); }
function emit(name) { if (coach && COACH[coach.i].wait === name) coachAdvance(); else if (coach) setTimeout(positionRing, 50); }
function endCoach() { coach = null; $('#coach').hidden = true; $('#coach-ring').hidden = true; prefs.coachDone = true; savePrefs(); }
addEventListener('resize', () => coach && positionRing());

/* ================= tema ================= */
let themeSetByMe = false;
function themeLabel() { return { system: 'Agora: do sistema', light: 'Agora: claro', dark: 'Agora: escuro' }[prefs.theme]; }
function applyTheme() {
  const r = document.documentElement;
  if (prefs.theme === 'system') { if (themeSetByMe) r.removeAttribute('data-theme'); themeSetByMe = false; }
  else { r.dataset.theme = prefs.theme; themeSetByMe = true; }
  readTokens();
  const meta = document.querySelector('meta[name=theme-color]'); if (meta) meta.content = tok.surface;
  if (M && editorOpen) { renderNodes(); renderEdges(); if (panelVisible()) renderPanel(); }
  renderHome();
}
function cycleTheme() {
  prefs.theme = { system: 'light', light: 'dark', dark: 'system' }[prefs.theme];
  savePrefs(); applyTheme(); toast('Tema: ' + { system: 'do sistema', light: 'claro', dark: 'escuro' }[prefs.theme]);
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
new MutationObserver(() => { const before = tok.bg; readTokens(); if (tok.bg !== before) { if (M && editorOpen) { renderNodes(); renderEdges(); } renderHome(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

/* ================= tela inicial ================= */
const TEMPLATES = [
  { name: 'Em branco', desc: 'Só a ideia central. Comece do zero.', text: 'Ideia central' },
  { name: 'Brainstorm', desc: 'Solte tudo e separe depois.', text: `Tema do brainstorm\n  Ideias rápidas\n  Ideias ousadas\n  Perguntas em aberto\n  Referências e inspirações` },
  { name: 'Projeto', desc: 'Objetivo, etapas, recursos e riscos.', text: `Meu projeto\n  🎯 Objetivo\n    Como vou saber que deu certo?\n  🗺️ Etapas\n    [ ] Etapa 1\n    [ ] Etapa 2\n    [ ] Etapa 3\n  🧰 Recursos\n    Pessoas\n    Ferramentas\n    Dinheiro\n  ⚠️ Riscos\n  📅 Prazos` },
  { name: 'Estudo', desc: 'Conceitos, exemplos e dúvidas de um assunto.', text: `Assunto\n  Conceitos principais\n  Exemplos\n  Regras e fórmulas\n  ❓ Dúvidas\n  [ ] Revisar` },
  { name: 'Decisão', desc: 'Opções lado a lado, com prós e contras.', text: `Decisão a tomar\n  Opção A\n    Prós\n    Contras\n  Opção B\n    Prós\n    Contras\n  Critérios que importam` },
  { name: 'Semana', desc: 'Dias, prioridades e pendências.', text: `Minha semana\n  ⭐ Prioridades\n  Segunda\n  Terça\n  Quarta\n  Quinta\n  Sexta\n  Fim de semana` },
  { name: 'Roda da vida', desc: 'Um olhar calmo para cada área da vida.', text: `Eu\n  Saúde\n  Trabalho\n  Finanças\n  Relacionamentos\n  Lazer\n  Aprendizado\n  Espiritualidade` },
];
function ago(t) {
  const s = (Date.now() - t) / 1000;
  if (s < 60) return 'agora mesmo';
  if (s < 3600) return `há ${Math.floor(s / 60)} min`;
  if (s < 86400) return `há ${Math.floor(s / 3600)} h`;
  if (s < 172800) return 'ontem';
  if (s < 604800) return `há ${Math.floor(s / 86400)} dias`;
  return new Date(t).toLocaleDateString('pt-BR', { day: 'numeric', month: 'short' });
}
function thumbSvg(m) {
  const ids = []; const walk = id => { ids.push(id); const n = m.nodes[id]; if (!n.collapsed) n.children.forEach(walk); };
  walk(m.root); freeRoots(m).forEach(walk);
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const id of ids) { const n = m.nodes[id], s = est(n, m); a = Math.min(a, n.x - s.w / 2); b = Math.min(b, n.y - s.h / 2); c = Math.max(c, n.x + s.w / 2); d = Math.max(d, n.y + s.h / 2); }
  const pad = 40; a -= pad; b -= pad; c += pad; d += pad;
  let w = c - a, h = d - b; const ar = 1.6;
  if (w / h > ar) { const nh = w / ar; b -= (nh - h) / 2; h = nh; } else { const nw = h * ar; a -= (nw - w) / 2; w = nw; }
  let s = '';
  for (const id of ids) { const n = m.nodes[id]; if (!n.parent) continue; const p = m.nodes[n.parent]; s += `<line x1="${p.x}" y1="${p.y}" x2="${n.x}" y2="${n.y}" stroke="${colorOf(id, m) || tok.ink}" stroke-width="${Math.max(3, w / 160)}" stroke-linecap="round"/>`; }
  for (const id of ids) { const n = m.nodes[id], e = est(n, m), col = colorOf(id, m) || tok.ink, root = id === m.root; s += `<rect x="${n.x - e.w / 2}" y="${n.y - e.h / 2}" width="${e.w}" height="${e.h}" rx="${Math.min(e.h / 2, 18)}" fill="${root ? col : mix(col, tok.surface, 0.22)}" stroke="${col}" stroke-width="${root ? 0 : Math.max(2, w / 260)}"/>`; }
  return `<svg viewBox="${a} ${b} ${w} ${h}" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${s}</svg>`;
}
let installEvt = null;
function renderHome() {
  const maps = recentMaps();
  $('#map-grid').innerHTML = maps.length ? maps.map(m => {
    const cnt = Object.keys(m.nodes).length, title = m.nodes[m.root].text || 'Sem título';
    return `<article class="card" data-id="${m.id}">
      <button class="thumb" data-open aria-label="Abrir ${esc(title)}">${thumbSvg(m)}</button>
      <div class="meta"><div><button class="ttl" data-open>${esc(title)}</button><small>${cnt} ideia${cnt > 1 ? 's' : ''} · ${ago(m.updated || m.created)}</small></div>
      <button class="icon-btn" data-menu aria-label="Opções de ${esc(title)}">${icon('more')}</button></div></article>`;
  }).join('') : `<div class="empty" style="grid-column:1/-1"><b>Nenhum mapa ainda</b><span>Crie um mapa novo ou comece por um modelo abaixo.</span></div>`;
  const ib = $('#install-banner');
  const showInstall = !isStandalone() && !inFrame && (installEvt || /Android/i.test(navigator.userAgent));
  ib.hidden = !showInstall;
  if (showInstall) {
    ib.innerHTML = `<p><b>Instale o Ramifica no celular.</b> Ele abre como app, funciona sem internet e o Android protege seus mapas contra limpeza automática.</p>` +
      (installEvt ? `<button class="btn primary" id="ib-install">${icon('download')} Instalar app</button>` : `<p class="hint">No menu ⋮ do navegador, toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</p>`);
    const b = $('#ib-install'); if (b) b.onclick = doInstall;
  }
  const bn = $('#backup-banner');
  const newest = maps[0]?.updated || 0;
  const needs = maps.length && newest > prefs.lastBackup && Date.now() - prefs.lastBackup > 7 * 86400e3 && maps.some(m => Object.keys(m.nodes).length > 15);
  bn.hidden = !needs;
  if (needs) bn.innerHTML = `<p>${prefs.lastBackup ? `Seu último backup foi ${ago(prefs.lastBackup)}.` : 'Você ainda não fez backup.'} Os mapas ficam só neste aparelho; um arquivo de backup protege contra perda ou troca de celular.</p><button class="btn" id="bn-backup">${icon('download')} Fazer backup</button>`;
  const bb = $('#bn-backup'); if (bb) bb.onclick = exportBackup;
}
async function doInstall() { if (!installEvt) return; installEvt.prompt(); try { await installEvt.userChoice; } catch (e) {} installEvt = null; renderHome(); }
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; renderHome(); });
addEventListener('appinstalled', () => { installEvt = null; renderHome(); toast('Ramifica instalado! Abra pelo ícone na tela inicial.'); });
$('#tpl-grid').innerHTML = TEMPLATES.map((t, i) => `<button class="tpl" data-tpl="${i}"><b>${esc(t.name)}</b><span>${esc(t.desc)}</span></button>`).join('');
$('#tpl-grid').onclick = e => { const b = e.target.closest('[data-tpl]'); if (b) createFromTemplate(+b.dataset.tpl); };
function createFromTemplate(i) {
  const m = mapFromOutline(TEMPLATES[i].text);
  db.maps[m.id] = m; saveMap(m); openMap(m.id);
  setTimeout(() => startEdit(m.root), 350);
}
async function storageInfo() {
  let persisted = false, used = 0;
  try { if (navigator.storage) { persisted = navigator.storage.persisted ? await navigator.storage.persisted() : false; const e = navigator.storage.estimate ? await navigator.storage.estimate() : null; used = (e && e.usage) || 0; } } catch (e) {}
  return { persisted, used };
}
async function showStorage() {
  const s = await storageInfo();
  let persisted = s.persisted;
  if (!persisted) { try { persisted = await navigator.storage.persist(); } catch (e) {} }
  modal({ title: persisted ? 'Seus mapas estão protegidos' : 'Armazenamento comum', html: `
    <p>${persisted ? 'O Android marcou o Ramifica como armazenamento persistente: os mapas não são apagados para liberar espaço.' : 'O navegador pode apagar os dados deste site se faltar espaço. Instale o Ramifica como app para pedir proteção, e faça backups de vez em quando.'}</p>
    <p>${idb ? 'Os mapas, imagens e anexos ficam num banco de dados do próprio aparelho.' : 'Este navegador não liberou o banco de dados completo; imagens e anexos ficam indisponíveis.'} Espaço usado: <b>${fmtSize(s.used)}</b>.</p>
    <p>Mapas: <b>${Object.keys(db.maps).length}</b>. Último backup: <b>${prefs.lastBackup ? ago(prefs.lastBackup) : 'nunca'}</b>.</p>`,
    actions: [{ label: 'Fechar' }, { label: 'Fazer backup agora', kind: 'primary', run: () => { exportBackup(); } }] });
}
$('#new-map').onclick = () => menuModal('Novo mapa', TEMPLATES.map((t, i) => ({ k: String(i), icon: i ? 'organize' : 'plus', label: t.name, sub: t.desc })), k => createFromTemplate(+k));
$('#new-dump').onclick = () => openDump(null, true);
$('#home-import').onclick = () => $('#file-in').click();
$('#home-theme').onclick = cycleTheme;
$('#home-more').onclick = () => menuModal('Backup e opções', [
  { k: 'capture', icon: 'dump', label: 'Captura rápida', sub: 'Guardar uma ideia em qualquer mapa' },
  { k: 'backup', icon: 'download', label: 'Fazer backup de todos os mapas', sub: prefs.lastBackup ? `Último: ${ago(prefs.lastBackup)}` : 'Gera um arquivo para guardar no Drive ou no computador' },
  { k: 'import', icon: 'upload', label: 'Importar', sub: 'Backup do Ramifica, XMind, FreeMind, OPML, .md ou .txt' },
  { k: 'storage', icon: 'shield', label: 'Armazenamento e segurança', sub: 'Veja se os mapas estão protegidos' },
  '-',
  { k: 'theme', icon: 'moon', label: 'Mudar tema', sub: themeLabel() },
], k => { if (k === 'backup') exportBackup(); else if (k === 'import') $('#file-in').click(); else if (k === 'storage') showStorage(); else if (k === 'capture') openCapture('', false); else cycleTheme(); });
$('#map-grid').onclick = e => {
  const card = e.target.closest('.card'); if (!card) return;
  const id = card.dataset.id, m = db.maps[id];
  if (e.target.closest('[data-open]')) { openMap(id); return; }
  if (e.target.closest('[data-menu]')) menuModal(m.nodes[m.root].text || 'Mapa', [
    { k: 'open', icon: 'organize', label: 'Abrir' },
    { k: 'dup', icon: 'copy', label: 'Duplicar' },
    { k: 'export', icon: 'download', label: 'Salvar arquivo deste mapa' },
    '-',
    { k: 'del', icon: 'trash', label: 'Excluir mapa', danger: true },
  ], k => {
    if (k === 'open') openMap(id);
    else if (k === 'dup') { const c = JSON.parse(JSON.stringify(m)); c.id = uid(); c.created = c.updated = Date.now(); c.view = null; c.nodes[c.root].text += ' (cópia)'; db.maps[c.id] = c; saveMap(c); renderHome(); toast('Mapa duplicado'); }
    else if (k === 'export') exportMapFile(m);
    else if (k === 'del') modal({ title: 'Excluir este mapa?', html: `<p>“${esc(m.nodes[m.root].text)}” e suas ${Object.keys(m.nodes).length} ideias serão apagados deste aparelho, junto com o histórico de versões. Não dá para desfazer.</p>`,
      actions: [{ label: 'Cancelar' }, { label: 'Excluir mapa', kind: 'primary', run: () => { deleteMap(id).then(renderHome); toast('Mapa excluído'); } }] });
  });
};

/* ================= abrir / fechar mapa ================= */
function updTitle() { if (M) $('#map-title').textContent = N(M.root).text || 'Sem título'; }
let hashPushed = false;
function openMap(id) {
  closeModal();
  if (editorOpen) closeEditor(true);
  M = db.maps[id]; if (!M) return;
  normalizeMap(M);
  sel = null; focusId = null; edit = null; linkFrom = null; undoStack = []; redoStack = []; size = {};
  multi.clear(); selMode = false; present = null;
  stageEl.classList.remove('selecting'); $('#btn-select').classList.remove('on'); $('#editor').classList.remove('presenting');
  closeSearch(); updFocus();
  $('#home').hidden = true; $('#editor').hidden = false; editorOpen = true;
  hashPushed = false;
  if (location.hash !== '#mapa' && document.readyState === 'complete') { try { location.hash = 'mapa'; hashPushed = true; } catch (e) {} }
  applyPanelPref(); closePanel(); applyStyle();
  curTab = 'ideia';
  stageEl._w = stageEl.clientWidth; stageEl._h = stageEl.clientHeight;
  const hadView = !!M.view;
  if (!M.view) M.view = { x: stageEl.clientWidth / 2, y: stageEl.clientHeight / 2, k: 1 };
  if (M.auto) { computeVisible(); measureIds(visible); const pos = computeLayout(M); for (const i in pos) Object.assign(N(i), pos[i]); }
  renderNodes(); renderEdges(); applyView();
  if (!hadView) fit(false);
  refreshSelUI(false); updMulti(); renderPanel(); updUndo(); updTitle();
  snapshotTick(true);
}
function closeEditor(silent) {
  if (!editorOpen) return;
  if (edit) commitEdit();
  if (present) stopPresent();
  if (coach) endCoach();
  flush();
  editorOpen = false; M = null; sel = null; multi.clear(); selMode = false;
  closeSearch(); closePanel(); $('#colorpop').hidden = true;
  $('#minimap').hidden = true;
  if (!silent) { $('#editor').hidden = true; $('#home').hidden = false; renderHome(); }
}
$('#btn-back').onclick = () => {
  if (hashPushed && location.hash === '#mapa') { hashPushed = false; history.back(); setTimeout(() => editorOpen && closeEditor(), 300); }
  else closeEditor();
};
addEventListener('hashchange', () => { if (location.hash !== '#mapa' && editorOpen) { hashPushed = false; if (present) { stopPresent(); return; } closeEditor(); } });
$('#map-title').onclick = () => { reveal(M.root); centerOn(M.root); startEdit(M.root); };
$('#btn-undo').onclick = undo;
$('#btn-redo').onclick = redo;

/* ================= abertura do app ================= */
function handleLaunch() {
  const q = new URLSearchParams(location.search);
  if (![...q.keys()].length) return false;
  const acao = q.get('acao'), title = q.get('title'), text = q.get('text'), url = q.get('url');
  try { history.replaceState(null, '', location.pathname); } catch (e) {}
  if (title || text || url) {
    const parts = [title, text];
    if (url && !(text || '').includes(url)) parts.push(url);
    openCapture(parts.filter(Boolean).join('\n'), true);
    return true;
  }
  if (acao === 'despejo') { openCapture('', false); return true; }
  if (acao === 'novo') { $('#new-map').click(); return true; }
  if (acao === 'ultimo') { const m = recentMaps()[0]; if (m) openMap(m.id); return true; }
  return false;
}
let fontT;
try { document.fonts.addEventListener('loadingdone', () => { clearTimeout(fontT); fontT = setTimeout(() => { sizeByKey.clear(); if (M && editorOpen && !edit && !gst) { if (M.auto) relayout(false); else { renderNodes(); renderEdges(); } } }, 120); }); } catch (e) {}

(async () => {
  try { const p = JSON.parse(localStorage.getItem(PKEY) || 'null'); if (p) prefs = { ...prefs, ...p }; } catch (e) {}
  readTokens(); applyTheme();
  await Store.init();
  db.maps = await Store.loadMaps();
  if (idb && !Object.keys(db.maps).length) {
    try {
      const d = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (d && d.maps && Object.keys(d.maps).length) { db.maps = d.maps; for (const m of Object.values(db.maps)) await Store.putMap(normalizeMap(m)); }
    } catch (e) {}
  }
  for (const m of Object.values(db.maps)) normalizeMap(m);
  renderHome();
  const launched = handleLaunch();
  if (!launched) {
    if (!prefs.seen && !Object.keys(db.maps).length) {
      prefs.seen = true; savePrefs();
      const m = mapFromOutline('O que está na sua cabeça?');
      db.maps[m.id] = m; await saveMap(m);
      openMap(m.id);
      setTimeout(startCoach, 500);
    } else {
      prefs.seen = true; savePrefs();
      if (location.hash === '#mapa') { try { history.replaceState(null, '', location.pathname + location.search); } catch (e) {} }
    }
  }
  try { if (navigator.storage && navigator.storage.persist && isStandalone()) navigator.storage.persist(); } catch (e) {}
  setTimeout(gcBlobs, 4000);
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !inFrame) navigator.serviceWorker.register('sw.js').catch(() => {});
})();
})();
