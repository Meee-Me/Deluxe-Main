// Deluxe Main on Cloudflare Workers.
//
// The pages (public/) are served by Workers Assets. Everything under /api goes
// to one Durable Object, which keeps the accounts, sign-ins and saved data of
// every Deluxe website in its SQLite database.

import { DurableObject } from 'cloudflare:workers';
import { MainCore } from './core.js';

const DEFAULT_DRIVE_URL = 'https://deluxe-drive.deluxelordd.workers.dev';

// Deluxe Drive keeps the file contents. Main reaches it through the DRIVE
// service binding when there is one, otherwise over its address.
function driveCaller(env) {
  const base = String(env.DRIVE_URL || DEFAULT_DRIVE_URL).replace(/\/+$/, '');
  return (path, init = {}) => {
    const request = new Request(`${base}${path}`, init);
    return env.DRIVE ? env.DRIVE.fetch(request) : fetch(request);
  };
}

export class Main extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.core = new MainCore(ctx.storage.sql, env, { drive: driveCaller(env) });
  }

  fetch(request) {
    return this.core.handle(request);
  }
}

// Any site may call the API: every request carries its own bearer token and no
// cookies are used, so there is nothing for another site to ride on. What each
// key may do is checked by the server.
function withCors(request, response) {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', request.headers.get('Origin') || '*');
  headers.set('Vary', 'Origin');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Deluxe-App, X-Deluxe-Account');
  headers.set('Access-Control-Max-Age', '86400');
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    if (!pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
    if (request.method === 'OPTIONS') return withCors(request, new Response(null, { status: 204 }));
    if (!env.MAIN) {
      return withCors(
        request,
        new Response(JSON.stringify({ error: 'The Main Durable Object is not bound on this Worker.' }), {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        })
      );
    }
    const stub = env.MAIN.get(env.MAIN.idFromName('deluxe-main'));
    return withCors(request, await stub.fetch(request));
  },
};
