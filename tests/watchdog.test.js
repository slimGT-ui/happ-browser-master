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
  assert.match(summary, /Ответы от контрольных сервисов восстановились/);
  assert.match(summary, /203\.0\.113\.10 → 198\.51\.100\.20/);
});
