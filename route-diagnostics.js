(function (root, factory) {
  const validation = typeof module === "object" && module.exports ? require("./ip-validation.js") : root.HappValidation;
  const api = factory(validation);
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.HappRoute = api;
    if (root.document) initializeRouteDiagnostics(root, api);
  }
})(globalThis, function (validation) {
  "use strict";

  const CONTROL_ENDPOINTS = Object.freeze([
    { name: "Google Connectivity", url: "https://www.google.com/generate_204" },
    { name: "Cloudflare Trace", url: "https://www.cloudflare.com/cdn-cgi/trace" }
  ]);

  function normalizeTarget(value) {
    if (typeof value !== "string" || !value.trim()) throw new Error("Введи адрес назначения.");
    let url;
    try {
      url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(value.trim()) ? value.trim() : "https://" + value.trim());
    } catch (_) {
      throw new Error("Некорректный URL назначения.");
    }
    if (!["http:", "https:"].includes(url.protocol)) throw new Error("Поддерживаются только HTTP и HTTPS.");
    if (url.username || url.password) throw new Error("URL с логином или паролем не поддерживается.");
    if (!url.hostname) throw new Error("Не удалось определить имя узла.");
    const host = url.hostname.replaceAll("[", "").replaceAll("]", "").toLowerCase();
    const isIp = validation?.validIp
      ? validation.validIp(host)
      : host.includes(":") || (host.split(".").length === 4 && host.split(".").every(part => part.length > 0 && Number.isInteger(Number(part)) && Number(part) >= 0 && Number(part) <= 255));
    if (!isIp && !host.includes(".") && host !== "localhost") {
      throw new Error("Укажи полное доменное имя, например example.com.");
    }
    url.search = "";
    url.hash = "";
    return { url, host, isIp };
  }

  function normalizeDnsRecord(record, isIp = false) {
    if (isIp) return { status: "not-applicable", addresses: [], canonicalName: null, isTRR: null };
    if (!record || typeof record !== "object" || !Array.isArray(record.addresses)) {
      return { status: "error", addresses: [], canonicalName: null, isTRR: null, error: "Некорректный DNS-ответ Firefox." };
    }
    const addresses = [...new Set(record.addresses.filter(value =>
      typeof value === "string" && validation?.validIp(value)
    ))].slice(0, 16);
    if (!addresses.length) {
      return { status: "error", addresses: [], canonicalName: null, isTRR: typeof record.isTRR === "boolean" ? record.isTRR : null, error: "DNS-ответ не содержит корректных IP-адресов." };
    }
    return {
      status: "resolved",
      addresses,
      canonicalName: typeof record.canonicalName === "string" ? record.canonicalName.slice(0, 253) : null,
      isTRR: typeof record.isTRR === "boolean" ? record.isTRR : null
    };
  }

  function describeDnsError(error) {
    const message = typeof error === "string" ? error
      : typeof error?.message === "string" ? error.message
        : "DNS-разрешение завершилось ошибкой.";
    if (message.includes("NS_ERROR_UNKNOWN_PROXY_HOST")) {
      return "Firefox DNS API не может выполнить это разрешение при DNS через SOCKS-прокси.";
    }
    return message.slice(0, 240);
  }

  function classifyRoute(targetProbe, controls) {
    const targetOk = targetProbe?.status === "reachable";
    const controlResults = Array.isArray(controls) ? controls : [];
    const controlsOk = controlResults.filter(item => item?.status === "reachable").length;
    const controlsFailed = controlResults.length - controlsOk;
    if (targetOk) {
      return {
        status: controlsFailed ? "partial" : "reachable",
        diagnosis: controlsFailed ? "destination-reachable-controls-partial" : "destination-reachable"
      };
    }
    if (controlsOk > 0) {
      return { status: "destination-issue", diagnosis: "destination-specific-or-policy" };
    }
    if (controlResults.length > 0 && controlsOk === 0) {
      return { status: "network-issue", diagnosis: "multiple-endpoints-unreachable" };
    }
    return { status: "inconclusive", diagnosis: "insufficient-probes" };
  }

  function getStatus(record) {
    if (!record || record.status === "inconclusive") return "incomplete";
    if (record.status === "reachable" || record.status === "partial") return "success";
    if (record.status === "destination-issue") return "review";
    if (record.status === "network-issue") return "error";
    return "incomplete";
  }

  return Object.freeze({ CONTROL_ENDPOINTS, normalizeTarget, normalizeDnsRecord, describeDnsError, classifyRoute, getStatus });
});

