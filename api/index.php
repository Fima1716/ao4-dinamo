<?php
/* API админки лендинга All Smiles — версия для обычного хостинга с PHP.
   Делает то же, что api/server.js: хранит в JSON-файлах правки страниц,
   настройки сайта и заявки с форм, рассылает уведомления.

   Разворачивается как public_html/api/index.php рядом с .htaccess,
   который заворачивает сюда все запросы /api/*. Данные лежат ВНЕ веб-корня,
   путь задаётся в config.php. */

date_default_timezone_set('Europe/Moscow');
mb_internal_encoding('UTF-8');

/* ---------- настройки ---------- */

$cfg = ['password' => '', 'data_dir' => __DIR__ . '/../../data'];
if (is_file(__DIR__ . '/config.php')) {
    $loaded = require __DIR__ . '/config.php';
    if (is_array($loaded)) $cfg = array_merge($cfg, $loaded);
}
// переменные окружения, если хостинг их умеет, имеют приоритет
if (getenv('EDITOR_PASSWORD')) $cfg['password'] = getenv('EDITOR_PASSWORD');
if (getenv('DATA_DIR')) $cfg['data_dir'] = getenv('DATA_DIR');

define('DATA', rtrim($cfg['data_dir'], '/'));
define('PASSWORD', (string)$cfg['password']);
define('UPLOADS', DATA . '/uploads');
define('LEAD_FILES', DATA . '/lead-files');
define('SETTINGS_FILE', DATA . '/settings.json');
define('LEADS_FILE', DATA . '/leads.json');
define('SECRETS_FILE', DATA . '/secrets.json');
define('SESSIONS_FILE', DATA . '/sessions.json');
define('RATE_FILE', DATA . '/ratelimit.json');
define('TTL', 7 * 24 * 3600);           // срок жизни сессии админа, секунды
define('LEAD_FILE_MAX', 10 * 1024 * 1024);
define('LEAD_FILE_RE', '/^[a-f0-9]{24}\.(jpg|png|webp|pdf)$/');

foreach ([DATA, UPLOADS, LEAD_FILES] as $dir) {
    if (!is_dir($dir)) @mkdir($dir, 0775, true);
}
/* Страховка: папка с данными должна лежать ВНЕ веб-корня. Если её всё же
   положили внутрь, закрываем доступ через .htaccess — иначе заявки и планы
   лечения пациентов можно было бы просто скачать по прямой ссылке. */
if (!is_file(DATA . '/.htaccess')) {
    @file_put_contents(DATA . '/.htaccess', "Require all denied\n<IfModule !mod_authz_core.c>\n Deny from all\n</IfModule>\n");
}

