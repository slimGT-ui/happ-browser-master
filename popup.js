const STORAGE_KEYS = {
  enabled: "proxyEnabled",
  endpoint: "proxyEndpoint",
  original: "originalProxySettings"
};

const hostInput = document.querySelector("#proxy-host");
const portInput = document.querySelector("#proxy-port");
const toggleButton = document.querySelector("#toggle-proxy");
const statusText = document.querySelector("#connection-status");
const detailText = document.querySelector("#detail-message");
const statusIndicator = document.querySelector("#status-indicator");

let busy = false;

function setStatus(message, state = "idle", detail = "") {
  statusText.textContent = message;
  detailText.textContent = detail;
  statusIndicator.dataset.state = state;
}

function setBusy(value) {
  busy = value;
  toggleButton.disabled = value;
  toggleButton.textContent = value ? "Подожди…" : "Подключить Firefox";
}

function isValidPort(value) {
  const port = Number(value);
  return Number.isInteger(port) && port >= 1 && port <= 65535;
}

function isLoopbackHost(value) {
  const host = value.trim().toLowerCase();
  return host === "127.0.0.1" || host === "localhost" || host === "::1" || host === "[::1]";
}

function isOurProxy(value, endpoint) {
  return Boolean(
    value &&
    value.proxyType === "manual" &&
    value.socks === endpoint.host &&
    Number(value.socksPort) === endpoint.port &&
    Number(value.socksVersion) === 5
  );
}

async function readState() {
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.enabled,
    STORAGE_KEYS.endpoint,
    STORAGE_KEYS.original
  ]);

  const endpoint = stored[STORAGE_KEYS.endpoint] || {};
  hostInput.value = endpoint.host || "127.0.0.1";
  portInput.value = endpoint.port || "";

  const current = await browser.proxy.settings.get({});
  const hasSavedSession = stored[STORAGE_KEYS.original] !== undefined;
  const matches = hasSavedSession && isOurProxy(current.value, endpoint);

  if (matches) {
    setStatus("Firefox направляет трафик через SOCKS5", "connected",
      "Прокси включён только в Firefox. Для отключения нажми кнопку ниже.");
    toggleButton.textContent = "Отключить прокси";
    toggleButton.disabled = false;
    return;
  }

  if (hasSavedSession) {
    setStatus("Настройки прокси изменились", "warning",
      "Текущий прокси отличается от установленного расширением. Можно забыть старую сессию — текущие настройки Firefox останутся без изменений.");
    toggleButton.textContent = "Забыть старую сессию";
    toggleButton.disabled = false;
    return;
  }

  if (current.levelOfControl && current.levelOfControl !== "controllable_by_this_extension") {
    setStatus("Настройки Firefox контролируются другим источником", "warning",
      "Возможно, прокси задаёт другое расширение или политика браузера.");
  } else {
    setStatus("Не подключено", "idle",
      "Остальные приложения Windows не затрагиваются.");
  }

  toggleButton.textContent = "Подключить Firefox";
  toggleButton.disabled = false;
}

async function enableProxy() {
  const host = hostInput.value.trim();
  const port = Number(portInput.value);

  if (!host || !isValidPort(port)) {
    setStatus("Проверь адрес и порт", "warning", "Порт должен быть числом от 1 до 65535.");
    return;
  }

  if (!isLoopbackHost(host)) {
    setStatus("Пока разрешён только localhost", "warning",
      "Сетевые IP могут открыть доступ к прокси другим устройствам. Сначала отдельно проверим безопасную схему.");
    return;
  }

  setBusy(true);
  try {
    const incognitoAllowed = await browser.extension.isAllowedIncognitoAccess();
    if (!incognitoAllowed) {
      throw new Error("Firefox требует разрешить расширению работу в приватных окнах. Открой about:addons → HAPP Browser → Разрешения и включи доступ к приватным окнам.");
    }

    const current = await browser.proxy.settings.get({});
    if (current.levelOfControl && current.levelOfControl !== "controllable_by_this_extension") {
      throw new Error("Настройки прокси контролируются другим расширением или политикой Firefox. Сначала отключи конфликтующий источник.");
    }

    const saved = await browser.storage.local.get(STORAGE_KEYS.original);
    if (saved[STORAGE_KEYS.original] !== undefined) {
      throw new Error("Найдена незавершённая предыдущая сессия. Нажми «Восстановить настройки» перед новым подключением.");
    }

    const endpoint = { host, port };
    await browser.storage.local.set({
      [STORAGE_KEYS.endpoint]: endpoint,
      [STORAGE_KEYS.original]: current.value
    });

    try {
      await browser.proxy.settings.set({
        value: {
          proxyType: "manual",
          socks: host,
          socksPort: port,
          socksVersion: 5,
          proxyDNS: true,
          passthrough: "localhost, 127.0.0.1, ::1"
        }
      });
    } catch (error) {
      await browser.storage.local.remove(STORAGE_KEYS.original);
      throw error;
    }

    const applied = await browser.proxy.settings.get({});
    if (!isOurProxy(applied.value, endpoint)) {
      throw new Error("Firefox не подтвердил применение настроек прокси.");
    }

    await browser.storage.local.set({ [STORAGE_KEYS.enabled]: true });
    setStatus("Прокси включён в Firefox", "connected",
      "Теперь проверь сайты в Firefox. Другие приложения не должны менять свой маршрут.");
    toggleButton.textContent = "Отключить прокси";
  } catch (error) {
    setStatus("Не удалось включить прокси", "error", error.message || String(error));
    toggleButton.textContent = "Подключить Firefox";
  } finally {
    setBusy(false);
    await readState().catch(() => {});
  }
}