function initializeRouteDiagnostics(root, route) {
  const document = root.document;
  const button = document.querySelector("#run-route-check");
  const input = document.querySelector("#route-target-url");
  const message = document.querySelector("#route-message");
  const results = document.querySelector("#route-results");
  if (!button || !input || !message || !results) return;

  const TIMEOUT_MS = 7000;

  function addRow(label, value) {
    const row = document.createElement("div");
    row.className = "advanced-result-row";
    const name = document.createElement("span");
    name.textContent = label;
    const detail = document.createElement("strong");
    detail.textContent = value;
    row.append(name, detail);
    results.append(row);
  }

  function render(record) {
    results.replaceChildren();
    const statusLabels = {
      reachable: "НАЗНАЧЕНИЕ ДОСТУПНО",
      partial: "ЧАСТИЧНЫЙ РЕЗУЛЬТАТ",
      "destination-issue": "ПРОБЛЕМА НА УЗЛЕ ИЛИ ПОЛИТИКЕ ДОСТУПА",
      "network-issue": "КОНТРОЛЬНЫЕ УЗЛЫ НЕДОСТУПНЫ",
      inconclusive: "НЕДОСТАТОЧНО ДАННЫХ"
    };
    const summary = document.createElement("div");
    summary.className = "route-summary";
    summary.dataset.state = route.getStatus(record);
    summary.textContent = statusLabels[record.status] || statusLabels.inconclusive;
    results.append(summary);

    addRow("Узел назначения", record.host || "Неизвестен");
    addRow("DNS", record.dns?.status === "resolved"
      ? record.dns.addresses.length + " адрес(а/ов)"
      : record.dns?.status === "not-applicable" ? "IP-адрес задан напрямую" : "Не удалось получить данные");
    if (record.dns?.addresses?.length) addRow("Разрешённые IP", record.dns.addresses.join(", "));
    if (record.dns?.canonicalName) addRow("Canonical name", record.dns.canonicalName);
    addRow("Firefox TRR", record.dns?.isTRR === true ? "Использован" : record.dns?.isTRR === false ? "Не использован для этого разрешения" : "Не определён");
    if (record.dns?.error) addRow("Причина DNS-ошибки", record.dns.error);
    addRow("HTTPS/HTTP назначение", record.targetProbe?.status === "reachable"
      ? record.targetProbe.latencyMs + " ms · ответ получен"
      : "Не удалось получить сетевой ответ");
    for (const item of record.controls || []) {
      addRow(item.name, item.status === "reachable"
        ? item.latencyMs + " ms · ответ получен"
        : "Недоступен");
    }

    const note = document.createElement("p");
    note.className = "advanced-note";
    note.textContent = record.status === "reachable"
      ? "Назначение и контрольные HTTPS-узлы ответили. Измеряется время браузерных запросов, а не отдельные маршрутизаторы."
      : record.status === "partial"
        ? "Назначение ответило, но один или несколько контрольных узлов недоступны. Это может быть фильтрация конкретного сервиса."
        : record.status === "destination-issue"
          ? "Назначение не ответило, хотя хотя бы один контрольный узел доступен. Возможны проблема DNS/сервера назначения, блокировка домена или политика сети."
          : record.status === "network-issue"
            ? "Назначение и контрольные узлы не ответили. Возможны общая потеря подключения, сбой прокси/VPN, firewall или блокировка тестовых endpoint."
            : "Проб недостаточно для классификации. Повтори проверку или проверь доступность endpoint вручную.";
    results.append(note);

    const disclaimer = document.createElement("p");
    disclaimer.className = "advanced-note";
    disclaimer.textContent = "Firefox WebExtension не предоставляет системный traceroute, ICMP TTL или список промежуточных маршрутизаторов. Эта проверка анализирует DNS-разрешение и HTTP(S)-доступность, не показывает hop-by-hop маршрут и не доказывает, что трафик проходит через VPN.";
    results.append(disclaimer);
  }

  async function probe(name, url) {
    const controller = new AbortController();
    const timer = root.setTimeout(() => controller.abort(), TIMEOUT_MS);
    const started = root.performance.now();
    try {
      await root.fetch(url + (url.includes("?") ? "&" : "?") + "happ_route_probe=" + Date.now(), {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        redirect: "manual",
        signal: controller.signal
      });
      return { name, status: "reachable", latencyMs: Math.round((root.performance.now() - started) * 10) / 10 };
    } catch (error) {
      return {
        name,
        status: "unreachable",
        error: error?.name === "AbortError" ? "timeout" : "network-error"
      };
    } finally {
      root.clearTimeout(timer);
    }
  }

  async function resolveDns(host, isIp) {
    if (isIp) return route.normalizeDnsRecord(null, true);
    if (!root.browser?.dns?.resolve) {
      return { status: "error", addresses: [], canonicalName: null, isTRR: null, error: "Firefox DNS API недоступен." };
    }
    try {
      const record = await root.browser.dns.resolve(host, ["bypass_cache", "canonical_name"]);
      return route.normalizeDnsRecord(record);
    } catch (error) {
      return {
        status: "error",
        addresses: [],
        canonicalName: null,
        isTRR: null,
        error: route.describeDnsError(error)
      };
    }
  }

  async function run() {
    button.disabled = true;
    button.textContent = "Диагностируем…";
    results.replaceChildren();
    try {
      const target = route.normalizeTarget(input.value);
      message.textContent = "Запрашиваем разрешение Firefox для " + target.url.origin + "…";
      const granted = await root.browser.permissions.request({ origins: [target.url.origin + "/*"] });
      if (!granted) throw new Error("Разрешение для узла назначения не предоставлено.");

      message.textContent = "Проверяем DNS-разрешение и HTTPS-доступность…";
      const dns = await resolveDns(target.host, target.isIp);
      const [targetProbe, ...controls] = await Promise.all([
        probe("Узел назначения", target.url.href),
        ...route.CONTROL_ENDPOINTS.map(item => probe(item.name, item.url))
      ]);
      const classification = route.classifyRoute(targetProbe, controls);
      const record = {
        checkedAt: new Date().toISOString(),
        host: target.host,
        target: target.url.origin + target.url.pathname,
        status: classification.status,
        diagnosis: classification.diagnosis,
        dns,
        targetProbe,
        controls
      };

      render(record);
      message.textContent = "Диагностика завершена. Результат описывает только DNS и браузерную доступность выбранных HTTPS-узлов.";
      try {
        await root.browser.storage.local.set({ lastRouteCheck: record });
      } catch (error) {
        console.warn("HAPP Browser: не удалось сохранить результат route diagnostics", error);
      }
      await root.HappHistory?.add("Route", {
        status: record.status,
        diagnosis: record.diagnosis,
        host: record.host,
        dnsStatus: dns.status,
        resolvedAddresses: dns.addresses,
        isTRR: dns.isTRR,
        targetLatencyMs: targetProbe.latencyMs ?? null,
        controlsReachable: controls.filter(item => item.status === "reachable").length,
        controlsTotal: controls.length
      });
    } catch (error) {
      const messageText = error?.message || String(error);
      message.textContent = "Проверка не завершена: " + messageText;
      const record = {
        checkedAt: new Date().toISOString(),
        status: "inconclusive",
        diagnosis: "check-not-completed",
        host: "",
        dns: { status: "error", addresses: [], canonicalName: null, isTRR: null, error: messageText },
        targetProbe: { status: "unreachable", error: "not-run" },
        controls: []
      };
      try {
        await root.browser.storage.local.set({ lastRouteCheck: record });
      } catch (storageError) {
        console.warn("HAPP Browser: не удалось сохранить ошибку route diagnostics", storageError);
      }
      await root.HappHistory?.add("Route", { status: "inconclusive", diagnosis: "check-not-completed", message: messageText });
    } finally {
      button.disabled = false;
      button.textContent = "Повторить диагностику";
    }
  }

  button.addEventListener("click", run);
  root.browser.storage.local.get("lastRouteCheck").then(({ lastRouteCheck }) => {
    if (!lastRouteCheck) return;
    render(lastRouteCheck);
    message.textContent = "Показан последний сохранённый результат от " + new Date(lastRouteCheck.checkedAt).toLocaleString() + ". Запусти проверку заново для актуальных данных.";
    if (lastRouteCheck.target) input.value = lastRouteCheck.target;
  }).catch(() => {});
}
