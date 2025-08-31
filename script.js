// ===============================
// CONFIG: Google Sheet CSV URL
// ===============================
const CSV_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vS2B7Nwb1-bJ-hxu7Py10mcjPNURFulI2R-GDsMA4WnUOQmBxGLmtKBbUXpcw2njhS8flvRotMoPOUR/pub?gid=0&single=true&output=csv';

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
    const idx = Object.fromEntries(header.map((h,i)=>[h, i]));

    // Expected columns
    const needed = ['week','bowler1','g1','g2','g3','bowler2','h1','h2','h3'];
    const hasAll = needed.every(k => idx[k] !== undefined);
    if (!hasAll) { console.error('CSV header missing required columns:', header); return; }

    for (const r of rows) {
      const w = String(r[idx.week]);
      const bowler1 = r[idx.bowler1];
      const g1 = parseInt(r[idx.g1],10), g2 = parseInt(r[idx.g2],10), g3 = parseInt(r[idx.g3],10);
      const bowler2 = r[idx.bowler2];
      const h1 = parseInt(r[idx.h1],10), h2 = parseInt(r[idx.h2],10), h3 = parseInt(r[idx.h3],10);
      if (!w || !bowler1 || !bowler2) continue;
      if ([g1,g2,g3,h1,h2,h3].some(n => Number.isNaN(n))) continue;

      if (!weeklyResults[w]) weeklyResults[w] = [];
      weeklyResults[w].push({
        bowler1, scores1: [g1,g2,g3],
        bowler2, scores2: [h1,h2,h3]
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
    if (parseInt(w,10) <= weekNumber) out[w] = matches;
  }
  return out;
}

// Compute standings (Points, Avg, High Game/Series, Total Pinfall)
function computeStandingsFrom(resultsByWeek) {
  const map = new Map();
  const ensure = (name) => {
    if (!map.has(name)) map.set(name, { 
      name, 
      points: 0, 
      games: [], 
      series: [], 
      totalPinfall: 0 
    });
    return map.get(name);
  };

  Object.values(resultsByWeek).forEach(matches => {
    (matches || []).forEach(({ bowler1, scores1, bowler2, scores2 }) => {
      const a = ensure(bowler1), b = ensure(bowler2);

      // per-game points
      for (let i = 0; i < 3; i++) {
        if (scores1[i] > scores2[i]) a.points++;
        else if (scores2[i] > scores1[i]) b.points++;
      }

      // series sums
      const s1 = scores1.reduce((x,y)=>x+y,0);
      const s2 = scores2.reduce((x,y)=>x+y,0);

      // series point
      if (s1 > s2) a.points++; else if (s2 > s1) b.points++;

      // stats
      a.games.push(...scores1); b.games.push(...scores2);
      a.series.push(s1);        b.series.push(s2);

      // total pinfall (sum of all games across weeks)
      a.totalPinfall += s1;
      b.totalPinfall += s2;
    });
  });

  return Array.from(map.values()).map(p => {
    const total = p.games.reduce((x,y)=>x+y,0);
    const avg = p.games.length ? Math.round(total / p.games.length) : 0;
    const highG = p.games.length ? Math.max(...p.games) : 0;
    const highS = p.series.length ? Math.max(...p.series) : 0;
    return { 
      name: p.name, 
      points: p.points, 
      avg, 
      highGame: highG, 
      highSeries: highS,
      totalPinfall: p.totalPinfall
    };
  }).sort((a,b) => b.points - a.points);
}

// ---- UI ----
function populateWeekSelectors() {
  const weeks = Object.keys(weeklyResults).map(n => parseInt(n,10)).filter(n=>!Number.isNaN(n));
  if (!weeks.length) return;

  weeks.sort((a,b)=>a-b);
  const maxWeek = weeks[weeks.length - 1];
  currentWeek = maxWeek;

  const currentWeekSelect = document.getElementById('currentWeek');
  const weekSelect = document.getElementById('weekSelect');

  [currentWeekSelect, weekSelect].forEach(sel => {
    if (!sel) return;
    sel.innerHTML = weeks
      .map(w => `<option value="${w}" ${w===maxWeek?'selected':''}>Week ${w}${w===maxWeek?' (Current)':''}</option>`)
      .join('');
  });
}

function updateStandings() {
  const tbody = document.getElementById('standingsBody');
  if (!tbody) return;

  // cumulative THROUGH the selected week
  const sel = document.getElementById('currentWeek');
  const upToWeek = parseInt(sel?.value || currentWeek, 10);

  const filtered = resultsThroughWeek(upToWeek);
  const computed = computeStandingsFrom(filtered);

  const cap = document.getElementById('standingsCaption');
  if (cap) cap.textContent = `Standings through Week ${upToWeek}`;

  tbody.innerHTML = '';
  computed.forEach((bowler, index) => {
    const row = document.createElement('tr');
    if (index < 5) row.classList.add('top-5');
    row.innerHTML = `
      <td>${index + 1}</td>
      <td>${bowler.name}</td>
      <td>${bowler.points}</td>
      <td>${bowler.avg}</td>
      <td>${bowler.highGame}</td>
      <td>${bowler.highSeries}</td>
      <td>${bowler.totalPinfall}</td>
    `;
    tbody.appendChild(row);
  });
}

function loadWeeklyResults() {
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
    const series1 = match.scores1.reduce((a,b)=>a+b,0);
    const series2 = match.scores2.reduce((a,b)=>a+b,0);

    let points1 = 0, points2 = 0;
    for (let i=0;i<3;i++){
      if (match.scores1[i] > match.scores2[i]) points1++;
      else if (match.scores2[i] > match.scores1[i]) points2++;
    }
    if (series1 > series2) points1++; else if (series2 > series1) points2++;

    html += `
      <div class="matchup-card">
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler1}</div>
          <div class="scores">
            ${match.scores1.map(s=>`<span class="score">${s}</span>`).join('')}
          </div>
          <div style="margin-top: 10px;">
            <strong>Series: ${series1}</strong><br/>
            <span style="color: #ffd700;">Points: ${points1}</span>
          </div>
        </div>
        <div class="vs-separator">VS</div>
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler2}</div>
          <div class="scores">
            ${match.scores2.map(s=>`<span class="score">${s}</span>`).join('')}
          </div>
          <div style="margin-top: 10px;">
            <strong>Series: ${series2}</strong><br/>
            <span style="color: #ffd700;">Points: ${points2}</span>
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

/* ===============================
   WEEKLY PAIRINGS (add-only module)
   - Uses your published Google Sheet CSV
   - Scoped to #pairings only
   - No globals leaked, no showTab changes
================================= */
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
      const c = text[i], n = text[i+1];
      if (c === '"' && !inQ) { inQ = true; continue; }
      if (c === '"' && inQ)  { if (n === '"') { cell += '"'; i++; } else { inQ = false; } continue; }
      if (c === ',' && !inQ) { row.push(cell.trim()); cell = ''; continue; }
      if ((c === '\n' || c === '\r') && !inQ) {
        if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
        cell = ''; row = [];
        if (c === '\r' && n === '\n') i++;
        continue;
      }
      cell += c;
    }
    if (cell.length || row.length) { row.push(cell.trim()); rows.push(row); }
    return rows;
  }

  async function initWeeklyPairings() {
    const root = document.getElementById('pairings');
    if (!root) return; // section not in DOM

    const toggleEl  = root.querySelector('#pairings-week-toggle');
    const contentEl = root.querySelector('#pairings-content');
    const errorEl   = root.querySelector('#pairings-error');

    if (!toggleEl || !contentEl) return;

    try {
      const res = await fetch(PAIRINGS_CSV_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error('Could not fetch Weekly Pairings CSV.');
      const csv = await res.text();
      const rows = parseCsvSafe(csv);

      // Expect headers: Week, Bowler 1, Bowler 2 (case-insensitive)
      const [header, ...data] = rows;
      if (!header || header.length < 3) {
        throw new Error('CSV headers must be: Week, Bowler 1, Bowler 2.');
      }
      const h = header.map(v => (v || '').toLowerCase());
      const idxWeek = h.findIndex(x => x.includes('week'));
      const idxB1   = h.findIndex(x => x.includes('bowler') && x.includes('1'));
      const idxB2   = h.findIndex(x => x.includes('bowler') && x.includes('2'));
      if (idxWeek < 0 || idxB1 < 0 || idxB2 < 0) {
        throw new Error('CSV headers must be: Week, Bowler 1, Bowler 2.');
      }

      // Group rows by numeric week
      const groups = {};
      for (const r of data) {
        if (!r?.length) continue;
        const wRaw = (r[idxWeek] ?? '').trim();
        if (!wRaw) continue;
        const week = Number(String(wRaw).replace(/[^\d]/g, '')) || 0; // supports "Week 3"
        const b1 = (r[idxB1] ?? '').trim();
        const b2 = (r[idxB2] ?? '').trim();
        (groups[week] ||= []).push({ b1, b2 });
      }

      const weeks = Object.keys(groups).map(Number).sort((a,b)=>a-b);
      if (!weeks.length) throw new Error('No pairings found.');

      // Choose "current" week = last with at least one fully filled matchup
      const isFilled = m => {
        const bad = s => !s || s.toUpperCase() === 'TBD' || s === '-';
        return !bad(m.b1) && !bad(m.b2);
      };
      let currentWeek = weeks[0];
      for (const w of weeks) if (groups[w].some(isFilled)) currentWeek = w;
      if (urlWeekParam && weeks.includes(+urlWeekParam)) currentWeek = +urlWeekParam;

      // Build the week toggle
      toggleEl.innerHTML = '';
      weeks.forEach(week => {
        const btn = document.createElement('button');
        btn.className = 'week-btn';
        btn.role = 'tab';
        btn.setAttribute('aria-selected', week === currentWeek ? 'true' : 'false');
        btn.setAttribute('aria-controls', `pairings-week-${week}`);
        btn.textContent = `Week ${week}`;
        btn.addEventListener('click', () => showWeek(week));
        toggleEl.appendChild(btn);
      });

      // Build content per week (bowler vs bowler only)
      contentEl.innerHTML = '';
      weeks.forEach(week => {
        const sec = document.createElement('section');
        sec.id = `pairings-week-${week}`;
        sec.className = 'pairings-week';
        sec.hidden = (week !== currentWeek);

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

      // Hide future weeks by default
      weeks.forEach(w => {
        if (w > currentWeek) {
          const sec = document.getElementById(`pairings-week-${w}`);
          if (sec) sec.hidden = true;
        }
      });

      // Local controller (no globals)
      function showWeek(week) {
        // update buttons
        toggleEl.querySelectorAll('.week-btn').forEach(btn => {
          btn.setAttribute('aria-selected', btn.textContent.endsWith(String(week)) ? 'true' : 'false');
        });
        // toggle sections
        weeks.forEach(w => {
          const sec = document.getElementById(`pairings-week-${w}`);
          if (sec) sec.hidden = (w !== week);
        });
        // optional: keep URL in sync
        const usp = new URLSearchParams(location.search);
        usp.set('week', String(week));
        history.replaceState(null, '', `${location.pathname}?${usp.toString()}#pairings`);
      }

    } catch (err) {
      console.error(err);
      const el = document.getElementById('pairings-error');
      if (el) {
        el.textContent = err.message || 'Failed to load Weekly Pairings.';
        el.hidden = false;
      }
    }
  }

  // Init on page load (independent of your showTab)
  document.addEventListener('DOMContentLoaded', initWeeklyPairings);
})();
