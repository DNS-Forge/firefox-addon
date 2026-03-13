# 🛡️ DNS Forge (for NextDNS)

This Firefox extension integrates natively with the [NextDNS API](https://nextdns.io) to provide advanced control over filtering rules, network logs, and local request interception.

---

## 🚀 Key Features

### 🔍 Unified Dashboard (SPA)
- **Single Page Application:** Manage logs, lists, and settings from a single interface.
- **Active Profile Syncing:** Automatically detects your live profile from `test.nextdns.io`.
- **Page Actions:** Instantly Allow, Deny, or Temp-Allow (5 min snooze) domains from the active tab.

### 📡 Live Network Logs (v0.9.3 Optimized)
- **Flicker-Free Rendering:** Optimized DOM batching ensures a smooth experience even during high-traffic monitoring.
- **Rich Metadata:** Displays device identity, routing protocol, and timestamp.
- **Kebab Actions:** Quick-access menu on any log entry to modify access rules instantly.

### 🗂️ Advanced List & Data Management
- **Instant Search:** Locally filter massive allowlists and denylists as you type.
- **Bulk Management:** Batch-add domains by pasting multiline lists.
- **1-Click Blockers:** Kill network access to major OS telemetry (Windows, Apple, etc.) and specific apps.

### 🛡️ Security & Privacy
- **Hardened Credential Handling:** API keys are retrieved on-demand and kept out of persistent memory.
- **Robust Alarms:** Timer-based temporary allow-listing is handled via safe URL parameter parsing to prevent domain-injection bugs.
- **XSS Sanitization:** Comprehensive HTML escaping protects your dashboard from malicious domain metadata.

---

## ⚙️ Setup & Installation

1. Clone this repository.
2. Visit `about:debugging` in Firefox.
3. Click **"This Firefox"** -> **"Load Temporary Add-on"**.
4. Select `manifest.json` from the root directory.
5. Open the extension, navigate to **⚙️ Options**, and add your NextDNS API Key.

## 🧪 Labs Features
Enable the **Labs Tab** in settings to access:
- **Local Regex Firewall:** Block web requests locally before they reach the DNS resolver.
- **Tab Tracking Pause:** Pause live monitoring for static research.

---

## License
MIT License - see LICENSE for details.
