/* Интерактив главной страницы: формы, модалка, калькулятор, квиз, оттенки, маршрут */
(() => {
  const $ = (s, r = document) => r.querySelector(s), $$ = (s, r = document) => [...r.querySelectorAll(s)];

  /* появление блоков первого экрана */
  const reveal = $$('.reveal');
  const check = () => reveal.forEach(el => { if (el.getBoundingClientRect().top < innerHeight * .95) el.classList.add('is-in'); });
  addEventListener('scroll', check, { passive: true }); addEventListener('load', check); check();
  setTimeout(check, 400);

  /* появление секций при прокрутке: карточки выезжают по очереди */
  if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    const targets = $$([
      'main section h2', '.results-sub-h', '.payment-intro', '.solution-intro', '.implant-brands-intro',
      '.care-support-intro', '.closing-lead', '.extraction-panel', '.reviews-platforms>a', '.reviews-head', '.reviews-widget', '.results-story', '.results-work', '.care-item',
      '.care-sleep', '.care-association', '.payment-benefit', '.payment-calculator', '.solution-card', '.solution-alternatives',
      '.match-quiz-wrap', '.implant-brand-card', '.smile-aesthetic-hero', '.smile-shade-panel', '.opinion-stages>li', '.opinion-card',
      '.care-support-step', '.care-contract', '.closing-chief', '.closing-doc', '.closing-faq details', '.closing-route-steps li',
      '.closing-route-addr', '.closing-consult-card'
    ].join(','));
    const groups = new Map();
    targets.forEach(el => {
      const n = (groups.get(el.parentElement) || 0); groups.set(el.parentElement, n + 1);
      el.classList.add('rv'); el.style.setProperty('--d', Math.min(n, 7) * 80 + 'ms');
    });
    document.documentElement.classList.add('anim-on');
    const io = new IntersectionObserver(es => es.forEach(e => {
      if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); }
    }), { rootMargin: '0px 0px -8% 0px', threshold: 0.05 });
    targets.forEach(el => io.observe(el));
    setTimeout(() => targets.forEach(el => el.classList.add('is-in')), 4000); // страховка: показать всё, если наблюдатель не сработал
  }

  /* возврат на место: позиция запоминается при уходе на страницу врача и при отправке заявки */
  const rememberSpot = () => {
    // запоминаем секцию и смещение внутри неё
    let best = null;
    $$('main > section[id]').forEach(sec => { if (sec.getBoundingClientRect().top <= 80) best = sec; });
    const spot = { t: Date.now() };
    if (best) { spot.id = best.id; spot.off = Math.round(-best.getBoundingClientRect().top); } else spot.y = Math.round(scrollY);
    try { sessionStorage.setItem('as_return_scroll', JSON.stringify(spot)); } catch {}
  };
  document.addEventListener('click', e => { if (e.target.closest('a[href*="vrachi/"]')) rememberSpot(); }, true);
  if (location.hash === '#closing-team' || location.hash === '#continue') {
    let saved = null; try { saved = JSON.parse(sessionStorage.getItem('as_return_scroll') || 'null'); } catch {}
    if (location.hash === '#continue') history.replaceState(null, '', location.pathname);
    if (saved && Date.now() - saved.t < 30 * 60e3) {
      try { sessionStorage.removeItem('as_return_scroll'); } catch {}
      let cancelled = false;
      addEventListener('touchstart', () => cancelled = true, { once: true, passive: true });
      addEventListener('wheel', () => cancelled = true, { once: true, passive: true });
      // первая установка мгновенная, поздние поправки плавные
      let first = true;
      const backTo = () => {
        if (cancelled) return;
        let y = saved.y || 0;
        if (saved.id) { const el = document.getElementById(saved.id); if (el) y = Math.round(el.getBoundingClientRect().top + scrollY + saved.off); }
        if (Math.abs(y - scrollY) < 4) return;
        scrollTo({ top: y, behavior: first ? 'instant' : 'smooth' });
        first = false;
      };
      backTo();
      addEventListener('load', backTo);
      document.addEventListener('as:content-applied', backTo, { once: true });
      const settle = setInterval(backTo, 250); // стабилизация, пока доезжают картинки и правки
      setTimeout(() => clearInterval(settle), 1800);
    }
  }

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

  /* отправка заявок */
  $$('form[data-lead]').forEach(f => f.addEventListener('submit', e => {
    e.preventDefault();
    const t = $('input[type=tel]', f);
    const msg = $('.lead__msg,.form-message', f);
    if (t.value.replace(/\D/g, '').length !== 11) { t.focus(); msg.textContent = 'Проверьте номер телефона'; return; }
    const fd = new FormData(f);
    const lead = {
      form: f.dataset.lead,
      name: fd.get('name') || '',
      phone: t.value,
      messenger: fd.get('messenger') || '',
      answers: fd.get('answers') || '',
      page: location.pathname,
      ref: document.referrer || '',
    };
    // заявка уходит в админку; переход на «Спасибо» не ждёт ответа сервера
    try { fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(lead), keepalive: true }); } catch {}
    try { sessionStorage.setItem('as_lead', JSON.stringify({ form: f.dataset.lead, at: Date.now() })); } catch {}
    rememberSpot();
    location.href = 'thanks/?form=' + encodeURIComponent(f.dataset.lead);
  }));

  /* калькулятор платежа: имплант задаёт цену, 3 и 6 мес — без переплат, 12 мес — +10% */
  const payAmount = $('#payment-amount'), payMonths = $('#payment-months'), payResult = $('#payment-result');
  const payMonthly = () => {
    const sum = Number(payAmount.value) || 0;
    const m = Number(payMonths.value) || 1;
    const total = m >= 12 ? sum * 1.1 : sum; // 12 мес — переплата 10%, короче — без переплат
    return Math.ceil(total / m);
  };
  if (payAmount) {
    const update = () => { payResult.textContent = payMonthly().toLocaleString('ru-RU') + ' ₽'; };
    payAmount.addEventListener('change', update); payMonths.addEventListener('change', update); update();
  }

  /* модальное окно: заголовок и текст зависят от кнопки, которая его открыла */
  const dlg = $('#lead');
  const dlgTitle = $('h3', dlg), dlgText = $('.modal-body>p', dlg), dlgList = $('.modal-list', dlg);
  const dlgDefault = { title: dlgTitle.textContent, text: dlgText.textContent };
  // заголовок окна по умолчанию берём из текущей разметки (учитываем правки из админки)
  const syncDefault = () => { dlgDefault.title = dlgTitle.textContent; dlgDefault.text = dlgText.textContent; };
  document.addEventListener('as:content-applied', syncDefault);
  // тексты вариантов под кнопки — из блока .modal-variants, с запасным значением
  const FALLBACK = {
    extraction: ['Удаление зубов за 99 ₽', 'Вместо 10 000 ₽ – при тотальной имплантации. Оставьте телефон, чтобы уточнить условия акции в клинике.'],
    sleep: ['Обсудить лечение во сне', 'Оставьте телефон – администратор поможет записаться на консультацию, чтобы обсудить лечение во сне и подходящий вариант обезболивания.'],
    choice: ['Разобрать мой случай', 'Оставьте телефон – администратор поможет записаться на консультацию. Врач оценит, какие зубы можно сохранить, и объяснит доступные варианты восстановления.'],
    contract: ['Запросить образец договора', 'Оставьте телефон – администратор свяжется с вами, уточнит, куда прислать образец договора, или предложит ознакомиться с ним на консультации.'],
  };
  const getVariant = key => {
    const d = dlg.querySelector(`.modal-variants [data-variant="${key}"]`);
    if (d) {
      const b = $('b', d), s = $('span', d);
      const t = b && b.textContent.trim(), x = s && s.textContent.trim();
      if (t || x) return [t || FALLBACK[key][0], x || FALLBACK[key][1]];
    }
    return FALLBACK[key] || [];
  };
  const openModal = (title, text) => {
    dlgTitle.textContent = title || dlgDefault.title;
    dlgText.textContent = text || dlgDefault.text;
    dlgList.hidden = !!title;
    $('.form-message', dlg).textContent = '';
    dlg.showModal();
    if (!matchMedia('(pointer:coarse)').matches) setTimeout(() => $('input[type=tel]', dlg).focus(), 60);
  };
  $$('[data-modal]').forEach(b => b.addEventListener('click', e => {
    e.preventDefault();
    if (b.hasAttribute('data-finance') && payAmount) {
      openModal('Получить точный расчёт', 'Ориентировочно: ' + payAmount.selectedOptions[0].textContent + ', ' + payMonths.value + ' мес. – ' + payResult.textContent + ' в месяц (рассрочка клиники: 3 и 6 месяцев без переплат, 12 месяцев – переплата 10%). Оставьте телефон, чтобы уточнить доступную программу и условия оплаты.');
      return;
    }
    const key = ['extraction', 'sleep', 'choice', 'contract'].find(k => b.hasAttribute('data-' + k));
    openModal(...(key ? getVariant(key) : []));
  }));
  $('.modal-close', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => {
    if (e.target.closest('.modal-body')) return; // клик по самой форме не закрывает окно
    const act = document.activeElement;
    // поле только что получило фокус и окно уехало под клавиатуру — это не клик по фону
    if (act && act !== dlg && dlg.contains(act)) return;
    const r = dlg.getBoundingClientRect();
    if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
  });

  /* квиз: четыре вопроса и форма контакта */
  const quiz = $('#match-quiz');
  if (quiz) {
    const steps = $$('.match-quiz-step', quiz), next = $('#match-quiz-next'), back = $('.match-quiz-back', quiz);
    const contact = $('.match-quiz-contact', quiz), count = $('#match-quiz-count'), bars = $$('.match-quiz-bars i', quiz);
    let s = 0;
    const render = focus => {
      steps.forEach((st, i) => { st.hidden = i !== s; st.disabled = i !== s; });
      contact.hidden = s !== 4;
      $$('input', contact).forEach(i => i.disabled = s !== 4);
      // «Дальше» нужна только на шаге с мультивыбором (шаг 3); на одиночных шагах выбор ведёт сам
      next.hidden = s !== 3; back.hidden = s === 0;
      next.disabled = s === 3 && !$('input:checked', steps[s]);
      count.textContent = (s === 4 ? 4 : s + 1) + ' / 4';
      bars.forEach((b, i) => b.classList.toggle('is-active', i <= s));
      applyH();
      if (focus) (s === 4 ? $('h3', contact) : $('legend', steps[s])).focus({ preventScroll: true });
    };
    /* высота сцены: десктоп держит общую, телефон берёт высоту текущего шага */
    const stage = $('.match-quiz-stage', quiz);
    const mqNarrow = matchMedia('(max-width:760px)');
    let stepH = [];
    const applyH = () => {
      if (!stepH.length) return;
      if (mqNarrow.matches) { stage.style.minHeight = ''; stage.style.height = stepH[s] + 'px'; }
      else { stage.style.height = ''; stage.style.minHeight = Math.max(...stepH) + 'px'; }
    };
    const fit = () => {
      stage.style.minHeight = ''; stage.style.height = '';
      stepH = [...steps, contact].map(el => {
        const was = el.hidden; el.hidden = false; el.style.position = 'absolute'; el.style.visibility = 'hidden'; el.style.width = stage.clientWidth + 'px';
        const h = el.offsetHeight;
        el.hidden = was; el.style.position = el.style.visibility = el.style.width = '';
        return h;
      });
      applyH();
    };
    fit(); addEventListener('resize', fit); addEventListener('load', fit);
    const answers = $('input[name=answers]', contact);
    quiz.addEventListener('change', e => {
      render();
      answers.value = steps.map(st => $$('input:checked', st).map(i => i.value).join(', ') || '–').join(' | ');
    });
    /* смена шага через View Transitions; без поддержки смена мгновенная */
    let moving = false;
    if (document.startViewTransition) document.documentElement.classList.add('vt-quiz');
    const go = (n, focus) => {
      if (moving || n === s) return; moving = true;
      const swap = () => { s = n; render(focus); };
      if (document.startViewTransition && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        document.documentElement.dataset.quizDir = n > s ? 'fwd' : 'back';
        quiz.classList.add('quiz-no-anim');
        const t = document.startViewTransition(swap);
        t.finished.finally(() => { quiz.classList.remove('quiz-no-anim'); moving = false; });
      } else { swap(); moving = false; }
    };
    /* первые три шага — одиночный выбор: клик по варианту сам ведёт к следующему вопросу */
    quiz.addEventListener('click', e => {
      if (s >= 3) return;
      const opt = e.target.closest('.match-quiz-option');
      const input = opt && $('input', opt);
      if (!input || input.type !== 'radio') return;
      setTimeout(() => { if (s < 3 && $('input:checked', steps[s])) go(s + 1, true); }, 140);
    });
    next.addEventListener('click', () => { if (s < 4 && $('input:checked', steps[s])) go(s + 1, true); });
    back.addEventListener('click', () => { if (s > 0) go(s - 1, true); });
    render();
  }

  /* шкала оттенков: выноска при наведении, выбор по клику и стрелками */
  const shade = $('.smile-shade-selector');
  if (shade) {
    const items = $$('.smile-shade-item', shade), status = $('.smile-shade-status', shade);
    const mouse = matchMedia('(hover:hover) and (pointer:fine)');
    let selected = items.find(i => i.dataset.shade === 'A2') || items[0];
    const photo = $('#shadePhoto'), label = photo && $('.smile-shade-label', photo);
    const preview = item => {
      items.forEach(i => i.classList.toggle('is-preview', i === item));
      if (!photo) return;
      photo.style.setProperty('--c', item.dataset.t);
      photo.style.setProperty('--bl', item.dataset.bl ? '.55' : '0');
      $('b', label).textContent = item.dataset.shade;
      $('small', label).textContent = $('.smile-shade-tip span', item).textContent;
    };
    const note = $('.smile-shade-note', shade);
    const slider = document.createElement('div');
    slider.className = 'smile-shade-slider';
    slider.innerHTML = '<p class="smile-shade-slide-hint">Потяните ползунок, чтобы сравнить оттенки</p>';
    const range = document.createElement('input');
    range.type = 'range'; range.min = 0; range.max = items.length - 1; range.step = 1;
    range.className = 'smile-shade-range';
    range.setAttribute('aria-label', 'Оттенок зубов');
    const grad = items.map((it, i) => it.dataset.t + ' ' + Math.round(i / (items.length - 1) * 100) + '%').join(',');
    range.style.setProperty('--track', 'linear-gradient(90deg,' + grad + ')');
    const ticks = document.createElement('div');
    ticks.className = 'smile-shade-ticks';
    items.forEach((it, i) => {
      const t = document.createElement('button');
      t.type = 'button'; t.className = 'smile-shade-tick'; t.dataset.i = i;
      t.style.setProperty('--tc', it.dataset.t);
      t.setAttribute('aria-label', 'Оттенок ' + it.dataset.shade);
      t.innerHTML = '<i></i><span>' + it.dataset.shade + '</span>';
      ticks.appendChild(t);
    });
    slider.appendChild(range); slider.appendChild(ticks);
    if (note) shade.insertBefore(slider, note); else shade.appendChild(slider);
    const tickEls = $$('.smile-shade-tick', ticks);
    const syncSlider = idx => { range.value = idx; tickEls.forEach((t, i) => t.classList.toggle('is-on', i === idx)); };
    range.addEventListener('input', () => {
      const i = +range.value, item = items[i];
      selected = item;
      items.forEach(x => $('button', x).setAttribute('aria-pressed', String(x === item)));
      preview(item);
      tickEls.forEach((t, ti) => t.classList.toggle('is-on', ti === i));
      status.textContent = item.dataset.shade + ' – ' + $('.smile-shade-tip span', item).textContent;
    });
    ticks.addEventListener('click', e => {
      const t = e.target.closest('.smile-shade-tick');
      if (!t) return;
      range.value = t.dataset.i;
      range.dispatchEvent(new Event('input'));
    });
    items.forEach((item, index) => {
      const b = $('button', item);
      b.addEventListener('pointerenter', () => { if (mouse.matches) preview(item); });
      b.addEventListener('pointerleave', () => { if (mouse.matches) preview(selected); });
      b.addEventListener('focus', () => preview(item));
      b.addEventListener('blur', () => preview(selected));
      b.addEventListener('click', () => {
        selected = item;
        items.forEach(i => $('button', i).setAttribute('aria-pressed', String(i === selected)));
        preview(item);
        syncSlider(index);
        status.textContent = item.dataset.shade + ' – ' + $('.smile-shade-tip span', item).textContent;
      });
      b.addEventListener('keydown', e => {
        let n;
        if (e.key === 'ArrowRight') n = (index + 1) % items.length;
        if (e.key === 'ArrowLeft') n = (index + items.length - 1) % items.length;
        if (e.key === 'Home') n = 0;
        if (e.key === 'End') n = items.length - 1;
        if (n !== undefined) { e.preventDefault(); $('button', items[n]).focus(); }
        if (e.key === 'Escape') items.forEach(i => i.classList.remove('is-preview'));
      });
    });
    preview(selected);
    syncSlider(items.indexOf(selected));
  }

  /* второе мнение: выбор файлов плана, затем телефон в модалке */
  const opinion = $('#opinion-form');
  if (opinion) {
    const input = $('#opinion-files'), drop = $('#opinion-drop'), list = $('.opinion-file-list', opinion);
    const status = $('.opinion-upload-status', opinion), msg = $('.form-message', opinion);
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    let files = [];
    const size = f => f.size < 100 * 1024 ? Math.max(1, Math.round(f.size / 1024)) + ' КБ' : (f.size / 1024 / 1024).toFixed(1) + ' МБ';
    const render = () => {
      list.replaceChildren();
      files.forEach((file, i) => {
        const li = document.createElement('li'), name = document.createElement('span'), rm = document.createElement('button');
        name.textContent = file.name + ' · ' + size(file);
        rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Убрать файл ' + file.name);
        rm.addEventListener('click', () => { files.splice(i, 1); render(); status.textContent = files.length ? 'Выбрано файлов: ' + files.length : 'Файлы удалены. Можно выбрать другие.'; });
        li.append(name, rm); list.append(li);
      });
    };
    const add = incoming => {
      const errors = [];
      for (const file of incoming) {
        if (!allowed.includes(file.type)) { errors.push('Формат файла «' + file.name + '» не поддерживается.'); continue; }
        if (file.size > 10 * 1024 * 1024) { errors.push('Файл «' + file.name + '» больше 10 МБ.'); continue; }
        if (files.some(f => f.name === file.name && f.size === file.size && f.lastModified === file.lastModified)) continue;
        if (files.length >= 5) { errors.push('Можно выбрать не более 5 файлов.'); break; }
        files.push(file);
      }
      render();
      status.textContent = errors.length ? errors.join(' ') : 'Выбрано файлов: ' + files.length;
      msg.textContent = ''; input.value = '';
    };
    input.addEventListener('change', () => add([...input.files]));
    let depth = 0;
    drop.addEventListener('dragenter', e => { e.preventDefault(); depth++; drop.classList.add('is-dragging'); });
    drop.addEventListener('dragover', e => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; });
    drop.addEventListener('dragleave', e => { e.preventDefault(); if (--depth <= 0) { depth = 0; drop.classList.remove('is-dragging'); } });
    drop.addEventListener('drop', e => { e.preventDefault(); depth = 0; drop.classList.remove('is-dragging'); add([...e.dataTransfer.files]); });
    opinion.addEventListener('submit', e => {
      e.preventDefault();
      if (!files.length) { msg.textContent = 'Добавьте фото или PDF плана лечения.'; input.focus(); return; }
      openModal('Получить расчёт со скидкой 15%', 'Файлов выбрано: ' + files.length + '. Оставьте телефон – администратор свяжется с вами и пришлёт расчёт со скидкой.');
    });
  }


  /* карта: включается по нажатию, чтобы не перехватывать прокрутку */
  document.addEventListener('click', e => {
    const cover = e.target.closest('.closing-map-cover');
    if (cover) cover.closest('.closing-map-frame').classList.add('is-active');
  });

  /* отзывы: «Читать полностью» только там, где текст обрезан */
  const clampCheck = () => $$('.review-card').forEach(c => { const p = $('p', c); c.classList.toggle('is-clamped', !c.classList.contains('is-open') && p.scrollHeight > p.clientHeight + 2); });
  clampCheck(); addEventListener('resize', clampCheck); addEventListener('load', clampCheck);
  document.addEventListener('click', e => {
    const b = e.target.closest('.review-more'); if (!b) return;
    const c = b.closest('.review-card'); const open = c.classList.toggle('is-open');
    b.textContent = open ? 'Свернуть' : 'Читать полностью'; b.setAttribute('aria-expanded', String(open));
  });

  /* табы маршрута */
  const tabs = $$('.closing-tabs [role=tab]');
  const activate = tab => {
    tabs.forEach(t => {
      const on = t === tab;
      t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
      document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
    });
    dispatchEvent(new Event('resize')); // пересчитать стрелки галереи показанного маршрута
  };
  tabs.forEach((tab, i) => {
    tab.addEventListener('click', () => activate(tab));
    tab.addEventListener('keydown', e => {
      let n;
      if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') n = 1 - i;
      if (e.key === 'Home') n = 0;
      if (e.key === 'End') n = tabs.length - 1;
      if (n !== undefined) { e.preventDefault(); activate(tabs[n]); tabs[n].focus(); }
    });
  });

  /* стрелки галереи маршрута */
  document.querySelectorAll('.route-gallery').forEach(g => {
    const track = g.querySelector('.route-track');
    const prev = g.querySelector('.route-nav--prev'), next = g.querySelector('.route-nav--next');
    if (!track || !prev || !next) return;
    const step = () => { const c = track.querySelector('.route-shot'); const gap = parseFloat(getComputedStyle(track).columnGap) || 18; return c ? c.offsetWidth + gap : track.clientWidth; };
    const sync = () => { const max = track.scrollWidth - track.clientWidth - 2; prev.disabled = track.scrollLeft <= 2; next.disabled = track.scrollLeft >= max; };
    prev.addEventListener('click', () => track.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step() * 2, behavior: 'smooth' }));
    track.addEventListener('scroll', sync, { passive: true });
    addEventListener('resize', sync); sync();
  });

  /* калькулятор: клик по полю сразу открывает выпадающий список */
  document.querySelectorAll('.payment-field').forEach(f => {
    const sel = f.querySelector('select'); if (!sel) return;
    f.addEventListener('click', e => { if (e.target !== sel && typeof sel.showPicker === 'function') { try { sel.showPicker(); } catch {} } });
  });

  /* слайдер врачей */
  const docSlider = document.querySelector('[data-doc-slider]');
  if (docSlider) {
    const track = docSlider.querySelector('.closing-track');
    const prev = docSlider.querySelector('.closing-nav--prev');
    const next = docSlider.querySelector('.closing-nav--next');
    const step = () => {
      const card = track.querySelector('.closing-doc');
      const gap = parseFloat(getComputedStyle(track).columnGap) || 16;
      return card ? card.offsetWidth + gap : track.clientWidth;
    };
    const sync = () => {
      const max = track.scrollWidth - track.clientWidth - 2;
      prev.disabled = track.scrollLeft <= 2;
      next.disabled = track.scrollLeft >= max;
    };
    prev.addEventListener('click', () => track.scrollBy({ left: -step() * 2, behavior: 'smooth' }));
    next.addEventListener('click', () => track.scrollBy({ left: step() * 2, behavior: 'smooth' }));
    track.addEventListener('scroll', sync, { passive: true });
    window.addEventListener('resize', sync);
    sync();
  }
})();
