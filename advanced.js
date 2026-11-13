const ipv6Button = document.querySelector("#run-ipv6-check");
const ipv6Message = document.querySelector("#ipv6-message");
const ipv6Results = document.querySelector("#ipv6-results");
const siteInput = document.querySelector("#site-url");
const siteButton = document.querySelector("#run-site-check");
const siteMessage = document.querySelector("#site-message");
const siteResults = document.querySelector("#site-results");
const historyList = document.querySelector("#history-list");
const historyClear = document.querySelector("#clear-history");
const historyFilter = document.querySelector("#history-filter");
const historySummary = document.querySelector("#timeline-summary");
let historyItems = [];
const HISTORY_KEY = "checkHistory";
const HISTORY_LIMIT = 50;

let historyWriteQueue = Promise.resolve();

window.HappHistory = {
  async add(type, details) {
    const write = historyWriteQueue.then(async () => {
      const stored = await browser.storage.local.get(HISTORY_KEY);
      const items = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
      items.unshift({ id: crypto.randomUUID(), type, checkedAt: new Date().toISOString(), ...details });
      const limited = items.slice(0, HISTORY_LIMIT);
      await browser.storage.local.set({ [HISTORY_KEY]: limited });
      renderHistory(limited);
      await refreshSecuritySummary();
    });
    historyWriteQueue = write.catch(error => {
      console.warn("HAPP Browser: не удалось сохранить историю", error);
    });
    await historyWriteQueue;
  }
};

