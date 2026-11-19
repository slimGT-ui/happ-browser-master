const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sortHistory, filterHistory, summarizeHistory, getStatus, describe, findPrevious, compareEvents, groupByDay, TYPE_LABELS
} = require("../timeline.js");

const history = [
  { id: "old", type: "IP", status: "success", ip: "8.8.8.8", country: "US", checkedAt: "2026-01-01T10:00:00.000Z" },
  { id: "dns", type: "DNS", status: "observed", resolvers: 2, lookups: 8, checkedAt: "2026-01-02T10:00:00.000Z" },
  { id: "rtc", type: "WebRTC", status: "possible-leak", candidates: 3, compared: 2, checkedAt: "2026-01-03T10:00:00.000Z" },
  { id: "bad-date", type: "IPv6", status: "inconclusive", checkedAt: "invalid" }
];

test("timeline sorts newest first and puts invalid timestamps last", () => {
  assert.deepEqual(sortHistory(history).map(item => item.id), ["rtc", "dns", "old", "bad-date"]);
});
test("timeline filters by exact diagnostic type without mutating history", () => {
  const original = history.map(item => item.id);
  assert.deepEqual(filterHistory(history, "DNS").map(item => item.id), ["dns"]);
  assert.deepEqual(filterHistory(history).map(item => item.id), ["rtc", "dns", "old", "bad-date"]);
  assert.deepEqual(history.map(item => item.id), original);
});
test("timeline summary counts total events, unique types and recent events", () => {
  const now = Date.parse("2026-01-03T12:00:00.000Z");
  assert.deepEqual(summarizeHistory(history, now), { total: 4, last24Hours: 1, types: 4 });
});
test("timeline status distinguishes WebRTC mismatch from DNS observations", () => {
  assert.deepEqual(getStatus(history[2]), { state: "warning", label: "НЕСОВПАДЕНИЕ" });
  assert.deepEqual(getStatus(history[1]), { state: "review", label: "НАБЛЮДЕНИЯ ПОЛУЧЕНЫ" });
});
test("timeline descriptions format each diagnostic type and errors", () => {
  assert.equal(describe(history[0]), "8.8.8.8 · US");
  assert.equal(describe(history[1]), "2 резолверов · 8 наблюдений");
  assert.match(describe(history[2]), /possible-leak/);
  assert.equal(describe({ type: "IP", status: "error", message: "offline" }), "Ошибка: offline");
});
test("timeline groups events by local calendar day and keeps unknown dates", () => {
  const groups = groupByDay(history);
  assert.equal(groups.length, 4);
  assert.equal(groups[0].items[0].id, "rtc");
  assert.equal(groups.at(-1).key, "unknown");
});

test("timeline finds the immediately older event of the same diagnostic type", () => {
  const older = { id: "rtc-older", type: "WebRTC", checkedAt: "2026-01-02T09:00:00.000Z" };
  const previous = findPrevious(history[2], [...history, older]);
  assert.equal(previous.id, "rtc-older");
});
test("timeline reports changed IP values and unchanged repeated results", () => {
  const before = { type: "IP", ip: "8.8.8.8", country: "US" };
  const after = { type: "IP", ip: "1.1.1.1", country: "US" };
  assert.equal(compareEvents(after, before).state, "changed");
  assert.match(compareEvents(after, before).detail, /8.8.8.8 → 1.1.1.1/);
  assert.equal(compareEvents(before, { ...before }).state, "same");
});
test("timeline compares DNS resolver counts and IPv6 families", () => {
  assert.equal(compareEvents(
    { type: "DNS", resolvers: 3 }, { type: "DNS", resolvers: 1 }
  ).state, "changed");
  assert.equal(compareEvents(
    { type: "IPv6", ipv4: "1.1.1.1", ipv6: "" },
    { type: "IPv6", ipv4: "1.1.1.1", ipv6: "2001:4860::1" }
  ).state, "changed");
  assert.equal(compareEvents(
    { type: "IPv6", ipv4: "1.1.1.1" },
    { type: "IPv6", ipv4: "1.1.1.1", ipv6: "2001:4860::1" }
  ).state, "unknown");
});
test("timeline marks partial IPv6 observations as incomplete", () => {
  assert.deepEqual(getStatus({ type: "IPv6", status: "partial" }), {
    state: "incomplete", label: "ЧАСТИЧНЫЙ РЕЗУЛЬТАТ"
  });
});