$FORM_NAMES = [
    'hero' => 'Первый экран', 'modal' => 'Окно «Рассчитать»', 'quiz' => 'Квиз',
    'final' => 'Финальная форма', 'opinion' => 'Второе мнение',
];
$EXT_MIME = [
    'png' => 'image/png', 'jpg' => 'image/jpeg', 'jpeg' => 'image/jpeg',
    'webp' => 'image/webp', 'gif' => 'image/gif', 'pdf' => 'application/pdf',
];
$MIME_EXT = ['image/png' => 'png', 'image/jpeg' => 'jpg', 'image/webp' => 'webp', 'image/gif' => 'gif'];
$LEAD_FILE_EXT = ['application/pdf' => 'pdf', 'image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

/* ---------- мелкие помощники ---------- */

function read_json($file, $def = []) {
    $raw = @file_get_contents($file);
    if ($raw === false || $raw === '') return $def;
    $v = json_decode($raw, true);
    return $v === null ? $def : $v;
}

/* Запись через временный файл и переименование: rename атомарен в пределах
   файловой системы, поэтому обрыв посреди записи не оставит обрезанный JSON. */
function write_json($file, $value, $pretty = true) {
    $flags = JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | ($pretty ? JSON_PRETTY_PRINT : 0);
    return write_atomic($file, json_encode($value, $flags));
}
function write_atomic($file, $bytes) {
    $tmp = $file . '.tmp' . bin2hex(random_bytes(4));
    if (@file_put_contents($tmp, $bytes, LOCK_EX) === false) return false;
    if (!@rename($tmp, $file)) { @unlink($tmp); return false; }
    return true;
}

function send_json($code, $body) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($body, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}
function send_text($code, $text, $type = 'text/plain; charset=utf-8') {
    http_response_code($code);
    header('Content-Type: ' . $type);
    header('Cache-Control: no-store');
    header('X-Content-Type-Options: nosniff');
    echo $text;
    exit;
}
function send_file($bytes, $type, $cache) {
    header('Content-Type: ' . $type);
    header('X-Content-Type-Options: nosniff');
    header('Cache-Control: ' . $cache);
    header('Content-Length: ' . strlen($bytes));
    echo $bytes;
    exit;
}

function body_json() {
    $raw = file_get_contents('php://input');
    if (strlen($raw) > 12000000) send_json(400, ['error' => 'bad json']);
    $v = json_decode($raw === '' ? '{}' : $raw, true);
    if (!is_array($v)) send_json(400, ['error' => 'bad json']);
    return $v;
}
function str_lim($v, $n = 300) {
    if ($v === null || is_array($v) || is_object($v)) return '';
    return mb_substr((string)$v, 0, $n);
}
function client_ip() {
    $fwd = $_SERVER['HTTP_X_FORWARDED_FOR'] ?? '';
    if ($fwd !== '') return trim(explode(',', $fwd)[0]);
    return $_SERVER['REMOTE_ADDR'] ?? '?';
}

/* Счётчик обращений с одного адреса. В Node жил в памяти процесса, здесь —
   в файле, потому что каждый запрос PHP это отдельный процесс. */
function hit($key, $max, $window) {
    $now = time();
    $fh = @fopen(RATE_FILE, 'c+');
    if (!$fh) return true;                     // не смогли посчитать — не блокируем
    flock($fh, LOCK_EX);
    $raw = stream_get_contents($fh);
    $all = json_decode($raw ?: '{}', true);
    if (!is_array($all)) $all = [];
    foreach ($all as $k => $e) if (($e['reset'] ?? 0) < $now) unset($all[$k]);
    $e = $all[$key] ?? null;
    if (!$e || $e['reset'] < $now) $e = ['count' => 0, 'reset' => $now + $window];
    $e['count']++;
    $all[$key] = $e;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($all));
    flock($fh, LOCK_UN); fclose($fh);
    return $e['count'] <= $max;
}

/* ---------- сессии администратора ---------- */

function sessions_load() {
    $s = read_json(SESSIONS_FILE, []);
    return is_array($s) ? $s : [];
}
function session_add($token) {
    $fh = @fopen(SESSIONS_FILE, 'c+');
    if (!$fh) return;
    flock($fh, LOCK_EX);
    $all = json_decode(stream_get_contents($fh) ?: '{}', true);
    if (!is_array($all)) $all = [];
    $now = time();
    foreach ($all as $t => $exp) if ($exp < $now) unset($all[$t]);
    $all[$token] = $now + TTL;
    ftruncate($fh, 0); rewind($fh);
    fwrite($fh, json_encode($all));
    flock($fh, LOCK_UN); fclose($fh);
}
function authed() {
    $h = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
    if ($h === '' && function_exists('apache_request_headers')) {
        foreach (apache_request_headers() as $k => $v) {
            if (strcasecmp($k, 'Authorization') === 0) { $h = $v; break; }
        }
    }
    $token = preg_replace('/^Bearer\s+/i', '', trim($h));
    if ($token === '') return false;
    $all = sessions_load();
    if (!isset($all[$token])) return false;
    if ($all[$token] < time()) return false;
    return true;
}
function need_auth() { send_json(401, ['error' => 'Нужна авторизация']); }

/* ---------- уведомления ---------- */

function secrets() {
    $s = read_json(SECRETS_FILE, []);
    $env = function ($name, $fallback) { $v = getenv($name); return $v !== false && $v !== '' ? $v : $fallback; };
    return [
        'tgToken' => $env('TG_TOKEN', $s['tgToken'] ?? ''),
        'tgChat'  => $env('TG_CHAT', $s['tgChat'] ?? ''),
        'smtp' => [
            'host' => $env('SMTP_HOST', $s['smtpHost'] ?? ''),
            'port' => (int)($env('SMTP_PORT', $s['smtpPort'] ?? 465) ?: 465),
            'user' => $env('SMTP_USER', $s['smtpUser'] ?? ''),
            'pass' => $env('SMTP_PASS', $s['smtpPass'] ?? ''),
            'from' => $env('SMTP_FROM', $s['smtpFrom'] ?? ''),
            'to'   => $env('SMTP_TO', $s['smtpTo'] ?? ''),
        ],
    ];
}

