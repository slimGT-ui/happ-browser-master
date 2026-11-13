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
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: "no-store", ...options, signal: controller.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return await response.json();
  } catch (error) {
    if (error.name === "AbortError") throw new Error("Превышено время ожидания ответа.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function validIPv4(value) { return window.HappValidation.validIPv4(value); }
function validIPv6(value) { return window.HappValidation.validIPv6(value); }
function validIp(value) { return window.HappValidation.validIp(value); }

async function checkPublicIp() {
  button.disabled = true;
  button.textContent = "Проверяем…";
  message.textContent = "Получаем внешний IP и страну через ipwho.is.";
  overall.textContent = "ПРОВЕРКА";
  setResultState("idle");
  try {
    const data = await fetchJson("https://ipwho.is/", {}, 12000);
    if (data.success !== true || !validIp(data.ip) || typeof data.country !== "string" || !data.country.trim()) {
      throw new Error(data.message || "Сервис вернул некорректные данные.");
    }
    ipValue.textContent = data.ip;
    ipDetail.textContent = data.type ? `Тип адреса: ${data.type}` : "Внешний IP-адрес";
    countryValue.textContent = data.country;
    countryDetail.textContent = data.country_code ? `Код страны: ${data.country_code}` : "Страна выхода в интернет";
    overall.textContent = "IP ПОЛУЧЕН";
    setResultState("success");
    message.textContent = "Базовая проверка завершена. Один IP не доказывает отсутствие утечек.";
    const record = { ip: data.ip, country: data.country, status: "success" };
    await browser.storage.local.set({ lastIpCheck: { ...record, countryCode: data.country_code || null, checkedAt: new Date().toISOString() } });
    await window.HappHistory?.add("IP", record);
  } catch (error) {
    const errorMessage = error.message || String(error);
    overall.textContent = "ОШИБКА";
    setResultState("error");
    message.textContent = `Не удалось получить данные: ${errorMessage}`;
    ipValue.textContent = "Недоступно";
    countryValue.textContent = "Недоступно";
    ipDetail.textContent = "Проверка не выполнена";
    countryDetail.textContent = "Проверка не выполнена";
    await browser.storage.local.set({
      lastIpCheck: { status: "error", message: errorMessage, checkedAt: new Date().toISOString() }
    }).catch(storageError => console.warn("HAPP Browser: не удалось сохранить ошибку IP-проверки", storageError));
    await window.HappHistory?.add("IP", { status: "error", message: errorMessage });
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
    : "DNS-резолверы не обнаружены";
  dnsResults.append(heading);
  for (const resolver of data.resolvers) {
    const row = document.createElement("div");
    row.className = "resolver-row";
    const address = document.createElement("strong");
    address.textContent = resolver.ip;
    const details = document.createElement("span");
    const network = resolver.asnName || resolver.network || resolver.asn || "Организация не определена";
    details.textContent = [resolver.countryCode || "Страна не определена", network, resolver.asn ? `ASN ${resolver.asn}` : ""].filter(Boolean).join(" · ");
    row.append(address, details);
    dnsResults.append(row);
  }
  const verdict = document.createElement("p");
  verdict.className = "dns-disclaimer";
  verdict.textContent = data.verdict === "observed"
    ? "DNS-наблюдения получены. Это не автоматический признак утечки: сравни IP/ASN резолверов с DNS-инфраструктурой твоего VPN."
    : "Недостаточно DNS-наблюдений для вывода. Повтори тест или проверь соединение позже.";
  dnsResults.append(verdict);
}

async function runDnsCheck() {
  dnsButton.disabled = true;
  dnsButton.textContent = "Выполняем тест…";
  dnsMessage.textContent = "Создаём уникальные DNS-запросы и ждём наблюдения авторитетного сервера.";
  dnsResults.replaceChildren();
  try {
    const session = await fetchJson("https://dnsleak.dev/api/new", {}, 10000);
    const testId = session?.testId;
    const hostnames = Array.isArray(session?.hostnames) ? session.hostnames : [];
    if (typeof testId !== "string" || !/^[a-z0-9]{6,64}$/.test(testId) ||
        hostnames.length < 2 || hostnames.length > 16 ||
        new Set(hostnames).size !== hostnames.length ||
        hostnames.some(name => typeof name !== "string" || !new RegExp(`^${testId}-(?:a|q)\\d{2}\\.t\\.dnsleak\\.dev$`).test(name))) {
      throw new Error("DNS-сервис вернул некорректные параметры теста.");
    }
    const probes = await Promise.allSettled(hostnames.map(hostname =>
      fetch(`https://${hostname}/`, { method: "GET", mode: "no-cors", cache: "no-store", credentials: "omit", signal: AbortSignal.timeout(5000) })
    ));
    const sent = probes.filter(item => item.status === "fulfilled").length;
    let result = null;
    for (let attempt = 0; attempt < 7; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, 1000));
      result = await fetchJson(`https://dnsleak.dev/api/result/${encodeURIComponent(testId)}`, {}, 8000);
      if (result?.testId !== testId) throw new Error("ID результата не совпадает с ID теста.");
      if (Array.isArray(result.resolvers) && result.resolvers.some(item => item?.role === "resolver" && Number(item.original) > 0 && validIp(item.ip) && (item.sawA || item.sawQ))) break;
    }
    const resolvers = Array.isArray(result?.resolvers) ? result.resolvers
      .filter(item => item?.role === "resolver" && Number(item.original) > 0 && validIp(item.ip) && (item.sawA || item.sawQ))
      .filter((item, index, all) => all.findIndex(other => other.ip === item.ip) === index)
      .map(item => ({
        ip: item.ip,
        countryCode: typeof item.countryCode === "string" ? item.countryCode : "",
        asn: typeof item.asn === "string" ? item.asn : "",
        asnName: typeof item.asnName === "string" ? item.asnName : "",
        network: typeof item.network === "string" ? item.network : ""
      })) : [];
    const lookups = Number.isFinite(Number(result?.lookups)) ? Number(result.lookups) : 0;
    const verdict = resolvers.length && lookups > 0 ? "observed" : "insufficient-data";
    const testResult = {
      testId, checkedAt: new Date().toISOString(),
      clientIp: validIp(result?.client?.ip) ? result.client.ip : "",
      lookups, requestedLookups: hostnames.length, probesSent: sent,
      resolvers, verdict
    };
    await browser.storage.local.set({ lastDnsCheck: testResult });
    renderDnsResults(testResult);
    dnsMessage.textContent = verdict === "observed"
      ? `Получены DNS-наблюдения: ${lookups} запросов, ${resolvers.length} уникальных резолверов.`
      : `Недостаточно данных: ${lookups} наблюдений, ${sent}/${hostnames.length} проб отправлено.`;
    await window.HappHistory?.add("DNS", { status: verdict, resolvers: resolvers.length, lookups, probesSent: sent });
  } catch (error) {
    const errorMessage = error.message || String(error);
    dnsMessage.textContent = `DNS-тест не завершён: ${errorMessage}`;
    await browser.storage.local.set({
      lastDnsCheck: { verdict: "error", message: errorMessage, checkedAt: new Date().toISOString() }
    }).catch(storageError => console.warn("HAPP Browser: не удалось сохранить ошибку DNS-проверки", storageError));
    await window.HappHistory?.add("DNS", { status: "error", message: errorMessage });
  } finally {
    dnsButton.disabled = false;
    dnsButton.textContent = "Повторить DNS-тест";
  }
}

button.addEventListener("click", checkPublicIp);
dnsButton.addEventListener("click", runDnsCheck);
browser.storage.local.get("lastDnsCheck").then(({ lastDnsCheck }) => {
  if (!lastDnsCheck || !Array.isArray(lastDnsCheck.resolvers)) return;
  renderDnsResults(lastDnsCheck);
  dnsMessage.textContent = "Показан последний сохранённый результат. Запусти тест заново для свежих данных.";
}).catch(() => {});

function isIPv4(value) { return validIPv4(value); }
function isIPv6(value) { return validIPv6(value); }
function isPrivateIPv4(ip) {
  const [a, b] = ip.split(".").map(Number);
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168);
}
function isPrivateIPv6(ip) {
  const value = ip.toLowerCase();
  return value === "::" || value === "::1" || value.startsWith("fc") ||
    value.startsWith("fd") || /^fe[89ab]/.test(value) || value.startsWith("ff");
}
function isPrivateAddress(ip) {
  return isIPv4(ip) ? isPrivateIPv4(ip) : isIPv6(ip) ? isPrivateIPv6(ip) : true;
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
    const finish = error => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      peer.removeEventListener("icecandidate", onCandidate);
      peer.removeEventListener("icegatheringstatechange", onStateChange);
      error ? reject(error) : resolve([...candidates.values()]);
    };
    const add = candidate => {
      if (!candidate?.candidate) return;
      const address = extractCandidateAddress(candidate);
      const typeMatch = candidate.candidate.match(/\btyp\s+(host|srflx|prflx|relay)\b/);
      const type = candidate.type || typeMatch?.[1] || "unknown";
      const protocol = candidate.protocol || candidate.candidate.match(/\s(udp|tcp)\s/i)?.[1]?.toUpperCase() || "";
      if (address && !candidates.has([address, type, protocol].join("|"))) candidates.set([address, type, protocol].join("|"), { address, type, protocol });
    };
    const onCandidate = event => {
      if (event.candidate) add(event.candidate);
      else if (peer.iceGatheringState === "complete") finish();
    };
    const onStateChange = () => { if (peer.iceGatheringState === "complete") finish(); };
    const timer = setTimeout(() => finish(new Error("STUN/ICE timeout")), 15000);
    peer.addEventListener("icecandidate", onCandidate);
    peer.addEventListener("icegatheringstatechange", onStateChange);
    if (peer.iceGatheringState === "complete") finish();
  });
}

