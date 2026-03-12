const API_BASE = "https://api.nextdns.io";
const TEST_URL = "https://test.nextdns.io/";

let tabDomains = {}; 
let blockedTabRequests = {}; 
let combinedRegexRule = null;
let cachedApiKey = null;

const ALARM_PREFIX = "tempAllow::"; 

async function applyIconAction() {
  const { iconAction } = await browser.storage.local.get("iconAction");
  if (iconAction === "sidebar") await browser.action.setPopup({ popup: "" });
  else await browser.action.setPopup({ popup: "popup.html" });
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") browser.runtime.openOptionsPage();
  browser.alarms.create("refreshProfile", { periodInMinutes: 15 });
  detectActiveProfile();
  loadRegexRules();
  applyIconAction();
});

browser.runtime.onStartup.addListener(() => {
  applyIconAction();
  loadRegexRules();
});

browser.action.onClicked.addListener(() => {
  browser.sidebarAction.open();
});

async function loadRegexRules() {
  const { regexBlocklist, enableLabs } = await browser.storage.local.get(["regexBlocklist", "enableLabs"]);
  if (enableLabs && regexBlocklist) {
    const rules = regexBlocklist.split('\n').filter(r => r.trim() !== '');
    if (rules.length > 0) {
      try { combinedRegexRule = new RegExp(rules.map(r => `(?:${r.trim()})`).join('|'), 'i'); } 
      catch (e) { console.error("Invalid Regex in DNS Forge Blocklist:", e); combinedRegexRule = null; }
    } else combinedRegexRule = null;
  } else combinedRegexRule = null;
}

browser.storage.onChanged.addListener((changes) => {
  if (changes.regexBlocklist || changes.enableLabs) loadRegexRules();
  if (changes.iconAction) applyIconAction(); 
  if (changes.apiKey) cachedApiKey = changes.apiKey.newValue || ""; 
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshProfile") detectActiveProfile();
  else if (alarm.name.startsWith(ALARM_PREFIX)) {
    const rest = alarm.name.slice(ALARM_PREFIX.length);
    const sepIdx = rest.indexOf("::");
    await manageDomain(rest.slice(0, sepIdx), "allowlist", rest.slice(sepIdx + 2), "delete");
  }
});

browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url);
    if (details.tabId >= 0) {
      if (!tabDomains[details.tabId]) tabDomains[details.tabId] = new Set();
      if (!blockedTabRequests[details.tabId]) blockedTabRequests[details.tabId] = 0;
      if (tabDomains[details.tabId].size < 1000) tabDomains[details.tabId].add(url.hostname);
    }
    if (combinedRegexRule && combinedRegexRule.test(details.url)) {
      if (details.tabId >= 0) blockedTabRequests[details.tabId]++;
      return { cancel: true };
    }
    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) { tabDomains[tabId] = new Set(); blockedTabRequests[tabId] = 0; }
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabDomains[tabId];
  delete blockedTabRequests[tabId];
});

async function getHeaders() {
  if (cachedApiKey === null) {
    const { apiKey } = await browser.storage.local.get("apiKey");
    cachedApiKey = apiKey || "";
  }
  return { "Content-Type": "application/json", "X-Api-Key": cachedApiKey };
}

async function manageDomain(profileId, listType, domain, action) {
  const headers = await getHeaders();
  const endpoint = `${API_BASE}/profiles/${profileId}/${listType}`;
  try {
    let response;
    if (action === 'add') response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify({ id: domain }) });
    else if (action === 'delete') response = await fetch(`${endpoint}/${domain}`, { method: 'DELETE', headers: headers });
    else if (action === 'list') {
      response = await fetch(endpoint, { method: 'GET', headers: headers });
      if (response.ok) return await response.json();
      return { error: response.statusText };
    }
    
    if (response.ok) return { success: true };
    
    const errorData = await response.json().catch(() => ({}));
    const errText = errorData?.errors?.[0]?.detail || errorData?.error || response.statusText || "API Error";
    return { success: false, error: errText };
  } catch (error) { return { success: false, error: "Network Error" }; }
}

async function fetchLogs(profileId) {
  const h = await getHeaders();
  try { return await (await fetch(`${API_BASE}/profiles/${profileId}/logs`, { headers: h })).json(); } catch (e) { return { data: [] }; }
}

async function fetchAnalytics(profileId) {
  const h = await getHeaders();
  try { return await (await fetch(`${API_BASE}/profiles/${profileId}/analytics/status`, { headers: h })).json(); } catch (e) { return { data: {} }; }
}

async function detectActiveProfile() {
  const { overrideProfileId } = await browser.storage.local.get("overrideProfileId");
  let activeId = overrideProfileId;
  if (!activeId) {
    try {
      const response = await fetch(TEST_URL, { cache: 'no-store' });
      const data = await response.json();
      if (data && data.profile) activeId = data.profile;
    } catch (e) { console.log("Auto-detect ping failed."); }
  }
  if (activeId) {
    let profileName = activeId; 
    const headers = await getHeaders();
    if (headers["X-Api-Key"]) {
      try {
        const pRes = await fetch(`${API_BASE}/profiles`, { headers });
        if (pRes.ok) {
          const pData = await pRes.json();
          const matchedProfile = pData.data.find(p => p.id === activeId);
          if (matchedProfile) profileName = `${matchedProfile.name} (${activeId})`;
        }
      } catch(e) {}
    }
    await browser.storage.local.set({ activeProfile: activeId, activeProfileName: profileName });
    return { id: activeId, name: profileName };
  }
  return null;
}

// --- OPTIMIZED DISPATCH MAP ---
const messageHandlers = {
  MANAGE_DOMAIN: async (msg) => await manageDomain(msg.profileId, msg.listType, msg.domain, msg.action),
  TEMP_ALLOW: async (msg) => {
    const res = await manageDomain(msg.profileId, "allowlist", msg.domain, "add");
    if (res.success) browser.alarms.create(`${ALARM_PREFIX}${msg.profileId}::${msg.domain}`, { delayInMinutes: 5 }); 
    return res;
  },
  GET_TAB_STATS: async (msg) => ({ domains: Array.from(tabDomains[msg.tabId] || []), blockedCount: blockedTabRequests[msg.tabId] || 0 }),
  GET_LOGS: async (msg) => await fetchLogs(msg.profileId),
  GET_ANALYTICS: async (msg) => await fetchAnalytics(msg.profileId),
  GET_PROFILE: async () => await detectActiveProfile(),
  CLEAR_LOGS: async (msg) => {
    const h = await getHeaders();
    const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { method: 'DELETE', headers: h });
    return { success: r.ok };
  },
  GET_PROFILES_LIST: async () => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles`, { headers: h })).json(); } catch(e) { return null; }
  },
  DOWNLOAD_LOGS_CSV: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/logs/download`, { headers: h })).text(); } catch(e) { return null; }
  },
  TOGGLE_SERVICE: async (msg) => {
    const h = await getHeaders();
    const url = `${API_BASE}/profiles/${msg.profileId}/${msg.category}`;
    try {
      const r = msg.action === "add" 
        ? await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ id: msg.id, active: true }) })
        : await fetch(`${url}/${msg.id}`, { method: 'DELETE', headers: h });
      return { success: r.ok };
    } catch(e) { return { success: false, error: e.message }; }
  }
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message).then(sendResponse).catch(err => {
      console.error(`[DNS Forge] Error handling ${message.type}:`, err);
      sendResponse({ success: false, error: err.message });
    });
    return true;
  }
});
