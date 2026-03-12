let activeProfile = null;
let cachedLogs = []; 
let autoRefreshInterval = null;
let cachedListItems = []; 
let isAutoRefreshDefault = false;
let isTabTrackingPaused = false; 

// Cache State
let listsSynced = false;
let currentAllowlist = new Set();
let currentDenylist = new Set();

const urlParams = new URLSearchParams(window.location.search);
const isPopoutMode = urlParams.get('mode') === 'popout';
const isSidebarMode = urlParams.get('mode') === 'sidebar';
let isPinnedOnTop = false;

const PRESET_THEMES = {
    "OLED Black": { "--bg-main": "#000000", "--bg-panel": "#0a0a0a", "--border-color": "#1a1a1a", "--hover-bg": "#111111", "--text-main": "#ffffff", "--text-muted": "#888888" },
    "Dracula": { "--bg-main": "#282a36", "--bg-panel": "#44475a", "--border-color": "#6272a4", "--hover-bg": "#50fa7b20", "--text-main": "#f8f8f2", "--text-muted": "#bfbfbf" },
    "Nord": { "--bg-main": "#2e3440", "--bg-panel": "#3b4252", "--border-color": "#4c566a", "--hover-bg": "#434c5e", "--text-main": "#eceff4", "--text-muted": "#d8dee9" },
    "Solarized Dark": { "--bg-main": "#002b36", "--bg-panel": "#073642", "--border-color": "#586e75", "--hover-bg": "#073642", "--text-main": "#eee8d5", "--text-muted": "#839496" },
    "Gruvbox": { "--bg-main": "#282828", "--bg-panel": "#3c3836", "--border-color": "#504945", "--hover-bg": "#504945", "--text-main": "#ebdbb2", "--text-muted": "#a89984" }
};

const THEME_VARS = ['bg-main', 'bg-panel', 'border-color', 'text-main', 'text-muted', 'hover-bg'];
let savedThemes = {};
let activeThemeId = 'default-dark';

// SECURITY: Prevent XSS injection
function escapeHTML(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag]));
}

