> **Historical research only — not part of the current HAPP Browser release.** The current `main` branch is a standalone Firefox diagnostic extension. It does not control HAPP Desktop, configure Firefox proxy settings, or synchronize subscriptions. The proof-of-concept described below belongs to a separate research branch and must not be treated as a supported feature of the current product.

# HAPP Desktop integration research

Status: Firefox SOCKS5 proof of concept implemented on the research branch. HAPP endpoint and Windows routing behavior remain unverified.

## Goal

Route Firefox traffic through an already-running HAPP Desktop connection while leaving traffic from other operating-system applications unchanged.

## Findings

### 1. HAPP documents SOCKS5 and HTTP proxy sharing

The official HAPP documentation describes an **Allow LAN Connections** setting under Advanced Settings. After enabling it and connecting to a server, HAPP displays a current IP address, a SOCKS5 port (example: `10808`) and an HTTP port (example: `10809`).

The same official guide explicitly documents configuring Firefox with the displayed IP address and SOCKS5 port:

- Official guide: https://www.happ.su/main/ru/faq/local-network-connections
- English source: https://github.com/HappDev/happ_su/blob/main/faq/local-network-connections.md

Important: these port numbers are examples, not guaranteed defaults.

The guide describes LAN sharing. It does **not** establish that HAPP exposes a loopback-only listener, nor does it document a supported local control API for reading profiles or starting/stopping connections. Do not assume either capability.

The official guide explicitly labels this feature as sharing the VPN connection with devices on the same LAN. It instructs users to configure Firefox with the displayed **Current IP** and SOCKS5 port. Therefore, this documented path is a LAN-listener path; the guide does not say that the listener is bound only to loopback. Treat enabling it as potentially exposing a proxy to the local network, and verify the actual bind address/firewall behavior before recommending it.

### 2. Desktop release notes reveal configurable inbound ports

The public desktop repository contains only a README and a release metadata file; it does not publish the desktop application's implementation source. Its release history is still useful:

- Version 4.6.1 notes that changing SOCKS/HTTP ports while connected takes effect after reconnecting.
- Version 4.8.1 notes that subscriptions can specify SOCKS5 and HTTP proxy ports, and that the two ports cannot be identical.

This means the extension must not assume that a port is permanently fixed. A port can be user-configured and may be influenced by subscription configuration. The manual test should read the active values from the installed HAPP UI, after the relevant subscription is loaded and the connection is established.

The public repository and its release notes do not document a desktop IPC/automation API. Searches of its public issues for SOCKS5 port, local API, IPC, LAN connections and proxy port returned no matching issues. This is not proof that no private/internal interface exists; it means we have no public, supportable contract to build against.

### 3. Firefox exposes a WebExtension proxy API

Mozilla documents the Firefox `proxy` WebExtension API and `browser.proxy.settings`:

- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy
- https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings

The API requires the `proxy` permission. It supports manual SOCKS configuration, SOCKS version 5, and proxy DNS. Firefox's proxy settings apply to Firefox, not to unrelated operating-system applications. The API documentation also notes that changing proxy settings requires private-window access because the setting affects private and non-private windows; the user controls whether the extension may access private windows. Firefox defaults to proxy-side DNS for SOCKS5 in current versions, but we should set this explicitly in the implementation.

This is a plausible implementation path for the Firefox-only routing goal. It is not yet tested with HAPP.

## Security and product constraints

- Prefer a proxy listener bound to `127.0.0.1` / `::1`, if HAPP supports it.
- Do not tell users to enable LAN sharing until we understand whether it exposes the proxy to other devices and how access is protected.
- Never hardcode example ports. Read the actual values from HAPP or let the user configure them.
- Do not store subscription URLs, server credentials, or proxy credentials in the extension unless absolutely necessary.
- Do not claim that the extension can enumerate HAPP profiles or control HAPP Desktop until a documented and tested interface is found.
- Handle HAPP disconnects and proxy unavailability safely. The extension must be able to restore Firefox's previous proxy configuration when disabled.

## Extension design implications

- Keep the first implementation Firefox-only. Mozilla documents Firefox's `browser.proxy` API, but Chromium's proxy API is incompatible; a later Chrome/Edge build needs a separate adapter.
- Treat proxy configuration as a global Firefox profile setting, not a per-tab toggle. Detect conflicts/changes and avoid silently overwriting the user's existing proxy setup.
- Save the previous Firefox proxy configuration and restore it when the user disables the extension. If the user changes proxy settings while the extension is active, do not blindly restore stale settings.
- The `proxy` permission is required. Firefox's API requires private-window access to change proxy settings; explain this clearly and handle the case where the user has not granted private-window access.
- Explicitly configure SOCKS5 and proxy DNS.

## Implemented proof of concept on research branch

The extension now includes a Firefox popup that accepts a SOCKS5 host/port, applies Firefox's global SOCKS5 proxy settings with proxy-side DNS, and restores the exact settings captured before activation. It stores the endpoint and backup in browser.storage.local.

Safety behavior:
- Only loopback hosts (127.0.0.1, localhost, ::1) are accepted.
- It does not enable HAPP LAN sharing or contact HAPP Desktop.
- It refuses to overwrite settings controlled by another extension/policy.
- If Firefox's proxy settings change while active, it offers to forget its saved session without modifying the current Firefox settings.
- It checks Firefox private-window access before applying proxy settings.
- It does not auto-connect after browser restart.

This is a proof of concept, not a verified release. The extension cannot verify that a listener is actually SOCKS5 or that HAPP is connected; that requires the Windows checklist.

## Proposed implementation sequence

1. **Manual feasibility test (Windows):** follow WINDOWS_TEST_CHECKLIST.md to confirm a loopback listener and determine whether HAPP can run without system-wide routing.
2. **Manual routing test:** compare direct Windows traffic with an explicit SOCKS5 request and then with Firefox using the extension.
3. **Reliability tests:** HAPP disconnected, proxy port closed, HAPP reconnect, Firefox restart, private windows, DNS behavior, WebRTC considerations, and restoration after Firefox/extension errors.
4. **Only then:** investigate profile enumeration and connection control through a supported HAPP interface, if one exists.

## Sources

- HAPP official Russian guide: https://www.happ.su/main/ru/faq/local-network-connections
- HAPP official English guide: https://www.happ.su/main/faq/local-network-connections
- HAPP Desktop releases: https://github.com/Happ-proxy/happ-desktop/releases
- HAPP Desktop 4.6.1 notes: https://newreleases.io/project/github/Happ-proxy/happ-desktop/release/4.6.1
- HAPP Desktop 4.8.1 notes: https://newreleases.io/project/github/Happ-proxy/happ-desktop/release/4.8.1
- Mozilla proxy API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy
- Mozilla proxy settings: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings

## Current conclusion

A browser-only proxy route is technically plausible because HAPP documents SOCKS5 access and Firefox provides a proxy configuration API. The exact safe local endpoint and any HAPP Desktop control interface remain unverified. No code changes to the extension should be made until the manual feasibility test confirms the endpoint and its security boundary.
