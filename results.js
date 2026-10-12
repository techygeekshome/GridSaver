const qs = new URLSearchParams(location.search);
const $ = (id) => document.getElementById(id);
const CONCURRENCY = 6;
const NEAR_DUP_DISTANCE = 20; // loose hash pre-check (out of 64 bits); looksSame() makes the real call
const NEAR_DUP_PIXEL_DIFF = 1.0; // max average difference per pixel (0-255)
const NEAR_DUP_MIN_CORRELATION = 0.985; // how closely the two pictures must match
const ZIP_PART_LIMIT = 1.8e9; // split very large boards into several ZIPs

/* global APP */
const state = {
  board: '',
  items: [],
  loaded: 0,
  busy: false,
  settings: { minSide: 0, nearDup: true, videos: true, csv: true, showRemoved: false }
};

init();

async function init() {
  if (qs.get('help')) {
    $('board').textContent = APP.helpTitle;
    $('help').hidden = false;
    return;
  }
  const key = qs.get('job');
  const all = await chrome.storage.local.get(null);

  // Tidy up jobs older than a day.
  const old = Object.keys(all).filter((k) => k.startsWith('job_') && k !== key && Date.now() - Number(k.slice(4)) > 86400000);
  if (old.length) chrome.storage.local.remove(old);

  const job = all[key];
  if (!job) {
    $('board').textContent = 'This download has expired';
    $('help').hidden = false;
    return;
  }
  if (all[APP.settingsKey]) Object.assign(state.settings, all[APP.settingsKey], { showRemoved: false });

  state.board = job.board || APP.defaultName;
  state.posts = job.posts || 0;
  state.missing = job.missing || 0;
  state.sourceTab = job.tabId;
  document.title = state.board + ' | ' + APP.name;
  $('board').textContent = state.board;
  state.items = job.items.map((p, i) => ({
    ...p, urls: (p.urls || []).filter(okUrl), video: (p.video || []).filter(okUrl),
    idx: i, status: 'pending', blob: null, sha: null, hash: null,
    w: 0, h: 0, vw: p.w || 0, vh: p.h || 0, ext: 'jpg', removed: '', selected: true, force: false, el: null
  }));

  setupControls();
  buildGrid();
  updateStats();
  await fetchItems(state.items);
  applyFilters();
}

// ---------- Controls ----------
function setupControls() {
  $('controls').hidden = false;
  const s = state.settings;
  $('minSide').value = String(s.minSide);
  $('nearDup').checked = s.nearDup;
  $('videos').checked = s.videos;
  $('csv').checked = s.csv;
  $('showRemoved').checked = s.showRemoved;

  const videoCount = state.items.filter((i) => i.kind === 'video').length;
  if (videoCount) { $('videosWrap').hidden = false; $('videoCount').textContent = videoCount; }
  if (videoCount && APP.relayFirst) $('keepOpen').hidden = false;

  const save = () => chrome.storage.local.set({ [APP.settingsKey]: state.settings });
  $('minSide').onchange = (e) => { s.minSide = Number(e.target.value); save(); applyFilters(); };
  $('nearDup').onchange = (e) => { s.nearDup = e.target.checked; save(); applyFilters(); };
  $('videos').onchange = (e) => { s.videos = e.target.checked; save(); state.items.forEach(updateCard); updateStats(); };
  $('csv').onchange = (e) => { s.csv = e.target.checked; save(); };
  $('showRemoved').onchange = (e) => { s.showRemoved = e.target.checked; state.items.forEach(updateCard); };
  $('all').onclick = () => { state.items.forEach((i) => { i.selected = true; updateCard(i); }); updateStats(); };
  $('none').onclick = () => { state.items.forEach((i) => { i.selected = false; i.force = false; updateCard(i); }); updateStats(); };
  $('retry').onclick = retryFailed;
  $('dl').onclick = download;
}

