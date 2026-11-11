// Runs Deluxe Main's server code in Node: node:sqlite stands in for the Durable
// Object's SQL, and a small fake stands in for Deluxe Drive.
// Run: node tests/main.test.mjs
import assert from 'node:assert/strict';
import { pbkdf2Sync, randomBytes } from 'node:crypto';
import { MainCore, handleFor } from '../worker/core.js';
import { appForOrigin, APPS } from '../worker/apps.js';
import { createHash } from 'node:crypto';
import { NodeSql } from './fakes.mjs';

const derive = (pw, salt) => pbkdf2Sync(pw, Buffer.from(salt, 'hex'), 120000, 32, 'sha256').toString('hex');

// A Deluxe Drive with one account made before Deluxe Main existed.
const legacySalt = randomBytes(16).toString('hex');
const legacy = { id: 'u_old_1', name: 'Old Timer', salt: legacySalt, hash: derive('old-password', legacySalt), claimed: false };
const driveCalls = [];
async function fakeDrive(path, init = {}) {
  const body = init.body ? JSON.parse(init.body) : {};
  driveCalls.push({ path, body, auth: init.headers && init.headers.Authorization });
  const reply = (status, value) => new Response(JSON.stringify(value), { status });
  const mine = !legacy.claimed && String(body.name || '').toLowerCase() === legacy.name.toLowerCase();
  if (path === '/api/accounts/find') return reply(200, mine ? { id: legacy.id, salt: legacy.salt } : { salt: 'ab'.repeat(16) });
  if (path === '/api/legacy/exists') return reply(200, { exists: mine });
  if (path === '/api/legacy/claim') {
    if (!mine || body.hash !== legacy.hash) return reply(401, { error: 'no' });
    legacy.claimed = true;
    return reply(200, { id: legacy.id, name: legacy.name, salt: legacy.salt });
  }
  if (path === '/api/db/clear') return reply(200, { ok: true });
  return reply(404, {});
}

const env = { APP_ORIGINS: JSON.stringify({ mail: ['https://mail.example.netlify.app'] }), APP_KEY_MAIL: 'mail-secret' };
const main = new MainCore(new NodeSql(), env, { drive: fakeDrive });
const ORIGIN = 'https://main.test';

async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (body !== undefined) h['Content-Type'] = 'application/json';
  const res = await main.handle(new Request(ORIGIN + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) }));
  let data = null;
  try { data = await res.json(); } catch (e) { /* empty */ }
  return { status: res.status, data };
}

let n = 0;
const ok = (name) => console.log(`ok ${++n} ${name}`);

/* apps */
assert.equal(appForOrigin('https://deluxe-translate-8m27.netlify.app'), 'translate');
assert.equal(appForOrigin('https://deploy-preview-4--deluxe-translate-8m27.netlify.app'), 'translate');
assert.equal(appForOrigin('https://evil.netlify.app'), null);
assert.equal(appForOrigin('https://deluxe-translate-8m27.netlify.app.evil.com'), null);
assert.equal(appForOrigin('http://localhost:8000', {}, 'docs'), null);
assert.equal(appForOrigin('https://deluxe-docs-evil.vercel.app'), null, 'no vercel.app wildcards');
assert.equal(appForOrigin('https://deluxe-docs-iota.vercel.app'), 'docs');
assert.equal(appForOrigin('https://deluxe-mail.vercel.app'), 'mail');
assert.equal(appForOrigin('https://deluxe-convert.vercel.app'), 'convert');
assert.equal(appForOrigin('https://deluxe-translate-app.vercel.app'), 'translate');
assert.equal(appForOrigin('https://deluxe-youtube-guider.vercel.app'), 'youtube');
assert.equal(appForOrigin('http://localhost:8000', { ALLOW_LOCALHOST: '1' }, 'docs'), 'docs');
assert.equal(appForOrigin('https://mail.example.netlify.app', env), 'mail');
assert.equal(handleFor('Shivad Sujith'), 'shivad.sujith');
ok('website addresses and handles');