async function disableProxy() {
  setBusy(true);
  try {
    const stored = await browser.storage.local.get([
      STORAGE_KEYS.enabled,
      STORAGE_KEYS.endpoint,
      STORAGE_KEYS.original
    ]);
    const original = stored[STORAGE_KEYS.original];

    if (original === undefined) {
      await browser.storage.local.remove(STORAGE_KEYS.enabled);
      setStatus("Нет сохранённых настроек для восстановления", "warning",
        "Ничего не меняли. Проверь прокси вручную в настройках Firefox.");
      return;
    }

    const current = await browser.proxy.settings.get({});
    const endpoint = stored[STORAGE_KEYS.endpoint] || {};

    if (!isOurProxy(current.value, endpoint)) {
      throw new Error("Текущие настройки уже отличаются от прокси расширения. Нажми «Забыть старую сессию», чтобы очистить только служебные данные, не меняя настройки Firefox.");
    }

    if (current.levelOfControl && current.levelOfControl !== "controlled_by_this_extension") {
      throw new Error("Расширение больше не контролирует настройки прокси. Не буду перезаписывать настройки другого расширения.");
    }

    await browser.proxy.settings.set({ value: original });
    await browser.storage.local.remove([
      STORAGE_KEYS.enabled,
      STORAGE_KEYS.endpoint,
      STORAGE_KEYS.original
    ]);

    setStatus("Исходные настройки Firefox восстановлены", "idle",
      "Прокси расширения отключён. Другие приложения Windows не затрагивались.");
    toggleButton.textContent = "Подключить Firefox";
  } catch (error) {
    setStatus("Не удалось безопасно восстановить настройки", "error", error.message || String(error));
    toggleButton.textContent = "Восстановить настройки";
  } finally {
    setBusy(false);
    await readState().catch(() => {});
  }
}

async function forgetStaleSession() {
  setBusy(true);
  try {
    await browser.storage.local.remove([
      STORAGE_KEYS.enabled,
      STORAGE_KEYS.endpoint,
      STORAGE_KEYS.original
    ]);
    setStatus("Старая сессия забыта", "idle",
      "Настройки Firefox не менялись. Текущий прокси, если он включён, остался как был.");
  } catch (error) {
    setStatus("Не удалось очистить состояние", "error", error.message || String(error));
  } finally {
    setBusy(false);
    await readState().catch(() => {});
  }
}

toggleButton.addEventListener("click", async () => {
  if (busy) return;
  const stored = await browser.storage.local.get([
    STORAGE_KEYS.enabled,
    STORAGE_KEYS.original,
    STORAGE_KEYS.endpoint
  ]);

  if (stored[STORAGE_KEYS.original] !== undefined) {
    const current = await browser.proxy.settings.get({});
    if (!isOurProxy(current.value, stored[STORAGE_KEYS.endpoint] || {})) {
      await forgetStaleSession();
      return;
    }
    await disableProxy();
  } else {
    await enableProxy();
  }
});

readState().catch(error => {
  setStatus("Не удалось прочитать настройки Firefox", "error", error.message || String(error));
  toggleButton.disabled = true;
});