// ---------- Grid ----------
function buildGrid() {
  const grid = $('grid');
  const frag = document.createDocumentFragment();
  for (const it of state.items) {
    const card = document.createElement('label');
    card.className = 'card';
    card.innerHTML = `<input type="checkbox"><div class="thumb"></div><div class="meta"><span class="dim">Loading</span><span class="tag"></span></div>`;
    if (it.kind === 'video') card.insertAdjacentHTML('beforeend', '<span class="vid">VIDEO</span>');
    if (it.title) card.title = it.title;
    const cb = card.querySelector('input');
    cb.onchange = () => {
      if (it.removed) it.force = cb.checked; else it.selected = cb.checked;
      updateCard(it);
      updateStats();
    };
    it.el = card;
    frag.appendChild(card);
  }
  grid.appendChild(frag);
}

const included = (it) => it.status === 'ok' && (it.kind !== 'video' || state.settings.videos) && (it.removed ? it.force : it.selected);

function updateCard(it) {
  const card = it.el;
  if (!card) return;
  const thumb = card.querySelector('.thumb');
  if (it.thumb && !thumb.firstChild) {
    const img = document.createElement('img');
    img.loading = 'lazy';
    img.src = it.thumb;
    img.alt = it.title || '';
    thumb.appendChild(img);
  }
  card.querySelector('.dim').textContent =
    it.status === 'ok'
      ? (it.kind === 'video' ? (it.vw ? `Video ${it.vw} x ${it.vh}` : 'Video') : (it.w ? `${it.w} x ${it.h}` : it.ext.toUpperCase()))
      : it.status === 'failed' ? '' : 'Loading';
  card.querySelector('.tag').textContent = it.status === 'failed' ? 'Failed' : it.removed || '';
  card.classList.toggle('failed', it.status === 'failed');
  card.classList.toggle('removed', !!it.removed);
  card.classList.toggle('on', included(it));
  card.classList.toggle('hidden', (!!it.removed && !it.force && !state.settings.showRemoved) || (it.kind === 'video' && !state.settings.videos));
  const cb = card.querySelector('input');
  cb.checked = included(it);
  cb.disabled = it.status !== 'ok';
}

function updateStats() {
  const total = state.items.length;
  const ok = state.items.filter((i) => i.status === 'ok').length;
  const failed = state.items.filter((i) => i.status === 'failed').length;
  const removed = state.items.filter((i) => i.status === 'ok' && i.removed && !i.force).length;
  const chosen = state.items.filter(included).length;
  const bits = [state.posts && state.posts !== total ? `${state.posts} ${APP.unit}, ${total} files` : `${total} ${APP.unit}`];
  if (state.loaded < total) bits.push(`downloading ${state.loaded}/${total}`);
  else bits.push(`${ok} ready`);
  if (removed) bits.push(`${removed} removed`);
  if (failed) bits.push(`${failed} failed`);
  if (state.missing) bits.push(`${state.missing} unreadable`);
  bits.push(`${chosen} selected`);
  $('stats').textContent = bits.join(' · ');
  $('bar').style.width = (total ? (state.loaded / total) * 100 : 0) + '%';
  $('retry').hidden = !failed || state.loaded < total;
  const vids = state.items.filter((i) => included(i) && i.kind === 'video').length;
  const pics = chosen - vids;
  const pl = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  $('dl').textContent = `Download ZIP (${[pics ? pl(pics, 'photo') : '', vids ? pl(vids, 'video') : ''].filter(Boolean).join(' + ') || 0})`;
  $('dl').disabled = state.busy || !chosen || state.loaded < total;
}