document.addEventListener("DOMContentLoaded", async () => {
  
  const popoutBtn = document.getElementById('popout-ui-btn');
  const pinBtn = document.getElementById('pin-ui-btn');
  const sidebarBtn = document.getElementById('sidebar-ui-btn');
  const refreshBtn = document.getElementById('refresh-view-btn');
  const themeBtn = document.getElementById('theme-toggle-btn');
  const tabSyncBtn = document.getElementById('toggle-tab-tracking-btn');

  // --- Bulk Add Event Listeners ---
  const bulkToggleBtn = document.getElementById("list-bulk-toggle-btn");
  const bulkContainer = document.getElementById("list-bulk-container");
  const bulkCancelBtn = document.getElementById("list-bulk-cancel-btn");
  const bulkSubmitBtn = document.getElementById("list-bulk-submit-btn");
  const bulkTextarea = document.getElementById("list-bulk-domains");

  bulkToggleBtn.addEventListener('click', () => { bulkContainer.style.display = bulkContainer.style.display === 'none' ? 'flex' : 'none'; });
  bulkCancelBtn.addEventListener('click', () => { bulkContainer.style.display = 'none'; bulkTextarea.value = ''; });

  bulkSubmitBtn.addEventListener('click', async () => {
    const listType = document.getElementById("list-type-select").value;
    const domains = bulkTextarea.value.split('\n').map(d => d.trim()).filter(d => d !== '');
    if (domains.length === 0 || !activeProfile) return;

    bulkSubmitBtn.disabled = true;
    bulkCancelBtn.disabled = true;
    bulkSubmitBtn.textContent = `Processing (0/${domains.length})...`;

    for (let i = 0; i < domains.length; i++) {
      if (listType === 'allowlist') currentAllowlist.add(domains[i]);
      else currentDenylist.add(domains[i]);

      await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: listType, domain: domains[i], action: "add" });
      bulkSubmitBtn.textContent = `Processing (${i + 1}/${domains.length})...`;
      await new Promise(r => setTimeout(r, 500)); 
    }

    bulkTextarea.value = "";
    bulkSubmitBtn.disabled = false;
    bulkCancelBtn.disabled = false;
    bulkSubmitBtn.textContent = "Submit Bulk Add";
    bulkContainer.style.display = 'none';
    
    syncLists(true); 
    loadManagerList(); 
  });


  // --- Live Tab Tracking & Freeze Logic ---
  tabSyncBtn.addEventListener('click', () => {
    isTabTrackingPaused = !isTabTrackingPaused;
    if (isTabTrackingPaused) {
      tabSyncBtn.classList.replace('btn-secondary', 'btn-dark');
      tabSyncBtn.textContent = '▶️ Paused';
    } else {
      tabSyncBtn.classList.replace('btn-dark', 'btn-secondary');
      tabSyncBtn.textContent = '⏸️ Live';
      updateDashboardTabInfo(); 
    }
  });

  browser.tabs.onActivated.addListener(() => { if (!isTabTrackingPaused) updateDashboardTabInfo(); });
  browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => { if (tab.active && changeInfo.status === 'complete' && !isTabTrackingPaused) updateDashboardTabInfo(); });

  // View Router Logic
  if (isSidebarMode) {
    document.body.classList.add('sidebar-mode');
    popoutBtn.style.display = 'none';
    pinBtn.style.display = 'none';
    sidebarBtn.style.display = 'none';
  } else if (isPopoutMode) {
    document.body.classList.add('popout-mode');
    popoutBtn.style.display = 'none';
    sidebarBtn.style.display = 'none';
    pinBtn.style.display = 'flex';

    pinBtn.addEventListener('click', async () => {
      isPinnedOnTop = !isPinnedOnTop;
      try {
        const win = await browser.windows.getCurrent();
        await browser.windows.update(win.id, { alwaysOnTop: isPinnedOnTop });
        pinBtn.style.color = isPinnedOnTop ? '#28a745' : 'var(--text-muted)'; 
        pinBtn.title = isPinnedOnTop ? "Unpin Window" : "Toggle Always on Top";
      } catch (e) {
        alert("Your desktop environment explicitly blocks API-driven 'Always on Top' requests. You will need to right-click the window titlebar and pin it natively.");
        isPinnedOnTop = false;
      }
    });
  } else {
    popoutBtn.addEventListener('click', async () => {
      const currentWin = await browser.windows.getCurrent();
      const spawnLeft = Math.max(0, currentWin.left + currentWin.width - 400 - 30);
      const spawnTop = currentWin.top + 60;

      const newWin = await browser.windows.create({
        url: browser.runtime.getURL("popup.html?mode=popout"),
        type: "popup", 
        width: 380,
        height: 650,
        left: spawnLeft,
        top: spawnTop
      });
      setTimeout(() => browser.windows.update(newWin.id, { width: 380, height: 650 }).catch(()=>{}), 300);
      window.close(); 
    });

    sidebarBtn.addEventListener('click', async () => {
      try {
        await browser.sidebarAction.open();
        window.close();
      } catch (e) { alert("Sidebar API blocked. Open via View > Sidebar in Firefox."); }
    });
  }

  const { activeTheme, customThemes, uiTheme } = await browser.storage.local.get(["activeTheme", "customThemes", "uiTheme"]);
  savedThemes = customThemes || {};
  
  if (!activeTheme && uiTheme) {
      activeThemeId = uiTheme === 'light' ? 'default-light' : 'default-dark';
  } else {
      activeThemeId = activeTheme || 'default-dark';
  }

  applyTheme(activeThemeId);
  populateThemeDropdown();

  themeBtn.addEventListener('click', async () => {
    const newTheme = (activeThemeId === 'default-light' || activeThemeId !== 'default-dark') ? 'default-dark' : 'default-light';
    await applyAndSaveTheme(newTheme);
  });

  THEME_VARS.forEach(v => {
    const picker = document.getElementById(`color-${v}`);
    if (picker) {
      picker.addEventListener('input', (e) => {
        document.body.style.setProperty(`--${v}`, e.target.value);
      });
    }
  });

  document.getElementById("theme-selector").addEventListener('change', async (e) => {
    await applyAndSaveTheme(e.target.value);
  });

  document.getElementById("save-theme-btn").addEventListener('click', async () => {
    let tName = document.getElementById("theme-name-input").value.trim();
    if (!tName) tName = `Theme ${Object.keys(savedThemes).length + 1}`;
    
    if (tName === 'default-dark' || tName === 'default-light' || PRESET_THEMES[tName]) {
        return alert("Cannot overwrite default or preset themes. Please choose a different name.");
    }

    const cTheme = {};
    THEME_VARS.forEach(v => {
      cTheme[`--${v}`] = document.getElementById(`color-${v}`).value;
    });
    
    savedThemes[tName] = cTheme;
    await browser.storage.local.set({ customThemes: savedThemes });
    await applyAndSaveTheme(tName);
    
    document.getElementById("theme-name-input").value = "";
    const btn = document.getElementById("save-theme-btn");
    btn.textContent = "✅ Saved!";
    setTimeout(() => { btn.textContent = "💾 Save"; }, 2000);
  });

  document.getElementById("delete-theme-btn").addEventListener('click', async () => {
    if (activeThemeId.startsWith('default-') || PRESET_THEMES[activeThemeId]) return;
    if (confirm(`Are you sure you want to delete the theme "${activeThemeId}"?`)) {
        delete savedThemes[activeThemeId];
        await browser.storage.local.set({ customThemes: savedThemes });
        await applyAndSaveTheme('default-dark');
    }
  });

  refreshBtn.addEventListener('click', async () => {
    refreshBtn.style.transform = "rotate(180deg)";
    setTimeout(() => { refreshBtn.style.transform = "none"; }, 300);

    const activeTab = document.querySelector('.tab-btn.active').getAttribute('data-tab');
    if (activeTab === 'dashboard') { await syncLists(true); initializeApp(); }
    else if (activeTab === 'logs') { await syncLists(true); loadNativeLogs(); }
    else if (activeTab === 'lists') loadManagerList(true); 
    else if (activeTab === 'toggles') loadToggles();
    else if (activeTab === 'settings') loadSettings();
    else if (activeTab === 'labs') loadSettings(); 
  });

  document.addEventListener('click', (e) => {
    if (e.target.closest('.tab-log-item')) {
      const setDomain = e.target.closest('.tab-log-item').getAttribute('data-set-domain');
      if (setDomain) {
        const input = document.getElementById('domain-input');
        input.value = setDomain;
        input.style.borderColor = '#4facf7';
        setTimeout(() => input.style.borderColor = 'var(--border-color)', 500);
      }
    }
    if (e.target.closest('#logs-container')) {
      const btn = e.target.closest('button');
      if (btn) {
        if (btn.hasAttribute('data-log-action')) handleLogAction(btn.getAttribute('data-list'), btn.getAttribute('data-domain'), btn.getAttribute('data-log-action'), btn);
        else if (btn.hasAttribute('data-find')) findInLists(btn.getAttribute('data-find'));
      } else if (e.target.classList.contains('domain-copy')) {
        const dText = e.target.getAttribute('data-copy');
        navigator.clipboard.writeText(dText);
        alert('Copied: ' + dText);
      }
    }
    if (e.target.closest('#list-items-container')) {
      const btn = e.target.closest('button');
      if (btn && btn.hasAttribute('data-delete')) deleteListItem(btn.getAttribute('data-delete'));
    }
    if (e.target.closest('#tab-toggles')) {
      const btn = e.target.closest('button');
      if (btn && btn.hasAttribute('data-toggle-cat')) toggleService(btn.getAttribute('data-toggle-cat'), btn.getAttribute('data-toggle-id'), btn);
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.onclick = () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
      
      btn.classList.add('active');
      const targetTab = btn.getAttribute('data-tab');
      document.getElementById(`tab-${targetTab}`).classList.add('active');

      if (targetTab !== 'logs') toggleAutoRefresh(false);
      else {
        if (isAutoRefreshDefault && autoRefreshInterval === null) toggleAutoRefresh(true);
        else loadNativeLogs();
      }

      if (targetTab === 'lists') loadManagerList();
      if (targetTab === 'toggles') loadToggles();
      if (targetTab === 'settings' || targetTab === 'labs') loadSettings();
    };
  });

  initializeApp();
});

