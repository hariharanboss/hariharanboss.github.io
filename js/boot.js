/* ==========================================================
   GetNumber — boot.js
   Startup sequence.
   ========================================================== */
(function (global) {
  'use strict';

  var doc = global.document;

  function readPref(key, fallback) {
    try { return global.localStorage.getItem(key) || fallback; } catch (e) { return fallback; }
  }

  function registerServiceWorker() {
    if (!('serviceWorker' in global.navigator)) return;
    // Service workers need a secure context: https, or a loopback address.
    var host = global.location.hostname;
    var local = (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host === '::1');
    if (global.location.protocol !== 'https:' && !local) return;
    global.navigator.serviceWorker.register('sw.js').catch(function () { /* offline is optional */ });
  }

  function boot() {
    global.App.applyTheme(readPref('getnumber.theme', 'auto'));
    global.App.applyTextSize(readPref('getnumber.text', 'normal'));

    global.App.bind();
    global.Editor.bind();
    global.Backup.bind();
    global.Printer.bind();

    global.Vault.load()
      .then(function () {
        global.App.renderLockPublic();
        global.App.showLock();
        registerServiceWorker();
      })
      .catch(function (err) {
        // The lock screen still works (public emergency numbers) even if the
        // encrypted vault cannot be loaded.
        global.App.renderLockPublic();
        global.App.showLock();
        global.setTimeout(function () { global.App.toast(err.message || 'Could not load the vault'); }, 600);
      });
  }

  if (doc.readyState === 'loading') {
    doc.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})(window);