function addRow(container, label, value) {
  const row = document.createElement("div");
  row.className = "advanced-result-row";
  const left = document.createElement("span");
  left.textContent = label;
  const right = document.createElement("strong");
  right.textContent = value;
  row.append(left, right);
  container.append(row);
}
function renderHistory(items) {
  historyItems = Array.isArray(items) ? items.slice(0, HISTORY_LIMIT) : [];
  const summary = window.HappTimeline.summarizeHistory(historyItems);
  historySummary.replaceChildren();
  for (const [value, label] of [
    [summary.total, "ЗАПИСЕЙ"],
    [summary.last24Hours, "ЗА 24 ЧАСА"],
    [summary.types, "ТИПОВ ТЕСТОВ"]
  ]) {
    const metric = document.createElement("div");
    metric.className = "timeline-metric";
    const number = document.createElement("strong");
    number.textContent = String(value);
    const caption = document.createElement("span");
    caption.textContent = label;
    metric.append(number, caption);
    historySummary.append(metric);
  }

  historyList.replaceChildren();
  const filtered = window.HappTimeline.filterHistory(historyItems, historyFilter.value);
  if (!filtered.length) {
    const empty = document.createElement("p");
    empty.className = "advanced-note";
    empty.textContent = historyItems.length
      ? "Для выбранного типа проверок записей нет."
      : "Проверок пока нет. Запусти диагностику — события появятся здесь.";
    historyList.append(empty);
    return;
  }

  for (const group of window.HappTimeline.groupByDay(filtered)) {
    const groupHeading = document.createElement("h3");
    groupHeading.className = "timeline-day";
    groupHeading.textContent = group.label;
    historyList.append(groupHeading);

    const track = document.createElement("div");
    track.className = "timeline-track";
    for (const item of group.items) {
      const card = document.createElement("article");
      card.className = "timeline-event";
      const marker = document.createElement("span");
      marker.className = "timeline-marker";
      const status = window.HappTimeline.getStatus(item);
      marker.dataset.state = status.state;

      const body = document.createElement("div");
      body.className = "timeline-event-body";
      const heading = document.createElement("div");
      heading.className = "timeline-event-heading";
      const title = document.createElement("strong");
      title.textContent = window.HappTimeline.TYPE_LABELS[item.type] || item.type || "Проверка";
      const badge = document.createElement("span");
      badge.className = "timeline-status";
      badge.dataset.state = status.state;
      badge.textContent = status.label;
      heading.append(title, badge);

      const detail = document.createElement("p");
      detail.textContent = window.HappTimeline.describe(item);
      const comparison = document.createElement("p");
      comparison.className = "timeline-change";
      const previous = window.HappTimeline.findPrevious(item, historyItems);
      const change = window.HappTimeline.compareEvents(item, previous);
      comparison.dataset.state = change.state;
      comparison.textContent = change.label + " · " + change.detail;
      const date = document.createElement("time");
      const parsedDate = new Date(item.checkedAt);
      date.dateTime = Number.isNaN(parsedDate.getTime()) ? "" : parsedDate.toISOString();
      date.textContent = Number.isNaN(parsedDate.getTime())
        ? "Время неизвестно"
        : parsedDate.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      body.append(heading, detail, comparison, date);
      card.append(marker, body);
      track.append(card);
    }
    historyList.append(track);
  }
}
async function loadHistory() {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  renderHistory(Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY].slice(0, HISTORY_LIMIT) : []);
}
async function runIpv6Check() {
  ipv6Button.disabled = true;
  ipv6Button.textContent = "Проверяем IPv6…";
  ipv6Results.replaceChildren();
  ipv6Message.textContent = "Проверяем IPv4 и IPv6 независимо.";
  try {
    const [v4Result, v6Result] = await Promise.all([
      fetchJson("https://api4.ipify.org?format=json", {}, 9000).then(x => x.ip).catch(() => ""),
      fetchJson("https://api6.ipify.org?format=json", {}, 9000).then(x => x.ip).catch(() => "")
    ]);
    const v4 = window.HappValidation.validIPv4(v4Result) ? v4Result : "";
    const v6 = window.HappValidation.validIPv6(v6Result) ? v6Result : "";
    addRow(ipv6Results, "IPv4", v4 || "Недоступен");
    addRow(ipv6Results, "IPv6", v6 || "Недоступен");
    const note = document.createElement("p");
    note.className = "advanced-note";
    note.textContent = v4 && v6
      ? "Оба протокола доступны. Это не доказывает утечку: сравни адреса с ожидаемыми VPN-выходами для IPv4 и IPv6."
      : v4 ? "IPv4 доступен, IPv6 endpoint не ответил. Это может означать отсутствие маршрута IPv6 или недоступность тестового сервиса."
      : v6 ? "IPv6 доступен, IPv4 endpoint не ответил. Результат IPv4 неопределённый."
      : "Ни один endpoint не ответил. Невозможно сделать вывод о доступности протоколов.";
    ipv6Results.append(note);
    const status = v4 && v6 ? "observed" : v4 || v6 ? "partial" : "inconclusive";
    ipv6Message.textContent = status === "observed"
      ? "Оба протокола доступны; это не подтверждает, что оба маршрутизируются через VPN."
      : status === "partial"
        ? "Получен частичный результат: доступен только один протокол. Второй остаётся неопределённым."
        : "Недостаточно данных по обоим протоколам.";
    await window.HappHistory.add("IPv6", { status, ipv4: v4, ipv6: v6 });
  } catch (error) {
    ipv6Message.textContent = "Ошибка IPv6-проверки: " + (error.message || String(error));
    await window.HappHistory.add("IPv6", { status: "error", message: error.message || String(error) });
  } finally {
    ipv6Button.disabled = false;
    ipv6Button.textContent = "Повторить IPv6-тест";
  }
}
function normalizeSiteUrl(value) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Введи адрес сайта.");
  const url = new URL(/^https?:\/\//i.test(trimmed) ? trimmed : "https://" + trimmed);
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Поддерживаются только HTTP и HTTPS.");
  if (url.username || url.password) throw new Error("URL с логином или паролем не поддерживается.");
  if (!url.hostname.includes(".") && url.hostname !== "localhost") throw new Error("Укажи полное доменное имя или localhost.");
  return url;
}
async function runSiteCheck() {
  siteButton.disabled = true;
  siteButton.textContent = "Проверяем сайт…";
  siteResults.replaceChildren();
  try {
    const url = normalizeSiteUrl(siteInput.value);
    siteMessage.textContent = "Запрашиваем разрешение Firefox для " + url.host + "…";
    const granted = await browser.permissions.request({ origins: [url.origin + "/*"] });
    if (!granted) throw new Error("Разрешение для домена не предоставлено.");
    siteMessage.textContent = "Проверяем сетевую доступность…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      await fetch(url.href, { method: "GET", mode: "no-cors", redirect: "manual", cache: "no-store", credentials: "omit", signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    addRow(siteResults, "Адрес", url.href);
    addRow(siteResults, "Результат", "Сетевой ответ получен");
    const note = document.createElement("p");
    note.className = "advanced-note";
    note.textContent = "Firefox скрывает HTTP-статус и содержимое ответа от расширения. Проверка подтверждает только сетевой ответ, а не доступность содержимого страницы.";
    siteResults.append(note);
    siteMessage.textContent = "Сетевой ответ получен.";
    await window.HappHistory.add("Сайт", { status: "reachable", url: url.href });
  } catch (error) {
    const message = error.name === "AbortError" ? "Таймаут 10 секунд." : error.message || String(error);
    siteMessage.textContent = "Проверка не пройдена: " + message;
    await window.HappHistory.add("Сайт", { status: "error", url: siteInput.value.trim(), message });
  } finally {
    siteButton.disabled = false;
    siteButton.textContent = "Проверить сайт";
  }
}
ipv6Button.addEventListener("click", runIpv6Check);
siteButton.addEventListener("click", runSiteCheck);
historyFilter.addEventListener("change", () => renderHistory(historyItems));
historyClear.addEventListener("click", async () => {
  historyClear.disabled = true;
  try {
    await browser.storage.local.remove(HISTORY_KEY);
    renderHistory([]);
  } finally {
    historyClear.disabled = false;
  }
});
loadHistory().catch(() => renderHistory([]));


