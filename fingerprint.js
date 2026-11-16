(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else {
    root.HappFingerprint = api;
    if (root.document) initializeFingerprint(root, api);
  }
})(globalThis, function () {
  "use strict";

  const FIELDS = Object.freeze([
    ["userAgent", "User-Agent"],
    ["platform", "Платформа"],
    ["language", "Язык"],
    ["languages", "Языки"],
    ["timezone", "Часовой пояс"],
    ["screen", "Экран"],
    ["pixelRatio", "Device pixel ratio"],
    ["hardwareConcurrency", "Логические потоки CPU"],
    ["maxTouchPoints", "Сенсорные точки"],
    ["canvas", "Canvas readback"],
    ["webgl", "WebGL"]
  ]);

  function summarize(data) {
    const values = data && typeof data === "object" ? data : {};
    const observable = FIELDS.filter(([key]) => {
      const value = values[key];
      if (key === "canvas" || key === "webgl") return value?.status === "available";
      if (key === "languages") return Array.isArray(value) && value.length > 0;
      if (key === "screen") return value && Object.values(value).some(Number.isFinite);
      return value !== null && value !== undefined && value !== "";
    }).length;
    return {
      observable,
      total: FIELDS.length,
      label: observable + " из " + FIELDS.length + " параметров доступны для наблюдения"
    };
  }

  function normalize(data, executionContext = "page") {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new TypeError("Некорректный результат fingerprint-проверки.");
    }
    const text = (value, limit) => typeof value === "string" ? value.slice(0, limit) : null;
    const numeric = value => Number.isFinite(value) && value >= 0 ? value : null;
    const sourceScreen = data.screen && typeof data.screen === "object" ? data.screen : {};
    const sourceCanvas = data.canvas && typeof data.canvas === "object" ? data.canvas : {};
    const sourceWebgl = data.webgl && typeof data.webgl === "object" ? data.webgl : {};
    const canvasStatus = ["available", "blocked", "unavailable"].includes(sourceCanvas.status)
      ? sourceCanvas.status : "unavailable";
    const webglStatus = ["available", "blocked", "unavailable"].includes(sourceWebgl.status)
      ? sourceWebgl.status : "unavailable";
    const safeData = {
      userAgent: text(data.userAgent, 512),
      platform: text(data.platform, 128),
      language: text(data.language, 64),
      languages: Array.isArray(data.languages)
        ? data.languages.filter(value => typeof value === "string").slice(0, 10).map(value => value.slice(0, 64))
        : [],
      timezone: text(data.timezone, 128),
      screen: {
        width: numeric(sourceScreen.width),
        height: numeric(sourceScreen.height),
        availWidth: numeric(sourceScreen.availWidth),
        availHeight: numeric(sourceScreen.availHeight),
        colorDepth: numeric(sourceScreen.colorDepth),
        pixelDepth: numeric(sourceScreen.pixelDepth)
      },
      pixelRatio: numeric(data.pixelRatio),
      hardwareConcurrency: numeric(data.hardwareConcurrency),
      maxTouchPoints: numeric(data.maxTouchPoints),
      clientHints: { status: "unsupported", detail: "Firefox не предоставляет navigator.userAgentData." },
      canvas: {
        status: canvasStatus,
        hash: canvasStatus === "available" && /^[a-f0-9]{8}$/i.test(sourceCanvas.hash || "")
          ? sourceCanvas.hash : null
      },
      webgl: {
        status: webglStatus,
        vendor: text(sourceWebgl.vendor, 160),
        renderer: text(sourceWebgl.renderer, 240),
        debugInfo: sourceWebgl.debugInfo === true
      }
    };
    const context = executionContext === "page" ? "page" : "isolated";
    const summary = summarize(safeData);
    return {
      status: "observed",
      checkedAt: new Date().toISOString(),
      executionContext: context,
      data: safeData,
      summary
    };
  }

  return Object.freeze({ FIELDS, summarize, normalize });
});

