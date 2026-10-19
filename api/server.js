/* API админки лендингов All Smiles.
   Хранит в JSON-файлах: правки страниц (по файлу на страницу), настройки сайта
   (SEO/Метрика/колтрекинг/robots) и заявки с форм. Пароль — из окружения. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const tls = require('tls');
const net = require('net');

const PORT = process.env.PORT || 8791;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PASSWORD = process.env.EDITOR_PASSWORD || crypto.randomBytes(18).toString('base64url');
if (!process.env.EDITOR_PASSWORD) console.warn('EDITOR_PASSWORD не задан — временный пароль:', PASSWORD);
const TTL = 30 * 24 * 3600 * 1000;

fs.mkdirSync(DATA, { recursive: true });
const UPLOADS = path.join(DATA, 'uploads');
fs.mkdirSync(UPLOADS, { recursive: true });
const sessions = new Map();

const FORM_NAMES = { hero: 'Первый экран', modal: 'Окно «Рассчитать»', quiz: 'Квиз', final: 'Финальная форма', opinion: 'Второе мнение' };

// Токен Telegram, chat_id и доступы SMTP — из окружения либо из data/secrets.json
// рядом с данными. В репозиторий этот файл не попадает.
function secrets() {
  const f = path.join(DATA, 'secrets.json');
  let s = {}; try { s = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {}
  return {
    tgToken: process.env.TG_TOKEN || s.tgToken || '',
    tgChat: process.env.TG_CHAT || s.tgChat || '',
    smtp: {
      host: process.env.SMTP_HOST || s.smtpHost || '',
      port: Number(process.env.SMTP_PORT || s.smtpPort || 465),
      user: process.env.SMTP_USER || s.smtpUser || '',
      pass: process.env.SMTP_PASS || s.smtpPass || '',
      from: process.env.SMTP_FROM || s.smtpFrom || '',
      to: process.env.SMTP_TO || s.smtpTo || '',
    },
  };
}
function notifyTelegram(lead) {
  const { tgToken, tgChat } = secrets();
  if (!tgToken || !tgChat) return;
  const lines = [
    '🦷 <b>Новая заявка</b> — All Smiles Динамо',
    `Форма: ${FORM_NAMES[lead.form] || lead.form || '—'}`,
    lead.name ? `Имя: ${lead.name}` : '',
    `Телефон: ${lead.phone}`,
    lead.messenger ? `Мессенджер: ${lead.messenger}` : '',
    lead.answers ? `Ответы: ${lead.answers}` : '',
    lead.files && lead.files.length ? `Приложено файлов: ${lead.files.length} — смотреть в админке` : '',
  ].filter(Boolean);
  const text = lines.join('\n');
  fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: tgChat, text, parse_mode: 'HTML', disable_web_page_preview: true }),
  }).catch(() => {});
}

/* Минимальный SMTP-клиент (без внешних зависимостей).
   port 465 — неявный TLS; 587/25 — STARTTLS. Логин AUTH LOGIN, тело в base64/UTF-8. */
