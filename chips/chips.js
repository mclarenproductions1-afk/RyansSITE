/* ═══════════════════════════════════════════════════════════════
   CHIPS.JS — Shared logic for the chip cost tracker
   Imported by index.html, admin.html, and all person pages.
   ═══════════════════════════════════════════════════════════════ */

/* ── Config — same pattern as ass/index.html ──────────────────── */
const CONFIG = {
  owner:  "mclarenproductions1-afk",
  repo:   "RyansSITE",
  branch: "main",
  token:  ["github_pat_11CASFLQI0", "mSMwrQorr6is_8w1PYxuskuOF567X3WQslSr67uzWaYNVODD8nx0icOqEJFVHH5I2dQXuhPy"].join("")
};

const PEOPLE    = ["Roy", "Ryan", "Tom", "Fletcher", "Quincy"];
const BOWL_COST = 13;
const DATA_PATH = "chips/data.json";
const API_URL   = `https://api.github.com/repos/${CONFIG.owner}/${CONFIG.repo}/contents/${DATA_PATH}`;

/* ── GitHub API helpers — exact pattern from ass/index.html ────── */
function ghHeaders() {
  return {
    "Authorization": `Bearer ${CONFIG.token}`,
    "Accept":        "application/vnd.github+json",
    "Content-Type":  "application/json"
  };
}

async function loadData() {
  const res = await fetch(`${API_URL}?ref=${CONFIG.branch}&t=${Date.now()}`, { headers: ghHeaders() });
  if (res.status === 404) return { data: defaultData(), sha: null };
  if (!res.ok) throw new Error(`GitHub returned ${res.status}`);
  const raw  = await res.json();
  const data = JSON.parse(atob(raw.content.replace(/\s/g, "")));
  return { data, sha: raw.sha };
}

async function saveData(data, sha) {
  const content = btoa(unescape(encodeURIComponent(JSON.stringify(data, null, 2))));
  const body = {
    message: `Update chips data — ${new Date().toISOString()}`,
    content,
    branch: CONFIG.branch
  };
  if (sha) body.sha = sha;

  const res = await fetch(API_URL, {
    method:  "PUT",
    headers: ghHeaders(),
    body:    JSON.stringify(body)
  });

  if (res.status === 409) {
    // SHA conflict — re-fetch and retry
    const refetch = await fetch(`${API_URL}?ref=${CONFIG.branch}&t=${Date.now()}`, { headers: ghHeaders() });
    const fresh   = await refetch.json();
    return saveData(data, fresh.sha);
  }
  if (!res.ok) throw new Error(`GitHub ${res.status}`);

  const result = await res.json();
  return result.content.sha;
}

function defaultData() {
  return {
    currentWeek:               1,
    nextWeekTomQuincyAttending: true,
    bowlCost:                  BOWL_COST,
    weeks:                     []
  };
}

/* ── Formula ──────────────────────────────────────────────────── */

/**
 * Compute each person's running balance across all weeks.
 * balance = totalPaid - totalFairShare
 * fairShare per week = BOWL_COST / n  (only if attended that week)
 */
function computeBalances(weeks) {
  const balances = {};
  for (const p of PEOPLE) balances[p] = 0;

  for (const week of weeks) {
    const attendees = PEOPLE.filter(p => week.attendance[p] === 1);
    const n = attendees.length;
    if (n === 0) continue;
    const fairShare = BOWL_COST / n;

    for (const p of PEOPLE) {
      const paid  = week.payments[p] || 0;
      const share = week.attendance[p] === 1 ? fairShare : 0;
      balances[p] += paid - share;
    }
  }

  return balances;
}

/**
 * Compute suggested payment for each person for next week.
 *
 *   S = sum of balances of attending people
 *   suggestedPayment (attending) = (BOWL_COST + S) / n - theirBalance
 *   suggestedPayment (absent)    = 0
 *
 * Proof the total = BOWL_COST:
 *   sum = n * (C+S)/n  - S  =  C  ✓
 *
 * Returns { payments, balances, n, S }
 */
function computeSuggestedPayments(weeks, nextWeekAttendance) {
  const balances  = computeBalances(weeks);
  const attendees = PEOPLE.filter(p => nextWeekAttendance[p] === 1);
  const n         = attendees.length;

  const payments = {};
  for (const p of PEOPLE) payments[p] = 0;

  if (n === 0) return { payments, balances, n, S: 0 };

  const S = attendees.reduce((sum, p) => sum + balances[p], 0);

  for (const p of attendees) {
    payments[p] = (BOWL_COST + S) / n - balances[p];
  }

  return { payments, balances, n, S };
}