async function applyAndSaveTheme(themeId) {
  activeThemeId = themeId;
  applyTheme(themeId);
  await browser.storage.local.set({ activeTheme: activeThemeId });
  populateThemeDropdown();
}

function applyTheme(themeId) {
  THEME_VARS.forEach(v => document.body.style.removeProperty(`--${v}`));
  if (themeId === 'default-light') document.body.classList.add('light-mode');
  else if (themeId === 'default-dark') document.body.classList.remove('light-mode');
  else if (PRESET_THEMES[themeId]) {
      document.body.classList.remove('light-mode');
      Object.entries(PRESET_THEMES[themeId]).forEach(([k, v]) => document.body.style.setProperty(k, v));
  } else if (savedThemes[themeId]) {
      document.body.classList.remove('light-mode'); 
      Object.entries(savedThemes[themeId]).forEach(([k, v]) => document.body.style.setProperty(k, v));
  } else {
      activeThemeId = 'default-dark';
      document.body.classList.remove('light-mode');
  }
  syncThemePickers();
}

function populateThemeDropdown() {
  const select = document.getElementById("theme-selector");
  if (!select) return;
  select.innerHTML = `<option value="default-dark">🌙 Default Dark</option><option value="default-light">☀️ Default Light</option>`;
  Object.keys(PRESET_THEMES).forEach(tName => select.insertAdjacentHTML('beforeend', `<option value="${tName}">✨ ${tName}</option>`));
  Object.keys(savedThemes).forEach(tName => select.insertAdjacentHTML('beforeend', `<option value="${tName}">🎨 ${tName}</option>`));
  select.value = activeThemeId;
  document.getElementById("delete-theme-btn").style.display = (activeThemeId.startsWith('default-') || PRESET_THEMES[activeThemeId]) ? 'none' : 'block';
}

function syncThemePickers() {
  const styles = getComputedStyle(document.body);
  THEME_VARS.forEach(v => {
    const picker = document.getElementById(`color-${v}`);
    if (picker) picker.value = styles.getPropertyValue(`--${v}`).trim() || '#000000';
  });
}

