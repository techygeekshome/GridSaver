// Isolated-world store. Receives copies of the site's data from hook.js, pulls out
// the posts (via the site-specific extract() defined before this file) and keeps them
// until the toolbar button is clicked.
(() => {
  if (window.__xsStore) return;
  const items = new Map();

  function parse(text) {
    const t = String(text || '').replace(/^for \(;;\);/, '').trim();
    try { return [JSON.parse(t)]; } catch (e) { /* maybe several JSON documents, one per line */ }
    const out = [];
    for (const line of t.split('\n')) {
      const s = line.trim();
      if (!s.startsWith('{')) continue;
      try { out.push(JSON.parse(s)); } catch (e) { /* skip */ }
    }
    return out;
  }

  function walk(obj, depth) {
    if (!obj || typeof obj !== 'object' || depth > 40) return;
    if (Array.isArray(obj)) { for (const v of obj) walk(v, depth + 1); return; }
    const post = extract(obj); // eslint-disable-line no-undef
    if (post) { add(post); return; }
    for (const k in obj) {
      const v = obj[k];
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  }

  function score(p) {
    return p.media.reduce((s, m) => s + (m.urls.length ? 1 : 0) + (m.video.length ? 2 : 0) + (m.w * m.h) / 1e7, 0);
  }

  function add(p) {
    if (!p.code || !p.media.length) return;
    const old = items.get(p.code);
    if (!old || score(p) > score(old)) items.set(p.code, p);
  }

  function ingest(text) {
    for (const doc of parse(text)) walk(doc, 0);
  }

  function scanDocument() {
    for (const s of document.querySelectorAll('script[type="application/json"], script#__UNIVERSAL_DATA_FOR_REHYDRATION__, script#SIGI_STATE')) {
      const t = s.textContent;
      if (t && t.length < 30e6 && /image_versions2|display_resources|itemStruct|ItemModule|itemList|imagePost/.test(t)) ingest(t);
    }
  }

  window.addEventListener('message', (e) => {
    if (e.source !== window || !e.data || e.data.__xs !== 'data') return;
    try { ingest(e.data.text); } catch (err) { /* ignore bad data */ }
  });

  window.__xsStore = { items, scanDocument, ingest };
})();

// Video relay: the results tab can ask this tab to fetch a video the site only
// serves to its own pages. Sent back in 4 MB pieces.
// Firefox can hand back the page's own copy of the data, which the extension isn't
// allowed to slice up directly. Copy it into a buffer of our own first.
async function localBytes(r) {
  const src = new Uint8Array(await r.arrayBuffer());
  const out = new Uint8Array(src.length);
  try {
    out.set(src);
  } catch (e) {
    for (let i = 0; i < src.length; i++) out[i] = src[i];
  }
  return out;
}

async function relayGet(url) {
  const errs = [];
  // 1. The content script's own fetch (Chrome sends it as the page; Firefox adds the page as referrer).
  try {
    const r = await fetch(url, { credentials: 'include' });
    if (r.ok) {
      const buf = await localBytes(r);
      if (buf.length > 10000) return { buf, type: String(r.headers.get('content-type') || 'video/mp4') };
    }
    errs.push('fetch ' + r.status);
  } catch (e) { errs.push('fetch ' + e); }
  // 2. Firefox: ask as the page itself.
  if (typeof content !== 'undefined' && content && typeof content.fetch === 'function') {
    try {
      const r = await content.fetch(url, { credentials: 'include' });
      if (r.ok) {
        const buf = await localBytes(r);
        if (buf.length > 10000) return { buf, type: String(r.headers.get('content-type') || 'video/mp4') };
      }
      errs.push('content.fetch ' + r.status);
    } catch (e) { errs.push('content.fetch ' + e); }
  }
  throw new Error(errs.join('; '));
}

chrome.runtime.onConnect.addListener((port) => {
  if (port.name !== 'xs-relay') return;
  port.onMessage.addListener(async (m) => {
    const errs = [];
    for (const url of m.urls || []) {
      try {
        const { buf, type } = await relayGet(url);
        port.postMessage({ type });
        const CH = 4 * 1024 * 1024;
        for (let i = 0; i < buf.length; i += CH) {
          const part = buf.subarray(i, i + CH);
          let bin = '';
          for (let j = 0; j < part.length; j += 0x8000) bin += String.fromCharCode.apply(null, part.subarray(j, j + 0x8000));
          port.postMessage({ chunk: btoa(bin) });
        }
        port.postMessage({ done: true });
        return;
      } catch (e) { errs.push(String(e.message || e)); }
    }
    port.postMessage({ error: errs.join(' / ') || 'not available' });
  });
});
