// ===============================
// CONFIG: Google Sheet CSV URL
// ===============================
const CSV_URL =
  'https://docs.google.com/spreadsheets/d/e/2PACX-1vS2B7Nwb1-bJ-hxu7Py10mcjPNURFulI2R-GDsMA4WnUOQmBxGLmtKBbUXpcw2njhS8flvRotMoPOUR/pub?gid=0&single=true&output=csv';

// ===============================
// FIRST HALF / SECOND HALF SETTINGS
// ===============================
const FIRST_HALF_END_WEEK = 18;                 // Week 18 ends the 1st half (Position Round #1)
const FIRST_HALF_WINNER_NAME = 'Cesar Padilla'; // Asterisk goes on this name

// State
let weeklyResults = {}; // { "1": [ {bowler1, scores1:[..], bowler2, scores2:[..]} ], ... }
let currentWeek = null;

// ---- CSV Loader ----
async function fetchAllResults() {
  weeklyResults = {};
  try {
    const res = await fetch(CSV_URL, { cache: 'no-store' });
    if (!res.ok) throw new Error('Could not fetch CSV');
    const text = await res.text();

    // Basic CSV parse (assumes no commas inside fields)
    const rows = text.trim().split(/\r?\n/).map(r => r.split(',').map(s => s.trim()));
    if (!rows.length) return;

    const header = rows.shift().map(h => h.toLowerCase());
    const idx = Object.fromEntries(header.map((h, i) => [h, i]));

    // Expected columns
    const needed = ['week', 'bowler1', 'g1', 'g2', 'g3', 'bowler2', 'h1', 'h2', 'h3'];
    const hasAll = needed.every(k => idx[k] !== undefined);
    if (!hasAll) {
      console.error('CSV header missing required columns:', header);
      return;
    }

    for (const r of rows) {
      const w = String(r[idx.week]);
      const bowler1 = r[idx.bowler1];
      const g1 = parseInt(r[idx.g1], 10),
        g2 = parseInt(r[idx.g2], 10),
        g3 = parseInt(r[idx.g3], 10);
      const bowler2 = r[idx.bowler2];
      const h1 = parseInt(r[idx.h1], 10),
        h2 = parseInt(r[idx.h2], 10),
        h3 = parseInt(r[idx.h3], 10);
      if (!w || !bowler1 || !bowler2) continue;
      if ([g1, g2, g3, h1, h2, h3].some(n => Number.isNaN(n))) continue;

      if (!weeklyResults[w]) weeklyResults[w] = [];
      weeklyResults[w].push({
        bowler1,
        scores1: [g1, g2, g3],
        bowler2,
        scores2: [h1, h2, h3],
      });
    }
  } catch (e) {
    console.error(e);
  }
}

// ---- Helpers ----

// Build a results object containing only weeks <= selected week
function resultsThroughWeek(weekNumber) {
  const out = {};
  for (const [w, matches] of Object.entries(weeklyResults)) {
    if (parseInt(w, 10) <= weekNumber) out[w] = matches;
  }
  return out;
}

// Build results object for a week range (inclusive)
function resultsBetweenWeeks(startWeek, endWeek) {
  const out = {};
  const s = Number(startWeek);
  const e = Number(endWeek);
  for (const [w, matches] of Object.entries(weeklyResults)) {
    const wn = parseInt(w, 10);
    if (wn >= s && wn <= e) out[w] = matches;
  }
  return out;
}

// (HALF-POINT TIE: core splitter)
function splitPointsOnTie(a, b) {
  if (a > b) return [1, 0];
  if (b > a) return [0, 1];
  return [0.5, 0.5];
}

// >>> NEW: read the selected standings week / fallback to global currentWeek
function getSelectedStandingsWeek() {
  const sel = document.getElementById('currentWeek');
  if (sel && sel.value) return parseInt(sel.value, 10);
  if (!Number.isNaN(currentWeek)) return parseInt(currentWeek, 10);
  return null;
}

