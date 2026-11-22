(function () {
  "use strict";
  const interval = document.querySelector("#watchdog-interval");
  const startButton = document.querySelector("#watchdog-start");
  const stopButton = document.querySelector("#watchdog-stop");
  const status = document.querySelector("#watchdog-status");
  const message = document.querySelector("#watchdog-message");
  const lastCheck = document.querySelector("#watchdog-last-check");
  const lastIp = document.querySelector("#watchdog-last-ip");
  const events = document.querySelector("#watchdog-events");
  if (!interval || !startButton || !stopButton || !status || !message || !lastCheck || !lastIp || !events) return;

  const labels = {
    online: "СЕТЕВЫЕ ОТВЕТЫ ПОЛУЧЕНЫ",
    offline: "КОНТРОЛЬНЫЕ СЕРВИСЫ НЕДОСТУПНЫ",
    uncertain: "НЕДОСТАТОЧНО НАБЛЮДЕНИЙ",
    unknown: "ОЖИДАНИЕ ПЕРВОЙ ПРОВЕРКИ"
  };
  function formatTime(value) {
    const date = new Date(value || "");
    return Number.isFinite(date.getTime()) ? date.toLocaleString() : "Ещё не проверялось";
  }
  function addEvent(item) {
    const row = document.createElement("div");
    row.className = "watchdog-event";
    const title = document.createElement("strong");
    title.textContent = item.eventType === "ip-changed" ? "Изменение публичного IP"
      : item.eventType === "connection-lost" ? "Нет ответов от контрольных сервисов"
        : "Ответы восстановились";
    const detail = document.createElement("span");
    detail.textContent = item.eventType === "ip-changed"
      ? (item.previousIp || "—") + " → " + (item.currentIp || "—")
      : item.message || "";
    const time = document.createElement("small");
    time.textContent = formatTime(item.checkedAt);
    row.append(title, detail, time);
    events.append(row);
  }
  async function render() {
    const stored = await browser.storage.local.get(["watchdogConfig", "watchdogState", "watchdogEvents"]);
    const config = stored.watchdogConfig || { enabled: false };
    const state = stored.watchdogState || {};
    const hasAlarms = await browser.permissions.contains({ permissions: ["alarms"] }).catch(() => false);
    const hasNotifications = await browser.permissions.contains({ permissions: ["notifications"] }).catch(() => false);
    const enabled = config.enabled === true && hasAlarms;
    status.textContent = enabled ? (labels[state.connectivity] || labels.unknown) : config.enabled ? "ТРЕБУЕТСЯ РАЗРЕШЕНИЕ" : "ОТКЛЮЧЁН";
    status.dataset.state = enabled ? (state.connectivity || "unknown") : "idle";
    message.textContent = enabled
      ? "Проверка выполняется в фоне примерно каждые " + config.intervalMinutes + " мин. Сигналы отражают доступность контрольных сервисов, а не состояние VPN."
      : config.enabled ? "Firefox не выдал разрешение alarms. Включи Watchdog повторно и подтверди разрешение." : "Фоновый мониторинг выключен.";
    if (enabled && !hasNotifications) message.textContent += " Desktop-уведомления не разрешены; изменения видны здесь.";
    lastCheck.textContent = formatTime(state.lastCheckAt);
    lastIp.textContent = state.lastIp || "Нет успешного наблюдения";
    interval.value = String(config.intervalMinutes || 5);
    startButton.disabled = enabled;
    stopButton.disabled = !config.enabled;
    events.replaceChildren();
    const recent = Array.isArray(stored.watchdogEvents) ? stored.watchdogEvents.slice(0, 5) : [];
    if (!recent.length) {
      const empty = document.createElement("p");
      empty.className = "advanced-note";
      empty.textContent = "Событий пока нет. Первое измерение задаст базовый IP.";
      events.append(empty);
    } else {
      for (const item of recent) addEvent(item);
    }
  }
  startButton.addEventListener("click", async () => {
    startButton.disabled = true;
    message.textContent = "Запрашиваем разрешения Firefox…";
    try {
      await browser.permissions.request({ permissions: ["alarms", "notifications"] });
      const hasAlarms = await browser.permissions.contains({ permissions: ["alarms"] });
      if (!hasAlarms) {
        message.textContent = "Без разрешения alarms фоновый мониторинг невозможен.";
        return;
      }
      const result = await browser.runtime.sendMessage({
        type: "HAPP_WATCHDOG_START",
        intervalMinutes: Number(interval.value)
      });
      if (!result?.ok) throw new Error(result?.reason || "Не удалось включить Watchdog.");
      message.textContent = result.result?.ok
        ? "Watchdog включён. Первое наблюдение выполнено; дальше проверки идут по расписанию."
        : "Watchdog включён. Первое измерение ожидает выполнения.";
      await render();
    } catch (error) {
      message.textContent = "Не удалось включить Watchdog: " + (error.message || String(error));
    } finally {
      startButton.disabled = false;
      await render();
    }
  });
  stopButton.addEventListener("click", async () => {
    stopButton.disabled = true;
    try {
      await browser.runtime.sendMessage({ type: "HAPP_WATCHDOG_STOP" });
      await render();
    } catch (error) {
      message.textContent = "Не удалось остановить Watchdog: " + (error.message || String(error));
    } finally {
      stopButton.disabled = false;
      await render();
    }
  });
  browser.storage.onChanged.addListener((changes, area) => {
    if (area === "local" && ["watchdogConfig", "watchdogState", "watchdogEvents"].some(key => changes[key])) {
      void render().catch(() => {});
    }
  });
  void render().catch(error => { message.textContent = "Не удалось загрузить состояние Watchdog: " + (error.message || String(error)); });
})();
