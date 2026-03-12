# 🛡️ DNS Forge (for NextDNS)

This Firefox extension integrates natively with the [NextDNS API](https://nextdns.io) and the dashboard interface to give users advanced control over their filtering rules, local web requests, and blocklists directly from the browser.

---

## 🚀 Key Features

### 🔍 Unified Dashboard (SPA)
- **Single Page Application:** Manage your dashboard, logs, lists, and settings from a single, lightning-fast interface without opening new browser tabs.
- **Pop-Out Window:** Pin the dashboard open in a dedicated floating window for continuous network monitoring.
- **Active Profile Syncing:** Detects your live profile from `test.nextdns.io` and maps it to your human-readable configuration name.
- **Page Actions:** Instantly Allow, Deny, or Temp-Allow (5 min snooze) the domain of the active tab.

### 📡 Live Network Logs
- **Auto-Refreshing Stream:** Toggle auto-refresh to watch your network traffic in real-time.
- **Rich Metadata:** Displays query time, device identity, routing protocol (e.g., DoH, CLI), and explicit status (Allowed, Blocked, Allowlist, Denylist).
- **Mutually Exclusive Filtering:** Instantly filter logs by status or explicit list matches without cross-contamination.
- **Kebab Actions:** Click the `⋮` menu on any log entry to instantly modify its access rules.

### 🗂️ Advanced List & Data Management
- **Instant Search:** Filter massive allowlists and denylists locally as you type.
- **Bulk Management:** Paste multiline lists of domains to automatically batch-add them.
- **CSV Log Exports:** Download your raw NextDNS logs directly to your local machine for archiving.
- **1-Click Blockers:** Instantly kill network access to major OS telemetry servers (Windows, Apple, Xiaomi) and apps (TikTok, Tinder, Meta).

### 🛡️ Hybrid Local Regex Filtering
- Block web requests locally *before* they hit the NextDNS resolver using custom Regex patterns.
- Saves bandwidth and provides granular blocking that DNS alone cannot achieve (e.g., matching URL paths).

### 🌍 Native Dashboard Integrations (Content Script)
Injected directly into the NextDNS Security Dashboard:
- **Enable/Disable ALL TLDs** – Bulk manage Top-Level Domains.
- **Backup & Restore** – Automatically backups your TLD configuration before making bulk changes.
- **Toggle List** – Collapses the massive active TLD list so the NextDNS dashboard remains usable.

---

## ⚙️ Settings & Configuration

- 🔑 **API Key Input** – Store your personal NextDNS API key securely.
- 💾 **Backup & Sync** – Export your custom Regex rules, notes, and preferences to a `.json` file for portability across browsers.
- 🧠 **Manual Profile Override** – Optionally lock the extension to a specific configuration ID.

---

## 🔧 Setup & Installation

1. Clone this repo.
2. Load the extension into Firefox:
   - Visit `about:debugging`
   - Click **"Load Temporary Add-on"**
   - Choose `manifest.json` from the root directory.
3. Open the extension popup, click **⚙️ Options**, and add your API Key.
