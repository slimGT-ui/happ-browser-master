const test = require("node:test");
const assert = require("node:assert/strict");
const { calculateStats, getQualityStatus } = require("./quality-monitor.js");

test("calculates latency statistics from successful probes only", () => {
  const stats = calculateStats([
    { ok: true, latencyMs: 10 },
    { ok: true, latencyMs: 20 },
    { ok: true, latencyMs: 30 },
    { ok: false, error: "timeout" }
  ]);
  assert.deepEqual(stats, {
    sent: 4, received: 3, failed: 1, lossPercent: 25,
    minMs: 10, medianMs: 20, averageMs: 20, maxMs: 30, jitterMs: 10
  });
});

test("calculates median for an even number of samples", () => {
  const stats = calculateStats([
    { ok: true, latencyMs: 10 },
    { ok: true, latencyMs: 30 }
  ]);
  assert.equal(stats.medianMs, 20);
  assert.equal(stats.jitterMs, 20);
});

test("returns null latency metrics when every probe fails", () => {
  const stats = calculateStats([{ ok: false }, { ok: false }]);
  assert.equal(stats.received, 0);
  assert.equal(stats.lossPercent, 100);
  assert.equal(stats.medianMs, null);
  assert.equal(stats.jitterMs, null);
});

test("handles an empty sample list", () => {
  const stats = calculateStats([]);
  assert.equal(stats.sent, 0);
  assert.equal(stats.lossPercent, 0);
  assert.equal(stats.averageMs, null);
});

test("classifies complete, partial, and failed runs", () => {
  assert.equal(getQualityStatus({ received: 2, failed: 0 }), "measured");
  assert.equal(getQualityStatus({ received: 1, failed: 1 }), "partial");
  assert.equal(getQualityStatus({ received: 0, failed: 2 }), "error");
  assert.equal(getQualityStatus(null), "error");
});
