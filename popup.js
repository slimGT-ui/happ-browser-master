const button = document.querySelector("#run-check");
const message = document.querySelector("#check-message");
const overall = document.querySelector("#overall-status");
const ipValue = document.querySelector("#ip-value");
const ipDetail = document.querySelector("#ip-detail");
const countryValue = document.querySelector("#country-value");
const countryDetail = document.querySelector("#country-detail");
const ipDot = document.querySelector("#ip-dot");
const countryDot = document.querySelector("#country-dot");

function setResultState(state) {
  overall.dataset.state = state;
  ipDot.dataset.state = state;
  countryDot.dataset.state = state;
}

async function checkPublicIp() {
  button.disabled = true;
  button.textContent = "Проверяем…";
  message.textContent = "Получаем внешний IP и страну через ipwho.is.";
  overall.textContent = "ПРОВЕРКА";
  setResultState("idle");

  try {
    const response = await fetch("https://ipwho.is/", {
      method: "GET",
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    });
    if (!response.ok) throw new Error(`Сервис вернул HTTP ${response.status}`);

    const data = await response.json();
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

button.addEventListener("click", checkPublicIp);