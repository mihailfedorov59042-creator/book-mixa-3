/* Progressive Web App controls. No changes to notes or the reading-progress store. */
(() => {
  'use strict';
  const textStatus = document.getElementById('pwa-status');
  const installButton = document.querySelector('[data-pwa-install]');
  const checkButton = document.querySelector('[data-pwa-check]');
  const nativeStandalone = window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let installEvent = null;
  let registration = null;
  let updating = false;
  let notice = null;
  let doReloadAfterActivation = false;
  let dismissedWorker = null;

  function status(message) { if (textStatus) textStatus.textContent = message; }
  function noticeBar(message, actions) {
    if (!notice) {
      notice = document.createElement('aside');
      notice.className = 'pwa-notice';
      notice.setAttribute('role', 'status');
      notice.setAttribute('aria-live', 'polite');
      document.body.appendChild(notice);
    }
    notice.replaceChildren();
    const msg = document.createElement('div');
    msg.className = 'pwa-notice__message';
    msg.textContent = message;
    notice.appendChild(msg);
    const buttonWrap = document.createElement('div');
    buttonWrap.className = 'pwa-notice__actions';
    for (const {title, primary, click} of actions) {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = title;
      if (primary) b.classList.add('pwa-primary');
      b.addEventListener('click', click);
      buttonWrap.appendChild(b);
    }
    notice.appendChild(buttonWrap);
    notice.hidden = false;
  }
  function hideNotice() { if (notice) notice.hidden = true; }
  function offerUpdate(worker) {
    if (!navigator.serviceWorker.controller || dismissedWorker === worker) return;
    status('Новая версия готова к установке.');
    noticeBar('Вышло обновление «Полки». Оно уже загружено. Обновить приложение сейчас?', [
      {title:'Обновить', primary:true, click:() => {
        // Reloads can discard an unfinished note draft even though saved notes survive.
        if (!window.confirm('Обновление перезагрузит страницу. Сохраните незаписанные заметки перед продолжением. Обновить сейчас?')) return;
        doReloadAfterActivation = true;
        worker.postMessage({type:'SKIP_WAITING'});
        status('Устанавливаем обновление…');
        hideNotice();
      }},
      {title:'Позже', click:() => { dismissedWorker = worker; hideNotice(); status('Обновление готово. Можно установить при следующем запуске.'); }}
    ]);
  }
  function setupRegistration(reg) {
    registration = reg;
    if (reg.waiting) offerUpdate(reg.waiting);
    reg.addEventListener('updatefound', () => {
      const worker = reg.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') {
          if (navigator.serviceWorker.controller) offerUpdate(worker);
          else status('Библиотека сохранена для чтения без интернета.');
        }
      });
    });
  }
  async function checkForUpdates(announce = false) {
    if (!registration || updating || !navigator.onLine) {
      if (announce) status(navigator.onLine ? 'Проверка обновлений пока недоступна.' : 'Вы не в сети. Открыты сохранённые книги.');
      return;
    }
    updating = true;
    if (announce) status('Проверяем обновления…');
    try {
      await registration.update();
      if (registration.waiting && navigator.serviceWorker.controller) offerUpdate(registration.waiting);
      else if (announce) status('Установлена актуальная версия.');
    } catch (err) {
      if (announce) status('Не удалось связаться с сервером. Библиотека доступна офлайн.');
      console.warn('Не удалось проверить обновления:', err);
    } finally { updating = false; }
  }

  if (installButton) {
    if (isIOS && !nativeStandalone) installButton.hidden = false;
    installButton.addEventListener('click', async () => {
      if (installEvent) {
        const event = installEvent;
        installEvent = null;
        installButton.hidden = true;
        await event.prompt();
        try { await event.userChoice; } catch (_) {}
      } else if (isIOS) {
        noticeBar('Чтобы установить «Полку»: откройте меню «Поделиться» в браузере и выберите «На экран Домой».', [
          {title:'Понятно', click:hideNotice}
        ]);
      } else {
        noticeBar('Откройте меню браузера и выберите «Установить приложение» или «Добавить на главный экран».', [
          {title:'Понятно', click:hideNotice}
        ]);
      }
    });
  }
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    installEvent = event;
    if (installButton && !nativeStandalone) installButton.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    installEvent = null;
    if (installButton) installButton.hidden = true;
    status('«Полка» установлена на устройство.');
  });
  if (checkButton) checkButton.addEventListener('click', () => checkForUpdates(true));

  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    status('Для установки и автономной работы откройте сайт по HTTPS или на localhost.');
    return;
  }
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (doReloadAfterActivation) window.location.reload();
  });
  navigator.serviceWorker.register('./sw.js', {scope:'./', updateViaCache:'none'})
    .then(async reg => {
      setupRegistration(reg);
      try { await navigator.serviceWorker.ready; status('Библиотека доступна без интернета.'); }
      catch (_) {}
      if (reg.waiting && navigator.serviceWorker.controller) offerUpdate(reg.waiting);
      await checkForUpdates();
    })
    .catch(err => {
      status('Не удалось подготовить офлайн-доступ. Проверьте соединение.');
      console.warn('Ошибка регистрации автономной библиотеки:', err);
    });
  window.addEventListener('online', () => checkForUpdates());
  window.addEventListener('offline', () => status('Нет сети. Книги доступны офлайн.'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdates();
  });
  window.setInterval(() => checkForUpdates(), 60 * 60 * 1000);
})();
