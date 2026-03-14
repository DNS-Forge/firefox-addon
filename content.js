const INTERNAL_API = "https://api.nextdns.io/profiles";

let mutationTimer;
const observer = new MutationObserver(() => {
  const path = window.location.pathname;
  clearTimeout(mutationTimer);
  mutationTimer = setTimeout(() => {
    if (path.endsWith('/security')) {
      injectPageButtons();
      injectModalButtons();
    } else if (path.endsWith('/account')) {
      extractApiKey();
    }
  }, 150);
});
observer.observe(document.body, { childList: true, subtree: true });

function getProfileId() {
  const match = window.location.pathname.match(/\/([a-z0-9]+)\//);
  return match ? match[1] : null;
}

// --- NEW: API Key Auto-Extraction ---
async function extractApiKey() {
  // Target the exact class combination from the NextDNS account page
  const apiDiv = document.querySelector('.font-monospace.flex-shrink-1.ms-3.no-scrollbars');
  if (apiDiv) {
    const key = apiDiv.textContent.trim();
    // Validate it looks like a standard API key (length check)
    if (key && key.length > 20) {
      const data = await browser.storage.local.get("apiKey");
      if (data.apiKey !== key) {
        await browser.storage.local.set({ apiKey: key });
        showProgressUI("API Key Synced to DNS Forge!", 1);
        updateProgress(1, 1);
        setTimeout(removeProgressUI, 3000);
      }
    }
  }
}

// --- UI Injection ---
async function injectPageButtons() {
  if (document.getElementById('nxm-tld-controls')) return;
  const buttons = Array.from(document.querySelectorAll('button'));
  const addTldBtn = buttons.find(b => b.textContent.includes('Add a TLD'));

  if (addTldBtn && addTldBtn.parentElement) {
    const container = addTldBtn.parentElement;
    const btnGroup = document.createElement('div');
    btnGroup.id = 'nxm-tld-controls';
    btnGroup.style.display = 'inline-flex';
    btnGroup.style.gap = '10px';
    btnGroup.style.marginLeft = '15px';

    btnGroup.innerHTML = `
      <button id="nxm-enable-all" class="btn btn-primary">Enable ALL TLDs</button>
      <button id="nxm-disable-all" class="btn btn-danger">Disable ALL TLDs</button>
      <button id="nxm-restore" class="btn btn-secondary" style="display: none;">Restore TLDs</button>
      <button id="nxm-toggle-table" class="btn btn-secondary" style="background: #6c757d; border-color: #6c757d;">👁️ Toggle List</button>
    `;
    container.appendChild(btnGroup);

    document.getElementById('nxm-enable-all').onclick = handleEnableAll;
    document.getElementById('nxm-disable-all').onclick = handleDisableAll;
    document.getElementById('nxm-restore').onclick = handleRestore;

    const card = container.closest('.card');
    if (card) {
      const listGroup = card.querySelector('.list-group');
      if (listGroup) {
        listGroup.style.display = 'none'; 
        document.getElementById('nxm-toggle-table').onclick = () => {
          listGroup.style.display = listGroup.style.display === 'none' ? '' : 'none';
        };
      }
    }
    checkBackupStatus();
  }
}

function injectModalButtons() {
  const modal = document.querySelector('.modal-dialog.modal-lg.modal-dialog-scrollable');
  if (modal && !document.getElementById('nxm-modal-enable-all')) {
    const enableAll = document.createElement('button');
    enableAll.id = 'nxm-modal-enable-all';
    enableAll.className = 'btn btn-primary';
    enableAll.style.cssText = 'position: absolute; right: 250px; bottom: 10px; z-index: 9999;';
    enableAll.textContent = 'Enable ALL TLDs';
    enableAll.onclick = handleEnableAll;

    const disableAll = document.createElement('button');
    disableAll.id = 'nxm-modal-disable-all';
    disableAll.className = 'btn btn-danger';
    disableAll.style.cssText = 'position: absolute; right: 100px; bottom: 10px; z-index: 9999;';
    disableAll.textContent = 'Disable ALL TLDs';
    disableAll.onclick = handleDisableAll;

    modal.appendChild(enableAll);
    modal.appendChild(disableAll);
  }
}

function showProgressUI(actionText, total) {
  let ui = document.getElementById('nxm-progress-ui');
  if (!ui) {
    ui = document.createElement('div');
    ui.id = 'nxm-progress-ui';
    ui.style.cssText = 'position: fixed; top: 20px; right: 20px; width: 300px; background: white; color: #333; padding: 15px; border-radius: 8px; box-shadow: 0 4px 12px rgba(0,0,0,0.25); z-index: 10000; font-family: sans-serif; border: 1px solid #ccc;';
    ui.innerHTML = `
      <div style="font-weight: bold; margin-bottom: 10px;" id="nxm-progress-text">${actionText}...</div>
      <div style="width: 100%; height: 8px; background: #e9ecef; border-radius: 4px; overflow: hidden;">
        <div id="nxm-progress-bar" style="height: 100%; background: #007bff; width: 0%; transition: width 0.1s;"></div>
      </div>
      <div style="font-size: 0.85em; color: #666; margin-top: 5px; text-align: right;" id="nxm-progress-count">0 / ${total}</div>
    `;
    document.body.appendChild(ui);
  } else {
    document.getElementById('nxm-progress-text').textContent = actionText + '...';
    document.getElementById('nxm-progress-count').textContent = `0 / ${total}`;
    document.getElementById('nxm-progress-bar').style.width = '0%';
  }
}

function updateProgress(current, total) {
  const bar = document.getElementById('nxm-progress-bar');
  const count = document.getElementById('nxm-progress-count');
  if (bar && count) {
    const percentage = Math.round((current / total) * 100);
    bar.style.width = `${percentage}%`;
    count.textContent = `${current} / ${total}`;
  }
}

function removeProgressUI() {
  const ui = document.getElementById('nxm-progress-ui');
  if (ui) ui.remove();
}

async function checkBackupStatus() {
  const profileId = getProfileId();
  if (!profileId) return;
  const data = await browser.storage.local.get(`tldBackup_${profileId}`);
  const restoreBtn = document.getElementById('nxm-restore');
  if (restoreBtn) restoreBtn.style.display = data[`tldBackup_${profileId}`] ? 'inline-block' : 'none';
}

async function getCurrentActiveTLDs(profileId) {
  try {
    const res = await fetch(`${INTERNAL_API}/${profileId}/security/tlds`, { credentials: 'include' });
    const data = await res.json();
    return (data.data || []).map(item => item.id);
  } catch (e) { return []; }
}

async function handleEnableAll() {
  const profileId = getProfileId();
  if (!profileId) return;
  if (!confirm("This will enable all TLDs. We will create a backup of your current setup first. Continue?")) return;
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  await browser.storage.local.set({ [`tldBackup_${profileId}`]: currentTLDs });
  checkBackupStatus();
  const modalItems = document.querySelectorAll('.modal-dialog .list-group-item');
  const allTLDs = Array.from(modalItems).map(el => el.textContent.trim().toLowerCase()).filter(text => text.startsWith('.')); 
  if (allTLDs.length === 0) return alert("Please click 'Add a TLD' to open the modal first so the extension can read the master list.");
  processTLDs(profileId, allTLDs, 'POST', 'Enabling TLDs');
}

async function handleDisableAll() {
  const profileId = getProfileId();
  if (!profileId) return;
  if (!confirm("Are you sure you want to disable ALL active TLD blocks?")) return;
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  if (currentTLDs.length === 0) return alert("No active TLDs to disable.");
  processTLDs(profileId, currentTLDs, 'DELETE', 'Disabling TLDs');
}

async function handleRestore() {
  const profileId = getProfileId();
  if (!profileId) return;
  const data = await browser.storage.local.get(`tldBackup_${profileId}`);
  const backup = data[`tldBackup_${profileId}`];
  if (!backup || backup.length === 0) return alert("No backup found.");
  const currentTLDs = await getCurrentActiveTLDs(profileId);
  await processTLDs(profileId, currentTLDs, 'DELETE', 'Clearing current TLDs', false); 
  await processTLDs(profileId, backup, 'POST', 'Restoring Backup');
}

async function processTLDs(profileId, tldArray, method, actionText, alertOnFinish = true) {
  const btns = document.querySelectorAll('[id^="nxm-"]');
  btns.forEach(b => { b.disabled = true; b.style.opacity = '0.5'; });

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
    try { await fetch(url, opts); } catch (e) { console.warn(`Error on ${tld}:`, e); } finally {
      completed++;
      updateProgress(completed, total);
    }
  };

  const workers = Array(Math.min(CONCURRENCY_LIMIT, queue.length)).fill(null).map(async () => {
    while (queue.length > 0) await runTask(queue.shift());
  });

  await Promise.all(workers);
  removeProgressUI();
  btns.forEach(b => { b.disabled = false; b.style.opacity = '1'; });
  if (alertOnFinish) {
    alert(`Success: ${actionText} finished. The page will now reload.`);
    window.location.reload();
  }
}