// --- OPTIMIZED CACHING ENGINE ---
async function syncLists(force = false) {
  if (!activeProfile) return;
  if (!force && listsSynced) return; 

  const [allowRes, denyRes] = await Promise.all([
    browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "allowlist", action: "list" }),
    browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType: "denylist", action: "list" })
  ]).catch(() => [null, null]);
  
  currentAllowlist = new Set((allowRes?.data || []).map(d => d.id));
  currentDenylist = new Set((denyRes?.data || []).map(d => d.id));
  listsSynced = true;
}

async function updateDashboardTabInfo() {
  const domainInput = document.getElementById("domain-input");
  const [tab] = await browser.tabs.query({ active: true, currentWindow: true });
  
  if (tab && tab.url) {
    if (document.activeElement !== domainInput) {
        try { domainInput.value = new URL(tab.url).hostname; } catch (e) { domainInput.value = "Invalid URL"; }
    }
  } else if (document.activeElement !== domainInput) {
    domainInput.value = "Invalid URL";
  }

  if (tab && tab.id) {
    const tabStats = await browser.runtime.sendMessage({ type: "GET_TAB_STATS", tabId: tab.id }).catch(() => null);
    const uDomains = tabStats?.domains?.length || 0;
    const score = document.getElementById("privacy-score");
    score.textContent = uDomains === 0 ? "-" : uDomains <= 5 ? "A+" : uDomains <= 15 ? "B" : uDomains <= 30 ? "C" : "F";
    score.style.color = uDomains === 0 ? "var(--text-muted)" : uDomains <= 5 ? "#28a745" : uDomains <= 15 ? "#8db600" : uDomains <= 30 ? "#f39c12" : "#dc3545";

    document.getElementById("tab-log").innerHTML = uDomains 
      ? tabStats.domains.map(d => `<div style="padding: 6px 8px; border-bottom: 1px solid var(--border-color); cursor: pointer; transition: background 0.2s;" class="tab-log-item" data-set-domain="${escapeHTML(d)}" title="Set as Target Domain">${escapeHTML(d)}</div>`).join('') 
      : "<div style='padding: 10px; color: var(--text-muted); text-align: center;'>No requests intercepted yet.</div>";
  }
}

async function initializeApp() {
  const { apiKey, autoRefreshDefault } = await browser.storage.local.get(["apiKey", "autoRefreshDefault"]);
  isAutoRefreshDefault = autoRefreshDefault || false;

  if (!apiKey) {
    document.querySelector('.tab-btn[data-tab="settings"]').click();
    return;
  }

  const profileStatus = document.getElementById("profile-status");
  let stored = await browser.storage.local.get(["activeProfile", "activeProfileName"]);
  activeProfile = stored.activeProfile;

  if (!activeProfile) {
    profileStatus.textContent = "Profile: Detecting live...";
    const pData = await browser.runtime.sendMessage({ type: "GET_PROFILE" }).catch(() => null);
    if (pData) { activeProfile = pData.id; stored.activeProfileName = pData.name; }
  }

  profileStatus.textContent = activeProfile ? `Active Profile: ${stored.activeProfileName || activeProfile}` : "Profile: Auto-detect failed. Set manually in Options.";

  await syncLists(); 
  await updateDashboardTabInfo(); 

  const executeAction = async (listType) => {
    const domainInput = document.getElementById("domain-input");
    const domain = domainInput.value.trim();
    if (!domain || !activeProfile) return alert("Domain or Profile missing.");
    
    if (listType === 'allowlist') currentAllowlist.add(domain);
    else currentDenylist.add(domain);

    const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action: "add" });
    if (res && res.success) {
      domainInput.style.borderColor = listType === 'allowlist' ? "#28a745" : "#dc3545";
      syncLists(true); 
      if (document.getElementById('tab-logs').classList.contains('active')) renderLogs();
    } else {
      if (listType === 'allowlist') currentAllowlist.delete(domain);
      else currentDenylist.delete(domain);
      alert(res?.error || "Failed to submit domain.");
    }
  };

  document.getElementById("allow-btn").onclick = () => executeAction("allowlist");
  document.getElementById("deny-btn").onclick = () => executeAction("denylist");
  document.getElementById("snooze-btn").onclick = async () => {
    const domainInput = document.getElementById("domain-input");
    const domain = domainInput.value.trim();
    if (!domain || !activeProfile) return;
    
    currentAllowlist.add(domain); 
    const res = await browser.runtime.sendMessage({ type: "TEMP_ALLOW", profileId: activeProfile, domain }).catch(() => ({success: false}));
    if (res && res.success) {
      domainInput.style.borderColor = "#f39c12";
      syncLists(true); 
    }
  };

  if (activeProfile) {
    browser.runtime.sendMessage({ type: "GET_ANALYTICS", profileId: activeProfile }).then(s => {
      document.getElementById("stat-total").textContent = (s?.data?.queries || 0).toLocaleString();
      document.getElementById("stat-blocked").textContent = (s?.data?.blockedQueries || 0).toLocaleString();
    }).catch(() => {});
  }
}

