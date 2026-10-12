/* Админка лендинга All Smiles. Подключается на любую страницу:
   <script src="/js/editor.js" defer></script>
   Посетитель видит применённые правки; администратор (?admin + пароль) правит:
   тексты, картинки, порядок блоков, SEO-теги и подключает скрипты (Метрика). */
(() => {
  const API = '/api';
  const PAGE = location.pathname.replace(/index\.html$/, '') || '/';
  const TOKEN_KEY = 'as_editor_token';
  const CACHE_KEY = 'as_content:' + PAGE;

  const BLOCKS = 'div,section,article,ul,ol,dl,form,fieldset,header,footer,figure,aside,nav,table,picture,video,dialog,svg,input,select,textarea,img';
  const SKIP = '[data-noedit],.ed-bar,.ed-login,.ed-toast,.ed-modal,.ed-reorder,script,style,noscript,title';

  const hasOwnText = el => [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());

  function collect() {
    const out = [];
    document.body.querySelectorAll('*').forEach(el => {
      if (el.closest(SKIP)) return;
      if (el.querySelector(BLOCKS)) return;
      if (!hasOwnText(el)) return;
      if (out.some(p => p.contains(el))) return;
      out.push(el);
    });
    return out;
  }

  /* стабильный ключ: путь обрывается на ближайшем элементе с id (#id),
     поэтому перестановка блоков не ломает ключи текстов и картинок внутри них */
  function keyOf(el) {
    const parts = [];
    let n = el;
    while (n && n !== document.body) {
      if (n.id) { parts.unshift('#' + n.id); return parts.join('>'); }
      const p = n.parentElement;
      if (!p) break;
      const same = [...p.children].filter(c => c.tagName === n.tagName);
      parts.unshift(n.tagName.toLowerCase() + (same.length > 1 ? `:${same.indexOf(n) + 1}` : ''));
      n = p;
    }
    return parts.join('>');
  }

  const cleanText = html => String(html)
    .replace(/<\s*(script|style|iframe|object|embed)[\s\S]*?<\/\s*\1\s*>/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '');

  const okImgSrc = v => /^(data:image\/|https?:\/\/|\.?\/)/.test(String(v));

  let nodes = collect();

  /* ---------- применение правок к странице ---------- */
  function applyHead(data) {
    const metaName = (name, val) => {
      let m = document.head.querySelector(`meta[name="${name}"]`);
      if (!m) { m = document.createElement('meta'); m.setAttribute('name', name); document.head.appendChild(m); }
      m.setAttribute('content', val);
    };
    const metaProp = (prop, val) => {
      let m = document.head.querySelector(`meta[property="${prop}"]`);
      if (!m) { m = document.createElement('meta'); m.setAttribute('property', prop); document.head.appendChild(m); }
      m.setAttribute('content', val);
    };
    if (data['seo:title'] != null) document.title = data['seo:title'];
    if (data['seo:description'] != null) metaName('description', data['seo:description']);
    if (data['seo:robots'] != null) metaName('robots', data['seo:robots']);
    if (data['seo:og:title'] != null) metaProp('og:title', data['seo:og:title']);
    if (data['seo:og:description'] != null) metaProp('og:description', data['seo:og:description']);
    if (data['seo:og:image'] != null) metaProp('og:image', data['seo:og:image']);
    if (data['scripts']) injectScripts(data['scripts']);
  }

  let scriptsDone = false;
  function injectScripts(raw) {
    if (scriptsDone) return; scriptsDone = true; // один раз за загрузку
    const tpl = document.createElement('div');
    tpl.innerHTML = raw;
    [...tpl.childNodes].forEach(node => {
      try {
        if (node.tagName === 'SCRIPT') {
          const s = document.createElement('script');
          [...node.attributes].forEach(a => s.setAttribute(a.name, a.value));
          s.textContent = node.textContent;
          document.head.appendChild(s);
        } else {
          document.head.appendChild(node.cloneNode(true));
        }
      } catch (e) { /* кривой фрагмент не должен ронять страницу */ }
    });
  }

  function applyOrder(raw) {
    if (!raw) return;
    let order; try { order = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(order)) return;
    const main = document.querySelector('main'); if (!main) return;
    const map = new Map();
    main.querySelectorAll(':scope > section[id]').forEach(s => map.set(s.id, s));
    const present = [...map.keys()];
    const seq = order.filter(id => map.has(id)).concat(present.filter(id => !order.includes(id)));
    const items = seq.map(id => map.get(id));
    if (!items.length) return;
    const anchor = items[0].previousElementSibling; // точка привязки (бегущая строка / первый экран)
    let ref = anchor;
    items.forEach(s => { if (ref) ref.after(s); else main.prepend(s); ref = s; });
  }

  function applyData(data) {
    if (!data || !Object.keys(data).length) return;
    applyHead(data);
    applyOrder(data['order:main']);
    nodes.forEach(el => {
      const v = data[keyOf(el)];
      if (v != null && el.innerHTML !== v) el.innerHTML = cleanText(v);
    });
    document.querySelectorAll('img').forEach(img => {
      if (img.closest(SKIP)) return;
      const v = data['img:' + keyOf(img)];
      if (v != null && okImgSrc(v) && img.getAttribute('src') !== v) { img.src = v; img.removeAttribute('srcset'); }
    });
  }

  let cached = null;
  try { cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); } catch {}
  if (cached) applyData(cached);

  let serverData = {};
  async function refresh() {
    try {
      const r = await fetch(`${API}/content?page=${encodeURIComponent(PAGE)}`, { cache: 'no-store' });
      if (!r.ok) return cached || {};
      serverData = await r.json();
      applyData(serverData);
      try { localStorage.setItem(CACHE_KEY, JSON.stringify(serverData)); } catch {}
      return serverData;
    } catch { return cached || {}; }
  }

  const token = () => localStorage.getItem(TOKEN_KEY);
  const wantAdmin = () => new URLSearchParams(location.search).has('admin') || !!token();

  /* ---------- интерфейс администратора ---------- */
  function style() {
    const css = `
.ed-bar{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#1f1b33;color:#fff;font:500 14px/1.3 'Nunito','Segoe UI',sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.ed-bar b{font-weight:700}
.ed-dot{width:9px;height:9px;border-radius:50%;background:#2fd07a;flex:none}
.ed-sp{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ed-bar button{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;background:#3a3358;color:#fff}
.ed-bar button.primary{background:#e93d8d}
.ed-bar button.primary[disabled]{opacity:.45;cursor:default}
.ed-bar small{opacity:.65;font-weight:400}
body.ed-on{padding-bottom:62px}
body.ed-on [data-ed]{outline:1px dashed rgba(233,61,141,.5);outline-offset:3px;border-radius:3px;cursor:text}
body.ed-on [data-ed]:hover{background:rgba(233,61,141,.08)}
body.ed-on [data-ed]:focus{outline:2px solid #e93d8d;background:#fff;box-shadow:0 0 0 4px rgba(233,61,141,.15)}
body.ed-on [data-ed].ed-dirty{outline-color:#2fd07a;background:rgba(47,208,122,.08)}
body.ed-on [data-edimg]{outline:2px dashed rgba(94,83,145,.55);outline-offset:2px;cursor:pointer;position:relative}
body.ed-on [data-edimg]:hover{outline-color:#5e5391;filter:brightness(.92)}
body.ed-on [data-edimg].ed-dirty{outline:2px solid #2fd07a}
.ed-reorder{position:absolute;z-index:9998;top:8px;left:8px;display:flex;gap:4px;background:#1f1b33;border-radius:999px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.ed-reorder button{width:30px;height:30px;padding:0;border:0;border-radius:50%;background:#3a3358;color:#fff;font:700 15px/1 sans-serif;cursor:pointer;display:grid;place-items:center}
.ed-reorder button:hover{background:#e93d8d}
body.ed-on main>section[id]{position:relative;outline:1px dashed rgba(94,83,145,.25);outline-offset:-1px}
.ed-login,.ed-modal{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(31,27,51,.6);backdrop-filter:blur(4px)}
.ed-login form,.ed-modal .box{background:#fff;border-radius:20px;padding:26px;width:min(520px,calc(100vw - 32px));max-height:88vh;overflow:auto;font:400 15px/1.5 'Nunito','Segoe UI',sans-serif;box-shadow:0 30px 70px rgba(0,0,0,.3)}
.ed-login h3,.ed-modal h3{margin:0 0 6px;font-size:21px;font-weight:700}
.ed-login p{margin:0 0 16px;color:#777}
.ed-login input,.ed-modal input,.ed-modal textarea{width:100%;padding:12px 14px;border:1.5px solid #e3e0eb;border-radius:12px;font:inherit;outline:0;margin-bottom:4px;box-sizing:border-box}
.ed-login input{height:48px;margin-bottom:10px}
.ed-login input:focus,.ed-modal input:focus,.ed-modal textarea:focus{border-color:#e93d8d}
.ed-login button{width:100%;height:48px;border:0;border-radius:12px;background:#e93d8d;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.ed-login .err{color:#d8305f;font-size:13px;min-height:18px;margin:6px 0 0}
.ed-modal label{display:block;font-weight:700;margin:14px 0 4px;font-size:13px}
.ed-modal label small{display:block;font-weight:400;color:#8d8c96;font-size:12px;margin-top:1px}
.ed-modal textarea{min-height:110px;resize:vertical;font-family:ui-monospace,Menlo,monospace;font-size:13px}
.ed-modal .tabs{display:flex;gap:6px;margin-bottom:12px}
.ed-modal .tabs button{flex:1;border:0;border-radius:10px;padding:10px;background:#efeafb;color:#3a3358;font:inherit;font-weight:700;cursor:pointer}
.ed-modal .tabs button.on{background:#e93d8d;color:#fff}
.ed-modal .pane{display:none}
.ed-modal .pane.on{display:block}
.ed-modal .row{display:flex;gap:10px;margin-top:20px}
.ed-modal .row button{flex:1;height:46px;border:0;border-radius:12px;font:inherit;font-weight:700;cursor:pointer}
.ed-modal .row .ghost{background:#efeafb;color:#3a3358}
.ed-modal .row .go{background:#e93d8d;color:#fff}
.ed-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:100001;background:#1f1b33;color:#fff;padding:11px 20px;border-radius:999px;font:600 14px 'Nunito',sans-serif;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90vw;text-align:center}
.ed-toast.on{opacity:1}`;
    const el = document.createElement('style'); el.textContent = css; document.head.appendChild(el);
  }

  function toast(msg) {
    let t = document.querySelector('.ed-toast');
    if (!t) { t = document.createElement('div'); t.className = 'ed-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.classList.add('on');
    clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove('on'), 2600);
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

  /* уменьшаем картинку в браузере, чтобы не грузить сервер тяжёлыми файлами */
  function fileToDataURL(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        const type = /png/i.test(file.type) ? 'image/png' : 'image/webp';
        resolve(c.toDataURL(type, 0.86));
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function startEditing() {
    document.body.classList.add('ed-on');
    const dirty = new Map();            // текст и картинки: key -> value
    const head = {};                    // seo:* и scripts: key -> value
    let orderDirty = false;

    const bar = document.createElement('div');
    bar.className = 'ed-bar';
    bar.innerHTML = `<span class="ed-dot"></span><b>Админка</b>
      <small>текст · фото · порядок блоков</small>
      <span class="ed-sp"><small class="ed-cnt">0 изм.</small>
      <button type="button" class="ed-site">Сайт и SEO</button>
      <button type="button" class="ed-reset">Сбросить всё</button>
      <button type="button" class="ed-exit">Выйти</button>
      <button type="button" class="primary ed-save" disabled>Сохранить</button></span>`;
    document.body.appendChild(bar);
    const save = bar.querySelector('.ed-save');
    const counter = bar.querySelector('.ed-cnt');
    const bump = () => {
      const n = dirty.size + Object.keys(head).length + (orderDirty ? 1 : 0);
      save.disabled = !n; counter.textContent = `${n} изм.`;
    };

    /* --- тексты --- */
    nodes = collect();
    nodes.forEach(el => {
      const k = keyOf(el);
      el.dataset.ed = k;
      el.setAttribute('contenteditable', 'true');
      el.setAttribute('spellcheck', 'true');
      el._orig = el.innerHTML;
      el.addEventListener('input', () => { dirty.set(k, el.innerHTML); el.classList.add('ed-dirty'); bump(); });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.innerHTML = el._orig; dirty.delete(k); el.classList.remove('ed-dirty'); el.blur(); bump(); }
      });
      if (el.tagName === 'A' || el.tagName === 'BUTTON') el.addEventListener('click', e => e.preventDefault());
    });

    /* --- картинки --- */
    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = 'image/*'; picker.className = 'ed-picker'; picker.style.display = 'none';
    document.body.appendChild(picker);
    let target = null;
    document.querySelectorAll('img').forEach(img => {
      if (img.closest(SKIP)) return;
      img.dataset.edimg = keyOf(img);
      img.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); target = img; picker.value = ''; picker.click(); });
    });
    picker.addEventListener('change', async () => {
      const f = picker.files[0]; if (!f || !target) return;
      toast('Обрабатываю фото…');
      try {
        const url = await fileToDataURL(f);
        target.src = url; target.removeAttribute('srcset'); target.classList.add('ed-dirty');
        dirty.set('img:' + target.dataset.edimg, url); bump();
        toast('Фото заменено, не забудьте сохранить');
      } catch { toast('Не удалось обработать фото'); }
    });

    /* --- порядок блоков --- */
    const main = document.querySelector('main');
    const reorderables = () => [...main.querySelectorAll(':scope > section[id]')];
    function mountReorder() {
      reorderables().forEach(sec => {
        if (sec.querySelector(':scope > .ed-reorder')) return;
        const c = document.createElement('div');
        c.className = 'ed-reorder'; c.dataset.noedit = '';
        c.innerHTML = `<button type="button" title="Выше">↑</button><button type="button" title="Ниже">↓</button>`;
        const [up, down] = c.querySelectorAll('button');
        up.addEventListener('click', e => { e.stopPropagation(); move(sec, -1); });
        down.addEventListener('click', e => { e.stopPropagation(); move(sec, 1); });
        sec.appendChild(c);
      });
    }
    function move(sec, dir) {
      const list = reorderables();
      const i = list.indexOf(sec), j = i + dir;
      if (j < 0 || j >= list.length) return;
      if (dir < 0) list[j].before(sec); else list[j].after(sec);
      orderDirty = true; bump();
      sec.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    mountReorder();

    /* --- панель «Сайт и SEO» --- */
    bar.querySelector('.ed-site').addEventListener('click', () => {
      const get = (name, attr = 'name', prop = 'content') => {
        const sel = attr === 'name' ? `meta[name="${name}"]` : `meta[property="${name}"]`;
        const m = document.head.querySelector(sel); return m ? m.getAttribute(prop) : '';
      };
      const w = document.createElement('div'); w.className = 'ed-modal'; w.dataset.noedit = '';
      w.innerHTML = `<div class="box">
        <h3>Сайт и SEO</h3>
        <div class="tabs"><button class="on" data-t="seo">SEO</button><button data-t="js">Скрипты</button></div>
        <div class="pane on" data-p="seo">
          <label>Заголовок страницы (title)</label><input data-f="seo:title" value="">
          <label>Описание (meta description)<small>до 160 символов, для поиска</small></label><textarea data-f="seo:description" style="min-height:60px;font-family:inherit;font-size:14px"></textarea>
          <label>Индексация (robots)<small>например: index,follow или noindex,nofollow</small></label><input data-f="seo:robots" value="">
          <label>OG заголовок<small>для ссылок в соцсетях и мессенджерах</small></label><input data-f="seo:og:title" value="">
          <label>OG описание</label><input data-f="seo:og:description" value="">
          <label>OG картинка (URL)</label><input data-f="seo:og:image" value="">
        </div>
        <div class="pane" data-p="js">
          <label>Код в &lt;head&gt;<small>счётчик Яндекс Метрики, пиксели, другие скрипты. Вставьте код целиком вместе с &lt;script&gt;…&lt;/script&gt;</small></label>
          <textarea data-f="scripts" placeholder="<!-- Yandex.Metrika counter -->\n<script>...</script>"></textarea>
        </div>
        <div class="row"><button class="ghost" data-x>Отмена</button><button class="go" data-ok>Применить</button></div>
      </div>`;
      document.body.appendChild(w);
      const field = f => w.querySelector(`[data-f="${f}"]`);
      field('seo:title').value = ('seo:title' in head ? head['seo:title'] : (serverData['seo:title'] ?? document.title));
      field('seo:description').value = ('seo:description' in head ? head['seo:description'] : (serverData['seo:description'] ?? get('description')));
      field('seo:robots').value = ('seo:robots' in head ? head['seo:robots'] : (serverData['seo:robots'] ?? get('robots')));
      field('seo:og:title').value = ('seo:og:title' in head ? head['seo:og:title'] : (serverData['seo:og:title'] ?? get('og:title', 'property')));
      field('seo:og:description').value = ('seo:og:description' in head ? head['seo:og:description'] : (serverData['seo:og:description'] ?? get('og:description', 'property')));
      field('seo:og:image').value = ('seo:og:image' in head ? head['seo:og:image'] : (serverData['seo:og:image'] ?? get('og:image', 'property')));
      field('scripts').value = ('scripts' in head ? head['scripts'] : (serverData['scripts'] ?? ''));
      w.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => {
        w.querySelectorAll('.tabs button').forEach(x => x.classList.toggle('on', x === b));
        w.querySelectorAll('.pane').forEach(p => p.classList.toggle('on', p.dataset.p === b.dataset.t));
      }));
      const close = () => w.remove();
      w.querySelector('[data-x]').addEventListener('click', close);
      w.addEventListener('click', e => { if (e.target === w) close(); });
      w.querySelector('[data-ok]').addEventListener('click', () => {
        w.querySelectorAll('[data-f]').forEach(inp => { head[inp.dataset.f] = inp.value; });
        applyHead({ ...head }); // предпросмотр title сразу
        bump(); close(); toast('Готово, не забудьте сохранить');
      });
    });

    /* --- сохранение --- */
    save.addEventListener('click', async () => {
      const payload = Object.fromEntries(dirty);
      Object.assign(payload, head);
      if (orderDirty) payload['order:main'] = JSON.stringify(reorderables().map(s => s.id));
      if (!Object.keys(payload).length) return;
      save.disabled = true; save.textContent = 'Сохраняю…';
      try {
        const r = await fetch(`${API}/content`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
          body: JSON.stringify({ page: PAGE, data: payload }),
        });
        if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); location.reload(); return; }
        if (!r.ok) throw 0;
        let c = {};
        try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
        Object.assign(c, payload); Object.assign(serverData, payload);
        try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
        document.querySelectorAll('.ed-dirty').forEach(e => { e.classList.remove('ed-dirty'); if ('ed' in e.dataset) e._orig = e.innerHTML; });
        dirty.clear(); for (const k in head) delete head[k]; orderDirty = false;
        counter.textContent = 'сохранено'; save.disabled = true;
        toast('Сохранено. Правки видны всем посетителям');
      } catch { toast('Не удалось сохранить'); save.disabled = false; }
      save.textContent = 'Сохранить';
    });

    bar.querySelector('.ed-exit').addEventListener('click', () => {
      const n = dirty.size + Object.keys(head).length + (orderDirty ? 1 : 0);
      if (n && !confirm('Есть несохранённые правки. Выйти?')) return;
      localStorage.removeItem(TOKEN_KEY);
      location.href = location.pathname;
    });

    bar.querySelector('.ed-reset').addEventListener('click', async () => {
      if (!confirm('Удалить все правки этой страницы и вернуть исходный вид?')) return;
      await fetch(`${API}/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() },
        body: JSON.stringify({ page: PAGE }),
      });
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      location.reload();
    });

    addEventListener('beforeunload', e => {
      if (dirty.size + Object.keys(head).length + (orderDirty ? 1 : 0)) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  (async () => {
    await refresh();
    if (!wantAdmin()) return;
    style();
    if (!token() && !(await login())) return;
    startEditing();
  })();
})();
