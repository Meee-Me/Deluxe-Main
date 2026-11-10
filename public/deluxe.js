/* Sign in with Deluxe Main, for every Deluxe website.
 *
 *   <script src="https://deluxe-main.deluxelordd.workers.dev/deluxe.js"></script>
 *
 *   Deluxe.ready.then(function (user) { ... });   // user, or null when signed out
 *   Deluxe.signIn();                               // goes to Deluxe Main and comes back signed in
 *   Deluxe.signOut();
 *   Deluxe.user();  Deluxe.token();
 *   Deluxe.data.get(key) / put(key, value) / remove(key) / list({ prefix, order, limit }) / batch({ put, delete }) / clear(prefix)
 *   Deluxe.onChange(function (user) { ... });
 *   Deluxe.button(element);                        // a ready-made sign-in / account button
 *
 * Accounts are only ever made on Deluxe Main. A website gets its own key for
 * the signed-in account, which can only reach that website's own data. */
(function () {
  'use strict';
  if (window.Deluxe && window.Deluxe.version) return;

  var script = document.currentScript;
  var MAIN = 'https://deluxe-main.deluxelordd.workers.dev';
  try {
    if (script && script.src) MAIN = new URL(script.src).origin;
  } catch (e) {}
  var APP = (script && script.getAttribute('data-app')) || '';
  var KEY = 'deluxe.session.v1';
  var listeners = [];
  var session = load();

  function load() {
    try {
      var s = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (s && s.token && s.exp > Date.now() && s.main === MAIN) return s;
    } catch (e) {}
    return null;
  }

  function save(next) {
    session = next;
    try {
      if (next) localStorage.setItem(KEY, JSON.stringify(next));
      else localStorage.removeItem(KEY);
    } catch (e) {}
    var user = next ? next.user : null;
    listeners.slice().forEach(function (fn) {
      try { fn(user); } catch (e) { console.error(e); }
    });
  }

  function api(path, init) {
    init = init || {};
    var headers = Object.assign({}, init.headers || {});
    if (session) headers.Authorization = 'Bearer ' + session.token;
    if (init.body !== undefined && typeof init.body !== 'string') {
      headers['Content-Type'] = 'application/json';
      init = Object.assign({}, init, { body: JSON.stringify(init.body) });
    }
    return fetch(MAIN + path, Object.assign({}, init, { headers: headers, credentials: 'omit', cache: 'no-store' })).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (data) {
        if (r.status === 401 && session) save(null);
        if (!r.ok) {
          var err = new Error((data && data.error) || ('Deluxe Main answered ' + r.status + '.'));
          err.status = r.status;
          err.code = data && data.code;
          throw err;
        }
        return data;
      });
    });
  }

  // Coming back from Deluxe Main: #deluxe_code=... is traded for this site's key.
  function finishSignIn() {
    var m = /(?:^#|&)deluxe_code=([0-9a-f]{48})/.exec(location.hash || '');
    if (!m) return Promise.resolve(session ? session.user : null);
    var rest = (location.hash || '').replace(/^#/, '').split('&').filter(function (p) { return p.indexOf('deluxe_code=') !== 0; }).join('&');
    try { history.replaceState(history.state, '', location.pathname + location.search + (rest ? '#' + rest : '')); } catch (e) {}
    return fetch(MAIN + '/api/connect/exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: m[1] }),
      credentials: 'omit',
    })
      .then(function (r) { return r.json().then(function (d) { if (!r.ok) throw new Error(d.error || 'Sign-in failed.'); return d; }); })
      .then(function (d) {
        save({ token: d.token, user: d.user, app: d.app, exp: Date.now() + (Number(d.expiresIn) || 86400) * 1000, main: MAIN });
        return d.user;
      })
      .catch(function (e) {
        console.warn('Deluxe sign-in:', e.message);
        return session ? session.user : null;
      });
  }

  function enc(k) { return encodeURIComponent(k); }

  function data(defaultApp) {
    function appOf(o) { return (o && o.app) || defaultApp(); }
    return {
      get: function (key, o) {
        return api('/api/data/' + enc(appOf(o)) + '/' + enc(key)).then(function (d) { return d.value; }, function (e) {
          if (e.status === 404) return undefined;
          throw e;
        });
      },
      put: function (key, value, o) { return api('/api/data/' + enc(appOf(o)) + '/' + enc(key), { method: 'PUT', body: { value: value } }); },
      remove: function (key, o) { return api('/api/data/' + enc(appOf(o)) + '/' + enc(key), { method: 'DELETE' }); },
      list: function (o) {
        o = o || {};
        var q = new URLSearchParams();
        if (o.prefix) q.set('prefix', o.prefix);
        if (o.order) q.set('order', o.order);
        if (o.limit) q.set('limit', String(o.limit));
        if (o.values === false) q.set('values', '0');
        return api('/api/data/' + enc(appOf(o)) + '?' + q).then(function (d) { return d.items || []; });
      },
      batch: function (ops, o) { return api('/api/data/' + enc(appOf(o)) + '/batch', { method: 'POST', body: ops || {} }); },
      clear: function (prefix, o) {
        return api('/api/data/' + enc(appOf(o)) + (prefix ? '?prefix=' + enc(prefix) : ''), { method: 'DELETE' });
      },
    };
  }

  var Deluxe = {
    version: 1,
    main: MAIN,
    ready: null,
    init: function (o) { if (o && o.app) APP = o.app; return Deluxe.ready; },
    user: function () { return session ? session.user : null; },
    token: function () { return session ? session.token : null; },
    app: function () { return (session && session.app) || APP; },
    signIn: function (returnUrl) {
      var back = returnUrl || location.href.replace(/#.*$/, '');
      var q = new URLSearchParams({ return: back });
      if (APP) q.set('app', APP);
      location.href = MAIN + '/connect?' + q;
    },
    signOut: function () {
      var t = session && session.token;
      save(null);
      if (t) fetch(MAIN + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, credentials: 'omit' }).catch(function () {});
    },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    api: api,
    data: null,
    button: button,
  };
  Deluxe.data = data(function () { return Deluxe.app(); });
  Deluxe.ready = finishSignIn().then(function (user) {
    // A key Deluxe Main has ended (signed out there, password changed) is dropped.
    if (session) api('/api/auth/me').then(function (d) {
      if (d && d.user && session) { session.user = d.user; save(session); }
    }).catch(function () {});
    return user;
  });

  // A small "Sign in with Deluxe Main" button that turns into the account's name.
  function button(el, opts) {
    opts = opts || {};
    if (!el) return;
    var css = 'font:600 14px/1 system-ui,sans-serif;border-radius:999px;padding:9px 14px;cursor:pointer;border:1px solid rgba(127,127,127,.35);background:' +
      (opts.background || '#6d4aff') + ';color:' + (opts.color || '#fff') + ';display:inline-flex;align-items:center;gap:8px;white-space:nowrap';
    function draw(user) {
      el.innerHTML = '';
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = css;
      if (!user) {
        b.textContent = opts.label || 'Sign in with Deluxe Main';
        b.onclick = function () { Deluxe.signIn(); };
        el.appendChild(b);
        return;
      }
      var initial = document.createElement('span');
      initial.textContent = (user.name || '?').slice(0, 1).toUpperCase();
      initial.style.cssText = 'width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-grid;place-items:center;font-size:12px';
      b.appendChild(initial);
      b.appendChild(document.createTextNode(user.name));
      b.title = 'Signed in with Deluxe Main';
      var menu = document.createElement('div');
      menu.hidden = true;
      menu.style.cssText = 'position:absolute;right:0;top:calc(100% + 6px);z-index:9999;min-width:200px;padding:6px;border-radius:12px;background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px system-ui,sans-serif';
      function item(label, fn) {
        var i = document.createElement('button');
        i.type = 'button';
        i.textContent = label;
        i.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;border:0;background:none;border-radius:8px;cursor:pointer;font:inherit;color:inherit';
        i.onmouseenter = function () { i.style.background = '#f0edff'; };
        i.onmouseleave = function () { i.style.background = 'none'; };
        i.onclick = function () { menu.hidden = true; fn(); };
        menu.appendChild(i);
      }
      item('Your Deluxe account', function () { window.open(MAIN + '/', '_blank', 'noopener'); });
      item('Sign out', function () { Deluxe.signOut(); });
      b.onclick = function (e) { e.stopPropagation(); menu.hidden = !menu.hidden; };
      document.addEventListener('click', function () { menu.hidden = true; });
      var wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:inline-block';
      wrap.appendChild(b);
      wrap.appendChild(menu);
      el.appendChild(wrap);
    }
    draw(Deluxe.user());
    Deluxe.onChange(draw);
  }

  window.Deluxe = Deluxe;
})();