function tg_send($token, $chat, $text, $html = true) {
    $url = 'https://api.telegram.org/bot' . $token . '/sendMessage';
    $payload = json_encode(array_filter([
        'chat_id' => $chat, 'text' => $text,
        'parse_mode' => $html ? 'HTML' : null,
        'disable_web_page_preview' => true,
    ], fn($v) => $v !== null), JSON_UNESCAPED_UNICODE);

    if (function_exists('curl_init')) {
        $ch = curl_init($url);
        curl_setopt_array($ch, [
            CURLOPT_POST => true, CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => ['Content-Type: application/json'],
            CURLOPT_RETURNTRANSFER => true, CURLOPT_TIMEOUT => 15,
        ]);
        $out = curl_exec($ch);
        $err = curl_error($ch);
        curl_close($ch);
        if ($out === false) return ['ok' => false, 'description' => $err ?: 'сеть недоступна'];
        $j = json_decode($out, true);
        return is_array($j) ? $j : ['ok' => false, 'description' => 'непонятный ответ'];
    }
    $ctx = stream_context_create(['http' => [
        'method' => 'POST', 'header' => "Content-Type: application/json\r\n",
        'content' => $payload, 'timeout' => 15, 'ignore_errors' => true,
    ]]);
    $out = @file_get_contents($url, false, $ctx);
    if ($out === false) return ['ok' => false, 'description' => 'сеть недоступна'];
    $j = json_decode($out, true);
    return is_array($j) ? $j : ['ok' => false, 'description' => 'непонятный ответ'];
}

function lead_lines($lead, $html) {
    global $FORM_NAMES;
    $form = $FORM_NAMES[$lead['form'] ?? ''] ?? ($lead['form'] ?: '—');
    $nf = isset($lead['files']) ? count($lead['files']) : 0;
    $lines = [];
    $lines[] = $html
        ? '🦷 <b>Новая заявка</b> — All Smiles Динамо'
        : 'Новая заявка с сайта All Smiles Динамо';
    if (!$html) $lines[] = '';
    $lines[] = 'Форма: ' . $form;
    if (!empty($lead['name'])) $lines[] = 'Имя: ' . $lead['name'];
    $lines[] = 'Телефон: ' . $lead['phone'];
    if (!empty($lead['messenger'])) $lines[] = 'Мессенджер: ' . $lead['messenger'];
    if (!empty($lead['answers'])) $lines[] = 'Ответы: ' . $lead['answers'];
    if ($nf) $lines[] = 'Приложено файлов: ' . $nf . ' — смотреть в админке';
    if (!$html) {
        if (!empty($lead['page'])) $lines[] = 'Страница: ' . $lead['page'];
        $lines[] = 'Время: ' . date('d.m.Y, H:i:s', (int)($lead['ts'] / 1000));
    }
    return implode("\n", $lines);
}

function notify_telegram($lead) {
    $s = secrets();
    if (!$s['tgToken'] || !$s['tgChat']) return;
    $text = lead_lines($lead, true);
    // экранируем пользовательский ввод, чтобы HTML-разметка Telegram не поехала
    $text = str_replace(['&', '<b>', '</b>'], ['&amp;', "\x01", "\x02"], $text);
    $text = str_replace(['<', '>'], ['&lt;', '&gt;'], $text);
    $text = str_replace(["\x01", "\x02"], ['<b>', '</b>'], $text);
    tg_send($s['tgToken'], $s['tgChat'], $text, true);
}

function notify_email($lead) {
    $s = secrets()['smtp'];
    if (!$s['host'] || !$s['user'] || !$s['pass'] || !$s['to']) return;
    $to = preg_split('/[,;\s]+/', $s['to'], -1, PREG_SPLIT_NO_EMPTY);
    @send_mail($s, [
        'to' => $to,
        'subject' => 'Заявка с сайта — ' . ($lead['phone'] ?? ''),
        'text' => lead_lines($lead, false),
        'fromName' => 'Сайт All Smiles',
    ]);
}

