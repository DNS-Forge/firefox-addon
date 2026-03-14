# Changelog

All notable changes to the **DNS Forge** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

# Changelog

## [0.9.4] - 2026-03-14
### Added
- **API Key Auto-Extraction:** The extension now quietly extracts your API key when you visit the NextDNS account page, completely eliminating manual setup configuration.
- **Accordion Settings UI:** Grouped blocks into logical, collapsible `<details>` components for cleaner navigation.
- **Smart Toggle Engine:** The Blocks tab now fetches the real-time active state from NextDNS and dynamically binds it to the buttons so the UI accurately represents what is currently blocked.
- **Universal Blocks Map:** Expanded the Blocks tab to manage Security Feeds (Phishing, CSAM, Typosquatting), Disguised Trackers, and Parental Control filters directly via PATCH and POST API requests.

[... previous versions ...]

## [0.9.3] - 2026-03-13
### Security
- **Robust Alarm Logic:** Refactored `TEMP_ALLOW` alarm name parsing to use `URLSearchParams`, preventing execution breakage if a domain contains special characters like `::`.
- **Credential Hardening:** Removed global `cachedApiKey` in `background.js` to minimize sensitive plaintext data in memory.
- **Enhanced XSS Protection:** Standardized `escapeHTML()` sanitization across all log variables and list-rendering functions.
- **Least Privilege:** Moved `<all_urls>` to `optional_host_permissions`; users now grant full-site access only when enabling local blocking.

### Performance
- **Optimized Log Rendering:** Implemented `DocumentFragment` batching in `renderLogs()` to eliminate UI flickering during auto-refresh.
- **Parallel TLD Processing:** Refactored `content.js` to process TLD updates in parallel batches (concurrency: 10), reducing execution time from ~20s to <2s.
- **Smart webRequest Filtering:** Background listener is now attached dynamically only if regex rules are active, reducing browser idle overhead.
- **Asynchronous Tracking:** Switched tab domain tracking to use the non-blocking `tabs.onUpdated` API instead of blocking `webRequest`.

### Fixed
- **Logic Correction:** Resolved critical bug where `deleteListItem` referenced an undefined variable; fixed to validate API response via `res.success`.

---

## [0.9.2] - 2026-03-12
### Changed
- **Architecture:** Replaced `if/else` chains in `background.js` with a Message Dispatch Map.
- **Error Propagation:** API fetcher now bubbles granular network errors to the UI.

## [0.9.1] - 2026-03-11
### Added
- **Native Sidebar & Popout Support.**
- **Rebrand:** Officially renamed to "DNS Forge".