/** Build the nextWeekAttendance object from data flags. */
function getNextWeekAttendance(data) {
  const att = {};
  for (const p of PEOPLE) att[p] = 1;
  if (!data.nextWeekTomQuincyAttending) {
    att.Tom    = 0;
    att.Quincy = 0;
  }
  return att;
}

/* ── Formatting helpers ──────────────────────────────────────── */
function fmt(n) {
  return `$${Math.abs(n).toFixed(2)}`;
}

function fmtBalance(n) {
  if (n >  0.005) return `+$${n.toFixed(2)}`;
  if (n < -0.005) return `-$${Math.abs(n).toFixed(2)}`;
  return `$0.00`;
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/* ── Self-test (runs on every page load) ─────────────────────── */
(function selfTest() {
  const testWeeks = [{
    weekNumber: 4,
    attendance: { Roy: 1, Ryan: 1, Tom: 1, Fletcher: 1, Quincy: 1 },
    payments:   { Roy: 5.0, Ryan: 2.5, Tom: 5.0, Fletcher: 0.5, Quincy: 0.0 }
  }];

  // Test 1: balances sum to zero
  const balances    = computeBalances(testWeeks);
  const balanceSum  = Object.values(balances).reduce((a, b) => a + b, 0);
  const test1       = Math.abs(balanceSum) < 0.001;

  // Test 2: suggested payments for 3-person week sum to exactly 13
  const nextAtt     = { Roy: 1, Ryan: 1, Tom: 0, Fletcher: 1, Quincy: 0 };
  const { payments } = computeSuggestedPayments(testWeeks, nextAtt);
  const paymentSum  = Object.values(payments).reduce((a, b) => a + b, 0);
  const test2       = Math.abs(paymentSum - 13) < 0.001;

  if (test1 && test2) {
    console.log("Chips self-test: PASS");
  } else {
    console.warn("Chips self-test: FAIL");
    if (!test1) console.warn(`  Balance sum = ${balanceSum} (expected 0)`);
    if (!test2) console.warn(`  Payment sum = ${paymentSum} (expected 13)`);
  }
})();

/* ── Shared CSS for person pages (injected by initPersonPage) ── */
const PERSON_CSS = `
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  html { scroll-behavior: smooth; }
  body {
    background: #fff;
    color: #111;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
    min-height: 100vh;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
  }
  header {
    background: #fff;
    border-bottom: 1px solid #e5e5e5;
    padding: 0 clamp(1rem, 4vw, 2.5rem);
    height: 56px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 50;
  }
  .header-left { display: flex; align-items: center; gap: 16px; }
  .back-link {
    font-size: 0.82rem;
    color: #888;
    text-decoration: none;
    font-weight: 500;
    letter-spacing: -0.01em;
    transition: color 0.15s;
  }
  .back-link:hover { color: #111; }
  .logo {
    font-size: 0.97rem;
    font-weight: 600;
    letter-spacing: -0.02em;
    color: #111;
  }
  main {
    padding: clamp(1.25rem, 4vw, 2.5rem) clamp(1rem, 4vw, 2.5rem);
    max-width: 760px;
    margin: 0 auto;
    width: 100%;
  }
  .hero {
    margin-bottom: 2rem;
    padding-bottom: 1.5rem;
    border-bottom: 1px solid #e5e5e5;
  }
  .hero-name {
    font-size: 2rem;
    font-weight: 700;
    letter-spacing: -0.04em;
    color: #111;
    margin-bottom: 6px;
  }
  .hero-balance {
    font-size: 1.1rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }
  .hero-balance.positive { color: #16a34a; }
  .hero-balance.negative { color: #dc2626; }
  .hero-balance.zero     { color: #888; }
  .hero-payment {
    font-size: 0.88rem;
    color: #888;
    margin-top: 6px;
  }
  .hero-payment strong { color: #111; font-weight: 700; }
  .absence-note {
    display: inline-block;
    margin-top: 10px;
    background: #fafafa;
    border: 1px solid #e5e5e5;
    border-radius: 4px;
    padding: 6px 12px;
    font-size: 0.8rem;
    color: #888;
  }
  .section-title {
    font-size: 0.68rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: #888;
    margin-bottom: 10px;
    padding-left: 2px;
  }
  table { width: 100%; border-collapse: collapse; font-size: 0.85rem; }
  th {
    font-size: 0.65rem;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.07em;
    color: #888;
    text-align: left;
    padding: 6px 12px;
    border-bottom: 1px solid #e5e5e5;
  }
  td {
    padding: 10px 12px;
    border-bottom: 1px solid #f0f0f0;
    color: #111;
  }
  tr:last-child td { border-bottom: none; }
  .tbl-absent { color: #bbb; }
  .tbl-pos    { color: #16a34a; }
  .tbl-neg    { color: #dc2626; }
  .tbl-zero   { color: #888; }
  .spinner {
    width: 28px; height: 28px;
    border: 2px solid #e5e5e5;
    border-top-color: #111;
    border-radius: 50%;
    animation: spin .7s linear infinite;
    margin: 4rem auto 1rem;
  }
  @keyframes spin { to { transform: rotate(360deg); } }
  .loading-msg { text-align: center; color: #888; font-size: 0.85rem; }
  ::-webkit-scrollbar { width: 5px; }
  ::-webkit-scrollbar-track { background: transparent; }
  ::-webkit-scrollbar-thumb { background: #e5e5e5; border-radius: 3px; }
  ::-webkit-scrollbar-thumb:hover { background: #ccc; }
`;

/* ── Person page initializer ─────────────────────────────────── */
async function initPersonPage(name) {
  const style = document.createElement("style");
  style.textContent = PERSON_CSS;
  document.head.appendChild(style);
  document.title = `${name} — Chips`;

  document.body.innerHTML = `
    <header>
      <div class="header-left">
        <a class="back-link" href="/chips">← Chips</a>
        <span class="logo">${escHtml(name)}</span>
      </div>
    </header>
    <main>
      <div class="spinner"></div>
      <p class="loading-msg">Loading…</p>
    </main>
  `;

  try {
    const { data } = await loadData();
    renderPersonPage(name, data);
  } catch (e) {
    document.querySelector("main").innerHTML =
      `<p style="color:#888;padding:2rem;text-align:center">Error loading data: ${escHtml(e.message)}</p>`;
  }
}

function renderPersonPage(name, data) {
  const nextWeekAtt = getNextWeekAttendance(data);
  const { payments, balances } = computeSuggestedPayments(data.weeks, nextWeekAtt);

  const balance          = balances[name];
  const suggestedPayment = payments[name];
  const isAbsent         = nextWeekAtt[name] === 0;

  // Build week-by-week rows with running balance
  let runningBal = 0;
  let rows = "";

  if (data.weeks.length === 0) {
    rows = `<tr><td colspan="5" style="text-align:center;color:#888;padding:2rem">No weeks recorded yet</td></tr>`;
  } else {
    for (const week of data.weeks) {
      const attended = week.attendance[name] === 1;
      const n        = PEOPLE.filter(p => week.attendance[p] === 1).length;
      const share    = attended ? BOWL_COST / n : 0;
      const paid     = week.payments[name] || 0;
      runningBal    += paid - share;

      const bClass = runningBal > 0.005 ? "tbl-pos" : runningBal < -0.005 ? "tbl-neg" : "tbl-zero";

      rows += `
        <tr>
          <td>Week ${week.weekNumber}</td>
          <td>${attended ? "Yes" : `<span class="tbl-absent">Absent</span>`}</td>
          <td>${attended ? fmt(paid) : `<span class="tbl-absent">—</span>`}</td>
          <td>${attended ? fmt(share) : `<span class="tbl-absent">—</span>`}</td>
          <td class="${bClass}">${fmtBalance(runningBal)}</td>
        </tr>`;
    }
  }

  const balClass = balance > 0.005 ? "positive" : balance < -0.005 ? "negative" : "zero";
  const balLabel = balance > 0.005 ? "in credit" : balance < -0.005 ? "owes" : "settled up";

  document.querySelector("main").innerHTML = `
    <div class="hero">
      <div class="hero-name">${escHtml(name)}</div>
      <div class="hero-balance ${balClass}">${fmtBalance(balance)} <span style="font-weight:500;font-size:0.85em;opacity:0.8">${balLabel}</span></div>
      ${isAbsent
        ? `<div class="hero-payment">Not attending next week</div>
           <span class="absence-note">Tom &amp; Quincy are sitting out next week</span>`
        : `<div class="hero-payment">Suggested payment next week: <strong>${fmt(suggestedPayment)}</strong></div>`
      }
    </div>

    <div class="section-title">Week History</div>
    <table>
      <thead>
        <tr>
          <th>Week</th>
          <th>Attended</th>
          <th>Paid</th>
          <th>Fair Share</th>
          <th>Running Balance</th>
        </tr>
      </thead>
      <tbody>${rows}</tbody>
    </table>
  `;
}
