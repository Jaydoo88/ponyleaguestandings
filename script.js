// ----- Sample data (replace with API/DB later) -----
let bowlers = [
  { name: "Mike Johnson", points: 15, avg: 218, highGame: 279, highSeries: 710 },
  { name: "Sarah Davis", points: 14, avg: 205, highGame: 268, highSeries: 650 },
  { name: "Tom Wilson", points: 13, avg: 212, highGame: 290, highSeries: 678 },
  { name: "Lisa Brown", points: 12, avg: 198, highGame: 245, highSeries: 612 },
  { name: "Dave Miller", points: 11, avg: 223, highGame: 288, highSeries: 689 },
  { name: "Jenny Garcia", points: 11, avg: 201, highGame: 256, highSeries: 634 },
  { name: "Chris Taylor", points: 10, avg: 215, highGame: 267, highSeries: 663 },
  { name: "Amy Anderson", points: 9,  avg: 207, highGame: 251, highSeries: 641 },
];

let weeklyResults = {
  1: [
    { bowler1: "Mike Johnson", scores1: [245, 210, 188], bowler2: "Sarah Davis", scores2: [201, 225, 195] },
    { bowler1: "Tom Wilson",  scores1: [234, 189, 203], bowler2: "Lisa Brown",  scores2: [178, 201, 188] }
  ],
  2: [
    { bowler1: "Dave Miller", scores1: [256, 199, 234], bowler2: "Jenny Garcia", scores2: [189, 234, 201] },
    { bowler1: "Chris Taylor", scores1: [201, 267, 195], bowler2: "Amy Anderson", scores2: [212, 189, 251] }
  ],
  3: [
    { bowler1: "Mike Johnson", scores1: [267, 223, 201], bowler2: "Tom Wilson", scores2: [290, 201, 187] },
    { bowler1: "Sarah Davis", scores1: [268, 201, 181], bowler2: "Dave Miller", scores2: [234, 288, 167] }
  ],
  4: [
    { bowler1: "Lisa Brown", scores1: [245, 189, 178], bowler2: "Jenny Garcia", scores2: [256, 201, 177] },
    { bowler1: "Chris Taylor", scores1: [234, 201, 228], bowler2: "Amy Anderson", scores2: [201, 189, 251] }
  ]
};

let currentWeek = 4;
let isAdminLoggedIn = false;

// ----- Tabs -----
function showTab(tabName, btnEl) {
  // hide all
  document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
  document.querySelectorAll('.nav-tab').forEach(t => {
    t.classList.remove('active');
    t.setAttribute('aria-selected', 'false');
  });

  // show selected
  document.getElementById(tabName).classList.add('active');
  if (btnEl) {
    btnEl.classList.add('active');
    btnEl.setAttribute('aria-selected', 'true');
  }

  // load content
  if (tabName === 'standings') {
    updateStandings();
  } else if (tabName === 'weekly-results') {
    loadWeeklyResults();
  }
}

