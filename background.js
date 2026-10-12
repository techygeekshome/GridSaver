const SITE_MATCH = /^https:\/\/www\.instagram\.com\//;
const APP_NAME = "Grid Saver";
// SITE_MATCH and APP_NAME are set at the top of this file by the build.
chrome.action.onClicked.addListener(async (tab) => {
  if (!SITE_MATCH.test(tab.url || '')) {
    await chrome.tabs.create({ url: chrome.runtime.getURL('results.html?help=1') });
    return;
  }
  try {
    await chrome.scripting.executeScript({ target: { tabId: tab.id }, files: ['site.js', 'scan.js'] });
  } catch (e) {
    console.error(APP_NAME + ': could not start on this page', e);
  }
});

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg || msg.type !== 'xs-scan') return;
  const id = 'job_' + Date.now();
  const job = { ...msg.job, tabId: sender.tab ? sender.tab.id : null };
  chrome.storage.local
    .set({ [id]: job })
    .then(() =>
      chrome.tabs.create({
        url: chrome.runtime.getURL('results.html?job=' + id),
        index: sender.tab ? sender.tab.index + 1 : undefined
      })
    )
    .then(() => reply({ ok: true }))
    .catch((e) => reply({ ok: false, error: String(e) }));
  return true;
});