// 0.7.0 — export the latest diagnostic snapshot and recent history.
const reportExportButton = document.querySelector("#export-report");
const reportCopyButton = document.querySelector("#copy-report");
const reportMessage = document.querySelector("#report-message");

async function buildDiagnosticReport() {
  const stored = await browser.storage.local.get([
    "lastIpCheck",
    "lastDnsCheck",
    "lastWebRtcCheck",
    HISTORY_KEY
  ]);
  const history = Array.isArray(stored[HISTORY_KEY])
    ? stored[HISTORY_KEY].slice(0, HISTORY_LIMIT)
    : [];

  return {
    reportVersion: 1,
    application: {
      name: "HAPP Browser",
      version: "0.10.0",
      platform: "Firefox"
    },
    generatedAt: new Date().toISOString(),
    privacyNotice: "This report may contain public IP addresses, DNS resolver addresses, WebRTC ICE candidates, and tested URLs. Review it before sharing.",
    latestChecks: {
      publicIp: stored.lastIpCheck || null,
      dns: stored.lastDnsCheck || null,
      webRtc: stored.lastWebRtcCheck || null,
      ipv6: history.find(item => item.type === "IPv6") || null,
      website: history.find(item => item.type === "Сайт") || null
    },
    recentHistory: history
  };
}

