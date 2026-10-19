/* Клиентская часть админки All Smiles. Подключается на каждую страницу.
   Посетителю: применяет настройки сайта (SEO, Яндекс Метрика, колтрекинг)
   и сохранённые правки страницы (тексты, фото, порядок блоков).
   Администратору (?admin + токен): режим правки страницы прямо на ней.
   SEO, Метрика, колтрекинг и заявки живут в отдельной панели /admin/. */
(() => {
  const API = '/api';
  // Ключ, по которому хранятся правки страницы. Задаётся через <body data-page="…">,
  // иначе берётся путь страницы. Значения ключей («/final/», «/final/vrachi/…»)
  // остались с тех пор, когда сайт лежал в подпапке /final/: переименование
  // ключа отвяжет страницу от уже сделанных клиентом правок, поэтому их не трогаем.
  const PAGE = (document.body && document.body.getAttribute('data-page'))
    || location.pathname.replace(/index\.html$/, '') || '/';
  const TOKEN_KEY = 'as_editor_token';
  const CACHE_KEY = 'as_content:' + PAGE;
  const SET_CACHE = 'as_settings';

  const BLOCKS = 'div,section,article,ul,ol,dl,form,fieldset,header,footer,figure,aside,nav,table,picture,video,dialog,svg,input,select,textarea,img';
  const SKIP = '[data-noedit],.ed-bar,.ed-login,.ed-toast,.ed-picker,.ed-reorder,script,style,noscript,title';
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
  function keyOf(el) {
    const parts = [];
    let n = el;
    while (n && n !== document.body) {
      if (n.id) { parts.unshift('#' + n.id); return parts.join('>'); }
      const p = n.parentElement; if (!p) break;
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

  /* ---------- настройки сайта (общие для всех страниц) ---------- */
  let injected = false;
  function injectHTML(raw) {
    const tpl = document.createElement('div'); tpl.innerHTML = raw;
    [...tpl.childNodes].forEach(node => {
      try {
        if (node.tagName === 'SCRIPT') {
          const s = document.createElement('script');
          [...node.attributes].forEach(a => s.setAttribute(a.name, a.value));
          s.textContent = node.textContent;
          document.head.appendChild(s);
        } else document.head.appendChild(node.cloneNode(true));
      } catch (e) {}
    });
  }
  function metrikaSnippet(id) {
    return `<script>(function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};m[i].l=1*new Date();`
      + `for(var j=0;j<document.scripts.length;j++){if(document.scripts[j].src===r){return;}}k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})`
      + `(window,document,"script","https://mc.yandex.ru/metrika/tag.js","ym");ym(${JSON.stringify(id)},"init",{clickmap:true,trackLinks:true,accurateTrackBounce:true,webvisor:true});<\/script>`
      + `<noscript><div><img src="https://mc.yandex.ru/watch/${encodeURIComponent(id)}" style="position:absolute;left:-9999px" alt=""/></div><\/noscript>`;
  }
  function calltouchSnippet(id) {
    return `<script>(function(w,d,n,c){w.CalltouchDataObject=n;w[n]=function(){w[n]["callbacks"].push(arguments)};if(!w[n]["callbacks"]){w[n]["callbacks"]=[]}w[n]["loaded"]=false;if(typeof c!=="object"){c=[c]}w[n]["counters"]=c;for(var i=0;i<c.length;i+=1){p(c[i])}function p(cId){var a=d.getElementsByTagName("script")[0],s=d.createElement("script"),i=function(){a.parentNode.insertBefore(s,a)},m=typeof Array.prototype.find === "function",n=m?"init-min.js":"init.js";s.async=true;s.src="https://mod.calltouch.ru/"+n+"?id="+cId;if(w.opera=="[object Opera]"){d.addEventListener("DOMContentLoaded",i,false)}else{i()}}})(window,document,"ct",${JSON.stringify(String(id))});<\/script>`;
  }
  function applySettings(s) {
    if (!s) return;
    const seo = s.seo || {};
    // SEO-теги применяем только на главной (у страниц врачей — свои заголовки)
    if (PAGE === '/final/') {
      if (seo.title) document.title = seo.title;
      const setMeta = (sel, create, val) => {
        if (val == null || val === '') return;
        let m = document.head.querySelector(sel);
        if (!m) { m = create(); document.head.appendChild(m); }
        m.setAttribute('content', val);
      };
      setMeta('meta[name="description"]', () => { const m = document.createElement('meta'); m.name = 'description'; return m; }, seo.description);
      setMeta('meta[name="robots"]', () => { const m = document.createElement('meta'); m.name = 'robots'; return m; }, seo.robots);
      setMeta('meta[property="og:title"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:title'); return m; }, seo.ogTitle);
      setMeta('meta[property="og:description"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:description'); return m; }, seo.ogDescription);
      setMeta('meta[property="og:image"]', () => { const m = document.createElement('meta'); m.setAttribute('property', 'og:image'); return m; }, seo.ogImage);
    }
    if (!injected) {
      injected = true;
      if (s.metrika) injectHTML(s.metrika);
      else if (s.metrikaId) injectHTML(metrikaSnippet(s.metrikaId));
      if (s.calltracking) injectHTML(s.calltracking);
      else if (s.calltrackingId) injectHTML(calltouchSnippet(s.calltrackingId));
      if (s.headExtra) injectHTML(s.headExtra);
    }
  }

  /* ---------- правки страницы ---------- */
  function applyOrder(raw) {
    if (!raw) return;
    let order; try { order = JSON.parse(raw); } catch { return; }
    if (!Array.isArray(order)) return;
    const main = document.querySelector('main'); if (!main) return;
    const map = new Map();
    main.querySelectorAll(':scope > section[id]').forEach(s => map.set(s.id, s));
    const seq = order.filter(id => map.has(id)).concat([...map.keys()].filter(id => !order.includes(id)));
    const items = seq.map(id => map.get(id));
    if (!items.length) return;
    let ref = items[0].previousElementSibling;
    items.forEach(s => { if (ref) ref.after(s); else main.prepend(s); ref = s; });
  }
  function applyContent(data) {
    if (!data || !Object.keys(data).length) return;
    applyOrder(data['order:main']);
    nodes.forEach(el => { const v = data[keyOf(el)]; if (v != null && el.innerHTML !== v) el.innerHTML = cleanText(v); });
    document.querySelectorAll('img').forEach(img => {
      if (img.closest(SKIP)) return;
      const v = data['img:' + keyOf(img)];
      if (v != null && okImgSrc(v) && img.getAttribute('src') !== v) { img.src = v; img.removeAttribute('srcset'); }
    });
    // флаги (замена инлайн-SVG на картинку)
    document.querySelectorAll('.implant-country > svg, .implant-country > img.ed-flag-img').forEach(node => {
      const v = data['flag:' + keyOf(node.parentElement)];
      if (v == null || !okImgSrc(v)) return;
      if (node.tagName === 'IMG') { if (node.getAttribute('src') !== v) node.src = v; }
      else { const img = flagImg(v); node.replaceWith(img); }
    });
  }
  function flagImg(src) {
    const img = document.createElement('img');
    img.className = 'ed-flag-img'; img.src = src; img.alt = '';
    img.style.cssText = 'width:30px;height:22px;object-fit:cover;border-radius:3px;display:inline-block;flex:none';
    return img;
  }

  // быстро из кэша
  try { const c = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null'); if (c) applyContent(c); } catch {}
  try { const s = JSON.parse(localStorage.getItem(SET_CACHE) || 'null'); if (s) applySettings(s); } catch {}

  let serverData = {};
  async function refresh() {
    try {
      const [cr, sr] = await Promise.all([
        fetch(`${API}/content?page=${encodeURIComponent(PAGE)}`, { cache: 'no-store' }),
        fetch(`${API}/settings`, { cache: 'no-store' }),
      ]);
      if (cr.ok) { serverData = await cr.json(); applyContent(serverData); try { localStorage.setItem(CACHE_KEY, JSON.stringify(serverData)); } catch {} }
      if (sr.ok) { const s = await sr.json(); applySettings(s); try { localStorage.setItem(SET_CACHE, JSON.stringify(s)); } catch {} }
    } catch {}
    try { document.dispatchEvent(new Event('as:content-applied')); } catch {}
  }

  const token = () => localStorage.getItem(TOKEN_KEY);
  const wantAdmin = () => new URLSearchParams(location.search).has('admin');

  /* ---------- режим правки страницы ---------- */
  function style() {
    const css = `
.ed-bar{position:fixed;left:0;right:0;bottom:0;z-index:99999;display:flex;align-items:center;gap:10px;padding:10px 16px;background:#1f1b33;color:#fff;font:500 14px/1.3 'Nunito','Segoe UI',sans-serif;box-shadow:0 -6px 24px rgba(0,0,0,.25)}
.ed-bar b{font-weight:700}
.ed-dot{width:9px;height:9px;border-radius:50%;background:#2fd07a;flex:none}
.ed-sp{margin-left:auto;display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ed-bar button,.ed-bar a.btn{border:0;border-radius:999px;padding:9px 16px;font:inherit;font-weight:700;cursor:pointer;background:#3a3358;color:#fff;text-decoration:none}
.ed-bar button.primary{background:#e93d8d}
.ed-bar button.primary[disabled]{opacity:.45;cursor:default}
.ed-bar small{opacity:.65;font-weight:400}
body.ed-on{padding-bottom:62px}
body.ed-on [data-ed]{outline:1px dashed rgba(233,61,141,.5);outline-offset:3px;border-radius:3px;cursor:text}
body.ed-on [data-ed]:hover{background:rgba(233,61,141,.08)}
body.ed-on [data-ed]:focus{outline:2px solid #e93d8d;background:#fff;box-shadow:0 0 0 4px rgba(233,61,141,.15)}
body.ed-on [data-ed].ed-dirty{outline-color:#2fd07a;background:rgba(47,208,122,.08)}
body.ed-on [data-edimg]{outline:2px dashed rgba(94,83,145,.55);outline-offset:2px;cursor:pointer}
body.ed-on [data-edimg]:hover{outline-color:#5e5391;filter:brightness(.92)}
body.ed-on [data-edimg].ed-dirty{outline:2px solid #2fd07a}
.ed-reorder{position:absolute;z-index:9998;top:8px;left:8px;display:flex;gap:4px;background:#1f1b33;border-radius:999px;padding:4px;box-shadow:0 6px 18px rgba(0,0,0,.25)}
.ed-reorder button{width:30px;height:30px;padding:0;border:0;border-radius:50%;background:#3a3358;color:#fff;font:700 15px/1 sans-serif;cursor:pointer;display:grid;place-items:center}
.ed-reorder button:hover{background:#e93d8d}
body.ed-on main>section[id]{position:relative;outline:1px dashed rgba(94,83,145,.25);outline-offset:-1px}
.ed-login{position:fixed;inset:0;z-index:100000;display:grid;place-items:center;background:rgba(31,27,51,.6);backdrop-filter:blur(4px)}
.ed-login form{background:#fff;border-radius:20px;padding:26px;width:min(360px,calc(100vw - 32px));font:400 15px/1.5 'Nunito','Segoe UI',sans-serif;box-shadow:0 30px 70px rgba(0,0,0,.3)}
.ed-login h3{margin:0 0 6px;font-size:21px;font-weight:700}
.ed-login p{margin:0 0 16px;color:#777}
.ed-login input{width:100%;height:48px;padding:0 16px;border:1.5px solid #e3e0eb;border-radius:12px;font:inherit;outline:0;margin-bottom:10px}
.ed-login input:focus{border-color:#e93d8d}
.ed-login button{width:100%;height:48px;border:0;border-radius:12px;background:#e93d8d;color:#fff;font:inherit;font-weight:700;cursor:pointer}
.ed-login .err{color:#d8305f;font-size:13px;min-height:18px;margin:6px 0 0}
.ed-toast{position:fixed;left:50%;bottom:80px;transform:translateX(-50%);z-index:100001;background:#1f1b33;color:#fff;padding:11px 20px;border-radius:999px;font:600 14px 'Nunito',sans-serif;opacity:0;transition:opacity .25s;pointer-events:none;max-width:90vw;text-align:center}
.ed-toast.on{opacity:1}
/* всё кликабельно в режиме правки */
body.ed-on [data-edimg]{pointer-events:auto!important;position:relative;z-index:5}
body.ed-on [data-edflag]{pointer-events:auto!important;cursor:pointer;outline:2px dashed rgba(94,83,145,.6);outline-offset:3px;border-radius:4px;position:relative;z-index:5}
body.ed-on [data-edflag]:hover{outline-color:#5e5391}
body.ed-on [data-modal],body.ed-on a[href]{position:relative}
.ed-mbtn{all:unset;display:inline-flex;align-items:center;gap:4px;margin:0 0 0 6px;padding:5px 10px;border-radius:999px;background:#5e5391;color:#fff;font:700 12px/1 'Nunito','Segoe UI',sans-serif;cursor:pointer;vertical-align:middle;box-shadow:0 3px 10px rgba(0,0,0,.18)}
.ed-mbtn:hover{background:#e93d8d}
body.ed-on .modal-variants{display:block!important;margin-top:18px;border-top:1px dashed #d8d4e8;padding-top:14px}
body.ed-on .modal-variants-head{font:700 13px 'Nunito',sans-serif;color:#8a86a0;margin:0 0 10px;text-transform:uppercase;letter-spacing:.03em}
body.ed-on .modal-variants [data-variant]{margin:0 0 12px;padding-left:12px;border-left:3px solid #e9d8f0}
body.ed-on .modal-variants [data-variant] b{display:block;font-size:16px;color:#2e2e35}
body.ed-on .modal-variants [data-variant] span{display:block;font-size:13px;color:#7a7790;margin-top:3px}
body.ed-on .modal[open]{z-index:100000}`;
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
      const w = document.createElement('div'); w.className = 'ed-login';
      w.innerHTML = `<form><h3>Режим редактирования</h3><p>Введите пароль администратора</p>
        <input type="password" autocomplete="current-password" placeholder="Пароль">
        <p class="err"></p><button type="submit">Войти</button></form>`;
      document.body.appendChild(w);
      const f = w.querySelector('form'), inp = w.querySelector('input'), err = w.querySelector('.err');
      f.addEventListener('submit', async e => {
        e.preventDefault(); err.textContent = '';
        try {
          const r = await fetch(`${API}/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: inp.value }) });
          const j = await r.json();
          if (!r.ok) { err.textContent = j.error || 'Ошибка'; return; }
          localStorage.setItem(TOKEN_KEY, j.token); w.remove(); resolve(true);
        } catch { err.textContent = 'Сервер недоступен'; }
      });
      w.addEventListener('click', e => { if (e.target === w) { w.remove(); resolve(false); } });
      setTimeout(() => inp.focus(), 50);
    });
  }
  function fileToDataURL(file, max = 1600) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * s); c.height = Math.round(img.height * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(img.src);
        resolve(c.toDataURL(/png/i.test(file.type) ? 'image/png' : 'image/webp', 0.86));
      };
      img.onerror = reject; img.src = URL.createObjectURL(file);
    });
  }

  function startEditing() {
    document.body.classList.add('ed-on');
    const dirty = new Map(); let orderDirty = false;
    const bar = document.createElement('div'); bar.className = 'ed-bar';
    bar.innerHTML = `<span class="ed-dot"></span><b>Правка страницы</b>
      <small>текст · фото · флаги · окна · порядок блоков</small>
      <span class="ed-sp"><small class="ed-cnt">0 изм.</small>
      <a class="btn" href="admin/">Панель</a>
      <button type="button" class="ed-reset">Сбросить всё</button>
      <button type="button" class="ed-exit">Выйти</button>
      <button type="button" class="primary ed-save" disabled>Сохранить</button></span>`;
    document.body.appendChild(bar);
    const save = bar.querySelector('.ed-save'), counter = bar.querySelector('.ed-cnt');
    const bump = () => { const n = dirty.size + (orderDirty ? 1 : 0); save.disabled = !n; counter.textContent = `${n} изм.`; };

    nodes = collect();
    nodes.forEach(el => {
      const k = keyOf(el);
      el.dataset.ed = k; el.setAttribute('contenteditable', 'true'); el.setAttribute('spellcheck', 'true'); el._orig = el.innerHTML;
      el.addEventListener('input', () => { dirty.set(k, el.innerHTML); el.classList.add('ed-dirty'); bump(); });
      el.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el.blur(); }
        if (e.key === 'Escape') { el.innerHTML = el._orig; dirty.delete(k); el.classList.remove('ed-dirty'); el.blur(); bump(); }
      });
      if (el.tagName === 'A' || el.tagName === 'BUTTON') el.addEventListener('click', e => e.preventDefault());
    });

    const picker = document.createElement('input');
    picker.type = 'file'; picker.accept = 'image/*'; picker.className = 'ed-picker'; picker.style.display = 'none';
    document.body.appendChild(picker);
    let target = null, targetKind = 'img';
    const bindImg = img => {
      if (img.closest(SKIP)) return;
      img.dataset.edimg = keyOf(img);
      img.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); target = img; targetKind = 'img'; picker.value = ''; picker.click(); });
    };
    document.querySelectorAll('img').forEach(bindImg);
    // флаги стран (инлайн-SVG) — тоже заменяемы картинкой
    const bindFlag = el => {
      el.dataset.edflag = keyOf(el.parentElement);
      el.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); target = el; targetKind = 'flag'; picker.value = ''; picker.click(); });
    };
    document.querySelectorAll('.implant-country > svg, .implant-country > img.ed-flag-img').forEach(bindFlag);
    picker.addEventListener('change', async () => {
      const f = picker.files[0]; if (!f || !target) return;
      toast('Загружаю фото…');
      try {
        const data = await fileToDataURL(f);
        // грузим файлом на сервер, чтобы не раздувать правки; если не вышло — храним как data URL
        let src = data;
        try {
          const r = await fetch(`${API}/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify({ data }) });
          if (r.ok) { const j = await r.json(); if (j.path) src = j.path; }
        } catch {}
        if (targetKind === 'flag') {
          const key = target.dataset.edflag;
          const img = flagImg(src); img.dataset.edflag = key; img.classList.add('ed-dirty');
          img.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); target = img; targetKind = 'flag'; picker.value = ''; picker.click(); });
          target.replaceWith(img); target = img;
          dirty.set('flag:' + key, src); bump(); toast('Флаг заменён, не забудьте сохранить');
        } else {
          target.src = src; target.removeAttribute('srcset'); target.classList.add('ed-dirty');
          dirty.set('img:' + target.dataset.edimg, src); bump(); toast('Фото заменено, не забудьте сохранить');
        }
      } catch { toast('Не удалось обработать фото'); }
    });

    /* блокируем действия сайта в режиме правки: клики по кнопкам/ссылкам/квизу
       не открывают модалку и не уводят со страницы — редактируем их текст */
    const KEEP = '.ed-bar,.ed-reorder,.ed-login,.ed-toast,.ed-mbtn,.modal-close,[data-edimg],[data-edflag]';
    document.addEventListener('click', e => {
      if (e.target.closest(KEEP)) return;
      const t = e.target.closest('a[href],button,label,summary,[data-modal],[role=tab],[role=button]');
      if (t) { e.preventDefault(); e.stopPropagation(); }
    }, true);

    /* у каждой кнопки, открывающей окно заявки, — кнопка «✎ окно» для правки окна */
    const dlg = document.getElementById('lead');
    const openModalForEdit = () => {
      if (!dlg) return;
      try { dlg.showModal(); } catch { dlg.setAttribute('open', ''); }
      toast('Правьте текст окна, закройте крестиком и нажмите «Сохранить»');
    };
    if (dlg) document.querySelectorAll('[data-modal]').forEach(btn => {
      if (btn.closest(SKIP)) return;
      const chip = document.createElement('button');
      chip.type = 'button'; chip.className = 'ed-mbtn'; chip.dataset.noedit = '';
      chip.textContent = '✎ окно';
      chip.addEventListener('click', e => { e.preventDefault(); e.stopPropagation(); openModalForEdit(); });
      btn.insertAdjacentElement('afterend', chip);
    });

    const main = document.querySelector('main');
    const reorderables = () => [...main.querySelectorAll(':scope > section[id]')];
    reorderables().forEach(sec => {
      const c = document.createElement('div'); c.className = 'ed-reorder'; c.dataset.noedit = '';
      c.innerHTML = `<button type="button" title="Выше">↑</button><button type="button" title="Ниже">↓</button>`;
      const [up, down] = c.querySelectorAll('button');
      const move = dir => {
        const list = reorderables(), i = list.indexOf(sec), j = i + dir;
        if (j < 0 || j >= list.length) return;
        if (dir < 0) list[j].before(sec); else list[j].after(sec);
        orderDirty = true; bump(); sec.scrollIntoView({ block: 'center', behavior: 'smooth' });
      };
      up.addEventListener('click', e => { e.stopPropagation(); move(-1); });
      down.addEventListener('click', e => { e.stopPropagation(); move(1); });
      sec.appendChild(c);
    });

    save.addEventListener('click', async () => {
      const payload = Object.fromEntries(dirty);
      if (orderDirty) payload['order:main'] = JSON.stringify(reorderables().map(s => s.id));
      if (!Object.keys(payload).length) return;
      save.disabled = true; save.textContent = 'Сохраняю…';
      try {
        const r = await fetch(`${API}/content`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify({ page: PAGE, data: payload }) });
        if (r.status === 401) { localStorage.removeItem(TOKEN_KEY); location.reload(); return; }
        if (!r.ok) throw 0;
        let c = {}; try { c = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch {}
        Object.assign(c, payload); try { localStorage.setItem(CACHE_KEY, JSON.stringify(c)); } catch {}
        document.querySelectorAll('.ed-dirty').forEach(e => { e.classList.remove('ed-dirty'); if ('ed' in e.dataset) e._orig = e.innerHTML; });
        dirty.clear(); orderDirty = false; counter.textContent = 'сохранено'; save.disabled = true;
        toast('Сохранено, правки видны всем');
      } catch { toast('Не удалось сохранить'); save.disabled = false; }
      save.textContent = 'Сохранить';
    });
    bar.querySelector('.ed-exit').addEventListener('click', () => {
      if ((dirty.size + (orderDirty ? 1 : 0)) && !confirm('Есть несохранённые правки. Выйти?')) return;
      location.href = location.pathname;
    });
    bar.querySelector('.ed-reset').addEventListener('click', async () => {
      if (!confirm('Удалить все правки этой страницы и вернуть исходный вид?')) return;
      await fetch(`${API}/reset`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token() }, body: JSON.stringify({ page: PAGE }) });
      try { localStorage.removeItem(CACHE_KEY); } catch {}
      location.reload();
    });
    addEventListener('beforeunload', e => { if (dirty.size + (orderDirty ? 1 : 0)) { e.preventDefault(); e.returnValue = ''; } });
  }

  (async () => {
    await refresh();
    if (!wantAdmin()) return;
    style();
    if (!token() && !(await login())) return;
    startEditing();
  })();
})();