function renderWebRtcResults(data) {
  webrtcResults.replaceChildren();
  const labels = {
    "possible-leak": "ОБНАРУЖЕНО ВОЗМОЖНОЕ РАСКРЫТИЕ IP",
    "no-mismatch": "НЕСОВПАДЕНИЙ НЕ НАЙДЕНО",
    "inconclusive": "НЕДОСТАТОЧНО ДАННЫХ"
  };
  const summary = document.createElement("div");
  summary.className = "webrtc-summary";
  summary.dataset.verdict = data.verdict;
  summary.textContent = labels[data.verdict] || labels.inconclusive;
  webrtcResults.append(summary);
  const baseline = document.createElement("p");
  baseline.className = "webrtc-note";
  baseline.textContent = `Контрольный IPv4: ${data.baseline?.ipv4 || "недоступен"} · IPv6: ${data.baseline?.ipv6 || "недоступен"}`;
  webrtcResults.append(baseline);
  for (const item of data.candidates || []) {
    const row = document.createElement("div");
    row.className = "webrtc-candidate";
    const address = document.createElement("strong");
    address.textContent = item.address;
    const detail = document.createElement("span");
    const names = { host: "Локальный кандидат", srflx: "Публичный адрес STUN", prflx: "Peer-reflexive адрес", relay: "Relay-кандидат" };
    detail.textContent = [names[item.type] || "ICE-кандидат", item.protocol, item.comparison || ""].filter(Boolean).join(" · ");
    row.append(address, detail);
    webrtcResults.append(row);
  }
  const note = document.createElement("p");
  note.className = "webrtc-disclaimer";
  note.textContent = data.verdict === "possible-leak"
    ? "Публичный ICE-адрес отличается от контрольного IP того же семейства. Это возможное раскрытие адреса; повтори тест и сравни с VPN выключенным."
    : data.verdict === "no-mismatch"
      ? "Все обнаруженные публичные ICE-адреса удалось сравнить с контрольными адресами того же семейства. Это не абсолютная гарантия отсутствия утечек."
      : "STUN не предоставил достаточно сопоставимых публичных адресов. Отсутствие кандидатов или контрольного IP не считается безопасным результатом.";
  webrtcResults.append(note);
}