async function exportDiagnosticReport() {
  reportExportButton.disabled = true;
  reportMessage.textContent = "Формируем отчёт…";
  try {
    const report = await buildDiagnosticReport();
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `happ-browser-report-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    reportMessage.textContent = "JSON-отчёт подготовлен. Проверь его перед отправкой.";
  } catch (error) {
    reportMessage.textContent = "Не удалось сформировать отчёт: " + (error.message || String(error));
  } finally {
    reportExportButton.disabled = false;
  }
}

async function copyDiagnosticReport() {
  reportCopyButton.disabled = true;
  reportMessage.textContent = "Формируем отчёт…";
  try {
    const report = await buildDiagnosticReport();
    await navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    reportMessage.textContent = "Отчёт скопирован. Проверь его перед отправкой.";
  } catch (error) {
    reportMessage.textContent = "Не удалось скопировать отчёт: " + (error.message || String(error));
  } finally {
    reportCopyButton.disabled = false;
  }
}

reportExportButton.addEventListener("click", exportDiagnosticReport);
reportCopyButton.addEventListener("click", copyDiagnosticReport);


// 0.8.0 — compare a saved connection snapshot with the current diagnostics.
const profileLabelInput = document.querySelector("#profile-label");
const saveProfileButton = document.querySelector("#save-profile");
const compareProfileButton = document.querySelector("#compare-profile");
const profileMessage = document.querySelector("#profile-message");
const profileResults = document.querySelector("#profile-results");
const PROFILE_KEY = "connectionProfileSnapshot";

async function readConnectionSnapshot() {
  const stored = await browser.storage.local.get([
    "lastIpCheck", "lastDnsCheck", "lastWebRtcCheck", HISTORY_KEY
  ]);
  const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
  const latest = type => history.find(item => item.type === type) || null;
  return {
    capturedAt: new Date().toISOString(),
    ip: stored.lastIpCheck || null,
    dns: stored.lastDnsCheck || null,
    webRtc: stored.lastWebRtcCheck || null,
    ipv6: latest("IPv6"),
    website: latest("Сайт")
  };
}

function renderProfileComparison(rows) {
  profileResults.replaceChildren();
  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "profile-diff-row";
    const heading = document.createElement("strong");
    heading.textContent = item.label;
    const detail = document.createElement("span");
    detail.textContent = item.detail;
    const state = document.createElement("em");
    state.dataset.state = item.state;
    state.textContent = item.state === "changed" ? "ИЗМЕНИЛОСЬ"
      : item.state === "same" ? "БЕЗ ИЗМЕНЕНИЙ" : "НЕТ ДАННЫХ";
    row.append(heading, detail, state);
    profileResults.append(row);
  }
}

function compareValues(before, after, label, formatter = value => String(value)) {
  if (before == null || after == null || before === "" || after === "") {
    return { label, state: "missing", detail: "Недостаточно данных в одном из снимков." };
  }
  const same = JSON.stringify(before) === JSON.stringify(after);
  return {
    label,
    state: same ? "same" : "changed",
    detail: "До: " + formatter(before) + " · Сейчас: " + formatter(after)
  };
}

async function saveConnectionProfile() {
  saveProfileButton.disabled = true;
  profileMessage.textContent = "Сохраняем снимок…";
  try {
    const snapshot = await readConnectionSnapshot();
    if (!snapshot.ip && !snapshot.dns && !snapshot.webRtc && !snapshot.ipv6 && !snapshot.website) {
      throw new Error("Сначала запусти хотя бы одну диагностику.");
    }
    const label = profileLabelInput.value.trim() || "Профиль подключения";
    await browser.storage.local.set({ [PROFILE_KEY]: { label, ...snapshot } });
    profileMessage.textContent = `Снимок «${label}» сохранён. Теперь переключи VPN и повтори проверки.`;
    profileResults.replaceChildren();
  } catch (error) {
    profileMessage.textContent = "Не удалось сохранить снимок: " + (error.message || String(error));
  } finally {
    saveProfileButton.disabled = false;
  }
}

async function compareConnectionProfile() {
  compareProfileButton.disabled = true;
  profileMessage.textContent = "Сравниваем результаты…";
  try {
    const stored = await browser.storage.local.get(PROFILE_KEY);
    const baseline = stored[PROFILE_KEY];
    if (!baseline) throw new Error("Сначала сохрани исходный профиль.");
    const current = await readConnectionSnapshot();
    const rows = [
      compareValues(baseline.ip?.ip, current.ip?.ip, "Public IP"),
      compareValues(baseline.ip?.country, current.ip?.country, "Страна"),
      compareValues(
        baseline.dns?.resolvers?.map(item => item.ip).sort() || null,
        current.dns?.resolvers?.map(item => item.ip).sort() || null,
        "DNS-резолверы",
        value => Array.isArray(value) ? (value.join(", ") || "не обнаружены") : String(value)
      ),
      compareValues(baseline.webRtc?.verdict, current.webRtc?.verdict, "WebRTC verdict"),
      compareValues(baseline.ipv6?.ipv4, current.ipv6?.ipv4, "IPv4"),
      compareValues(baseline.ipv6?.ipv6, current.ipv6?.ipv6, "IPv6"),
      compareValues(baseline.website?.status, current.website?.status, "Доступность сайта")
    ];
    renderProfileComparison(rows);
    const changed = rows.filter(item => item.state === "changed").length;
    const missing = rows.filter(item => item.state === "missing").length;
    profileMessage.textContent = `«${baseline.label}» → текущее состояние: ${changed} изменений, ${missing} пунктов без данных. Сравнение не является автоматическим вердиктом об утечке.`;
  } catch (error) {
    profileMessage.textContent = "Не удалось сравнить профили: " + (error.message || String(error));
    profileResults.replaceChildren();
  } finally {
    compareProfileButton.disabled = false;
  }
}

saveProfileButton.addEventListener("click", saveConnectionProfile);
compareProfileButton.addEventListener("click", compareConnectionProfile);
browser.storage.local.get(PROFILE_KEY).then(({ [PROFILE_KEY]: profile }) => {
  if (profile) profileMessage.textContent = `Сохранён снимок «${profile.label}» от ${new Date(profile.capturedAt).toLocaleString()}.`;
}).catch(() => {});


// 0.9.0 — transparent diagnostic coverage and findings summary.
const securityRefreshButton = document.querySelector("#refresh-security");
const securityCoverageValue = document.querySelector("#security-coverage-value");
const securityMeter = document.querySelector(".security-meter");
const securityMeterFill = document.querySelector("#security-meter-fill");
const securityMessage = document.querySelector("#security-summary-message");
const securityResults = document.querySelector("#security-summary-results");

function securityRow(label, status, detail) {
  return { label, status, detail };
}

function renderSecuritySummary(rows) {
  securityResults.replaceChildren();
  for (const item of rows) {
    const row = document.createElement("div");
    row.className = "security-result-row";
    const title = document.createElement("strong");
    title.textContent = item.label;
    const badge = document.createElement("em");
    badge.dataset.state = item.status;
    badge.textContent = ({
      pass: "ПОЛУЧЕНЫ ДАННЫЕ",
      review: "НУЖНА ПРОВЕРКА",
      warning: "ЕСТЬ НЕСОВПАДЕНИЕ",
      incomplete: "НЕДОСТАТОЧНО ДАННЫХ",
      error: "ОШИБКА",
      missing: "НЕ ЗАПУСКАЛАСЬ"
    })[item.status] || "НЕИЗВЕСТНО";
    const detail = document.createElement("span");
    detail.textContent = item.detail;
    row.append(title, badge, detail);
    securityResults.append(row);
  }
}

async function refreshSecuritySummary() {
  securityRefreshButton.disabled = true;
  securityMessage.textContent = "Собираем последние результаты…";
  try {
    const stored = await browser.storage.local.get([
      "lastIpCheck", "lastDnsCheck", "lastWebRtcCheck", HISTORY_KEY
    ]);
    const history = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
    const latest = type => history.find(item => item.type === type) || null;
    const ip = stored.lastIpCheck || latest("IP");
    const dns = stored.lastDnsCheck || null;
    const rtc = stored.lastWebRtcCheck || null;
    const ipv6 = latest("IPv6");

    const rows = [];
    rows.push(ip?.status === "success"
      ? securityRow("Public IP", "pass", `${ip.ip || "IP получен"} · ${ip.country || "страна не определена"}`)
      : ip?.status === "error"
        ? securityRow("Public IP", "error", ip.message || "Не удалось получить внешний IP.")
        : securityRow("Public IP", "missing", "Запусти базовую проверку подключения."));

    rows.push(dns?.verdict === "observed"
      ? securityRow("DNS", "review", `${dns.resolvers?.length || 0} резолверов обнаружено. Сверь их с DNS-провайдером VPN.`)
      : dns?.verdict === "insufficient-data"
        ? securityRow("DNS", "incomplete", "Тест завершился без достаточных наблюдений.")
        : dns?.verdict === "error" || latest("DNS")?.status === "error"
          ? securityRow("DNS", "error", dns?.message || latest("DNS")?.message || "DNS-тест завершился ошибкой.")
          : securityRow("DNS", "missing", "Запусти DNS-тест."));

    rows.push(rtc?.verdict === "possible-leak"
      ? securityRow("WebRTC", "warning", `${rtc.mismatches || 0} публичных ICE-адресов не совпали с контрольными IP.`)
      : rtc?.verdict === "no-mismatch"
        ? securityRow("WebRTC", "pass", "Среди сопоставленных публичных ICE-адресов несовпадений нет.")
        : rtc?.verdict === "inconclusive"
          ? securityRow("WebRTC", "incomplete", "Недостаточно данных для надёжного сравнения.")
          : rtc?.verdict === "error" || latest("WebRTC")?.status === "error"
            ? securityRow("WebRTC", "error", rtc?.message || latest("WebRTC")?.message || "WebRTC-тест завершился ошибкой.")
            : securityRow("WebRTC", "missing", "Запусти WebRTC-тест."));

    rows.push(ipv6?.status === "observed"
      ? securityRow("IPv4 / IPv6", "review", `IPv4: ${ipv6.ipv4 || "недоступен"} · IPv6: ${ipv6.ipv6 || "недоступен"}. Наличие IPv6 само по себе не является утечкой.`)
      : ipv6?.status === "partial"
        ? securityRow("IPv4 / IPv6", "incomplete", "Получен частичный результат: доступен только один протокол.")
        : ipv6?.status === "inconclusive"
          ? securityRow("IPv4 / IPv6", "incomplete", "Не удалось определить доступность протоколов.")
        : ipv6?.status === "error"
          ? securityRow("IPv4 / IPv6", "error", ipv6.message || "IPv6-тест завершился ошибкой.")
          : securityRow("IPv4 / IPv6", "missing", "Запусти проверку IPv4 / IPv6."));

    const completed = rows.filter(item => !["missing", "error"].includes(item.status)).length;
    const coverage = Math.round(completed / rows.length * 100);
    securityCoverageValue.textContent = coverage + "%";
    securityMeter.setAttribute("aria-valuenow", String(coverage));
    securityMeterFill.style.width = coverage + "%";
    renderSecuritySummary(rows);

    const warnings = rows.filter(item => item.status === "warning").length;
    const reviews = rows.filter(item => item.status === "review").length;
    const incomplete = rows.filter(item => ["missing", "incomplete", "error"].includes(item.status)).length;
    securityMessage.textContent = warnings
      ? `Есть ${warnings} результат(а) с несовпадениями. Изучи подробности ниже.`
      : reviews
        ? `Автоматических несовпадений WebRTC не отмечено, но ${reviews} проверк(а/и) требуют ручной интерпретации.`
        : incomplete
          ? "Часть проверок ещё не запускалась или не дала достаточно данных."
          : "Проверки имеют результаты. Это не является гарантией отсутствия утечек.";
  } catch (error) {
    securityMessage.textContent = "Не удалось собрать сводку: " + (error.message || String(error));
  } finally {
    securityRefreshButton.disabled = false;
  }
}

securityRefreshButton.addEventListener("click", refreshSecuritySummary);
refreshSecuritySummary();
