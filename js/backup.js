/* ==========================================================
   GetNumber — backup.js
   Publish, back up, import, and manage the PIN.
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

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = doc.createElement('a');
    a.href = url;
    a.download = filename;
    doc.body.appendChild(a);
    a.click();
    doc.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  /* ---------------- panel content ---------------- */

  function build() {
    var data = global.Vault.get() || {};
    var pending = global.Vault.isPending();

    var html = '';

    html += '<div class="panel' + (pending ? '' : ' panel--danger') + '">' +
      '<h3>1 · Publish your changes</h3>' +
      '<p>The vault is encrypted. To publish, download the two files below and replace them in the project folder, then push to GitHub.</p>' +
      '<div class="row"><div class="row__k">vault</div><div class="row__v"><code>data/vault.enc.json</code></div></div>' +
      '<div class="row"><div class="row__k">public</div><div class="row__v"><code>data/public.json</code></div></div>' +
      '<div class="sheet__foot-actions">' +
      '<button class="btn btn--primary btn--sm" data-act="dl-vault">Download vault.enc.json</button>' +
      '<button class="btn btn--ghost btn--sm" data-act="dl-public">Download public.json</button>' +
      '</div>' +
      (pending ? '<p class="tiny" style="color:var(--ok)">✓ You have unpublished changes on this device.</p>'
        : '<p class="tiny">Everything is published.</p>') +
      '</div>';

    html += '<div class="panel">' +
      '<h3>2 · Backups you can read</h3>' +
      '<p>Encrypted backups are safe to keep anywhere. A plaintext backup is readable by anyone who opens it — keep it somewhere private.</p>' +
      '<div class="sheet__foot-actions">' +
      '<button class="btn btn--ghost btn--sm" data-act="dl-plain">Download plain-text backup</button>' +
      '<button class="btn btn--ghost btn--sm" data-act="dl-html">Download readable HTML copy</button>' +
      '</div></div>';

    html += '<div class="panel">' +
      '<h3>3 · Restore</h3>' +
      '<p>Import a <code>vault.enc.json</code> backup to replace what is on this device. You will need the PIN to open it afterwards.</p>' +
      '<input type="file" accept="application/json,.json" data-act="import-file">' +
      '</div>';

    html += '<div class="panel">' +
      '<h3>4 · Security</h3>' +
      '<p>Your PIN unlocks the encrypted data. Change it if anyone might guess it — a 6-digit PIN can be brute-forced if your backup leaks.</p>' +
      '<div class="field"><label for="newPin">New 6-digit PIN</label>' +
      '<input type="password" id="newPin" inputmode="numeric" maxlength="6" placeholder="••••••"></div>' +
      '<div class="field"><label for="newPin2">Repeat PIN</label>' +
      '<input type="password" id="newPin2" inputmode="numeric" maxlength="6" placeholder="••••••"></div>' +
      '<div class="sheet__foot-actions">' +
      '<button class="btn btn--primary btn--sm" data-act="change-pin">Change PIN</button>' +
      '</div>' +
      '<hr class="divider">' +
      '<p>A <strong>recovery passphrase</strong> is a long phrase (4+ words) that can also unlock the vault. Use it if you ever forget the PIN — store it somewhere completely separate.</p>' +
      '<div class="field"><label for="recoveryPass">Recovery passphrase</label>' +
      '<input type="password" id="recoveryPass" placeholder="e.g. mango kettle seven purple moon"></div>' +
      '<div class="sheet__foot-actions">' +
      '<button class="btn btn--ghost btn--sm" data-act="set-recovery">Set recovery passphrase</button>' +
      (global.Vault.hasRecovery()
        ? '<button class="btn btn--ghost btn--sm" data-act="rm-recovery">Remove it</button>' : '') +
      '</div>' +
      (global.Vault.hasRecovery() ? '<p class="tiny" style="color:var(--ok)">✓ A recovery passphrase is set.</p>' : '') +
      '</div>';

    html += '<div class="panel">' +
      '<h3>5 · This device</h3>' +
      '<p>Nothing is sent to any server. The encrypted vault is downloaded from the site, decrypted in your browser, and the key is discarded when you close the tab.</p>' +
      '<div class="sheet__foot-actions">' +
      '<button class="btn btn--ghost btn--sm" data-act="lock-now">Lock now</button>' +
      '</div></div>';

    $('#backupBody').innerHTML = html;
  }

  function open() {
    build();
    $('#backup').hidden = false;
  }
  function close() { $('#backup').hidden = true; }

  /* ---------------- actions ---------------- */

  async function changePin() {
    var p1 = ($('#newPin') || {}).value || '';
    var p2 = ($('#newPin2') || {}).value || '';
    if (!/^\d{6}$/.test(p1)) { global.App.toast('PIN must be exactly 6 digits'); return; }
    if (p1 !== p2) { global.App.toast('The two PINs do not match'); return; }
    try {
      await global.Vault.changePin(p1);
      global.App.toast('PIN changed');
      build();
    } catch (e) {
      global.App.toast('Could not change PIN: ' + e.message);
    }
  }

  async function setRecovery() {
    var pass = (($('#recoveryPass') || {}).value || '').trim();
    if (pass.length < 12) { global.App.toast('Use a longer phrase (12+ characters)'); return; }
    try {
      await global.Vault.setRecoveryPassphrase(pass);
      global.App.toast('Recovery passphrase set');
      build();
    } catch (e) {
      global.App.toast('Could not set it: ' + e.message);
    }
  }

  function plainBackupHTML() {
    var data = global.Vault.get() || {};
    var p = data.profile || {};
    var m = data.medical || {};
    var pr = data.property || {};
    var escH = function (s) {
      return String(s == null ? '' : s)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var lines = [];
    lines.push('<h1>' + escH(p.fullName || 'Emergency Information') + '</h1>');
    lines.push('<p><b>Blood group:</b> ' + escH(p.bloodGroup || '—') +
      ' &nbsp; <b>Allergies:</b> ' + escH((p.allergies || []).join(', ') || '—') + '</p>');
    lines.push('<h2>Emergency numbers</h2><ul>' +
      (data.emergencyNumbers || []).map(function (n) {
        return '<li><b>' + escH(n.number) + '</b> — ' + escH(n.label) + '</li>';
      }).join('') + '</ul>');
    lines.push('<h2>Contacts</h2><ul>' +
      (data.contacts || []).map(function (c) {
        return '<li><b>' + escH(c.name) + '</b> (' + escH(c.relation) + ') — ' + escH(c.phone) + '</li>';
      }).join('') + '</ul>');
    lines.push('<h2>Who to call for what</h2><ul>' +
      (data.directory || []).map(function (d) {
        return '<li><b>' + escH(d.label) + '</b> → ' + escH(d.name) + ' ' + escH(d.phone) + '</li>';
      }).join('') + '</ul>');
    lines.push('<h2>Medical</h2><ul>' +
      '<li>Conditions: ' + escH((m.conditions || []).join(', ') || '—') + '</li>' +
      '<li>Medications: ' + escH((m.medications || []).join(', ') || '—') + '</li>' +
      '<li>Doctor: ' + escH((m.doctor || {}).name || '—') + ' ' + escH((m.doctor || {}).phone || '') + '</li>' +
      '<li>Hospital: ' + escH((m.hospital || {}).name || '—') + '</li>' +
      '</ul>');
    var addr = [(p.address || {}).line1, (p.address || {}).area, (p.address || {}).city,
      (p.address || {}).state, (p.address || {}).pincode].filter(Boolean).join(', ');
    lines.push('<h2>Address</h2><p>' + escH(addr) + '</p>');
    var v = pr.vehicle || {};
    if (v.make || v.regNo) {
      lines.push('<h2>Vehicle</h2><p>' + escH([v.make, v.model, v.color, v.regNo].filter(Boolean).join(' · ')) + '</p>');
    }
    lines.push('<p style="font-size:11px;color:#666">Generated by GetNumber on ' + escH(stamp()) + '</p>');
    return '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
      escH(p.fullName || 'Emergency Information') + ' — Emergency details</title>' +
      '<style>body{font-family:system-ui,Arial,sans-serif;max-width:700px;margin:40px auto;padding:0 20px;color:#111;line-height:1.5}' +
      'h1{color:#b91c1c}h2{margin-top:26px;font-size:15px;text-transform:uppercase;letter-spacing:.5px;color:#b91c1c;border-bottom:1px solid #ddd;padding-bottom:4px}' +
      'ul{padding-left:18px}li{margin:4px 0}</style></head><body>' + lines.join('') + '</body></html>';
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    $('#backup').addEventListener('click', async function (e) {
      var b = e.target.closest('[data-act]');
      if (!b) return;
      var a = b.getAttribute('data-act');

      if (a === 'backup-close') { close(); }
      else if (a === 'dl-vault') {
        download('vault.enc.json', global.Vault.exportText());
        global.App.toast('vault.enc.json downloaded');
      }
      else if (a === 'dl-public') {
        download('public.json', JSON.stringify(global.Vault.getPublic(), null, 2));
        global.App.toast('public.json downloaded');
      }
      else if (a === 'dl-plain') {
        download('emergency-details-' + stamp() + '.json',
          JSON.stringify(global.Vault.get(), null, 2));
        global.App.toast('Plain-text backup downloaded');
      }
      else if (a === 'dl-html') {
        download('emergency-details-' + stamp() + '.html', plainBackupHTML(), 'text/html');
        global.App.toast('Readable copy downloaded');
      }
      else if (a === 'change-pin') { await changePin(); }
      else if (a === 'set-recovery') { await setRecovery(); }
      else if (a === 'rm-recovery') {
        global.Vault.removeRecovery();
        global.App.toast('Recovery passphrase removed');
        build();
      }
      else if (a === 'lock-now') { close(); global.App.lockNow(); }
    });

    $('#backup').addEventListener('change', async function (e) {
      var input = e.target.closest('[data-act="import-file"]');
      if (!input || !input.files || !input.files[0]) return;
      try {
        var text = await input.files[0].text();
        var env = JSON.parse(text);
        await global.Vault.importEnvelope(env);
        global.App.toast('Imported — enter your PIN');
        close();
        global.App.lockNow();
      } catch (err) {
        global.App.toast('Could not import: ' + err.message);
      }
    });
  }

  global.Backup = { open: open, close: close, bind: bind, download: download, plainBackupHTML: plainBackupHTML };
})(window);