function collectFingerprintPageData() {
  "use strict";
  const safeRead = callback => {
    try {
      const value = callback();
      return value === undefined ? null : value;
    } catch (_) {
      return null;
    }
  };
  const hash = value => {
    let result = 2166136261;
    for (let index = 0; index < value.length; index++) {
      result ^= value.charCodeAt(index);
      result = Math.imul(result, 16777619);
    }
    return (result >>> 0).toString(16).padStart(8, "0");
  };

  let canvas = { status: "unavailable", hash: null };
  try {
    const element = document.createElement("canvas");
    element.width = 240;
    element.height = 80;
    const context = element.getContext("2d");
    if (!context) {
      canvas = { status: "unavailable", hash: null };
    } else {
      context.textBaseline = "top";
      context.font = "14px Arial";
      context.fillStyle = "#246";
      context.fillRect(0, 0, 240, 80);
      context.fillStyle = "#f3a";
      context.fillText("HAPP Browser fingerprint", 8, 8);
      context.fillStyle = "rgba(120, 40, 180, 0.65)";
      context.fillRect(7, 35, 113, 19);
      const encoded = element.toDataURL("image/png");
      if (typeof encoded === "string" && encoded.startsWith("data:image/png")) {
        canvas = { status: "available", hash: hash(encoded) };
      } else {
        canvas = { status: "blocked", hash: null };
      }
    }
  } catch (_) {
    canvas = { status: "blocked", hash: null };
  }

  let webgl = { status: "unavailable", vendor: null, renderer: null, debugInfo: false };
  try {
    const element = document.createElement("canvas");
    const context = element.getContext("webgl") || element.getContext("experimental-webgl");
    if (context) {
      const extension = context.getExtension("WEBGL_debug_renderer_info");
      const vendor = extension
        ? context.getParameter(extension.UNMASKED_VENDOR_WEBGL)
        : context.getParameter(context.VENDOR);
      const renderer = extension
        ? context.getParameter(extension.UNMASKED_RENDERER_WEBGL)
        : context.getParameter(context.RENDERER);
      webgl = {
        status: "available",
        vendor: typeof vendor === "string" ? vendor.slice(0, 160) : null,
        renderer: typeof renderer === "string" ? renderer.slice(0, 240) : null,
        debugInfo: Boolean(extension)
      };
    }
  } catch (_) {
    webgl = { status: "blocked", vendor: null, renderer: null, debugInfo: false };
  }

  const screenData = safeRead(() => ({
    width: Number.isFinite(screen.width) ? screen.width : null,
    height: Number.isFinite(screen.height) ? screen.height : null,
    availWidth: Number.isFinite(screen.availWidth) ? screen.availWidth : null,
    availHeight: Number.isFinite(screen.availHeight) ? screen.availHeight : null,
    colorDepth: Number.isFinite(screen.colorDepth) ? screen.colorDepth : null,
    pixelDepth: Number.isFinite(screen.pixelDepth) ? screen.pixelDepth : null
  }));

  return {
    userAgent: safeRead(() => navigator.userAgent),
    platform: safeRead(() => navigator.platform),
    language: safeRead(() => navigator.language),
    languages: safeRead(() => Array.from(navigator.languages || []).slice(0, 10)),
    timezone: safeRead(() => Intl.DateTimeFormat().resolvedOptions().timeZone),
    screen: screenData,
    pixelRatio: safeRead(() => Number.isFinite(devicePixelRatio) ? devicePixelRatio : null),
    hardwareConcurrency: safeRead(() => Number.isFinite(navigator.hardwareConcurrency) ? navigator.hardwareConcurrency : null),
    maxTouchPoints: safeRead(() => Number.isFinite(navigator.maxTouchPoints) ? navigator.maxTouchPoints : null),
    clientHints: { status: "unsupported", detail: "Firefox не предоставляет navigator.userAgentData." },
    canvas,
    webgl
  };
}

