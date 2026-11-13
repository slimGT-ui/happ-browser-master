(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.HappTimeline = api;
})(globalThis, function () {
  "use strict";

  const TYPE_LABELS = Object.freeze({
    IP: "Public IP",
    DNS: "DNS",
    WebRTC: "WebRTC",
    IPv6: "IPv4 / IPv6",
    "Сайт": "Website"
  });

  function timestamp(item) {
    const value = Date.parse(item?.checkedAt || "");
    return Number.isFinite(value) ? value : null;
  }

  function sortHistory(items) {
    return [...(Array.isArray(items) ? items : [])].sort((a, b) => {
      const left = timestamp(a);
      const right = timestamp(b);
      if (left === null && right === null) return 0;
      if (left === null) return 1;
      if (right === null) return -1;
      return right - left;
    });
  }

  function filterHistory(items, type = "all") {
    const sorted = sortHistory(items);
    return type === "all" ? sorted : sorted.filter(item => item?.type === type);
  }

  function summarizeHistory(items, now = Date.now()) {
    const valid = (Array.isArray(items) ? items : []).filter(item => timestamp(item) !== null);
    const recent = valid.filter(item => {
      const age = now - timestamp(item);
      return age >= 0 && age <= 24 * 60 * 60 * 1000;
    });
    return {
      total: Array.isArray(items) ? items.length : 0,
      last24Hours: recent.length,
      types: new Set((Array.isArray(items) ? items : []).map(item => item?.type).filter(Boolean)).size
    };
  }

  function getStatus(item) {
    if (!item || item.status === "error" || item.verdict === "error") return { state: "error", label: "ОШИБКА" };
    if (item.type === "WebRTC") {
      if (item.status === "possible-leak" || item.verdict === "possible-leak") return { state: "warning", label: "НЕСОВПАДЕНИЕ" };
      if (item.status === "no-mismatch" || item.verdict === "no-mismatch") return { state: "success", label: "СОВПАДЕНИЙ НЕТ" };
      return { state: "incomplete", label: "НЕДОСТАТОЧНО ДАННЫХ" };
    }
    if (item.type === "DNS") {
      if (item.status === "observed" || item.verdict === "observed") return { state: "review", label: "НАБЛЮДЕНИЯ ПОЛУЧЕНЫ" };
      return { state: "incomplete", label: "НЕДОСТАТОЧНО ДАННЫХ" };
    }
    if (item.type === "Сайт" && item.status === "reachable") return { state: "success", label: "ОТВЕТ ПОЛУЧЕН" };
    if (item.status === "success" || item.status === "reachable" || item.status === "observed") return { state: "success", label: "ДАННЫЕ ПОЛУЧЕНЫ" };
    if (item.status === "inconclusive") return { state: "incomplete", label: "НЕОПРЕДЕЛЁННО" };
    return { state: "neutral", label: "ЗАПИСЬ" };
  }

  function describe(item) {
    if (!item) return "Нет данных";
    if (item.status === "error" || item.verdict === "error") return "Ошибка: " + (item.message || "неизвестная ошибка");
    if (item.type === "IP") return [item.ip || "IP не получен", item.country || "страна неизвестна"].join(" · ");
    if (item.type === "DNS") {
      return item.status === "observed" || item.verdict === "observed"
        ? (item.resolvers ?? 0) + " резолверов · " + (item.lookups ?? 0) + " наблюдений"
        : "Недостаточно DNS-наблюдений";
    }
    if (item.type === "WebRTC") return "Вердикт: " + (item.status || item.verdict || "неизвестен") +
      " · ICE: " + (item.candidates ?? 0) + " · сравнено: " + (item.compared ?? 0);
    if (item.type === "IPv6") return "IPv4: " + (item.ipv4 || "недоступен") + " · IPv6: " + (item.ipv6 || "недоступен");
    if (item.type === "Сайт") return (item.url || "Адрес не указан") + " · " + (item.status || "неизвестно");
    return item.status || "Результат проверки";
  }


  function findPrevious(item, items) {
    const currentTime = timestamp(item);
    if (currentTime === null) return null;
    return sortHistory(items).find(candidate =>
      candidate !== item &&
      candidate.type === item.type &&
      timestamp(candidate) !== null &&
      timestamp(candidate) < currentTime
    ) || null;
  }

  function compareEvents(current, previous) {
    if (!current || !previous) {
      return { state: "unknown", label: "НЕТ ПРЕДЫДУЩЕГО ТЕСТА", detail: "Для сравнения нужна более ранняя проверка этого типа." };
    }
    const changed = (left, right) => JSON.stringify(left) !== JSON.stringify(right);
    let fields = [];
    if (current.type === "IP") {
      fields = [
        ["IP", previous.ip, current.ip],
        ["Страна", previous.country, current.country]
      ];
    } else if (current.type === "DNS") {
      fields = [["Количество резолверов", previous.resolvers, current.resolvers]];
    } else if (current.type === "WebRTC") {
      fields = [
        ["Вердикт", previous.status || previous.verdict, current.status || current.verdict],
        ["Несовпадения", previous.mismatches, current.mismatches]
      ];
    } else if (current.type === "IPv6") {
      fields = [
        ["IPv4", previous.ipv4, current.ipv4],
        ["IPv6", previous.ipv6, current.ipv6]
      ];
    } else if (current.type === "Сайт") {
      fields = [
        ["Адрес", previous.url, current.url],
        ["Доступность", previous.status, current.status]
      ];
    }
    const comparable = fields.filter(([, before, after]) => before != null && before !== "" && after != null && after !== "");
    if (!comparable.length) {
      return { state: "unknown", label: "НЕДОСТАТОЧНО ДАННЫХ", detail: "В одной из проверок нет сопоставимых значений." };
    }
    const differences = comparable.filter(([, before, after]) => changed(before, after));
    if (!differences.length) {
      return { state: "same", label: "БЕЗ ИЗМЕНЕНИЙ", detail: "Сопоставимые значения совпадают с предыдущей проверкой." };
    }
    return {
      state: "changed",
      label: "ЕСТЬ ИЗМЕНЕНИЯ",
      detail: differences.map(([label, before, after]) => label + ": " + String(before) + " → " + String(after)).join(" · ")
    };
  }

  function groupByDay(items) {
    const groups = [];
    const indexes = new Map();
    for (const item of sortHistory(items)) {
      const time = timestamp(item);
      const key = time === null ? "unknown" : new Date(time).toLocaleDateString();
      if (!indexes.has(key)) {
        indexes.set(key, groups.length);
        groups.push({ key, label: time === null ? "Дата неизвестна" : new Date(time).toLocaleDateString(undefined, {
          day: "numeric", month: "long", year: "numeric"
        }), items: [] });
      }
      groups[indexes.get(key)].items.push(item);
    }
    return groups;
  }

  return Object.freeze({ sortHistory, filterHistory, summarizeHistory, getStatus, describe, findPrevious, compareEvents, groupByDay, TYPE_LABELS });
});
