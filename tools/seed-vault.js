/* ==========================================================
   tools/seed-vault.js
   Creates data/vault.enc.json from data/sample.json.

   Usage:
     node tools/seed-vault.js [PIN] [iterations]

   The PIN defaults to 123456 — change it in the app
   (Backup → Change PIN) as soon as you have set up your
   real details.
   ========================================================== */
'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { webcrypto } = require('node:crypto');

const ROOT = path.join(__dirname, '..');
const PIN = process.argv[2] || '123456';
const ITERATIONS = parseInt(process.argv[3] || '310000', 10);

const enc = new TextEncoder();

function b64(bytes) {
  return Buffer.from(bytes).toString('base64');
}

async function main() {
  const samplePath = path.join(ROOT, 'data', 'sample.json');
  const sample = JSON.parse(fs.readFileSync(samplePath, 'utf8'));

  const salt = webcrypto.getRandomValues(new Uint8Array(16));
  const baseKey = await webcrypto.subtle.importKey(
    'raw', enc.encode(String(PIN)), 'PBKDF2', false, ['deriveKey']
  );
  const key = await webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );

  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const ct = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(JSON.stringify(sample))
  );

  const envelope = {
    v: 1,
    updatedAt: new Date().toISOString(),
    updatedBy: 'seed',
    primary: {
      kdf: {
        name: 'PBKDF2',
        hash: 'SHA-256',
        iterations: ITERATIONS,
        salt: b64(salt)
      },
      cipher: { name: 'AES-GCM', iv: b64(iv) },
      data: b64(new Uint8Array(ct))
    }
  };

  const out = path.join(ROOT, 'data', 'vault.enc.json');
  fs.writeFileSync(out, JSON.stringify(envelope, null, 2) + '\n', 'utf8');

  console.log('✔ Wrote data/vault.enc.json');
  console.log('  PIN        :', PIN);
  console.log('  Iterations :', ITERATIONS);
  console.log('  Payload    :', JSON.stringify(sample).length, 'bytes');
  console.log('');
  console.log('  ⚠ Change the PIN inside the app before adding real details.');
}

main().catch(function (err) {
  console.error('✖', err);
  process.exit(1);
});
