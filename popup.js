const button = document.querySelector("#run-check");
const message = document.querySelector("#check-message");
const overall = document.querySelector("#overall-status");
const ipValue = document.querySelector("#ip-value");
const ipDetail = document.querySelector("#ip-detail");
const countryValue = document.querySelector("#country-value");
const countryDetail = document.querySelector("#country-detail");
const ipDot = document.querySelector("#ip-dot");
const countryDot = document.querySelector("#country-dot");

const dnsButton = document.querySelector("#run-dns-check");
const dnsMessage = document.querySelector("#dns-message");
const dnsResults = document.querySelector("#dns-results");

function setResultState(state) {
  overall.dataset.state = state;
  ipDot.dataset.state = state;
  countryDot.dataset.state = state;
}

async function fetchJson(url, options = {}, timeoutMs = 10000) {
  const response = await fetch(url, {
    cache: "no-store",
    ...options,
    signal: AbortSignal.timeout(timeoutMs)
  });
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return response.json();
}

async function checkPublicIp() {
  button.disabled = true;
  button.textContent = "Проверяем…";
  message.textContent = "Получаем внешний IP и страну через ipwho.is.";
  overall.textContent = "ПРОВЕРКА";
  setResultState("idle");

  try {
    const data = await fetchJson("https://ipwho.is/", { method: "GET" }, 12000);
    if (data.success !== true || typeof data.ip !== "string" || typeof data.country !== "string") {
      throw new Error(data.message || "Сервис не вернул корректные данные об IP.");
    }

    ipValue.textContent = data.ip;
    ipDetail.textContent = data.type ? `Тип адреса: ${data.type}` : "Внешний IP-адрес";
    countryValue.textContent = data.country;
    countryDetail.textContent = data.country_code ? `Код страны: ${data.country_code}` : "Страна выхода в интернет";
    overall.textContent = "IP ПОЛУЧЕН";
    setResultState("success");
    message.textContent = "Базовая проверка завершена. Это показывает внешний IP, но само по себе не доказывает отсутствие утечек.";
    await browser.storage.local.set({
      lastIpCheck: {
        ip: data.ip,
        country: data.country,
        countryCode: data.country_code || null,
        checkedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    overall.textContent = "ОШИБКА";
    setResultState("error");
    message.textContent = error.name === "TimeoutError"
      ? "Сервис проверки не ответил за 12 секунд. Попробуй ещё раз."
      : `Не удалось получить данные: ${error.message || String(error)}`;
    ipValue.textContent = "Недоступно";
    countryValue.textContent = "Недоступно";
    ipDetail.textContent = "Проверка не выполнена";
    countryDetail.textContent = "Проверка не выполнена";
  } finally {
    button.disabled = false;
    button.textContent = "Проверить подключение";
  }
}

function renderDnsResults(data) {
  dnsResults.replaceChildren();
  const heading = document.createElement("div");
  heading.className = "dns-summary";
  heading.textContent = data.resolvers.length
    ? `Обнаружено DNS-резолверов: ${data.resolvers.length}`
    : "DNS-резолверы пока не обнаружены";
  dnsResults.append(heading);

  for (const resolver of data.resolvers) {
    const row = document.createElement("div");
    row.className = "resolver-row";
    const address = document.createElement("strong");
    address.textContent = resolver.ip;
    const details = document.createElement("span");
    const country = resolver.countryCode || "Страна не определена";
    const network = resolver.asnName || resolver.asn || resolver.network || "";
    details.textContent = [country, network].filter(Boolean).join(" · ");
    row.append(address, details);
    dnsResults.append(row);
  }

  const note = document.createElement("p");
  note.className = "dns-disclaimer";
  note.textContent = "Это наблюдения DNS-сервиса за конкретными тестовыми запросами, а не автоматический вердикт об утечке. Сверь найденные сети с DNS-провайдером, который должен использовать твой VPN.";
  dnsResults.append(note);
}

async function runDnsCheck() {
  dnsButton.disabled = true;
  dnsButton.textContent = "Выполняем тест…";
  dnsMessage.textContent = "Создаём уникальные имена и отправляем DNS-запросы. Это может занять несколько секунд.";
  dnsResults.replaceChildren();

  try {
    const session = await fetchJson("https://dnsleak.dev/api/new", { method: "GET" }, 10000);
    const testId = session.testId;
    const hostnames = Array.isArray(session.hostnames) ? session.hostnames : [];
    const validId = typeof testId === "string" && /^[a-z0-9]{6,64}$/.test(testId);
    const expectedHost = new RegExp(`^${testId}-(?:a|q)\\d{2}\\.t\\.dnsleak\\.dev$`);
    if (!validId || hostnames.length < 2 || hostnames.length > 16 ||
        new Set(hostnames).size !== hostnames.length ||
        hostnames.some(name => typeof name !== "string" || !expectedHost.test(name))) {
      throw new Error("DNS-сервис вернул некорректные данные теста.");
    }

    await Promise.allSettled(hostnames.map(hostname =>
      fetch(`https://${hostname}/`, {
        method: "GET",
        mode: "no-cors",
        cache: "no-store",
        credentials: "omit",
        signal: AbortSignal.timeout(3500)
      })
    ));

    let result = null;
    for (let attempt = 0; attempt < 6; attempt += 1) {
      if (attempt > 0) await new Promise(resolve => setTimeout(resolve, 1000));
      result = await fetchJson(`https://dnsleak.dev/api/result/${encodeURIComponent(testId)}`, {}, 8000);
      if (result.testId !== testId) throw new Error("ID результата не совпадает с ID теста.");
      if (Array.isArray(result.resolvers) && result.resolvers.some(item =>
        item && item.role === "resolver" && Number(item.original) > 0 &&
        typeof item.ip === "string" && (item.sawA || item.sawQ))) break;
    }

    const resolvers = Array.isArray(result.resolvers)
      ? result.resolvers.filter(item =>
          item && item.role === "resolver" && Number(item.original) > 0 &&
          typeof item.ip === "string" && (item.sawA || item.sawQ))
        .filter((item, index, all) => all.findIndex(other => other.ip === item.ip) === index)
        .map(item => ({
          ip: item.ip,
          countryCode: typeof item.countryCode === "string" ? item.countryCode : "",
          asn: typeof item.asn === "string" ? item.asn : "",
          asnName: typeof item.asnName === "string" ? item.asnName : "",
          network: typeof item.network === "string" ? item.network : ""
        }))
      : [];

    const completed = Number(result.lookups) || 0;
    const testResult = {
      testId,
      checkedAt: new Date().toISOString(),
      clientIp: result.client && typeof result.client.ip === "string" ? result.client.ip : "",
      lookups: completed,
      requestedLookups: hostnames.length,
      resolvers
    };
    await browser.storage.local.set({ lastDnsCheck: testResult });
    renderDnsResults(testResult);
    dnsMessage.textContent = resolvers.length
      ? `Тест завершён. Получено ${completed} DNS-наблюдений.`
      : `Тест завершён, но резолверы не обнаружены (${completed} наблюдений). Результат неопределённый.`;
  } catch (error) {
    dnsMessage.textContent = `Не удалось завершить DNS-тест: ${error.message || String(error)}`;
  } finally {
    dnsButton.disabled = false;
    dnsButton.textContent = "Повторить DNS-тест";
  }
}

button.addEventListener("click", checkPublicIp);
dnsButton.addEventListener("click", runDnsCheck);

browser.storage.local.get("lastDnsCheck").then(({ lastDnsCheck }) => {
  if (!lastDnsCheck) return;
  renderDnsResults(lastDnsCheck);
  dnsMessage.textContent = "Показан последний сохранённый результат. Запусти тест заново для свежих данных.";
}).catch(() => {});