// Compute standings (Points, Avg, High Game/Series, Total Pinfall)
function computeStandingsFrom(resultsByWeek) {
  const map = new Map();
  const ensure = (name) => {
    if (!map.has(name))
      map.set(name, {
        name,
        points: 0,
        games: [],
        series: [],
        totalPinfall: 0,
      });
    return map.get(name);
  };

  Object.values(resultsByWeek).forEach((matches) => {
    (matches || []).forEach(({ bowler1, scores1, bowler2, scores2 }) => {
      const a = ensure(bowler1),
        b = ensure(bowler2);

      // per-game points (HALF-POINT TIE)
      for (let i = 0; i < 3; i++) {
        const [pa, pb] = splitPointsOnTie(scores1[i], scores2[i]);
        a.points += pa;
        b.points += pb;
      }

      // series sums
      const s1 = scores1.reduce((x, y) => x + y, 0);
      const s2 = scores2.reduce((x, y) => x + y, 0);

      // series point (HALF-POINT TIE)
      const [sa, sb] = splitPointsOnTie(s1, s2);
      a.points += sa;
      b.points += sb;

      // stats
      a.games.push(...scores1);
      b.games.push(...scores2);
      a.series.push(s1);
      b.series.push(s2);

      // total pinfall (sum of all games across weeks)
      a.totalPinfall += s1;
      b.totalPinfall += s2;
    });
  });

  return Array.from(map.values()).map((p) => {
    const total = p.games.reduce((x, y) => x + y, 0);
    const avg = p.games.length ? Math.round(total / p.games.length) : 0;
    const highG = p.games.length ? Math.max(...p.games) : 0;
    const highS = p.series.length ? Math.max(...p.series) : 0;
    return {
      name: p.name,
      points: p.points,
      avg,
      highGame: highG,
      highSeries: highS,
      totalPinfall: p.totalPinfall,
    };
  }).sort((a, b) => {
    // 1) Points (desc), 2) Total Pinfall (desc), 3) Name (asc)
    if (b.points !== a.points) return b.points - a.points;
    if (b.totalPinfall !== a.totalPinfall) return b.totalPinfall - a.totalPinfall;
    return String(a.name).localeCompare(String(b.name));
  });
}

// Convert standings array into a Map(name -> row)
function standingsToMap(arr) {
  const m = new Map();
  (arr || []).forEach((r) => m.set(r.name, r));
  return m;
}

// Winner display helper
function formatBowlerNameForStandings(name) {
  const clean = String(name || '').trim();
  return clean === FIRST_HALF_WINNER_NAME ? `${clean}*` : clean;
}

// Build the "Current Standings" rows with 1H / 2H / Total + season-to-date stats
function computeSplitStandings(upToWeek) {
  const wk = Number(upToWeek);
  if (!wk || Number.isNaN(wk) || wk < 1) return [];

  // 1st half points are always weeks 1..min(wk, FIRST_HALF_END_WEEK)
  const firstEnd = Math.min(wk, FIRST_HALF_END_WEEK);
  const firstHalfResults = resultsBetweenWeeks(1, firstEnd);

  // 2nd half points are weeks (FIRST_HALF_END_WEEK+1)..wk (only if wk beyond first half)
  const secondHalfResults =
    wk > FIRST_HALF_END_WEEK ? resultsBetweenWeeks(FIRST_HALF_END_WEEK + 1, wk) : {};

  // season-to-date stats (high game/series/pinfall) through wk
  const seasonResults = resultsThroughWeek(wk);

  const firstHalf = standingsToMap(computeStandingsFrom(firstHalfResults));
  const secondHalf = standingsToMap(computeStandingsFrom(secondHalfResults));
  const season = standingsToMap(computeStandingsFrom(seasonResults));

  // Merge by season participants (everyone who has appeared up to wk)
  const out = [];
  for (const [name, seasonRow] of season.entries()) {
    const fh = firstHalf.get(name);
    const sh = secondHalf.get(name);

    const firstHalfPts = Number(fh?.points ?? 0);
    const secondHalfPts = Number(sh?.points ?? 0);
    const totalPts = firstHalfPts + secondHalfPts;

    out.push({
      name,
      firstHalfPts,
      secondHalfPts,
      totalPts,
      highGame: seasonRow.highGame,
      highSeries: seasonRow.highSeries,
      totalPinfall: seasonRow.totalPinfall,
    });
  }

  // Sort: Total Pts desc, Total Pinfall desc, Name asc
  out.sort((a, b) => {
    if (b.totalPts !== a.totalPts) return b.totalPts - a.totalPts;
    if (b.totalPinfall !== a.totalPinfall) return b.totalPinfall - a.totalPinfall;
    return String(a.name).localeCompare(String(b.name));
  });

  return out;
}

// ---- Style injector (safe to keep or remove if you have these in CSS) ----
function ensureWinTieStyles() {
  if (document.getElementById('weekly-win-tie-styles')) return;
  const style = document.createElement('style');
  style.id = 'weekly-win-tie-styles';
  style.textContent = `
    .score-cell { padding: 4px 8px; text-align: center; border-radius: 4px; }
    .score-cell.win { background: #2ecc71; color: #fff; font-weight: 700; }
    .score-cell.tie { background: #f1c40f; color: #000; font-weight: 700; }
    .series-label { font-weight: 700; margin-right: 6px; }
    .series-wrap { display: inline-flex; gap: 6px; align-items: center; }
  `;
  document.head.appendChild(style);
}