/* Минимальный SMTP-клиент. 465 — неявный TLS, 587/25 — STARTTLS.
   Логин AUTH LOGIN, тело письма в base64/UTF-8. Бросает Exception с текстом,
   понятным администратору, но без самих логина и пароля. */
function send_mail($cfg, $mail) {
    $host = $cfg['host']; $port = (int)$cfg['port'] ?: 465;
    $user = $cfg['user']; $pass = $cfg['pass'];
    $from = $cfg['from'] ?: $cfg['user'];
    $to = array_values(array_filter((array)$mail['to']));
    if (!$host || !$user || !$pass || !$to) throw new Exception('SMTP не настроен');

    $scheme = $port === 465 ? 'ssl://' : 'tcp://';
    $ctx = stream_context_create(['ssl' => ['verify_peer' => false, 'verify_peer_name' => false]]);
    $fp = @stream_socket_client($scheme . $host . ':' . $port, $errno, $errstr, 25, STREAM_CLIENT_CONNECT, $ctx);
    if (!$fp) throw new Exception('не удалось подключиться к ' . $host . ':' . $port . ' (' . ($errstr ?: $errno) . ')');
    stream_set_timeout($fp, 25);

    $read = function () use ($fp) {
        $out = '';
        while (($line = fgets($fp, 1024)) !== false) {
            $out .= $line;
            if (strlen($line) >= 4 && $line[3] === ' ') break;
        }
        return $out;
    };
    $expect = function ($reply, $codes, $what) {
        $code = (int)substr(trim($reply), 0, 3);
        if (!in_array($code, $codes, true)) throw new Exception('SMTP ' . $code . ' на «' . $what . '»');
    };
    $cmd = function ($line, $codes, $what) use ($fp, $read, $expect) {
        fwrite($fp, $line . "\r\n");
        $expect($read(), $codes, $what);
    };

    $expect($read(), [220], 'приветствие');
    $cmd('EHLO allsmiles', [250], 'EHLO');
    if ($port !== 465) {
        $cmd('STARTTLS', [220], 'STARTTLS');
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            throw new Exception('не удалось включить TLS');
        }
        $cmd('EHLO allsmiles', [250], 'EHLO');
    }
    $cmd('AUTH LOGIN', [334], 'AUTH LOGIN');
    $cmd(base64_encode($user), [334], 'логин');
    $cmd(base64_encode($pass), [235], 'пароль');
    $cmd('MAIL FROM:<' . $from . '>', [250], 'MAIL FROM');
    foreach ($to as $t) $cmd('RCPT TO:<' . $t . '>', [250, 251], 'RCPT TO');
    $cmd('DATA', [354], 'DATA');

    $mimeWord = fn($s) => preg_match('/[^\x00-\x7F]/', (string)$s)
        ? '=?UTF-8?B?' . base64_encode((string)$s) . '?=' : (string)$s;
    $headers = [
        'From: ' . (!empty($mail['fromName']) ? $mimeWord($mail['fromName']) . ' <' . $from . '>' : $from),
        'To: ' . implode(', ', $to),
        'Subject: ' . $mimeWord($mail['subject'] ?? ''),
        'Date: ' . gmdate('D, d M Y H:i:s') . ' +0000',
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: base64',
    ];
    $payload = implode("\r\n", $headers) . "\r\n\r\n"
        . chunk_split(base64_encode($mail['text'] ?? ''), 76, "\r\n");
    fwrite($fp, $payload . "\r\n.\r\n");
    $expect($read(), [250], 'отправка письма');
    @fwrite($fp, "QUIT\r\n");
    @fclose($fp);
    return true;
}

/* ---------- файлы и пути ---------- */

function slug($page) {
    $p = preg_replace('#[^a-zA-Z0-9/_-]#', '', (string)($page ?: '/'));
    $p = preg_replace('#/+#', '/', $p);
    if ($p === '/') return 'root';
    $p = trim($p, '/');
    $p = str_replace('/', '_', $p);
    return $p !== '' ? $p : 'root';
}
function page_file($page) { return DATA . '/page_' . slug($page) . '.json'; }

