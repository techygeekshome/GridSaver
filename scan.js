// Injected when the toolbar icon is clicked. Works out what's on screen (one post or a
// whole profile), scrolls a profile so the site loads every post, then hands the list
// to the results tab. SITE is defined in site.js, which is injected just before this.
(() => {
  if (window.__xsActive) return;
  window.__xsActive = true;
  /* global SITE */
  let stopRequested = false;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  // ---------- Progress panel ----------
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;right:20px;bottom:20px;z-index:2147483647;';
  const root = host.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = `
    .box{font:14px/1.4 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#111;color:#fff;border-radius:14px;padding:14px 16px;width:290px;box-shadow:0 8px 30px rgba(0,0,0,.35)}
    .t{font-weight:700;font-size:13px;opacity:.8}
    .n{font-size:28px;font-weight:800;margin:4px 0}
    .s{opacity:.85;min-height:20px}
    button{margin-top:10px;background:${SITE.color};color:#fff;border:0;border-radius:999px;padding:8px 14px;font-weight:700;cursor:pointer}`;
  const box = document.createElement('div');
  box.className = 'box';
  const el = (cls, id, text, tag = 'div') => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (id) e.id = id;
    e.textContent = text;
    box.appendChild(e);
    return e;
  };
  el('t', '', SITE.name);
  el('n', 'n', '0 ' + SITE.unit);
  el('s', 's', 'Starting...');
  el('', 'b', "Stop and use what's found", 'button');
  root.append(style, box);
  document.documentElement.appendChild(host);
  const $n = root.getElementById('n');
  const $s = root.getElementById('s');
  let $b = root.getElementById('b');
  $b.onclick = () => { stopRequested = true; $s.textContent = 'Stopping...'; };
  const status = (msg, count) => {
    if (msg) $s.textContent = msg;
    if (count != null) $n.textContent = count + ' ' + SITE.unit;
  };
  const finish = (msg, delay = 4000) => {
    status(msg);
    if ($b) { $b.remove(); $b = null; }
    if (delay) setTimeout(close, delay);
  };
  const close = () => { host.remove(); window.__xsActive = false; };

  const store = window.__xsStore;
  if (!store) {
    finish(`${SITE.name} was added after this page opened. Refresh the page once, then click the icon again.`, 0);
    const r = document.createElement('button');
    r.textContent = 'Refresh now';
    r.onclick = () => location.reload();
    root.querySelector('.box').appendChild(r);
    return;
  }

  const page = SITE.page(location);
  if (!page) {
    finish(SITE.wrongPage, 7000);
    return;
  }

  const codesOnPage = () => {
    const out = [];
    for (const a of document.querySelectorAll(SITE.linkSelector)) {
      const c = SITE.linkCode(a.getAttribute('href') || '');
      if (c) out.push(c);
    }
    return out;
  };

  async function collectProfile() {
    const order = [];
    const seen = new Set();
    const grab = () => {
      for (const c of codesOnPage()) if (!seen.has(c)) { seen.add(c); order.push(c); }
    };
    window.scrollTo(0, 0);
    await sleep(800);
    let idle = 0;
    while (!stopRequested && order.length < 20000) {
      const before = order.length;
      grab();
      status(SITE.scrolling, order.length);
      idle = order.length === before ? idle + 1 : 0;
      const atBottom = window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 50;
      if (idle >= (atBottom ? 6 : 12)) break;
      window.scrollBy(0, Math.round(window.innerHeight * 0.85));
      await sleep(1200);
    }
    grab();
    await sleep(1500); // let the last replies arrive
    return order;
  }

  async function waitFor(code, ms) {
    const end = Date.now() + ms;
    while (Date.now() < end) {
      store.scanDocument();
      if (store.items.has(code)) return true;
      await sleep(400);
    }
    return false;
  }

  (async () => {
    store.scanDocument();
    let codes;
    let title;
    if (page.type === 'post') {
      status('Reading this post...', 0);
      await waitFor(page.code, 6000);
      codes = [page.code];
      const p = store.items.get(page.code);
      title = p && p.owner ? `${SITE.postTitle} @${p.owner}` : SITE.postTitle.trim();
    } else {
      title = '@' + page.user;
      codes = await collectProfile();
      store.scanDocument();
    }

    const posts = codes.map((c) => store.items.get(c)).filter(Boolean);
    const missing = codes.length - posts.length;
    if (!posts.length) {
      finish(page.type === 'post' ? SITE.notFoundPost : SITE.notFoundProfile, 8000);
      return;
    }

    const items = [];
    for (const p of posts) {
      p.media.forEach((m, i) => {
        items.push({
          id: p.media.length > 1 ? `${p.code}_${i + 1}` : p.code,
          post: p.code,
          link: SITE.postUrl(p),
          owner: p.owner,
          date: p.date,
          title: p.caption.slice(0, 500),
          kind: m.kind,
          urls: m.urls,
          video: m.video,
          w: m.w,
          h: m.h
        });
      });
    }

    status('Opening results...', posts.length);
    chrome.runtime.sendMessage(
      { type: 'xs-scan', job: { board: title, source: location.href, items, posts: posts.length, missing, created: Date.now() } },
      () => finish(`Done. ${posts.length} ${SITE.unit} sent to the results tab.` + (missing ? ` ${missing} couldn't be read.` : ''))
    );
  })();
})();
