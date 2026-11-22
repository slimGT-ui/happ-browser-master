(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.HappWatchdog = api;
    if (root.browser?.runtime?.onMessage) api.initialize(root.browser, root);
  }
})(globalThis, function () {
  "use strict";

  const ALARM_NAME = "happ-connection-watchdog";
  const ALLOWED_INTERVALS = Object.freeze([5, 10, 15, 30]);
  const EVENT_LIMIT = 50;
  const FAILURE_THRESHOLD = 2;
  const ENDPOINTS = Object.freeze([
    { key: "google", url: "https://www.google.com/generate_204" },
    { key: "cloudflare", url: "https://www.cloudflare.com/cdn-cgi/trace" }
  ]);

  function normalizeInterval(value) {
    const interval = Number(value);
    return ALLOWED_INTERVALS.includes(interval) ? interval : 5;
  }

  function deriveTransitions(previous = {}, observation = {}) {
    const reachable = observation.reachable === true;
    const previousConnectivity = previous.connectivity || "unknown";
    const failures = reachable ? 0 : (Number(previous.consecutiveFailures) || 0) + 1;
    const connectivity = reachable
      ? "online"
      : failures >= FAILURE_THRESHOLD ? "offline" : previousConnectivity === "offline" ? "offline" : "uncertain";
    const events = [];
    const checkedAt = observation.checkedAt || new Date().toISOString();

    if (connectivity === "offline" && previousConnectivity !== "offline") {
      events.push({
        eventType: "connection-lost",
        status: "connection-lost",
        checkedAt,
        message: "Контрольные сетевые сервисы не ответили в двух проверках подряд. Это может указывать на проблему соединения или фильтрацию сервисов, но не доказывает отключение VPN."
      });
    }
    if (connectivity === "online" && previousConnectivity === "offline") {
      events.push({
        eventType: "connection-restored",
        status: "connection-restored",
        checkedAt,
        message: "Контрольные сетевые сервисы снова отвечают."
      });
    }
    const previousIp = typeof previous.lastIp === "string" ? previous.lastIp : null;
    const currentIp = typeof observation.ip === "string" ? observation.ip : null;
    if (reachable && previousIp && currentIp && previousIp !== currentIp) {
      events.push({
        eventType: "ip-changed",
        status: "ip-changed",
        previousIp,
        currentIp,
        checkedAt,
        message: "Публичный IP изменился. Это наблюдаемое изменение адреса выхода, а не доказательство потери VPN."
      });
    }

    return {
      events,
      state: {
        connectivity,
        consecutiveFailures: failures,
        lastIp: reachable && currentIp ? currentIp : previousIp,
        lastIpCheckedAt: reachable && currentIp ? checkedAt : previous.lastIpCheckedAt || null,
        lastCheckAt: checkedAt,
        lastProbes: observation.probes || {},
        lastError: observation.error || null,
        lastEventAt: events.length ? checkedAt : previous.lastEventAt || null
      }
    };
  }

  function summarizeEvents(events) {
    return (Array.isArray(events) ? events : []).map(event => {
      if (event.eventType === "ip-changed") return "Публичный IP изменился: " + event.previousIp + " → " + event.currentIp;
      if (event.eventType === "connection-lost") return "Контрольные сетевые сервисы недоступны";
      if (event.eventType === "connection-restored") return "Ответы от контрольных сервисов восстановились";
      return event.message || "Изменение сети";
    }).join(". ");
  }

  async function fetchWithTimeout(fetcher, url, timeoutMs = 8000, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetcher(url, {
        cache: "no-store",
        credentials: "omit",
        redirect: "follow",
        ...options,
        signal: controller.signal
      });
    } finally {
      clearTimeout(timer);
    }
  }

  function isValidIp(value, validator) {
    return typeof value === "string" && (
      typeof validator?.validIPv4 === "function" && validator.validIPv4(value) ||
      typeof validator?.validIPv6 === "function" && validator.validIPv6(value)
    );
  }

  async function probeIp(fetcher, validator) {
    try {
      const response = await fetchWithTimeout(fetcher, "https://ipwho.is/");
      if (!response.ok) throw new Error("HTTP " + response.status);
      const data = await response.json();
      if (data?.success !== true || !isValidIp(data.ip, validator)) throw new Error("Некорректный ответ IP-сервиса");
      return { ok: true, ip: data.ip, country: typeof data.country === "string" ? data.country : null };
    } catch (error) {
      return { ok: false, error: error?.name === "AbortError" ? "timeout" : String(error?.message || error).slice(0, 160) };
    }
  }

  async function probeEndpoint(fetcher, endpoint) {
    try {
      await fetchWithTimeout(fetcher, endpoint.url, 8000, { method: "GET", mode: "no-cors" });
      return { key: endpoint.key, ok: true };
    } catch (error) {
      return { key: endpoint.key, ok: false, error: error?.name === "AbortError" ? "timeout" : "network-error" };
    }
  }

  async function runObservation(browserApi, root) {
    const fetcher = root.fetch.bind(root);
    const [ipResult, ...controls] = await Promise.all([
      probeIp(fetcher, root.HappValidation),
      ...ENDPOINTS.map(endpoint => probeEndpoint(fetcher, endpoint))
    ]);
    const probes = {
      ipService: ipResult.ok,
      google: controls.find(item => item.key === "google")?.ok === true,
      cloudflare: controls.find(item => item.key === "cloudflare")?.ok === true
    };
    return {
      reachable: ipResult.ok || probes.google || probes.cloudflare,
      ip: ipResult.ok ? ipResult.ip : null,
      country: ipResult.ok ? ipResult.country : null,
      checkedAt: new Date().toISOString(),
      probes,
      error: !ipResult.ok ? ipResult.error : null
    };
  }

  async function appendEvents(browserApi, events) {
    if (!events.length) return;
    const stored = await browserApi.storage.local.get("watchdogEvents");
    const current = Array.isArray(stored.watchdogEvents) ? stored.watchdogEvents : [];
    await browserApi.storage.local.set({
      watchdogEvents: [...events, ...current].slice(0, EVENT_LIMIT)
    });
  }

  async function notifyEvents(browserApi, events) {
    if (!events.length || !browserApi.notifications?.create) return;
    try {
      await browserApi.notifications.create("happ-watchdog-event", {
        type: "basic",
        title: "HAPP Browser · Connection Watchdog",
        message: summarizeEvents(events).slice(0, 240)
      });
    } catch (error) {
      console.warn("HAPP Watchdog: не удалось показать уведомление", error);
    }
  }

  function initialize(browserApi, root) {
    let activeCheck = null;

    async function runCheck() {
      if (activeCheck) return activeCheck;
      activeCheck = (async () => {
        const stored = await browserApi.storage.local.get(["watchdogConfig", "watchdogState"]);
        if (stored.watchdogConfig?.enabled !== true) return { ok: false, reason: "disabled" };
        const observation = await runObservation(browserApi, root);
        const transition = deriveTransitions(stored.watchdogState || {}, observation);
        await browserApi.storage.local.set({ watchdogState: transition.state });
        await appendEvents(browserApi, transition.events);
        await notifyEvents(browserApi, transition.events);
        return { ok: true, observation, state: transition.state, events: transition.events };
      })().catch(error => {
        console.error("HAPP Watchdog: ошибка фоновой проверки", error);
        return { ok: false, reason: String(error?.message || error).slice(0, 180) };
      }).finally(() => { activeCheck = null; });
      return activeCheck;
    }

    async function start(intervalValue) {
      const intervalMinutes = normalizeInterval(intervalValue);
      const granted = await browserApi.permissions.contains({ permissions: ["alarms"] });
      if (!granted) return { ok: false, reason: "alarms-permission-required" };
      const config = { enabled: true, intervalMinutes, updatedAt: new Date().toISOString() };
      await browserApi.storage.local.set({ watchdogConfig: config });
      await browserApi.alarms.clear(ALARM_NAME);
      await browserApi.alarms.create(ALARM_NAME, { delayInMinutes: 0.1, periodInMinutes: intervalMinutes });
      const result = await runCheck();
      return { ok: true, config, result };
    }

    async function stop() {
      await browserApi.alarms.clear(ALARM_NAME);
      const stored = await browserApi.storage.local.get("watchdogConfig");
      await browserApi.storage.local.set({
        watchdogConfig: { ...(stored.watchdogConfig || {}), enabled: false, updatedAt: new Date().toISOString() }
      });
      return { ok: true };
    }

    async function restore() {
      const stored = await browserApi.storage.local.get("watchdogConfig");
      if (stored.watchdogConfig?.enabled !== true) return;
      const granted = await browserApi.permissions.contains({ permissions: ["alarms"] }).catch(() => false);
      if (!granted) return;
      await browserApi.alarms.create(ALARM_NAME, {
        delayInMinutes: 0.1,
        periodInMinutes: normalizeInterval(stored.watchdogConfig.intervalMinutes)
      });
      await runCheck();
    }

    browserApi.alarms.onAlarm.addListener(alarm => {
      if (alarm?.name === ALARM_NAME) void runCheck();
    });
    browserApi.runtime.onMessage.addListener(message => {
      if (message?.type === "HAPP_WATCHDOG_START") return start(message.intervalMinutes);
      if (message?.type === "HAPP_WATCHDOG_STOP") return stop();
      if (message?.type === "HAPP_WATCHDOG_RUN_NOW") return runCheck();
      return undefined;
    });
    browserApi.runtime.onStartup.addListener(() => { void restore(); });
    browserApi.runtime.onInstalled.addListener(() => { void restore(); });

    return { start, stop, restore, runCheck };
  }

  return Object.freeze({
    ALARM_NAME,
    ALLOWED_INTERVALS,
    normalizeInterval,
    deriveTransitions,
    summarizeEvents,
    fetchWithTimeout,
    probeIp,
    probeEndpoint,
    runObservation,
    initialize
  });
});
