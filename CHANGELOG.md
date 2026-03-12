# Changelog

All notable changes to the **NextDNS Manager** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.1] - 2026-03-11
### Added
- **Native Sidebar Support:** The extension can now be docked natively to the Firefox sidebar.
- **Popout Mode:** Added a responsive dedicated window mode for persistent monitoring.
- **Theme Manager:** Built a live-preview theme engine with 5 built-in presets (OLED Black, Dracula, Nord, Solarized Dark, Gruvbox) and custom theme saving.
- **Labs Tab:** Introduced a toggleable experimental tab for advanced features.
- **Local Regex Firewall UI:** Exposed the native browser request interception rules to the UI (inside the Labs tab).
- **Tab Tracking Pause:** Added a toggle to pause live tab request tracking for static research.
- **CI/CD Pipeline:** Fully integrated GitHub Actions workflow with Mozilla's `web-ext lint` and automated Jest testing.

### Changed
- **SPA Architecture:** Consolidated the entire extension into a unified, lightning-fast Single Page Application, handling views via internal DOM routing.
- **Optimistic Caching:** The List Manager now reads directly from local memory, resulting in instant 0ms tab switching and search filtering.
- **Render Limits:** Implemented a 100-item soft render limit to prevent DOM freezing when loading massive blocklists.
- **Test Suite:** Upgraded the Jest unit tests to support the new SPA DOM and removed outdated UI testing dependencies.
- **Package Management:** Shifted CI environment to use standard `npm install` resolving dynamically to `latest` mock library versions.

### Fixed
- **Security (XSS):** Implemented a universal `escapeHTML()` function to sanitize all NextDNS log variables (like spoofed device names) before rendering them in the DOM.
- **Manifest Validation:** Added a unique UUID (`{56fda99b-4dd4-4a4a-a413-00ff1c2cffd8}`) to `browser_specific_settings` to satisfy Mozilla's strict Manifest V3 requirements.

### Removed
- **Deprecated Files:** Deleted standalone `logs.html/js`, `manager.html/js`, and `options.html/js` files in favor of the new SPA routing.

---

## [0.9.0] - 2026-03-10
### Added
- **Bulk Add Domains:** Implemented an input area to add multiple domains to the Allowlist/Denylist simultaneously.
- **Background Filtering Engine:** Added `localRegexRules` logic to the background service worker to intercept tracking requests natively before they reach NextDNS.
- **One-Click Toggles:** Created the "Blocks" UI to instantly toggle OS telemetry (Windows, Apple, Xiaomi) and common apps/services (TikTok, Tinder, Meta).

### Changed
- **API Rate Limiting:** Added a 500ms delay to iterative bulk-add operations to prevent NextDNS API rejection.
- **Jest Implementation:** Built the initial test suites (`allowlist.test.js` and `denylist.test.js`) to verify background messaging functionality.

---

## [0.8.0] - 2026-03-09
### Added
- **Live Logs:** Integrated the NextDNS logs API to fetch and render raw DNS queries with client IP and device metadata.
- **List Manager:** Integrated NextDNS Allowlist and Denylist APIs for direct domain manipulation.
- **Multi-Page UI:** Built the initial UI framework utilizing separate HTML/JS files linked via a top navigation bar.
- **Profile Auto-Detect:** Added logic to ping the API and automatically resolve the user's active configuration profile if multiple exist.
- **Snooze Function:** Added a 5-minute temporary allow button for blocked domains.

### Fixed
- Addressed an issue where background scripts would lose the API key state during browser suspension.

---

## [0.1.0] - 2026-03-08
### Added
- **Project Scaffold:** Initialized the repository and basic directory structure.
- **Manifest V3:** Drafted the initial `manifest.json` requesting `webRequest`, `webRequestBlocking`, and `storage` permissions.
- **Storage API:** Set up local browser storage for securely holding the NextDNS API key.
- **Dashboard Widget:** Created the basic popup UI structure to display a privacy grade and 24-hour query statistics.
