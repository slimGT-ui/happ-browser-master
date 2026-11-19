# HAPP Browser

Независимое Firefox-расширение для диагностики VPN-подключения и сетевых утечек непосредственно в браузере. Оно не создаёт VPN-туннель, не управляет HAPP Desktop и не синхронизирует его профили.

## Текущая версия — 1.0.0 Stable

Первый стабильный выпуск HAPP Browser. Функциональная и lifecycle-проверка пройдены; диагностические ограничения и правила интерпретации результатов описаны ниже.

### Диагностика
- **Public IP:** внешний IP и страна через `ipwho.is`.
- **DNS:** уникальные DNS-запросы через `dnsleak.dev`; отображаются обнаруженные резолверы, IP, страна и ASN/организация, если сервис предоставляет эти поля.
- **WebRTC:** сбор ICE-кандидатов через Google STUN и сравнение публичных IPv4/IPv6-кандидатов с контрольными адресами того же семейства; частные и специальные IP-диапазоны не считаются публичными.
- **IPv4/IPv6:** отдельная проверка доступности обоих протоколов.
- **Website Reachability:** проверка сетевого ответа выбранного HTTP/HTTPS-адреса с отдельным разрешением Firefox.
- **Network Path Diagnostics:** DNS-разрешение назначения через Firefox `browser.dns.resolve()` (адреса, canonical name и `isTRR`), HTTPS-проверка назначения и двух контрольных endpoint, задержки и осторожная классификация вероятной проблемы. Результат сохраняется локально, попадает в Timeline, Security Overview, сравнение профилей и JSON-отчёт.
- **Connection Quality Monitor:** шесть последовательных HTTPS-проб к Google Connectivity Check и Cloudflare Trace; медианная/средняя/минимальная/максимальная задержка, jitter и доля неудачных проб. Последний результат сохраняется локально и попадает в Timeline.
- **Browser Fingerprint Check:** по явному нажатию проверяет характеристики, доступные активной странице: User-Agent, платформу, язык, часовой пояс, экран, Canvas readback и WebGL metadata. Использует временный доступ `activeTab`; данные остаются локальными.
- **Privacy & Permissions Audit:** инвентаризация разрешений самого HAPP Browser и доступных host origins; список установленных Firefox-расширений с API/host permissions и выделением широких host patterns / мощных API; чтение сетевых настроек Firefox через `browser.privacy.network` (WebRTC, network prediction, HTTPS-Only, GPC). Результат сохраняется локально и попадает в Timeline, Security Overview и JSON-отчёт.
- **Diagnostic Timeline:** хронология последних 50 проверок с группировкой по дате, фильтрами по типу диагностики, сводкой активности и сравнением с предыдущей проверкой того же типа.
- **History:** последние 50 результатов хранятся локально в Firefox; одновременные проверки не должны перезаписывать записи друг друга, историю можно очистить.

### Интерпретация результатов

DNS-диагностика показывает резолверы, которые наблюдались авторитетной инфраструктурой тестового сервиса. Само наличие резолверов не означает утечку. Чтобы определить, соответствует ли DNS-трафик ожидаемому VPN, сравни IP/ASN и организацию с DNS-провайдером VPN. Если тестовые запросы не дошли или наблюдений недостаточно, результат обозначается как неопределённый.

WebRTC использует отдельные контрольные IPv4- и IPv6-адреса. Сравниваются только публичные ICE-кандидаты соответствующего семейства:
- **Возможное раскрытие IP:** найден публичный ICE-адрес, отличный от контрольного адреса того же семейства.
- **Несовпадений не найдено:** все полученные публичные кандидаты удалось сравнить, несовпадений нет.
- **Недостаточно данных:** нет сопоставимого контрольного адреса, публичных кандидатов или ICE gathering не завершился.

Ни один из этих результатов не является абсолютной гарантией безопасности. Для проверки поведения VPN полезно повторить тест с включённым и выключенным VPN и сравнить результаты.

### Конфиденциальность и разрешения

HAPP Browser не использует собственный сервер, аналитику или телеметрию. Диагностические запросы выполняются напрямую из Firefox к перечисленным ниже сторонним сервисам. Эти сервисы могут видеть сетевой IP-адрес и другие данные, необходимые для соответствующего теста:

