/* final · интерактив страницы: формы, модалка, калькулятор, квиз, оттенки, маршрут */
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
      '.care-support-intro', '.closing-lead', '.extraction-panel', '.reviews-head', '.reviews-widget', '.results-story', '.results-work', '.care-item',
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
    const msg = $('.lead__msg,.form-message', f);
    if (t.value.replace(/\D/g, '').length !== 11) { t.focus(); msg.textContent = 'Проверьте номер телефона'; return; }
    console.log('lead', f.dataset.lead, Object.fromEntries(new FormData(f).entries())); // TODO: отправка в CRM
    try { sessionStorage.setItem('as_lead', JSON.stringify({ form: f.dataset.lead, at: Date.now() })); } catch {}
    location.href = 'thanks/?form=' + encodeURIComponent(f.dataset.lead);
  }));

  /* калькулятор платежа */
  const payAmount = $('#payment-amount'), payMonths = $('#payment-months'), payResult = $('#payment-result');
  if (payAmount) {
    const update = () => { payResult.textContent = Math.ceil(payAmount.value / payMonths.value).toLocaleString('ru-RU') + ' ₽'; };
    payAmount.addEventListener('change', update); payMonths.addEventListener('change', update); update();
  }

  /* модальное окно: заголовок и текст зависят от кнопки, которая его открыла */
  const dlg = $('#lead');
  const dlgTitle = $('h3', dlg), dlgText = $('.modal-body>p', dlg), dlgList = $('.modal-list', dlg);
  const dlgDefault = { title: dlgTitle.textContent, text: dlgText.textContent };
  const variants = {
    extraction: ['Удаление зубов за 99 ₽', 'Вместо 10 000 ₽ – при тотальной имплантации. Оставьте телефон, чтобы уточнить условия акции в клинике.'],
    sleep: ['Обсудить лечение во сне', 'Оставьте телефон – администратор поможет записаться на консультацию, чтобы обсудить лечение во сне и подходящий вариант обезболивания.'],
    choice: ['Разобрать мой случай', 'Оставьте телефон – администратор поможет записаться на консультацию. Врач оценит, какие зубы можно сохранить, и объяснит доступные варианты восстановления.'],
    contract: ['Запросить образец договора', 'Оставьте телефон – администратор свяжется с вами, уточнит, куда прислать образец договора, или предложит ознакомиться с ним на консультации.'],
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
      openModal('Получить точный расчёт', 'Предварительный расчёт: ' + payAmount.selectedOptions[0].textContent + ' на ' + payMonths.value + ' мес. – ' + payResult.textContent + ' в месяц без учёта процентов. Оставьте телефон, чтобы уточнить доступную программу и условия оплаты.');
      return;
    }
    const key = Object.keys(variants).find(k => b.hasAttribute('data-' + k));
    openModal(...(key ? variants[key] : []));
  }));
  $('.modal-close', dlg).addEventListener('click', () => dlg.close());
  dlg.addEventListener('click', e => {
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
      next.hidden = s === 4; back.hidden = s === 0;
      next.disabled = s < 4 && !$('input:checked', steps[s]);
      count.textContent = (s === 4 ? 4 : s + 1) + ' / 4';
      bars.forEach((b, i) => b.classList.toggle('is-active', i <= s));
      if (focus) (s === 4 ? $('h3', contact) : $('legend', steps[s])).focus({ preventScroll: true });
    };
    /* одинаковая высота всех шагов: замеряем самый высокий и держим её, чтобы страница не прыгала */
    const stage = $('.match-quiz-stage', quiz);
    const fit = () => {
      stage.style.minHeight = '';
      let h = 0;
      [...steps, contact].forEach(el => {
        const was = el.hidden; el.hidden = false; el.style.position = 'absolute'; el.style.visibility = 'hidden'; el.style.width = stage.clientWidth + 'px';
        h = Math.max(h, el.offsetHeight);
        el.hidden = was; el.style.position = el.style.visibility = el.style.width = '';
      });
      stage.style.minHeight = h + 'px';
    };
    fit(); addEventListener('resize', fit); addEventListener('load', fit);
    const answers = $('input[name=answers]', contact);
    quiz.addEventListener('change', () => {
      render();
      answers.value = steps.map(st => $$('input:checked', st).map(i => i.value).join(', ') || '–').join(' | ');
    });
    next.addEventListener('click', () => { if (s < 4 && $('input:checked', steps[s])) { s++; render(true); } });
    back.addEventListener('click', () => { if (s > 0) { s--; render(true); } });
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
      console.log('lead', 'opinion', files.map(f => f.name)); // TODO: загрузка файлов и отправка в CRM
      openModal('Получить расчёт со скидкой 15%', 'Файлов выбрано: ' + files.length + '. Оставьте телефон – администратор свяжется с вами и пришлёт расчёт со скидкой.');
    });
  }


  /* карта: включается по нажатию, чтобы не перехватывать прокрутку */
  document.addEventListener('click', e => {
    const cover = e.target.closest('.closing-map-cover');
    if (cover) cover.closest('.closing-map-frame').classList.add('is-active');
  });

  /* табы маршрута */
  const tabs = $$('.closing-tabs [role=tab]');
  const activate = tab => tabs.forEach(t => {
    const on = t === tab;
    t.setAttribute('aria-selected', String(on)); t.tabIndex = on ? 0 : -1;
    document.getElementById(t.getAttribute('aria-controls')).hidden = !on;
  });
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
})();
