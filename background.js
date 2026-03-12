const API_BASE = "https://api.nextdns.io";
const TEST_URL = "https://test.nextdns.io/";

let tabDomains = {}; 
let blockedTabRequests = {}; 
let combinedRegexRule = null; // NEW: Single-pass Regex compiler
let cachedApiKey = null;      // NEW: In-memory API Key cache

const ALARM_PREFIX = "tempAllow::"; 

async function applyIconAction() {
  const { iconAction } = await browser.storage.local.get("iconAction");
  if (iconAction === "sidebar") {
    await browser.action.setPopup({ popup: "" });
  } else {
    await browser.action.setPopup({ popup: "popup.html" });
  }
}

browser.runtime.onInstalled.addListener((details) => {
  if (details.reason === "install") {
    browser.runtime.openOptionsPage();
  }
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

// NEW: Highly Optimized Regex Compiler
async function loadRegexRules() {
  const { regexBlocklist, enableLabs } = await browser.storage.local.get(["regexBlocklist", "enableLabs"]);
  if (enableLabs && regexBlocklist) {
    const rules = regexBlocklist.split('\n').filter(r => r.trim() !== '');
    if (rules.length > 0) {
      try {
        combinedRegexRule = new RegExp(rules.map(r => `(?:${r.trim()})`).join('|'), 'i');
      } catch (e) {
        console.error("Invalid Regex in NextDNS Manager Blocklist:", e);
        combinedRegexRule = null;
      }
    } else {
      combinedRegexRule = null;
    }
  } else {
    combinedRegexRule = null;
  }
}

browser.storage.onChanged.addListener((changes) => {
  if (changes.regexBlocklist || changes.enableLabs) loadRegexRules();
  if (changes.iconAction) applyIconAction(); 
  if (changes.apiKey) cachedApiKey = changes.apiKey.newValue || ""; 
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshProfile") {
    detectActiveProfile();
  } else if (alarm.name.startsWith(ALARM_PREFIX)) {
    const rest = alarm.name.slice(ALARM_PREFIX.length);
    const sepIdx = rest.indexOf("::");
    const profileId = rest.slice(0, sepIdx);
    const domain = rest.slice(sepIdx + 2);
    
    await manageDomain(profileId, "allowlist", domain, "delete");
  }
});

// --- Hybrid Firewall & Domain Tracker ---
browser.webRequest.onBeforeRequest.addListener(
  (details) => {
    const url = new URL(details.url);
    const domain = url.hostname;

    if (details.tabId >= 0) {
      if (!tabDomains[details.tabId]) tabDomains[details.tabId] = new Set();
      if (!blockedTabRequests[details.tabId]) blockedTabRequests[details.tabId] = 0;
      
      if (tabDomains[details.tabId].size < 1000) { 
        tabDomains[details.tabId].add(domain);
      }
    }

    if (combinedRegexRule && combinedRegexRule.test(details.url)) {
      console.log(`Locally blocked ${details.url}`);
      if (details.tabId >= 0) blockedTabRequests[details.tabId]++;
      return { cancel: true };
    }
    return { cancel: false };
  },
  { urls: ["<all_urls>"] },
  ["blocking"]
);

// NEW: Clear memory immediately upon tab navigation to stop bloating
browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url) {
    tabDomains[tabId] = new Set();
    blockedTabRequests[tabId] = 0;
  }
});

browser.tabs.onRemoved.addListener((tabId) => {
  delete tabDomains[tabId];
  delete blockedTabRequests[tabId];
});

// NEW: Stop querying browser storage on every network request
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
    if (action === 'add') {
      response = await fetch(endpoint, { method: 'POST', headers: headers, body: JSON.stringify({ id: domain }) });
    } else if (action === 'delete') {
      response = await fetch(`${endpoint}/${domain}`, { method: 'DELETE', headers: headers });
    } else if (action === 'list') {
      response = await fetch(endpoint, { method: 'GET', headers: headers });
      if (response.ok) return await response.json();
    }
    return response?.ok;
  } catch (error) { return false; }
}

async function fetchLogs(profileId) {
  const headers = await getHeaders();
  try { return await (await fetch(`${API_BASE}/profiles/${profileId}/logs`, { headers })).json(); } catch (e) { return { data: [] }; }
}

async function fetchAnalytics(profileId) {
  const headers = await getHeaders();
  try { return await (await fetch(`${API_BASE}/profiles/${profileId}/analytics/status`, { headers })).json(); } catch (e) { return { data: {} }; }
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
      } catch(e) { console.error("Failed to fetch profile names."); }
    }

    await browser.storage.local.set({ activeProfile: activeId, activeProfileName: profileName });
    return { id: activeId, name: profileName };
  }
  return null;
}

// --- API Message Router ---
browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === "MANAGE_DOMAIN") {
    manageDomain(message.profileId, message.listType, message.domain, message.action).then(sendResponse);
    return true;
  }
  if (message.type === "TEMP_ALLOW") {
    manageDomain(message.profileId, "allowlist", message.domain, "add").then((s) => { 
      if (s) browser.alarms.create(`${ALARM_PREFIX}${message.profileId}::${message.domain}`, { delayInMinutes: 5 }); 
      sendResponse(s); 
    });
    return true;
  }
  if (message.type === "GET_TAB_STATS") {
    sendResponse({ domains: Array.from(tabDomains[message.tabId] || []), blockedCount: blockedTabRequests[message.tabId] || 0 });
    return true;
  }
  if (message.type === "GET_LOGS") {
    fetchLogs(message.profileId).then(sendResponse);
    return true;
  }
  if (message.type === "GET_ANALYTICS") {
    fetchAnalytics(message.profileId).then(sendResponse);
    return true;
  }
  if (message.type === "GET_PROFILE") {
    detectActiveProfile().then(sendResponse);
    return true;
  }
  if (message.type === "CLEAR_LOGS") {
    getHeaders().then(h => fetch(`${API_BASE}/profiles/${message.profileId}/logs`, { method: 'DELETE', headers: h })).then(r => sendResponse(r.ok));
    return true;
  }
  if (message.type === "GET_PROFILES_LIST") {
    getHeaders().then(h => fetch(`${API_BASE}/profiles`, { headers: h })).then(r => r.json()).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message.type === "DOWNLOAD_LOGS_CSV") {
    getHeaders().then(h => fetch(`${API_BASE}/profiles/${message.profileId}/logs/download`, { headers: h }))
      .then(r => r.text()).then(sendResponse).catch(() => sendResponse(null));
    return true;
  }
  if (message.type === "TOGGLE_SERVICE") {
    getHeaders().then(h => {
      const url = `${API_BASE}/profiles/${message.profileId}/${message.category}`;
      if (message.action === "add") return fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ id: message.id, active: true }) });
      return fetch(`${url}/${message.id}`, { method: 'DELETE', headers: h });
    }).then(r => sendResponse(r.ok)).catch(() => sendResponse(false));
    return true;
  }
});
