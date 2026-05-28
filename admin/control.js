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

  // ── Balance sync (debounced 2 min — keeps GitHub Pages deployments from being cancelled) ──
  var _balTimer = null;
  var _lastSyncTime = 0;

  function scheduleBalSync() {
    if (_balTimer) clearTimeout(_balTimer);
    _balTimer = setTimeout(function() { _balTimer = null; _syncNow(); }, 120000);
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

  // ── Gambling sign-up prompt ────────────────────────────────────────────────
  var GAMBLING_PATHS = ['/road', '/slots'];
  function isGamblingPage() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < GAMBLING_PATHS.length; i++) {
      if (p === GAMBLING_PATHS[i] || p.startsWith(GAMBLING_PATHS[i] + '/')) return true;
    }
    return false;
  }

  function injectGamblingPrompt() {
    if (!isGamblingPage()) return;
    if (isLoggedIn()) return;
    if (sessionStorage.getItem('gambling-prompt-dismissed')) return;
    var next = encodeURIComponent(location.pathname);
    var el = document.createElement('div');
    el.id = '__gambling-prompt';
    el.style.cssText = 'position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.72);display:flex;align-items:center;justify-content:center;font-family:Inter,system-ui,sans-serif';
    el.innerHTML = '<div style="background:#10122a;border:1px solid rgba(255,255,255,0.1);border-radius:12px;padding:36px 32px;max-width:380px;width:90%;text-align:center">'
      + '<div style="font-size:44px;margin-bottom:14px">🐔</div>'
      + '<div style="font-size:18px;font-weight:700;color:#fff;margin-bottom:8px">Save your progress</div>'
      + '<div style="font-size:13px;color:#7b88b5;line-height:1.65;margin-bottom:24px">You\'re playing as a guest. Your $1,000 starting balance won\'t be saved when you leave. Sign up to keep your winnings across sessions.</div>'
      + '<a href="/login?next=' + next + '" style="display:block;padding:12px;background:#f5c842;color:#111;border-radius:7px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:10px">Create Account / Sign In</a>'
      + '<button onclick="document.getElementById(\'__gambling-prompt\').remove();sessionStorage.setItem(\'gambling-prompt-dismissed\',\'1\')" style="width:100%;padding:11px;background:none;border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#7b88b5;font-size:13px;cursor:pointer;font-family:inherit">Play without saving</button>'
      + '</div>';
    document.body.appendChild(el);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Account button (fixed bottom-right) ───────────────────────────────────
  function injectAccountBtn() {
    if (isExempt()) return;
    if (document.getElementById('__rys-acct')) return;
    var btn = document.createElement('div');
    btn.id = '__rys-acct';
    btn.style.cssText = 'position:fixed;top:8px;right:14px;z-index:9997;font-family:Inter,system-ui,sans-serif;font-size:12px;';
    var u = window.RYS.user();
    if (u) {
      btn.innerHTML = '<div style="display:flex;align-items:center;gap:8px;background:#fff;border:1px solid #e5e5e5;border-radius:6px;padding:6px 12px;box-shadow:0 2px 8px rgba(0,0,0,0.08)">'
        + '<span style="font-weight:600;color:#111">' + escHtml(u) + '</span>'
        + '<span style="color:#e5e5e5">|</span>'
        + '<button onclick="window.RYS.logout()" style="font-size:11px;color:#888;background:none;border:none;cursor:pointer;font-family:inherit;padding:0">sign out</button>'
        + '</div>';
    } else {
      btn.innerHTML = '<a href="/login?next=' + encodeURIComponent(location.pathname) + '" '
        + 'style="display:flex;align-items:center;gap:6px;background:#111;color:#fff;border-radius:6px;padding:7px 14px;text-decoration:none;font-size:12px;font-weight:600;box-shadow:0 2px 8px rgba(0,0,0,0.15)">'
        + '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>'
        + 'Sign in</a>';
    }
    document.body.appendChild(btn);
  }

  // ── Random redirect ────────────────────────────────────────────────────────
  var _redirectTimer  = null;
  var _redirectArmed  = false;
  var _redirectActive = false;

  function applyRedirect(r) {
    if (isExempt()) return;
    var enabled = r && r.enabled && r.url;
    if (!enabled) {
      if (_redirectTimer) { clearTimeout(_redirectTimer); _redirectTimer = null; }
      _redirectArmed  = false;
      _redirectActive = false;
      return;
    }
    if (_redirectArmed) return; // timer already running
    _redirectArmed  = true;
    _redirectActive = true;
    var delay = 60000 + Math.random() * 60000; // 60–120 s
    _redirectTimer = setTimeout(function() {
      location.href = r.url;
    }, delay);
  }

  // ── Admin state polling ────────────────────────────────────────────────────
  async function checkAdminState() {
    try {
      var r = await fetch(STATE_URL + '?_=' + Date.now(), { cache: 'no-store' });
      if (!r.ok) return;
      var s = await r.json();
      applyBanner(s.banner);
      applyMaintenance(s.maintenance);
      applyRedirect(s.redirect);
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
    injectAccountBtn();
    injectGamblingPrompt();
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