function sendMail(cfg, mail) {
  return new Promise((resolve, reject) => {
    const port = Number(cfg.port) || 465;
    const host = cfg.host, user = cfg.user, pass = cfg.pass, from = cfg.from || cfg.user;
    const sni = /^\d{1,3}(\.\d{1,3}){3}$/.test(host) ? undefined : host; // SNI только для доменов, не для IP
    const to = (Array.isArray(mail.to) ? mail.to : [mail.to]).filter(Boolean);
    if (!host || !user || !pass || !to.length) return reject(new Error('SMTP не настроен'));

    let settled = false, active = null;
    const finish = (err) => { if (settled) return; settled = true; clearTimeout(tm); try { active && active.destroy(); } catch {} err ? reject(err) : resolve(); };
    const tm = setTimeout(() => finish(new Error('SMTP timeout')), 25000);

    const b64 = (s) => Buffer.from(String(s), 'utf8').toString('base64');
    const mimeWord = (s) => /[^\x00-\x7F]/.test(String(s)) ? '=?UTF-8?B?' + b64(s) + '?=' : String(s);
    const headers = [
      'From: ' + (mail.fromName ? mimeWord(mail.fromName) + ' <' + from + '>' : from),
      'To: ' + to.join(', '),
      'Subject: ' + mimeWord(mail.subject || ''),
      'Date: ' + new Date().toUTCString(),
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset=UTF-8',
      'Content-Transfer-Encoding: base64',
    ];
    const payload = headers.join('\r\n') + '\r\n\r\n'
      + Buffer.from(String(mail.text || ''), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n') + '\r\n.\r\n';
    const authSteps = [
      { cmd: 'AUTH LOGIN', expect: [334] },
      { cmd: b64(user), expect: [334], secret: 'логин' },
      { cmd: b64(pass), expect: [235], secret: 'пароль' },
      { cmd: 'MAIL FROM:<' + from + '>', expect: [250] },
      ...to.map((t) => ({ cmd: 'RCPT TO:<' + t + '>', expect: [250, 251] })),
      { cmd: 'DATA', expect: [354] },
      { cmd: payload, raw: true, expect: [250], success: true },
    ];

    function runOn(sock, steps) {
      let buf = '', i = 0;
      const nextReply = () => { const m = /^(\d{3}) [^\r\n]*\r\n/m.exec(buf); if (!m) return null; buf = buf.slice(m.index + m[0].length); return parseInt(m[1], 10); };
      const prime = () => { const s = steps[i]; if (s && s.cmd !== undefined) { try { sock.write(s.cmd + (s.raw ? '' : '\r\n')); } catch (e) { finish(e); } } };
      sock.setEncoding('utf8');
      sock.on('error', (e) => finish(e));
      sock.on('data', (chunk) => {
        buf += chunk; let code;
        while ((code = nextReply()) !== null) {
          const s = steps[i]; if (!s) return;
          if (!s.expect.includes(code)) return finish(new Error('SMTP ' + code + ' на «' + (s.secret || (s.cmd ? s.cmd.split('\r')[0].slice(0, 20) : 'greeting')) + '»'));
          if (s.success) { try { sock.write('QUIT\r\n'); sock.end(); } catch {} return finish(); }
          if (s.upgrade) return s.upgrade(sock);
          i++; prime();
        }
      });
      prime();
    }

    if (port === 465) {
      active = tls.connect({ host, port, servername: sni, rejectUnauthorized: false });
      runOn(active, [{ expect: [220] }, { cmd: 'EHLO allsmiles', expect: [250] }, ...authSteps]);
    } else {
      active = net.connect({ host, port });
      runOn(active, [
        { expect: [220] },
        { cmd: 'EHLO allsmiles', expect: [250] },
        { cmd: 'STARTTLS', expect: [220], upgrade: (plain) => {
          const sec = tls.connect({ socket: plain, servername: sni, rejectUnauthorized: false }, () => {
            runOn(sec, [{ cmd: 'EHLO allsmiles', expect: [250] }, ...authSteps]);
          });
          active = sec; sec.on('error', (e) => finish(e));
        } },
      ]);
    }
  });
}
function notifyEmail(lead) {
  const { smtp } = secrets();
  if (!smtp.host || !smtp.user || !smtp.pass || !smtp.to) return;
  const lines = [
    'Новая заявка с сайта All Smiles Динамо', '',
    'Форма: ' + (FORM_NAMES[lead.form] || lead.form || '—'),
    lead.name ? 'Имя: ' + lead.name : '',
    'Телефон: ' + lead.phone,
    lead.messenger ? 'Мессенджер: ' + lead.messenger : '',
    lead.answers ? 'Ответы: ' + lead.answers : '',
    lead.files && lead.files.length ? 'Приложено файлов: ' + lead.files.length + ' — смотреть в админке' : '',
    lead.page ? 'Страница: ' + lead.page : '',
    'Время: ' + new Date(lead.ts).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' }),
  ].filter(Boolean);
  const to = String(smtp.to).split(/[,;\s]+/).filter(Boolean);
  sendMail(
    { host: smtp.host, port: smtp.port, user: smtp.user, pass: smtp.pass, from: smtp.from || smtp.user },
    { to, subject: 'Заявка с сайта — ' + (lead.phone || ''), text: lines.join('\n'), fromName: 'Сайт All Smiles' }
  ).catch((e) => console.warn('email lead error:', e.message));
}
const MIME_EXT = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };
const EXT_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', pdf: 'application/pdf' };

