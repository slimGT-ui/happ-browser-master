const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sortHistory, filterHistory, summarizeHistory, getStatus, describe, groupByDay
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
