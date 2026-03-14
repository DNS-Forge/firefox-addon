const API_BASE = "https://api.nextdns.io";
const TEST_URL = "https://test.nextdns.io/";

let tabDomains = {}; 
let blockedTabRequests = {}; 
let combinedRegexRule = null;

const ALARM_PREFIX = "tempAllow?"; 

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

async function loadRegexRules() {
  const { regexBlocklist, enableLabs } = await browser.storage.local.get(["regexBlocklist", "enableLabs"]);
  if (enableLabs && regexBlocklist) {
    const rules = regexBlocklist.split('\n').filter(r => r.trim() !== '');
    if (rules.length > 0) {
      try { combinedRegexRule = new RegExp(rules.map(r => `(?:${r.trim()})`).join('|'), 'i'); } 
      catch (e) { combinedRegexRule = null; }
    } else combinedRegexRule = null;
  } else combinedRegexRule = null;
  updateWebRequestListeners();
}

function updateWebRequestListeners() {
  const isListening = browser.webRequest.onBeforeRequest.hasListener(blockingListener);
  if (combinedRegexRule && !isListening) {
    browser.webRequest.onBeforeRequest.addListener(
      blockingListener,
      { urls: ["<all_urls>"] },
      ["blocking"]
    );
  } else if (!combinedRegexRule && isListening) {
    browser.webRequest.onBeforeRequest.removeListener(blockingListener);
  }
}

function blockingListener(details) {
  if (combinedRegexRule && combinedRegexRule.test(details.url)) {
    if (details.tabId >= 0) blockedTabRequests[details.tabId]++;
    return { cancel: true };
  }
  return { cancel: false };
}

browser.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url) { tabDomains[tabId] = new Set(); blockedTabRequests[tabId] = 0; }
  if (changeInfo.status === 'loading' && tab.url) {
    try {
      const url = new URL(tab.url);
      if (!tabDomains[tabId]) tabDomains[tabId] = new Set();
      if (tabDomains[tabId].size < 500) tabDomains[tabId].add(url.hostname);
    } catch (e) {}
  }
});

browser.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === "refreshProfile") detectActiveProfile();
  else if (alarm.name.startsWith(ALARM_PREFIX)) {
    const params = new URLSearchParams(alarm.name.slice(ALARM_PREFIX.length));
    const profileId = params.get("p");
    const domain = params.get("d");
    if (profileId && domain) await manageDomain(profileId, "allowlist", domain, "delete");
  }
});

async function getHeaders() {
  const { apiKey } = await browser.storage.local.get("apiKey");
  return { "Content-Type": "application/json", "X-Api-Key": apiKey || "" };
}

async function manageDomain(profileId, listType, domain, action) {
  const headers = await getHeaders();
  const endpoint = `${API_BASE}/profiles/${profileId}/${listType}`;
  try {
    let response;
    if (action === 'add') response = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ id: domain }) });
    else if (action === 'delete') response = await fetch(`${endpoint}/${domain}`, { method: 'DELETE', headers });
    else if (action === 'list') {
      response = await fetch(endpoint, { method: 'GET', headers });
      if (response.ok) return await response.json();
      return { error: response.statusText };
    }
    return { success: response.ok };
  } catch (error) { return { success: false, error: "Network Error" }; }
}