// Файлы, приложенные к заявке (планы лечения из формы «Второе мнение»).
// Это медицинские документы пациентов, поэтому лежат отдельно от публичных
// uploads и отдаются только администратору, по авторизации.
const LEAD_FILES = path.join(DATA, 'lead-files');
fs.mkdirSync(LEAD_FILES, { recursive: true });
const LEAD_FILE_MAX = 10 * 1024 * 1024;
const LEAD_FILE_RE = /^[a-f0-9]{24}\.(jpg|png|webp|pdf)$/;
const LEAD_FILE_EXT = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// Тип определяем по сигнатуре файла, а не по тому, что заявил браузер.
function sniffType(buf) {
  if (buf.length < 12) return '';
  if (buf.toString('latin1', 0, 4) === '%PDF') return 'application/pdf';
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  return '';
}

function slug(page) {
  const p = String(page || '/').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\/+/g, '/');
  return (p === '/' ? 'root' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_')) || 'root';
}
const fileFor = page => path.join(DATA, 'page_' + slug(page) + '.json');
const SETTINGS = path.join(DATA, 'settings.json');
const LEADS = path.join(DATA, 'leads.json');

function readJSON(file, def = {}) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return def; }
}
function send(res, code, body, extra = {}) {
  const data = JSON.stringify(body);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,Authorization',
    'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
    ...extra,
  });
  res.end(data);
}
function sendText(res, code, text, type = 'text/plain; charset=utf-8') {
  res.writeHead(code, { 'Content-Type': type, 'Cache-Control': 'no-store', 'Access-Control-Allow-Origin': '*' });
  res.end(text);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 12e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
// Читает тело запроса как есть. Превышение limit дочитываем вхолостую, чтобы
// успеть ответить понятной ошибкой; на совсем большом потоке рвём соединение.
function rawBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let n = 0, over = false;
    req.on('data', (c) => {
      n += c.length;
      if (n > limit * 2) { req.destroy(); reject(new Error('too big')); return; }
      if (n > limit) { over = true; chunks.length = 0; return; }
      chunks.push(c);
    });
    req.on('end', () => (over ? reject(new Error('too big')) : resolve(Buffer.concat(chunks))));
    req.on('error', reject);
  });
}
function authed(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const str = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

const rl = new Map();
function hit(key, max, windowMs) {
  const now = Date.now();
  let e = rl.get(key);
  if (!e || e.reset < now) { e = { count: 0, reset: now + windowMs }; rl.set(key, e); }
  e.count++;
  return e.count <= max;
}
function clientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '?';
}
setInterval(() => {
  const now = Date.now();
  for (const [k, e] of rl) if (e.reset < now) rl.delete(k);
  for (const [t, exp] of sessions) if (exp < now) sessions.delete(t);
  // файлы, загруженные больше суток назад, но так и не привязанные к заявке:
  // человек выбрал план лечения и ушёл, не оставив телефон
  try {
    const used = new Set();
    for (const l of readJSON(LEADS, [])) for (const f of l.files || []) used.add(f.id);
    for (const name of fs.readdirSync(LEAD_FILES)) {
      if (used.has(name)) continue;
      const p = path.join(LEAD_FILES, name);
      if (now - fs.statSync(p).mtimeMs > 24 * 3600 * 1000) fs.unlinkSync(p);
    }
  } catch {}
}, 300000).unref();

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname.replace(/\/+$/, '') || '/';
  if (req.method === 'OPTIONS') return send(res, 204, {});

  /* ---------- публичное ---------- */

  // правки конкретной страницы (тексты, фото, порядок блоков)
  if (req.method === 'GET' && route === '/content') {
    return send(res, 200, readJSON(fileFor(url.searchParams.get('page'))));
  }

  // настройки сайта — нужны всем посетителям (Метрика, колтрекинг, SEO)
  if (req.method === 'GET' && route === '/settings') {
    return send(res, 200, readJSON(SETTINGS));
  }

  // robots.txt отдаём как текст (nginx проксирует сюда /robots.txt)
  if (req.method === 'GET' && (route === '/robots.txt' || route === '/robots')) {
    const s = readJSON(SETTINGS);
    const txt = s.robotsTxt && String(s.robotsTxt).trim()
      ? String(s.robotsTxt)
      : 'User-agent: *\nAllow: /\n';
    return sendText(res, 200, txt);
  }

  // приём файла к заявке (план лечения) — публично, тело запроса это сам файл.
  // Отдаётся потом только админу через GET /lead-file/<id>.
  if (req.method === 'POST' && route === '/lead-file') {
    if (!hit('leadfile:' + clientIp(req), 20, 600000)) return send(res, 429, { error: 'Слишком много файлов, попробуйте позже' });
    let buf;
    try { buf = await rawBody(req, LEAD_FILE_MAX); } catch { return send(res, 413, { error: 'Файл больше 10 МБ' }); }
    if (!buf.length) return send(res, 400, { error: 'Пустой файл' });
    const type = sniffType(buf);
    if (!LEAD_FILE_EXT[type]) return send(res, 400, { error: 'Поддерживаются PDF, JPG, PNG и WebP' });
    const id = crypto.randomBytes(12).toString('hex') + '.' + LEAD_FILE_EXT[type];
    fs.writeFileSync(path.join(LEAD_FILES, id), buf);
    return send(res, 200, { id, size: buf.length });
  }

  // приём заявки с формы — публично
  if (req.method === 'POST' && route === '/lead') {
    if (!hit('lead:' + clientIp(req), 6, 60000)) return send(res, 429, { error: 'Слишком часто, попробуйте позже' });
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const phone = str(b.phone, 40);
    if (phone.replace(/\D/g, '').length < 10) return send(res, 400, { error: 'phone' });
    const lead = {
      id: crypto.randomBytes(8).toString('hex'),
      ts: Date.now(),
      form: str(b.form, 40),
      name: str(b.name, 120),
      phone,
      messenger: str(b.messenger, 40),
      answers: str(b.answers, 1000),
      page: str(b.page, 200),
      ref: str(b.ref, 300),
      ua: str(req.headers['user-agent'], 300),
    };
    // приложенные файлы: берём только те, что действительно лежат на диске
    const files = (Array.isArray(b.files) ? b.files : []).slice(0, 5)
      .map((f) => ({ id: str(f && f.id, 40), name: str(f && f.name, 120) }))
      .filter((f) => LEAD_FILE_RE.test(f.id) && fs.existsSync(path.join(LEAD_FILES, f.id)));
    if (files.length) lead.files = files;
    const list = readJSON(LEADS, []);
    const arr = Array.isArray(list) ? list : [];
    arr.push(lead);
    while (arr.length > 5000) arr.shift();
    fs.writeFileSync(LEADS, JSON.stringify(arr));
    notifyTelegram(lead);
    notifyEmail(lead);
    return send(res, 200, { ok: true });
  }

  // отдача загруженных файлов (картинки OG и т.п.) — публично
  if (req.method === 'GET' && route.startsWith('/uploads/')) {
    const name = route.slice('/uploads/'.length);
    if (!/^[a-zA-Z0-9_.-]+$/.test(name)) return send(res, 404, { error: 'not found' });
    const file = path.join(UPLOADS, name);
    let data; try { data = fs.readFileSync(file); } catch { return send(res, 404, { error: 'not found' }); }
    const ext = (name.split('.').pop() || '').toLowerCase();
    res.writeHead(200, { 'Content-Type': EXT_MIME[ext] || 'application/octet-stream', 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'public, max-age=86400', 'Access-Control-Allow-Origin': '*' });
    return res.end(data);
  }

  /* ---------- вход ---------- */
  if (req.method === 'POST' && route === '/login') {
    if (!hit('login:' + clientIp(req), 12, 60000)) return send(res, 429, { error: 'Слишком много попыток входа, подождите минуту' });
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    if (String(b.password || '') !== PASSWORD) return send(res, 401, { error: 'Неверный пароль' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + TTL);
    return send(res, 200, { token });
  }

  /* ---------- только для админа ---------- */
  const needAuth = () => send(res, 401, { error: 'Нужна авторизация' });

  // список заявок
  if (req.method === 'GET' && route === '/leads') {
    if (!authed(req)) return needAuth();
    const list = readJSON(LEADS, []);
    return send(res, 200, { leads: Array.isArray(list) ? list.slice().reverse() : [] });
  }
  // файл, приложенный к заявке — только админу
  if (req.method === 'GET' && route.startsWith('/lead-file/')) {
    if (!authed(req)) return needAuth();
    const id = route.slice('/lead-file/'.length);
    if (!LEAD_FILE_RE.test(id)) return send(res, 404, { error: 'not found' });
    let data; try { data = fs.readFileSync(path.join(LEAD_FILES, id)); } catch { return send(res, 404, { error: 'not found' }); }
    res.writeHead(200, {
      'Content-Type': EXT_MIME[id.split('.').pop()] || 'application/octet-stream',
      'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-store',
    });
    return res.end(data);
  }

  // удалить заявку(и) — вместе с приложенными файлами
  if (req.method === 'POST' && route === '/leads/delete') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    let arr = readJSON(LEADS, []); if (!Array.isArray(arr)) arr = [];
    const gone = b.all ? arr : arr.filter(l => l.id === b.id);
    if (b.all) arr = [];
    else if (b.id) arr = arr.filter(l => l.id !== b.id);
    fs.writeFileSync(LEADS, JSON.stringify(arr));
    for (const l of gone) for (const f of l.files || []) {
      if (LEAD_FILE_RE.test(f.id || '')) { try { fs.unlinkSync(path.join(LEAD_FILES, f.id)); } catch {} }
    }
    return send(res, 200, { ok: true, count: arr.length });
  }

  // сохранить настройки сайта
  if (req.method === 'POST' && route === '/settings') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const cur = readJSON(SETTINGS);
    const p = b.data && typeof b.data === 'object' ? b.data : {};
    const seo = p.seo || {};
    const next = {
      seo: {
        title: str(seo.title, 300),
        description: str(seo.description, 500),
        robots: str(seo.robots, 100),
        ogTitle: str(seo.ogTitle, 300),
        ogDescription: str(seo.ogDescription, 500),
        ogImage: str(seo.ogImage, 500),
      },
      metrika: str(p.metrika, 20000),       // код счётчика Яндекс Метрики
      metrikaId: str(p.metrikaId, 20),      // или только номер счётчика
      calltracking: str(p.calltracking, 40000), // полный код коллтрекинга
      calltrackingId: str(p.calltrackingId, 40), // или ID Calltouch
      robotsTxt: str(p.robotsTxt, 8000),
      headExtra: str(p.headExtra, 40000),   // любой дополнительный код в <head>
    };
    fs.writeFileSync(SETTINGS, JSON.stringify(next, null, 1));
    return send(res, 200, { ok: true });
  }

  // правки страницы
  if (req.method === 'POST' && route === '/content') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const file = fileFor(b.page);
    const cur = readJSON(file);
    const patch = b.data && typeof b.data === 'object' ? b.data : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) { delete cur[k]; continue; }
      const cap = k.startsWith('img:') ? 4_000_000 : k.startsWith('seo:') ? 4_000 : 20_000;
      cur[k] = String(v).slice(0, cap);
    }
    fs.writeFileSync(file, JSON.stringify(cur, null, 1));
    return send(res, 200, { ok: true, count: Object.keys(cur).length });
  }

  // настройки уведомлений о заявках (Telegram и почта) — только админ.
  // Секреты хранятся в data/secrets.json и наружу отдаются маскированными;
  // переменные окружения, если заданы, имеют приоритет над сохранённым.
  const SECRETS = path.join(DATA, 'secrets.json');
  if (req.method === 'GET' && route === '/notify') {
    if (!authed(req)) return needAuth();
    const s = readJSON(SECRETS);
    const mask = v => (v ? '••••' + String(v).slice(-4) : '');
    return send(res, 200, {
      tgToken: mask(s.tgToken), tgUsername: s.tgUsername || '', tgChat: s.tgChat || '',
      smtpHost: s.smtpHost || '', smtpPort: s.smtpPort || '', smtpUser: s.smtpUser || '',
      smtpPass: mask(s.smtpPass), smtpFrom: s.smtpFrom || '', smtpTo: s.smtpTo || '',
      env: { tg: !!process.env.TG_TOKEN, smtp: !!process.env.SMTP_HOST },
    });
  }
  if (req.method === 'POST' && route === '/notify') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const s = readJSON(SECRETS);
    // пустое или маскированное значение секрета означает «не менять»
    const keep = (v, old) => { v = str(v, 300).trim(); return (!v || v.startsWith('••••')) ? (old || '') : v; };
    s.tgToken = keep(b.tgToken, s.tgToken);
    s.tgUsername = str(b.tgUsername, 100).trim().replace(/^@/, '');
    s.tgChat = str(b.tgChat, 100).trim();
    s.smtpHost = str(b.smtpHost, 200).trim();
    s.smtpPort = String(parseInt(b.smtpPort, 10) || 465);
    s.smtpUser = str(b.smtpUser, 200).trim();
    s.smtpPass = keep(b.smtpPass, s.smtpPass);
    s.smtpFrom = str(b.smtpFrom, 200).trim();
    s.smtpTo = str(b.smtpTo, 500).trim();
    fs.writeFileSync(SECRETS, JSON.stringify(s, null, 1));
    return send(res, 200, { ok: true });
  }
  if (req.method === 'POST' && route === '/notify/test') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const sec = secrets();
    if (b.channel === 'tg') {
      if (!sec.tgToken || !sec.tgChat) return send(res, 400, { error: 'Заполните токен бота и ID чата' });
      try {
        const r = await fetch(`https://api.telegram.org/bot${sec.tgToken}/sendMessage`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ chat_id: sec.tgChat, text: '✅ Тест: уведомления о заявках All Smiles настроены' }),
        });
        const j = await r.json().catch(() => ({}));
        if (!j.ok) return send(res, 400, { error: 'Telegram: ' + (j.description || 'ошибка ' + r.status) });
        return send(res, 200, { ok: true });
      } catch (e) { return send(res, 400, { error: 'Telegram недоступен: ' + e.message }); }
    }
    if (b.channel === 'email') {
      const m = sec.smtp;
      if (!m.host || !m.user || !m.pass || !m.to) return send(res, 400, { error: 'Заполните сервер, логин, пароль и адрес получателя' });
      try {
        await sendMail(
          { host: m.host, port: m.port, user: m.user, pass: m.pass, from: m.from || m.user },
          { to: String(m.to).split(/[,;\s]+/).filter(Boolean), subject: 'Тест: уведомления о заявках', text: 'Если вы видите это письмо, почтовые уведомления с сайта All Smiles настроены.', fromName: 'Сайт All Smiles' }
        );
        return send(res, 200, { ok: true });
      } catch (e) { return send(res, 400, { error: 'Почта: ' + e.message }); }
    }
    return send(res, 400, { error: 'channel' });
  }

  // загрузка файла (OG-картинка и пр.) — только админ
  if (req.method === 'POST' && route === '/upload') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const m = /^data:([\w/+.-]+);base64,(.+)$/s.exec(String(b.data || ''));
    if (!m || !MIME_EXT[m[1]]) return send(res, 400, { error: 'Нужна картинка' });
    let buf; try { buf = Buffer.from(m[2], 'base64'); } catch { return send(res, 400, { error: 'bad data' }); }
    if (buf.length > 8_000_000) return send(res, 413, { error: 'Файл больше 8 МБ' });
    const file = crypto.randomBytes(8).toString('hex') + '.' + MIME_EXT[m[1]];
    fs.writeFileSync(path.join(UPLOADS, file), buf);
    const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost';
    return send(res, 200, { ok: true, path: '/api/uploads/' + file, url: 'https://' + host + '/api/uploads/' + file });
  }

  if (req.method === 'POST' && route === '/reset') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    try { fs.unlinkSync(fileFor(b.page)); } catch {}
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('admin api on', PORT));
