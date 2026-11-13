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

const webrtcButton = document.querySelector("#run-webrtc-check");
const webrtcMessage = document.querySelector("#webrtc-message");
const webrtcResults = document.querySelector("#webrtc-results");

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
    await window.HappHistory?.add("IP", { ip: data.ip, country: data.country, status: "success" });
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
    await window.HappHistory?.add("IP", { status: "error", message: error.message || String(error) });
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
    await window.HappHistory?.add("DNS", { status: "success", resolvers: resolvers.length, lookups: completed });
  } catch (error) {
    dnsMessage.textContent = `Не удалось завершить DNS-тест: ${error.message || String(error)}`;
    await window.HappHistory?.add("DNS", { status: "error", message: error.message || String(error) });
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


function isIPv4(value) {
  return /^(?:25[0-5]|2[0-4]\d|1?\d?\d)(?:\.(?:25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(value);
}

function isPrivateIPv4(ip) {
  const parts = ip.split(".").map(Number);
  const [a, b] = parts;
  return a === 10 || a === 127 || a === 0 ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 169 && b === 254) ||
    (a === 100 && b >= 64 && b <= 127) ||
    a >= 224;
}

function isIPv6(value) {
  return value.includes(":") && /^[0-9a-f:]+$/i.test(value) && value.length <= 45;
}

function isPrivateIPv6(ip) {
  const normalized = ip.toLowerCase();
  return normalized === "::" || normalized === "::1" ||
    normalized.startsWith("fc") || normalized.startsWith("fd") ||
    normalized.startsWith("fe8") || normalized.startsWith("fe9") ||
    normalized.startsWith("fea") || normalized.startsWith("feb") ||
    normalized.startsWith("ff");
}

function isPrivateAddress(ip) {
  if (isIPv4(ip)) return isPrivateIPv4(ip);
  if (isIPv6(ip)) return isPrivateIPv6(ip);
  return false;
}

function extractCandidateAddress(candidate) {
  if (candidate.address) return candidate.address.replace(/^\[|\]$/g, "");
  const fields = candidate.candidate.split(/\s+/);
  return fields.length >= 8 ? fields[4].replace(/^\[|\]$/g, "") : "";
}

function collectIceCandidates(peer) {
  return new Promise((resolve, reject) => {
    const candidates = new Map();
    let settled = false;
    const finish = (error = null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.removeEventListener("icecandidate", onCandidate);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      if (error) reject(error);
      else resolve([...candidates.values()]);
    };
    const addCandidate = (candidate) => {
      if (!candidate) return;
      const address = extractCandidateAddress(candidate);
      const typeMatch = candidate.candidate.match(/\btyp\s+(host|srflx|prflx|relay)\b/);
      const type = candidate.type || (typeMatch && typeMatch[1]) || "unknown";
      const protocolMatch = candidate.candidate.match(/\s(udp|tcp)\s/i);
      const protocol = candidate.protocol || (protocolMatch && protocolMatch[1].toUpperCase()) || "";
      const key = [address, type, protocol].join("|");
      if (address && !candidates.has(key)) candidates.set(key, { address, type, protocol });
    };
    const onCandidate = (event) => {
      if (event.candidate) addCandidate(event.candidate);
      else if (peer.iceGatheringState === "complete") finish();
    };
    const onStateChange = () => {
      if (peer.iceGatheringState === "complete") finish();
    };
    const timer = setTimeout(() => finish(new Error("ICE gathering timeout")), 12000);
    peer.addEventListener("icecandidate", onCandidate);
    peer.addEventListener("icegatheringstatechange", onStateChange);
    if (peer.iceGatheringState === "complete") finish();
  });
}

function renderWebRtcResults(data) {
  webrtcResults.replaceChildren();

  const summary = document.createElement("div");
  summary.className = "webrtc-summary";
  summary.textContent = data.verdict === "possible-leak"
    ? "Обнаружен публичный IP, отличный от IP выхода Firefox"
    : data.verdict === "no-mismatch"
      ? "Несовпадений публичного IP не обнаружено"
      : "Результат проверки неопределённый";
  webrtcResults.append(summary);

  const baseline = document.createElement("p");
  baseline.className = "webrtc-note";
  baseline.textContent = data.publicIp
    ? `Текущий IP выхода Firefox: ${data.publicIp}`
    : "Не удалось получить контрольный внешний IP.";
  webrtcResults.append(baseline);

  if (data.candidates.length) {
    for (const item of data.candidates) {
      const row = document.createElement("div");
      row.className = "webrtc-candidate";
      const address = document.createElement("strong");
      address.textContent = item.address;
      const detail = document.createElement("span");
      const labels = {
        host: "Локальный кандидат",
        srflx: "Публичный адрес (STUN)",
        prflx: "Peer-reflexive адрес",
        relay: "Relay-кандидат"
      };
      detail.textContent = [labels[item.type] || "ICE-кандидат", item.protocol].filter(Boolean).join(" · ");
      row.append(address, detail);
      webrtcResults.append(row);
    }
  } else {
    const empty = document.createElement("p");
    empty.className = "webrtc-note";
    empty.textContent = "ICE-кандидаты не получены. Это не означает, что утечек нет.";
    webrtcResults.append(empty);
  }

  const note = document.createElement("p");
  note.className = "webrtc-disclaimer";
  note.textContent = data.verdict === "possible-leak"
    ? "Возможное раскрытие: публичный ICE-адрес отличается от контрольного IP. Проверь результат повторно и сравни его с VPN выключенным."
    : "WebRTC-проверка зависит от доступности STUN и настроек браузера. Отсутствие несовпадений не является абсолютной гарантией отсутствия утечек.";
  webrtcResults.append(note);
}

async function runWebRtcCheck() {
  webrtcButton.disabled = true;
  webrtcButton.textContent = "Проверяем WebRTC…";
  webrtcMessage.textContent = "Получаем контрольный IP и собираем ICE-кандидаты через STUN. Обычно это занимает несколько секунд.";
  webrtcResults.replaceChildren();

  let peer = null;
  try {
    if (typeof RTCPeerConnection !== "function") {
      throw new Error("RTCPeerConnection недоступен в этом контексте Firefox.");
    }

    let publicIp = "";
    try {
      const baseline = await fetchJson("https://ipwho.is/", { method: "GET" }, 12000);
      if (baseline.success === true && typeof baseline.ip === "string") publicIp = baseline.ip;
    } catch {
      // Continue gathering candidates, but the comparison will remain inconclusive.
    }

    peer = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
    });
    peer.createDataChannel("happ-webrtc-check");
    const offer = await peer.createOffer();
    const gathering = collectIceCandidates(peer);
    try {
      await peer.setLocalDescription(offer);
    } catch (error) {
      await gathering.catch(() => {});
      throw error;
    }
    const candidates = await gathering;

    const publicCandidates = candidates.filter(item =>
      (isIPv4(item.address) || isIPv6(item.address)) &&
      !isPrivateAddress(item.address) &&
      item.type !== "relay"
    );
    const baselineIsV4 = isIPv4(publicIp);
    const baselineIsV6 = isIPv6(publicIp);
    const comparableCandidates = publicCandidates.filter(item =>
      (baselineIsV4 && isIPv4(item.address)) ||
      (baselineIsV6 && isIPv6(item.address))
    );
    const mismatches = comparableCandidates.filter(item => item.address !== publicIp);
    const verdict = !publicIp || comparableCandidates.length === 0
      ? "inconclusive"
      : mismatches.length
        ? "possible-leak"
        : "no-mismatch";

    const result = {
      checkedAt: new Date().toISOString(),
      publicIp,
      verdict,
      candidates,
      publicCandidates: publicCandidates.length,
      mismatches: mismatches.length
    };
    await browser.storage.local.set({ lastWebRtcCheck: result });
    renderWebRtcResults(result);
    webrtcMessage.textContent = verdict === "possible-leak"
      ? "Проверка завершена: обнаружено возможное раскрытие публичного IP."
      : verdict === "no-mismatch"
        ? "Проверка завершена. Публичные ICE-адреса совпадают с контрольным IP."
        : "Проверка завершена не полностью. Для вывода недостаточно данных.";
    await window.HappHistory?.add("WebRTC", { status: verdict, publicIp, candidates: candidates.length });
  } catch (error) {
    await window.HappHistory?.add("WebRTC", { status: "error", message: error.message || String(error) });
    webrtcMessage.textContent = error.message === "ICE gathering timeout"
      ? "STUN не ответил за 12 секунд. Проверка не завершена — это не означает отсутствие утечки."
      : `Не удалось выполнить WebRTC-проверку: ${error.message || String(error)}`;
  } finally {
    if (peer) peer.close();
    webrtcButton.disabled = false;
    webrtcButton.textContent = "Повторить WebRTC-тест";
  }
}

webrtcButton.addEventListener("click", runWebRtcCheck);

browser.storage.local.get("lastWebRtcCheck").then(({ lastWebRtcCheck }) => {
  if (!lastWebRtcCheck) return;
  renderWebRtcResults(lastWebRtcCheck);
  webrtcMessage.textContent = "Показан последний сохранённый результат. Запусти тест заново для свежих данных.";
}).catch(() => {});
