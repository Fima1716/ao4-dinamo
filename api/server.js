/* Мини-API для инлайн-редактирования текстов лендингов.
   Хранит правки в JSON-файлах, по файлу на страницу. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const PORT = process.env.PORT || 8791;
const DATA = process.env.DATA_DIR || path.join(__dirname, 'data');
// Пароль берётся только из окружения. Если его не задали, генерируем случайный:
// сервис остаётся живым, но войти по угадываемому паролю нельзя.
const PASSWORD = process.env.EDITOR_PASSWORD || crypto.randomBytes(18).toString('base64url');
if (!process.env.EDITOR_PASSWORD) {
  console.warn('EDITOR_PASSWORD не задан — сгенерирован временный пароль:', PASSWORD);
}
const TTL = 30 * 24 * 3600 * 1000; // токен живёт 30 дней

fs.mkdirSync(DATA, { recursive: true });

const sessions = new Map(); // token -> expires

function slug(page) {
  const p = String(page || '/').replace(/[^a-zA-Z0-9/_-]/g, '').replace(/\/+/g, '/');
  return (p === '/' ? 'root' : p.replace(/^\/|\/$/g, '').replace(/\//g, '_')) || 'root';
}
const fileFor = page => path.join(DATA, slug(page) + '.json');

function readJSON(file) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return {}; }
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
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', c => { s += c; if (s.length > 2e6) req.destroy(); });
    req.on('end', () => { try { resolve(JSON.parse(s || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });
}
function authed(req) {
  const h = req.headers.authorization || '';
  const t = h.replace(/^Bearer\s+/i, '');
  const exp = sessions.get(t);
  if (!exp) return false;
  if (exp < Date.now()) { sessions.delete(t); return false; }
  return true;
}

http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const route = url.pathname.replace(/\/+$/, '') || '/';

  if (req.method === 'OPTIONS') return send(res, 204, {});

  // публичное чтение правок
  if (req.method === 'GET' && route === '/content') {
    return send(res, 200, readJSON(fileFor(url.searchParams.get('page'))));
  }

  if (req.method === 'POST' && route === '/login') {
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    if (String(b.password || '') !== PASSWORD) return send(res, 401, { error: 'Неверный пароль' });
    const token = crypto.randomBytes(24).toString('hex');
    sessions.set(token, Date.now() + TTL);
    return send(res, 200, { token });
  }

  if (req.method === 'POST' && route === '/content') {
    if (!authed(req)) return send(res, 401, { error: 'Нужна авторизация' });
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    const file = fileFor(b.page);
    const cur = readJSON(file);
    const patch = b.data && typeof b.data === 'object' ? b.data : {};
    for (const [k, v] of Object.entries(patch)) {
      if (v === null) delete cur[k];
      else cur[k] = String(v).slice(0, 20000);
    }
    fs.writeFileSync(file, JSON.stringify(cur, null, 1));
    return send(res, 200, { ok: true, count: Object.keys(cur).length });
  }

  if (req.method === 'POST' && route === '/reset') {
    if (!authed(req)) return send(res, 401, { error: 'Нужна авторизация' });
    let b; try { b = await body(req); } catch { return send(res, 400, { error: 'bad json' }); }
    try { fs.unlinkSync(fileFor(b.page)); } catch {}
    return send(res, 200, { ok: true });
  }

  send(res, 404, { error: 'not found' });
}).listen(PORT, '127.0.0.1', () => console.log('editor api on', PORT));