// Тип определяем по сигнатуре файла, а не по тому, что заявил браузер.
function sniff_type($buf) {
    if (strlen($buf) < 12) return '';
    if (substr($buf, 0, 4) === '%PDF') return 'application/pdf';
    if (substr($buf, 0, 3) === "\xFF\xD8\xFF") return 'image/jpeg';
    if (substr($buf, 0, 4) === "\x89PNG") return 'image/png';
    if (substr($buf, 0, 4) === 'RIFF' && substr($buf, 8, 4) === 'WEBP') return 'image/webp';
    return '';
}

/* Файлы, загруженные больше суток назад и так и не привязанные к заявке:
   человек выбрал план лечения и ушёл, не оставив телефон. В Node это делал
   таймер, здесь — редкая уборка при обращении, не чаще раза в час. */
function sweep_orphan_files() {
    $stamp = DATA . '/.sweep';
    $last = is_file($stamp) ? (int)@file_get_contents($stamp) : 0;
    if (time() - $last < 3600) return;
    @file_put_contents($stamp, (string)time());
    $used = [];
    foreach (read_json(LEADS_FILE, []) as $l) {
        foreach ($l['files'] ?? [] as $f) if (!empty($f['id'])) $used[$f['id']] = true;
    }
    foreach (@scandir(LEAD_FILES) ?: [] as $name) {
        if ($name === '.' || $name === '..' || isset($used[$name])) continue;
        $p = LEAD_FILES . '/' . $name;
        if (is_file($p) && time() - filemtime($p) > 86400) @unlink($p);
    }
}

/* ---------- маршрутизация ---------- */

$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
$path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$route = preg_replace('#^/api#', '', $path);        // /api/content -> /content
$route = rtrim($route, '/');
if ($route === '') $route = '/';

if ($method === 'OPTIONS') send_json(204, []);

/* ---------- публичное ---------- */

if ($method === 'GET' && $route === '/content') {
    send_json(200, (object)read_json(page_file($_GET['page'] ?? '/'), []));
}

if ($method === 'GET' && $route === '/settings') {
    send_json(200, (object)read_json(SETTINGS_FILE, []));
}

if ($method === 'GET' && ($route === '/robots.txt' || $route === '/robots')) {
    $s = read_json(SETTINGS_FILE, []);
    $txt = trim((string)($s['robotsTxt'] ?? '')) !== ''
        ? (string)$s['robotsTxt'] : "User-agent: *\nAllow: /\n";
    send_text(200, $txt);
}

// приём файла к заявке (план лечения): тело запроса — сам файл
if ($method === 'POST' && $route === '/lead-file') {
    if (!hit('leadfile:' . client_ip(), 20, 600)) send_json(429, ['error' => 'Слишком много файлов, попробуйте позже']);
    $buf = file_get_contents('php://input');
    if ($buf === false || strlen($buf) === 0) send_json(400, ['error' => 'Пустой файл']);
    if (strlen($buf) > LEAD_FILE_MAX) send_json(413, ['error' => 'Файл больше 10 МБ']);
    $type = sniff_type($buf);
    if (!isset($LEAD_FILE_EXT[$type])) send_json(400, ['error' => 'Поддерживаются PDF, JPG, PNG и WebP']);
    $id = bin2hex(random_bytes(12)) . '.' . $LEAD_FILE_EXT[$type];
    if (!write_atomic(LEAD_FILES . '/' . $id, $buf)) send_json(500, ['error' => 'Не удалось сохранить файл']);
    sweep_orphan_files();
    send_json(200, ['id' => $id, 'size' => strlen($buf)]);
}

