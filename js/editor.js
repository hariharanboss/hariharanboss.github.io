/* ==========================================================
   GetNumber — editor.js
   In-app editor for every part of the emergency profile.
   Works on a copy; nothing is written until you hit Save.
   ========================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var $$ = function (s, r) { return Array.prototype.slice.call((r || doc).querySelectorAll(s)); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  /* ---------------- path helpers ---------------- */
  function getPath(obj, path) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length; i++) {
      if (cur == null) return undefined;
      cur = cur[parts[i]];
    }
    return cur;
  }
  function setPath(obj, path, value) {
    var parts = path.split('.'), cur = obj;
    for (var i = 0; i < parts.length - 1; i++) {
      if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {};
      cur = cur[parts[i]];
    }
    cur[parts[parts.length - 1]] = value;
  }

  /* ---------------- schema ---------------- */
  var TABS = [
    {
      id: 'profile', label: '👤 Profile', type: 'fields',
      fields: [
        { p: 'profile.fullName', l: 'Full name', t: 'text', ph: 'e.g. Dhanusha Perera' },
        { p: 'profile.dob', l: 'Date of birth', t: 'date' },
        { p: 'profile.bloodGroup', l: 'Blood group', t: 'select', o: ['—', 'A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown'] },
        { p: 'profile.gender', l: 'Gender', t: 'select', o: ['—', 'Female', 'Male', 'Other', 'Prefer not to say'] },
        { p: 'profile.nationality', l: 'Nationality', t: 'text' },
        { p: 'profile.languages', l: 'Languages spoken', t: 'text', ph: 'English, Tamil, Sinhala' },
        { p: 'profile.photo', l: 'Photo', t: 'image', hint: 'Pick or paste an image. It is stored inside the encrypted vault, so it never reaches the repo in readable form.' },
        { p: 'profile.allergies', l: 'Allergies', t: 'tags', ph: 'Penicillin, Peanuts…' },
        { p: 'profile.address.line1', l: 'Address — flat / house', t: 'text' },
        { p: 'profile.address.area', l: 'Area / street', t: 'text' },
        { p: 'profile.address.city', l: 'City', t: 'text' },
        { p: 'profile.address.state', l: 'State', t: 'text' },
        { p: 'profile.address.pincode', l: 'PIN code', t: 'text' },
        { p: 'profile.address.country', l: 'Country', t: 'text', ph: 'India' },
        { p: 'profile.landmark', l: 'Nearby landmark', t: 'text' },
        { p: 'profile.emergencyNote', l: 'What responders should know', t: 'textarea' }
      ]
    },
    {
      id: 'medical', label: '🩺 Medical', type: 'fields',
      fields: [
        { p: 'medical.conditions', l: 'Ongoing conditions', t: 'tags', ph: 'Asthma, Diabetes…' },
        { p: 'medical.medications', l: 'Medications & doses', t: 'tags', ph: 'Salbutamol inhaler — 2 puffs as needed' },
        { p: 'medical.doctor.name', l: 'Family doctor', t: 'text' },
        { p: 'medical.doctor.clinic', l: 'Clinic / hospital', t: 'text' },
        { p: 'medical.doctor.phone', l: 'Doctor phone', t: 'tel' },
        { p: 'medical.hospital.name', l: 'Preferred hospital', t: 'text' },
        { p: 'medical.hospital.address', l: 'Hospital address', t: 'text' },
        { p: 'medical.hospital.phone', l: 'Hospital phone', t: 'tel' },
        { p: 'medical.insurance.provider', l: 'Health insurer', t: 'text' },
        { p: 'medical.insurance.policyNo', l: 'Policy number', t: 'text' },
        { p: 'medical.insurance.phone', l: 'Insurer helpline', t: 'tel' },
        { p: 'medical.notes', l: 'Other medical notes', t: 'textarea' }
      ]
    },
    {
      id: 'contacts', label: '👥 Contacts', type: 'list', list: 'contacts', add: 'Add contact',
      title: function (it) { return it.name || 'New contact'; },
      sub: function (it) { return it.phone || ''; },
      fields: [
        { k: 'name', l: 'Name', t: 'text' },
        { k: 'relation', l: 'Relationship', t: 'text', ph: 'Mother, Friend, Colleague…' },
        { k: 'phone', l: 'Phone', t: 'tel', ph: '+91 98765 43210' },
        { k: 'altPhone', l: 'Alternate phone', t: 'tel' },
        { k: 'forWhat', l: 'Call them for', t: 'tags', ph: 'Medical, Child pickup…' },
        { k: 'priority', l: 'Priority (1 = call first)', t: 'number' },
        { k: 'address', l: 'Address', t: 'textarea' },
        { k: 'notes', l: 'Notes', t: 'textarea' }
      ]
    },
    {
      id: 'emergency', label: '🚨 Numbers', type: 'list', list: 'emergencyNumbers', add: 'Add number',
      title: function (it) { return (it.label || 'New number'); },
      sub: function (it) { return it.number || ''; },
      fields: [
        { k: 'label', l: 'Label', t: 'text' },
        { k: 'number', l: 'Number', t: 'tel' },
        { k: 'icon', l: 'Icon (emoji)', t: 'text' },
        { k: 'note', l: 'Note', t: 'text' },
        { k: 'public', l: 'Show on the lock screen (before unlocking)', t: 'checkbox' }
      ]
    },
    {
      id: 'roles', label: '🧭 Roles', type: 'list', list: 'directory', add: 'Add role',
      title: function (it) { return it.label || 'New role'; },
      sub: function (it) { return it.name || ''; },
      fields: [
        { k: 'label', l: 'For what', t: 'text', ph: 'Plumbing, Locksmith, Vet…' },
        { k: 'name', l: 'Who to call', t: 'text' },
        { k: 'phone', l: 'Phone', t: 'tel' },
        { k: 'note', l: 'Note', t: 'text' }
      ]
    },
    {
      id: 'home', label: '🏠 Home & Vehicle', type: 'fields',
      fields: [
        { p: 'property.home.landlord', l: 'Landlord', t: 'text' },
        { p: 'property.home.buildingManager', l: 'Building manager / society', t: 'text' },
        { p: 'property.home.wifi', l: 'Wi-Fi network', t: 'text' },
        { p: 'property.home.wifiHint', l: 'Wi-Fi password hint', t: 'text' },
        { p: 'property.vehicle.make', l: 'Vehicle make', t: 'text' },
        { p: 'property.vehicle.model', l: 'Vehicle model', t: 'text' },
        { p: 'property.vehicle.color', l: 'Colour', t: 'text' },
        { p: 'property.vehicle.regNo', l: 'Registration number', t: 'text' },
        { p: 'property.vehicle.insurer', l: 'Vehicle insurer', t: 'text' },
        { p: 'property.vehicle.policyNo', l: 'Policy number', t: 'text' },
        { p: 'property.vehicle.towPhone', l: 'Towing / roadside number', t: 'tel' },
        { p: 'property.documents.licenseNo', l: 'Driving licence number', t: 'text' },
        { p: 'property.documents.passportNo', l: 'Passport number', t: 'text' }
      ]
    },
    {
      id: 'notes', label: '📝 Notes', type: 'list', list: 'notes', add: 'Add note',
      title: function (it) { return String(it.text || 'New note').slice(0, 48); },
      sub: function () { return ''; },
      fields: [{ k: 'text', l: 'Note', t: 'textarea' }]
    },
    {
      id: 'site', label: '🌐 Site', type: 'fields',
      fields: [
        { p: 'settings.siteUrl', l: 'This site\'s address (used by the QR code)', t: 'url', ph: 'https://yourname.github.io/getnumber/' },
        { p: 'settings.countryCode', l: 'Country code for WhatsApp / SMS', t: 'text', ph: '91' },
        { p: 'settings.siteTitle', l: 'Site title (shown on the lock screen)', t: 'text' },
        { p: 'settings.siteTagline', l: 'Tagline', t: 'text' },
        { p: 'settings.pinHint', l: 'PIN hint (shown if you forget it)', t: 'text' }
      ]
    }
  ];

  /* ---------------- state ---------------- */
  var working = null;      // editable copy of the vault data
  var workingPublic = null; // editable copy of the public config
  var currentTab = 'profile';
  var openItems = {};

  /* ---------------- field rendering ---------------- */

  function fieldHtml(f, value, pathAttr) {
    var id = 'f_' + (pathAttr || (f.k || f.p)).replace(/[^\w]/g, '_');
    var label = '<label for="' + id + '">' + esc(f.l) + '</label>';
    var common = 'id="' + id + '" ' + pathAttr;

    switch (f.t) {
      case 'textarea':
        return '<div class="field">' + label +
          '<textarea ' + common + ' rows="3" placeholder="' + esc(f.ph || '') + '">' + esc(value || '') + '</textarea>' +
          (f.hint ? '<span class="field__hint">' + esc(f.hint) + '</span>' : '') + '</div>';

      case 'select':
        var opts = (f.o || []).map(function (o) {
          return '<option value="' + esc(o) + '"' + ((String(value || '') === String(o)) ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('');
        return '<div class="field">' + label + '<select ' + common + '>' + opts + '</select></div>';

      case 'checkbox':
        return '<div class="field check">' +
          '<input type="checkbox" ' + common + (value ? ' checked' : '') + '>' +
          '<label for="' + id + '">' + esc(f.l) + '</label></div>';

      case 'tags':
        var arr = Array.isArray(value) ? value : [];
        var tagsHtml = arr.map(function (t, i) {
          return '<span class="tag">' + esc(t) + '<button type="button" data-tagdel="' + pathAttr + '" data-tagi="' + i + '" aria-label="Remove">×</button></span>';
        }).join('');
        return '<div class="field">' + label +
          '<input type="text" ' + common + ' data-tags="1" placeholder="' + esc(f.ph || 'Type and press Enter') + '">' +
          '<div class="tags" data-taglist="' + pathAttr + '">' + tagsHtml + '</div></div>';

      case 'image':
        var img = value
          ? '<img src="' + esc(value) + '" alt="">'
          : '<img src="data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22%3E%3Crect width=%2264%22 height=%2264%22 fill=%22%23eee%22/%3E%3C/svg%3E" alt="">';
        return '<div class="field">' + label +
          '<div class="imgpick">' + img +
          '<div><input type="file" accept="image/*" ' + common + ' data-image="1">' +
          (value ? '<button type="button" class="minibtn minibtn--danger" data-imgclear="' + pathAttr + '">Remove photo</button>' : '') +
          '</div></div>' +
          '<span class="field__hint">' + esc(f.hint || '') + '</span></div>';

      default:
        var type = f.t === 'tel' ? 'tel' : (f.t === 'email' ? 'email' : (f.t === 'number' ? 'number' : (f.t === 'url' ? 'url' : (f.t === 'date' ? 'date' : 'text'))));
        return '<div class="field">' + label +
          '<input type="' + type + '" ' + common + ' value="' + esc(value == null ? '' : value) + '" placeholder="' + esc(f.ph || '') + '">' +
          (f.hint ? '<span class="field__hint">' + esc(f.hint) + '</span>' : '') + '</div>';
    }
  }

  function renderFields(fields, obj) {
    return fields.map(function (f) {
      return fieldHtml(f, getPath(obj, f.p), 'data-path="' + esc(f.p) + '"');
    }).join('');
  }

  function renderListItem(listName, item, index, total, tab) {
    var title = tab.title(item);
    var sub = tab.sub ? tab.sub(item) : '';
    var key = listName + ':' + index;
    var open = !!openItems[key];
    var body = tab.fields.map(function (f) {
      return fieldHtml(f, item[f.k], 'data-list="' + esc(listName) + '" data-idx="' + index + '" data-key="' + esc(f.k) + '"');
    }).join('');

    return '<div class="item' + (open ? ' open' : '') + '" data-itemkey="' + esc(key) + '">' +
      '<div class="item__head" data-toggleitem="' + esc(key) + '">' +
      '<span>' + esc(title) + (sub ? ' <small>' + esc(sub) + '</small>' : '') + '</span>' +
      '<div class="item__tools">' +
      '<button type="button" class="minibtn" data-up="' + esc(listName) + '" data-idx="' + index + '"' + (index === 0 ? ' disabled' : '') + '>↑</button>' +
      '<button type="button" class="minibtn" data-down="' + esc(listName) + '" data-idx="' + index + '"' + (index === total - 1 ? ' disabled' : '') + '>↓</button>' +
      '<button type="button" class="minibtn minibtn--danger" data-del="' + esc(listName) + '" data-idx="' + index + '">✕</button>' +
      '</div></div>' +
      '<div class="item__body"' + (open ? '' : ' hidden') + '>' + body + '</div>' +
      '</div>';
  }

  function renderTab(tab) {
    if (tab.type === 'fields') {
      return '<div class="form">' +
        '<div class="fgroup__title">' + esc(tab.label) + '</div>' +
        renderFields(tab.fields, working) +
        '</div>';
    }
    var arr = working[tab.list] || [];
    if (!Array.isArray(arr)) arr = [];
    return '<div class="form">' +
      '<div class="fgroup__title">' + esc(tab.label) + '</div>' +
      (arr.length ? arr.map(function (it, i) { return renderListItem(tab.list, it, i, arr.length, tab); }).join('')
        : '<p class="muted">Nothing here yet.</p>') +
      '<button type="button" class="addbtn" data-add="' + esc(tab.list) + '">＋ ' + esc(tab.add) + '</button>' +
      '</div>';
  }

  function renderTabs() {
    $('#editorTabs').innerHTML = TABS.map(function (t) {
      return '<button type="button" class="stab' + (t.id === currentTab ? ' on' : '') + '" data-tab="' + t.id + '">' + t.label + '</button>';
    }).join('');
  }

  function renderBody() {
    var tab = TABS.filter(function (t) { return t.id === currentTab; })[0] || TABS[0];
    $('#editorBody').innerHTML = renderTab(tab);
    $('#editorBody').scrollTop = 0;
  }

  /* ---------------- actions ---------------- */

  function open() {
    var data = global.Vault.get();
    if (!data) { global.App.toast('Unlock first'); return; }
    working = JSON.parse(JSON.stringify(data));
    workingPublic = JSON.parse(JSON.stringify(global.Vault.getPublic()));
    currentTab = 'profile';
    openItems = {};
    renderTabs();
    renderBody();
    $('#editor').hidden = false;
  }

  function close() {
    $('#editor').hidden = true;
    working = null;
  }

  async function save() {
    if (!working) return;
    working.meta = working.meta || {};
    working.meta.updatedAt = new Date().toISOString();
    working.meta.sample = false;
    global.Vault.state.data = working;
    try {
      await global.Vault.save();
    } catch (e) {
      global.App.toast('Could not save: ' + e.message);
      return;
    }
    syncPublic();
    global.App.render();
    global.App.toast('Saved on this device');
    close();
  }

  /** Mirror the site-level settings into the public config (data/public.json). */
  function syncPublic() {
    if (!workingPublic || !working) return;
    var s = working.settings || {};
    if (s.siteTitle) workingPublic.siteTitle = s.siteTitle;
    if (s.siteTagline) workingPublic.siteTagline = s.siteTagline;
    if (s.pinHint !== undefined) workingPublic.pinHint = s.pinHint;
    workingPublic.emergencyNumbers = (working.emergencyNumbers || []).filter(function (n) {
      return n.public !== false;
    });
    global.Vault.state.public = workingPublic;
  }

  function currentList(name) {
    if (!working[name]) working[name] = [];
    return working[name];
  }

  /* ---------------- events ---------------- */

  function bind() {
    var body = $('#editorBody');
    var tabs = $('#editorTabs');

    tabs.addEventListener('click', function (e) {
      var b = e.target.closest('[data-tab]');
      if (!b) return;
      currentTab = b.getAttribute('data-tab');
      renderTabs();
      renderBody();
    });

    body.addEventListener('input', function (e) {
      var el = e.target;

      if (el.hasAttribute('data-path')) {
        var v = el.type === 'checkbox' ? el.checked : el.value;
        setPath(working, el.getAttribute('data-path'), v);
        return;
      }
      if (el.hasAttribute('data-list')) {
        var list = currentList(el.getAttribute('data-list'));
        var idx = parseInt(el.getAttribute('data-idx'), 10);
        var key = el.getAttribute('data-key');
        if (list[idx]) list[idx][key] = el.type === 'checkbox' ? el.checked : el.value;
        return;
      }
      if (el.hasAttribute('data-tags')) {
        // commit on Enter or comma
        if (e.key === 'Enter' || e.key === ',') {
          e.preventDefault();
          commitTag(el);
        }
        return;
      }
      if (el.hasAttribute('data-image') && el.files && el.files[0]) {
        readImage(el);
      }
    });

    body.addEventListener('change', function (e) {
      var el = e.target;
      if (el.hasAttribute('data-image') && el.files && el.files[0]) readImage(el);
    });

    body.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && e.target.hasAttribute('data-tags')) {
        e.preventDefault();
        commitTag(e.target);
      }
    });

    body.addEventListener('paste', function (e) {
      var el = e.target;
      if (el.hasAttribute('data-image')) {
        var items = e.clipboardData && e.clipboardData.items;
        if (items) {
          for (var i = 0; i < items.length; i++) {
            if (items[i].type.indexOf('image') === 0) {
              e.preventDefault();
              var file = items[i].getAsFile();
              readImageFile(file, el);
              return;
            }
          }
        }
      }
    });

    body.addEventListener('click', function (e) {
      var t;

      t = e.target.closest('[data-toggleitem]');
      if (t) {
        var key = t.getAttribute('data-toggleitem');
        openItems[key] = !openItems[key];
        renderBody();
        return;
      }

      t = e.target.closest('[data-add]');
      if (t) {
        var listName = t.getAttribute('data-add');
        var list = currentList(listName);
        list.push(listName === 'notes' ? { text: '' } : {});
        openItems[listName + ':' + (list.length - 1)] = true;
        renderBody();
        return;
      }

      t = e.target.closest('[data-del]');
      if (t) {
        var dl = currentList(t.getAttribute('data-del'));
        dl.splice(parseInt(t.getAttribute('data-idx'), 10), 1);
        renderBody();
        return;
      }

      t = e.target.closest('[data-up], [data-down]');
      if (t) {
        var ln = t.getAttribute('data-up') || t.getAttribute('data-down');
        var lst = currentList(ln);
        var i = parseInt(t.getAttribute('data-idx'), 10);
        var j = t.hasAttribute('data-up') ? i - 1 : i + 1;
        if (j < 0 || j >= lst.length) return;
        var tmp = lst[i]; lst[i] = lst[j]; lst[j] = tmp;
        renderBody();
        return;
      }

      t = e.target.closest('[data-tagdel]');
      if (t) {
        var path = t.getAttribute('data-tagdel');
        var arr = getPath(working, path) || [];
        arr.splice(parseInt(t.getAttribute('data-tagi'), 10), 1);
        setPath(working, path, arr);
        renderBody();
        return;
      }

      t = e.target.closest('[data-imgclear]');
      if (t) {
        setPath(working, t.getAttribute('data-imgclear'), '');
        renderBody();
        return;
      }
    });

    /* sheet chrome */
    $('#editor').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'editor-close') close();
      else if (a === 'editor-save') save();
      else if (a === 'editor-reset') {
        if (confirm('Replace everything with the original sample data?')) {
          global.Vault.loadSample().then(function (sample) {
            working = sample;
            currentTab = 'profile';
            renderTabs();
            renderBody();
            global.App.toast('Sample data restored — press Save to apply');
          }).catch(function () {
            global.App.toast('Could not load the sample data');
          });
        }
      }
    });
  }

  function commitTag(input) {
    var path = input.getAttribute('data-path');
    var val = input.value.replace(/,$/, '').trim();
    if (!val) return;
    var arr = getPath(working, path) || [];
    if (arr.indexOf(val) === -1) arr.push(val);
    setPath(working, path, arr);
    input.value = '';
    renderBody();
  }

  function readImage(input) { readImageFile(input.files[0], input); }

  function readImageFile(file, input) {
    if (!file) return;
    if (file.size > 900000) { global.App.toast('Pick a smaller image (under 900 KB)'); return; }
    var reader = new FileReader();
    reader.onload = function (e) {
      var path = input.getAttribute('data-path');
      setPath(working, path, e.target.result);
      renderBody();
    };
    reader.readAsDataURL(file);
  }

  global.Editor = {
    open: open,
    close: close,
    save: save,
    bind: bind,
    TABS: TABS
  };
})(window);