document.getElementById("log-search").addEventListener("input", renderLogs);
document.querySelectorAll('#log-filters input').forEach(cb => cb.addEventListener("change", renderLogs));

document.getElementById("auto-refresh-btn").onclick = () => {
  const isActive = autoRefreshInterval !== null;
  toggleAutoRefresh(!isActive);
};

function toggleAutoRefresh(enable) {
  const btn = document.getElementById("auto-refresh-btn");
  if (enable) {
    btn.classList.replace("btn-dark", "btn-secondary");
    btn.textContent = "▶️ Auto";
    loadNativeLogs(); 
    autoRefreshInterval = setInterval(loadNativeLogs, 5000); 
  } else {
    btn.classList.replace("btn-secondary", "btn-dark");
    btn.textContent = "⏸️ Auto";
    clearInterval(autoRefreshInterval);
    autoRefreshInterval = null;
  }
}

async function loadNativeLogs() {
  if (!activeProfile) return;
  const logs = await browser.runtime.sendMessage({ type: "GET_LOGS", profileId: activeProfile }).catch(() => null);
  if (logs && logs.data) {
    cachedLogs = logs.data;
    renderLogs();
  }
}

const getMatch = (domain, listSet) => {
  if (listSet.has(domain)) return domain;
  const parts = domain.split('.');
  for (let i = 1; i < parts.length - 1; i++) {
    const root = parts.slice(i).join('.');
    if (listSet.has(root)) return root;
  }
  return null;
};

