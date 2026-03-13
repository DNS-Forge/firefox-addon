const INTERNAL_API = "https://api.nextdns.io/profiles";

let mutationTimer;
const observer = new MutationObserver(() => {
  if (!window.location.pathname.endsWith('/security')) return;
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    injectPageButtons();
  }, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

function getProfileId() {
  const match = window.location.pathname.match(/\/([a-z0-9]+)\//);
  return match ? match[1] : null;
}

// UI Helpers (Omitted for brevity, but same as original with new handlers)

async function processTLDs(profileId, tldArray, method, actionText) {
  const total = tldArray.length;
  if (total === 0) return;
  showProgressUI(actionText, total);
  
  let completed = 0;
  const CONCURRENCY_LIMIT = 10;
  const queue = [...tldArray];

  const runTask = async (tld) => {
    const url = method === 'POST' ? `${INTERNAL_API}/${profileId}/security/tlds` : `${INTERNAL_API}/${profileId}/security/tlds/${tld}`;
    const opts = { method, credentials: 'include', headers: { 'Content-Type': 'application/json' } };
    if (method === 'POST') opts.body = JSON.stringify({ id: tld });
    try { await fetch(url, opts); } catch (e) { console.warn(`TLD Error: ${tld}`); } finally {
      completed++;
      updateProgress(completed, total);
    }
  };

  const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) {
      const item = queue.shift();
      if (item) await runTask(item);
    }
  });

  await Promise.all(workers);
  removeProgressUI();
  alert(`DNS Forge: ${actionText} complete!`);
  window.location.reload();
}