async function runWebRtcCheck() {
  webrtcButton.disabled = true;
  webrtcButton.textContent = "Проверяем WebRTC…";
  webrtcMessage.textContent = "Получаем отдельные контрольные IPv4/IPv6 и собираем ICE-кандидаты.";
  webrtcResults.replaceChildren();
  let peer = null;
  try {
    if (typeof RTCPeerConnection !== "function") throw new Error("RTCPeerConnection недоступен.");
    const [ipv4, ipv6] = await Promise.all([
      fetchJson("https://api4.ipify.org?format=json", {}, 9000).then(data => validIPv4(data.ip) ? data.ip : "").catch(() => ""),
      fetchJson("https://api6.ipify.org?format=json", {}, 9000).then(data => validIPv6(data.ip) ? data.ip : "").catch(() => "")
    ]);
    peer = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] });
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
      ["srflx", "prflx"].includes(item.type) && !isPrivateAddress(item.address) &&
      (isIPv4(item.address) || isIPv6(item.address))
    );
    let hasUncompared = false;
    const compared = publicCandidates.map(item => {
      const expected = isIPv4(item.address) ? ipv4 : ipv6;
      if (!expected) {
        hasUncompared = true;
        return { ...item, comparison: "нет контрольного IP этого семейства", mismatch: false, comparable: false };
      }
      const mismatch = item.address !== expected;
      return { ...item, comparison: mismatch ? "не совпадает с контрольным IP" : "совпадает с контрольным IP", mismatch, comparable: true };
    });
    const mismatches = compared.filter(item => item.mismatch);
    const comparable = compared.filter(item => item.comparable);
    const verdict = mismatches.length ? "possible-leak"
      : comparable.length && !hasUncompared ? "no-mismatch" : "inconclusive";
    const result = {
      checkedAt: new Date().toISOString(), baseline: { ipv4, ipv6 }, verdict,
      candidates: candidates.map(item => compared.find(entry => entry.address === item.address && entry.type === item.type) || item),
      publicCandidates: publicCandidates.length, compared: comparable.length, mismatches: mismatches.length
    };
    await browser.storage.local.set({ lastWebRtcCheck: result });
    renderWebRtcResults(result);
    webrtcMessage.textContent = verdict === "possible-leak"
      ? "Есть публичный ICE-адрес, не совпадающий с контрольным IP."
      : verdict === "no-mismatch"
        ? "Все публичные ICE-адреса совпали с контрольными адресами."
        : "Недостаточно данных для надёжного сравнения.";
    await window.HappHistory?.add("WebRTC", { status: verdict, candidates: candidates.length, compared: comparable.length, mismatches: mismatches.length });
  } catch (error) {
    const errorMessage = error.message || String(error);
    webrtcMessage.textContent = `Проверка не завершена: ${errorMessage}. Это не означает отсутствие утечки.`;
    await browser.storage.local.set({
      lastWebRtcCheck: { verdict: "error", message: errorMessage, checkedAt: new Date().toISOString() }
    }).catch(storageError => console.warn("HAPP Browser: не удалось сохранить ошибку WebRTC-проверки", storageError));
    await window.HappHistory?.add("WebRTC", { status: "error", message: errorMessage });
  } finally {
    peer?.close();
    webrtcButton.disabled = false;
    webrtcButton.textContent = "Повторить WebRTC-тест";
  }
}
webrtcButton.addEventListener("click", runWebRtcCheck);
browser.storage.local.get("lastWebRtcCheck").then(({ lastWebRtcCheck }) => {
  if (!lastWebRtcCheck || !Array.isArray(lastWebRtcCheck.candidates)) return;
  renderWebRtcResults(lastWebRtcCheck);
  webrtcMessage.textContent = "Показан последний результат. Запусти тест заново для свежих данных.";
}).catch(() => {});
