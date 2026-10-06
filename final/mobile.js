/* final · мобильная версия: сторис, таб-бар, шторка «до/после», точки под лентами, свайп формы.
   Подключается после editor.js и вставляет только элементы <nav>, поэтому не сдвигает
   пути блоков, по которым редактор хранит правки текстов. */
(() => {
  const mq = matchMedia('(max-width:760px)');
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const A = '../assets/';
  const openLead = () => { const b = $('.header .btn[data-modal]') || $('[data-modal]'); if (b) b.click(); };

  /* ---------------- сторис ---------------- */
  const STORIES = [
    { id: 'promo', title: 'Акции', cover: null, coverText: '0 ₽', slides: [
      { promo: ['99 ₽', '10 000 ₽', 'Удаление зубов при тотальной имплантации'] },
      { promo: ['0 ₽', '7 000 ₽', '3D КТ с ИИ-анализом Diagnocat'] },
      { promo: ['0 ₽', '2 000 ₽', 'Консультация имплантолога'] },
      { promo: ['0 %', '', 'Рассрочка от клиники без переплат до 36 месяцев'] },
    ] },
    { id: 'cases', title: 'До и после', cover: A + 'cases/shklyaeva-face-after.jpg', slides: [
      { img: A + 'cases/shklyaeva-face-before.jpg', tag: 'До', cap: 'Пациентка Е. Ш.', sub: 'Полное отсутствие зубов на обеих челюстях' },
      { img: A + 'cases/shklyaeva-face-after.jpg', tag: 'После', cap: 'All-on-4 на обе челюсти', sub: 'Адаптационный протез — в день операции' },
      { img: A + 'land/vladimir-before.jpg', tag: 'До', cap: 'Владимир', sub: 'Носил съёмный протез' },
      { img: A + 'land/vladimir-after.jpg', tag: 'После', cap: 'All-on-4 на имплантах Snucon', sub: 'Несъёмный протез в день операции' },
      { img: A + 'land/vitaliy-before.jpg', tag: 'До', cap: 'Виталий', sub: 'Атрофия костной ткани' },
      { img: A + 'land/vitaliy-after.jpg', tag: 'После', cap: 'Nobel по 3D-шаблону', sub: 'Протез с армирующей балкой' },
    ] },
    { id: 'doctors', title: 'Врачи', cover: A + 'doctors/berlov.jpg', slides: [
      { img: A + 'doctors/berlov.jpg', cap: 'Берлов Антон Владимирович', sub: 'Главный врач сети, д. м. н., профессор · стаж более 30 лет' },
      { img: A + 'doctors/kogon.jpg', cap: 'Когон Борис Александрович', sub: 'Стоматолог-ортопед · стаж 17 лет' },
      { img: A + 'doctors/akchurin.jpg', cap: 'Акчурин Руслан Дамирович', sub: 'Стоматолог-хирург · стаж 18 лет' },
      { img: A + 'doctors/ovsepyan.jpg', cap: 'Овсепян Симон Левонович', sub: 'Стоматолог-ортопед · стаж 4 года' },
      { img: A + 'doctors/kalandarov.jpg', cap: 'Каландаров Махмуд Маъмурович', sub: 'Стоматолог-хирург · стаж 16 лет' },
    ] },
    { id: 'clinic', title: 'Клиника', cover: A + 'stories/clinic-entrance.webp', slides: [
      { img: A + 'stories/clinic-entrance.webp', cap: 'Вход с улицы, 1 этаж', sub: 'Ленинградский проспект, 36, стр. 40' },
      { img: A + 'stories/clinic-ct.webp', cap: 'Диагностика на месте', sub: '3D КТ с ИИ-анализом — 0 ₽' },
      { img: A + 'stories/clinic-surgery.webp', cap: 'Операционная', sub: 'Имплантация и протез — в один визит' },
      { img: A + 'stories/clinic-consult.webp', cap: 'Консультация', sub: 'План и стоимость — до начала лечения' },
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

  const rail = document.createElement('nav');
  rail.className = 'm-stories'; rail.setAttribute('aria-label', 'Сторис'); rail.dataset.noedit = '';
  STORIES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button'; if (seen.has(s.id)) b.classList.add('is-seen');
    b.innerHTML = `<span class="ring">${s.cover ? `<img src="${s.cover}" alt="" loading="lazy">` : `<b>${s.coverText}</b>`}</span>${s.title}`;
    b.addEventListener('click', () => openStory(i));
    rail.append(b);
  });
  const anchor = $('.network-ratings');
  if (anchor) anchor.before(rail);

  const viewer = document.createElement('nav');
  viewer.className = 'm-story'; viewer.setAttribute('aria-label', 'Просмотр сторис'); viewer.dataset.noedit = '';
  viewer.innerHTML = `<div class="m-story__media"></div><div class="m-story__bars"></div>
    <div class="m-story__head"><img alt=""><span></span><button class="m-story__close" type="button" aria-label="Закрыть">×</button></div>
    <div class="m-story__tap m-story__tap--prev"></div><div class="m-story__tap m-story__tap--next"></div>
    <div class="m-story__cap"></div><button class="m-story__cta" type="button">Рассчитать стоимость</button>`;
  document.body.append(viewer);

  let si = 0, sl = 0, t0 = 0, raf = 0, paused = false, elapsed = 0;
  const DUR = 5000;
  const media = $('.m-story__media', viewer), bars = $('.m-story__bars', viewer), cap = $('.m-story__cap', viewer);
  function show() {
    const s = STORIES[si], d = s.slides[sl];
    viewer.classList.toggle('m-story--fit', s.id === 'cases' || s.id === 'doctors');
    viewer.classList.toggle('m-story--doctors', s.id === 'doctors');
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
    si = i; sl = 0; viewer.classList.add('is-open'); document.documentElement.style.overflow = 'hidden';
    show(); cancelAnimationFrame(raf); raf = requestAnimationFrame(tick);
  }
  function closeStory() {
    markSeen(STORIES[Math.min(si, STORIES.length - 1)].id);
    $$('button', rail).forEach((b, k) => b.classList.toggle('is-seen', seen.has(STORIES[k].id)));
    viewer.classList.remove('is-open'); document.documentElement.style.overflow = ''; cancelAnimationFrame(raf);
  }
  $('.m-story__close', viewer).addEventListener('click', closeStory);
  $('.m-story__tap--prev', viewer).addEventListener('click', () => step(-1));
  $('.m-story__tap--next', viewer).addEventListener('click', () => step(1));
  $('.m-story__cta', viewer).addEventListener('click', () => { closeStory(); openLead(); });
  /* удержание — пауза, свайп вниз — закрыть */
  let y0 = null;
  viewer.addEventListener('pointerdown', e => { paused = true; y0 = e.clientY; t0 = performance.now() - elapsed; });
  viewer.addEventListener('pointerup', e => { paused = false; t0 = performance.now() - elapsed; if (y0 !== null && e.clientY - y0 > 90) closeStory(); y0 = null; });
  addEventListener('keydown', e => { if (!viewer.classList.contains('is-open')) return; if (e.key === 'Escape') closeStory(); if (e.key === 'ArrowRight') step(1); if (e.key === 'ArrowLeft') step(-1); });

  /* ---------------- таб-бар ---------------- */
  const ico = {
    call: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z"/>',
    cases: '<path d="M4 7a3 3 0 0 1 3-3h10a3 3 0 0 1 3 3v10a3 3 0 0 1-3 3H7a3 3 0 0 1-3-3z"/><path d="M8.5 10.5a1.5 1.5 0 1 0 0-.01M20 15l-4.5-4.5L7 19"/>',
    calc: '<path d="M12 5v14M5 12h14"/>',
    docs: '<circle cx="12" cy="8" r="4"/><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6"/>',
    route: '<path d="M12 21s-7-6-7-12a7 7 0 0 1 14 0c0 6-7 12-7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  };
  const svg = p => `<svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg>`;
  const tab = document.createElement('nav');
  tab.className = 'm-tabbar'; tab.setAttribute('aria-label', 'Быстрые действия'); tab.dataset.noedit = '';
  tab.innerHTML = `
    <a href="tel:+74950650077">${svg(ico.call)}Звонок</a>
    <a href="#cases" data-sec="cases">${svg(ico.cases)}Результаты</a>
    <button type="button" class="m-tab-cta"><span>${svg(ico.calc)}</span>Расчёт</button>
    <a href="#closing-team" data-sec="closing-team">${svg(ico.docs)}Врачи</a>
    <a href="#closing-route" data-sec="closing-route">${svg(ico.route)}Маршрут</a>`;
  document.body.append(tab);
  $('.m-tab-cta', tab).addEventListener('click', openLead);
  const tabs = $$('[data-sec]', tab);
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) tabs.forEach(t => t.classList.toggle('on', t.dataset.sec === e.target.id));
    }), { rootMargin: '-45% 0px -45% 0px' });
    $$('main section[id]').forEach(s => io.observe(s));
  }
  /* прячем таб-бар, пока открыта клавиатура или форма */
  document.addEventListener('focusin', e => { if (mq.matches && e.target.matches('input,textarea,select')) document.documentElement.classList.add('kb-open'); });
  document.addEventListener('focusout', () => document.documentElement.classList.remove('kb-open'));
  const dlg = $('#lead');
  if (dlg) {
    new MutationObserver(() => document.documentElement.classList.toggle('sheet-open', dlg.open)).observe(dlg, { attributes: true, attributeFilter: ['open'] });
    /* свайп вниз по шторке закрывает форму */
    let sy = null;
    dlg.addEventListener('touchstart', e => { if (mq.matches && dlg.scrollTop <= 0) sy = e.touches[0].clientY; }, { passive: true });
    dlg.addEventListener('touchmove', e => { if (sy === null) return; const d = e.touches[0].clientY - sy; if (d > 0) dlg.style.transform = `translateY(${d}px)`; }, { passive: true });
    dlg.addEventListener('touchend', e => {
      if (sy === null) return; const d = e.changedTouches[0].clientY - sy; sy = null;
      dlg.style.transition = 'transform .2s'; dlg.style.transform = d > 110 ? 'translateY(100%)' : '';
      setTimeout(() => { if (d > 110) dlg.close(); dlg.style.transition = dlg.style.transform = ''; }, 200);
    });
  }

  /* ---------------- шторка «до/после» ---------------- */
  const pics = $('.results-story-pics');
  if (pics && pics.children.length >= 2) {
    const range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = 100; range.value = 50; range.className = 'm-compare';
    range.setAttribute('aria-label', 'Сравнить до и после');
    const line = document.createElement('span'); line.className = 'm-compare-line'; line.setAttribute('aria-hidden', 'true');
    range.addEventListener('input', () => pics.style.setProperty('--pos', range.value + '%'));
    pics.append(line, range);
  }

  /* ---------------- точки под лентами ---------------- */
  const RAILS = '.network-ratings-grid,.results-works,.care-pair,.payment-benefits,.solution-cards,.implant-brands-grid,.opinion-stages,.care-support-steps,.closing-docs';
  $$(RAILS).forEach(r => {
    const n = r.children.length; if (n < 2) return;
    const dots = document.createElement('nav'); dots.className = 'm-dots'; dots.setAttribute('aria-hidden', 'true'); dots.dataset.noedit = '';
    dots.innerHTML = '<i></i>'.repeat(n); r.after(dots);
    const upd = () => {
      const w = r.firstElementChild.getBoundingClientRect().width + 12;
      const k = Math.min(n - 1, Math.round(r.scrollLeft / w));
      [...dots.children].forEach((d, j) => d.classList.toggle('on', j === k));
    };
    r.addEventListener('scroll', () => requestAnimationFrame(upd), { passive: true }); upd();
    const toggle = () => { dots.style.display = mq.matches ? '' : 'none'; };
    toggle(); mq.addEventListener('change', toggle);
  });
})();
