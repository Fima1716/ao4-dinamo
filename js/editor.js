/* Инлайн-редактор текстов. Подключается на любую страницу: <script src="/js/editor.js" defer></script> Посетитель: скрипт  */
(() => {
  const API = '/api';
  const PAGE = location.pathname.replace(/index\.html$/, '') || '/';
  const TOKEN_KEY = 'as_editor_token';
  const CACHE_KEY = 'as_content:' + PAGE;

  /* Берём ЛЮБОЙ элемент, у которого есть собственный текст и внутри нет
     блочной структуры. Так редактируются и обычные <div> с текстом. */
  const BLOCKS = 'div,section,article,ul,ol,dl,form,fieldset,header,footer,figure,aside,nav,table,picture,video,dialog,svg,input,select,textarea,img';
  const SKIP = '[data-noedit],.ed-bar,.ed-login,.ed-toast,script,style,noscript,title';

  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

  function collect() {
    const out = [];
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest(SKIP)) return;
      if (el.querySelector(BLOCKS)) return;
      if (!hasOwnText(el)) return;
      if (out.some(p => p.contains(el))) return; // родитель уже взят целиком
      out.push(el);
    });
    return out;
  }

  /* стабильный ключ — путь элемента в дереве */
  function keyOf(el) {
    const parts = [];
    let n = el;
    while (n && n !== document.body) {
      const p = n.parentElement;
      if (!p) break;
      const same = [...p.children].filter(c => c.tagName === n.tagName);
      parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:${same.indexOf(n) + 1}` : ''));
      n = p;
    }
    return parts.join('>');
  }

  const clean = html => String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  let nodes = collect();

  function applyData(data) {
    if (!data || !Object.keys(data).length) return;
    nodes.forEach(el => {
      const v = data[keyOf(el)];
      if (v != null && el.innerHTML !== v) el.innerHTML = clean(v);
    });
  }

  /* 1. мгновенно из кэша — чтобы не мигал исходный текст */
  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}
  if (cached) applyData(cached);

  /* 2. затем свежие данные с сервера */
  async function refresh() {
    try {
      const r = await fetch(`${API}/content?page=${encodeURIComponent(PAGE)}`, { cache: 'no-store' });
      if (!r.ok) return cached || {};
      const data = await r.json();
      applyData(data);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(data)); } catch {}
      return data;
    } catch { return cached || {}; }
  }

  /* интерфейс админа */
  const token = () => localStorage.getItem(TOKEN_KEY);
  const wantAdmin = () => new URLSearchParams(location.search).has('admin') || !!token();

  function style() {
    const css = `
.ed-bar{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#1f1b33;color:#fff;font:500 14px/1.3 'Nunito','Segoe UI',sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.ed-bar b{font-weight:700}
.ed-dot{width:9px;height:9px;border-radius:50%;background:#2fd07a;flex:none}
.ed-sp{margin-left:auto;display:flex;gap:8px;align-items:center}
.ed-bar button{border:0;border-radius:999px;padding:9px 18px;font:inherit;font-weight:700;cursor:pointer;background:#3a3358;color:#fff}
.ed-bar button.primary{background:#e93d8d}
.ed-bar button.primary[disabled]{opacity:.45;cursor:default}
.ed-bar small{opacity:.65;font-weight:400}
body.ed-on{padding-bottom:58px}
body.ed-on [data-ed]{outline:1px dashed rgba(233,61,141,.5);outline-offset:3px;border-radius:3px;transition:background .15s;cursor:text}
body.ed-on [data-ed]:hover{background:rgba(233,61,141,.08)}
body.ed-on [data-ed]:focus{outline:2px solid #e93d8d;background:#fff;box-shadow:0 0 0 4px rgba(233,61,141,.15)}
body.ed-on [data-ed].ed-dirty{outline-color:#2fd07a;background:rgba(47,208,122,.08)}
.ed-login{position:fixed;inset:0;z-index:99999;display:grid;place-items:center;background:rgba(31,27,51,.6);backdrop-filter:blur(4px)}
.ed-login form{background:#fff;border-radius:20px;padding:28px;width:min(360px,calc(100vw - 32px));font:400 15px/1.5 'Nunito','Segoe UI',sans-serif;box-shadow:0 30px 70px rgba(0,0,0,.3)}
.ed-login h3{margin:0 0 6px;font-size:21px;font-weight:700}
.ed-login p{margin:0 0 16px;color:#777}
.ed-login input{width:100%;height:48px;padding:0 16px;border:1.5px solid #e3e0eb;border-radius:12px;font:inherit;outline:0;margin-bottom:10px}
.ed-login input:focus{border-color:#e93d8d}
.ed-login button{width:100%;height:48px;border:0;border-radius:12px;background:#e93d8d;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.ed-login .err{color:#d8305f;font-size:13px;min-height:18px;margin:6px 0 0}
.ed-toast{position:fixed;left:50%;bottom:76px;transform:translateX(-50%);z-index:99999;background:#1f1b33;color:#fff;padding:11px 20px;border-radius:999px;font:600 14px 'Nunito',sans-serif;opacity:0;transition:opacity .25s;pointer-events:none}
.ed-toast.on{opacity:1}`;
    const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
  }

  function toast(msg) {
    let t = document.querySelector('.ed-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ed-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2200);
  }

  function login() {
    return new Promise(resolve => {
      const w = document.createElement('div');
      w.className = 'ed-login';
      w.innerHTML = `<form><h3>Режим редактирования</h3><p>Введите пароль администратора</p>
        <input type="password" autocomplete="current-password" placeholder="Пароль">
        <p class="err"></p><button type="submit">Войти</button></form>`;
      document.body.appendChild(w);
      const f = w.querySelector('form'), inp = w.querySelector('input'), err = w.querySelector('.err');
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        try {
          const r = await fetch(`${API}/login`, {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: inp.value }),
          });
          const j = await r.json();
          if (!r.ok) { err.textContent = j.error || 'Ошибка'; return; }
          localStorage.setItem(TOKEN_KEY, j.token);
          w.remove(); resolve(true);
        } catch { err.textContent = 'Сервер недоступен'; }
      });
      w.addEventListener('click', e => { if (e.target === w) { w.remove(); resolve(false); } });
      setTimeout(() => inp.focus(), 50);
    });
  }

  function startEditing() {
    document.body.classList.add('ed-on');
    const dirty = new Map();

    const bar = document.createElement('div');
    bar.className = 'ed-bar';
    bar.innerHTML = `<span class="ed-dot"></span><b>Редактирование</b>
      <small>нажмите на любой текст · Enter — применить · Esc — отменить</small>
      <span class="ed-sp"><small class="ed-cnt">0 изм.</small>
      <button type="button" class="ed-reset">Сбросить всё</button>
      <button type="button" class="ed-exit">Выйти</button>
      <button type="button" class="primary ed-save" disabled>Сохранить</button></span>`;
    document.body.appendChild(bar);
    const save = bar.querySelector('.ed-save');
    const counter = bar.querySelector('.ed-cnt');

    nodes = collect();
    nodes.forEach(el => {
      const k = keyOf(el);
      el.dataset.ed = k;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el._orig = el.innerHTML;
      el.addEventListener('input', () => {
        dirty.set(k, el.innerHTML);
        el.classList.add('ed-dirty');
        save.disabled = false;
        counter.textContent = `${dirty.size} изм.`;
      });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.innerHTML = el._orig; dirty.delete(k); el.classList.remove('ed-dirty'); el.blur(); counter.textContent = `${dirty.size} изм.`; }
      });
      if (el.tagName === 'A' || el.tagName === 'BUTTON') el.addEventListener('click', e => e.preventDefault());
    });

    save.addEventListener('click', async () => {
      if (!dirty.size) return;
      save.disabled = true; save.textContent = 'Сохраняю…';
      try {
        const r = await fetch(`${API}/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ page: PAGE, data: Object.fromEntries(dirty) }),
        });
        if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); location.reload(); return; }
        if (!r.ok) throw 0;
        // обновляем локальный кэш, чтобы после перезагрузки текст не мигал
        let c = {};
        try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
        dirty.forEach((v, k) => { c[k] = v; });
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
        document.querySelectorAll('.ed-dirty').forEach(e => { e.classList.remove('ed-dirty'); e._orig = e.innerHTML; });
        dirty.clear(); counter.textContent = 'сохранено';
        toast('Тексты сохранены');
      } catch { toast('Не удалось сохранить'); save.disabled = false; }
      save.textContent = 'Сохранить';
    });

    bar.querySelector('.ed-exit').addEventListener('click', () => {
      if (dirty.size && !confirm('Есть несохранённые правки. Выйти?')) return;
      localStorage.removeItem(TOKEN_KEY);
      location.href = location.pathname;
    });

    bar.querySelector('.ed-reset').addEventListener('click', async () => {
      if (!confirm('Удалить все правки этой страницы и вернуть исходные тексты?')) return;
      await fetch(`${API}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ page: PAGE }),
      });
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      location.reload();
    });

    addEventListener('beforeunload', e => { if (dirty.size) { e.preventDefault(); e.returnValue = ''; } });
  }

  (async () => {
    await refresh();
    if (!wantAdmin()) return;
    style();
    if (!token() && !(await login())) return;
    startEditing();
  })();
})();