| Сервис | Для чего используется | Что становится видно сервису |
|---|---|---|
| `ipwho.is` | Внешний IP и страна | IP-адрес запроса; сервис возвращает сведения об IP и стране |
| `api4.ipify.org` / `api6.ipify.org` | Контрольные IPv4/IPv6 | IP-адрес запроса |
| `dnsleak.dev` и уникальные имена в `*.t.dnsleak.dev` | DNS-наблюдения | Уникальные тестовые DNS-имена, адреса наблюдаемых DNS-резолверов и доступная сервису сетевая информация о запросах |
| `stun.l.google.com:19302` | Сбор WebRTC ICE-кандидатов | Сетевой адрес и порт, с которых приходит STUN-запрос |
| `www.google.com/generate_204` и `www.cloudflare.com/cdn-cgi/trace` | Connection Quality Monitor | Внешний IP запроса и стандартные метаданные HTTPS-запроса; уникальные cache-busting параметры не содержат пользовательских данных |
| `www.google.com/generate_204`, `www.cloudflare.com/cdn-cgi/trace` и выбранный пользователем узел | Network Path Diagnostics | DNS-запрос через Firefox и обычные HTTP(S)-запросы к назначению и контрольным endpoint; каждый endpoint видит сетевой IP и стандартные метаданные запроса |
| Сайт, указанный пользователем | Website Reachability | Обычный сетевой запрос к выбранному адресу; сайт видит его как запрос посетителя |

**Локальное хранение:** последние результаты проверок, история (не более 50 записей), fingerprint-снимок, результаты Privacy & Permissions Audit и сохранённый VPN-профиль хранятся в `browser.storage.local` Firefox. Fingerprint-проверка не делает сетевых запросов: Canvas-маркер вычисляется локально, а WebGL renderer и другие наблюдаемые параметры сохраняются только в локальном снимке. Расширение не отправляет эти записи на собственный сервер. JSON-отчёт не отправляется автоматически: он создаётся только после нажатия кнопки экспорта или копирования. Отчёт может содержать публичные IP, DNS-резолверы, ICE-кандидаты, browser fingerprint attributes, Canvas marker, GPU metadata, список установленных расширений и их разрешения, настройки Firefox и проверенные URL — проверь его перед передачей.

**Разрешения:** `storage` используется для локальных результатов; `clipboardWrite` — для явного копирования отчёта; `dns` — для явного DNS-разрешения узла назначения; `scripting` вместе с `activeTab` — для однократного запуска fingerprint-проверки только в активной вкладке после действия пользователя; `privacy` — для чтения настроек приватности Firefox; `management` — для получения списка установленных расширений и их объявленных разрешений. `privacy` и `management` являются широкими обязательными разрешениями Firefox: API технически позволяют менять настройки приватности и управлять расширениями. HAPP Browser в рамках аудита использует только BrowserSetting.get() и management.getAll(); методы изменения настроек, включения/отключения и удаления расширений не вызываются. Firefox не позволяет запросить эти два API-разрешения как optional, поэтому обновление расширения может показать пользователю запрос новых разрешений. Постоянный доступ ко всем сайтам для fingerprint-проверки не запрашивается. Доступ к диагностическим доменам объявлен в манифесте. Доступ к произвольным сайтам запрашивается отдельно для конкретного origin только при запуске Website Reachability.

### Ограничения

- DNS-сервис и STUN-сервер являются внешними сторонами и видят сетевую информацию, необходимую для выполнения тестов.
- DNS-результаты не классифицируются автоматически как утечка: расширение не знает заранее, какие DNS-серверы должен использовать конкретный VPN.
- WebRTC-проверка зависит от доступности STUN, сетевых правил, firewall и настроек Firefox.
- Connection Quality Monitor измеряет время завершения HTTPS-запросов из Firefox, а не ICMP ping. Неудачные HTTPS-пробы могут быть вызваны блокировкой endpoint или firewall и не являются точным измерением потери IP-пакетов. Результат характеризует только доступность выбранных endpoint, а не весь маршрут или системный VPN-туннель.
- IPv6-тест проверяет доступность протокола, а не доказывает, что маршрут проходит через VPN.
- Website Reachability подтверждает только получение сетевого ответа. Из-за ограничений CORS расширение не читает HTTP-статус и содержимое страницы.
- Network Path Diagnostics использует Firefox DNS API и HTTP(S)-пробы назначения/контрольных узлов. `browser.dns.resolve()` может вернуть адреса, canonical name и `isTRR`; при SOCKS-прокси с DNS через SOCKS API может завершиться ошибкой. Это не системный traceroute: WebExtension не получает ICMP TTL, raw sockets или список промежуточных маршрутизаторов. Результаты показывают только DNS и браузерную доступность endpoint, а не точный маршрут или факт использования VPN.
- Для получения IP расширение обращается к `ipwho.is`, `api4.ipify.org` и `api6.ipify.org`. DNS-тест использует `dnsleak.dev`; WebRTC использует Google STUN `stun:stun.l.google.com:19302`.
- Fingerprint-данные зависят от активной страницы и настроек Firefox. В Firefox отсутствует `navigator.userAgentData`; Client Hints обозначаются как неподдерживаемые. Количество доступных атрибутов не является оценкой глобальной уникальности, энтропии или риска. В MAIN-контексте сама страница может обнаружить или изменить поведение проверки; на Firefox ниже 128 используется изолированный контекст, который не отражает JavaScript-переопределения страницы.
- История и последние результаты сохраняются локально в хранилище Firefox.

