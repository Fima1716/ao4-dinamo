/* All Smiles · Динамо — интерактив */
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Кампании по конкурентам: ?plan=top или utm с competitor|konkur
     поднимают блок «Пришлите план» под первый экран */
  const q = new URLSearchParams(location.search);
  const utm = ((q.get('utm_campaign') || '') + ' ' + (q.get('utm_content') || '')).toLowerCase();
  if (q.get('plan') === 'top' || /competitor|konkur|конкур/.test(utm)) {
    const plan = $('#plan'), hero = $('#hero');
    if (plan && hero) hero.insertAdjacentElement('afterend', plan);
  }

  /* Шапка */
  const top = $('#top');
  const onScroll = () => top.classList.toggle('is-stuck', scrollY > 24);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const burger = $('.burger');
  burger.addEventListener('click', () => {
    const open = top.classList.toggle('is-open');
    burger.setAttribute('aria-expanded', open);
  });
  $$('.top__right a').forEach(a => a.addEventListener('click', () => { top.classList.remove('is-open'); burger.setAttribute('aria-expanded', 'false'); }));

  /* Появление при скролле */
  const revealEls = $$('.sec, .reveal');
  const check = () => revealEls.forEach(el => {
    if (!el.classList.contains('is-in') && el.getBoundingClientRect().top < innerHeight * .92) el.classList.add('is-in');
  });
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(el => io.observe(el));
  }
  addEventListener('scroll', check, { passive: true });
  addEventListener('resize', check);
  addEventListener('load', check);
  check();
  setTimeout(() => revealEls.forEach(el => el.classList.add('is-in')), 4000); // страховка
  requestAnimationFrame(() => $$('.hero .reveal').forEach((el, i) => setTimeout(() => el.classList.add('is-in'), 120 + i * 110)));

  /* Параллакс объекта на первом экране */
  const obj = $('#heroObj');
  if (obj && !reduce && matchMedia('(pointer:fine)').matches) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    $('.hero').addEventListener('mousemove', e => {
      const r = e.currentTarget.getBoundingClientRect();
      tx = ((e.clientX - r.left) / r.width - .5) * 2;
      ty = ((e.clientY - r.top) / r.height - .5) * 2;
    });
    (function tick() {
      if (innerWidth <= 860) { obj.style.transform = ''; requestAnimationFrame(tick); return; }
      cx += (tx - cx) * .06; cy += (ty - cy) * .06;
      obj.style.transform = `translate(-50%,-52%) rotateY(${cx * 7}deg) rotateX(${-cy * 5}deg) translate(${cx * 10}px,${cy * 8}px)`;
      obj.style.perspective = '900px';
      requestAnimationFrame(tick);
    })();
  }

  /* Маска телефона */
  const mask = v => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    let out = '+7';
    if (d.length > 1) out += ' (' + d.slice(1, 4);
    if (d.length >= 4) out += ') ' + d.slice(4, 7);
    if (d.length >= 7) out += '-' + d.slice(7, 9);
    if (d.length >= 9) out += '-' + d.slice(9, 11);
    return out;
  };
  $$('input[type=tel]').forEach(i => {
    i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '') ? mask(i.value) : ''; });
    i.addEventListener('focus', () => { if (!i.value) i.value = '+7 '; });
    i.addEventListener('blur', () => { if (i.value.replace(/\D/g, '').length < 2) i.value = ''; });
  });

  /* Отправка форм (демо) */
  $$('form[data-lead]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const tel = $('input[type=tel]', f);
    if (tel.value.replace(/\D/g, '').length !== 11) { tel.focus(); $('.lead__msg', f).textContent = 'Проверьте номер телефона'; return; }
    const data = Object.fromEntries(new FormData(f).entries());
    console.log('lead', f.dataset.lead, data); // TODO: отправка в CRM
    f.classList.add('is-sent');
    $('.lead__msg', f).textContent = 'Спасибо! Администратор свяжется с вами в ближайшее время.';
  }));

  /* До / после */
  const ba = $('#ba');
  if (ba) {
    const range = $('.ba__range', ba), before = $('.ba__before', ba), after = $('.ba__after', ba);
    const set = v => { ba.style.setProperty('--x', v + '%'); ba.style.setProperty('--xr', v / 100); };
    range.addEventListener('input', () => set(+range.value));
    set(50);
    let patient = 'shklyaeva', view = 'face';
    const load = () => {
      const wide = view !== 'face';
      ba.dataset.ratio = wide ? 'wide' : '';
      const base = window.ASSETS || 'assets/';
      before.src = `${base}cases/${patient}-${view}-before.jpg`;
      after.src = `${base}cases/${patient}-${view}-after.jpg`;
      range.value = 50; set(50);
    };
    $$('.case-tabs [data-case]').forEach(b => b.addEventListener('click', () => {
      $$('.case-tabs [data-case]').forEach(x => x.setAttribute('aria-selected', x === b));
      patient = b.dataset.case;
      $$('.case__item').forEach(i => i.classList.toggle('is-on', i.dataset.case === patient));
      load();
    }));
    $$('.case__views [data-view]').forEach(b => b.addEventListener('click', () => {
      $$('.case__views [data-view]').forEach(x => x.classList.toggle('is-on', x === b));
      view = b.dataset.view; load();
    }));
  }

  /* Калькулятор */
  const sum = $('#calcSum'), mon = $('#calcMon');
  if (sum) {
    const fmt = n => n.toLocaleString('ru-RU') + ' ₽';
    const paint = i => i.style.setProperty('--v', ((i.value - i.min) / (i.max - i.min) * 100) + '%');
    const calc = () => {
      $('#calcSumOut').value = fmt(+sum.value);
      $('#calcMonOut').value = mon.value + ' мес.';
      $('#calcRes').textContent = fmt(Math.round(sum.value / mon.value / 10) * 10);
      paint(sum); paint(mon);
    };
    [sum, mon].forEach(i => i.addEventListener('input', calc)); calc();
  }

  /* Квиз */
  const qf = $('#quizForm');
  if (qf) {
    const steps = $$('.qstep', qf), prev = $('#quizPrev'), next = $('#quizNext'), submit = $('#quizSubmit');
    const bar = $('.quiz__progress i'), num = $('#quizStepNum');
    let s = 1;
    const show = () => {
      steps.forEach(st => st.classList.toggle('is-on', +st.dataset.step === s));
      prev.hidden = s === 1; next.hidden = s === 5; submit.hidden = s !== 5;
      bar.style.setProperty('--p', Math.min((s - 1) / 4, 1)); num.textContent = Math.min(s, 4);
      next.disabled = !$(`.qstep[data-step="${s}"] input:checked`);
    };
    qf.addEventListener('change', () => { next.disabled = !$(`.qstep[data-step="${s}"] input:checked`); });
    next.addEventListener('click', () => { s++; show(); });
    prev.addEventListener('click', () => { s--; show(); });
    show();
  }

  /* Шкала оттенков */
  const shade = $('#shade');
  if (shade) {
    const photo = $('#shadePhoto'), name = $('#shadeName'), desc = $('#shadeDesc');
    $$('.shade__row button', shade).forEach(b => b.addEventListener('click', () => {
      $$('.shade__row button', shade).forEach(x => x.setAttribute('aria-checked', x === b));
      photo.style.setProperty('--c', b.dataset.t);
      photo.style.setProperty('--bl', b.dataset.bl ? '.55' : '0');
      name.textContent = b.dataset.n; desc.textContent = b.dataset.d;
    }));
  }

  /* Загрузка плана */
  const drop = $('#drop');
  if (drop) {
    const inp = $('input', drop), label = $('span', drop);
    const setFiles = fl => { if (fl.length) { drop.classList.add('has-file'); label.textContent = fl.length === 1 ? fl[0].name : `Файлов: ${fl.length}`; } };
    inp.addEventListener('change', () => setFiles(inp.files));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => { inp.files = e.dataTransfer.files; setFiles(inp.files); });
  }

  /* Табы маршрута */
  $$('.tabs [data-route]').forEach(b => b.addEventListener('click', () => {
    $$('.tabs [data-route]').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('.route__steps').forEach(p => p.classList.toggle('is-on', p.dataset.route === b.dataset.route));
  }));

  /* Договор (PDF ещё не загружен) */
  $$('[data-contract]').forEach(a => a.addEventListener('click', e => {
    if (a.getAttribute('href') === '#') { e.preventDefault(); a.textContent = 'PDF договора добавим после согласования'; }
  }));
})();
