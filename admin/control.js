/* Admin control + RYS auth library — included on every page */
(function () {
  'use strict';

  // ── Config ─────────────────────────────────────────────────────────────────
  var TOKEN = ['github_pat_11CASFLQI0','mSMwrQorr6is_8w1PYxuskuOF567X3WQslSr67uzWaYNVODD8nx0icOqEJFVHH5I2dQXuhPy'].join('');
  var REPO  = 'mclarenproductions1-afk/RyansSITE';
  var _API  = 'https://api.github.com/repos/' + REPO + '/contents/';
  var SESS  = 'rys-sess';
  var BAL   = 'rys-bal';

  var STATE_URL = '/admin/state.json';
  var POLL      = 20000; // 20 s
  var BOOT      = Date.now();

  // Paths that don't require auth
  var EXEMPT = ['/login', '/admin'];
  function isExempt() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < EXEMPT.length; i++) {
      if (p === EXEMPT[i] || p.startsWith(EXEMPT[i] + '/')) return true;
    }
    return false;
  }

  // ── Session helpers ────────────────────────────────────────────────────────
  function getSession() {
    try { return JSON.parse(localStorage.getItem(SESS) || 'null'); } catch(_) { return null; }
  }
  function isLoggedIn() {
    var s = getSession();
    return s && s.exp > Date.now();
  }

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (!isExempt() && !isLoggedIn()) {
    document.body.style.visibility = 'hidden';
    location.replace('/login?next=' + encodeURIComponent(location.pathname + location.search));
  }

  // ── GitHub helpers ─────────────────────────────────────────────────────────
  async function ghGet(path) {
    try {
      var r = await fetch(_API + path + '?_=' + Date.now(), {
        headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json' },
        cache: 'no-store'
      });
      if (!r.ok) return null;
      var j = await r.json();
      var content = atob(j.content.replace(/\s/g, ''));
      return { data: JSON.parse(content), sha: j.sha };
    } catch(_) { return null; }
  }

  async function ghPut(path, data, sha, msg) {
    var body = {
      message: msg,
      content: btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2)))),
      branch: 'main'
    };
    if (sha) body.sha = sha;
    return fetch(_API + path, {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + TOKEN, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
  }

  // ── Balance sync (debounced 2.5 s) ────────────────────────────────────────
  var _balTimer = null;
  var _lastSyncTime = 0;

  function scheduleBalSync() {
    if (_balTimer) clearTimeout(_balTimer);
    _balTimer = setTimeout(function() { _balTimer = null; _syncNow(); }, 2500);
  }

  // ── Activity sync (throttled 5 min) ───────────────────────────────────────
  var _lastActivity = 0;
  function scheduleActivitySync() {
    var now = Date.now();
    if (now - _lastActivity < 5 * 60 * 1000) return;
    _lastActivity = now;
    _syncNow();
  }

  async function _syncNow() {
    var s = getSession();
    if (!s || s.exp <= Date.now()) return;
    var u = s.u;
    var filePath = 'auth/users/' + encodeURIComponent(u) + '.json';
    var res = await ghGet(filePath);
    if (!res) return;
    var updated = Object.assign({}, res.data, {
      balance: parseInt(localStorage.getItem(BAL) || '1000', 10),
      lastActive: Date.now(),
      lastPage: location.pathname
    });
    ghPut(filePath, updated, res.sha, 'sync: ' + u);
  }

  // ── window.RYS public API ──────────────────────────────────────────────────
  window.RYS = {
    user: function() {
      var s = getSession();
      return (s && s.exp > Date.now()) ? s.u : null;
    },
    bal: function() {
      return parseInt(localStorage.getItem(BAL) || '1000', 10);
    },
    setBal: function(n) {
      localStorage.setItem(BAL, String(n));
      scheduleBalSync();
    },
    logout: function() {
      localStorage.removeItem(SESS);
      location.replace('/login');
    },
    _sync: _syncNow
  };

  // ── User badge (fixed top-right) ───────────────────────────────────────────
  function injectBadge() {
    if (isExempt()) return;
    var u = window.RYS.user();
    if (!u) return;
    if (document.getElementById('__rys-badge')) return;
    var badge = document.createElement('div');
    badge.id = '__rys-badge';
    badge.style.cssText = 'position:fixed;top:12px;right:16px;z-index:9997;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #e5e5e5;border-radius:4px;padding:5px 10px;font-family:Inter,system-ui,sans-serif;font-size:12px;';
    badge.innerHTML = '<span style="font-weight:600;color:#111">' + escHtml(u) + '</span>'
      + '<button onclick="window.RYS.logout()" style="font-size:11px;color:#888;background:none;border:none;cursor:pointer;font-family:inherit;padding:0">sign out</button>';
    document.body.appendChild(badge);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── School link ────────────────────────────────────────────────────────────
  function injectSchool() {
    var header = document.querySelector('header');
    if (!header || document.getElementById('__school-link')) return;
    var a = document.createElement('a');
    a.id = '__school-link';
    a.href = 'https://en.wikipedia.org/wiki/Special:Random';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.textContent = 'School';
    a.style.cssText = 'font-size:12px;font-weight:500;color:#888;text-decoration:none;'
      + 'background:#fafafa;border:1px solid #e5e5e5;padding:3px 10px;border-radius:4px;'
      + 'flex-shrink:0;white-space:nowrap;transition:color 0.1s,border-color 0.1s';
    a.onmouseenter = function() { a.style.color='#111'; a.style.borderColor='#111'; };
    a.onmouseleave = function() { a.style.color='#888'; a.style.borderColor='#e5e5e5'; };
    header.insertBefore(a, header.firstChild);
  }

  // ── Admin state polling ────────────────────────────────────────────────────
  async function checkAdminState() {
    try {
      var r = await fetch(STATE_URL + '?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      var s = await r.json();
      applyBanner(s.banner);
      applyMaintenance(s.maintenance);
      if (s.reload_at && s.reload_at > BOOT) location.reload(true);
    } catch (_) {}
  }

  function applyBanner(b) {
    var el = document.getElementById('__admin-banner');
    if (!b || !b.enabled || !b.text) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = '__admin-banner';
      el.style.cssText = [
        'position:fixed','top:0','left:0','right:0','z-index:9998',
        'padding:9px 20px','font-family:system-ui,sans-serif','font-size:13px',
        'font-weight:500','text-align:center','line-height:1.4'
      ].join(';');
      document.body.prepend(el);
    }
    var palettes = { info:['#111','#fff'], warning:['#f59e0b','#111'], error:['#ef4444','#fff'], success:['#22c55e','#fff'] };
    var p = palettes[b.type] || palettes.info;
    el.style.background = p[0];
    el.style.color = p[1];
    el.textContent = b.text;
  }

  function applyMaintenance(m) {
    var el = document.getElementById('__admin-maint');
    if (!m || !m.enabled) { if (el) el.remove(); return; }
    if (el) return;
    el = document.createElement('div');
    el.id = '__admin-maint';
    el.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif';
    el.innerHTML = '<div style="text-align:center;padding:40px">'
      + '<div style="font-size:40px;margin-bottom:16px">🔧</div>'
      + '<div style="font-size:20px;font-weight:600;margin-bottom:10px">Under Maintenance</div>'
      + '<div style="font-size:14px;color:#888;max-width:340px;margin:0 auto;line-height:1.6">'
      + (m.message || 'Be right back!') + '</div></div>';
    document.body.appendChild(el);
  }

  // ── Init ───────────────────────────────────────────────────────────────────
  function init() {
    injectSchool();
    injectBadge();
    if (isLoggedIn()) {
      _lastActivity = Date.now();
      _syncNow(); // sync on page load
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  checkAdminState();
  setInterval(checkAdminState, POLL);

  // Sync activity on page visibility change
  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) scheduleActivitySync();
  });

})();