/* create account */
let r = await call('GET', '/api/health');
assert.equal(r.status, 200); assert.equal(r.data.server, true);

const salt = randomBytes(16).toString('hex');
const hash = derive('hunter22', salt);
r = await call('POST', '/api/accounts', { body: { name: 'Shivad Sujith', salt, hash } });
assert.equal(r.status, 201); assert.equal(r.data.user.handle, 'shivad.sujith');
const mainToken = r.data.token;
const userId = r.data.user.id;
r = await call('POST', '/api/accounts', { body: { name: 'shivad.sujith', salt, hash } });
assert.equal(r.status, 409, 'same handle is taken');
r = await call('POST', '/api/accounts', { body: { name: 'old timer', salt, hash } });
assert.equal(r.status, 409, 'a name still in old Deluxe Drive is taken');
r = await call('POST', '/api/accounts', { body: { name: 'x', salt, hash } });
assert.equal(r.status, 400);
ok('create account; duplicate and bad names refused');

/* sign in */
r = await call('POST', '/api/accounts/find', { body: { name: 'SHIVAD SUJITH' } });
assert.equal(r.data.salt, salt);
r = await call('POST', '/api/auth/login', { body: { name: 'Shivad Sujith', hash: 'f'.repeat(64) } });
assert.equal(r.status, 401);
r = await call('POST', '/api/auth/login', { body: { name: 'shivad sujith', hash } });
assert.equal(r.status, 200); assert.ok(r.data.token.startsWith('dm_'));
const second = r.data.token;
r = await call('GET', '/api/auth/me', { token: second });
assert.equal(r.data.user.id, userId); assert.equal(r.data.app, 'main');
ok('sign in checks the password hash');

/* legacy Deluxe Drive account moves over, keeping its id */
r = await call('POST', '/api/accounts/find', { body: { name: 'Old Timer' } });
assert.equal(r.data.salt, legacySalt);
r = await call('POST', '/api/auth/login', { body: { name: 'Old Timer', hash: derive('wrong', legacySalt) } });
assert.equal(r.status, 401); assert.equal(legacy.claimed, false);
r = await call('POST', '/api/auth/login', { body: { name: 'Old Timer', hash: legacy.hash } });
assert.equal(r.status, 200); assert.equal(r.data.user.id, 'u_old_1'); assert.equal(legacy.claimed, true);
r = await call('POST', '/api/auth/login', { body: { name: 'Old Timer', hash: legacy.hash } });
assert.equal(r.status, 200, 'second sign-in uses the Main account');
const oldToken = r.data.token;
ok('old Deluxe Drive account moves to Deluxe Main');

/* signing in to a website */
const back = 'https://deluxe-translate-8m27.netlify.app/?q=1';
r = await call('POST', '/api/connect/check', { token: mainToken, body: { return: 'https://evil.example/' } });
assert.equal(r.status, 400);
r = await call('POST', '/api/connect/check', { token: mainToken, body: { return: back } });
assert.equal(r.data.app, 'translate'); assert.equal(r.data.approved, false);
r = await call('POST', '/api/connect/approve', { token: mainToken, body: { return: back } });
const redirect = new URL(r.data.redirect);
assert.equal(redirect.origin, 'https://deluxe-translate-8m27.netlify.app');
const code = /deluxe_code=([0-9a-f]+)/.exec(redirect.hash)[1];
r = await call('POST', '/api/connect/exchange', { body: { code }, headers: { Origin: 'https://evil.example' } });
assert.equal(r.status, 400, 'another site cannot use the code');
r = await call('POST', '/api/connect/approve', { token: mainToken, body: { return: back } });
const code2 = /deluxe_code=([0-9a-f]+)/.exec(r.data.redirect)[1];
r = await call('POST', '/api/connect/exchange', { body: { code: code2 }, headers: { Origin: 'https://deluxe-translate-8m27.netlify.app' } });
assert.equal(r.status, 200); assert.equal(r.data.app, 'translate');
const translateToken = r.data.token;
r = await call('POST', '/api/connect/exchange', { body: { code: code2 }, headers: { Origin: 'https://deluxe-translate-8m27.netlify.app' } });
assert.equal(r.status, 400, 'a code works once');
r = await call('POST', '/api/connect/check', { token: mainToken, body: { return: back } });
assert.equal(r.data.approved, true);
r = await call('POST', '/api/connect/approve', { token: translateToken, body: { return: back } });
assert.equal(r.status, 403, 'only Main itself approves');
ok('website sign-in: allow-listed return, one-use code bound to origin');