async function detectActiveProfile() {
  const { overrideProfileId } = await browser.storage.local.get("overrideProfileId");
  let activeId = overrideProfileId;
  if (!activeId) {
    try {
      const response = await fetch(TEST_URL, { cache: 'no-store' });
      const data = await response.json();
      if (data && data.profile) activeId = data.profile;
    } catch (e) {}
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

const messageHandlers = {
  MANAGE_DOMAIN: async (msg) => await manageDomain(msg.profileId, msg.listType, msg.domain, msg.action),
  TEMP_ALLOW: async (msg) => {
    const res = await manageDomain(msg.profileId, "allowlist", msg.domain, "add");
    if (res.success) {
      const alarmName = `${ALARM_PREFIX}p=${encodeURIComponent(msg.profileId)}&d=${encodeURIComponent(msg.domain)}`;
      browser.alarms.create(alarmName, { delayInMinutes: 5 }); 
    }
    return res;
  },
  GET_TAB_STATS: async (msg) => ({ domains: Array.from(tabDomains[msg.tabId] || []), blockedCount: blockedTabRequests[msg.tabId] || 0 }),
  GET_LOGS: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { headers: h })).json(); } catch(e) { return { data: [] }; }
  },
  GET_ANALYTICS: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/analytics/status`, { headers: h })).json(); } catch(e) { return { data: {} }; }
  },
  GET_PROFILE: async () => await detectActiveProfile(),
  GET_PROFILES_LIST: async () => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles`, { headers: h })).json(); } catch(e) { return null; }
  },
  CLEAR_LOGS: async (msg) => {
    const h = await getHeaders();
    const r = await fetch(`${API_BASE}/profiles/${msg.profileId}/logs`, { method: 'DELETE', headers: h });
    return { success: r.ok };
  },
  DOWNLOAD_LOGS_CSV: async (msg) => {
    const h = await getHeaders();
    try { return await (await fetch(`${API_BASE}/profiles/${msg.profileId}/logs/download`, { headers: h })).text(); } catch(e) { return null; }
  },
  
  // --- NEW: Smart Batch Fetcher for all Blocks UI Tabs ---
  GET_ALL_SETTINGS: async (msg) => {
    const h = await getHeaders();
    try {
      const [sec, priv, par, serv, cat, nat] = await Promise.all([
        fetch(`${API_BASE}/profiles/${msg.profileId}/security`, { headers: h }).then(r=>r.json()),
        fetch(`${API_BASE}/profiles/${msg.profileId}/privacy`, { headers: h }).then(r=>r.json()),
        fetch(`${API_BASE}/profiles/${msg.profileId}/parentalcontrol`, { headers: h }).then(r=>r.json()),
        fetch(`${API_BASE}/profiles/${msg.profileId}/parentalcontrol/services`, { headers: h }).then(r=>r.json()),
        fetch(`${API_BASE}/profiles/${msg.profileId}/parentalcontrol/categories`, { headers: h }).then(r=>r.json()),
        fetch(`${API_BASE}/profiles/${msg.profileId}/privacy/natives`, { headers: h }).then(r=>r.json())
      ]);
      return { 
        success: true, 
        data: { 
          security: sec.data || {}, 
          privacy: priv.data || {}, 
          parentalcontrol: par.data || {},
          services: serv.data || [],
          categories: cat.data || [],
          natives: nat.data || []
        } 
      };
    } catch(e) { return { success: false, error: e.message }; }
  },

  // --- NEW: Smart Method Dispatcher (PATCH vs POST/DELETE) ---
  TOGGLE_SETTING: async (msg) => {
    const h = await getHeaders();
    const { profileId, category, id, action, settingType } = msg;
    const url = `${API_BASE}/profiles/${profileId}/${category}`;
    
    try {
      let r;
      if (settingType === 'boolean') {
        // PATCH booleans directly to the root endpoint
        const body = {};
        body[id] = (action === "add");
        r = await fetch(url, { method: 'PATCH', headers: h, body: JSON.stringify(body) });
      } else {
        // POST/DELETE lists to specific sub-endpoints
        if (action === "add") {
          r = await fetch(url, { method: 'POST', headers: h, body: JSON.stringify({ id: id, active: true }) });
        } else {
          r = await fetch(`${url}/${id}`, { method: 'DELETE', headers: h });
        }
      }
      return { success: r.ok };
    } catch(e) { return { success: false, error: e.message }; }
  }
};

browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handler = messageHandlers[message.type];
  if (handler) {
    handler(message).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});