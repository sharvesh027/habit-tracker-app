// ============================================================
// APP.JS — Dashboard logic
// Talks to the Apps Script backend defined in config.js (API_URL)
// ============================================================

// ---------- STATE ----------
// We keep the current activities + today's logs in memory so we
// don't have to re-fetch on every little UI change.
let activities = [];
let allLogs = [];      // every row from the DailyLogs tab, kept for graphs
let todaysLogs = {};   // { activityId: true/false }
let editingActivityId = null; // null = "add" mode, otherwise "edit" mode

let checklistItems = [];
let editingChecklistId = null; // null = "add" mode, otherwise "edit" mode

// Every customizable color, with the label/description shown in the
// settings panel and the value this app shipped with by default.
const THEME_FIELDS = [
  { key: '--color-bg', label: 'Background', desc: 'Main app background', default: '#0D1512' },
  { key: '--color-surface', label: 'Cards', desc: 'Activity and task row backgrounds', default: '#131E1A' },
  { key: '--color-border', label: 'Borders', desc: 'Outlines and dividers', default: '#223530' },
  { key: '--color-accent', label: 'Accent', desc: 'Checkmarks, active states, graph line', default: '#3FBFA6' },
  { key: '--color-accent-glow', label: 'Accent glow', desc: "Today's streak number, urgent badges", default: '#7EEDD9' },
  { key: '--color-text', label: 'Text', desc: 'Main text color', default: '#E9F2EF' },
  { key: '--color-text-muted', label: 'Muted text', desc: 'Secondary labels and hints', default: '#8CA69D' },
  { key: '--color-danger', label: 'Overdue', desc: 'Overdue tasks and delete actions', default: '#E07A6B' },
];

let currentTheme = {}; // key -> currently applied hex value

// ---------- DATE HELPERS ----------

// Returns today's date as "2026-09-15" using LOCAL time
// (not UTC — important so the date doesn't shift near midnight).
function getLocalDateString(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderHeaderDate() {
  const now = new Date();
  const dayNames = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  document.getElementById('dayName').textContent = dayNames[now.getDay()];
  document.getElementById('dateNumber').textContent =
    `${now.getDate()} ${monthNames[now.getMonth()]}`;
}

// ---------- API HELPERS ----------

// All GET calls (reading data) go through here.
async function apiGet(action) {
  try {
    const res = await fetch(`${API_URL}?action=${action}`);
    const data = await res.json();
    if (data && data.error) {
      alert('Something went wrong loading data:\n' + data.error);
    }
    return data;
  } catch (err) {
    alert('Could not reach the server. Check your internet connection and try again.\n\n' + err.message);
    throw err;
  }
}

// All POST calls (writing data) go through here.
// NOTE: we use "text/plain" as the content type on purpose — it
// avoids the browser sending a CORS "preflight" request, which
// Apps Script Web Apps don't handle. Apps Script still parses the
// body as JSON fine on its end (see doPost in Code.gs).
async function apiPost(payload) {
  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
    });
    const data = await res.json();
    if (data && data.error) {
      alert('Something went wrong saving:\n' + data.error);
    }
    return data;
  } catch (err) {
    alert('Could not reach the server. Check your internet connection and try again.\n\n' + err.message);
    throw err;
  }
}

// ---------- LOADING DATA ----------

async function loadDashboard() {
  const [allActivities, allLogsRaw] = await Promise.all([
    apiGet('getActivities'),
    apiGet('getDailyLogs'),
  ]);

  // Only show activities that are currently active (not deleted),
  // sorted by their SortOrder so add order is preserved.
  activities = allActivities
    .filter(a => a.Active === true || a.Active === 'TRUE')
    .sort((a, b) => a.SortOrder - b.SortOrder);

  allLogs = allLogsRaw;

  // Build a lookup of today's completion state per activity.
  const today = getLocalDateString();
  todaysLogs = {};
  allLogs.forEach(log => {
    if (log.Date === today) {
      todaysLogs[log.ActivityID] = (log.Completed === true || log.Completed === 'TRUE');
    }
  });

  renderActivityList();
  renderWormGraph();
}

// ---------- RENDERING ----------

