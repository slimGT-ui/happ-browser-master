(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.HappQuality = api;
    if (root.document) initializeQualityMonitor(root, api);
  }
})(globalThis, function () {
  "use strict";
  function calculateStats(samples) {
    const values = (Array.isArray(samples) ? samples : []).filter(item => item && item.ok === true && Number.isFinite(item.latencyMs) && item.latencyMs >= 0).map(item => item.latencyMs);
    const total = Array.isArray(samples) ? samples.length : 0;
    if (!total) return { sent: 0, received: 0, failed: 0, lossPercent: 0, minMs: null, medianMs: null, averageMs: null, maxMs: null, jitterMs: null };
    if (!values.length) return { sent: total, received: 0, failed: total, lossPercent: 100, minMs: null, medianMs: null, averageMs: null, maxMs: null, jitterMs: null };
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
    const average = values.reduce((sum, value) => sum + value, 0) / values.length;
    const jitter = values.length < 2 ? null : values.slice(1).reduce((sum, value, index) => sum + Math.abs(value - values[index]), 0) / (values.length - 1);
    return { sent: total, received: values.length, failed: total - values.length, lossPercent: Math.round(((total - values.length) / total) * 100), minMs: Math.round(sorted[0] * 10) / 10, medianMs: Math.round(median * 10) / 10, averageMs: Math.round(average * 10) / 10, maxMs: Math.round(sorted[sorted.length - 1] * 10) / 10, jitterMs: jitter === null ? null : Math.round(jitter * 10) / 10 };
  }
  function getQualityStatus(stats) {
    if (!stats || stats.received === 0) return "error";
    return stats.failed > 0 ? "partial" : "measured";
  }
  return Object.freeze({ calculateStats, getQualityStatus });
});
function initializeQualityMonitor(root, quality) {
  const button = root.document.querySelector("#run-quality-check");
  const message = root.document.querySelector("#quality-message");
  const results = root.document.querySelector("#quality-results");
  if (!button || !message || !results) return;
  const SAMPLE_COUNT = 6;
  const TIMEOUT_MS = 3500;
  const ENDPOINTS = [
    { name: "Google connectivity", url: "https://www.google.com/generate_204" },
    { name: "Cloudflare trace", url: "https://www.cloudflare.com/cdn-cgi/trace" }
  ];
  function addMetric(label, value) {
    const row = root.document.createElement("div");
    row.className = "advanced-result-row";
    const name = root.document.createElement("span");
    name.textContent = label;
    const result = root.document.createElement("strong");
    result.textContent = value;
    row.append(name, result);
    results.append(row);
  }
  function render(data) {
    results.replaceChildren();
    const stats = data.stats;
    addMetric("Медианная задержка", stats.medianMs === null ? "Нет данных" : stats.medianMs + " ms");
    addMetric("Средняя задержка", stats.averageMs === null ? "Нет данных" : stats.averageMs + " ms");
    addMetric("Минимум / максимум", stats.minMs === null ? "Нет данных" : stats.minMs + " / " + stats.maxMs + " ms");
    addMetric("Jitter", stats.jitterMs === null ? "Недостаточно проб" : stats.jitterMs + " ms");
    addMetric("Неудачные HTTPS-пробы", stats.failed + " / " + stats.sent + " (" + stats.lossPercent + "%)");
    const chart = root.document.createElement("div");
    chart.className = "quality-chart";
    chart.setAttribute("role", "img");
    chart.setAttribute("aria-label", "Задержка успешных HTTPS-проб в миллисекундах");
    const successful = data.samples.filter(item => item.ok);
    const max = Math.max(1, ...successful.map(item => item.latencyMs));
    for (const sample of data.samples) {
      const bar = root.document.createElement("span");
      bar.className = "quality-bar";
      bar.dataset.state = sample.ok ? "success" : "failed";
      bar.style.height = sample.ok ? Math.max(8, (sample.latencyMs / max) * 54) + "px" : "5px";
      bar.title = sample.ok ? sample.latencyMs.toFixed(1) + " ms" : "Проба не прошла";
      chart.append(bar);
    }
    results.append(chart);
    const note = root.document.createElement("p");
    note.className = "advanced-note";
    note.textContent = "Измеряется время HTTPS-запроса до Google и Cloudflare из Firefox, а не ICMP ping. Неудачная проба может быть вызвана блокировкой endpoint, firewall или сетевой ошибкой; процент не является точным измерением потери IP-пакетов.";
    results.append(note);
  }
  async function probe(endpoint, index) {
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = root.performance.now();
    try {
      const separator = endpoint.url.includes("?") ? "&" : "?";
      await root.fetch(endpoint.url + separator + "happ_browser_probe=" + Date.now() + "_" + index, { method: "GET", mode: "no-cors", cache: "no-store", credentials: "omit", redirect: "follow", signal: controller.signal });
      return { ok: true, endpoint: endpoint.name, latencyMs: root.performance.now() - started };
    } catch (error) {
      return { ok: false, endpoint: endpoint.name, error: error.name === "AbortError" ? "timeout" : "network-error" };
    } finally {
      root.clearTimeout(timer);
    }
  }
  async function run() {
    button.disabled = true;
    button.textContent = "Измеряем…";
    message.textContent = "Выполняем " + SAMPLE_COUNT + " HTTPS-проб к двум независимым endpoint.";
    results.replaceChildren();
    const samples = [];
    try {
      for (let index = 0; index < SAMPLE_COUNT; index++) {
        samples.push(await probe(ENDPOINTS[index % ENDPOINTS.length], index));
        message.textContent = "Проба " + (index + 1) + " из " + SAMPLE_COUNT + "…";
      }
      const stats = quality.calculateStats(samples);
      const status = quality.getQualityStatus(stats);
      const record = { status, checkedAt: new Date().toISOString(), stats, samples: samples.map(item => item.ok ? { ok: true, endpoint: item.endpoint, latencyMs: Math.round(item.latencyMs * 10) / 10 } : { ok: false, endpoint: item.endpoint, error: item.error }) };
      await root.browser.storage.local.set({ lastQualityCheck: record });
      render(record);
      message.textContent = status === "error" ? "Ни одна HTTPS-проба не завершилась успешно. Проверь сеть и повтори тест." : status === "partial" ? "Получен частичный результат: часть HTTPS-проб не прошла." : "Все HTTPS-пробы завершились. Это измерение доступности и задержки HTTPS endpoint, не гарантия качества всего маршрута.";
      if (root.HappHistory?.add) await root.HappHistory.add("Quality", { status, stats, samples: record.samples });
    } catch (error) {
      message.textContent = "Не удалось сохранить результат: " + (error.message || String(error));
    } finally {
      button.disabled = false;
      button.textContent = "Повторить проверку качества";
    }
  }
  button.addEventListener("click", run);
  root.browser.storage.local.get("lastQualityCheck").then(({ lastQualityCheck }) => {
    if (!lastQualityCheck?.stats) return;
    render(lastQualityCheck);
    message.textContent = "Показан последний сохранённый результат от " + new Date(lastQualityCheck.checkedAt).toLocaleString() + ". Запусти тест заново для актуальных данных.";
  }).catch(() => {});
}
