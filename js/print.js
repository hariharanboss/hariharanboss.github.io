/* ==========================================================
   GetNumber — print.js
   Builds the A4 family-emergency sheet and the cut-out
   wallet card (85.6 × 54 mm) with a QR code.
   ========================================================== */
(function (global) {
  'use strict';

  var doc = global.document;
  var $ = function (s, r) { return (r || doc).querySelector(s); };
  var esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };

  var mode = 'full';

  function siteUrl() {
    var data = global.Vault.get() || {};
    var url = (data.settings || {}).siteUrl || '';
    if (!url) url = global.location.href.split('#')[0];
    return url;
  }

  function primaryContact(data) {
    var list = (data.contacts || []).slice().sort(function (a, b) {
      return (a.priority || 99) - (b.priority || 99);
    });
    return list[0] || null;
  }

  /* ---------------- A4 sheet ---------------- */

  function buildSheet(data) {
    var p = data.profile || {};
    var m = data.medical || {};
    var pr = data.property || {};
    var home = pr.home || {}, veh = pr.vehicle || {}, docs = pr.documents || {};
    var url = siteUrl();
    var name = p.fullName || 'Emergency Information';

    var ems = (data.emergencyNumbers || []).map(function (n) {
      return '<div class="pcall"><span class="pcall__role">' + esc(n.label) + '</span>' +
        '<span class="pcall__name">' + esc(n.note || '') + '</span>' +
        '<span class="pcall__num">' + esc(n.number) + '</span></div>';
    }).join('');

    function kv(k, v) {
      if (!v) return '';
      return '<div class="pckv"><span class="pckv__k">' + esc(k) + '</span><span class="pckv__v">' + esc(v) + '</span></div>';
    }

    var addr = [p.address && p.address.line1, p.address && p.address.area, p.address && p.address.city,
      p.address && p.address.state, p.address && p.address.pincode, p.address && p.address.country]
      .filter(Boolean).join(', ');

    var contacts = (data.contacts || []).slice()
      .sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); })
      .map(function (c) {
        return '<div class="pcall"><span class="pcall__role">' + esc(c.relation || '') + '</span>' +
          '<span class="pcall__name">' + esc(c.name) +
          ((c.forWhat && c.forWhat.length) ? ' <small>(' + esc(c.forWhat.join(', ')) + ')</small>' : '') +
          '</span>' +
          '<span class="pcall__num">' + esc(c.phone || '') + '</span></div>';
      }).join('');

    var roles = (data.directory || []).map(function (d) {
      return '<div class="pcall"><span class="pcall__role">' + esc(d.label) + '</span>' +
        '<span class="pcall__name">' + esc(d.name) + '</span>' +
        '<span class="pcall__num">' + esc(d.phone || '') + '</span></div>';
    }).join('');

    var notes = (data.notes || []).map(function (n) {
      return '<span class="pctag">' + esc(n.text || n) + '</span>';
    }).join('');

    var photoHtml = p.photo
      ? '<img class="wallet__photo" src="' + esc(p.photo) + '" alt="">'
      : '<div class="wallet__photo wallet__photo--ph">' + esc(global.App.initials(name)) + '</div>';

    var primary = primaryContact(data);
    var allergies = (p.allergies || []).filter(Boolean);

    return '<div class="pcsheet">' +
      '<div class="pchead">' +
      '<div class="pchead__logo">112</div>' +
      '<div class="pchead__txt"><h1>' + esc(name) + ' — Emergency Information</h1>' +
      '<p>' + esc((p.bloodGroup ? 'Blood group ' + p.bloodGroup + ' · ' : '') +
        (p.dob ? 'Born ' + global.App.fmtDate(p.dob) + ' · ' : '') +
        (p.languages ? p.languages : '')) + '</p></div>' +
      '<div class="pcsos"><b>112</b><span>All-in-one<br>emergency</span></div>' +
      '</div>' +

      '<div class="pcgrid">' +

      '<div class="pcsec"><h2>Emergency numbers</h2>' + ems + '</div>' +

      '<div class="pcsec"><h2>Personal details</h2>' +
      kv('Blood group', p.bloodGroup) +
      kv('Gender', p.gender) +
      kv('Nationality', p.nationality) +
      kv('Languages', p.languages) +
      kv('Allergies', allergies.join(', ')) +
      kv('Address', addr) +
      kv('Landmark', p.landmark) +
      kv('Note', p.emergencyNote) +
      '</div>' +

      '<div class="pcsec"><h2>Medical</h2>' +
      kv('Conditions', (m.conditions || []).join(', ')) +
      kv('Medications', (m.medications || []).join(', ')) +
      kv('Doctor', (m.doctor || {}).name + (m.doctor || {}).clinic ? ((m.doctor || {}).name || '') + ' — ' + ((m.doctor || {}).clinic || '') : '') +
      kv('Doctor phone', (m.doctor || {}).phone) +
      kv('Hospital', (m.hospital || {}).name) +
      kv('Hospital addr', (m.hospital || {}).address) +
      kv('Insurance', [(m.insurance || {}).provider, (m.insurance || {}).policyNo].filter(Boolean).join(' · ')) +
      kv('Notes', m.notes) +
      '</div>' +

      '<div class="pcsec"><h2>Who to call for what</h2>' + (roles || '<p class="pcfine">—</p>') + '</div>' +

      '<div class="pcsec full"><h2>Contacts</h2>' + (contacts || '<p class="pcfine">—</p>') + '</div>' +

      '<div class="pcsec"><h2>Home</h2>' +
      kv('Landlord', home.landlord) +
      kv('Manager', home.buildingManager || home.society) +
      kv('Wi-Fi', home.wifi ? home.wifi + (home.wifiHint ? ' (' + home.wifiHint + ')' : '') : '') +
      '</div>' +

      '<div class="pcsec"><h2>Vehicle &amp; documents</h2>' +
      kv('Vehicle', [veh.make, veh.model, veh.color, veh.regNo].filter(Boolean).join(' · ')) +
      kv('Insurer', [veh.insurer, veh.policyNo].filter(Boolean).join(' · ')) +
      kv('Towing', veh.towPhone) +
      kv('Licence', docs.licenseNo) +
      kv('Passport', docs.passportNo) +
      '</div>' +

      (notes ? '<div class="pcsec full"><h2>Notes</h2><div>' + notes + '</div></div>' : '') +

      '</div>' +

      '<p class="pcfine" style="position:absolute;left:11mm;bottom:6mm">' +
      'GetNumber · ' + esc(url) + ' · printed ' + esc(new Date().toLocaleDateString()) + '</p>' +
      '</div>';
  }

  /* ---------------- wallet card ---------------- */

  function buildCards(data) {
    var p = data.profile || {};
    var m = data.medical || {};
    var pr = data.property || {};
    var url = siteUrl();
    var name = p.fullName || 'Emergency Information';
    var primary = primaryContact(data);
    var allergies = (p.allergies || []).filter(Boolean);
    var addr = [p.address && p.address.line1, p.address && p.address.area, p.address && p.address.city,
      p.address && p.address.pincode].filter(Boolean).join(', ');

    var qrSvg = '';
    try {
      qrSvg = global.QR.toSvg(url, { ecl: 'M', quiet: 1, pixelSize: 4, dark: '#000000', light: '#ffffff' });
    } catch (e) {
      qrSvg = '';
    }

    var photoHtml = p.photo
      ? '<img class="wallet__photo" src="' + esc(p.photo) + '" alt="">'
      : '<div class="wallet__photo wallet__photo--ph">' + esc(global.App.initials(name)) + '</div>';

    var front =
      '<div class="wallet"><div class="wallet__stripe"></div><div class="wallet__body">' +
      '<div class="wallet__head">' + photoHtml +
      '<div class="wallet__id"><div class="wallet__name">' + esc(name) + '</div>' +
      '<div class="wallet__meta">' + esc([p.dob ? 'b. ' + global.App.fmtDate(p.dob) : '',
        p.gender, p.languages].filter(Boolean).join(' · ')) + '</div></div>' +
      (p.bloodGroup ? '<div class="wallet__blood">' + esc(p.bloodGroup) + '</div>' : '') +
      '</div>' +
      (allergies.length ? '<div class="wallet__allergy">⚠ Allergy: ' + esc(allergies.join(', ')) + '</div>' : '') +
      (primary ? '<div class="wallet__row"><span class="wallet__label">Call first</span>' +
        '<span class="wallet__val">' + esc(primary.name) + ' <small>' + esc(primary.relation || '') + '</small> · ' + esc(primary.phone || '') + '</span></div>' : '') +
      (addr ? '<div class="wallet__row"><span class="wallet__label">Address</span>' +
        '<span class="wallet__val">' + esc(addr) + '</span></div>' : '') +
      '<div class="wallet__bottom">' +
      '<div class="wallet__sos"><b>112</b><span>All-in-one emergency</span></div>' +
      (qrSvg ? '<div class="wallet__qr">' + qrSvg + '</div>' : '') +
      '</div>' +
      '<div class="wallet__foot"><span>Scan for my contacts</span><span>' + esc(url.replace(/^https?:\/\//, '')) + '</span></div>' +
      '</div></div>';

    var roleList = (data.directory || []).slice(0, 4).map(function (d) {
      return '<li><span class="r">' + esc(d.label) + '</span><span class="v">' + esc(d.name) +
        (d.phone ? ' · ' + esc(d.phone) : '') + '</span></li>';
    }).join('');

    var contactList = (data.contacts || []).slice()
      .sort(function (a, b) { return (a.priority || 99) - (b.priority || 99); })
      .slice(0, 4)
      .map(function (c) {
        return '<li><span class="r">' + esc(c.relation || 'Contact') + '</span><span class="v">' + esc(c.name) +
          (c.phone ? ' · ' + esc(c.phone) : '') + '</span></li>';
      }).join('');

    // only show medical rows that actually have a value
    var medRows = [];
    function mrow(k, v) {
      if (!v) return;
      medRows.push('<li><span class="r">' + esc(k) + '</span><span class="v">' + esc(v) + '</span></li>');
    }
    mrow('Blood', p.bloodGroup);
    mrow('Allergies', allergies.join(', '));
    mrow('Conditions', (m.conditions || []).join(', '));
    mrow('Medications', (m.medications || []).join(', '));
    mrow('Doctor', (m.doctor || {}).name ? ((m.doctor || {}).name + ((m.doctor || {}).phone ? ' · ' + m.doctor.phone : '')) : '');

    var back =
      '<div class="wallet wallet--back"><div class="wallet__stripe"></div><div class="wallet__body">' +
      '<div class="wallet__head2"><h3>Who to call for what</h3></div>' +
      '<ul class="wallet__list">' + (roleList || contactList || '<li><span class="v">—</span></li>') + '</ul>' +
      '<div class="wallet__head2" style="margin-top:1.6mm"><h3>Medical</h3></div>' +
      '<ul class="wallet__list">' + (medRows.join('') || '<li><span class="v">—</span></li>') + '</ul>' +
      '<div class="wallet__foot"><span>Emergency 112 · Police 100 · Fire 101 · Ambulance 102</span></div>' +
      '</div></div>';

    return '<div class="pccards">' + front + back + '</div>';
  }

  /* ---------------- orchestration ---------------- */

  function build() {
    var data = global.Vault.get();
    if (!data) return;
    $('#printRoot').innerHTML = buildSheet(data) + buildCards(data);
  }

  function open() {
    build();
    $('#printOptions').innerHTML =
      '<div class="panel"><h3>What to print</h3>' +
      '<p>The A4 sheet has every detail. The wallet card is exactly 85.6 × 54 mm — cut it out and keep it in your wallet. Print on plain paper or card stock.</p>' +
      '<div class="field"><label for="printMode">Mode</label><select id="printMode">' +
      '<option value="full">Everything (A4 sheet + 2 wallet cards)</option>' +
      '<option value="sheet">A4 sheet only</option>' +
      '<option value="card">Wallet card only</option>' +
      '</select></div>' +
      '<div class="sheet__foot-actions"><button class="btn btn--primary btn--sm" data-act="print-now">Print now</button></div>' +
      '</div>' +
      '<div class="panel"><h3>Tip</h3><p>When the print dialog opens, set <b>Scale to 100%</b> (not "Fit to page") so the card comes out at exactly 85.6 × 54 mm. Turn off "Headers and footers".</p></div>';
    $('#printModal').hidden = false;
  }

  function close() { $('#printModal').hidden = true; }

  function printNow() {
    var sel = $('#printMode');
    mode = sel ? sel.value : 'full';
    doc.body.setAttribute('data-print', mode);
    build();
    global.setTimeout(function () {
      global.print();
      global.setTimeout(function () { doc.body.removeAttribute('data-print'); }, 800);
    }, 120);
  }

  function bind() {
    $('#printModal').addEventListener('click', function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');
      if (a === 'print-close') close();
      else if (a === 'print-now') printNow();
    });
  }

  global.Printer = { open: open, close: close, printNow: printNow, build: build, bind: bind };
})(window);