function renderActivityList() {
  const list = document.getElementById('activityList');
  const emptyState = document.getElementById('emptyState');
  list.innerHTML = '';

  if (activities.length === 0) {
    emptyState.hidden = false;
  } else {
    emptyState.hidden = true;
  }

  activities.forEach(activity => {
    const isDone = !!todaysLogs[activity.ActivityID];

    const li = document.createElement('li');
    li.className = `activity-row ${isDone ? 'done' : ''}`;
    li.dataset.id = activity.ActivityID;

    li.innerHTML = `
      <div class="activity-checkbox ${isDone ? 'checked' : ''}" data-role="checkbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="#08110E" stroke-width="3">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <span class="activity-name" data-role="name">${escapeHtml(activity.Name)}</span>
      <button class="activity-menu-btn" data-role="menu">⋮</button>
    `;

    list.appendChild(li);
  });

  updateStreakCount();
}

function updateStreakCount() {
  const doneCount = activities.filter(a => todaysLogs[a.ActivityID]).length;
  document.getElementById('todayCount').textContent = doneCount;
  document.getElementById('todayTotal').textContent = `of ${activities.length} done`;
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// ---------- CHECKBOX TOGGLE ----------

async function toggleActivity(activityId) {
  const newState = !todaysLogs[activityId];

  // Optimistic update: change the UI immediately, then confirm
  // with the server. Feels instant on a phone even on slow wifi.
  todaysLogs[activityId] = newState;
  renderActivityList();

  // Keep the in-memory log list in sync too, so the worm graph
  // reflects today's change without waiting on a re-fetch.
  const today = getLocalDateString();
  const existing = allLogs.find(l => l.Date === today && l.ActivityID === activityId);
  if (existing) {
    existing.Completed = newState;
  } else {
    allLogs.push({ Date: today, ActivityID: activityId, Completed: newState });
  }
  renderWormGraph();

  await apiPost({
    action: 'logActivity',
    activityId: activityId,
    date: getLocalDateString(),
    completed: newState,
  });
}

// ---------- WORM GRAPH (last 14 days, dashboard top) ----------

function renderWormGraph() {
  const container = document.getElementById('wormGraph');
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  // Build an array of the last 14 days, oldest first, each with
  // its completed count for that day.
  const days = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = getLocalDateString(d);
    const count = allLogs.filter(l =>
      l.Date === dateStr && (l.Completed === true || l.Completed === 'TRUE')
    ).length;
    days.push({ dateStr, count, day: d.getDate(), month: monthNames[d.getMonth()] });
  }

  const maxCount = Math.max(1, ...days.map(d => d.count), activities.length);

  // ----- SVG geometry -----
  const width = 320;
  const height = 120;
  const paddingX = 8;
  const paddingTop = 10;
  const paddingBottom = 46; // extra room for slanted labels
  const plotHeight = height - paddingTop - paddingBottom;
  const stepX = (width - paddingX * 2) / (days.length - 1);

  const points = days.map((d, i) => {
    const x = paddingX + i * stepX;
    const y = paddingTop + plotHeight - (d.count / maxCount) * plotHeight;
    return { x, y, ...d };
  });

  const linePath = points.map((p, i) => (i === 0 ? 'M' : 'L') + `${p.x},${p.y}`).join(' ');
  const fillPath = linePath +
    ` L${points[points.length - 1].x},${paddingTop + plotHeight}` +
    ` L${points[0].x},${paddingTop + plotHeight} Z`;

  // Label roughly every 3rd day, but never two labels back-to-back:
  // if the automatic "every 3rd" pick lands right next to the final
  // day, drop it in favor of the final day instead of showing both.
  const lastIndex = points.length - 1;
  let labelIndices = points.map((_, i) => i).filter(i => i % 3 === 0);
  if (labelIndices[labelIndices.length - 1] !== lastIndex) {
    if (lastIndex - labelIndices[labelIndices.length - 1] < 2) {
      labelIndices[labelIndices.length - 1] = lastIndex;
    } else {
      labelIndices.push(lastIndex);
    }
  }

  const dots = points.map((p, i) => `
    <circle class="worm-dot ${i === points.length - 1 ? 'today' : ''}"
      cx="${p.x}" cy="${p.y}" r="${i === points.length - 1 ? 4 : 3}">
      <title>${p.day} ${p.month}: ${p.count} done</title>
    </circle>
  `).join('');

  // Slanted labels: anchored at the top-right of the text, rotated
  // -40deg around the tick point, so they read diagonally without
  // overlapping their neighbors — same treatment as a typical chart
  // axis with tight horizontal spacing.
  const labels = labelIndices.map(i => {
    const p = points[i];
    const labelY = height - 28;
    return `<text class="worm-axis-label" x="${p.x}" y="${labelY}"
      text-anchor="end" transform="rotate(-40 ${p.x} ${labelY})">${p.day} ${p.month}</text>`;
  }).join('');

  container.innerHTML = `
    <svg class="worm-svg" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" style="width:100%; height:120px; overflow: visible;">
      <path class="worm-fill" d="${fillPath}" />
      <path class="worm-line" d="${linePath}" />
      ${dots}
      ${labels}
    </svg>
  `;
}