## Diagnostic Timeline (этап разработки 0.10.0)

- Хронология последних 50 событий диагностики, отсортированная по времени и сгруппированная по локальной дате.
- Сравнение IP/страны, количества DNS-резолверов, WebRTC-вердикта, IPv4/IPv6 и сайта с предыдущим событием того же типа.
- Последние результаты Public IP, DNS, WebRTC, IPv4/IPv6 и Website восстанавливаются при повторном открытии popup.
- Записи истории сериализуются, чтобы параллельные проверки не затирали друг друга.
- Фильтрация событий по Public IP, DNS, WebRTC, IPv4/IPv6 и Website.
- Сводка количества записей, событий за последние 24 часа и типов проверок.
- Различимые состояния: ошибка, недостаточно данных, DNS-наблюдения, WebRTC-несовпадение и успешный результат.
- Все данные читаются из локальной истории Firefox; внешние запросы для построения Timeline не выполняются.

## Privacy & Permissions Audit (этап 5)

- Проверяет browser.permissions.getAll() и сравнивает фактически выданные API permissions / origins с разрешениями, объявленными в собственном manifest HAPP Browser.
- Использует browser.management.getAll() для списка доступных установленных расширений, их API permissions, host permissions, состояния и типа установки. Широкие host patterns и мощные API-права помечаются как повод вручную проверить расширение, а не как доказательство вредоносности.
- Читает через browser.privacy.network текущие значения peerConnectionEnabled, webRTCIPHandlingPolicy, networkPredictionEnabled, httpsOnlyMode и globalPrivacyControl, а также levelOfControl, если Firefox его возвращает.
- Аудит не вызывает методы изменения настроек (set / clear) и не вызывает методы управления расширениями (setEnabled / uninstall). Все результаты остаются в локальном хранилище Firefox.
- Для доступа к privacy и management API нужны обязательные разрешения манифеста. Firefox не позволяет запросить их как optional; при обновлении пользователь увидит запрос расширенных разрешений. privacy позволяет API не только читать, но и изменять настройки, management — не только перечислять, но и управлять расширениями. Код HAPP использует эти разрешения только для чтения.
- Firefox WebExtensions API не раскрывает текущую конфигурацию DoH (режим, URL провайдера и fallback). isTRR из browser.dns.resolve() относится к конкретному DNS-запросу и не является полной диагностикой DoH.
- Системные proxy/VPN настройки не читаются этим аудитом. Результат не доказывает системный маршрут трафика.

## Security Overview (этап разработки 0.9.0)

- Сводка последних результатов Public IP, DNS, WebRTC и IPv4/IPv6.
- Покрытие диагностики показывает долю проверок, для которых есть результат; это не оценка безопасности.
- Возможное несовпадение публичного WebRTC ICE-адреса выделяется отдельно.
- DNS-наблюдения и доступность IPv6 требуют ручной интерпретации и не считаются утечкой автоматически.
- Недостающие данные, ошибки и незапущенные тесты показываются отдельно.

## Сравнение VPN-профилей (этап разработки 0.8.0)

- Сохранение текущих результатов диагностики как снимка подключения.
- Сравнение Public IP, страны, DNS-резолверов, WebRTC verdict, IPv4/IPv6 и доступности сайта после переключения VPN.
- Отдельная индикация изменений и отсутствующих данных.
- Сравнение не определяет автоматически, является ли изменение утечкой: интерпретируй его с учётом ожидаемого VPN-выхода.

## Диагностический отчёт (этап разработки 0.7.0)

- Сбор последних результатов Public IP, DNS и WebRTC.
- Последние результаты IPv6 и Website Reachability берутся из истории проверок.
- Экспорт отчёта в JSON и копирование в буфер обмена.
- В отчёте присутствуют IP-адреса, DNS-резолверы, ICE-кандидаты и проверенные URL. Перед передачей третьим лицам содержимое нужно проверить и при необходимости удалить чувствительные данные.