// Compare scores → return class name
function getScoreClass(a, b) {
  if (a > b) return 'win';
  if (a < b) return '';
  return 'tie';
}

// ---- UI ----
function populateWeekSelectors() {
  const weeks = Object.keys(weeklyResults).map(n => parseInt(n, 10)).filter(n => !Number.isNaN(n));
  if (!weeks.length) return;

  weeks.sort((a, b) => a - b);
  const maxWeek = weeks[weeks.length - 1];
  currentWeek = maxWeek;

  const currentWeekSelect = document.getElementById('currentWeek');
  const weekSelect = document.getElementById('weekSelect');

  [currentWeekSelect, weekSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = weeks
      .map(w => `<option value="${w}" ${w === maxWeek ? 'selected' : ''}>Week ${w}${w === maxWeek ? ' (Current)' : ''}</option>`)
      .join('');
  });
}

function updateStandings() {
  const tbody = document.getElementById('standingsBody');
  if (!tbody) return;

  // cumulative THROUGH the selected week
  const sel = document.getElementById('currentWeek');
  const upToWeek = parseInt(sel?.value || currentWeek, 10);
  if (Number.isNaN(upToWeek)) return;

  const computed = computeSplitStandings(upToWeek);

  tbody.innerHTML = '';
  computed.forEach((bowler, index) => {
    const row = document.createElement('tr');
    if (index < 5) row.classList.add('top-5');

    const isFirstHalfWinner = String(bowler.name).trim() === FIRST_HALF_WINNER_NAME;

    row.innerHTML = `
      <td>${index + 1}</td>
      <td class="${isFirstHalfWinner ? 'winner-first-half' : ''}">${formatBowlerNameForStandings(bowler.name)}</td>
      <td>${bowler.firstHalfPts.toFixed(1)}</td>
      <td>${bowler.secondHalfPts.toFixed(1)}</td>
      <td>${bowler.totalPts.toFixed(1)}</td>
      <td>${bowler.highGame}</td>
      <td>${bowler.highSeries}</td>
      <td>${bowler.totalPinfall}</td>
    `;
    tbody.appendChild(row);
  });
}