// приём заявки с формы
if ($method === 'POST' && $route === '/lead') {
    if (!hit('lead:' . client_ip(), 6, 60)) send_json(429, ['error' => 'Слишком часто, попробуйте позже']);
    $b = body_json();
    $phone = str_lim($b['phone'] ?? '', 40);
    if (strlen(preg_replace('/\D/', '', $phone)) < 10) send_json(400, ['error' => 'phone']);
    $lead = [
        'id' => bin2hex(random_bytes(8)),
        'ts' => (int)round(microtime(true) * 1000),
        'form' => str_lim($b['form'] ?? '', 40),
        'name' => str_lim($b['name'] ?? '', 120),
        'phone' => $phone,
        'messenger' => str_lim($b['messenger'] ?? '', 40),
        'answers' => str_lim($b['answers'] ?? '', 1000),
        'page' => str_lim($b['page'] ?? '', 200),
        'ref' => str_lim($b['ref'] ?? '', 300),
        'ua' => str_lim($_SERVER['HTTP_USER_AGENT'] ?? '', 300),
    ];
    // приложенные файлы: берём только те, что действительно лежат на диске
    $files = [];
    foreach (array_slice(is_array($b['files'] ?? null) ? $b['files'] : [], 0, 5) as $f) {
        $id = str_lim($f['id'] ?? '', 40);
        if (preg_match(LEAD_FILE_RE, $id) && is_file(LEAD_FILES . '/' . $id)) {
            $files[] = ['id' => $id, 'name' => str_lim($f['name'] ?? '', 120)];
        }
    }
    if ($files) $lead['files'] = $files;

    $fh = @fopen(LEADS_FILE, 'c+');
    if ($fh) {
        flock($fh, LOCK_EX);
        $arr = json_decode(stream_get_contents($fh) ?: '[]', true);
        if (!is_array($arr)) $arr = [];
        $arr[] = $lead;
        while (count($arr) > 5000) array_shift($arr);
        ftruncate($fh, 0); rewind($fh);
        fwrite($fh, json_encode($arr, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES));
        fflush($fh);
        flock($fh, LOCK_UN); fclose($fh);
    }
    notify_telegram($lead);
    notify_email($lead);
    send_json(200, ['ok' => true]);
}

// отдача загруженных картинок (OG и фото из редактора) — публично
if ($method === 'GET' && strpos($route, '/uploads/') === 0) {
    $name = substr($route, strlen('/uploads/'));
    if (!preg_match('/^[a-zA-Z0-9_.-]+$/', $name)) send_json(404, ['error' => 'not found']);
    $file = UPLOADS . '/' . $name;
    if (!is_file($file)) send_json(404, ['error' => 'not found']);
    $ext = strtolower(pathinfo($name, PATHINFO_EXTENSION));
    send_file(file_get_contents($file), $EXT_MIME[$ext] ?? 'application/octet-stream', 'public, max-age=86400');
}

/* ---------- вход ---------- */

if ($method === 'POST' && $route === '/login') {
    if (!hit('login:' . client_ip(), 12, 60)) send_json(429, ['error' => 'Слишком много попыток входа, подождите минуту']);
    $b = body_json();
    // сравнение за постоянное время: обычное === выходит на первом несовпавшем
    // символе и по времени ответа выдаёт, сколько символов угадано
    $ok = PASSWORD !== '' && hash_equals(hash('sha256', PASSWORD), hash('sha256', (string)($b['password'] ?? '')));
    if (!$ok) send_json(401, ['error' => 'Неверный пароль']);
    $token = bin2hex(random_bytes(24));
    session_add($token);
    send_json(200, ['token' => $token]);
}

/* ---------- только для админа ---------- */

if ($method === 'GET' && $route === '/leads') {
    if (!authed()) need_auth();
    $list = read_json(LEADS_FILE, []);
    send_json(200, ['leads' => array_values(array_reverse(is_array($list) ? $list : []))]);
}

// файл, приложенный к заявке — только админу
if ($method === 'GET' && strpos($route, '/lead-file/') === 0) {
    if (!authed()) need_auth();
    $id = substr($route, strlen('/lead-file/'));
    if (!preg_match(LEAD_FILE_RE, $id)) send_json(404, ['error' => 'not found']);
    $file = LEAD_FILES . '/' . $id;
    if (!is_file($file)) send_json(404, ['error' => 'not found']);
    $ext = strtolower(pathinfo($id, PATHINFO_EXTENSION));
    send_file(file_get_contents($file), $EXT_MIME[$ext] ?? 'application/octet-stream', 'no-store');
}

