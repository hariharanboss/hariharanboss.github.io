# GetNumber

**A personal emergency-information website.** Open the link on any phone, tap your
6-digit PIN, and every number you would need is one tap away — call, SMS, or WhatsApp.

Built for the situation where you have lost your phone, or simply cannot remember
anyone's number. No backend, no app to install, no account. Just a URL.

```
https://hariharanboss.github.io/
```

---

## Why it works the way it does

| Problem | How this solves it |
|---|---|
| You lost your phone and forgot every number | The link is public. Anyone's phone can open it. |
| You cannot remember a long URL | Short repo name (`getnumber`) + a **QR code printed on a wallet card**. |
| Typing a password on a stranger's phone is painful | A **6-digit PIN on a big numeric keypad**. No Shift, no symbols. |
| Your phone is dead and you do not know the PIN | Emergency numbers (112, 100, 101, 102…) are **callable before you unlock**. |
| Someone might look over your shoulder | The vault **auto-locks** and the key lives only in memory. |
| Your repo is public, so is your data | All personal data is **AES-GCM encrypted** in `data/vault.enc.json`. |

---

## Security model

```
   your 6-digit PIN
          │
          ▼
   PBKDF2-SHA256 · 310,000 iterations · 16-byte random salt
          │
          ▼
     256-bit key ───► AES-GCM · fresh 12-byte IV on every save
          │
          ▼
   data/vault.enc.json   ← encrypted; safe to commit to a public repo
```

* The key is derived **in your browser** and held in RAM only. Close the tab and it
  is gone — you must enter the PIN again.
* A wrong PIN fails the GCM authentication tag, so there is no separate password
  hash to leak or crack.
* **Honest limits:** a 6-digit PIN is only 1,000,000 possibilities. If someone gets
  hold of your `vault.enc.json` backup they could brute-force it offline. That is why
  you should use a **recovery passphrase** (long, random, stored separately) and keep
  backups private. This protects against casual snooping and repo cloning — not
  against a determined attacker with your backup file.
* Nothing is ever sent to a server. There is no server.

---

## Getting started

```bash
git clone https://github.com/hariharanboss/hariharanboss.github.io.git
cd hariharanboss.github.io
```

### Run it locally

```bash
python -m http.server 8000
# then open http://localhost:8000
```

> Use `localhost` (or HTTPS) rather than opening `index.html` from the filesystem.
> The browser's Web Crypto API is only available in a **secure context**, and the
> encrypted vault has to be fetched over HTTP.

The seeded PIN is **123456**. Change it immediately inside the app
(**Backup → 4 · Security → Change PIN**).

### Re-seed the sample data

```bash
node tools/seed-vault.js 123456       # PIN, iterations
node tools/make-icons.js              # regenerate the PWA icons
```

---

## Putting your details in

1. Open the site and enter the PIN.
2. Tap **Edit** (bottom bar).
3. Fill in each tab: Profile · Medical · Contacts · Numbers · Roles · Home & Vehicle ·
   Notes · Site.
4. Tap **Save changes**. Your data is re-encrypted and stored on this device.
5. Tap **Backup → 1 · Publish your changes**, then download:
   * `data/vault.enc.json`
   * `data/public.json`
6. Replace both files in your project folder and push:

```bash
cp ~/Downloads/vault.enc.json data/vault.enc.json
cp ~/Downloads/public.json    data/public.json
git add data/ && git commit -m "Update emergency details" && git push
```

The site updates within seconds. (The app also keeps an encrypted copy on your
device, so you can keep working offline and publish later.)

---

## Printing your card

**Backup/Print → Print** produces two pages:

* **Page 1 — A4 emergency sheet.** Everything, for the fridge or a drawer.
* **Page 2 — two wallet cards**, exactly **85.6 × 54 mm**. Cut along the dashed line.

The card front has your name, blood group, allergies, who to call first, a big
**112** button and a **QR code** pointing at your site. The back has
*who to call for what* plus the medical summary.

> In the print dialog set **Scale to 100%** (not "Fit to page") so the card comes out
> at the right size, and turn off **Headers and footers**.

Print several copies. Keep one in your **wallet**, one in your **bag**, one in your
**car**, one at **home**. This card is your way back in if you lose your phone.

---

## Deploy to GitHub Pages

```bash
git remote add origin https://github.com/hariharanboss/hariharanboss.github.io.git
git push -u origin main
```

Then in the repo: **Settings → Pages → Source: Deploy from a branch → `main` /
`/ (root)` → Save**.

Your site appears at `https://hariharanboss.github.io/` within a minute.

> This repository is your **user site** (the repo name matches your GitHub
> username), which is why the address has no extra path in it. That keeps the
> URL as short as possible — useful when you have to type it on someone else's
> phone in a hurry.

Finally, set **Edit → Site → This site's address** to your real URL so the printed
QR code points to the right place.

---

## Features

| | |
|---|---|
| 🔒 6-digit PIN, AES-GCM encrypted vault | ☎️ One-tap Call / SMS / WhatsApp (`tel:`, `sms:`, `wa.me`) |
| 🚨 Public emergency numbers before unlocking | 🧭 "Who to call for what" role directory |
| 🩺 Medical summary + allergies | 🏠 Address, home, vehicle, documents |
| 🖨️ A4 sheet + 85.6 × 54 mm wallet card | 🔲 QR code generated in pure JavaScript |
| 📴 Installable PWA, works offline | 🌙 Dark / light / large-text modes |
| 🔁 Recovery passphrase + plain-text backups | 🇮🇳 Indian emergency numbers, editable |

---

## Project layout

```
getnumber/
├─ index.html              lock screen, dashboard, editor, print
├─ css/
│  ├─ base.css             tokens, layout, components
│  ├─ themes.css           dark / light palettes
│  └─ print.css            A4 sheet + wallet card
├─ js/
│  ├─ crypto.js            PBKDF2 + AES-GCM
│  ├─ vault.js             load / unlock / lock / re-seal
│  ├─ qr.js                QR encoder, written from scratch
│  ├─ app.js               dashboard, lock screen, theming
│  ├─ editor.js            the in-app editor
│  ├─ backup.js            publish, backups, PIN management
│  ├─ print.js             sheet + card builder
│  └─ boot.js              startup
├─ data/
│  ├─ vault.enc.json       encrypted payload
│  ├─ public.json          lock-screen title + public numbers
│  └─ sample.json          the seeded example profile
├─ tools/
│  ├─ seed-vault.js        rebuild the encrypted vault
│  └─ make-icons.js        generate PNG app icons
├─ icons/
├─ manifest.json           PWA manifest
└─ sw.js                   offline cache
```

No dependencies, no build step, no npm packages. `tools/` uses Node only to
regenerate data and icons — the site itself is plain HTML, CSS and JavaScript.

---

## Licence

MIT — see [LICENSE](LICENSE).

Your emergency details are yours. The sample data in `data/sample.json` is
placeholder content, not real information.