test("timeline DNS descriptions include resolver set change counts", () => {
  const changed = {
    type: "DNS", status: "observed", resolvers: 3, lookups: 12,
    resolverSetChanged: true, resolverAdded: 1, resolverRemoved: 2,
    resolverMetadataChanges: 1
  };
  assert.match(describe(changed), /состав изменился: \+1 \/ −2 · метаданные: 1/);
  assert.match(describe({ ...changed, resolverSetChanged: false }), /состав резолверов без изменений/);
  assert.doesNotMatch(describe({ ...changed, resolverSetChanged: null }), /состав резолверов/);
});

test("timeline DNS event comparison includes resolver metadata changes", () => {
  const before = {
    type: "DNS", resolvers: 2, resolverSetChanged: false,
    resolverAdded: 0, resolverRemoved: 0, resolverMetadataChanges: 0
  };
  const after = {
    type: "DNS", resolvers: 2, resolverSetChanged: true,
    resolverAdded: 0, resolverRemoved: 0, resolverMetadataChanges: 1
  };
  const comparison = compareEvents(after, before);
  assert.equal(comparison.state, "changed");
  assert.match(comparison.detail, /Изменились метаданные резолверов: 0 → 1/);
});


test("fingerprint timeline events are labeled, summarized and compared", () => {
  const item = {
    type: "Fingerprint",
    status: "observed",
    observable: 9,
    total: 11,
    executionContext: "page",
    checkedAt: "2026-11-16T10:00:00.000Z",
    data: { userAgent: "Firefox", timezone: "Europe/Stockholm", canvas: { status: "available", hash: "11111111" } }
  };
  assert.equal(TYPE_LABELS.Fingerprint, "Browser Fingerprint");
  assert.match(describe(item), /9\/11 наблюдаемых параметров/);
  const previous = {
    ...item,
    checkedAt: "2026-11-16T09:00:00.000Z",
    data: { userAgent: "Firefox", timezone: "UTC", canvas: { status: "available", hash: "22222222" } }
  };
  const comparison = compareEvents(item, previous);
  assert.equal(comparison.state, "changed");
  assert.match(comparison.detail, /Canvas marker/);
});


test("route diagnostics timeline labels, statuses, descriptions and comparisons", () => {
  const before = {
    type: "Route", status: "reachable", diagnosis: "destination-reachable",
    host: "example.com", dnsStatus: "resolved", resolvedAddresses: ["1.1.1.1"],
    controlsReachable: 2, controlsTotal: 2, checkedAt: "2026-11-19T10:00:00.000Z"
  };
  const after = {
    ...before, status: "destination-issue", diagnosis: "destination-specific-or-policy",
    controlsReachable: 2, checkedAt: "2026-11-19T11:00:00.000Z"
  };
  assert.equal(TYPE_LABELS.Route, "Network Path Diagnostics");
  assert.deepEqual(getStatus(before), { state: "success", label: "ДОСТУПНОСТЬ ИЗМЕРЕНА" });
  assert.deepEqual(getStatus(after), { state: "review", label: "ПРОБЛЕМА НАЗНАЧЕНИЯ" });
  assert.deepEqual(getStatus({ ...before, dnsStatus: "error" }), { state: "review", label: "DNS API НЕДОСТУПЕН" });
  assert.match(describe(before), /example.com.*контрольные узлы: 2\/2/);
  assert.equal(compareEvents(after, before).state, "changed");
});