// удалить заявку(и) — вместе с приложенными файлами
if ($method === 'POST' && $route === '/leads/delete') {
    if (!authed()) need_auth();
    $b = body_json();
    $arr = read_json(LEADS_FILE, []);
    if (!is_array($arr)) $arr = [];
    $all = !empty($b['all']);
    $id = str_lim($b['id'] ?? '', 40);
    $gone = $all ? $arr : array_values(array_filter($arr, fn($l) => ($l['id'] ?? '') === $id));
    $rest = $all ? [] : array_values(array_filter($arr, fn($l) => ($l['id'] ?? '') !== $id));
    write_json(LEADS_FILE, $rest, false);
    foreach ($gone as $l) {
        foreach ($l['files'] ?? [] as $f) {
            if (preg_match(LEAD_FILE_RE, $f['id'] ?? '')) @unlink(LEAD_FILES . '/' . $f['id']);
        }
    }
    send_json(200, ['ok' => true, 'count' => count($rest)]);
}

// сохранить настройки сайта
if ($method === 'POST' && $route === '/settings') {
    if (!authed()) need_auth();
    $b = body_json();
    $p = is_array($b['data'] ?? null) ? $b['data'] : [];
    $seo = is_array($p['seo'] ?? null) ? $p['seo'] : [];
    $next = [
        'seo' => [
            'title' => str_lim($seo['title'] ?? '', 300),
            'description' => str_lim($seo['description'] ?? '', 500),
            'robots' => str_lim($seo['robots'] ?? '', 100),
            'ogTitle' => str_lim($seo['ogTitle'] ?? '', 300),
            'ogDescription' => str_lim($seo['ogDescription'] ?? '', 500),
            'ogImage' => str_lim($seo['ogImage'] ?? '', 500),
        ],
        'metrika' => str_lim($p['metrika'] ?? '', 20000),
        'metrikaId' => str_lim($p['metrikaId'] ?? '', 20),
        'calltracking' => str_lim($p['calltracking'] ?? '', 40000),
        'calltrackingId' => str_lim($p['calltrackingId'] ?? '', 40),
        'robotsTxt' => str_lim($p['robotsTxt'] ?? '', 8000),
        'headExtra' => str_lim($p['headExtra'] ?? '', 40000),
    ];
    write_json(SETTINGS_FILE, $next);
    send_json(200, ['ok' => true]);
}

// правки страницы
if ($method === 'POST' && $route === '/content') {
    if (!authed()) need_auth();
    $b = body_json();
    $file = page_file($b['page'] ?? '/');
    $cur = read_json($file, []);
    if (!is_array($cur)) $cur = [];
    $patch = is_array($b['data'] ?? null) ? $b['data'] : [];
    foreach ($patch as $k => $v) {
        if ($v === null) { unset($cur[$k]); continue; }
        $cap = strpos($k, 'img:') === 0 ? 4000000 : (strpos($k, 'seo:') === 0 ? 4000 : 20000);
        $cur[$k] = str_lim($v, $cap);
    }
    write_json($file, (object)$cur);
    send_json(200, ['ok' => true, 'count' => count($cur)]);
}

// настройки уведомлений: наружу секреты отдаются маскированными
if ($method === 'GET' && $route === '/notify') {
    if (!authed()) need_auth();
    $s = read_json(SECRETS_FILE, []);
    $mask = fn($v) => $v ? '••••' . mb_substr((string)$v, -4) : '';
    send_json(200, [
        'tgToken' => $mask($s['tgToken'] ?? ''), 'tgUsername' => $s['tgUsername'] ?? '', 'tgChat' => $s['tgChat'] ?? '',
        'smtpHost' => $s['smtpHost'] ?? '', 'smtpPort' => $s['smtpPort'] ?? '', 'smtpUser' => $s['smtpUser'] ?? '',
        'smtpPass' => $mask($s['smtpPass'] ?? ''), 'smtpFrom' => $s['smtpFrom'] ?? '', 'smtpTo' => $s['smtpTo'] ?? '',
        'env' => ['tg' => (bool)getenv('TG_TOKEN'), 'smtp' => (bool)getenv('SMTP_HOST')],
    ]);
}