function loadWeeklyResults() {
  ensureWinTieStyles();

  const weekSelect = document.getElementById('weekSelect');
  const content = document.getElementById('weeklyResultsContent');
  if (!content) return;

  const selectedWeek = weekSelect?.value || String(currentWeek);
  const results = weeklyResults[selectedWeek] || [];

  if (!results.length) {
    content.innerHTML = '<p>No results available for this week.</p>';
    return;
  }

  let html = '';
  results.forEach(match => {
    const series1 = match.scores1.reduce((a, b) => a + b, 0);
    const series2 = match.scores2.reduce((a, b) => a + b, 0);

    // (HALF-POINT TIE) per-game + series
    let points1 = 0, points2 = 0;
    for (let i = 0; i < 3; i++) {
      const [p1, p2] = splitPointsOnTie(match.scores1[i], match.scores2[i]);
      points1 += p1;
      points2 += p2;
    }
    const [sp1, sp2] = splitPointsOnTie(series1, series2);
    points1 += sp1;
    points2 += sp2;

    // Build per-game score spans with win/tie classes
    const row1Scores = match.scores1.map((s, i) => {
      const cls = getScoreClass(Number(s), Number(match.scores2[i]));
      return `<span class="score score-cell ${cls}">${s}</span>`;
    }).join('');

    const row2Scores = match.scores2.map((s, i) => {
      const cls = getScoreClass(Number(s), Number(match.scores1[i]));
      return `<span class="score score-cell ${cls}">${s}</span>`;
    }).join('');

    // Series class
    const series1Cls = getScoreClass(series1, series2);
    const series2Cls = getScoreClass(series2, series1);

    html += `
      <div class="matchup-card">
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler1}</div>
          <div class="scores">
            ${row1Scores}
          </div>
          <div style="margin-top: 10px;">
            <span class="series-wrap">
              <span class="series-label">Series:</span>
              <span class="score-cell ${series1Cls}">${series1}</span>
            </span><br/>
            <span style="color: #ffd700;">Points: ${points1.toFixed(1)}</span>
          </div>
        </div>
        <div class="vs-separator">VS</div>
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler2}</div>
          <div class="scores">
            ${row2Scores}
          </div>
          <div style="margin-top: 10px;">
            <span class="series-wrap">
              <span class="series-label">Series:</span>
              <span class="score-cell ${series2Cls}">${series2}</span>
            </span><br/>
            <span style="color: #ffd700;">Points: ${points2.toFixed(1)}</span>
          </div>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
}

// ---- Tabs ----
function showTab(tabName, btnEl) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(b => {
    b.classList.remove('active');
    b.setAttribute('aria-selected', 'false');
  });

  const tab = document.getElementById(tabName);
  if (tab) tab.classList.add('active');

  if (btnEl) {
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-selected', 'true');
  }

  if (tabName === 'standings') updateStandings();
  if (tabName === 'weekly-results') loadWeeklyResults();
}

// ---- Init ----
document.addEventListener('DOMContentLoaded', async () => {
  await fetchAllResults();
  populateWeekSelectors();
  updateStandings();
  loadWeeklyResults();

  const cw = document.getElementById('currentWeek');
  if (cw) cw.addEventListener('change', () => {
    currentWeek = parseInt(cw.value, 10);
    updateStandings(); // recompute standings through selected week
  });

  const ws = document.getElementById('weekSelect');
  if (ws) ws.addEventListener('change', loadWeeklyResults);
});

// Expose for HTML
window.showTab = showTab;

/* ============================================
   WEEKLY PAIRINGS (dropdown version, add-only)
   - Loads from your published Google Sheet CSV
   - Renders Bowler vs Bowler only
   - Uses "Select Week:" native <select> (no "(Current)")
   - Hides future weeks by default
   - Fully scoped to #pairings; no globals leaked
============================================ */
(() => {
  // ---- CONFIG: your published CSV URL ----
  const PAIRINGS_CSV_URL =
    'https://docs.google.com/spreadsheets/d/e/2PACX-1vS2B7Nwb1-bJ-hxu7Py10mcjPNURFulI2R-GDsMA4WnUOQmBxGLmtKBbUXpcw2njhS8flvRotMoPOUR/pub?gid=326412293&single=true&output=csv';

  // Optional deep link (?week=7)
  const urlWeekParam = new URLSearchParams(location.search).get('week');

  // ---- tiny, quote-safe CSV parser ----
  function parseCsvSafe(text) {
    const rows = [];
    let cell = '', row = [], inQ = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i], n = text[i + 1];
      if (c === '"' && !inQ) { inQ = true; continue; }
      if (c === '"' && inQ) {
        if (n === '"') { cell += '"'; i++; }
        else { inQ = false; }
        continue;
      }
      if (c === ',' && !inQ) { row.push(cell.trim()); cell = ''; continue; }
      if ((c === '\n' || c === '\r') && !inQ) {
        if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
        cell = ''; row = [];
        if (c === '\r' && n === '\n') i++; // swallow CRLF
        continue;
      }
      cell += c;
    }
    if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  async function initWeeklyPairings() {
    const root = document.getElementById('pairings');
    if (!root) return;

    const toggleWrap = root.querySelector('#pairings-week-toggle');
    const contentEl = root.querySelector('#pairings-content');
    const errorEl = root.querySelector('#pairings-error');
    if (!toggleWrap || !contentEl) return;

    try {
      const res = await fetch(PAIRINGS_CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not fetch Weekly Pairings CSV.');
      const csv = await res.text();
      const rows = parseCsvSafe(csv);

      // Expect header: Week, Bowler 1, Bowler 2
      const [header, ...data] = rows;
      if (!header || header.length < 3) {
        throw new Error('CSV headers must be: Week, Bowler 1, Bowler 2.');
      }
      const h = header.map(x => (x || '').toLowerCase());
      const idxWeek = h.findIndex(x => x.includes('week'));
      const idxB1 = h.findIndex(x => x.includes('bowler') && x.includes('1'));
      const idxB2 = h.findIndex(x => x.includes('bowler') && x.includes('2'));
      if (idxWeek < 0 || idxB1 < 0 || idxB2 < 0) {
        throw new Error('CSV headers must be: Week, Bowler 1, Bowler 2.');
      }

      // Group rows by numeric week
      const groups = {};
      for (const r of data) {
        if (!r?.length) continue;
        const wRaw = (r[idxWeek] ?? '').trim();
        if (!wRaw) continue;
        const week = Number(String(wRaw).replace(/[^\d]/g, '')) || 0; // handles "Week 3"
        const b1 = (r[idxB1] ?? '').trim();
        const b2 = (r[idxB2] ?? '').trim();
        (groups[week] ||= []).push({ b1, b2 });
      }

      const weeks = Object.keys(groups).map(Number).sort((a, b) => a - b);
      if (!weeks.length) throw new Error('No pairings found.');

      // >>> SYNC: Prefer the Standings' selected week + 1; clamp to available pairings weeks
const standingsWeek = getSelectedStandingsWeek();
let currentWeekLocal;

if (standingsWeek != null) {
  const minW = weeks[0];
  const maxW = weeks[weeks.length - 1];
  const plusOne = standingsWeek + 1; // <-- key change
  currentWeekLocal = Math.min(Math.max(plusOne, minW), maxW);
} else if (urlWeekParam && weeks.includes(+urlWeekParam)) {
  currentWeekLocal = +urlWeekParam; // fallback: explicit URL param
} else {
  // final fallback: last week with at least one fully filled matchup
  const isFilled = m => {
    const bad = s => !s || s.toUpperCase() === 'TBD' || s === '-';
    return !bad(m.b1) && !bad(m.b2);
  };
  currentWeekLocal = weeks[0];
  for (const w of weeks) if (groups[w].some(isFilled)) currentWeekLocal = w;
}

      // ---- Build the dropdown (matches Weekly Results look; no "(Current)") ----
      toggleWrap.innerHTML = '';
      const label = document.createElement('label');
      label.setAttribute('for', 'pairings-week-select');
      label.textContent = 'Select Week:';
      toggleWrap.appendChild(label);

      const weekSelect = document.createElement('select');
      weekSelect.id = 'pairings-week-select';
      weeks.forEach(week => {
        const opt = document.createElement('option');
        opt.value = String(week);
        opt.textContent = `Week ${week}`;
        weekSelect.appendChild(opt);
      });
      weekSelect.value = String(currentWeekLocal);
      weekSelect.addEventListener('change', () => showWeek(Number(weekSelect.value)));
      toggleWrap.appendChild(weekSelect);

      // ---- Build content (one table per week) ----
      contentEl.innerHTML = '';
      weeks.forEach(week => {
        const sec = document.createElement('section');
        sec.id = `pairings-week-${week}`;
        sec.className = 'pairings-week';
        sec.hidden = (week !== currentWeekLocal);

        const table = document.createElement('table');
        table.className = 'pairings-table';
        table.innerHTML = `
          <thead>
            <tr>
              <th>Bowler</th>
              <th class="pairing-vs">vs</th>
              <th>Bowler</th>
            </tr>
          </thead>
          <tbody></tbody>
        `;

        const tbody = table.querySelector('tbody');
        groups[week].forEach(({ b1, b2 }) => {
          const tr = document.createElement('tr');
          tr.innerHTML = `
            <td>${b1 || 'TBD'}</td>
            <td class="pairing-vs">—</td>
            <td>${b2 || 'TBD'}</td>
          `;
          tbody.appendChild(tr);
        });

        sec.appendChild(table);
        contentEl.appendChild(sec);
      });

      // Hide future weeks (> currentWeekLocal) by default
      weeks.forEach(w => {
        if (w > currentWeekLocal) {
          const sec = document.getElementById(`pairings-week-${w}`);
          if (sec) sec.hidden = true;
        }
      });

      // ---- Local controller (no globals leaked) ----
      function showWeek(week) {
        // sync dropdown
        const sel = document.getElementById('pairings-week-select');
        if (sel) sel.value = String(week);

        // toggle sections
        weeks.forEach(w => {
          const sec = document.getElementById(`pairings-week-${w}`);
          if (sec) sec.hidden = (w !== week);
        });

        // (optional) keep URL param in sync
        const usp = new URLSearchParams(location.search);
        usp.set('week', String(week));
        history.replaceState(null, '', `${location.pathname}?${usp.toString()}#pairings`);
      }

      // >>> SYNC: update Pairings when Standings dropdown changes (Standings week + 1)
const standingsSelect = document.getElementById('currentWeek');
if (standingsSelect) {
  standingsSelect.addEventListener('change', () => {
    const w = getSelectedStandingsWeek();
    if (w == null) return;
    const minW = weeks[0];
    const maxW = weeks[weeks.length - 1];
    const plusOne = w + 1; // <-- key change
    const clamped = Math.min(Math.max(plusOne, minW), maxW);
    showWeek(clamped);
  });
}

    } catch (err) {
      console.error(err);
      if (errorEl) {
        errorEl.textContent = err.message || 'Failed to load Weekly Pairings.';
        errorEl.hidden = false;
      }
    }
  }

  // Init once the DOM is ready (safe even if the tab is hidden)
  document.addEventListener('DOMContentLoaded', initWeeklyPairings);
})();