function renderLogs() {
  const container = document.getElementById("logs-container");
  if (cachedLogs.length === 0) return container.innerHTML = "<div style='text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.9em;'>No logs found.</div>";

  const textFilter = document.getElementById("log-search").value.toLowerCase();
  const checkedFilters = Array.from(document.querySelectorAll('#log-filters input:checked')).map(cb => cb.value);

  const html = cachedLogs.filter(log => {
    const reqDomain = log.domain || log.name || log.qname || log.url || '';
    const deviceName = log.device?.name || log.device?.model || log.device?.localIp || log.device?.id || log.clientIp || '';
    const searchable = `${reqDomain} ${deviceName} ${log.clientIp || ''}`.toLowerCase();
    if (textFilter && !searchable.includes(textFilter)) return false;

    const isLiveAllowlisted = getMatch(reqDomain, currentAllowlist) !== null;
    const isLiveDenylisted = getMatch(reqDomain, currentDenylist) !== null;

    const isGeneralAllowed = log.status === 'allowed' && !isLiveAllowlisted;
    const isGeneralBlocked = log.status === 'blocked' && !isLiveDenylisted;

    let show = false;
    if (isGeneralAllowed && checkedFilters.includes('status:allowed')) show = true;
    if (isGeneralBlocked && checkedFilters.includes('status:blocked')) show = true;
    if (isLiveAllowlisted && checkedFilters.includes('reason:allowlist')) show = true;
    if (isLiveDenylisted && checkedFilters.includes('reason:denylist')) show = true;
    
    return show;
  }).map(log => {
    const reqDomain = log.domain || log.name || log.qname || log.url || 'Unknown Target';
    const allowedEntry = getMatch(reqDomain, currentAllowlist);
    const blockedEntry = getMatch(reqDomain, currentDenylist);
    
    const isLiveAllowlisted = allowedEntry !== null;
    const isLiveDenylisted = blockedEntry !== null;

    let statusDisplay = log.status === 'blocked' ? 'BLOCKED' : 'ALLOWED';
    if (isLiveDenylisted) statusDisplay = 'DENYLIST';
    if (isLiveAllowlisted) statusDisplay = 'ALLOWLIST';

    const color = (statusDisplay === 'BLOCKED' || statusDisplay === 'DENYLIST') ? '#dc3545' : '#28a745';
    const deviceName = log.device?.name || log.device?.model || log.device?.localIp || log.device?.id || log.clientIp || 'Unnamed';
    
    let timeString = '--:--:--';
    if (log.timestamp) {
       try { timeString = new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch(e){}
    }
    
    const protocol = log.protocol || '';
    const client = log.client || '';
    const os = log.os || '';
    const metaArray = [protocol, client, os].filter(Boolean);
    const metaString = metaArray.length > 0 ? metaArray.join(', ') : 'DNS';

    const reasonName = log.reasons?.map(r => r?.name || r?.id || String(r)).join(', ') || '';
    const hoverAttr = reasonName && !isLiveAllowlisted && !isLiveDenylisted 
      ? `title="Matched: ${escapeHTML(reasonName)}" style="cursor: help; border-bottom: 1px dotted ${color}; padding-bottom: 1px;"` 
      : '';

    const allowText = allowedEntry === reqDomain ? "Remove Allow" : `Remove Allow (${escapeHTML(allowedEntry)})`;
    const blockText = blockedEntry === reqDomain ? "Remove Block" : `Remove Block (${escapeHTML(blockedEntry)})`;

    return `
      <div class="log-row" style="color: ${color};">
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; width: 100%;">
          <div style="font-size: 0.75em; color: var(--text-muted); display: flex; gap: 10px; flex-wrap: wrap;">
            <span>🕒 ${timeString}</span>
            <span>📱 ${escapeHTML(deviceName)}</span>
            <span>⚙️ ${escapeHTML(metaString)}</span>
          </div>
          <div style="display: flex; align-items: center; white-space: nowrap; margin-left: auto; padding-left: 10px;">
            <span style="font-size: 0.8em; font-weight: bold; text-transform: uppercase;" ${hoverAttr}>${statusDisplay}</span>
            <div class="kebab-menu" title="Actions">
              &#8942;
              <div class="kebab-content">
                <button style="color: var(--text-main);" data-find="${escapeHTML(reqDomain)}">🔍 Find Entry</button>
                ${isLiveAllowlisted 
                  ? `<button style="color: #dc3545;" data-log-action="delete" data-list="allowlist" data-domain="${escapeHTML(allowedEntry)}">${allowText}</button>`
                  : `<button style="color: #28a745;" data-log-action="add" data-list="allowlist" data-domain="${escapeHTML(reqDomain)}">Allow</button>`
                }
                ${isLiveDenylisted
                  ? `<button style="color: #4facf7;" data-log-action="delete" data-list="denylist" data-domain="${escapeHTML(blockedEntry)}">${blockText}</button>`
                  : `<button style="color: #dc3545;" data-log-action="add" data-list="denylist" data-domain="${escapeHTML(reqDomain)}">Block</button>`
                }
              </div>
            </div>
          </div>
        </div>
        <div class="domain-copy" data-copy="${escapeHTML(reqDomain)}" title="Copy to clipboard" style="font-weight: bold; font-size: 0.95em; word-break: break-all; margin-top: 2px;">
          ${escapeHTML(reqDomain)}
        </div>
      </div>
    `;
  }).join('');

  container.innerHTML = html || "<div style='text-align: center; padding: 20px; color: var(--text-muted); font-size: 0.9em;'>No logs match current filters.</div>";
}

async function handleLogAction(listType, domain, action, btnEl) {
  btnEl.textContent = "...";
  
  if (listType === 'allowlist') {
    if (action === 'add') currentAllowlist.add(domain);
    else currentAllowlist.delete(domain);
  } else {
    if (action === 'add') currentDenylist.add(domain);
    else currentDenylist.delete(domain);
  }
  renderLogs(); 

  const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action });
  if (res && res.success) {
    syncLists(true); 
  } else {
    if (listType === 'allowlist') {
      if (action === 'add') currentAllowlist.delete(domain);
      else currentAllowlist.add(domain);
    } else {
      if (action === 'add') currentDenylist.delete(domain);
      else currentDenylist.add(domain);
    }
    renderLogs();
    btnEl.textContent = "Error"; btnEl.title = res?.error || "API Error";
    setTimeout(() => renderLogs(), 1500); 
  }
}

async function findInLists(searchDomain) {
  document.querySelector('.tab-btn[data-tab="lists"]').click();
  const container = document.getElementById("list-items-container");
  container.innerHTML = "<div style='padding:15px; text-align:center; font-size: 0.9em; color: var(--text-muted);'>Searching cache...</div>";
  const getRoot = (d) => { const p = d.split('.'); return p.length > 2 ? p.slice(-2).join('.') : d; };
  const rootDomain = getRoot(searchDomain);
  await syncLists(); 
  let foundType = null; let foundTarget = null;
  if (currentAllowlist.has(searchDomain)) { foundType = 'allowlist'; foundTarget = searchDomain; }
  else if (currentDenylist.has(searchDomain)) { foundType = 'denylist'; foundTarget = searchDomain; }
  else if (currentAllowlist.has(rootDomain)) { foundType = 'allowlist'; foundTarget = rootDomain; }
  else if (currentDenylist.has(rootDomain)) { foundType = 'denylist'; foundTarget = rootDomain; }
  if (foundType) {
    document.getElementById("list-type-select").value = foundType;
    document.getElementById("list-search-input").value = foundTarget;
    loadManagerList();
  } else {
    document.getElementById("list-search-input").value = searchDomain;
    loadManagerList();
    alert(`No match found for ${searchDomain} or ${rootDomain} in either list.`);
  }
}