// ---------- Fetching and fingerprinting ----------
async function fetchItems(list) {
  let next = 0;
  const worker = async () => {
    while (next < list.length) {
      const it = list[next++];
      await loadItem(it);
      state.loaded++;
      updateCard(it);
      updateStats();
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
}

async function retryFailed() {
  const failed = state.items.filter((i) => i.status === 'failed');
  state.loaded -= failed.length;
  failed.forEach((i) => { i.status = 'pending'; updateCard(i); });
  updateStats();
  await fetchItems(failed);
  applyFilters();
}

async function loadItem(it) {
  for (const url of it.urls) {
    try {
      const r = await fetch(url, { credentials: 'omit' });
      if (!r.ok) continue;
      const blob = await r.blob();
      if (!blob.size || (blob.type && !blob.type.startsWith('image/') && blob.type !== 'application/octet-stream')) continue;
      it.blob = blob;
      it.url = url;
      it.ext = extFrom(blob.type, url);
      break;
    } catch (e) { /* try next candidate */ }
  }
  if (!it.blob) {
    if (it.kind === 'video' && it.video.length) { it.status = 'ok'; return; } // no cover, but the video may still come down
    it.status = 'failed';
    return;
  }
  if (it.kind === 'video') { // the cover is only a preview
    it.thumb = URL.createObjectURL(it.blob);
    it.status = 'ok';
    return;
  }

  it.sha = hex(await crypto.subtle.digest('SHA-256', await it.blob.arrayBuffer()));
  try {
    const bmp = await createImageBitmap(it.blob);
    it.w = bmp.width;
    it.h = bmp.height;
    bmp.close();
    // Shrink in two steps (256px, then a 32x32 average) so a big copy and a small
    // copy of the same picture end up with almost identical fingerprints.
    let small;
    try {
      small = await createImageBitmap(it.blob, { resizeWidth: 256, resizeHeight: 256, resizeQuality: 'high' });
    } catch (e) {
      const full = await createImageBitmap(it.blob);
      const c = new OffscreenCanvas(256, 256);
      const cx = c.getContext('2d');
      cx.imageSmoothingQuality = 'high';
      cx.drawImage(full, 0, 0, 256, 256);
      full.close();
      small = await createImageBitmap(c);
    }
    it.hash = dhash(small);
    it.mini = miniGray(small);
    small.close();
  } catch (e) { /* undecodable, still downloadable */ }
  it.thumb = URL.createObjectURL(it.blob);
  it.status = 'ok';
}

function extFrom(type, url) {
  const map = { 'image/jpeg': 'jpg', 'image/jpg': 'jpg', 'image/png': 'png', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
  if (map[type]) return map[type];
  const m = url.match(/\.(\w{3,4})(?:\?|$)/);
  return m ? m[1].toLowerCase() : 'jpg';
}

const hex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

// Perceptual "difference hash": a quick 64-bit fingerprint used as a first check.
const hashCanvas = new OffscreenCanvas(9, 8);
const hashCtx = hashCanvas.getContext('2d', { willReadFrequently: true });
function dhash(bmp) {
  hashCtx.fillStyle = '#fff';
  hashCtx.fillRect(0, 0, 9, 8);
  hashCtx.drawImage(bmp, 0, 0, 9, 8);
  const d = hashCtx.getImageData(0, 0, 9, 8).data;
  let hi = 0, lo = 0, bit = 0;
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 8; x++) {
      const i = (y * 9 + x) * 4, j = i + 4;
      const a = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
      const b = d[j] * 0.299 + d[j + 1] * 0.587 + d[j + 2] * 0.114;
      if (a > b) { if (bit < 32) hi |= 1 << bit; else lo |= 1 << (bit - 32); }
      bit++;
    }
  }
  return [hi >>> 0, lo >>> 0];
}

// 32x32 greyscale average of the picture, used to confirm a near-duplicate.
// Images made from the same template get similar hashes, so the hash alone isn't enough.
const miniCanvas = new OffscreenCanvas(256, 256);
const miniCtx = miniCanvas.getContext('2d', { willReadFrequently: true });
function miniGray(bmp256) {
  miniCtx.fillStyle = '#fff';
  miniCtx.fillRect(0, 0, 256, 256);
  miniCtx.drawImage(bmp256, 0, 0, 256, 256);
  const d = miniCtx.getImageData(0, 0, 256, 256).data;
  const g = new Float32Array(1024);
  for (let y = 0; y < 256; y++) {
    for (let x = 0; x < 256; x++) {
      const i = (y * 256 + x) * 4;
      g[(y >> 3) * 32 + (x >> 3)] += (d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114) / 64;
    }
  }
  return g;
}

// Same picture = tiny average difference AND near-perfect correlation.
function looksSame(a, b) {
  let mad = 0, ma = 0, mb = 0;
  for (let i = 0; i < 1024; i++) { mad += Math.abs(a[i] - b[i]); ma += a[i]; mb += b[i]; }
  if (mad / 1024 > NEAR_DUP_PIXEL_DIFF) return false;
  ma /= 1024; mb /= 1024;
  let sab = 0, saa = 0, sbb = 0;
  for (let i = 0; i < 1024; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    sab += x * y; saa += x * x; sbb += y * y;
  }
  if (!saa || !sbb) return saa === sbb; // flat images
  return sab / Math.sqrt(saa * sbb) >= NEAR_DUP_MIN_CORRELATION;
}
function popcount(x) {
  x -= (x >>> 1) & 0x55555555;
  x = (x & 0x33333333) + ((x >>> 2) & 0x33333333);
  return (((x + (x >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}
const distance = (a, b) => popcount(a[0] ^ b[0]) + popcount(a[1] ^ b[1]);

// ---------- Duplicate removal and filters ----------
function applyFilters() {
  const s = state.settings;
  const ok = state.items.filter((i) => i.status === 'ok' && i.kind !== 'video');
  ok.forEach((i) => { i.removed = ''; });

  // 1. The same post seen twice is already handled during the scan (by post ID).
  // 2. Byte-identical files.
  const bySha = new Map();
  for (const it of ok) {
    if (bySha.has(it.sha)) it.removed = 'Duplicate';
    else bySha.set(it.sha, it);
  }
  // 3. Near-duplicates: keep the largest copy of each look-alike group.
  if (s.nearDup) {
    const pool = ok.filter((i) => !i.removed && i.hash && i.w && i.h).sort((a, b) => b.w * b.h - a.w * a.h);
    const kept = [];
    for (const it of pool) {
      const ar = it.w / it.h;
      const twin = kept.find((k) =>
        Math.abs(k.w / k.h - ar) / ar < 0.05 &&
        distance(k.hash, it.hash) <= NEAR_DUP_DISTANCE &&
        (!k.mini || !it.mini || looksSame(k.mini, it.mini))
      );
      if (twin) it.removed = 'Smaller copy';
      else kept.push(it);
    }
  }
  // Size filter.
  if (s.minSide > 0) {
    for (const it of ok) if (!it.removed && it.w && Math.min(it.w, it.h) < s.minSide) it.removed = 'Too small';
  }
  state.items.forEach(updateCard);
  updateStats();
}

// ---------- Download ----------
function safeName(s) {
  return (String(s || '')
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    .replace(/\s+/g, ' ')
    .replace(/^[.\s]+|[.\s]+$/g, '')
    .slice(0, 80)) || APP.defaultName;
}

function csvCell(v) {
  const t = String(v == null ? '' : v);
  return /[",\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
}

function day(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchVideo(it) {
  // TikTok only serves its videos to its own pages, so ask the original tab first.
  if (APP.relayFirst && state.sourceTab != null) {
    try { return await relayFetch(it.video); } catch (e) { /* fall back to a direct request */ }
  }
  for (const url of it.video) {
    try {
      const r = await fetch(url, { credentials: APP.videoCredentials || 'omit' });
      if (!r.ok) continue;
      const blob = await r.blob();
      if (blob.size > 10000 && (!blob.type || /video|octet-stream/.test(blob.type))) return blob;
    } catch (e) { /* try next */ }
  }
  if (APP.relay && !APP.relayFirst && state.sourceTab != null) {
    try { return await relayFetch(it.video); } catch (e) { /* give up */ }
  }
  return null;
}

async function download() {
  const s = state.settings;
  const list = state.items.filter(included);
  if (!list.length) return;
  state.busy = true;
  updateStats();
  const dl = $('dl');
  const pad = Math.max(3, String(list.length).length);
  const files = [];
  const rows = [['file', 'post_url', 'account', 'date', 'type', 'width', 'height', 'caption']];
  let failedVideos = 0;

  try {
    let n = 0;
    for (const it of list) {
      n++;
      const base = [String(n).padStart(pad, '0'), it.owner && safeName(it.owner), day(it.date), it.id].filter(Boolean).join('_');
      if (it.kind === 'video') {
        dl.textContent = `Fetching video ${n}/${list.length}...`;
        const blob = await fetchVideo(it);
        if (!blob) { failedVideos++; rows.push(['(failed)', it.link, it.owner, day(it.date), 'video', it.vw, it.vh, it.title]); continue; }
        files.push({ name: `${base}.mp4`, blob });
        rows.push([`${base}.mp4`, it.link, it.owner, day(it.date), 'video', it.vw, it.vh, it.title]);
      } else {
        files.push({ name: `${base}.${it.ext}`, blob: it.blob });
        rows.push([`${base}.${it.ext}`, it.link, it.owner, day(it.date), 'photo', it.w, it.h, it.title]);
      }
    }
    if (s.csv) files.push({ name: APP.csvName, blob: new Blob(['﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n')], { type: 'text/csv' }) });
    if (!files.length || (files.length === 1 && s.csv)) throw new Error('none of the selected files could be downloaded');

    const groups = [];
    let cur = [], size = 0;
    for (const f of files) {
      if (cur.length && size + f.blob.size > ZIP_PART_LIMIT) { groups.push(cur); cur = []; size = 0; }
      cur.push(f);
      size += f.blob.size;
    }
    if (cur.length) groups.push(cur);

    for (let g = 0; g < groups.length; g++) {
      const label = groups.length > 1 ? ` part ${g + 1}/${groups.length}` : '';
      const zip = await makeZip(groups[g], (i, t) => { dl.textContent = `Zipping${label} ${i}/${t}...`; });
      const filename = safeName(state.board) + (groups.length > 1 ? `-part${g + 1}` : '') + '.zip';
      await chrome.downloads.download({ url: URL.createObjectURL(zip), filename, saveAs: false });
    }
    dl.textContent = failedVideos ? `Downloaded (${failedVideos} video${failedVideos > 1 ? 's' : ''} failed)` : 'Downloaded';
    setTimeout(() => { state.busy = false; updateStats(); }, 3500);
  } catch (e) {
    console.error(e);
    dl.textContent = 'Download failed: ' + e.message;
    setTimeout(() => { state.busy = false; updateStats(); }, 5000);
  }
}

// Only fetch from the site's own image and video servers.
function okUrl(u) {
  try {
    const x = new URL(u);
    return x.protocol === 'https:' && APP.hosts.test(x.hostname);
  } catch (e) { return false; }
}

// Fetches a video through the original tab, in 4 MB pieces.
function relayFetch(urls) {
  return new Promise((resolve, reject) => {
    const port = chrome.tabs.connect(state.sourceTab, { name: 'xs-relay' });
    const parts = [];
    let type = 'video/mp4';
    const t = setTimeout(() => { port.disconnect(); reject(new Error('timeout')); }, 180000);
    port.onMessage.addListener((m) => {
      if (m.chunk) parts.push(Uint8Array.from(atob(m.chunk), (c) => c.charCodeAt(0)));
      if (m.type) type = m.type;
      if (m.done) { clearTimeout(t); resolve(new Blob(parts, { type })); port.disconnect(); }
      if (m.error) { clearTimeout(t); reject(new Error(m.error)); port.disconnect(); }
    });
    port.onDisconnect.addListener(() => { clearTimeout(t); reject(new Error('tab closed')); });
    port.postMessage({ urls });
  });
}
