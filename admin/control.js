/* Admin control poller — included on every page */
(function () {
  'use strict';
  var STATE = '/admin/state.json';
  var POLL  = 20000; // 20 s
  var BOOT  = Date.now();

  async function check() {
    try {
      var r = await fetch(STATE + '?_=' + Date.now(), { cache: 'no-store' });
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
        'position:fixed', 'top:0', 'left:0', 'right:0', 'z-index:9998',
        'padding:9px 20px', 'font-family:system-ui,sans-serif', 'font-size:13px',
        'font-weight:500', 'text-align:center', 'line-height:1.4'
      ].join(';');
      document.body.prepend(el);
    }
    var palettes = { info: ['#111','#fff'], warning: ['#f59e0b','#111'], error: ['#ef4444','#fff'], success: ['#22c55e','#fff'] };
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

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', injectSchool);
  } else {
    injectSchool();
  }

  check();
  setInterval(check, POLL);
})();
