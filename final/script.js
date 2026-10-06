/* variant2-full · интерактив */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* появление секций при прокрутке */
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const seen = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-seen'); seen.unobserve(e.target); }
    }), { rootMargin: '0px 0px -12% 0px' });
    $$('.section, .promo').forEach(el => seen.observe(el));
    setTimeout(() => $$('.section, .promo').forEach(el => el.classList.add('is-seen')), 2500);
  } else {
    $$('.section, .promo').forEach(el => el.classList.add('is-seen'));
  }

  /* появление блоков */
  const reveal = $$('.reveal');
  const check = () => reveal.forEach(el => { if (el.getBoundingClientRect().top < innerHeight * .95) el.classList.add('is-in'); });
  addEventListener('scroll', check, { passive: true }); addEventListener('load', check); check();
  setTimeout(check, 400);

  /* маска телефона */
  const mask = v => {
    let d = v.replace(/\D/g, '');
    if (d.startsWith('8')) d = '7' + d.slice(1);
    if (!d.startsWith('7')) d = '7' + d;
    d = d.slice(0, 11);
    let o = '+7';
    if (d.length > 1) o += ' (' + d.slice(1, 4);
    if (d.length >= 4) o += ') ' + d.slice(4, 7);
    if (d.length >= 7) o += '-' + d.slice(7, 9);
    if (d.length >= 9) o += '-' + d.slice(9, 11);
    return o;
  };
  $$('input[type=tel]').forEach(i => {
    i.addEventListener('input', () => { i.value = i.value.replace(/\D/g, '') ? mask(i.value) : ''; });
    i.addEventListener('focus', () => { if (!i.value) i.value = '+7 '; });
  });

  /* отправка форм (демо) */
  $$('form[data-lead]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const t = $('input[type=tel]', f);
    const msg = $('.form-message', f);
    if (t.value.replace(/\D/g, '').length !== 11) { t.focus(); msg.textContent = 'Проверьте номер телефона'; return; }
    console.log('lead', f.dataset.lead, Object.fromEntries(new FormData(f).entries())); // TODO: отправка в CRM
    f.classList.add('is-sent');
    msg.textContent = 'Спасибо! Администратор свяжется с вами в ближайшее время.';
  }));

  /* модальное окно */
  const dlg = $('#lead');
  $$('[data-modal]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault(); dlg.showModal(); setTimeout(() => $('input[type=tel]', dlg).focus(), 60);
  }));
  $('.modal-close', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => {
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });

  /* калькулятор рассрочки */
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

  /* квиз */
  const qf = $('#quizForm');
  if (qf) {
    const steps = $$('.qstep', qf), prev = $('#quizPrev'), next = $('#quizNext'), submit = $('#quizSubmit');
    const segs = $$('.quiz-progress i'), num = $('#quizStepNum');
    let s = 1;
    const show = () => {
      steps.forEach(st => st.classList.toggle('is-on', +st.dataset.step === s));
      prev.hidden = s === 1; next.hidden = s === 5; submit.hidden = s !== 5;
      segs.forEach((seg, i) => seg.style.background = i < Math.min(s, 4) ? 'var(--accent)' : '');
      num.textContent = Math.min(s, 4);
      next.disabled = !$(`.qstep[data-step="${s}"] input:checked`);
    };
    qf.addEventListener('change', () => { next.disabled = !$(`.qstep[data-step="${s}"] input:checked`); });
    next.addEventListener('click', () => { s++; show(); });
    prev.addEventListener('click', () => { s--; show(); });
    show();
  }

  /* шкала оттенков: выноска с описанием при наведении и выборе */
  const shade = $('#shade');
  if (shade) {
    const photo = $('#shadePhoto'), row = $('.shade-row', shade);
    const tip = document.createElement('div');
    tip.className = 'shade-tip';
    tip.innerHTML = '<b></b><span></span>';
    row.parentNode.insertBefore(tip, row);
    const tipName = $('b', tip), tipText = $('span', tip);

    const paint = b => {
      photo.style.setProperty('--c', b.dataset.t);
      photo.style.setProperty('--bl', b.dataset.bl ? '.55' : '0');
    };
    const point = b => {
      tipName.textContent = b.dataset.n;
      tipText.textContent = b.dataset.d;
      const r = b.getBoundingClientRect(), rr = tip.getBoundingClientRect();
      tip.style.setProperty('--x', (r.left - rr.left + r.width / 2) + 'px');
      tip.classList.add('is-on');
    };
    const chosen = () => $('.shade-row button[aria-checked="true"]', shade);

    $$('.shade-row button', shade).forEach(b => {
      b.addEventListener('pointerenter', () => { paint(b); point(b); });
      b.addEventListener('focus', () => { paint(b); point(b); });
      b.addEventListener('click', () => {
        $$('.shade-row button', shade).forEach(x => x.setAttribute('aria-checked', x === b));
        paint(b); point(b);
      });
    });
    row.addEventListener('pointerleave', () => { const c = chosen(); if (c) { paint(c); point(c); } });
    const start = chosen(); if (start) { paint(start); requestAnimationFrame(() => point(start)); }
    addEventListener('resize', () => { const c = chosen(); if (c) point(c); });
  }

  /* загрузка плана лечения */
  const drop = $('#drop');
  if (drop) {
    const inp = $('input', drop), label = $('span', drop);
    const set = fl => { if (fl.length) { drop.classList.add('has-file'); label.textContent = fl.length === 1 ? fl[0].name : `Файлов: ${fl.length}`; } };
    inp.addEventListener('change', () => set(inp.files));
    ['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('is-over'); }));
    ['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('is-over'); }));
    drop.addEventListener('drop', e => { inp.files = e.dataTransfer.files; set(inp.files); });
  }

  /* параллакс объекта на первом экране */
  const obj = $('#heroObj');
  if (obj && matchMedia('(pointer:fine)').matches && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    let tx = 0, ty = 0, cx = 0, cy = 0;
    const host = $('.v1 .hero');
    if (host) {
      host.addEventListener('mousemove', e => {
        const r = host.getBoundingClientRect();
        tx = ((e.clientX - r.left) / r.width - .5) * 2;
        ty = ((e.clientY - r.top) / r.height - .5) * 2;
      });
      (function tick() {
        if (innerWidth > 860) {
          cx += (tx - cx) * .06; cy += (ty - cy) * .06;
          obj.style.perspective = '900px';
          obj.style.transform = `translate(-50%,-52%) rotateY(${cx * 7}deg) rotateX(${-cy * 5}deg) translate(${cx * 10}px,${cy * 8}px)`;
        }
        requestAnimationFrame(tick);
      })();
    }
  }

  /* табы маршрута */
  $$('.tabs [data-route]').forEach(b => b.addEventListener('click', () => {
    $$('.tabs [data-route]').forEach(x => x.setAttribute('aria-selected', x === b));
    $$('.route-steps').forEach(p => p.classList.toggle('is-on', p.dataset.route === b.dataset.route));
  }));
})();