Для копирования отчёта расширение запрашивает разрешение Firefox на запись в буфер обмена.

## Автоматические проверки

Для запуска регрессионных тестов в Node.js 20 (та же основная версия, что используется в GitHub Actions) выполни:

```bash
node --test
```

Автоматический набор включает проверки: проверку IPv4/IPv6-адресов (включая некорректное сжатие и IPv4-mapped IPv6), структуру manifest.json, наличие файлов popup и согласованность версии в основных файлах. Локально доступны `npm run check`, `npm test` и `npm run validate`. GitHub Actions запускает те же синтаксические проверки (включая privacy-audit.js) и регрессионный набор при push в main и pull request.

## Тестирование

План регрессионного тестирования для этапа 0.6.0, включая VPN on/off, DNS, WebRTC/STUN, IPv4/IPv6, Website Reachability, историю, разрешения и повторные запуски: [TESTING.md](TESTING.md). Все сценарии из матрицы нужно отметить фактическим результатом; непроверенные случаи не считаются пройденными.

## Установка стабильной версии

Инструкция по сборке и подписанию: [RELEASE.md](RELEASE.md).

Для проверки обычного жизненного цикла Firefox нужна подписанная сборка. ZIP-архив стабильной сборки из GitHub Actions предназначен для загрузки в Firefox Add-ons Developer Hub как **Unlisted** (непубличная) версия с подписью Mozilla. Не устанавливай неподписанный ZIP напрямую в обычный Firefox.

После получения подписанного XPI установи его в Firefox. Для обновления используй тот же Unlisted listing и неизменный ID `happ-browser@slimgt-ui`, чтобы сохранить локальные данные.

## Установка для разработки

1. Скачай ZIP основной ветки `main` и распакуй архив.
2. Открой `about:debugging#/runtime/this-firefox`.
3. Нажми **Загрузить временное дополнение…**.
4. Выбери `manifest.json`.
5. Открой popup расширения и запусти нужные проверки.

## Границы проекта

HAPP Browser анализирует сетевое поведение самого Firefox. Он не включает/выключает VPN, не управляет системным прокси, не читает подписки HAPP Desktop и не синхронизирует профили с настольным приложением. Для этих задач нет подтверждённого публичного API, и они не входят в текущий релизный scope.

## Проект

GitHub: https://github.com/slimGT-ui/happ-browser-master

HAPP Browser — независимый проект сообщества, а не официальное приложение HAPP.


## DNS Resolver Intelligence

DNS results are enriched with provider identification based on exact known public-resolver IP addresses and observed ASN/network metadata. Known public DNS operators include Cloudflare, Google Public DNS, Quad9, Cisco OpenDNS, AdGuard DNS, NextDNS, Control D and Mullvad DNS. Unknown networks remain explicitly unidentified; partial IP matches are not treated as provider identification.

The extension indicates when an identified provider offers DNS over HTTPS (DoH). This is provider capability information, not proof that Firefox is currently using DoH. A DNS leak test observes the resolver that handled test queries; it cannot reliably identify whether the transport was classic DNS, DNS-over-TLS or DNS-over-HTTPS. Firefox's active DoH configuration is not exposed through the WebExtension APIs used by this project.

Resolver metadata is supplied by dnsleak.dev. Provider matching is best-effort and uses exact known public-resolver IP addresses plus observed ASN/network metadata; unknown networks remain unidentified. Matching may be incomplete or outdated. Compare observed resolver IP/ASN values with the DNS infrastructure expected from your VPN provider; a resolver mismatch is a prompt for investigation, not an automatic leak verdict.


Resolver geography is compared with the country of a successful public-IP check only when that check is no more than 30 minutes old. A country difference is a review hint, not a leak verdict: VPN providers may intentionally operate DNS resolvers outside the VPN exit country, and resolver geolocation can be imprecise. Multiple resolver countries are also reported as context rather than treated as suspicious by themselves.


Resolver-set comparison uses the previous successful DNS observation as a local baseline. It compares normalized resolver IPs and available ASN, organization, network, provider and country metadata, ignoring lookup order and duplicate observations. Conflicting duplicate metadata is normalized deterministically. Added, removed or reclassified resolvers are shown as a review hint in the DNS results and Timeline. Failed or empty DNS runs do not become a comparison baseline; the last successful snapshot is retained separately when an error replaces the latest result. Resolver rotation, VPN server changes and DNS routing changes can be expected, so a changed set is never an automatic leak verdict.