// ---------- ACTIVITY DETAIL VIEW (calendar heatmap) ----------

function openDetailView(activity) {
  document.getElementById('detailActivityName').textContent = activity.Name;

  // Gather this activity's completed dates into a fast-lookup Set.
  const completedDates = new Set(
    allLogs
      .filter(l => l.ActivityID === activity.ActivityID &&
        (l.Completed === true || l.Completed === 'TRUE'))
      .map(l => l.Date)
  );

  renderDetailStats(activity, completedDates);
  renderHeatmap(completedDates);

  document.getElementById('detailOverlay').hidden = false;
}

function renderDetailStats(activity, completedDates) {
  const totalDone = completedDates.size;

  // Current streak: count backward from today while each day is completed.
  let streak = 0;
  const cursor = new Date();
  while (completedDates.has(getLocalDateString(cursor))) {
    streak++;
    cursor.setDate(cursor.getDate() - 1);
  }

  document.getElementById('detailStats').innerHTML = `
    <div>
      <div class="detail-stat-value">${streak}</div>
      <div class="detail-stat-label">day streak</div>
    </div>
    <div>
      <div class="detail-stat-value">${totalDone}</div>
      <div class="detail-stat-label">total days done</div>
    </div>
  `;
}

// Builds a GitHub-style grid: columns are weeks, rows are Sun..Sat,
// covering the last ~12 weeks. Filled squares = completed that day.
function renderHeatmap(completedDates) {
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';

  const totalWeeks = 12;
  const today = new Date();

  // Find the most recent Saturday (end of the current week column)
  const endOfWeek = new Date(today);
  endOfWeek.setDate(today.getDate() + (6 - today.getDay()));

  // Start = 12 weeks before that, on a Sunday
  const start = new Date(endOfWeek);
  start.setDate(start.getDate() - totalWeeks * 7 + 1);

  for (let w = 0; w < totalWeeks; w++) {
    const weekEl = document.createElement('div');
    weekEl.className = 'heatmap-week';

    for (let d = 0; d < 7; d++) {
      const cellDate = new Date(start);
      cellDate.setDate(start.getDate() + w * 7 + d);

      const cellEl = document.createElement('div');
      const dateStr = getLocalDateString(cellDate);
      const isFuture = cellDate > today;
      const isFilled = completedDates.has(dateStr);

      cellEl.className = `heatmap-cell ${isFilled ? 'filled' : ''} ${isFuture ? 'future' : ''}`;
      cellEl.title = `${dateStr}${isFilled ? ' — done' : ''}`;

      weekEl.appendChild(cellEl);
    }

    container.appendChild(weekEl);
  }
}

function closeDetailView() {
  document.getElementById('detailOverlay').hidden = true;
}

// ---------- ADD / EDIT / DELETE MODAL ----------

function openAddModal() {
  editingActivityId = null;
  document.getElementById('modalTitle').textContent = 'Add activity';
  document.getElementById('activityNameInput').value = '';
  document.getElementById('deleteActivityBtn').hidden = true;
  document.getElementById('activityModal').hidden = false;
  document.getElementById('activityNameInput').focus();
}

function openEditModal(activity) {
  editingActivityId = activity.ActivityID;
  document.getElementById('modalTitle').textContent = 'Edit activity';
  document.getElementById('activityNameInput').value = activity.Name;
  document.getElementById('deleteActivityBtn').hidden = false;
  document.getElementById('activityModal').hidden = false;
  document.getElementById('activityNameInput').focus();
}

function closeModal() {
  document.getElementById('activityModal').hidden = true;
}

async function saveActivity() {
  const name = document.getElementById('activityNameInput').value.trim();
  if (!name) return;

  if (editingActivityId) {
    await apiPost({ action: 'updateActivity', id: editingActivityId, name });
  } else {
    await apiPost({ action: 'addActivity', name });
  }

  closeModal();
  await loadDashboard();
}