function initializeFingerprint(root, api) {
  const button = root.document.querySelector("#run-fingerprint-check");
  const message = root.document.querySelector("#fingerprint-message");
  const results = root.document.querySelector("#fingerprint-results");
  if (!button || !message || !results) return;

  function addRow(label, value) {
    const row = root.document.createElement("div");
    row.className = "advanced-result-row";
    const name = root.document.createElement("span");
    name.textContent = label;
    const detail = root.document.createElement("strong");
    detail.textContent = value;
    row.append(name, detail);
    results.append(row);
  }

  function render(record) {
    results.replaceChildren();
    const data = record.data || {};
    const summary = root.document.createElement("div");
    summary.className = "fingerprint-summary";
    summary.textContent = record.summary?.label || api.summarize(data).label;
    results.append(summary);
    addRow("Контекст измерения", record.executionContext === "page"
      ? "JavaScript-контекст страницы"
      : "Изолированный контекст Firefox");
    addRow("User-Agent", data.userAgent || "Недоступен");
    addRow("Платформа", data.platform || "Недоступна");
    addRow("Язык / языки", [data.language, Array.isArray(data.languages) ? data.languages.join(", ") : ""].filter(Boolean).join(" · ") || "Недоступны");
    addRow("Часовой пояс", data.timezone || "Недоступен");
    const screen = data.screen;
    addRow("Экран", screen?.width && screen?.height
      ? screen.width + " × " + screen.height + " · " + (screen.colorDepth ?? "н/д") + " bit"
      : "Недоступен");
    addRow("Pixel ratio", data.pixelRatio ?? "Недоступен");
    addRow("Логические потоки CPU", data.hardwareConcurrency ?? "Недоступны");
    addRow("Сенсорные точки", data.maxTouchPoints ?? "Недоступны");
    addRow("Client Hints", data.clientHints?.detail || "Недоступны");
    addRow("Canvas", data.canvas?.status === "available"
      ? "Чтение доступно · локальный маркер " + data.canvas.hash
      : data.canvas?.status === "blocked" ? "Чтение заблокировано или завершилось ошибкой" : "Недоступно");
    addRow("WebGL", data.webgl?.status === "available"
      ? (data.webgl.vendor || "Vendor неизвестен") + " · " + (data.webgl.renderer || "Renderer неизвестен") + (data.webgl.debugInfo ? " · debug info доступен" : " · только стандартные параметры")
      : data.webgl?.status === "blocked" ? "Доступ заблокирован или завершился ошибкой" : "Недоступен");
    const note = root.document.createElement("p");
    note.className = "fingerprint-note";
    note.textContent = "Показано, какие характеристики удалось прочитать в текущей вкладке. Количество доступных параметров не является оценкой уникальности или риска. Canvas-маркер вычислен локально; данные не отправляются на сервер.";
    results.append(note);
  }

  async function run() {
    button.disabled = true;
    button.textContent = "Анализируем…";
    message.textContent = "Читаем характеристики активной вкладки. Данные не отправляются на сервер.";
    results.replaceChildren();
    try {
      if (!root.browser?.tabs || !root.browser?.scripting) {
        throw new Error("Firefox не предоставил scripting API.");
      }
      const tabs = await root.browser.tabs.query({ active: true, currentWindow: true });
      const tab = tabs[0];
      if (!tab || !Number.isInteger(tab.id)) throw new Error("Не удалось определить активную вкладку.");

      let injected;
      let executionContext = "page";
      try {
        injected = await root.browser.scripting.executeScript({
          target: { tabId: tab.id },
          world: "MAIN",
          func: collectFingerprintPageData
        });
        if (!injected?.[0] || injected[0].error || !injected[0].result) {
          throw injected?.[0]?.error || new Error("Страница не вернула данные.");
        }
      } catch (mainError) {
        executionContext = "isolated";
        injected = await root.browser.scripting.executeScript({
          target: { tabId: tab.id },
          world: "ISOLATED",
          func: collectFingerprintPageData
        });
        if (!injected?.[0] || injected[0].error || !injected[0].result) {
          throw injected?.[0]?.error || mainError;
        }
      }

      const record = api.normalize(injected[0].result, executionContext);
      await root.browser.storage.local.set({ lastFingerprintCheck: record });
      render(record);
      message.textContent = "Проверка завершена. Результат сохранён локально в Firefox.";
      await root.window?.HappHistory?.add("Fingerprint", {
        status: record.status,
        observable: record.summary.observable,
        total: record.summary.total,
        executionContext
      });
    } catch (error) {
      message.textContent = "Не удалось проверить эту вкладку: " + (error.message || String(error)) +
        ". Страницы Firefox, PDF и некоторые специальные вкладки не поддерживают внедрение скриптов.";
    } finally {
      button.disabled = false;
      button.textContent = "Проверить fingerprint";
    }
  }

  button.addEventListener("click", run);
  root.browser.storage.local.get("lastFingerprintCheck").then(({ lastFingerprintCheck }) => {
    if (!lastFingerprintCheck?.data) return;
    render(lastFingerprintCheck);
    message.textContent = "Показан последний сохранённый результат. Нажми кнопку, чтобы проверить активную вкладку заново.";
  }).catch(() => {});
}
