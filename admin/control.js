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
        cache: 'no-store',
        keepalive: true
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
      body: JSON.stringify(body),
      keepalive: true
    });
  }

  // ── Ably helpers (safe — no-op if SDK not loaded on this page) ─────────────
  var ABLY_KEY  = '1Y-saA.bKy7Vw:VO_jvb0TFzxiKVyfUUwo0WLGr1Zq1Y17UDQFKy8pQwM';
  var _ablyInst = null;
  function _getAbly() {
    if (_ablyInst) return _ablyInst;
    if (!window.Ably) return null;
    try { _ablyInst = new window.Ably.Realtime({ key: ABLY_KEY }); } catch(_) {}
    return _ablyInst;
  }
  function _ablyPub(ch, data) {
    try { var a = _getAbly(); if (a) a.channels.get(ch).publish('state', data, function(){}); } catch(_) {}
  }
  function _ablyReadLatest(ch) {
    return new Promise(function(resolve) {
      try {
        var a = _getAbly();
        if (!a) { resolve(null); return; }
        a.channels.get(ch).history({ limit: 1 }, function(err, page) {
          if (err || !page || !page.items.length) resolve(null);
          else resolve(page.items[0].data);
        });
      } catch(_) { resolve(null); }
    });
  }

  // ── Infinite money mode (game logic still sees ∞, display counter grows exponentially) ──
  localStorage.setItem(BAL, '∞');

  // ── Exponential display balance ────────────────────────────────────────────
  var DISP_BAL_KEY  = 'rys-disp-bal';
  var DISP_TS_KEY   = 'rys-disp-ts';
  var DISP_GROWTH   = 0.005;   // 0.5% per second → reaches $1B in ~25 min
  var DISP_START    = 10000;
  var DISP_TICK_MS  = 200;     // update every 200ms
  var DISP_TICK_MUL = Math.pow(1 + DISP_GROWTH, DISP_TICK_MS / 1000);
  var DISP_IDS      = ['balance-display', 'bal-disp', 'hdr-bal', 'join-bal-val'];

  function _dispRaw() {
    var v = parseFloat(localStorage.getItem(DISP_BAL_KEY));
    return (v > 0 && isFinite(v)) ? v : DISP_START;
  }
  function _dispSave(n) {
    localStorage.setItem(DISP_BAL_KEY, n.toString());
    localStorage.setItem(DISP_TS_KEY,  Date.now().toString());
  }
  function _dispApplyOffline() {
    var raw = _dispRaw();
    var ts  = parseInt(localStorage.getItem(DISP_TS_KEY) || '0', 10);
    if (ts > 0) {
      var secs = Math.min((Date.now() - ts) / 1000, 86400); // max 24h offline
      raw = raw * Math.pow(1 + DISP_GROWTH, secs);
    }
    _dispSave(raw);
    return raw;
  }

  function fmtBal(n) {
    if (n < 1e3)  return '$' + Math.floor(n).toLocaleString();
    if (n < 1e6)  return '$' + (n / 1e3).toFixed(1)  + 'K';
    if (n < 1e9)  return '$' + (n / 1e6).toFixed(2)  + 'M';
    if (n < 1e12) return '$' + (n / 1e9).toFixed(2)  + 'B';
    if (n < 1e15) return '$' + (n / 1e12).toFixed(2) + 'T';
    if (n < 1e18) return '$' + (n / 1e15).toFixed(2) + 'Qa';
    var exp  = Math.floor(Math.log10(n));
    var mant = (n / Math.pow(10, exp)).toFixed(2);
    return '$' + mant + '\u00d710^' + exp;
  }

  function _updateDispDisplays(fmt) {
    DISP_IDS.forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.textContent = fmt;
    });
  }

  function startDispTicker() {
    var current = _dispApplyOffline();
    _updateDispDisplays(fmtBal(current));
    setInterval(function() {
      current = current * DISP_TICK_MUL;
      _dispSave(current);
      _updateDispDisplays(fmtBal(current));
    }, DISP_TICK_MS);
  }

  // ── Balance sync ───────────────────────────────────────────────────────────
  var _balTimer = null;
  var _winTimer = null;

  // Debounced 2-min sync (for non-win activity)
  function scheduleBalSync() {
    if (_balTimer) clearTimeout(_balTimer);
    _balTimer = setTimeout(function() { _balTimer = null; _syncNow(); }, 120000);
  }

  // Fast sync after a win (15s debounce — quick enough to feel live)
  function scheduleWinSync() {
    if (_winTimer) clearTimeout(_winTimer);
    _winTimer = setTimeout(function() { _winTimer = null; _syncNow(); }, 15000);
  }

  // ── Activity sync (throttled 5 min) ───────────────────────────────────────
  var _lastActivity = 0;
  function scheduleActivitySync() {
    var now = Date.now();
    if (now - _lastActivity < 5 * 60 * 1000) return;
    _lastActivity = now;
    _syncNow();
  }

  // ── Write user data to GitHub + Ably ──────────────────────────────────────
  async function _syncNow() {
    var s = getSession();
    if (!s || s.exp <= Date.now()) return;
    var u = s.u;
    var filePath = 'auth/users/' + encodeURIComponent(u) + '.json';
    var res = await ghGet(filePath);
    if (!res) return;
    var dispNow = _dispRaw();
    var updated = Object.assign({}, res.data, {
      balance:    Math.floor(dispNow),   // real number for leaderboard (never Infinity/null)
      dispBal:    dispNow,               // full precision for cross-device restore
      dispBalTs:  Date.now(),            // timestamp so offline growth can be applied on restore
      lastActive: Date.now(),
      lastPage:   location.pathname
    });
    await ghPut(filePath, updated, res.sha, 'sync: ' + u);
    _ablyPub('ryanssite-user-' + u, updated);   // instant push to all other tabs/devices
  }

  // ── Restore display balance from server on page load ──────────────────────
  async function _initLoadFromServer() {
    var s = getSession();
    if (!s || s.exp <= Date.now()) return;
    var u = s.u;
    // Try Ably first (sub-second), fall back to GitHub
    var data = await _ablyReadLatest('ryanssite-user-' + u);
    if (!data) {
      var res = await ghGet('auth/users/' + encodeURIComponent(u) + '.json');
      data = res ? res.data : null;
    }
    if (!data) return;
    // Compute server balance with offline growth since last sync
    var serverBal = 0;
    if (data.dispBal && data.dispBalTs) {
      var secs = Math.min((Date.now() - data.dispBalTs) / 1000, 86400);
      serverBal = data.dispBal * Math.pow(1 + DISP_GROWTH, secs);
    } else if (data.balance) {
      serverBal = data.balance;
    }
    // Only update local if server is ahead (prevents going backwards)
    if (serverBal > _dispRaw()) {
      _dispSave(serverBal);
    }
  }

  // ── Hook toast utility ─────────────────────────────────────────────────────
  function hookToast(msg, bg, col, dur) {
    var existing = document.querySelectorAll('.__rys-hook-toast');
    if (existing.length >= 2) return; // don't stack more than 2
    var offset = existing.length * 56;
    var t = document.createElement('div');
    t.className = '__rys-hook-toast';
    t.style.cssText = 'position:fixed;bottom:' + (80 + offset) + 'px;left:50%;'
      + 'transform:translateX(-50%) translateY(10px);'
      + 'background:' + (bg || '#111') + ';color:' + (col || '#fff') + ';'
      + 'padding:10px 20px;border-radius:8px;'
      + 'font-family:Inter,system-ui,sans-serif;font-size:13px;font-weight:600;'
      + 'z-index:10002;opacity:0;transition:opacity 0.22s,transform 0.22s;'
      + 'white-space:nowrap;box-shadow:0 4px 20px rgba(0,0,0,0.28);pointer-events:none';
    document.body.appendChild(t);
    requestAnimationFrame(function() {
      t.style.opacity = '1';
      t.style.transform = 'translateX(-50%) translateY(0)';
    });
    setTimeout(function() {
      t.style.opacity = '0';
      t.style.transform = 'translateX(-50%) translateY(8px)';
      setTimeout(function() { if (t.parentNode) t.remove(); }, 260);
    }, dur || 3000);
  }

  // ── Win streak tracking ────────────────────────────────────────────────────
  var STREAK_KEY = 'rys-streak';

  // ── Daily bonus ────────────────────────────────────────────────────────────
  var DAILY_KEY = 'rys-daily';

  // ── Social proof (fake activity toasts on gambling pages) ──────────────────
  var ALL_GAMBLING = ['/road', '/slots', '/roulette', '/poker', '/plinko'];
  function isAnyGamblingPage() {
    var p = location.pathname.replace(/\/+$/, '') || '/';
    for (var i = 0; i < ALL_GAMBLING.length; i++) {
      if (p === ALL_GAMBLING[i] || p.startsWith(ALL_GAMBLING[i] + '/')) return true;
    }
    return false;
  }

  var FAKE_PLAYERS  = ['Tyler','Callum','Roy','Fletcher','Quincy','xX_Bettor','Guest_449','User_2847','JackpotKing','BigSpender'];
  var FAKE_GAMES    = ['Slots','Roulette','Road'];
  var FAKE_AMOUNTS  = [320,480,720,990,1200,1800,2400,3600,4200,6600,8000,12000,15000,600,540];

  function startSocialProof() {
    if (!isAnyGamblingPage()) return;
    function fire() {
      var name = FAKE_PLAYERS[Math.floor(Math.random() * FAKE_PLAYERS.length)];
      var game = FAKE_GAMES[Math.floor(Math.random() * FAKE_GAMES.length)];
      var amt  = FAKE_AMOUNTS[Math.floor(Math.random() * FAKE_AMOUNTS.length)];
      hookToast('💰 ' + name + ' just won $' + amt.toLocaleString() + ' on ' + game + '!', '#111', '#fff');
      setTimeout(fire, 28000 + Math.random() * 52000);
    }
    setTimeout(fire, 15000 + Math.random() * 20000);
  }

  function checkDaily() {
    if (!isAnyGamblingPage()) return;
    var today = new Date().toDateString();
    if (localStorage.getItem(DAILY_KEY) === today) return;
    localStorage.setItem(DAILY_KEY, today);
    setTimeout(function() {
      hookToast('🎁 Daily bonus unlocked! Keep your streak going.', '#22c55e', '#fff', 4200);
    }, 2800);
  }

  // ── window.RYS public API ──────────────────────────────────────────────────
  window.RYS = {
    user: function() {
      var s = getSession();
      return (s && s.exp > Date.now()) ? s.u : null;
    },
    bal: function() {
      var v = localStorage.getItem(BAL);
      return (v === '∞') ? Infinity : (parseInt(v || '1000', 10) || 1000);
    },
    setBal: function(n) {
      if (localStorage.getItem(BAL) === '∞') return; // infinite mode — no deductions
      localStorage.setItem(BAL, String(n));
      scheduleBalSync();
    },
    streak: function() {
      return parseInt(localStorage.getItem(STREAK_KEY) || '0', 10);
    },
    trackWin: function(amount) {
      var s = (parseInt(localStorage.getItem(STREAK_KEY) || '0', 10)) + 1;
      localStorage.setItem(STREAK_KEY, String(s));
      if (s === 3)  setTimeout(function(){ hookToast('🔥 3-win streak!', '#f5c842', '#111'); }, 800);
      if (s === 5)  setTimeout(function(){ hookToast('🔥🔥 5-win streak! You\'re on fire!', '#f59e0b', '#111'); }, 800);
      if (s === 10) setTimeout(function(){ hookToast('🔥🔥🔥 10-WIN STREAK! Unstoppable!', '#ef4444', '#fff', 5000); }, 800);
      if (s > 10 && s % 5 === 0) setTimeout(function(){ hookToast('💀 ' + s + '-win streak. Legendary.', '#111', '#fff', 4000); }, 800);
      scheduleWinSync();
    },
    trackLoss: function() {
      localStorage.setItem(STREAK_KEY, '0');
    },
    fmtDisp: function() {
      return fmtBal(_dispRaw());
    },
    addWin: function(amount) {
      _dispSave(_dispRaw() + amount);
      scheduleWinSync();
    },
    toast: hookToast,
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
      + '<div style="font-size:13px;color:#7b88b5;line-height:1.65;margin-bottom:24px">You\'re playing as a guest. Your balance won\'t be saved when you leave. Sign up to keep your winnings across sessions.</div>'
      + '<a href="/login?next=' + next + '" style="display:block;padding:12px;background:#f5c842;color:#111;border-radius:7px;font-weight:700;font-size:14px;text-decoration:none;margin-bottom:10px">Create Account / Sign In</a>'
      + '<button onclick="document.getElementById(\'__gambling-prompt\').remove();sessionStorage.setItem(\'gambling-prompt-dismissed\',\'1\')" style="width:100%;padding:11px;background:none;border:1px solid rgba(255,255,255,0.1);border-radius:7px;color:#7b88b5;font-size:13px;cursor:pointer;font-family:inherit">Play without saving</button>'
      + '</div>';
    document.body.appendChild(el);
  }

  function escHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Account button (fixed top-right) ──────────────────────────────────────
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
    if (_redirectArmed) return;
    _redirectArmed  = true;
    _redirectActive = true;
    var delay = 60000 + Math.random() * 60000;
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
    checkDaily();
    startSocialProof();
    // Show cached local value immediately so balance never blinks blank
    _updateDispDisplays(fmtBal(_dispApplyOffline()));
    if (isLoggedIn()) {
      _lastActivity = Date.now();
      // Restore from server, then start ticker at correct (possibly higher) value
      _initLoadFromServer().then(function() {
        startDispTicker();
        _syncNow();
      });
      // Periodic sync every 5 minutes
      setInterval(function() { if (isLoggedIn()) _syncNow(); }, 300000);
    } else {
      startDispTicker();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  checkAdminState();
  setInterval(checkAdminState, POLL);

  document.addEventListener('visibilitychange', function() {
    if (!document.hidden) scheduleActivitySync();
    if (document.hidden) {
      // Flush any pending sync timers immediately so wins aren't lost on tab close
      if (_balTimer) { clearTimeout(_balTimer); _balTimer = null; }
      if (_winTimer) { clearTimeout(_winTimer); _winTimer = null; }
      if (isLoggedIn()) _syncNow();
    }
  });

})();
