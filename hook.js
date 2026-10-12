// Runs in the page itself (MAIN world) from the moment the page starts loading.
// It watches the site's own data requests and passes copies of the replies to the
// extension's isolated script (bridge.js). It never changes or sends any request.
(() => {
  if (window.__xsHook) return;
  window.__xsHook = true;
  const WATCH = /\/graphql\/query|\/api\/v1\/|\/api\/graphql|\/api\/(post|repost|favorite|collection|mix|related|recommend|item)\/|\/api\/item\/detail/;
  const MARK = /image_versions2|itemList|itemStruct|"itemInfo"/;
  const post = (url, text) => {
    if (text && text.length < 30e6 && MARK.test(text)) window.postMessage({ __xs: 'data', url: String(url), text }, location.origin);
  };

  const origFetch = window.fetch;
  window.fetch = function (input, init) {
    const p = origFetch.apply(this, arguments);
    try {
      const url = typeof input === 'string' ? input : (input && input.url) || '';
      if (WATCH.test(url)) p.then((r) => r.clone().text().then((t) => post(url, t))).catch(() => {});
    } catch (e) { /* never break the page */ }
    return p;
  };

  const open = XMLHttpRequest.prototype.open;
  const send = XMLHttpRequest.prototype.send;
  XMLHttpRequest.prototype.open = function (method, url) {
    try { this.__xsUrl = String(url); } catch (e) { /* ignore */ }
    return open.apply(this, arguments);
  };
  XMLHttpRequest.prototype.send = function () {
    try {
      if (this.__xsUrl && WATCH.test(this.__xsUrl)) {
        this.addEventListener('load', () => {
          try {
            if (this.responseType === '' || this.responseType === 'text') post(this.__xsUrl, this.responseText);
            else if (this.responseType === 'json' && this.response) post(this.__xsUrl, JSON.stringify(this.response));
          } catch (e) { /* ignore */ }
        });
      }
    } catch (e) { /* ignore */ }
    return send.apply(this, arguments);
  };
})();
