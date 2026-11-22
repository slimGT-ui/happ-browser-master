const test = require("node:test");
const assert = require("node:assert/strict");
const watchdog = require("../watchdog.js");

test("watchdog accepts only supported low-frequency intervals", () => {
  assert.deepEqual(watchdog.ALLOWED_INTERVALS, [5, 10, 15, 30]);
  assert.equal(watchdog.normalizeInterval(10), 10);
  assert.equal(watchdog.normalizeInterval(1), 5);
  assert.equal(watchdog.normalizeInterval("15"), 15);
});

test("first successful observation establishes baseline without a false change event", () => {
  const result = watchdog.deriveTransitions({}, {
    reachable: true, ip: "203.0.113.10", checkedAt: "2026-11-22T10:00:00.000Z"
  });
  assert.equal(result.state.connectivity, "online");
  assert.equal(result.state.lastIp, "203.0.113.10");
  assert.deepEqual(result.events, []);
});

test("public IP changes are reported only when both observations are valid and reachable", () => {
  const previous = { connectivity: "online", lastIp: "203.0.113.10" };
  const changed = watchdog.deriveTransitions(previous, {
    reachable: true, ip: "198.51.100.20", checkedAt: "2026-11-22T10:05:00.000Z"
  });
  assert.equal(changed.events.length, 1);
  assert.equal(changed.events[0].eventType, "ip-changed");
  assert.equal(changed.events[0].previousIp, "203.0.113.10");
  assert.equal(changed.events[0].currentIp, "198.51.100.20");
  const unavailableIpService = watchdog.deriveTransitions(previous, {
    reachable: true, ip: null, checkedAt: "2026-11-22T10:10:00.000Z"
  });
  assert.deepEqual(unavailableIpService.events, []);
  assert.equal(unavailableIpService.state.lastIp, "203.0.113.10");
});

test("one failed cycle is uncertain; two consecutive failed cycles trigger one outage event", () => {
  const first = watchdog.deriveTransitions({ connectivity: "online", consecutiveFailures: 0 }, {
    reachable: false, checkedAt: "2026-11-22T10:05:00.000Z"
  });
  assert.equal(first.state.connectivity, "uncertain");
  assert.deepEqual(first.events, []);
  const second = watchdog.deriveTransitions(first.state, {
    reachable: false, checkedAt: "2026-11-22T10:10:00.000Z"
  });
  assert.equal(second.state.connectivity, "offline");
  assert.equal(second.events.length, 1);
  assert.equal(second.events[0].eventType, "connection-lost");
  const third = watchdog.deriveTransitions(second.state, {
    reachable: false, checkedAt: "2026-11-22T10:15:00.000Z"
  });
  assert.deepEqual(third.events, []);
});

test("successful observation after an outage emits one recovery event", () => {
  const result = watchdog.deriveTransitions({
    connectivity: "offline", consecutiveFailures: 3, lastIp: "203.0.113.10"
  }, { reachable: true, ip: "203.0.113.10", checkedAt: "2026-11-22T10:20:00.000Z" });
  assert.equal(result.state.connectivity, "online");
  assert.equal(result.events.length, 1);
  assert.equal(result.events[0].eventType, "connection-restored");
});

test("simultaneous IP and reachability changes can be summarized in one notification", () => {
  const events = [
    { eventType: "connection-restored" },
    { eventType: "ip-changed", previousIp: "203.0.113.10", currentIp: "198.51.100.20" }
  ];
  const summary = watchdog.summarizeEvents(events);
  assert.match(summary, /Контрольные HTTPS-пробы снова завершаются успешно/);
  assert.match(summary, /203\.0\.113\.10 → 198\.51\.100\.20/);
});


test("IP probe validates the service response and keeps the request cache-free", async () => {
  let request;
  const result = await watchdog.probeIp(async (url, options) => {
    request = { url, options };
    return { ok: true, json: async () => ({ success: true, ip: "203.0.113.10", country: "Example" }) };
  }, {
    validIPv4: value => value === "203.0.113.10",
    validIPv6: () => false
  });
  assert.equal(result.ok, true);
  assert.equal(result.ip, "203.0.113.10");
  assert.equal(request.url, "https://ipwho.is/");
  assert.equal(request.options.cache, "no-store");
  assert.equal(request.options.credentials, "omit");
  const invalid = await watchdog.probeIp(async () => ({
    ok: true, json: async () => ({ success: true, ip: "not-an-ip" })
  }), { validIPv4: () => false, validIPv6: () => false });
  assert.equal(invalid.ok, false);
});

test("HTTPS control probe records request completion without claiming HTTP status", async () => {
  const result = await watchdog.probeEndpoint(async (url, options) => {
    assert.equal(options.mode, "no-cors");
    assert.equal(options.method, "GET");
    return { type: "opaque", ok: false, status: 0 };
  }, { key: "google", url: "https://www.google.com/generate_204" });
  assert.deepEqual(result, { key: "google", ok: true });
  const failed = await watchdog.probeEndpoint(async () => { throw new Error("blocked"); }, {
    key: "cloudflare", url: "https://www.cloudflare.com/cdn-cgi/trace"
  });
  assert.equal(failed.ok, false);
});

test("background watchdog restores its alarm and performs an initial observation", async () => {
  const listeners = {};
  const store = { watchdogConfig: { enabled: true, intervalMinutes: 10 }, watchdogState: {} };
  const alarms = [];
  const browserApi = {
    storage: { local: {
      get: async keys => Array.isArray(keys)
        ? Object.fromEntries(keys.map(key => [key, store[key]]))
        : { [keys]: store[keys] },
      set: async values => Object.assign(store, values)
    } },
    permissions: { contains: async ({ permissions }) => permissions.includes("alarms") },
    alarms: {
      clear: async name => { alarms.push({ action: "clear", name }); },
      create: async (name, options) => { alarms.push({ action: "create", name, options }); },
      onAlarm: { addListener: fn => { listeners.alarm = fn; } }
    },
    notifications: { create: async () => "notification-id" },
    runtime: {
      onMessage: { addListener: fn => { listeners.message = fn; } },
      onStartup: { addListener: fn => { listeners.startup = fn; } },
      onInstalled: { addListener: fn => { listeners.installed = fn; } }
    }
  };
  const root = {
    HappValidation: { validIPv4: value => value === "203.0.113.10", validIPv6: () => false },
    fetch: async url => url === "https://ipwho.is/"
      ? { ok: true, json: async () => ({ success: true, ip: "203.0.113.10", country: "Example" }) }
      : { type: "opaque", ok: false, status: 0 }
  };
  const controller = watchdog.initialize(browserApi, root);
  await controller.restore();
  assert.ok(alarms.some(item => item.action === "create" && item.options.periodInMinutes === 10));
  assert.equal(store.watchdogState.connectivity, "online");
  assert.equal(store.watchdogState.lastIp, "203.0.113.10");
  assert.equal(typeof listeners.message, "function");
  assert.equal(typeof listeners.startup, "function");
  assert.equal(typeof listeners.installed, "function");
  await controller.stop();
  assert.equal(store.watchdogConfig.enabled, false);
  assert.ok(alarms.some(item => item.action === "clear"));
});