document.getElementById("list-type-select").onchange = () => {
  document.getElementById("list-search-input").value = ""; 
  loadManagerList(); 
};
document.getElementById("list-search-input").addEventListener("input", renderManagerList);

document.getElementById("list-add-btn").onclick = async () => {
  const domain = document.getElementById("list-new-domain").value.trim();
  const listType = document.getElementById("list-type-select").value;
  if (domain && activeProfile) {
    if (listType === 'allowlist') currentAllowlist.add(domain);
    else currentDenylist.add(domain);
    document.getElementById("list-new-domain").value = "";
    loadManagerList(); 

    const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action: "add" });
    if(res && res.success) syncLists(true);
    else alert(res?.error || "Failed to save domain to API.");
  }
};

async function loadManagerList(force = false) {
  const listType = document.getElementById("list-type-select").value;
  const container = document.getElementById("list-items-container");
  
  if (!activeProfile) return;

  if (!force && listsSynced) {
    const targetSet = listType === 'allowlist' ? currentAllowlist : currentDenylist;
    cachedListItems = Array.from(targetSet).map(id => ({ id }));
    renderManagerList();
    return;
  }

  container.innerHTML = "<div style='padding:15px; text-align:center; font-size: 0.9em; color: var(--text-muted);'>Loading API...</div>";
  
  const res = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, action: "list" });
  if (res && res.data) {
    cachedListItems = res.data;
    if (listType === 'allowlist') currentAllowlist = new Set(cachedListItems.map(d => d.id));
    if (listType === 'denylist') currentDenylist = new Set(cachedListItems.map(d => d.id));
    listsSynced = true;
  } else {
    cachedListItems = [];
  }
  renderManagerList();
}

function renderManagerList() {
  const container = document.getElementById("list-items-container");
  const query = document.getElementById("list-search-input").value.toLowerCase();
  
  if (cachedListItems.length === 0) {
    container.innerHTML = "<div style='padding:15px; text-align:center; color: var(--text-muted); font-size: 0.9em;'>List is empty.</div>";
    return;
  }

  const filtered = cachedListItems.filter(item => item.id.toLowerCase().includes(query));

  if (filtered.length === 0) {
    container.innerHTML = "<div style='padding:15px; text-align:center; color: var(--text-muted); font-size: 0.9em;'>No matches found.</div>";
    return;
  }

  // PERFORMANCE: Soft Render Cap
  const RENDER_LIMIT = 100;
  const itemsToRender = filtered.slice(0, RENDER_LIMIT);

  let html = itemsToRender.map(item => `
    <div class="list-item">
      <span style="word-break: break-all; margin-right: 10px;">${escapeHTML(item.id)}</span>
      <button style="width: auto; padding: 4px 8px; font-size: 0.85em;" class="btn-deny" data-delete="${escapeHTML(item.id)}">❌</button>
    </div>
  `).join('');

  if (filtered.length > RENDER_LIMIT) {
    html += `<div style="text-align:center; padding: 15px; color: var(--text-muted); font-size: 0.85em;">...and ${filtered.length - RENDER_LIMIT} more hidden.<br>Use search to filter specific domains.</div>`;
  }

  container.innerHTML = html;
}

async function deleteListItem(domain) {
  const listType = document.getElementById("list-type-select").value;
  
  if (listType === 'allowlist') currentAllowlist.delete(domain);
  else currentDenylist.delete(domain);
  loadManagerList(); 

  const success = await browser.runtime.sendMessage({ type: "MANAGE_DOMAIN", profileId: activeProfile, listType, domain, action: "delete" });
  if (res && res.success) syncLists(true);
  else alert(res?.error || "Failed to delete from API.");
}

const telemetryList = ["windows", "apple", "xiaomi", "sonos", "samsung", "roku", "alexa", "huawei"];
const servicesList = ["tiktok", "facebook", "tinder", "instagram", "snapchat", "twitter", "youtube", "netflix", "discord", "reddit", "roblox"];

function loadToggles() {
  const renderList = (containerId, items, category) => {
    document.getElementById(containerId).innerHTML = items.map(item => `
      <div style="display:flex; justify-content:space-between; margin-bottom: 5px; font-size: 0.9em; align-items: center;">
        <span style="text-transform:capitalize;">${item}</span>
        <button style="width: auto; padding: 5px 10px; font-size: 0.85em;" class="btn-secondary" data-toggle-cat="${category}" data-toggle-id="${item}">Allow</button>
      </div>
    `).join('');
  };
  renderList("telemetry-list", telemetryList, "privacy/natives");
  renderList("services-list", servicesList, "parentalcontrol/services");
}

