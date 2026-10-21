/* ==========================================================
   GetNumber — app.js
   Lock screen, dashboard rendering, call actions, theme.
   ========================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var $ = function (sel, root) { return (root || doc).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || doc).querySelectorAll(sel)); };

  /* ---------------- helpers ---------------- */

  function esc(str) {
    return String(str == null ? '' : str)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /** Digits only, with an optional leading '+'. */
  function cleanNumber(num) {
    var s = String(num || '').trim();
    var plus = s.charAt(0) === '+' ? '+' : '';
    var digits = s.replace(/\D/g, '');
    return plus + digits;
  }

  /** Full international form: 919876543210 */
  function intlNumber(num, countryCode) {
    var s = cleanNumber(num);
    var cc = String(countryCode || '91').replace(/\D/g, '');
    if (s.charAt(0) === '+') return s.slice(1);
    if (s.length === 10) return cc + s;
    if (s.length === 11 && s.charAt(0) === '0') return cc + s.slice(1);
    return s;
  }

  function telHref(num) { return 'tel:' + cleanNumber(num); }

  function smsHref(num, body) {
    var href = 'sms:' + cleanNumber(num);
    if (body) href += '?body=' + encodeURIComponent(body);
    return href;
  }

  function waHref(num, countryCode, text) {
    var href = 'https://wa.me/' + intlNumber(num, countryCode);
    if (text) href += '?text=' + encodeURIComponent(text);
    return href;
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return '?';
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
  }

  var toastEl = null, toastTimer = null;
  function toast(msg) {
    if (!toastEl) {
      toastEl = doc.createElement('div');
      toastEl.className = 'toast';
      doc.body.appendChild(toastEl);
    }
    toastEl.textContent = msg;
    toastEl.classList.add('on');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('on'); }, 2600);
  }

  function fmtDate(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
  }

  /* ---------------- theme ---------------- */

  var THEME_KEY = 'getnumber.theme';
  var TEXT_KEY = 'getnumber.text';

  function applyTheme(theme) {
    doc.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
  }
  function applyTextSize(mode) {
    doc.documentElement.setAttribute('data-text', mode);
    try { localStorage.setItem(TEXT_KEY, mode); } catch (e) { /* ignore */ }
  }
  function cycleTheme() {
    var cur = doc.documentElement.getAttribute('data-theme') || 'auto';
    var next = cur === 'auto' ? 'light' : (cur === 'light' ? 'dark' : 'auto');
    applyTheme(next);
    toast('Theme: ' + next);
  }
  function cycleText() {
    var cur = doc.documentElement.getAttribute('data-text') || 'normal';
    var next = cur === 'normal' ? 'large' : (cur === 'large' ? 'xlarge' : 'normal');
    applyTextSize(next);
    toast('Text size: ' + next);
  }

  /* ---------------- public emergency numbers (pre-unlock) ---------------- */

  function publicEmergencyNumbers() {
    var pub = global.Vault.getPublic();
    var list = (pub.emergencyNumbers || []).filter(function (n) { return n.public !== false; });
    if (!list.length) {
      list = [
        { label: 'All-in-one emergency', number: '112', icon: '🚨' },
        { label: 'Police', number: '100', icon: '🚓' },
        { label: 'Fire', number: '101', icon: '🚒' },
        { label: 'Ambulance', number: '102', icon: '🚑' }
      ];
    }
    return list;
  }

  function renderLockPublic() {
    var pub = global.Vault.getPublic();
    $('#lockTitle').textContent = pub.siteTitle || 'GetNumber';
    $('#lockSub').textContent = pub.siteTagline || 'Emergency information';

    var msg = pub.pinHint || 'Ask the person who set this up, or check the card in your wallet.';
    var hasRec = global.Vault.hasRecovery();
    $('#passModeBtn').hidden = !hasRec;
    if (hasRec) {
      msg += ' You can also use your recovery passphrase.';
    }
    $('#pinHint').textContent = msg;

    var wrap = $('#lockSos');
    var grid = $('#lockPublicGrid');
    var more = $('#lockMore');
    if (pub.showOnLockScreen === false) { wrap.hidden = true; more.hidden = true; return; }

    var nums = publicEmergencyNumbers();

    // The first entry becomes the big red SOS button (usually 112).
    var hero = nums[0];
    var rest = nums.slice(1);

    if (hero) {
      wrap.innerHTML = '<a class="lock__sos" href="' + esc(telHref(hero.number)) + '">' +
        '<b>' + esc(hero.number) + '</b>' +
        '<span><small>' + esc(hero.icon || '🚨') + '</small>' +
        '<small>' + esc(hero.label) + '</small></span></a>';
      wrap.hidden = false;
    } else {
      wrap.hidden = true;
    }

    grid.innerHTML = rest.map(function (n) {
      return '<a href="' + esc(telHref(n.number)) + '"><i>' + esc(n.icon || '📞') + '</i>' +
        '<b>' + esc(n.number) + '</b><span>' + esc(n.label) + '</span></a>';
    }).join('');
    more.hidden = !rest.length;
  }

  /* ---------------- dashboard rendering ---------------- */

  function render() {
    var data = global.Vault.get();
    if (!data) return;
    var p = data.profile || {};
    var cc = (data.settings && data.settings.countryCode) || '91';

    /* ---- app bar ---- */
    $('#hdrName').textContent = p.fullName || 'Unnamed';
    var meta = [];
    if (p.bloodGroup) meta.push('🩸 ' + p.bloodGroup);
    if (p.dob) meta.push('b. ' + fmtDate(p.dob));
    $('#hdrMeta').textContent = meta.join('  ·  ');

    var av = $('#hdrAvatar');
    if (p.photo) {
      av.innerHTML = '<img src="' + esc(p.photo) + '" alt="">';
    } else {
      av.innerHTML = '<span>' + esc(initials(p.fullName)) + '</span>';
    }

    /* ---- banners ---- */
    $('#sampleBanner').hidden = !(data.meta && data.meta.sample);
    $('#pendingBanner').hidden = !global.Vault.isPending();

    /* ---- identity card ---- */
    $('#idName').textContent = p.fullName || 'Unnamed';
    var chips = [];
    if (p.bloodGroup) chips.push('<span class="chip chip--blood">🩸 ' + esc(p.bloodGroup) + '</span>');
    if (p.gender) chips.push('<span class="chip">' + esc(p.gender) + '</span>');
    if (p.dob) chips.push('<span class="chip">Born ' + esc(fmtDate(p.dob)) + '</span>');
    if (p.languages) chips.push('<span class="chip">🌐 ' + esc(p.languages) + '</span>');
    $('#idChips').innerHTML = chips.join('');

    var photo = $('#idPhoto');
    if (p.photo) { photo.src = p.photo; photo.hidden = false; } else { photo.hidden = true; }

    var allergies = (p.allergies || []).filter(Boolean);
    var alg = $('#idAllergy');
    if (allergies.length) {
      alg.hidden = false;
      alg.innerHTML = '⚠️ Allergy: ' + esc(allergies.join(', '));
    } else { alg.hidden = true; }

    /* ---- emergency buttons ---- */
    var ems = data.emergencyNumbers || [];
    var main = ems[0];
    if (main) {
      $('#sosMain').href = telHref(main.number);
      $('#sosNum').textContent = main.number;
      $('#sosLabel').textContent = main.label || 'Emergency';
      $('.sos__icon').textContent = main.icon || '🚨';
    }
    // Only the three most useful secondary numbers stay above the fold;
    // the rest collapse so your contacts are never buried.
    var quick = ems.slice(1, 4);
    var extra = ems.slice(4);
    $('#pubGrid').innerHTML = quick.map(function (n) {
      return '<a class="callbtn" href="' + esc(telHref(n.number)) + '">' +
        esc(n.icon || '📞') + ' ' + esc(n.number) + '<span class="muted tiny">' + esc(n.label) + '</span></a>';
    }).join('');

    var moreWrap = $('#pubMore');
    if (extra.length) {
      moreWrap.hidden = false;
      $('#pubMoreGrid').innerHTML = extra.map(function (n) {
        return '<a class="callbtn" href="' + esc(telHref(n.number)) + '">' +
          esc(n.icon || '📞') + ' ' + esc(n.number) + '<span class="muted tiny">' + esc(n.label) + '</span></a>';
      }).join('');
    } else {
      moreWrap.hidden = true;
    }

    /* ---- who to call for what ---- */
    var dir = data.directory || [];
    $('#directory').innerHTML = dir.length ? dir.map(function (d) {
      return '<li>' +
        '<span class="d__role">' + esc(d.label) + '</span>' +
        '<span class="d__name">' + esc(d.name || '—') +
        (d.note ? ' <span class="d__note">' + esc(d.note) + '</span>' : '') + '</span>' +
        '<a class="callbtn callbtn--call" style="flex:0 0 auto" href="' + esc(telHref(d.phone)) + '">📞 ' + esc(d.phone || '') + '</a>' +
        '</li>';
    }).join('') : '<li><span class="muted">Nothing added yet — use Edit to add roles.</span></li>';

    /* ---- contacts ---- */
    var contacts = (data.contacts || []).slice().sort(function (a, b) {
      return (a.priority || 99) - (b.priority || 99);
    });
    $('#contacts').innerHTML = contacts.length ? contacts.map(function (c, i) {
      var tags = (c.forWhat || []).filter(Boolean);
      var acts = '';
      if (c.phone) {
        acts += '<a class="callbtn callbtn--call" href="' + esc(telHref(c.phone)) + '">📞 Call</a>';
        acts += '<a class="callbtn" href="' + esc(smsHref(c.phone, 'Hi ' + (p.fullName || '') + ' — emergency.')) + '">✉️ SMS</a>';
        acts += '<a class="callbtn callbtn--wa" href="' + esc(waHref(c.phone, cc, 'Hi ' + (p.fullName || '') + ' — urgent, please call.')) + '" target="_blank" rel="noopener">💬 WhatsApp</a>';
      }
      if (c.altPhone) {
        acts += '<a class="callbtn" href="' + esc(telHref(c.altPhone)) + '">📞 Alt ' + esc(c.altPhone) + '</a>';
      }
      return '<article class="contact' + (i === 0 ? ' contact--primary' : '') + '">' +
        '<div class="contact__top">' +
        (i === 0 ? '<span class="contact__rank">CALL FIRST</span>' : '') +
        '<span class="contact__name">' + esc(c.name || 'Unnamed') + '</span>' +
        (c.relation ? '<span class="contact__rel">' + esc(c.relation) + '</span>' : '') +
        '</div>' +
        (c.phone ? '<div class="contact__num">' + esc(c.phone) + '</div>' : '') +
        (tags.length ? '<div class="contact__tags">' + tags.map(function (t) {
          return '<span class="contact__tag">' + esc(t) + '</span>';
        }).join('') + '</div>' : '') +
        (c.notes ? '<p class="tiny muted" style="margin-top:6px">' + esc(c.notes) + '</p>' : '') +
        (acts ? '<div class="contact__actions">' + acts + '</div>' : '') +
        '</article>';
    }).join('') : '<p class="muted">No contacts yet — use Edit to add the people you would call.</p>';

    /* ---- medical ---- */
    var med = data.medical || {};
    var medRows = [];
    function mrow(k, v, copyable) {
      if (!v) return;
      medRows.push('<div class="row"><div class="row__k">' + esc(k) + '</div><div class="row__v">' +
        esc(v) + (copyable ? '<button class="copybtn" data-copy="' + esc(v) + '">COPY</button>' : '') + '</div></div>');
    }
    mrow('Blood group', p.bloodGroup);
    mrow('Allergies', (p.allergies || []).join(', '));
    mrow('Conditions', (med.conditions || []).join(', '));
    mrow('Medications', (med.medications || []).join(', '));
    if (med.doctor && med.doctor.name) {
      mrow('Doctor', med.doctor.name + (med.doctor.clinic ? ' — ' + med.doctor.clinic : '') +
        (med.doctor.phone ? ' (' + med.doctor.phone + ')' : ''));
    }
    if (med.hospital && med.hospital.name) {
      mrow('Hospital', med.hospital.name + (med.hospital.address ? ' — ' + med.hospital.address : ''));
    }
    if (med.insurance && med.insurance.provider) {
      mrow('Insurance', med.insurance.provider + (med.insurance.policyNo ? ' · ' + med.insurance.policyNo : ''));
    }
    mrow('Notes', med.notes);
    $('#medical').innerHTML = medRows.length ? medRows.join('') : '<p class="muted">No medical details added yet.</p>';

    /* ---- property ---- */
    var pr = data.property || {};
    var home = pr.home || {}, veh = pr.vehicle || {}, docs = pr.documents || {};
    var prRows = [];
    function prow(k, v, copyable) {
      if (!v) return;
      prRows.push('<div class="row"><div class="row__k">' + esc(k) + '</div><div class="row__v">' +
        esc(v) + (copyable ? '<button class="copybtn" data-copy="' + esc(v) + '">COPY</button>' : '') + '</div></div>');
    }
    var addr = [p.address && p.address.line1, p.address && p.address.area, p.address && p.address.city,
      p.address && p.address.state, p.address && p.address.pincode, p.address && p.address.country]
      .filter(Boolean).join(', ');
    prow('Address', addr, !!addr);
    prow('Landmark', p.landmark);
    prow('Landlord', home.landlord);
    prow('Manager', home.buildingManager || home.society);
    prow('Wi-Fi', home.wifi ? home.wifi + (home.wifiHint ? ' · ' + home.wifiHint : '') : '');
    if (veh.make || veh.regNo) {
      prow('Vehicle', [veh.make, veh.model, veh.color, veh.regNo].filter(Boolean).join(' · '));
    }
    if (veh.insurer || veh.policyNo) {
      prow('Insurance', [veh.insurer, veh.policyNo].filter(Boolean).join(' · '));
    }
    if (veh.towPhone) prow('Towing', veh.towPhone);
    if (docs.licenseNo) prow('Licence', docs.licenseNo);
    if (docs.passportNo) prow('Passport', docs.passportNo);
    $('#property').innerHTML = prRows.length ? prRows.join('') : '<p class="muted">No home or vehicle details added yet.</p>';

    /* ---- notes ---- */
    var notes = (data.notes || []).map(function (n) { return n.text || n; }).filter(Boolean);
    $('#notes').innerHTML = notes.length
      ? notes.map(function (t) { return '<div class="row"><div class="row__v">' + esc(t) + '</div></div>'; }).join('')
      : '<p class="muted">No notes.</p>';

    /* ---- footer ---- */
    var upd = data.meta && data.meta.updatedAt ? fmtDate(data.meta.updatedAt) : '';
    $('#footUpdated').textContent = upd ? 'updated ' + upd : '';
  }

  /* ---------------- navigation ---------------- */

  function showApp() {
    doc.body.setAttribute('data-screen', 'app');
    $('#lock').hidden = true;
    $('#app').hidden = false;
    render();
  }

  function showLock() {
    doc.body.setAttribute('data-screen', 'lock');
    $('#app').hidden = true;
    $('#editor').hidden = true;
    $('#backup').hidden = true;
    $('#printModal').hidden = true;
    $('#lock').hidden = false;
    var input = $('#pinInput');
    input.value = '';
    updateDots();
    try { showPassMode(false); } catch (e) { /* not wired yet */ }
    renderLockPublic();
  }

  function lockNow() {
    global.Vault.lock();
    showLock();
    toast('Locked');
  }

  /* ---------------- PIN UI ---------------- */

  function pinValue() {
    return ($('#pinInput').value || '').replace(/\D/g, '');
  }

  function updateDots() {
    var val = pinValue();
    $$('#pinDots i').forEach(function (dot, i) {
      dot.classList.toggle('on', i < val.length);
    });
  }

  function pressKey(k) {
    var input = $('#pinInput');
    var val = pinValue();
    if (k === 'back') val = val.slice(0, -1);
    else if (k === 'clear') val = '';
    else if (val.length < 6) val += k;
    input.value = val;
    updateDots();
    if (val.length === 6) setTimeout(submitPin, 120);
  }

  function showPinError(msg) {
    var el = $('#pinError');
    el.textContent = msg;
    el.hidden = false;
    setTimeout(function () { el.hidden = true; }, 4000);
  }

  function hidePinError() {
    var el = $('#pinError');
    el.textContent = '';
    el.hidden = true;
  }

  function clearPin() {
    var input = $('#pinInput');
    input.value = '';
    updateDots();
  }

  async function submitPin() {
    var pin = pinValue();
    if (pin.length !== 6) { showPinError('Enter all 6 digits.'); return; }

    var btn = $('#pinSubmit');
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    try {
      await global.Vault.unlock(pin);
      clearPin();
      hidePinError();
      showApp();
    } catch (e) {
      if (e && e.code === 'NO_CRYPTO') {
        showPinError(e.message);
      } else {
        showPinError('Incorrect PIN. Try again.');
        clearPin();
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  }

  /* ---------------- recovery passphrase ---------------- */

  function showPassMode(on) {
    $('#passBox').hidden = !on;
    $('#passModeBtn').hidden = on;
    $('#keypad').hidden = on;
    $('#pinDots').hidden = on;
    $('#pinSubmit').hidden = on;
    $('.pin__label').hidden = on;
    if (on) {
      var pi = $('#passInput');
      pi.value = '';
      setTimeout(function () { pi.focus(); }, 60);
    }
  }

  async function submitPassphrase() {
    var val = ($('#passInput').value || '').trim();
    if (!val) { showPinError('Enter your recovery passphrase.'); return; }
    var btn = $('#passSubmit');
    btn.disabled = true;
    btn.textContent = 'Unlocking…';
    try {
      await global.Vault.unlock(val);
      $('#passInput').value = '';
      hidePinError();
      showPassMode(false);
      showApp();
    } catch (e) {
      showPinError('That passphrase did not work.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Unlock';
    }
  }

  /* ---------------- copy to clipboard ---------------- */

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      toast('Copied');
    } catch (e) {
      var ta = doc.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      doc.body.appendChild(ta);
      ta.select();
      try { doc.execCommand('copy'); toast('Copied'); } catch (e2) { toast('Copy failed'); }
      doc.body.removeChild(ta);
    }
  }

  /* ---------------- PWA install ---------------- */

  var deferredPrompt = null;
  global.addEventListener('beforeinstallprompt', function (e) {
    e.preventDefault();
    deferredPrompt = e;
    var btn = $('#btnInstall');
    if (btn) btn.hidden = false;
  });
  global.addEventListener('appinstalled', function () {
    var btn = $('#btnInstall');
    if (btn) btn.hidden = true;
    toast('Installed');
  });

  async function doInstall() {
    if (!deferredPrompt) { toast('Use your browser menu → "Add to Home screen"'); return; }
    deferredPrompt.prompt();
    await deferredPrompt.userChoice;
    deferredPrompt = null;
    var btn = $('#btnInstall');
    if (btn) btn.hidden = true;
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    /* keypad */
    $('#keypad').addEventListener('click', function (e) {
      var btn = e.target.closest('.key');
      if (!btn) return;
      pressKey(btn.getAttribute('data-k'));
    });

    /* pin input */
    $('#pinInput').addEventListener('input', function () {
      this.value = this.value.replace(/\D/g, '').slice(0, 6);
      updateDots();
    });
    $('#pinInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitPin(); }
    });
    $('#pinForm').addEventListener('submit', function (e) {
      e.preventDefault();
      submitPin();
    });

    /* recovery passphrase */
    $('#passModeBtn').addEventListener('click', function () { showPassMode(true); });
    $('#passCancel').addEventListener('click', function () { showPassMode(false); });
    $('#passSubmit').addEventListener('click', submitPassphrase);
    $('#passInput').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); submitPassphrase(); }
    });

    /* pin hint */
    $('#pinHintBtn').addEventListener('click', function () {
      var h = $('#pinHint');
      h.hidden = !h.hidden;
    });

    /* theme + text */
    $('#btnTheme').addEventListener('click', cycleTheme);
    $('#btnText').addEventListener('click', cycleText);
    $('#btnLock').addEventListener('click', lockNow);

    /* action buttons (delegated) */
    doc.addEventListener('click', function (e) {
      var copyBtn = e.target.closest('[data-copy]');
      if (copyBtn) {
        copyText(copyBtn.getAttribute('data-copy'));
        return;
      }
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'edit') global.Editor.open();
      else if (a === 'backup') global.Backup.open();
      else if (a === 'print') global.Printer.open();
      else if (a === 'install') doInstall();
    });

    /* lock when the tab is hidden */
    doc.addEventListener('visibilitychange', function () {
      if (doc.hidden && global.Vault.isUnlocked()) {
        // small grace period so the print dialog doesn't kill the session
        setTimeout(function () {
          if (doc.hidden && global.Vault.isUnlocked()) lockNow();
        }, 45000);
      }
    });
  }

  global.App = {
    esc: esc,
    cleanNumber: cleanNumber,
    intlNumber: intlNumber,
    telHref: telHref,
    smsHref: smsHref,
    waHref: waHref,
    initials: initials,
    toast: toast,
    fmtDate: fmtDate,
    render: render,
    renderLockPublic: renderLockPublic,
    showApp: showApp,
    showLock: showLock,
    lockNow: lockNow,
    bind: bind,
    updateDots: updateDots,
    copyText: copyText,
    publicEmergencyNumbers: publicEmergencyNumbers,
    applyTheme: applyTheme,
    applyTextSize: applyTextSize
  };
})(window);
