const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sortHistory, filterHistory, summarizeHistory, getStatus, describe, findPrevious, compareEvents, groupByDay
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
