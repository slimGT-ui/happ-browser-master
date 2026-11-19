(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HappPrivacyAudit = api;
})(globalThis, function () {
  "use strict";

  const PRIVACY_PERMISSION = "privacy";

  const API_PERMISSION_LABELS = Object.freeze({
    storage: "storage — локальное хранение результатов",
    clipboardWrite: "clipboardWrite — копирование отчёта по действию пользователя",
    activeTab: "activeTab — временный доступ к активной вкладке",
    scripting: "scripting — запуск fingerprint-проверки в активной вкладке",
    dns: "dns — DNS-разрешение выбранного узла",
    privacy: "privacy — доступ к чтению и изменению настроек приватности Firefox (HAPP использует только чтение)"
  });

  const SETTING_DEFINITIONS = Object.freeze([
    {
      key: "peerConnectionEnabled",
      label: "WebRTC API",
      description: "Доступность RTCPeerConnection в страницах Firefox."
    },
    {
      key: "webRTCIPHandlingPolicy",
      label: "Политика WebRTC IP",
      description: "Ограничения интерфейсов и UDP для WebRTC."
    },
    {
      key: "networkPredictionEnabled",
      label: "Сетевое предсказание",
      description: "Предварительное DNS-разрешение, preconnect и prerender."
    },
    {
      key: "httpsOnlyMode",
      label: "HTTPS-Only Mode",
      description: "Принудительное использование HTTPS в Firefox."
    },
    {
      key: "globalPrivacyControl",
      label: "Global Privacy Control",
      description: "Отправка браузером сигнала GPC сайтам."
    }
  ]);

  const WEBRTC_POLICY_LABELS = Object.freeze({
    default: "Стандартная политика",
    default_public_and_private_interfaces: "Публичные и частные интерфейсы",
    default_public_interface_only: "Только публичный интерфейс",
    disable_non_proxied_udp: "Блокировка UDP вне прокси",
    proxy_only: "Только TURN TCP через прокси"
  });

  function stringArray(value) {
    return Array.isArray(value)
      ? [...new Set(value.filter(item => typeof item === "string" && item.length <= 512))].sort()
      : [];
  }

  function analyzePermissions(manifest, granted) {
    const declaredRequired = stringArray(manifest?.permissions);
    const declaredOptional = stringArray(manifest?.optional_permissions);
    const grantedPermissions = stringArray(granted?.permissions);
    const requiredHosts = stringArray(manifest?.host_permissions);
    const optionalHosts = stringArray(manifest?.optional_host_permissions);
    const grantedOrigins = stringArray(granted?.origins);

    const apiPermissions = [...new Set([...declaredRequired, ...declaredOptional])].map(name => ({
      name,
      label: API_PERMISSION_LABELS[name] || name,
      required: declaredRequired.includes(name),
      optional: declaredOptional.includes(name),
      granted: grantedPermissions.includes(name)
    }));

    const unrequestedGranted = grantedPermissions.filter(name =>
      !declaredRequired.includes(name) && !declaredOptional.includes(name)
    );

    return {
      apiPermissions,
      requiredHosts,
      optionalHosts,
      grantedOrigins,
      unrequestedGranted,
      summary: {
        declaredApi: apiPermissions.length,
        grantedApi: apiPermissions.filter(item => item.granted).length,
        requiredHostPatterns: requiredHosts.length,
        optionalHostPatterns: optionalHosts.length,
        grantedOriginPatterns: grantedOrigins.length,
        missingRequiredApi: apiPermissions.filter(item => item.required && !item.granted).map(item => item.name)
      }
    };
  }

  function normalizeSetting(definition, raw, error) {
    if (error) {
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        status: "error",
        value: null,
        defaultValue: null,
        levelOfControl: null,
        detail: String(error.message || error).slice(0, 240),
        recommendation: "incomplete"
      };
    }

    if (!raw || typeof raw !== "object" || !Object.prototype.hasOwnProperty.call(raw, "value")) {
      return {
        key: definition.key,
        label: definition.label,
        description: definition.description,
        status: "unsupported",
        value: null,
        defaultValue: null,
        levelOfControl: null,
        detail: "Эта настройка недоступна через Firefox WebExtensions API.",
        recommendation: "incomplete"
      };
    }

    const value = ["string", "boolean", "number"].includes(typeof raw.value) ? raw.value : null;
    const defaultValue = ["string", "boolean", "number"].includes(typeof raw.defaultValue) ? raw.defaultValue : null;
    const levelOfControl = typeof raw.levelOfControl === "string" ? raw.levelOfControl : "unknown";
    let detail = "";
    let recommendation = "info";

    if (definition.key === "peerConnectionEnabled") {
      detail = value === false
        ? "RTCPeerConnection отключён в Firefox."
        : value === true
          ? "RTCPeerConnection доступен. Само по себе это не доказывает утечку; оценивай вместе с политикой WebRTC и результатами ICE-теста."
          : "Состояние RTCPeerConnection не удалось определить.";
    } else if (definition.key === "webRTCIPHandlingPolicy") {
      detail = WEBRTC_POLICY_LABELS[value] || "Неизвестное значение политики WebRTC.";
      if (["default", "default_public_and_private_interfaces"].includes(value)) {
        recommendation = "review";
        detail += " Менее строгий режим; проверь результат WebRTC-теста.";
      } else if (["default_public_interface_only", "disable_non_proxied_udp", "proxy_only"].includes(value)) {
        detail += " Политика ограничивает часть сетевых интерфейсов или UDP, но не гарантирует отсутствие утечек.";
      }
    } else if (definition.key === "networkPredictionEnabled") {
      detail = value === true
        ? "Предварительные DNS-запросы и соединения включены; это может раскрывать домены до перехода на сайт."
        : value === false
          ? "Предварительное разрешение доменов и соединения отключены."
          : "Состояние сетевого предсказания неизвестно.";
      if (value === true) recommendation = "review";
    } else if (definition.key === "httpsOnlyMode") {
      detail = value === "always"
        ? "HTTPS-Only включён во всех окнах."
        : value === "private_browsing"
          ? "HTTPS-Only включён только в приватных окнах."
          : value === "never"
            ? "HTTPS-Only выключен."
            : "Неизвестное состояние HTTPS-Only.";
      if (value === "never") recommendation = "review";
    } else if (definition.key === "globalPrivacyControl") {
      detail = value === true
        ? "Firefox сообщает сайтам о предпочтении не продавать и не передавать персональные данные."
        : value === false
          ? "Сигнал GPC не отправляется."
          : "Состояние GPC неизвестно.";
    }

    if (levelOfControl === "controlled_by_other_extensions") {
      recommendation = "review";
      detail += " Настройка контролируется другим расширением.";
    } else if (levelOfControl === "controlled_by_this_extension") {
      detail += " Значение контролируется самим HAPP Browser.";
    } else if (levelOfControl === "not_controllable") {
      detail += " Firefox не позволяет расширениям управлять этой настройкой.";
    }

    return {
      key: definition.key,
      label: definition.label,
      description: definition.description,
      status: "available",
      value,
      defaultValue,
      levelOfControl,
      detail,
      recommendation
    };
  }

  function createAuditRecord(manifest, granted, settings, checkedAt = new Date().toISOString()) {
    const permissions = analyzePermissions(manifest, granted);
    const normalizedSettings = SETTING_DEFINITIONS.map(definition => {
      const entry = settings?.[definition.key];
      return normalizeSetting(definition, entry?.value, entry?.error);
    });
    const privacyGranted = permissions.apiPermissions.some(item => item.name === PRIVACY_PERMISSION && item.granted);
    const availableSettings = normalizedSettings.filter(item => item.status === "available").length;
    const reviewCount = normalizedSettings.filter(item => item.recommendation === "review").length;
    const status = availableSettings > 0 ? "observed" : "partial";

    return {
      checkedAt,
      status,
      privacyPermissionGranted: privacyGranted,
      permissions,
      settings: normalizedSettings,
      limitations: {
        dnsOverHttps: "Firefox WebExtensions API не раскрывает текущий режим, URL провайдера или fallback-политику DoH. isTRR в DNSRecord относится только к конкретному DNS-разрешению.",
        otherExtensions: "HAPP Browser не сканирует разрешения других расширений. Firefox management API не предоставляет полный список установленных расширений в поддерживаемом WebExtensions-интерфейсе.",
        systemProxy: "Системные proxy/VPN-настройки и полный маршрут трафика недоступны этому аудиту."
      },
      summary: {
        availableSettings,
        totalSettings: SETTING_DEFINITIONS.length,
        reviewCount,
        grantedApi: permissions.summary.grantedApi,
        declaredApi: permissions.summary.declaredApi,
        grantedOrigins: permissions.summary.grantedOriginPatterns
      }
    };
  }

  function summarizeRecord(record) {
    if (!record) return { status: "missing", detail: "Аудит ещё не запускался." };
    if (record.status === "error") return { status: "error", detail: record.message || "Аудит завершился ошибкой." };
    const summary = record.summary || {};
    if (record.status !== "observed") {
      return { status: "incomplete", detail: "Настройки приватности недоступны; проверь разрешение privacy и поддержку Firefox API." };
    }
    return summary.reviewCount > 0
      ? { status: "review", detail: summary.reviewCount + " настроек требуют внимания; " + summary.availableSettings + "/" + summary.totalSettings + " параметров прочитано." }
      : { status: "pass", detail: summary.availableSettings + "/" + summary.totalSettings + " параметров прочитано. Это не гарантия отсутствия утечек." };
  }

  async function readBrowserSettings(browserApi) {
    const network = browserApi?.privacy?.network;
    const output = {};
    await Promise.all(SETTING_DEFINITIONS.map(async definition => {
      const setting = network?.[definition.key];
      if (!setting || typeof setting.get !== "function") {
        output[definition.key] = null;
        return;
      }
      try {
        output[definition.key] = { value: await setting.get({}) };
      } catch (error) {
        output[definition.key] = { error };
      }
    }));
    return output;
  }

  function render(record, container) {
    if (!container) return;
    container.replaceChildren();

    const addHeading = (text, className = "privacy-audit-heading") => {
      const heading = document.createElement("div");
      heading.className = className;
      heading.textContent = text;
      container.append(heading);
    };
    const addRow = (title, detail, state = "info") => {
      const row = document.createElement("div");
      row.className = "privacy-audit-row";
      row.dataset.state = state;
      const name = document.createElement("strong");
      name.textContent = title;
      const value = document.createElement("span");
      value.textContent = detail;
      row.append(name, value);
      container.append(row);
    };

    const permissionSummary = record.permissions?.summary || {};
    addHeading("Разрешения HAPP Browser");
    addRow("API permissions", (permissionSummary.grantedApi ?? 0) + "/" + (permissionSummary.declaredApi ?? 0) + " выдано", permissionSummary.missingRequiredApi?.length ? "review" : "info");
    for (const item of record.permissions?.apiPermissions || []) {
      addRow(item.label, (item.required ? "Обязательное" : "Опциональное") + " · " + (item.granted ? "выдано" : "не выдано"), item.granted ? "info" : item.required ? "review" : "muted");
    }
    addRow("Обязательные host patterns", (record.permissions?.requiredHosts || []).join(", ") || "Нет", "info");
    addRow("Опциональные host patterns", (record.permissions?.optionalHosts || []).join(", ") || "Нет", "info");
    addRow("Фактически выданные origins", (record.permissions?.grantedOrigins || []).join(", ") || "Нет дополнительных origins", "info");

    addHeading("Настройки Firefox");
    for (const item of record.settings || []) {
      const value = item.value === null ? "Недоступно" : String(item.value);
      const control = item.levelOfControl ? " · контроль: " + item.levelOfControl : "";
      addRow(item.label, value + " · " + item.detail + control, item.recommendation === "review" ? "review" : item.status === "error" ? "error" : item.status === "unsupported" ? "muted" : "info");
    }

    addHeading("Границы аудита");
    addRow("DNS over HTTPS", record.limitations?.dnsOverHttps || "Не проверено", "muted");
    addRow("Другие расширения", record.limitations?.otherExtensions || "Не проверено", "muted");
    addRow("Системный proxy / VPN", record.limitations?.systemProxy || "Не проверено", "muted");

    const note = document.createElement("p");
    note.className = "privacy-audit-note";
    note.textContent = "Аудит только читает настройки. HAPP Browser не изменяет их, не отключает расширения и не отправляет результаты на сервер. Разрешение privacy технически позволяет расширению управлять некоторыми настройками, но в этом модуле используются только методы get().";
    container.append(note);
  }

  function init(root) {
    const button = root.document.querySelector("#run-privacy-audit");
    const message = root.document.querySelector("#privacy-audit-message");
    const results = root.document.querySelector("#privacy-audit-results");
    if (!button || !message || !results || !root.browser?.permissions?.getAll) return;

    async function run() {
      button.disabled = true;
      button.textContent = "Выполняем аудит…";
      message.textContent = "Читаем список разрешений HAPP Browser и доступные настройки Firefox.";
      results.replaceChildren();

      try {
        const [manifest, granted] = await Promise.all([
          Promise.resolve(root.browser.runtime.getManifest()),
          root.browser.permissions.getAll()
        ]);
        const privacyGranted = (granted.permissions || []).includes(PRIVACY_PERMISSION);
        const settings = privacyGranted ? await readBrowserSettings(root.browser) : {};
        const record = createAuditRecord(manifest, granted, settings);
        render(record, results);
        message.textContent = record.status === "observed"
          ? "Аудит завершён: прочитано " + record.summary.availableSettings + " из " + record.summary.totalSettings + " настроек Firefox."
          : "Список разрешений получен, но настройки Firefox недоступны. Возможно, Firefox ещё не применил новое разрешение.";
        try {
          await root.browser.storage.local.set({ lastPrivacyAudit: record });
        } catch (storageError) {
          message.textContent += " Результат показан, но не сохранён локально.";
        }
        await root.HappHistory?.add("Privacy", {
          status: record.status,
          settingsAvailable: record.summary.availableSettings,
          settingsTotal: record.summary.totalSettings,
          reviewCount: record.summary.reviewCount,
          grantedApi: record.summary.grantedApi,
          declaredApi: record.summary.declaredApi
        });
      } catch (error) {
        const record = {
          checkedAt: new Date().toISOString(),
          status: "error",
          message: String(error?.message || error).slice(0, 240),
          summary: { availableSettings: 0, totalSettings: SETTING_DEFINITIONS.length, reviewCount: 0 }
        };
        render(record, results);
        message.textContent = "Не удалось выполнить аудит: " + record.message;
        await root.HappHistory?.add("Privacy", { status: "error", message: record.message });
      } finally {
        button.disabled = false;
        button.textContent = "Повторить аудит приватности";
      }
    }

    button.addEventListener("click", run);
    root.browser.storage.local.get("lastPrivacyAudit").then(({ lastPrivacyAudit }) => {
      if (!lastPrivacyAudit) return;
      render(lastPrivacyAudit, results);
      message.textContent = "Показан последний сохранённый аудит от " + new Date(lastPrivacyAudit.checkedAt).toLocaleString() + ". Запусти повторно для актуальных данных.";
    }).catch(() => {});
  }

  return Object.freeze({
    PRIVACY_PERMISSION,
    API_PERMISSION_LABELS,
    SETTING_DEFINITIONS,
    analyzePermissions,
    normalizeSetting,
    createAuditRecord,
    summarizeRecord,
    readBrowserSettings,
    render,
    init
  });
});
