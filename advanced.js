
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
    const stored = await browser.storage.local.get(HISTORY_KEY);
    const items = Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : [];
    items.unshift({ id: crypto.randomUUID(), type, checkedAt: new Date().toISOString(), ...details });
    const limited = items.slice(0, HISTORY_LIMIT);
    await browser.storage.local.set({ [HISTORY_KEY]: limited });
    renderHistory(limited);
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
    title.textContent = item.type;
    const date = document.createElement("time");
    date.dateTime = item.checkedAt;
    date.textContent = new Date(item.checkedAt).toLocaleString();
    heading.append(title, date);
    const detail = document.createElement("p");
    if (item.status === "error") detail.textContent = "Ошибка: " + (item.message || "неизвестно");
    else if (item.type === "IP") detail.textContent = (item.ip || "IP не получен") + " · " + (item.country || "страна неизвестна");
    else if (item.type === "DNS") detail.textContent = item.resolvers + " резолверов · " + item.lookups + " наблюдений";
    else if (item.type === "WebRTC") detail.textContent = "Статус: " + item.status + " · ICE-кандидатов: " + (item.candidates ?? 0);
    else if (item.type === "IPv6") detail.textContent = "IPv4: " + (item.ipv4 || "нет") + " · IPv6: " + (item.ipv6 || "нет");
    else detail.textContent = (item.url || "") + " · " + item.status;
    card.append(heading, detail);
    historyList.append(card);
  }
}

async function loadHistory() {
  const stored = await browser.storage.local.get(HISTORY_KEY);
  renderHistory(Array.isArray(stored[HISTORY_KEY]) ? stored[HISTORY_KEY] : []);
}

async function runIpv6Check() {
  ipv6Button.disabled = true;
  ipv6Button.textContent = "Проверяем IPv6…";
  ipv6Results.replaceChildren();
  ipv6Message.textContent = "Проверяем IPv4 и IPv6 отдельно.";
  try {
    const [v4, v6] = await Promise.all([
      fetchJson("https://api4.ipify.org?format=json", {}, 8000).then(x => x.ip).catch(() => ""),
      fetchJson("https://api6.ipify.org?format=json", {}, 8000).then(x => x.ip).catch(() => "")
    ]);
    addRow(ipv6Results, "IPv4", v4 || "Недоступен");
    addRow(ipv6Results, "IPv6", v6 || "Недоступен");
    const note = document.createElement("p");
    note.className = "advanced-note";
    note.textContent = v6
      ? "IPv6 доступен из Firefox. Сам факт доступности не доказывает утечку: сравни адрес с ожидаемым VPN-выходом."
      : v4 ? "IPv6 endpoint недоступен, IPv4 работает. Возможно, IPv6-маршрут отсутствует или тестовый сервис недоступен."
      : "Оба endpoint недоступны. Результат неопределённый.";
    ipv6Results.append(note);
    ipv6Message.textContent = "Проверка завершена.";
    await window.HappHistory.add("IPv6", { status: v6 ? "available" : v4 ? "no-ipv6" : "inconclusive", ipv4: v4, ipv6: v6 });
  } catch (error) {
    ipv6Message.textContent = "Ошибка IPv6-проверки: " + (error.message || String(error));
    await window.HappHistory.add("IPv6", { status: "error", message: error.message || String(error) });
  } finally {
    ipv6Button.disabled = false;
    ipv6Button.textContent = "Повторить IPv6-тест";
  }
}

function normalizeSiteUrl(value) {
  const url = new URL(/^https?:\/\//i.test(value.trim()) ? value.trim() : "https://" + value.trim());
  if (!["http:", "https:"].includes(url.protocol)) throw new Error("Поддерживаются только HTTP и HTTPS.");
  if (url.username || url.password) throw new Error("URL с логином или паролем не поддерживается.");
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
    note.textContent = "Браузер скрывает HTTP-статус и содержимое ответа от расширения. Проверка подтверждает сетевой ответ, но не оценивает содержимое страницы.";
    siteResults.append(note);
    siteMessage.textContent = "Сайт ответил на запрос.";
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
  await browser.storage.local.remove(HISTORY_KEY);
  renderHistory([]);
});
loadHistory().catch(() => renderHistory([]));
