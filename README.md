# Deluxe Main

The Deluxe account, and the one server every Deluxe website runs on for accounts and data.

**Where it runs:** inside the one Deluxe Cloudflare Worker (`deluxe-drive`), which also keeps Deluxe
Drive's files. The account pages are at **https://deluxe-drive.deluxelordd.workers.dev/main/** and the
server at `/main/api/`. That Worker's repository (deluxe-drive) holds a copy of this repository's
`worker/core.js`, `worker/apps.js` and `public/` (copied with its `tools/sync-main.sh`); this repository
is where they are changed. The pages can also be put on Vercel: import this repository (`vercel.json`
publishes `public/`); they talk to the Worker either way.

- **Guests:** every Deluxe website can be used without an account ("Continue as guest"); what a guest
  does stays in that browser and moves into the account when they sign in.
- **Saved sign-in:** keys last 180 days and every visit renews them.

- **Sign in / create account** happens only here. No other Deluxe website makes accounts.
- **Every Deluxe website signs in with Deluxe Main**: Deluxe Drive, Deluxe Docs, Deluxe Mail, Deluxe
  Convert, Deluxe Translate and YouTube Guider AI. Tapping *Sign in with Deluxe Main* on any of them
  comes here, then goes straight back signed in.
- **All data is saved here**: settings, histories, Deluxe Drive's folder and file list, mail, the Gmail
  connection. The one exception is **file contents, which are kept in Deluxe Drive**.
- The home page lists every Deluxe website and lets you change your name and password, see and sign out
  the websites you are signed in to, and delete your account (which also deletes its Drive files).

## How it fits together

```
            ┌──────────────── Deluxe Main (this) ────────────────┐
 websites ──►  accounts · sign-in · every website's saved data    │
            └───────────────▲───────────────────────┬────────────┘
                            │ "whose key is this?"  │ delete account → empty its files
            ┌───────────────┴───────────────────────▼────────────┐
            │  Deluxe Drive: file contents and share links only   │
            └─────────────────────────────────────────────────────┘
```

1. A website sends the person to `https://deluxe-main…/connect?return=<the page>`.
2. Deluxe Main signs them in (or makes the account) and asks once, *Continue to Deluxe Translate?*
   Websites already allowed continue straight away.
3. Deluxe Main sends them back with a one-use code (`#deluxe_code=…`, 60 seconds). The website trades it
   for its own key, which only works from that website's address.
4. With that key the website reads and writes **its own** data on Deluxe Main
   (`/api/data/<website>/…`). Deluxe Docs may also read Deluxe Drive's file list. Deluxe Drive checks
   the same key with Deluxe Main before handing out file contents.

Only addresses listed in `worker/apps.js` (or added with the `APP_ORIGINS` variable) can sign in, so
another site cannot pose as a Deluxe website.

Passwords never leave the browser: the page hashes them (PBKDF2-SHA256, 120,000 rounds, with the
account's salt) and only that hash is sent; the server keeps a SHA-256 of it. Accounts made in Deluxe
Drive before Deluxe Main existed sign in here with the same name and password: they move here, keeping
their id, so their files stay where they are.

## For a website: `deluxe.js`

```html
<script src="https://deluxe-drive.deluxelordd.workers.dev/main/deluxe.js" data-app="translate"></script>
<div id="account"></div>
<script>
  Deluxe.button(document.getElementById('account'));   // "Sign in with Deluxe Main" / account menu
  Deluxe.ready.then(function (user) {                  // user, or null
    if (user) Deluxe.data.put('history', [...]);       // saved in Deluxe Main
  });
</script>
```

`Deluxe.data` has `get(key)`, `put(key, value)`, `remove(key)`, `list({ prefix, order, limit })`,
`batch({ put: [{key, value}], delete: [key] })` and `clear(prefix)`. Also `Deluxe.signIn()`,
`Deluxe.signOut()`, `Deluxe.user()`, `Deluxe.token()` and `Deluxe.onChange(fn)`.

A website's own server (Deluxe Mail's Netlify function) can save data for an account with
`Authorization: App <key>`, `X-Deluxe-App: mail` and `X-Deluxe-Account: <account id>`; the key is the
secret `APP_KEY_MAIL` set on this Worker.

## Files

```
public/index.html, app.js, styles.css   the sign-in, "continue to …" and account home page
public/deluxe.js                         the sign-in library every Deluxe website loads
worker/index.js                          entry point: pages from public/, /api to the Durable Object
worker/core.js                           the server: accounts, sign-ins, data (SQLite)
worker/apps.js                           the Deluxe websites and the addresses they may sign in from
tests/main.test.mjs                      node tests/main.test.mjs
tests/dev-server.mjs                     a local copy with an in-memory database
```

## Deploy

The live server is the `deluxe-drive` Worker: after changing this repository, run
`sh tools/sync-main.sh ../Deluxe-Main` in deluxe-drive and push it; Cloudflare deploys it. For Deluxe
Mail, add its address to `APP_ORIGINS` and set the secret `APP_KEY_MAIL` on that Worker.

This repository's own `wrangler.jsonc` can still publish Deluxe Main as a separate Worker
(`deluxe-main`) if you ever want it on its own.

If a website moves to a new address, add it to `worker/apps.js` (or `APP_ORIGINS`), or its sign-in
will be refused.

## Run locally

```
node tests/main.test.mjs
ALLOW_LOCALHOST=1 DRIVE_URL=http://localhost:8787 node tests/dev-server.mjs 8790
```

`ALLOW_LOCALHOST=1` lets pages on `http://localhost` sign in (never set it on the real Worker).

Directed by **Shivad Sujith**. AI support: **Claude**.
