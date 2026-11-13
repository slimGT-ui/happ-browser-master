# HAPP Desktop integration research

Status: research only. No runtime integration has been implemented yet.

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

### 2. Firefox exposes a WebExtension proxy API

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

## Proposed implementation sequence

1. **Manual feasibility test (Windows + Firefox):** identify the actual HAPP local proxy endpoint and determine whether it can be used without exposing it to the LAN.
2. **Manual routing test:** configure Firefox only to use the endpoint; verify Firefox's public IP changes while a separate application remains on the direct connection.
3. **Extension proof of concept:** add the Firefox `proxy` permission and a minimal enable/disable control using the verified endpoint. Preserve/restore the prior Firefox proxy configuration.
4. **Reliability tests:** HAPP disconnected, proxy port closed, HAPP reconnect, Firefox restart, private windows, DNS behavior, and WebRTC considerations.
5. **Only then:** investigate profile enumeration and connection control through a supported HAPP interface, if one exists.

## Sources

- HAPP official Russian guide: https://www.happ.su/main/ru/faq/local-network-connections
- HAPP official English guide: https://www.happ.su/main/faq/local-network-connections
- Mozilla proxy API: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy
- Mozilla proxy settings: https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/proxy/settings

## Current conclusion

A browser-only proxy route is technically plausible because HAPP documents SOCKS5 access and Firefox provides a proxy configuration API. The exact safe local endpoint and any HAPP Desktop control interface remain unverified. No code changes to the extension should be made until the manual feasibility test confirms the endpoint and its security boundary.