if ($method === 'POST' && $route === '/notify') {
    if (!authed()) need_auth();
    $b = body_json();
    $s = read_json(SECRETS_FILE, []);
    if (!is_array($s)) $s = [];
    // пустое или маскированное значение секрета означает «не менять»
    $keep = function ($v, $old) {
        $v = trim(str_lim($v, 300));
        return ($v === '' || strpos($v, '••••') === 0) ? ($old ?: '') : $v;
    };
    $s['tgToken'] = $keep($b['tgToken'] ?? '', $s['tgToken'] ?? '');
    $s['tgUsername'] = ltrim(trim(str_lim($b['tgUsername'] ?? '', 100)), '@');
    $s['tgChat'] = trim(str_lim($b['tgChat'] ?? '', 100));
    $s['smtpHost'] = trim(str_lim($b['smtpHost'] ?? '', 200));
    $s['smtpPort'] = (string)((int)($b['smtpPort'] ?? 465) ?: 465);
    $s['smtpUser'] = trim(str_lim($b['smtpUser'] ?? '', 200));
    $s['smtpPass'] = $keep($b['smtpPass'] ?? '', $s['smtpPass'] ?? '');
    $s['smtpFrom'] = trim(str_lim($b['smtpFrom'] ?? '', 200));
    $s['smtpTo'] = trim(str_lim($b['smtpTo'] ?? '', 500));
    write_json(SECRETS_FILE, $s);
    @chmod(SECRETS_FILE, 0600);
    send_json(200, ['ok' => true]);
}

if ($method === 'POST' && $route === '/notify/test') {
    if (!authed()) need_auth();
    $b = body_json();
    $sec = secrets();
    $channel = $b['channel'] ?? '';
    if ($channel === 'tg') {
        if (!$sec['tgToken'] || !$sec['tgChat']) send_json(400, ['error' => 'Заполните токен бота и ID чата']);
        $j = tg_send($sec['tgToken'], $sec['tgChat'], '✅ Тест: уведомления о заявках All Smiles настроены', false);
        if (empty($j['ok'])) send_json(400, ['error' => 'Telegram: ' . ($j['description'] ?? 'ошибка')]);
        send_json(200, ['ok' => true]);
    }
    if ($channel === 'email') {
        $m = $sec['smtp'];
        if (!$m['host'] || !$m['user'] || !$m['pass'] || !$m['to']) {
            send_json(400, ['error' => 'Заполните сервер, логин, пароль и адрес получателя']);
        }
        try {
            send_mail($m, [
                'to' => preg_split('/[,;\s]+/', $m['to'], -1, PREG_SPLIT_NO_EMPTY),
                'subject' => 'Тест: уведомления о заявках',
                'text' => 'Если вы видите это письмо, почтовые уведомления с сайта All Smiles настроены.',
                'fromName' => 'Сайт All Smiles',
            ]);
            send_json(200, ['ok' => true]);
        } catch (Exception $e) {
            send_json(400, ['error' => 'Почта: ' . $e->getMessage()]);
        }
    }
    send_json(400, ['error' => 'channel']);
}

// загрузка картинки из редактора и для OG — только админ
if ($method === 'POST' && $route === '/upload') {
    if (!authed()) need_auth();
    $b = body_json();
    if (!preg_match('#^data:([\w/+.-]+);base64,(.+)$#s', (string)($b['data'] ?? ''), $m)) {
        send_json(400, ['error' => 'Нужна картинка']);
    }
    if (!isset($MIME_EXT[$m[1]])) send_json(400, ['error' => 'Нужна картинка']);
    $buf = base64_decode($m[2], true);
    if ($buf === false) send_json(400, ['error' => 'bad data']);
    if (strlen($buf) > 8000000) send_json(413, ['error' => 'Файл больше 8 МБ']);
    $file = bin2hex(random_bytes(8)) . '.' . $MIME_EXT[$m[1]];
    if (!write_atomic(UPLOADS . '/' . $file, $buf)) send_json(500, ['error' => 'Не удалось сохранить файл']);
    $host = $_SERVER['HTTP_X_FORWARDED_HOST'] ?? $_SERVER['HTTP_HOST'] ?? 'localhost';
    send_json(200, ['ok' => true, 'path' => '/api/uploads/' . $file, 'url' => 'https://' . $host . '/api/uploads/' . $file]);
}

if ($method === 'POST' && $route === '/reset') {
    if (!authed()) need_auth();
    $b = body_json();
    @unlink(page_file($b['page'] ?? '/'));
    send_json(200, ['ok' => true]);
}

send_json(404, ['error' => 'not found']);