/* data */
r = await call('PUT', '/api/data/translate/history', { token: translateToken, body: { value: [{ from: 'hola', to: 'hello' }] } });
assert.equal(r.status, 200);
r = await call('GET', '/api/data/translate/history', { token: translateToken });
assert.deepEqual(r.data.value, [{ from: 'hola', to: 'hello' }]);
r = await call('GET', '/api/data/drive', { token: translateToken });
assert.equal(r.status, 403, 'translate cannot read drive');
r = await call('PUT', '/api/data/drive/node:a', { token: translateToken, body: { value: {} } });
assert.equal(r.status, 403);
r = await call('GET', '/api/data/translate/history', { token: oldToken });
assert.equal(r.status, 404, 'other account sees nothing');
r = await call('POST', '/api/data/drive/batch', { token: mainToken, body: { put: [{ key: 'node:a', value: { id: 'a' } }, { key: 'node:b', value: { id: 'b' } }, { key: 'set:theme', value: 'dark' }] } });
assert.equal(r.status, 200);
r = await call('GET', '/api/data/drive?prefix=node:', { token: mainToken });
assert.deepEqual(r.data.items.map((i) => i.key), ['node:a', 'node:b']);
r = await call('GET', '/api/data/drive?prefix=node:&order=desc&limit=1', { token: mainToken });
assert.deepEqual(r.data.items.map((i) => i.key), ['node:b']);
r = await call('PUT', '/api/data/mail/inbox/0001-x', { token: mainToken, body: { value: { s: 1 } } });
assert.equal(r.status, 200);
r = await call('GET', '/api/data/mail/inbox/0001-x', { token: mainToken });
assert.deepEqual(r.data.value, { s: 1 }, 'keys may contain /');
r = await call('DELETE', '/api/data/drive?prefix=set:', { token: mainToken });
r = await call('GET', '/api/data/drive', { token: mainToken });
assert.equal(r.data.items.length, 2);
ok('data: per account, per website, with read rules');

/* docs may read drive data but not change it */
r = await call('POST', '/api/connect/approve', { token: mainToken, body: { return: 'https://deluxe-docs-iota.vercel.app/' } });
const docsCode = /deluxe_code=([0-9a-f]+)/.exec(r.data.redirect)[1];
r = await call('POST', '/api/connect/exchange', { body: { code: docsCode }, headers: { Origin: 'https://deluxe-docs-iota.vercel.app' } });
const docsToken = r.data.token;
r = await call('GET', '/api/data/drive?prefix=node:', { token: docsToken });
assert.equal(r.data.items.length, 2);
r = await call('DELETE', '/api/data/drive/node:a', { token: docsToken });
assert.equal(r.status, 403);
r = await call('GET', '/api/auth/me', { token: docsToken });
assert.deepEqual(r.data.reads, ['docs', 'drive']);
ok('docs reads drive data only');