async function deleteActivity() {
  if (!editingActivityId) return;
  const confirmed = confirm('Delete this activity? Past history is kept, it just won\'t show on your dashboard anymore.');
  if (!confirmed) return;

  await apiPost({ action: 'deleteActivity', id: editingActivityId });
  closeModal();
  await loadDashboard();
}

// ---------- THEME / COLOR SETTINGS ----------

function getDefaultTheme() {
  const obj = {};
  THEME_FIELDS.forEach(f => { obj[f.key] = f.default; });
  return obj;
}

// Pushes a theme object's colors onto the live page by setting each
// CSS variable on the root element. Every element using var(--color-x)
// updates instantly, with no page reload.
function applyTheme(theme) {
  Object.entries(theme).forEach(([key, value]) => {
    document.documentElement.style.setProperty(key, value);
  });
  currentTheme = { ...currentTheme, ...theme };
}

// input[type=color] requires a strict "#rrggbb" value — guard against
// anything stored that doesn't match, so a bad value can't break the picker.
function toHex(value) {
  return /^#[0-9a-fA-F]{6}$/.test(value) ? value : '#000000';
}

async function loadTheme() {
  const savedRows = await apiGet('getSettings'); // [{ ColorKey, ColorValue }, ...]
  const theme = getDefaultTheme();
  savedRows.forEach(row => {
    if (row.ColorKey && theme.hasOwnProperty(row.ColorKey)) {
      theme[row.ColorKey] = row.ColorValue;
    }
  });
  applyTheme(theme);
}

function renderColorSettings() {
  const list = document.getElementById('colorSettingList');
  list.innerHTML = THEME_FIELDS.map(f => `
    <div class="color-setting-row">
      <div>
        <div class="color-setting-name">${f.label}</div>
        <div class="color-setting-desc">${f.desc}</div>
      </div>
      <input type="color" data-key="${f.key}" value="${toHex(currentTheme[f.key] || f.default)}" />
    </div>
  `).join('');
}

function openSettingsOverlay() {
  renderColorSettings();
  document.getElementById('settingsOverlay').hidden = false;
}

function closeSettingsOverlay() {
  document.getElementById('settingsOverlay').hidden = true;
}

async function resetTheme() {
  const confirmed = confirm('Reset all colors to the default dark + teal theme?');
  if (!confirmed) return;

  const defaults = getDefaultTheme();
  applyTheme(defaults);
  renderColorSettings();

  await Promise.all(
    Object.entries(defaults).map(([key, value]) =>
      apiPost({ action: 'updateSetting', key, value })
    )
  );
}

// ---------- CHECKLIST ----------

async function loadChecklist() {
  checklistItems = await apiGet('getChecklist');
  renderChecklist();
}

function renderChecklist() {
  const list = document.getElementById('checklistList');
  const emptyState = document.getElementById('checklistEmptyState');
  list.innerHTML = '';

  if (checklistItems.length === 0) {
    emptyState.hidden = false;
    return;
  }
  emptyState.hidden = true;

  // Sort by soonest due date first. Completed items are removed
  // automatically (see toggleChecklistItem), so everything shown
  // here is still outstanding.
  const sorted = [...checklistItems].sort((a, b) =>
    (a.DueDate || '').localeCompare(b.DueDate || '')
  );

  sorted.forEach(item => {
    const isDone = item.Completed === true || item.Completed === 'TRUE';
    const daysLeft = item.DueDate ? daysUntil(item.DueDate) : null;
    const isOverdue = !isDone && daysLeft !== null && daysLeft < 0;

    const li = document.createElement('li');
    li.className = `checklist-row ${isDone ? 'done' : ''} ${isOverdue ? 'overdue' : ''}`;
    li.dataset.id = item.ChecklistID;

    const dueLabel = item.DueDate ? formatDueDate(item.DueDate) : '';
    const timeLabel = item.ReminderTime ? ` · ${formatTime12h(item.ReminderTime)}` : '';
    const countdownLabel = daysLeft !== null ? formatCountdown(daysLeft) : '';
    const countdownClass = daysLeft === null ? '' : daysLeft < 0 ? 'danger' : daysLeft <= 1 ? 'urgent' : '';

    li.innerHTML = `
      <div class="checklist-checkbox ${isDone ? 'checked' : ''}" data-role="checklist-checkbox">
        <svg viewBox="0 0 24 24" fill="none" stroke="#08110E" stroke-width="3">
          <path d="M5 13l4 4L19 7" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </div>
      <div class="checklist-body">
        <div class="checklist-task">${escapeHtml(item.Task)}</div>
        ${dueLabel ? `
          <div class="checklist-meta">
            <span class="checklist-due">${dueLabel}${timeLabel}</span>
            <span class="checklist-countdown ${countdownClass}">${countdownLabel}</span>
          </div>
        ` : ''}
      </div>
    `;

    list.appendChild(li);
  });
}

