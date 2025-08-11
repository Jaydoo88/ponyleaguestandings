// =======================
// PonyLeagueStandings — Supabase-powered front-end
// =======================

// Supabase client from <head>
const sb = window.supabaseClient;

// State
let weeklyResults = {}; // { "1": [ {bowler1, scores1, bowler2, scores2}, ... ], ... }
let currentWeek = 4;

// ------------- Auth -------------
async function sendMagicLink() {
  const emailEl = document.getElementById('adminEmail');
  const email = emailEl ? emailEl.value.trim() : '';
  if (!email) return showMessage('Enter a valid email address.', 'error');

  const { error } = await sb.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) return showMessage(error.message, 'error');
  showMessage('Login link sent. Check your email.', 'success');
}

async function adminLogout() {
  await sb.auth.signOut();
  toggleAdminUI(false);
  showMessage('Logged out.', 'success');
}

function toggleAdminUI(isLoggedIn) {
  const login = document.getElementById('adminLogin');
  const panel = document.getElementById('adminPanel');
  if (login) login.style.display = isLoggedIn ? 'none' : 'block';
  if (panel) panel.style.display = isLoggedIn ? 'block' : 'none';
}

// ------------- Data I/O -------------
async function fetchAllResults() {
  const { data, error } = await sb
    .from('matches')
    .select('*')
    .order('week', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('fetchAllResults error:', error);
    showMessage('Could not load results.', 'error');
    return;
  }

  weeklyResults = {};
  (data || []).forEach(row => {
    const w = String(row.week);
    if (!weeklyResults[w]) weeklyResults[w] = [];
    weeklyResults[w].push({
      bowler1: row.bowler1,
      scores1: row.scores1,
      bowler2: row.bowler2,
      scores2: row.scores2
    });
  });
}

async function addMatchResult() {
  // Require logged in
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return showMessage('Please log in via the email link first.', 'error');

  const week = parseInt(document.getElementById('adminWeek').value, 10);
  const bowler1 = document.getElementById('bowler1').value.trim();
  const scores1Str = document.getElementById('scores1').value;
  const bowler2 = document.getElementById('bowler2').value.trim();
  const scores2Str = document.getElementById('scores2').value;

  if (!bowler1 || !scores1Str || !bowler2 || !scores2Str) {
    return showMessage('Please fill in all fields.', 'error');
  }

  const scores1 = scores1Str.split(',').map(s => parseInt(s.trim(), 10));
  const scores2 = scores2Str.split(',').map(s => parseInt(s.trim(), 10));
  if (scores1.length !== 3 || scores2.length !== 3 || scores1.some(isNaN) || scores2.some(isNaN)) {
    return showMessage('Enter exactly 3 numbers per bowler (e.g., 245,210,188).', 'error');
  }

  const { error } = await sb.from('matches').insert({ week, bowler1, scores1, bowler2, scores2 });
  if (error) {
    console.error('addMatchResult error:', error);
    return showMessage(error.message, 'error');
  }

  // Clear form
  document.getElementById('bowler1').value = '';
  document.getElementById('scores1').value = '';
  document.getElementById('bowler2').value = '';
  document.getElementById('scores2').value = '';

  showMessage(`Match result added for Week ${week}!`, 'success');

  await fetchAllResults();

  // Update active tab
  if (document.getElementById('weekly-results')?.classList.contains('active')) {
    const weekSelect = document.getElementById('weekSelect');
    if (weekSelect) weekSelect.value = String(week);
    loadWeeklyResults();
  }
  if (document.getElementById('standings')?.classList.contains('active')) {
    updateStandings();
  }
}

// ------------- UI Logic -------------
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

function computeStandingsFrom(resultsByWeek) {
  const map = new Map();
  const ensure = (name) => {
    if (!map.has(name)) map.set(name, { name, points: 0, games: [], series: [] });
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

      // series point
      const s1 = scores1.reduce((x,y)=>x+y,0);
      const s2 = scores2.reduce((x,y)=>x+y,0);
      if (s1 > s2) a.points++; else if (s2 > s1) b.points++;

      // stats
      a.games.push(...scores1); b.games.push(...scores2);
      a.series.push(s1);        b.series.push(s2);
    });
  });

  return Array.from(map.values()).map(p => {
    const total = p.games.reduce((x,y)=>x+y,0);
    const avg = p.games.length ? Math.round(total / p.games.length) : 0;
    const highG = p.games.length ? Math.max(...p.games) : 0;
    const highS = p.series.length ? Math.max(...p.series) : 0;
    return { name: p.name, points: p.points, avg, highGame: highG, highSeries: highS };
  }).sort((a,b) => b.points - a.points);
}

function updateStandings() {
  const tbody = document.getElementById('standingsBody');
  if (!tbody) return;

  const computed = computeStandingsFrom(weeklyResults);
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
    `;
    tbody.appendChild(row);
  });
}

function loadWeeklyResults() {
  const weekSelect = document.getElementById('weekSelect');
  const content = document.getElementById('weeklyResultsContent');
  if (!content) return;

  const selectedWeek = weekSelect ? (weekSelect.value || String(currentWeek)) : String(currentWeek);
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

function showMessage(message, type) {
  const messageDiv = document.getElementById('adminMessage');
  if (!messageDiv) return;
  messageDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => { messageDiv.innerHTML = ''; }, 3000);
}

// ------------- Init -------------
document.addEventListener('DOMContentLoaded', async () => {
  // Handle currentWeek selector (optional)
  const cw = document.getElementById('currentWeek');
  if (cw) cw.addEventListener('change', e => {
    const v = parseInt(e.target.value, 10);
    if (!isNaN(v)) currentWeek = v;
  });

  // Ensure session bootstrap (handles magic link return)
  await sb.auth.getSession();

  // Auth UI
  const { data: { session } } = await sb.auth.getSession();
  toggleAdminUI(!!session);
  sb.auth.onAuthStateChange((_event, newSession) => toggleAdminUI(!!newSession));

  // Load & render
  await fetchAllResults();
  updateStandings();
  loadWeeklyResults();
});

// Expose functions used by inline HTML (buttons)
window.showTab = showTab;
window.sendMagicLink = sendMagicLink;
window.addMatchResult = addMatchResult;
window.adminLogout = adminLogout;
