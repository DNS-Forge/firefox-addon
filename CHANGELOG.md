# Changelog

All notable changes to the **DNS Forge** Firefox extension will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [0.9.2] - 2026-03-12
### Changed
- **Architecture (Code Smells):** Ripped out the massive `if/else` chain in `background.js` and replaced it with an optimized, highly scalable Message Dispatch Map.
- **Error Propagation:** The API fetcher no longer swallows network or format errors silently. Granular errors (e.g., "Invalid Domain Format") are now caught by the background script and bubbled up to the UI as alerts.
- **Cache-Only Lookup:** Optimized `findInLists` (via the Kebab menu) to exclusively query the local memory `Set`. It now executes in `0ms` and eliminates redundant API spam.

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
- **Rebrand:** Officially rebranded from "NextDNS Manager" to "DNS Forge".
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
