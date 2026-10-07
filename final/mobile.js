/* final · мобильная версия в концепте приложения.
   Сторис, таб-бар, экраны-шторки (результаты, врачи, маршрут, меню), шторка «до/после»,
   точки под лентами, форма с учётом клавиатуры, кнопка «назад» закрывает верхний слой.
   Вставляет только элементы <nav>, поэтому не сдвигает пути блоков, по которым
   редактор хранит правки текстов. Содержимое шторок клонируется из страницы. */
(() => {
  const mq = matchMedia('(max-width:760px)');
  const html = document.documentElement;
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = '../assets/';
  const nav = (cls, inner) => { const n = document.createElement('nav'); n.className = cls; n.dataset.noedit = ''; if (inner != null) n.innerHTML = inner; return n; };
  const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const ICO = {
    call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    cases: '<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M8.5 10.5a1.5 1.5 0 1 0 0-.01M20 15l-4.5-4.5L7 19"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    doc: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    pin: '<path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
    percent: '<circle cx="7" cy="7" r="2.5"/><circle cx="17" cy="17" r="2.5"/><path d="M19 5 5 19"/>',
    list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
    tooth: '<path d="M7 3.5c-2.6 0-4 2-4 4.5 0 3.6 2 6 2.5 10 .3 2.2 2.2 2.8 3 .8L10 14h4l1.5 4.8c.8 2 2.7 1.4 3-.8.5-4 2.5-6.4 2.5-10 0-2.5-1.4-4.5-4-4.5-2 0-3 1-5 1s-3-1-5-1z"/>',
    smile: '<path d="M4 6a8 8 0 0 0 16 0"/><circle cx="6" cy="3.5" r="1"/><circle cx="18" cy="3.5" r="1"/><path d="M4 18h16"/>',
    file: '<path d="M6 3h9l4 4v14H6V3Zm9 0v5h4M9 12h7m-7 4h7"/>',
    shield: '<path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z"/><path d="M9 12l2 2 4-4"/>',
    help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 1-1 1.7M12 17h.01"/>',
    arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>',
  };

  /* ---------- слои: один стек для шторок, сторис и формы; «назад» закрывает верхний ---------- */
  const layers = [];
  const pushLayer = close => { if (!mq.matches) return; layers.push(close); history.pushState({ m: layers.length }, ''); };
  const popLayer = close => {
    const i = layers.lastIndexOf(close); if (i < 0) return;
    layers.splice(i, 1);
    const m = (history.state && history.state.m) || 0;
    if (m > layers.length) history.back();
  };
  addEventListener('popstate', e => { const m = (e.state && e.state.m) || 0; while (layers.length > m) layers.pop()(); });
  const lock = on => html.classList.toggle('m-lock', on);
  const openLead = () => { const b = $('.header .btn[data-modal]') || $('[data-modal]'); if (b) b.click(); };

  /* ---------- клавиатура: высота и сдвиг видимой области ---------- */
  const vv = window.visualViewport;
  const applyVV = () => { if (!vv) return; html.style.setProperty('--vv-h', Math.round(vv.height) + 'px'); html.style.setProperty('--vv-top', Math.round(vv.offsetTop) + 'px'); };
  if (vv) { vv.addEventListener('resize', applyVV); vv.addEventListener('scroll', applyVV); applyVV(); }
  const isField = el => el && el.matches && el.matches('input:not([type=checkbox]):not([type=radio]):not([type=range]),textarea,select');
  document.addEventListener('focusin', e => { if (mq.matches && isField(e.target)) html.classList.add('kb-open'); });
  document.addEventListener('focusout', () => setTimeout(() => { if (!isField(document.activeElement)) html.classList.remove('kb-open'); }, 60));

  /* ---------- шапка: кнопка меню ---------- */
  const headerInner = $('.header-inner');
  const menuBtn = nav('m-menu', `<button type="button" aria-label="Меню">${svg(ICO.menu)}</button>`);
  if (headerInner) headerInner.append(menuBtn);

  /* ---------- первый экран: кнопка вместо формы ---------- */
  const heroGrid = $('.v1 .hero__grid');
  if (heroGrid) {
    const cta = nav('m-hero-cta', `<button type="button">Рассчитать стоимость <span>→</span></button><p>* План работ и финальная стоимость – в договоре</p>`);
    $('button', cta).addEventListener('click', openLead);
    heroGrid.append(cta);
  }

  /* ---------- сторис ---------- */
  const STORIES = [
    { id: 'promo', title: 'Акции', coverText: '0 ₽', slides: [
      { promo: ['99 ₽', '10 000 ₽', 'Удаление зубов при тотальной имплантации'] },
      { promo: ['0 ₽', '7 000 ₽', '3D КТ с ИИ-анализом Diagnocat'] },
      { promo: ['0 ₽', '2 000 ₽', 'Консультация имплантолога'] },
      { promo: ['0 %', '', 'Рассрочка от клиники без переплат до 36 месяцев'] },
    ] },
    { id: 'cases', title: 'До и после', cover: A + 'cases/shklyaeva-face-after.jpg', fit: true, slides: [
      { img: A + 'cases/shklyaeva-face-before.jpg', tag: 'До', cap: 'Пациентка Е. Ш.', sub: 'Полное отсутствие зубов на обеих челюстях' },
      { img: A + 'cases/shklyaeva-face-after.jpg', tag: 'После', cap: 'All-on-4 на обе челюсти', sub: 'Адаптационный протез – в день операции' },
      { img: A + 'land/vladimir-before.jpg', tag: 'До', cap: 'Владимир', sub: 'Носил съёмный протез' },
      { img: A + 'land/vladimir-after.jpg', tag: 'После', cap: 'All-on-4 на имплантах Snucon', sub: 'Несъёмный протез в день операции' },
      { img: A + 'land/vitaliy-before.jpg', tag: 'До', cap: 'Виталий', sub: 'Атрофия костной ткани' },
      { img: A + 'land/vitaliy-after.jpg', tag: 'После', cap: 'Nobel по 3D-шаблону', sub: 'Протез с армирующей балкой' },
    ] },
    { id: 'doctors', title: 'Врачи', cover: A + 'doctors/berlov.webp', fit: true, doctors: true, slides: [
      { img: A + 'doctors/berlov.webp', cap: 'Берлов Антон Владимирович', sub: 'Главный врач сети, д. м. н., профессор · стаж более 30 лет' },
      { img: A + 'doctors/kogon.webp', cap: 'Когон Борис Александрович', sub: 'Стоматолог-ортопед · стаж 17 лет' },
      { img: A + 'doctors/akchurin.webp', cap: 'Акчурин Руслан Дамирович', sub: 'Стоматолог-хирург · стаж 18 лет' },
      { img: A + 'doctors/ovsepyan.webp', cap: 'Овсепян Симон Левонович', sub: 'Стоматолог-ортопед · стаж 4 года' },
      { img: A + 'doctors/kalandarov.webp', cap: 'Каландаров Махмуд Маъмурович', sub: 'Стоматолог-хирург · стаж 16 лет' },
    ] },
    { id: 'clinic', title: 'Клиника', cover: A + 'stories/clinic-entrance.webp', slides: [
      { img: A + 'stories/clinic-entrance.webp', cap: 'Вход с улицы, 1 этаж', sub: 'Ленинградский проспект, 36, стр. 40' },
      { img: A + 'stories/clinic-ct.webp', cap: 'Диагностика на месте', sub: '3D КТ с ИИ-анализом – 0 ₽' },
      { img: A + 'stories/clinic-surgery.webp', cap: 'Операционная', sub: 'Имплантация и протез – в один визит' },
      { img: A + 'stories/clinic-consult.webp', cap: 'Консультация', sub: 'План и стоимость – до начала лечения' },
    ] },
    { id: 'route', title: 'Маршрут', cover: A + 'route/metro-dinamo.webp', slides: [
      { img: A + 'route/metro-dinamo.webp', tag: '1', cap: 'Метро «Динамо»', sub: 'Выход к Ленинградскому проспекту' },
      { img: A + 'route/vtb-arena.webp', tag: '2', cap: 'ВТБ Арена Парк', sub: 'Вдоль проспекта до строения 40' },
      { img: A + 'route/clinic-entrance.webp', tag: '3', cap: 'Вход с улицы, 1 этаж', sub: 'Две минуты пешком от метро' },
    ] },
  ];
  const SEEN_KEY = 'as_stories_seen';
  const seen = (() => { try { return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]')); } catch { return new Set(); } })();
  const markSeen = id => { seen.add(id); try { localStorage.setItem(SEEN_KEY, JSON.stringify([...seen])); } catch {} };

  const rail = nav('m-stories'); rail.setAttribute('aria-label', 'Сторис');
  STORIES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; if (seen.has(s.id)) b.classList.add('is-seen');
    b.innerHTML = `<span class="ring">${s.cover ? `<img src="${s.cover}" alt="" loading="lazy">` : `<b>${s.coverText}</b>`}</span>${s.title}`;
    b.addEventListener('click', () => openStory(i));
    rail.append(b);
  });
  const afterHero = $('.extraction-offer') || $('.network-ratings');
  if (afterHero) afterHero.before(rail);

  const viewer = nav('m-story', `<div class="m-story__media"></div><div class="m-story__bars"></div>
    <div class="m-story__head"><img alt=""><span></span><button class="m-story__close" type="button" aria-label="Закрыть">×</button></div>
    <div class="m-story__tap m-story__tap--prev"></div><div class="m-story__tap m-story__tap--next"></div>
    <div class="m-story__cap"></div><button class="m-story__cta" type="button">Рассчитать стоимость</button>`);
  viewer.setAttribute('aria-label', 'Просмотр сторис');
  document.body.append(viewer);

  let si = 0, sl = 0, t0 = 0, raf = 0, paused = false, elapsed = 0;
  const DUR = 5000;
  const media = $('.m-story__media', viewer), bars = $('.m-story__bars', viewer), cap = $('.m-story__cap', viewer);
  function show() {
    const s = STORIES[si], d = s.slides[sl];
    viewer.classList.toggle('m-story--fit', !!s.fit);
    viewer.classList.toggle('m-story--doctors', !!s.doctors);
    bars.innerHTML = s.slides.map((_, k) => `<i style="--p:${k < sl ? 100 : 0}%"></i>`).join('');
    $('.m-story__head img', viewer).src = s.cover || A + 'brand/logo.svg';
    $('.m-story__head span', viewer).textContent = s.title;
    media.innerHTML = d.promo
      ? `<div class="m-story__promo"><b>${d.promo[0]}</b>${d.promo[1] ? `<s>вместо ${d.promo[1]}</s>` : ''}<p>${d.promo[2]}</p></div>`
      : `<img src="${d.img}" alt="">`;
    cap.innerHTML = d.promo ? '' : `${d.tag ? `<span class="m-story__tag">${d.tag}</span><br>` : ''}${d.cap}<small>${d.sub || ''}</small>`;
    elapsed = 0; t0 = performance.now();
    const next = s.slides[sl + 1]; if (next && next.img) new Image().src = next.img;
  }
  function tick(now) {
    if (!paused) elapsed = now - t0;
    const bar = bars.children[sl];
    if (bar) bar.style.setProperty('--p', Math.min(100, elapsed / DUR * 100) + '%');
    if (elapsed >= DUR) step(1);
    raf = requestAnimationFrame(tick);
  }
  function step(dir) {
    const s = STORIES[si];
    sl += dir;
    if (sl >= s.slides.length) { markSeen(s.id); rail.children[si].classList.add('is-seen'); si++; sl = 0; if (si >= STORIES.length) return closeStory(); }
    if (sl < 0) { if (si === 0) sl = 0; else { si--; sl = STORIES[si].slides.length - 1; } }
    show();
  }
  function openStory(i) {
    si = i; sl = 0; viewer.classList.add('is-open'); html.classList.add('story-open'); lock(true);
    show(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
    pushLayer(closeStory);
  }
  function closeStory() {
    if (!viewer.classList.contains('is-open')) return;
    markSeen(STORIES[Math.min(si, STORIES.length - 1)].id);
    $$('button', rail).forEach((b, k) => b.classList.toggle('is-seen', seen.has(STORIES[k].id)));
    viewer.classList.remove('is-open'); html.classList.remove('story-open'); lock(false); cancelAnimationFrame(raf);
    popLayer(closeStory);
  }
  $('.m-story__close', viewer).addEventListener('click', closeStory);
  $('.m-story__tap--prev', viewer).addEventListener('click', () => step(-1));
  $('.m-story__tap--next', viewer).addEventListener('click', () => step(1));
  $('.m-story__cta', viewer).addEventListener('click', () => { closeStory(); setTimeout(openLead, 80); });
  let y0 = null;
  viewer.addEventListener('pointerdown', e => { paused = true; y0 = e.clientY; t0 = performance.now() - elapsed; });
  viewer.addEventListener('pointerup', e => { paused = false; t0 = performance.now() - elapsed; if (y0 !== null && e.clientY - y0 > 90) closeStory(); y0 = null; });
  addEventListener('keydown', e => { if (!viewer.classList.contains('is-open')) return; if (e.key === 'Escape') closeStory(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });

  /* ---------- шторка «до/после» ---------- */
  function initCompare(pics) {
    if (!pics || pics.children.length < 2) return;
    let range = $('.m-compare', pics), line = $('.m-compare-line', pics);
    if (!range) {
      range = document.createElement('input');
      range.type = 'range'; range.min = 0; range.max = 100; range.value = 50; range.className = 'm-compare';
      range.setAttribute('aria-label', 'Сравнить до и после');
      line = document.createElement('span'); line.className = 'm-compare-line'; line.setAttribute('aria-hidden', 'true');
      pics.append(line, range);
    }
    range.addEventListener('input', () => pics.style.setProperty('--pos', range.value + '%'));
  }
  initCompare($('.results-story-pics'));

  /* ---------- экраны-шторки ---------- */
  const tabLinks = {};
  function makeSheet(id, title, build, withCta = true) {
    const el = nav('m-sheet', `<div class="m-sheet__backdrop"></div>
      <div class="m-sheet__panel" role="dialog" aria-modal="true" aria-label="${title}">
        <div class="m-sheet__head"><h2>${title}</h2><button type="button" class="m-sheet__close" aria-label="Закрыть">×</button></div>
        <div class="m-sheet__body"></div>
        ${withCta ? `<div class="m-sheet__foot"><button type="button">Рассчитать стоимость ${svg(ICO.arrow)}</button></div>` : ''}
      </div>`);
    el.dataset.sheet = id;
    document.body.append(el);
    const body = $('.m-sheet__body', el);
    let built = false;
    const close = () => {
      if (!el.classList.contains('is-open')) return;
      el.classList.remove('is-open'); html.classList.remove('sheet-open'); lock(false);
      if (tabLinks[id]) tabLinks[id].classList.remove('on');
      popLayer(close);
    };
    const open = () => {
      if (!built) { build(body); built = true; }
      el.classList.add('is-open'); html.classList.add('sheet-open'); lock(true); body.scrollTop = 0;
      if (tabLinks[id]) tabLinks[id].classList.add('on');
      pushLayer(close);
    };
    $('.m-sheet__close', el).addEventListener('click', close);
    $('.m-sheet__backdrop', el).addEventListener('click', close);
    const cta = $('.m-sheet__foot button', el);
    if (cta) cta.addEventListener('click', () => { close(); setTimeout(openLead, 80); });
    const head = $('.m-sheet__head', el);
    let sy = null;
    head.addEventListener('touchstart', e => { sy = e.touches[0].clientY; }, { passive: true });
    head.addEventListener('touchend', e => { if (sy !== null && e.changedTouches[0].clientY - sy > 60) close(); sy = null; });
    return { open, close, el };
  }
  const clone = sel => { const src = $(sel); if (!src) return null; const c = src.cloneNode(true); $$('[id]', c).forEach(e => e.removeAttribute('id')); $$('[aria-controls],[aria-labelledby]', c).forEach(e => { e.removeAttribute('aria-controls'); e.removeAttribute('aria-labelledby'); }); c.classList.remove('rv', 'is-in'); $$('.rv', c).forEach(e => e.classList.remove('rv', 'is-in')); $$('.m-dots', c).forEach(e => e.remove()); return c; };

  const sheets = {
    results: makeSheet('results', 'Результаты лечения', body => {
      ['.results-featured-patient', '.results-sub-h', '.results-works', '.treatment-results>.results-wrap>.results-small'].forEach(s => { const c = clone(s); if (c) body.append(c); });
      initCompare($('.results-story-pics', body));
    }),
    doctors: makeSheet('doctors', 'Врачи', body => {
      ['.closing-chief', '.closing-docs'].forEach(s => { const c = clone(s); if (c) body.append(c); });
    }),
    route: makeSheet('route', 'Как добраться', body => {
      ['.closing-tabs', '.closing-route-panels', '.closing-route-addr', '.closing-map'].forEach(s => { const c = clone(s); if (c) body.append(c); });
      const tabs = $$('.closing-tabs [data-route]', body), panels = $$('.closing-route-steps', body);
      tabs.forEach(t => t.addEventListener('click', () => {
        tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
        panels.forEach(p => { p.hidden = p.dataset.route !== t.dataset.route; });
      }));
    }),
    menu: makeSheet('menu', 'Меню', body => {
      const items = [
        ['cases', 'Результаты лечения', ICO.smile], ['reviews', 'Отзывы пациентов', ICO.smile], ['finance', 'Рассрочка и кредит', ICO.percent], ['quiz', 'Подбор за минуту', ICO.list],
        ['implant-brands', 'Импланты и цены', ICO.tooth], ['smile-aesthetic', 'Эстетика улыбки', ICO.smile], ['second-opinion', 'Второе мнение – скидка 15%', ICO.file],
        ['care-support', 'Сопровождение и гарантии', ICO.shield], ['closing-team', 'Врачи', ICO.doc], ['closing-faq', 'Вопросы и ответы', ICO.help], ['closing-route', 'Как добраться', ICO.pin],
      ].filter(([id]) => document.getElementById(id));
      const list = document.createElement('ul'); list.className = 'm-menu-list';
      list.innerHTML = items.map(([id, t, i]) => `<li><a href="#${id}">${svg(i)}${t}</a></li>`).join('');
      $$('a', list).forEach(a => a.addEventListener('click', e => {
        e.preventDefault(); const target = document.getElementById(a.getAttribute('href').slice(1));
        sheets.menu.close(); setTimeout(() => target && target.scrollIntoView({ block: 'start' }), 60);
      }));
      const contacts = nav('m-menu-contacts', `<a href="tel:+74950650077">+7 (495) 065-00-77</a><span><b>Ежедневно</b> с 9:00 до 21:00</span><span>Москва, Ленинградский проспект, д. 36, стр. 40 · 2 минуты от метро «Динамо»</span><span><a class="m-menu-policy" href="policy/">Политика обработки персональных данных</a></span>`);
      body.append(list, contacts);
    }),
  };
  $('button', menuBtn).addEventListener('click', sheets.menu.open);

  /* ---------- таб-бар ---------- */
  const tab = nav('m-tabbar', `
    <a href="tel:+74950650077">${svg(ICO.call)}Звонок</a>
    <button type="button" data-sheet="results">${svg(ICO.cases)}Результаты</button>
    <button type="button" class="m-tab-cta"><span>${svg(ICO.plus)}</span>Расчёт</button>
    <button type="button" data-sheet="doctors">${svg(ICO.doc)}Врачи</button>
    <button type="button" data-sheet="route">${svg(ICO.pin)}Маршрут</button>`);
  tab.setAttribute('aria-label', 'Быстрые действия');
  document.body.append(tab);
  $('.m-tab-cta', tab).addEventListener('click', openLead);
  $$('[data-sheet]', tab).forEach(b => { tabLinks[b.dataset.sheet] = b; b.addEventListener('click', () => sheets[b.dataset.sheet].open()); });

  /* ---------- форма: слой для кнопки «назад», свайп вниз закрывает ---------- */
  const dlg = $('#lead');
  if (dlg) {
    const closeLead = () => { if (dlg.open) dlg.close(); };
    new MutationObserver(() => {
      html.classList.toggle('sheet-open', dlg.open);
      if (dlg.open) pushLayer(closeLead);
    }).observe(dlg, { attributes: true, attributeFilter: ['open'] });
    dlg.addEventListener('close', () => { html.classList.remove('kb-open'); popLayer(closeLead); });
    let sy = null;
    dlg.addEventListener('touchstart', e => { if (mq.matches && !html.classList.contains('kb-open') && !isField(e.target) && $('.modal-body', dlg).scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true });
    dlg.addEventListener('touchmove', e => { if (sy === null) return; const d = e.touches[0].clientY - sy; if (d > 0) dlg.style.transform = `translateY(${d}px)`; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (sy === null) return; const d = e.changedTouches[0].clientY - sy; sy = null;
      dlg.style.transform = d > 110 ? 'translateY(100%)' : '';
      setTimeout(() => { if (d > 110) dlg.close(); dlg.style.transform = ''; }, 200);
    });
  }

  /* ---------- точки под лентами ---------- */
  const RAILS = '.network-ratings-grid,.results-works,.care-pair,.payment-benefits,.solution-cards,.implant-brands-grid,.opinion-stages,.care-support-steps,.closing-docs';
  $$(RAILS).forEach(r => {
    if (r.closest('.m-sheet')) return;
    const n = r.children.length; if (n < 2) return;
    const dots = nav('m-dots', '<i></i>'.repeat(n)); dots.setAttribute('aria-hidden', 'true'); r.after(dots);
    const upd = () => {
      const w = r.firstElementChild.getBoundingClientRect().width + 12;
      const k = Math.min(n - 1, Math.round(r.scrollLeft / w));
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === k));
    };
    r.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); upd();
  });
})();