async function toggleService(category, id, btnEl) {
  const isBlocked = btnEl.classList.contains("btn-deny");
  const action = isBlocked ? "delete" : "add";
  btnEl.textContent = "...";
  const res = await browser.runtime.sendMessage({ type: "TOGGLE_SERVICE", profileId: activeProfile, category, id, action });
  if (res && res.success) {
    if (action === "add") { btnEl.classList.replace("btn-secondary", "btn-deny"); btnEl.textContent = "Blocked"; } 
    else { btnEl.classList.replace("btn-deny", "btn-secondary"); btnEl.textContent = "Allow"; }
  } else {
    btnEl.textContent = "Err";
  }
}

async function loadSettings() {
  const { apiKey, overrideProfileId, autoRefreshDefault, iconAction, regexBlocklist, enableLabs } = await browser.storage.local.get(["apiKey", "overrideProfileId", "autoRefreshDefault", "iconAction", "regexBlocklist", "enableLabs"]);
  
  document.getElementById("setting-api-key").value = apiKey || "";
  document.getElementById("setting-auto-refresh").checked = autoRefreshDefault || false;
  document.getElementById("setting-icon-action").value = iconAction || "popup";
  document.getElementById("setting-enable-labs").checked = enableLabs || false;
  document.getElementById("setting-regex-rules").value = regexBlocklist || "";
  
  document.getElementById("tab-btn-labs").style.display = enableLabs ? 'block' : 'none';
  
  if (apiKey) document.getElementById("setting-fetch-profiles").click();
  
  populateThemeDropdown();
}

document.getElementById("setting-fetch-profiles").onclick = async () => {
  const btn = document.getElementById("setting-fetch-profiles");
  btn.textContent = "⏳";
  const select = document.getElementById("setting-profile-select");
  const res = await browser.runtime.sendMessage({ type: "GET_PROFILES_LIST" });
  
  select.innerHTML = '<option value="">Auto-Detect (Default)</option>';
  if (res && res.data) {
    res.data.forEach(p => select.insertAdjacentHTML('beforeend', `<option value="${p.id}">${escapeHTML(p.name)} (${p.id})</option>`));
    const { overrideProfileId } = await browser.storage.local.get("overrideProfileId");
    if (overrideProfileId) select.value = overrideProfileId;
  }
  btn.textContent = "🔄";
};

// Main Options Save
document.getElementById("save-settings-btn").onclick = async () => {
  const key = document.getElementById("setting-api-key").value.trim();
  const override = document.getElementById("setting-profile-select").value;
  const autoRef = document.getElementById("setting-auto-refresh").checked;
  const icnAct = document.getElementById("setting-icon-action").value;
  const isLabsEnabled = document.getElementById("setting-enable-labs").checked;
  
  await browser.storage.local.set({ 
    apiKey: key, 
    overrideProfileId: override, 
    autoRefreshDefault: autoRef,
    iconAction: icnAct,
    enableLabs: isLabsEnabled
  });
  
  isAutoRefreshDefault = autoRef; 
  document.getElementById("tab-btn-labs").style.display = isLabsEnabled ? 'block' : 'none';
  
  document.getElementById("save-settings-btn").textContent = "✅ Saved Options!";
  setTimeout(() => { document.getElementById("save-settings-btn").textContent = "💾 Save Options"; }, 2000);
  initializeApp();
};

// Labs Tab Save
document.getElementById("save-labs-btn").onclick = async () => {
  const regexRules = document.getElementById("setting-regex-rules").value.trim();
  await browser.storage.local.set({ regexBlocklist: regexRules });
  
  const btn = document.getElementById("save-labs-btn");
  btn.textContent = "✅ Saved Labs!";
  setTimeout(() => { btn.textContent = "💾 Save Labs Settings"; }, 2000);
};

document.getElementById("download-logs-btn").onclick = async () => {
  if (!activeProfile) return alert("No active profile detected.");
  const btn = document.getElementById("download-logs-btn");
  btn.textContent = "⏳ Downloading...";
  
  const csvText = await browser.runtime.sendMessage({ type: "DOWNLOAD_LOGS_CSV", profileId: activeProfile });
  
  if (csvText) {
    const blob = new Blob([csvText], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `nextdns_logs_${activeProfile}_${new Date().toISOString().slice(0,10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    btn.textContent = "✅ Download Complete!";
  } else {
    btn.textContent = "❌ Download Failed";
  }
  setTimeout(() => { btn.textContent = "📥 Download Logs (CSV)"; }, 3000);
};

document.getElementById("wipe-logs-btn").onclick = async () => {
  if (!activeProfile) return alert("No active profile detected.");
  if (confirm("Are you absolutely sure you want to permanently delete all logs for this profile? This action cannot be undone.")) {
    const btn = document.getElementById("wipe-logs-btn");
    btn.textContent = "⏳ Wiping...";
    await browser.runtime.sendMessage({ type: "CLEAR_LOGS", profileId: activeProfile });
    cachedLogs = [];
    renderLogs();
    btn.textContent = "✅ Wiped!";
    setTimeout(() => { btn.textContent = "🗑️ Wipe All Logs"; }, 3000);
  }
};