/* a website's own server, with its key */
const appHeaders = (key, account) => ({ Authorization: `App ${key}`, 'X-Deluxe-App': 'mail', ...(account ? { 'X-Deluxe-Account': account } : {}) });
r = await call('GET', '/api/server/account?handle=shivad.sujith', { headers: appHeaders('wrong') });
assert.equal(r.status, 401);
r = await call('GET', '/api/server/account?handle=shivad.sujith', { headers: appHeaders('mail-secret') });
assert.equal(r.data.user.id, userId);
r = await call('PUT', '/api/data/mail/inbox/0002-y', { headers: appHeaders('mail-secret', userId), body: { value: { s: 2 } } });
assert.equal(r.status, 200);
r = await call('PUT', '/api/data/drive/node:z', { headers: appHeaders('mail-secret', userId), body: { value: {} } });
assert.equal(r.status, 403);
// Without a Worker secret, the key is checked against the fingerprint in apps.js.
const realHash = APPS.mail.keyHash;
const testKey = 'test-only-key-0123456789abcdefghijklmnop';
APPS.mail.keyHash = createHash('sha256').update(testKey).digest('hex');
const plain = new MainCore(new NodeSql(), {}, {});
const probe = (key) => plain.handle(new Request(ORIGIN + '/api/server/account?handle=x', { headers: { Authorization: `App ${key}`, 'X-Deluxe-App': 'mail' } }));
assert.equal((await probe(testKey)).status, 404, 'right key accepted (no such account)');
assert.equal((await probe('wrong-key-wrong-key-wrong-key-12345')).status, 401);
APPS.mail.keyHash = realHash;
assert.match(realHash, /^[0-9a-f]{64}$/);
ok('website server key reaches only its own data');

/* account page, sessions, password */
r = await call('GET', '/api/account', { token: mainToken });
assert.ok(r.data.signedIn.some((s) => s.app === 'translate'));
r = await call('GET', '/api/account', { token: translateToken });
assert.equal(r.status, 403);
r = await call('DELETE', '/api/account/sessions/translate', { token: mainToken });
r = await call('GET', '/api/auth/me', { token: translateToken });
assert.equal(r.status, 401, 'signing a website out ends its key');

const salt2 = randomBytes(16).toString('hex');
const hash2 = derive('new-password', salt2);
r = await call('POST', '/api/account/password', { token: mainToken, body: { currentHash: 'a'.repeat(64), salt: salt2, hash: hash2 } });
assert.equal(r.status, 401);
r = await call('POST', '/api/account/password', { token: mainToken, body: { currentHash: hash, salt: salt2, hash: hash2 } });
assert.equal(r.status, 200);
r = await call('GET', '/api/auth/me', { token: second });
assert.equal(r.status, 401, 'other sessions end');
r = await call('GET', '/api/auth/me', { token: mainToken });
assert.equal(r.status, 200, 'this session stays');
r = await call('PATCH', '/api/account', { token: mainToken, body: { name: 'Shivad' } });
assert.equal(r.data.user.name, 'Shivad'); assert.equal(r.data.user.handle, 'shivad.sujith');
// a 60-second code signs in another device, once
r = await call('POST', '/api/auth/device', { body: { code: 'AAAA-BBBB-CCCC' } });
assert.equal(r.status, 400);
r = await call('POST', '/api/account/device-code', { token: mainToken });
assert.equal(r.status, 201); assert.match(r.data.code, /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/); assert.equal(r.data.expiresIn, 60);
const devCode = r.data.code;
r = await call('POST', '/api/account/device-code', { token: translateToken });
assert.ok([401, 403].includes(r.status), 'only Deluxe Main makes device codes');
r = await call('POST', '/api/auth/device', { body: { code: ' ' + devCode.replace(/-/g, '').toLowerCase() + ' ' } });
assert.equal(r.status, 200); assert.equal(r.data.user.id, userId); assert.ok(r.data.token.startsWith('dm_'));
r = await call('POST', '/api/auth/device', { body: { code: devCode } });
assert.equal(r.status, 400, 'works once');
ok('account settings and 60-second device codes');

/* delete account empties Deluxe Drive too */
r = await call('POST', '/api/account/delete', { token: mainToken, body: { hash } });
assert.equal(r.status, 401);
driveCalls.length = 0;
r = await call('POST', '/api/account/delete', { token: mainToken, body: { hash: hash2 } });
assert.equal(r.status, 200);
assert.ok(driveCalls.some((c) => c.path === '/api/db/clear' && c.auth === `Bearer ${mainToken}`));
r = await call('GET', '/api/auth/me', { token: mainToken });
assert.equal(r.status, 401);
r = await call('POST', '/api/auth/login', { body: { name: 'Shivad', hash: hash2 } });
assert.equal(r.status, 401);
ok('delete account (and its Drive files)');

console.log(`all ${n} passed`);