// Whole-day difference between today (local) and a "YYYY-MM-DD" due date.
// Positive = days in the future, 0 = today, negative = overdue.
function daysUntil(dueDateStr) {
  const [y, m, d] = dueDateStr.split('-').map(Number);
  const due = new Date(y, m - 1, d);
  const now = new Date();
  const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((due - todayMidnight) / 86400000);
}

function formatCountdown(daysLeft) {
  if (daysLeft === 0) return 'Today';
  if (daysLeft === 1) return 'Tomorrow';
  if (daysLeft > 1) return `in ${daysLeft} days`;
  if (daysLeft === -1) return '1 day overdue';
  return `${Math.abs(daysLeft)} days overdue`;
}

function formatDueDate(dateStr) {
  // dateStr comes in as "2026-09-25" — show as "25 Sep"
  const [y, m, d] = dateStr.split('-').map(Number);
  const monthNames = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d} ${monthNames[m - 1]}`;
}

function formatTime12h(timeStr) {
  // timeStr comes in as "17:00" — show as "5:00 PM"
  const [h, m] = timeStr.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

async function toggleChecklistItem(id) {
  const item = checklistItems.find(c => c.ChecklistID === id);
  if (!item) return;

  // Show the checked state immediately for tactile feedback, then
  // remove the task shortly after — completed tasks don't need to
  // stick around, the whole point of the checklist is what's left.
  item.Completed = true;
  renderChecklist();

  await apiPost({ action: 'updateChecklistItem', id, completed: true });

  setTimeout(async () => {
    checklistItems = checklistItems.filter(c => c.ChecklistID !== id);
    renderChecklist();
    await apiPost({ action: 'deleteChecklistItem', id });
  }, 450);
}

function openAddChecklistModal() {
  editingChecklistId = null;
  document.getElementById('checklistModalTitle').textContent = 'Add task';
  document.getElementById('checklistTaskInput').value = '';
  document.getElementById('checklistDueDateInput').value = '';
  document.getElementById('checklistReminderTimeInput').value = '';
  document.getElementById('checklistReminderMsgInput').value = '';
  document.getElementById('deleteChecklistBtn').hidden = true;
  document.getElementById('checklistModal').hidden = false;
  document.getElementById('checklistTaskInput').focus();
}

function openEditChecklistModal(item) {
  editingChecklistId = item.ChecklistID;
  document.getElementById('checklistModalTitle').textContent = 'Edit task';
  document.getElementById('checklistTaskInput').value = item.Task || '';
  document.getElementById('checklistDueDateInput').value = item.DueDate || '';
  document.getElementById('checklistReminderTimeInput').value = item.ReminderTime || '';
  document.getElementById('checklistReminderMsgInput').value = item.ReminderMessage || '';
  document.getElementById('deleteChecklistBtn').hidden = false;
  document.getElementById('checklistModal').hidden = false;
  document.getElementById('checklistTaskInput').focus();
}

function closeChecklistModal() {
  document.getElementById('checklistModal').hidden = true;
}

async function saveChecklistItem() {
  const task = document.getElementById('checklistTaskInput').value.trim();
  if (!task) return;

  const dueDate = document.getElementById('checklistDueDateInput').value;
  const reminderTime = document.getElementById('checklistReminderTimeInput').value;
  const reminderMessage = document.getElementById('checklistReminderMsgInput').value.trim() || task;

  if (editingChecklistId) {
    await apiPost({
      action: 'updateChecklistItem',
      id: editingChecklistId,
      task, dueDate, reminderTime, reminderMessage,
    });
  } else {
    await apiPost({
      action: 'addChecklistItem',
      task, dueDate, reminderTime, reminderMessage,
    });
  }

  closeChecklistModal();
  await loadChecklist();
}

async function deleteChecklistItemAction() {
  if (!editingChecklistId) return;
  const confirmed = confirm('Delete this task?');
  if (!confirmed) return;

  await apiPost({ action: 'deleteChecklistItem', id: editingChecklistId });
  closeChecklistModal();
  await loadChecklist();
}

// ---------- TAB SWITCHING ----------

function setupTabs() {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById(`${btn.dataset.tab}-panel`).classList.add('active');
    });
  });
}

// ---------- EVENT WIRING ----------

function setupEvents() {
  // Tapping a row's CHECKBOX marks it done/undone.
  // Tapping the NAME opens the calendar detail view.
  // Tapping the ⋮ menu opens edit/delete.
  document.getElementById('activityList').addEventListener('click', (e) => {
    const row = e.target.closest('.activity-row');
    if (!row) return;
    const activityId = row.dataset.id;
    const activity = activities.find(a => a.ActivityID === activityId);

    if (e.target.closest('[data-role="menu"]')) {
      openEditModal(activity);
    } else if (e.target.closest('[data-role="checkbox"]')) {
      toggleActivity(activityId);
    } else if (e.target.closest('[data-role="name"]')) {
      openDetailView(activity);
    }
  });

  document.getElementById('detailBackBtn').addEventListener('click', closeDetailView);

  // Color settings
  document.getElementById('settingsBtn').addEventListener('click', openSettingsOverlay);
  document.getElementById('settingsBackBtn').addEventListener('click', closeSettingsOverlay);
  document.getElementById('resetThemeBtn').addEventListener('click', resetTheme);

  // 'input' fires continuously while dragging in the color picker —
  // used for live preview only, no network call, so it stays smooth.
  document.getElementById('colorSettingList').addEventListener('input', (e) => {
    if (e.target.type !== 'color') return;
    document.documentElement.style.setProperty(e.target.dataset.key, e.target.value);
    currentTheme[e.target.dataset.key] = e.target.value;
  });

  // 'change' fires once, when the picker closes — that's when we
  // actually save, so dragging doesn't spam the backend.
  document.getElementById('colorSettingList').addEventListener('change', (e) => {
    if (e.target.type !== 'color') return;
    apiPost({ action: 'updateSetting', key: e.target.dataset.key, value: e.target.value });
  });

  // Checklist: tap checkbox to toggle done, tap the row body to edit
  document.getElementById('checklistList').addEventListener('click', (e) => {
    const row = e.target.closest('.checklist-row');
    if (!row) return;
    const id = row.dataset.id;

    if (e.target.closest('[data-role="checklist-checkbox"]')) {
      toggleChecklistItem(id);
    } else {
      const item = checklistItems.find(c => c.ChecklistID === id);
      openEditChecklistModal(item);
    }
  });

  document.getElementById('addChecklistBtn').addEventListener('click', openAddChecklistModal);
  document.getElementById('cancelChecklistModalBtn').addEventListener('click', closeChecklistModal);
  document.getElementById('saveChecklistBtn').addEventListener('click', saveChecklistItem);
  document.getElementById('deleteChecklistBtn').addEventListener('click', deleteChecklistItemAction);

  document.getElementById('checklistModal').addEventListener('click', (e) => {
    if (e.target.id === 'checklistModal') closeChecklistModal();
  });

  document.getElementById('addActivityBtn').addEventListener('click', openAddModal);
  document.getElementById('cancelModalBtn').addEventListener('click', closeModal);
  document.getElementById('saveActivityBtn').addEventListener('click', saveActivity);
  document.getElementById('deleteActivityBtn').addEventListener('click', deleteActivity);

  // Tapping the dark overlay (outside the modal card) closes it
  document.getElementById('activityModal').addEventListener('click', (e) => {
    if (e.target.id === 'activityModal') closeModal();
  });
}

// ---------- INIT ----------

function init() {
  loadTheme();
  renderHeaderDate();
  setupTabs();
  setupEvents();
  loadDashboard();
  loadChecklist();
}

document.addEventListener('DOMContentLoaded', init);

// ---------- PWA: SERVICE WORKER REGISTRATION ----------
// This is what makes the browser offer "Install app" / "Add to Home
// Screen", and lets the app open instantly (even offline) afterward.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch((err) => {
      console.error('Service worker registration failed:', err);
    });
  });
}
