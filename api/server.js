/* API админки лендингов All Smiles.
   Хранит в JSON-файлах: правки страниц (по файлу на страницу), настройки сайта
   (SEO/Метрика/колтрекинг/robots) и заявки с форм. Пароль — из окружения. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8791;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
const PASSWORD = process.env.EDITOR_PASSWORD || crypto.randomBytes(18).toString('base64url');
if (!process.env.EDITOR_PASSWORD) console.warn('EDITOR_PASSWORD не задан — временный пароль:', PASSWORD);
const TTL = 30 * 24 * 3600 * 1000;

fs.mkdirSync(DATA, { recursive: true });
const sessions = new Map();

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
function authed(req) {
  const t = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}
const str = (v, n = 300) => String(v == null ? '' : v).slice(0, n);

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

  // приём заявки с формы — публично
  if (req.method === 'POST' && route === '/lead') {
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
    const list = readJSON(LEADS, []);
    const arr = Array.isArray(list) ? list : [];
    arr.push(lead);
    while (arr.length > 5000) arr.shift();
    fs.writeFileSync(LEADS, JSON.stringify(arr));
    return send(res, 200, { ok: true });
  }

  /* ---------- вход ---------- */
  if (req.method === 'POST' && route === '/login') {
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
  // удалить заявку(и)
  if (req.method === 'POST' && route === '/leads/delete') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    let arr = readJSON(LEADS, []); if (!Array.isArray(arr)) arr = [];
    if (b.all) arr = [];
    else if (b.id) arr = arr.filter(l => l.id !== b.id);
    fs.writeFileSync(LEADS, JSON.stringify(arr));
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
      calltracking: str(p.calltracking, 40000), // код коллтрекинга
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

  if (req.method === 'POST' && route === '/reset') {
    if (!authed(req)) return needAuth();
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    try { fs.unlinkSync(fileFor(b.page)); } catch {}
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('admin api on', PORT));
