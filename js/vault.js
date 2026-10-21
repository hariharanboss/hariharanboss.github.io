/* ==========================================================
   GetNumber — vault.js
   Loads the encrypted vault, unlocks it, keeps the key in RAM
   only, and re-seals it on save.

   File layout of data/vault.enc.json:
   {
     "v": 1,
     "updatedAt": "2026-10-21T10:00:00.000Z",
     "primary":  { "kdf": {...}, "cipher": {...}, "data": "..." },   // PIN
     "recovery": { "kdf": {...}, "cipher": {...}, "data": "..." }    // optional passphrase
   }
   ========================================================== */
(function (global) {
  'use strict';

  var CB = global.CryptoBox;
  var VAULT_URL = 'data/vault.enc.json';
  var PUBLIC_URL = 'data/public.json';
  var LS_VAULT = 'getnumber.vault.enc';
  var LS_PUB = 'getnumber.public.json';

  var state = {
    envelope: null,   // parsed vault file
    key: null,        // CryptoKey (RAM only)
    data: null,       // decrypted object
    public: null,     // plaintext public config
    pending: false,   // local (unpublished) copy exists
    busy: false
  };

  /* ---------------- storage helpers ---------------- */

  function lsGet(key) {
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function lsSet(key, val) {
    try { global.localStorage.setItem(key, val); } catch (e) { /* private mode */ }
  }
  function lsDel(key) {
    try { global.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  }

  /* ---------------- loading ---------------- */

  async function fetchJSON(url) {
    var res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load ' + url + ' (' + res.status + ')');
    return res.json();
  }

  function isValidEnvelope(env) {
    return !!(env && env.v === 1 && env.primary &&
      env.primary.kdf && env.primary.kdf.salt && env.primary.cipher && env.primary.cipher.iv &&
      env.primary.data);
  }

  /**
   * Load the public config + the encrypted vault.
   * Network first (so updates land), falling back to cache.
   */
  async function load() {
    // ---- public (plaintext) config ----
    try {
      var pub = await fetchJSON(PUBLIC_URL);
      state.public = pub;
      lsSet(LS_PUB, JSON.stringify(pub));
    } catch (e) {
      var cached = lsGet(LS_PUB);
      state.public = cached ? JSON.parse(cached) : defaultPublic();
    }

    // ---- encrypted vault ----
    var remote = null;
    try {
      remote = await fetchJSON(VAULT_URL);
    } catch (e) {
      remote = null;
    }

    var local = null;
    var localRaw = lsGet(LS_VAULT);
    if (localRaw) {
      try { local = JSON.parse(localRaw); } catch (e2) { local = null; }
    }

    if (remote && isValidEnvelope(remote)) {
      state.envelope = remote;
      state.pending = false;
      // keep a local copy for offline use
      lsSet(LS_VAULT, JSON.stringify(remote));
      if (local && isValidEnvelope(local) && isNewer(local, remote)) {
        // local has newer unpublished edits — prefer them
        state.envelope = local;
        state.pending = true;
      }
    } else if (local && isValidEnvelope(local)) {
      state.envelope = local;
      state.pending = true;
    } else if (remote) {
      throw new Error('The vault file is malformed. Restore data/vault.enc.json from a backup.');
    } else {
      throw new Error('Could not load the encrypted vault. Check your connection, or restore data/vault.enc.json.');
    }
    return state.envelope;
  }

  function isNewer(a, b) {
    var ta = Date.parse(a.updatedAt || 0) || 0;
    var tb = Date.parse(b.updatedAt || 0) || 0;
    return ta > tb;
  }

  function defaultPublic() {
    return {
      siteTitle: 'GetNumber',
      siteTagline: 'Emergency information',
      pinHint: '',
      showOnLockScreen: true,
      emergencyNumbers: []
    };
  }

  /* ---------------- unlock / lock ---------------- */

  async function trySection(secret, section) {
    var salt = CB.fromB64(section.kdf.salt);
    var iterations = section.kdf.iterations || CB.DEFAULT_ITERATIONS;
    var key = await CB.deriveKey(secret, salt, iterations);
    var data = await CB.open(key, section);
    return { key: key, data: data };
  }

  /**
   * Unlock with the PIN. Falls back to the recovery passphrase if present.
   * Throws on failure.
   */
  async function unlock(pin) {
    if (!state.envelope) throw new Error('Vault not loaded');
    var attempts = [];
    attempts.push({ secret: pin, section: state.envelope.primary, kind: 'pin' });
    if (state.envelope.recovery) {
      attempts.push({ secret: pin, section: state.envelope.recovery, kind: 'recovery' });
    }

    var lastErr = null;
    for (var i = 0; i < attempts.length; i++) {
      try {
        var r = await trySection(attempts[i].secret, attempts[i].section);
        state.key = r.key;
        state.data = r.data;
        state.unlockedWith = attempts[i].kind;
        return r.data;
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Incorrect PIN');
  }

  function lock() {
    state.key = null;
    state.data = null;
    state.unlockedWith = null;
  }

  function isUnlocked() { return !!state.key && !!state.data; }
  function get() { return state.data; }
  function getPublic() { return state.public || defaultPublic(); }
  function isPending() { return state.pending; }

  /* ---------------- sealing / saving ---------------- */

  /** Re-seal the current data with the in-memory key. Returns a new envelope section. */
  async function sealCurrent() {
    if (!state.key) throw new Error('Vault is locked');
    var salt = CB.fromB64(state.envelope.primary.kdf.salt);
    var iterations = state.envelope.primary.kdf.iterations || CB.DEFAULT_ITERATIONS;
    var section = await CB.seal(state.key, salt, iterations, state.data);
    return section;
  }

  /** Save edits: re-seal, update the envelope, cache locally, mark pending. */
  async function save() {
    var section = await sealCurrent();
    state.envelope.primary = section;
    state.envelope.updatedAt = new Date().toISOString();
    state.envelope.updatedBy = 'pin';
    lsSet(LS_VAULT, JSON.stringify(state.envelope));
    state.pending = true;
    return state.envelope;
  }

  /** Change the PIN: new salt + new key, re-seal. */
  async function changePin(newPin) {
    if (!state.key) throw new Error('Vault is locked');
    var salt = CB.randomBytes(16);
    var iterations = CB.DEFAULT_ITERATIONS;
    var key = await CB.deriveKey(newPin, salt, iterations);
    var section = await CB.seal(key, salt, iterations, state.data);
    state.envelope.primary = section;
    state.envelope.updatedAt = new Date().toISOString();
    state.envelope.updatedBy = 'pin';
    state.key = key;
    state.unlockedWith = 'pin';
    lsSet(LS_VAULT, JSON.stringify(state.envelope));
    state.pending = true;
    return state.envelope;
  }

  /** Add (or replace) a recovery passphrase that can open the same data. */
  async function setRecoveryPassphrase(pass) {
    if (!state.data) throw new Error('Vault is locked');
    var salt = CB.randomBytes(16);
    var iterations = CB.DEFAULT_ITERATIONS;
    var key = await CB.deriveKey(pass, salt, iterations);
    var section = await CB.seal(key, salt, iterations, state.data);
    state.envelope.recovery = section;
    state.envelope.updatedAt = new Date().toISOString();
    lsSet(LS_VAULT, JSON.stringify(state.envelope));
    state.pending = true;
    return state.envelope;
  }

  function removeRecovery() {
    if (!state.envelope) return;
    delete state.envelope.recovery;
    state.envelope.updatedAt = new Date().toISOString();
    lsSet(LS_VAULT, JSON.stringify(state.envelope));
    state.pending = true;
  }

  function hasRecovery() {
    return !!(state.envelope && state.envelope.recovery);
  }

  /** Replace the vault with one imported from a file. Requires re-unlock. */
  async function importEnvelope(env) {
    if (!isValidEnvelope(env)) throw new Error('That file is not a valid vault backup.');
    state.envelope = env;
    state.key = null;
    state.data = null;
    lsSet(LS_VAULT, JSON.stringify(env));
    state.pending = true;
    return env;
  }

  /** Build the JSON text that should be written to data/vault.enc.json. */
  function exportText() {
    return JSON.stringify(state.envelope, null, 2);
  }

  /** Load the shipped sample profile (plaintext) so the editor can reset to it. */
  async function loadSample() {
    var res = await fetch('data/sample.json', { cache: 'no-cache' });
    if (!res.ok) throw new Error('Could not load data/sample.json');
    return res.json();
  }

  global.Vault = {
    VAULT_URL: VAULT_URL,
    PUBLIC_URL: PUBLIC_URL,
    state: state,
    loadSample: loadSample,
    load: load,
    unlock: unlock,
    lock: lock,
    isUnlocked: isUnlocked,
    get: get,
    getPublic: getPublic,
    isPending: isPending,
    save: save,
    changePin: changePin,
    setRecoveryPassphrase: setRecoveryPassphrase,
    removeRecovery: removeRecovery,
    hasRecovery: hasRecovery,
    importEnvelope: importEnvelope,
    exportText: exportText,
    isValidEnvelope: isValidEnvelope
  };
})(window);