// ----- Standings -----
function updateStandings() {
  const tbody = document.getElementById('standingsBody');
  tbody.innerHTML = '';

  const sortedBowlers = [...bowlers].sort((a, b) => b.points - a.points);

  sortedBowlers.forEach((bowler, index) => {
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

// ----- Weekly Results -----
function loadWeeklyResults() {
  const selectedWeek = document.getElementById('weekSelect').value;
  const content = document.getElementById('weeklyResultsContent');
  const results = weeklyResults[selectedWeek] || [];

  if (results.length === 0) {
    content.innerHTML = '<p>No results available for this week.</p>';
    return;
  }

  let html = '';
  results.forEach(match => {
    const series1 = match.scores1.reduce((a, b) => a + b, 0);
    const series2 = match.scores2.reduce((a, b) => a + b, 0);

    let points1 = 0, points2 = 0;
    for (let i = 0; i < 3; i++) {
      if (match.scores1[i] > match.scores2[i]) points1++;
      else if (match.scores2[i] > match.scores1[i]) points2++;
    }
    if (series1 > series2) points1++; else if (series2 > series1) points2++;

    html += `
      <div class="matchup-card">
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler1}</div>
          <div class="scores">
            ${match.scores1.map(score => `<span class="score">${score}</span>`).join('')}
          </div>
          <div style="margin-top: 10px;">
            <strong>Series: ${series1}</strong><br>
            <span style="color: #ffd700;">Points: ${points1}</span>
          </div>
        </div>
        <div class="vs-separator">VS</div>
        <div class="bowler-info">
          <div class="bowler-name">${match.bowler2}</div>
          <div class="scores">
            ${match.scores2.map(score => `<span class="score">${score}</span>`).join('')}
          </div>
          <div style="margin-top: 10px;">
            <strong>Series: ${series2}</strong><br>
            <span style="color: #ffd700;">Points: ${points2}</span>
          </div>
        </div>
      </div>
    `;
  });

  content.innerHTML = html;
}

// ----- Admin -----
function adminLogin() {
  const password = document.getElementById('adminPassword').value;
  if (password === 'bowling2024') { // demo only
    isAdminLoggedIn = true;
    document.getElementById('adminLogin').style.display = 'none';
    document.getElementById('adminPanel').style.display = 'block';
    showMessage('Login successful!', 'success');
  } else {
    showMessage('Invalid password!', 'error');
  }
}

function adminLogout() {
  isAdminLoggedIn = false;
  document.getElementById('adminLogin').style.display = 'block';
  document.getElementById('adminPanel').style.display = 'none';
  document.getElementById('adminPassword').value = '';
  showMessage('Logged out successfully!', 'success');
}

function addMatchResult() {
  if (!isAdminLoggedIn) return;

  const week = document.getElementById('adminWeek').value;
  const bowler1 = document.getElementById('bowler1').value.trim();
  const scores1Str = document.getElementById('scores1').value;
  const bowler2 = document.getElementById('bowler2').value.trim();
  const scores2Str = document.getElementById('scores2').value;

  if (!bowler1 || !scores1Str || !bowler2 || !scores2Str) {
    showMessage('Please fill in all fields!', 'error');
    return;
  }

  try {
    const scores1 = scores1Str.split(',').map(s => parseInt(s.trim(), 10));
    const scores2 = scores2Str.split(',').map(s => parseInt(s.trim(), 10));
    if (scores1.length !== 3 || scores2.length !== 3 || scores1.some(isNaN) || scores2.some(isNaN)) {
      throw new Error('Each bowler must have exactly 3 numbers');
    }

    if (!weeklyResults[week]) weeklyResults[week] = [];
    weeklyResults[week].push({ bowler1, scores1, bowler2, scores2 });

    // Clear form
    document.getElementById('bowler1').value = '';
    document.getElementById('scores1').value = '';
    document.getElementById('bowler2').value = '';
    document.getElementById('scores2').value = '';

    showMessage(`Match result added for Week ${week}!`, 'success');

    // Optionally refresh current view
    if (document.getElementById('weekly-results').classList.contains('active')) {
      document.getElementById('weekSelect').value = week;
      loadWeeklyResults();
    } else if (document.getElementById('standings').classList.contains('active')) {
      updateStandings();
    }
  } catch {
    showMessage('Error: Please enter valid scores (3 numbers separated by commas)', 'error');
  }
}

function showMessage(message, type) {
  const messageDiv = document.getElementById('adminMessage');
  messageDiv.innerHTML = `<div class="alert alert-${type}">${message}</div>`;
  setTimeout(() => { messageDiv.innerHTML = ''; }, 3000);
}

// ----- Init -----
document.addEventListener('DOMContentLoaded', () => {
  // sync currentWeek select (not used in calc yet, but ready)
  const cw = document.getElementById('currentWeek');
  if (cw) cw.addEventListener('change', e => { currentWeek = parseInt(e.target.value, 10) || currentWeek; });

  updateStandings();
  loadWeeklyResults();
});
