const ipv6Button = document.querySelector("#run-ipv6-check");
const ipv6Message = document.querySelector("#ipv6-message");
const ipv6Results = document.querySelector("#ipv6-results");
const siteInput = document.querySelector("#site-url");
const siteButton = document.querySelector("#run-site-check");
const siteMessage = document.querySelector("#site-message");
const siteResults = document.querySelector("#site-results");
const historyList = document.querySelector("#history-list");
const historyClear = document.querySelector("#clear-history");
const HISTORY_KEY = "checkHistory";
const HISTORY_LIMIT = 50;

window.HappHistory = {
  async add(type, details) {
    try {
      const stored = await browser.storage.local.get(HISTORY_KEY);
      const items = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
      items.unshift({ id: crypto.randomUUID(), type, checkedAt: new Date().toISOString(), ...details });
      const limited = items.slice(0, HISTORY_LIMIT);
      await browser.storage.local.set({ [HISTORY_KEY]: limited });
      renderHistory(limited);
    } catch (error) {
      console.warn("HAPP Browser: не удалось сохранить историю", error);
    }
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
  historyList.replaceChildren();
  if (!items.length) {
    const empty = document.createElement("p");
    empty.className = "advanced-note";
    empty.textContent = "Проверок пока нет.";
    historyList.append(empty);
    return;
  }
  for (const item of items) {
    const card = document.createElement("article");
    card.className = "history-item";
    const heading = document.createElement("div");
    heading.className = "history-top";
    const title = document.createElement("strong");
    title.textContent = item.type || "Проверка";
    const date = document.createElement("time");
    date.dateTime = item.checkedAt || "";
    const parsedDate = new Date(item.checkedAt);
    date.textContent = Number.isNaN(parsedDate.getTime()) ? "Дата неизвестна" : parsedDate.toLocaleString();
    heading.append(title, date);
    const detail = document.createElement("p");
    if (item.status === "error") detail.textContent = "Ошибка: " + (item.message || "неизвестно");
    else if (item.type === "IP") detail.textContent = (item.ip || "IP не получен") + " · " + (item.country || "страна неизвестна");
    else if (item.type === "DNS") detail.textContent = item.status === "observed" ? item.resolvers + " резолверов · " + item.lookups + " наблюдений" : "Недостаточно DNS-данных";
    else if (item.type === "WebRTC") detail.textContent = "Вердикт: " + item.status + " · ICE: " + (item.candidates ?? 0) + " · сравнено: " + (item.compared ?? 0);
    else if (item.type === "IPv6") detail.textContent = "IPv4: " + (item.ipv4 || "нет") + " · IPv6: " + (item.ipv6 || "нет");
    else detail.textContent = (item.url || "") + " · " + item.status;
    card.append(heading, detail);
    historyList.append(card);
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
    const v4 = typeof v4Result === "string" && /^\d{1,3}(?:\.\d{1,3}){3}$/.test(v4Result) ? v4Result : "";
    const v6 = typeof v6Result === "string" && v6Result.includes(":") ? v6Result : "";
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
    const status = v4 || v6 ? "observed" : "inconclusive";
    ipv6Message.textContent = status === "observed" ? "Проверка завершена; смотри доступность каждого протокола отдельно." : "Недостаточно данных.";
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
