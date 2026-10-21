/* ==========================================================
   GetNumber — crypto.js
   Web Crypto primitives: PBKDF2 key derivation + AES-GCM.
   No dependencies. Works offline.
   ========================================================== */
(function (global) {
  'use strict';

  var enc = new TextEncoder();
  var dec = new TextDecoder();

  function requireSecureCrypto() {
    if (!global.crypto || !global.crypto.subtle) {
      var err = new Error(
        'Secure crypto is unavailable. Open this site over HTTPS (GitHub Pages) or on localhost.'
      );
      err.code = 'NO_CRYPTO';
      throw err;
    }
  }

  function randomBytes(n) {
    var a = new Uint8Array(n);
    global.crypto.getRandomValues(a);
    return a;
  }

  function toB64(bytes) {
    var arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    var s = '';
    for (var i = 0; i < arr.length; i++) s += String.fromCharCode(arr[i]);
    return global.btoa(s);
  }

  function fromB64(b64) {
    var bin = global.atob(String(b64).replace(/\s+/g, ''));
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function utf8(str) { return enc.encode(str); }

  /* ---------- key derivation ---------- */
  async function deriveKey(secret, saltBytes, iterations) {
    requireSecureCrypto();
    var base = await global.crypto.subtle.importKey(
      'raw', utf8(String(secret)), 'PBKDF2', false, ['deriveKey']
    );
    return global.crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt: saltBytes, iterations: iterations, hash: 'SHA-256' },
      base,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    );
  }

  /* ---------- AES-GCM ---------- */
  async function encryptBytes(key, plaintextBytes) {
    var iv = randomBytes(12);
    var ct = await global.crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: iv }, key, plaintextBytes
    );
    return { iv: iv, ciphertext: new Uint8Array(ct) };
  }

  async function decryptBytes(key, ivBytes, ciphertextBytes) {
    var pt;
    try {
      pt = await global.crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: ivBytes }, key, ciphertextBytes
      );
    } catch (e) {
      var err = new Error('Incorrect PIN');
      err.code = 'BAD_KEY';
      throw err;
    }
    return new Uint8Array(pt);
  }

  /* ---------- envelope helpers ----------
     envelope = {
       v: 1,
       kdf:   { name:'PBKDF2', hash:'SHA-256', iterations:N, salt:'<b64>' },
       cipher:{ name:'AES-GCM', iv:'<b64>' },
       data:  '<b64 ciphertext (incl. GCM auth tag)>'
     }
  */

  async function seal(key, saltBytes, iterations, plainObject) {
    var res = await encryptBytes(key, utf8(JSON.stringify(plainObject)));
    return {
      v: 1,
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: iterations,
        salt: toB64(saltBytes)
      },
      cipher: { name: 'AES-GCM', iv: toB64(res.iv) },
      data: toB64(res.ciphertext)
    };
  }

  async function open(key, envelope) {
    var salt = fromB64(envelope.kdf.salt);
    var iv = fromB64(envelope.cipher.iv);
    var data = fromB64(envelope.data);
    var plain = await decryptBytes(key, iv, data);
    return JSON.parse(dec.decode(plain));
  }

  global.CryptoBox = {
    requireSecureCrypto: requireSecureCrypto,
    randomBytes: randomBytes,
    toB64: toB64,
    fromB64: fromB64,
    deriveKey: deriveKey,
    encryptBytes: encryptBytes,
    decryptBytes: decryptBytes,
    seal: seal,
    open: open,
    DEFAULT_ITERATIONS: 310000
  };
})(window);
