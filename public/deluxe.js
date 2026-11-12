/* Sign in with Deluxe Main, for every Deluxe website.
 *
 *   <script src="https://deluxe-main.vercel.app/deluxe.js" data-app="translate"></script>
 *
 *   Deluxe.ready.then(function (user) { ... });   // user, or null when signed out
 *   Deluxe.signIn();                               // goes to Deluxe Main and comes back signed in
 *   Deluxe.signOut();
 *   Deluxe.user();  Deluxe.token();
 *   Deluxe.data.get(key) / put(key, value) / remove(key) / list({ prefix, order, limit }) / batch({ put, delete }) / clear(prefix)
 *   Deluxe.onChange(function (user) { ... });
 *   Deluxe.button(element);                        // sign-in / account button, plus a menu of every Deluxe website
 *   Deluxe.isGuest();  Deluxe.continueAsGuest();   // using the site without an account
 *
 * Signing in is saved: the key lasts 180 days and each visit renews it.
 * Accounts are only ever made on Deluxe Main. A website gets its own key for
 * the signed-in account, which can only reach that website's own data. */
(function () {
  'use strict';
  if (window.Deluxe && window.Deluxe.version) return;

  var script = document.currentScript;
  // Deluxe Main lives where this file was loaded from (on Vercel).
  var MAIN = 'https://deluxe-main.vercel.app';
  try {
    if (script && script.src) MAIN = script.src.replace(/[?#].*$/, '').replace(/\/deluxe\.js$/, '');
  } catch (e) {}
  var SAVED_MS = 180 * 24 * 60 * 60 * 1000;
  var GUEST_KEY = 'deluxe.guest';
  // Every Deluxe website, for the menu.
  var SITES = [
    ['Deluxe Main', MAIN + '/', 'Your Deluxe account', 'main'],
    ['Deluxe Drive', 'https://deluxe-drive-xi.vercel.app', 'Your files', 'drive'],
    ['Deluxe Docs', 'https://deluxe-docs-qtp5.vercel.app', 'Open documents', 'docs'],
    ['Deluxe Mail', 'https://deluxe-mail.vercel.app', 'Your @deluxemail.com inbox', 'mail'],
    ['Deluxe Meet', 'https://deluxe-meet.vercel.app', 'Video calls', 'meet'],
    ['Deluxe Convert', 'https://deluxe-convert.vercel.app', 'Convert files', 'convert'],
    ['Deluxe Transfer', 'https://deluxe-transfer.vercel.app', 'Send files with a code', 'transfer'],
    ['Deluxe Translate', 'https://deluxe-translate-app.vercel.app', 'Text and photos', 'translate'],
    ['YouTube Guider AI', 'https://deluxe-youtube-guider.vercel.app', 'Channel stats', 'youtube']
  ];
  var APP = (script && script.getAttribute('data-app')) || '';
  // data-session-key: a site that keeps its own Deluxe key (Deluxe Drive) can
  // share it. data-passive="1": the site handles coming back from Deluxe Main
  // itself; this file only offers its menus and the 60-second code window.
  var KEY = (script && script.getAttribute('data-session-key')) || 'deluxe.session.v1';
  var PASSIVE = !!(script && script.getAttribute('data-passive') === '1');
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
  function setGuest(on) {
    try {
      if (on) localStorage.setItem(GUEST_KEY, '1');
      else localStorage.removeItem(GUEST_KEY);
    } catch (e) {}
  }

  function finishSignIn() {
    // Came back from Deluxe Main as a guest.
    if (/(?:^#|&)deluxe_guest=1/.test(location.hash || '')) {
      setGuest(true);
      try { history.replaceState(history.state, '', location.pathname + location.search); } catch (e) {}
    }
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
        setGuest(false);
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
    isGuest: function () {
      if (session) return false;
      try { return localStorage.getItem(GUEST_KEY) === '1'; } catch (e) { return false; }
    },
    continueAsGuest: function () { setGuest(true); },
    sites: function () { return SITES.filter(function (x) { return x[1]; }).map(function (x) { return { id: x[3], name: x[0], url: x[1], about: x[2], icon: MAIN + '/icons/' + x[3] + '.svg' }; }); },
    // Each Deluxe website's icon (rounded SVG), e.g. Deluxe.icon('drive').
    icon: function (id) { return MAIN + '/icons/' + id + '.svg'; },
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
      setGuest(false);
      save(null);
      if (t) fetch(MAIN + '/api/auth/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + t }, credentials: 'omit' }).catch(function () {});
    },
    // 60-second codes: make one here for another device, or sign this site in
    // with one made elsewhere.
    makeCode: function () {
      return api('/api/account/device-code', { method: 'POST' });
    },
    signInWithCode: function (code) {
      return fetch(MAIN + '/api/connect/device', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: code, app: APP }),
        credentials: 'omit',
      })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (d) { if (!r.ok) throw new Error(d.error || 'That code did not work.'); return d; }); })
        .then(function (d) {
          setGuest(false);
          save({ token: d.token, user: d.user, app: d.app, exp: Date.now() + (Number(d.expiresIn) || 86400) * 1000, main: MAIN });
          return d.user;
        });
    },
    codeDialog: function (mode) { codeDialog(mode); },
    onChange: function (fn) { listeners.push(fn); return function () { listeners = listeners.filter(function (x) { return x !== fn; }); }; },
    api: api,
    data: null,
    button: button,
  };
  Deluxe.data = data(function () { return Deluxe.app(); });
  Deluxe.ready = (PASSIVE ? Promise.resolve(session ? session.user : null) : finishSignIn()).then(function (user) {
    if (PASSIVE) return user;
    // A key Deluxe Main has ended (signed out there, password changed) is dropped.
    if (session) api('/api/auth/me').then(function (d) {
      // Each visit renews the saved sign-in.
      if (d && d.user && session) { session.user = d.user; session.exp = Date.now() + (Number(d.expiresIn) * 1000 || SAVED_MS); save(session); }
    }).catch(function () {});
    return user;
  });

  // "Sign in with Deluxe Main" (or the account's name), and a menu that links
  // every Deluxe website, for guests too.
  function button(el, opts) {
    opts = opts || {};
    if (!el) return;
    var css = 'font:600 14px/1 system-ui,sans-serif;border-radius:999px;padding:9px 14px;cursor:pointer;border:1px solid rgba(127,127,127,.35);background:' +
      (opts.background || '#6d4aff') + ';color:' + (opts.color || '#fff') + ';display:inline-flex;align-items:center;gap:8px;white-space:nowrap;min-height:38px';
    var menuCss = 'position:absolute;right:0;top:calc(100% + 6px);z-index:9999;min-width:240px;max-width:calc(100vw - 24px);max-height:calc(100vh - 100px);overflow:auto;-webkit-overflow-scrolling:touch;padding:6px;border-radius:12px;background:#fff;color:#111;box-shadow:0 8px 30px rgba(0,0,0,.25);font:14px/1.3 system-ui,sans-serif;text-align:left';
    var open = null;
    document.addEventListener('click', function () { if (open) { open.hidden = true; open = null; } });

    function item(menu, label, sub, fn, href, icon) {
      var i = document.createElement(href ? 'a' : 'button');
      if (href) { i.href = href; i.target = '_blank'; i.rel = 'noopener'; } else i.type = 'button';
      i.style.cssText = 'display:flex;align-items:center;gap:10px;width:100%;box-sizing:border-box;text-align:left;padding:9px 12px;border:0;background:none;border-radius:8px;cursor:pointer;font:inherit;color:inherit;text-decoration:none';
      if (icon) {
        var img = document.createElement('img');
        img.src = icon; img.alt = ''; img.width = 30; img.height = 30;
        img.style.cssText = 'flex:none;width:30px;height:30px;border-radius:9px';
        i.appendChild(img);
      }
      var words = document.createElement('span');
      words.style.cssText = 'display:block;min-width:0';
      words.appendChild(document.createTextNode(label));
      if (sub) {
        var small = document.createElement('div');
        small.textContent = sub;
        small.style.cssText = 'font-size:12px;color:#666;margin-top:2px';
        words.appendChild(small);
      }
      i.appendChild(words);
      i.onmouseenter = function () { i.style.background = '#f0edff'; };
      i.onmouseleave = function () { i.style.background = 'none'; };
      if (fn) i.onclick = function () { menu.hidden = true; open = null; fn(); };
      menu.appendChild(i);
    }
    function heading(menu, text) {
      var h = document.createElement('div');
      h.textContent = text;
      h.style.cssText = 'padding:8px 12px 4px;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#777';
      menu.appendChild(h);
    }
    function withMenu(trigger, fill) {
      var menu = document.createElement('div');
      menu.hidden = true;
      menu.style.cssText = menuCss;
      fill(menu);
      trigger.onclick = function (e) {
        e.stopPropagation();
        if (open && open !== menu) open.hidden = true;
        menu.hidden = !menu.hidden;
        open = menu.hidden ? null : menu;
      };
      var wrap = document.createElement('span');
      wrap.style.cssText = 'position:relative;display:inline-block';
      wrap.appendChild(trigger);
      wrap.appendChild(menu);
      return wrap;
    }
    function siteList(menu) {
      heading(menu, 'Deluxe websites');
      Deluxe.sites().forEach(function (site) {
        if (site.url && location.href.indexOf(site.url) === 0) return;
        item(menu, site.name, site.about, null, site.url, site.icon);
      });
    }
    function narrow() { return (window.innerWidth || 1024) < 560; }
    function draw(user) {
      el.innerHTML = '';
      var box = document.createElement('span');
      box.style.cssText = 'display:inline-flex;gap:8px;align-items:center';
      var b = document.createElement('button');
      b.type = 'button';
      b.style.cssText = css;
      if (!user) {
        // Short on phones, so the buttons fit any site's top bar.
        b.textContent = opts.label || (narrow() ? 'Sign in' : 'Sign in with Deluxe Main');
        b.title = 'Sign in with Deluxe Main';
        b.title = Deluxe.isGuest() ? 'You are using this site as a guest' : 'Sign in with Deluxe Main';
        b.onclick = function () { Deluxe.signIn(); };
        box.appendChild(b);
      } else {
        var initial = document.createElement('span');
        initial.textContent = (user.name || '?').slice(0, 1).toUpperCase();
        initial.style.cssText = 'width:20px;height:20px;border-radius:50%;background:rgba(255,255,255,.25);display:inline-grid;place-items:center;font-size:12px';
        b.appendChild(initial);
        b.appendChild(document.createTextNode(user.name));
        b.title = 'Signed in with Deluxe Main';
        box.appendChild(withMenu(b, function (menu) {
          heading(menu, 'Signed in as ' + user.name);
          item(menu, 'Your Deluxe account', 'Name, password, websites', null, MAIN + '/');
          item(menu, 'Sign in on another device', 'Get a 60-second code', function () { codeDialog('show'); });
          item(menu, 'Sign out', '', function () { Deluxe.signOut(); });
          siteList(menu);
        }));
      }
      // The Deluxe websites menu, for guests and signed-in people alike.
      var g = document.createElement('button');
      g.type = 'button';
      g.setAttribute('aria-label', 'Deluxe websites');
      g.title = 'Deluxe websites';
      g.textContent = '∷';
      g.style.cssText = css + ';padding:9px 12px;background:transparent;color:inherit;font-size:18px';
      box.appendChild(withMenu(g, user ? siteList : function (menu) {
        heading(menu, 'Your Deluxe account');
        item(menu, 'Sign in with Deluxe Main', '', function () { Deluxe.signIn(); }, null, MAIN + '/icons/main.svg');
        item(menu, 'Use a code from another device', 'Signed in elsewhere? Get a 60-second code there', function () { codeDialog('enter'); });
        siteList(menu);
      }));
      el.appendChild(box);
    }
    draw(Deluxe.user());
    Deluxe.onChange(draw);
  }

  // A small window for 60-second codes. 'show' makes a code for another
  // device; 'enter' signs this site in with a code from another device.
  function codeDialog(mode) {
    var old = document.getElementById('deluxe-code-dialog');
    if (old) old.remove();
    var shade = document.createElement('div');
    shade.id = 'deluxe-code-dialog';
    shade.style.cssText = 'position:fixed;inset:0;z-index:10000;display:grid;place-items:center;padding:16px;background:rgba(8,6,20,.55);backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px);font:15px/1.5 system-ui,-apple-system,sans-serif';
    var box = document.createElement('div');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.style.cssText = 'width:min(420px,100%);background:#17142a;color:#f4f2ff;border:1px solid rgba(255,255,255,.12);border-radius:22px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,.5);text-align:left';
    var title = document.createElement('h2');
    title.style.cssText = 'margin:0 0 8px;font-size:20px';
    var text = document.createElement('p');
    text.style.cssText = 'margin:0 0 16px;color:#a9a3c8;font-size:14px';
    var big = 'display:block;width:100%;box-sizing:border-box;padding:16px 10px;border-radius:16px;border:1px solid rgba(255,255,255,.14);background:rgba(255,255,255,.07);color:#fff;text-align:center;font:800 26px/1 ui-monospace,Menlo,monospace;letter-spacing:.1em';
    var note = document.createElement('p');
    note.style.cssText = 'margin:12px 0 0;min-height:1.5em;color:#a9a3c8;font-size:14px;text-align:center';
    var row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:10px;justify-content:flex-end;margin-top:18px';
    function btn(label, primary) {
      var b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.style.cssText = 'font:600 15px system-ui,sans-serif;padding:11px 18px;border-radius:12px;cursor:pointer;border:1px solid rgba(255,255,255,.14);' +
        (primary ? 'background:#6d4aff;color:#fff;border-color:transparent' : 'background:transparent;color:#f4f2ff');
      return b;
    }
    var timer = null;
    function close() { clearInterval(timer); shade.remove(); document.removeEventListener('keydown', onKey); }
    function onKey(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', onKey);
    shade.addEventListener('click', function (e) { if (e.target === shade) close(); });

    if (mode === 'show') {
      title.textContent = 'Sign in on another device';
      text.textContent = 'On the other device, open any Deluxe website, tap Use a code (or Have a code from another device? on Deluxe Main) and type:';
      var code = document.createElement('div');
      code.style.cssText = big;
      code.textContent = '····-····-····';
      var again = btn('New code', false);
      var done = btn('Done', true);
      done.onclick = close;
      var make = function () {
        clearInterval(timer);
        code.textContent = '····-····-····';
        note.textContent = 'Making a code…';
        Deluxe.makeCode().then(function (d) {
          code.textContent = d.code;
          var left = Number(d.expiresIn) || 60;
          var tick = function () {
            note.textContent = left > 0 ? 'Works once, for ' + left + ' more seconds.' : 'This code ran out. Tap New code.';
            if (left <= 0) { clearInterval(timer); code.textContent = '····-····-····'; }
            left -= 1;
          };
          tick();
          timer = setInterval(tick, 1000);
        }).catch(function (e) { note.textContent = e.message; });
      };
      again.onclick = make;
      row.append(again, done);
      box.append(title, text, code, note, row);
      make();
    } else {
      title.textContent = 'Sign in with a code';
      text.textContent = 'On a device where you are signed in, open any Deluxe website (or Deluxe Main) and choose Sign in on another device. Type the code here within 60 seconds.';
      var input = document.createElement('input');
      input.style.cssText = big + ';font-size:22px;text-transform:uppercase;outline:none';
      input.placeholder = 'ABCD-EFGH-JKLM';
      input.setAttribute('aria-label', 'Code from your other device');
      input.autocomplete = 'one-time-code';
      input.spellcheck = false;
      var cancel = btn('Cancel', false);
      var go = btn('Sign in', true);
      cancel.onclick = close;
      var busy = false;
      var submit = function () {
        var value = input.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
        if (value.length !== 12) { note.textContent = 'The code has 12 letters and numbers.'; return; }
        if (busy) return;
        busy = true;
        go.disabled = true;
        note.textContent = 'Signing in…';
        Deluxe.signInWithCode(value).then(function (user) {
          close();
          if (user && user.name) Deluxe._notice && Deluxe._notice('Signed in as ' + user.name);
        }).catch(function (e) { note.textContent = e.message; }).then(function () { busy = false; go.disabled = false; });
      };
      go.onclick = submit;
      input.addEventListener('keydown', function (e) { if (e.key === 'Enter') submit(); });
      input.addEventListener('input', function () { if (input.value.toUpperCase().replace(/[^A-Z0-9]/g, '').length === 12) submit(); });
      row.append(cancel, go);
      box.append(title, text, input, note, row);
      setTimeout(function () { input.focus(); }, 30);
    }
    shade.appendChild(box);
    document.body.appendChild(shade);
  }

  window.Deluxe = Deluxe;
})();
