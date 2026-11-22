/* Coral Discipline — a fully local, offline-capable iPhone planner. No dependencies. */
(() => {
  'use strict';
  const KEY = 'coral-discipline-v1';
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const $ = (id) => document.getElementById(id);
  const today = isoDate(new Date());
  let selectedDate = today;
  let state = loadState();
  let currentType = 'task';
  let editingId = null;
  let customDays = new Set([dayIndex(selectedDate)]);
  let toastTimer;

  function isoDate(d) { return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
  function parseDate(s) { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d, 12); }
  function plusDays(s, n) { const d = parseDate(s); d.setDate(d.getDate() + n); return isoDate(d); }
  function dayIndex(s) { return (parseDate(s).getDay() + 6) % 7; }
  function weekStart(s) { return plusDays(s, -dayIndex(s)); }
  function generateId() { return (self.crypto && self.crypto.randomUUID) ? self.crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`; }
  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function ordinalTime(s) {
    if (!s) return '';
    const [hours, minutes] = s.split(':').map(Number);
    return new Date(2025, 0, 1, hours, minutes).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function defaultState() {
    // Easy-to-delete examples, so the first launch looks like the chosen mockup.
    const items = [
      { title: 'Plan next week', time: '08:00', category: 'PERSONAL', duration: 0, completed: true },
      { title: 'Work on project', time: '10:00', category: 'FOCUS', duration: 90, completed: false },
      { title: 'Clean desk', time: '14:30', category: 'HOME', duration: 0, completed: false },
      { title: 'Evening walk', time: '19:00', category: 'WELLNESS', duration: 0, completed: true }
    ];
    const habitNames = ['Hydrate', 'Move', 'Read', 'Meditate'];
    return {
      version: 1,
      tasks: items.map(x => ({ ...x, id: generateId(), date: today })),
      habits: habitNames.map((title, i) => ({ id: generateId(), title, startDate: today, frequency: 'daily', weekdays: [0,1,2,3,4,5,6], completedDates: i < 3 ? { [today]: true } : {} }))
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.tasks) && Array.isArray(parsed.habits)) return parsed;
      }
    } catch (e) { console.warn('Unable to read saved planner:', e); }
    return defaultState();
  }
  function saveState() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); }
    catch (e) { console.warn('Unable to save planner:', e); toast('Storage unavailable. Changes may not be saved.'); }
  }
  function dueHabit(h, date) {
    if (date < h.startDate) return false;
    if (h.endDate && date > h.endDate) return false;
    if (h.frequency === 'daily') return true;
    return Array.isArray(h.weekdays) && h.weekdays.includes(dayIndex(date));
  }
  function due(date) {
    return {
      tasks: state.tasks.filter(t => t.date === date).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title)),
      habits: state.habits.filter(h => dueHabit(h, date))
    };
  }
  function dailyStats(date) {
    const { tasks, habits } = due(date);
    const completeTasks = tasks.filter(t => t.completed).length;
    const completeHabits = habits.filter(h => !!h.completedDates?.[date]).length;
    const total = tasks.length + habits.length;
    const completed = completeTasks + completeHabits;
    return { total, completed, percent: total ? Math.round(100 * completed / total) : 0, completeTasks, completeHabits, tasksCount: tasks.length, habitsCount: habits.length };
  }
  function rangeStats(start, end, excludeFuture = true) {
    let date = start, completed = 0, total = 0;
    while (date <= end && (!excludeFuture || date <= today)) {
      const stats = dailyStats(date);
      completed += stats.completed;
      total += stats.total;
      date = plusDays(date, 1);
    }
    return { completed, total, percent: total ? Math.round(completed / total * 100) : 0 };
  }
  function streak() {
    let count = 0;
    let date = today;
    if (dailyStats(date).total === 0 || dailyStats(date).completed < dailyStats(date).total) date = plusDays(date, -1);
    for (let i = 0; i < 366; i++) {
      const s = dailyStats(date);
      if (!s.total || s.completed !== s.total) break;
      count++;
      date = plusDays(date, -1);
    }
    return count;
  }
  function render() {
    const date = parseDate(selectedDate);
    $('todayEyebrow').textContent = selectedDate === today ? 'Today' : 'Selected day';
    $('largeDate').textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('weekdayHeading').textContent = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    const score = dailyStats(selectedDate);
    $('dailyPercent').textContent = `${score.percent}%`;
    $('disciplineRing').style.setProperty('--progress', String(score.percent));
    $('disciplineRing').style.setProperty('--angle', `${score.percent * 3.6}deg`);
    renderWeek(); renderHabits(); renderTasks();
  }
  function renderWeek() {
    const start = weekStart(selectedDate);
    $('weekDates').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const ds = plusDays(start, i);
      const hasItems = dailyStats(ds).total > 0;
      return `<button type="button" class="day-button ${ds === selectedDate ? 'active' : ''} ${hasItems ? 'has-items' : ''}" data-date="${ds}" aria-pressed="${ds === selectedDate}" aria-label="${parseDate(ds).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}"><span class="day-label">${WEEKDAYS[i]}</span><span class="day-number">${parseDate(ds).getDate()}</span></button>`;
    }).join('');
  }
  function renderHabits() {
    const items = due(selectedDate).habits;
    const score = dailyStats(selectedDate);
    $('habitCount').textContent = `${score.completeHabits} / ${score.habitsCount}`;
    $('habitsList').innerHTML = items.length ? items.map(h => {
      const checked = !!h.completedDates?.[selectedDate];
      return `<div class="habit-pill"><button class="check-circle ${checked ? 'checked' : ''}" type="button" data-toggle-habit="${escapeHtml(h.id)}" aria-label="${checked ? 'Uncheck' : 'Complete'} ${escapeHtml(h.title)}">${checked ? '✓' : ''}</button><button class="habit-name-button pill-name" data-edit-habit="${escapeHtml(h.id)}" type="button" title="Edit repeating habit">${escapeHtml(h.title)}</button></div>`;
    }).join('') : '<p class="habit-empty">No habits scheduled. Tap + to begin.</p>';
  }
  const trashIcon = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>`;
  function renderTasks() {
    const items = due(selectedDate).tasks;
    $('taskCount').textContent = `${items.length} TODAY`;
    $('tasksList').innerHTML = items.length ? items.map(t => {
      const meta = [t.category, t.time ? ordinalTime(t.time) : '', t.duration ? `${t.duration} MIN` : ''].filter(Boolean).join(' · ');
      return `<div class="task-swipe-track" data-task="${escapeHtml(t.id)}">
        <button class="delete-action" type="button" data-delete-task="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.title)}">${trashIcon}</button>
        <div class="task-row">
          <button class="check-circle ${t.completed ? 'checked' : ''}" type="button" data-toggle-task="${escapeHtml(t.id)}" aria-label="${t.completed ? 'Uncheck' : 'Complete'} ${escapeHtml(t.title)}">${t.completed ? '✓' : ''}</button>
          <button class="task-text" type="button" data-edit-task="${escapeHtml(t.id)}" aria-label="Edit ${escapeHtml(t.title)}"><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(meta)}</span></button>
        </div></div>`;
    }).join('') : '<p class="task-empty">A clear day. Add your first task with +</p>';
    $('tasksList').querySelectorAll('.task-swipe-track').forEach(installSwipe);
  }
  function selectDate(date) { selectedDate = date; render(); }
  function toggleTask(id) {
    const item = state.tasks.find(t => t.id === id);
    if (item) { item.completed = !item.completed; saveState(); render(); }
  }
  function toggleHabit(id) {
    const item = state.habits.find(h => h.id === id);
    if (!item) return;
    if (!item.completedDates) item.completedDates = {};
    if (item.completedDates[selectedDate]) delete item.completedDates[selectedDate];
    else item.completedDates[selectedDate] = true;
    saveState(); render();
  }
  function deleteItem(type, id) {
    if (type === 'task') state.tasks = state.tasks.filter(t => t.id !== id);
    else state.habits = state.habits.filter(h => h.id !== id);
    saveState(); closeAll(); render(); toast(type === 'task' ? 'Task deleted' : 'Habit deleted');
  }
  function installSwipe(track) {
    const row = track.querySelector('.task-row');
    let initialX = 0, initialY = 0, startingOpen = false, distance = 0, isMoving = false;
    track.addEventListener('touchstart', e => {
      if (!e.touches.length) return;
      initialX = e.touches[0].clientX; initialY = e.touches[0].clientY;
      startingOpen = row.classList.contains('is-open');
      distance = 0; isMoving = false;
    }, { passive: true });
    track.addEventListener('touchmove', e => {
      if (!e.touches.length) return;
      const dx = e.touches[0].clientX - initialX, dy = e.touches[0].clientY - initialY;
      if (Math.abs(dx) < 7 && !isMoving) return;
      if (Math.abs(dx) < Math.abs(dy) && !isMoving) return;
      isMoving = true;
      e.preventDefault();
      row.classList.add('swiping');
      distance = Math.max(-88, Math.min(0, dx + (startingOpen ? -88 : 0)));
      row.style.transform = `translateX(${distance}px)`;
    }, { passive: false });
    track.addEventListener('touchend', () => {
      if (!isMoving) return;
      row.classList.remove('swiping'); row.style.transform = '';
      row.classList.toggle('is-open', distance < -44);
      isMoving = false;
    });
    // Desktop drag preview. The listener is short-lived to avoid leaks on re-render.
    track.addEventListener('mousedown', e => {
      if (e.button !== 0 || e.target.closest('button')) return;
      const mouseStart = e.clientX;
      window.addEventListener('mouseup', function finish(mouseUpEvent) {
        const delta = mouseUpEvent.clientX - mouseStart;
        if (Math.abs(delta) > 30) row.classList.toggle('is-open', delta < 0);
      }, { once: true });
    });
  }

  function showModal(id) { $(id).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeAll() { $('editorModal').hidden = true; $('statsModal').hidden = true; document.body.style.overflow = ''; }
  function setType(type) {
    currentType = type;
    $('typeTask').classList.toggle('active', type === 'task');
    $('typeHabit').classList.toggle('active', type === 'habit');
    $('taskFields').hidden = type === 'habit';
    $('taskOptionalFields').hidden = type === 'habit';
    $('rescheduleTools').hidden = type !== 'task' || !editingId;
    $('habitFields').hidden = type !== 'habit';
    $('itemDate').required = type === 'task';
    $('habitStart').required = type === 'habit';
    $('itemTitle').placeholder = type === 'task' ? 'What will you accomplish?' : 'What habit will you build?';
    $('weekdayPicker').hidden = type !== 'habit' || $('habitFrequency').value === 'daily';
  }
  function populateWeekdays() {
    $('weekdayPicker').innerHTML = WEEKDAYS.map((d,i) => `<button type="button" class="weekday-toggle ${customDays.has(i) ? 'active' : ''}" data-weekday="${i}" aria-pressed="${customDays.has(i)}">${d}</button>`).join('');
  }
  function updateRescheduleChoices() {
    const scheduled = $('itemDate').value;
    const presets = { today, tomorrow: plusDays(today, 1), 'next-week': plusDays(today, 7) };
    $('rescheduleTools').querySelectorAll('[data-reschedule]').forEach(button => {
      const active = scheduled === presets[button.dataset.reschedule];
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  function openEditor(type = 'task', id = null) {
    editingId = id;
    const existing = id ? (type === 'task' ? state.tasks : state.habits).find(item => item.id === id) : null;
    $('itemForm').reset();
    $('editorTitle').textContent = id ? (type === 'task' ? 'Edit task' : 'Edit habit') : 'New item';
    $('itemTitle').value = existing?.title || '';
    $('itemDate').value = existing?.date || selectedDate;
    $('itemTime').value = existing?.time || '';
    $('itemCategory').value = existing?.category || 'PERSONAL';
    $('itemDuration').value = existing?.duration || '';
    $('habitStart').value = existing?.startDate || selectedDate;
    $('habitFrequency').value = existing?.frequency || 'daily';
    customDays = new Set(existing?.weekdays || [dayIndex(selectedDate)]);
    populateWeekdays(); setType(type);
    updateRescheduleChoices();
    $('saveButton').textContent = id ? 'Save changes' : 'Save';
    $('typeTask').disabled = !!id; $('typeHabit').disabled = !!id;
    $('deleteFromEditor').hidden = !id;
    showModal('editorModal');
    setTimeout(() => $('itemTitle').focus(), 100);
  }
  function submitEditor(event) {
    event.preventDefault();
    const title = $('itemTitle').value.trim();
    if (!title) return;
    let wasRescheduled = false;
    if (currentType === 'task') {
      const item = editingId ? state.tasks.find(t => t.id === editingId) : { id: generateId(), completed: false };
      if (!item) return;
      const newDate = $('itemDate').value;
      const newTime = $('itemTime').value;
      wasRescheduled = !!editingId && (item.date !== newDate || (item.time || '') !== newTime);
      Object.assign(item, { title, date: newDate, time: newTime, category: $('itemCategory').value, duration: Number($('itemDuration').value) || 0 });
      if (!editingId) state.tasks.push(item);
      selectDate(item.date);
    } else {
      const frequency = $('habitFrequency').value;
      const days = frequency === 'daily' ? [0,1,2,3,4,5,6] : Array.from(customDays).sort();
      if (!days.length) { toast('Select at least one weekday'); return; }
      const item = editingId ? state.habits.find(h => h.id === editingId) : { id: generateId(), completedDates: {} };
      if (!item) return;
      Object.assign(item, { title, startDate: $('habitStart').value, frequency, weekdays: days });
      if (!editingId) state.habits.push(item);
      selectDate(item.startDate);
    }
    saveState(); closeAll(); render();
    toast(wasRescheduled ? `Rescheduled to ${parseDate(selectedDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}` : editingId ? 'Saved changes' : 'Added successfully');
  }
  function openStats() {
    const start = weekStart(selectedDate);
    const week = rangeStats(start, plusDays(start, 6));
    const day = dailyStats(selectedDate);
    const date = parseDate(selectedDate);
    const monthStart = isoDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
    const monthEnd = isoDate(new Date(date.getFullYear(), date.getMonth() + 1, 0, 12));
    const month = rangeStats(monthStart, monthEnd);
    const values = [{ label: 'Selected day', val: day.percent }, { label: 'Week', val: week.percent }, { label: 'Month', val: month.percent }];
    $('statsGrid').innerHTML = values.map(s => `<div class="stat-card"><strong>${s.val}%</strong><span>${s.label}</span></div>`).join('');
    $('weekChart').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const ds = plusDays(today, i - 6); const p = dailyStats(ds).percent;
      return `<div class="chart-col" title="${escapeHtml(ds)}: ${p}%"><div class="chart-track"><div class="chart-fill" style="height:${p}%"></div></div><span>${WEEKDAYS[dayIndex(ds)]}</span></div>`;
    }).join('');
    const days = streak();
    const totalCompleted = state.tasks.filter(t => t.completed).length + state.habits.reduce((a, h) => a + Object.keys(h.completedDates || {}).length, 0);
    $('milestones').textContent = `🔥 ${days}-day perfect streak · ✓ ${totalCompleted} total completions · ${days >= 7 ? '🏆 7-day consistency unlocked' : 'Reach 7 perfect days for your first streak award'} · ${totalCompleted >= 50 ? '🏅 50 completions unlocked' : 'Reach 50 completions for a milestone'}`;
    showModal('statsModal');
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => $('toast').hidden = true, 2600); }
  function downloadBackup() {
    const blob = new Blob([JSON.stringify({ ...state, exportedAt: new Date().toISOString() }, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a'); link.href = url; link.download = `coral-discipline-${today}.json`; document.body.append(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 500);
    toast('Backup exported');
  }
  function importBackup(file) {
    if (!file || file.size > 2_000_000) { toast('Select a backup under 2 MB'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = JSON.parse(reader.result);
        if (!next || !Array.isArray(next.tasks) || !Array.isArray(next.habits) || next.tasks.length > 5000 || next.habits.length > 1000) throw Error('Invalid format');
        const validDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(parseDate(s).getTime());
        if (!next.tasks.every(t => typeof t.id === 'string' && typeof t.title === 'string' && validDate(t.date) && typeof t.completed === 'boolean')) throw Error('Invalid tasks');
        if (!next.habits.every(h => typeof h.id === 'string' && typeof h.title === 'string' && validDate(h.startDate) && ['daily', 'weekly', 'custom'].includes(h.frequency) && Array.isArray(h.weekdays) && h.weekdays.every(d => Number.isInteger(d) && d >= 0 && d <= 6) && h.completedDates && typeof h.completedDates === 'object')) throw Error('Invalid habits');
        if (!confirm('Replace all current data with this backup?')) return;
        state = { version: 1, tasks: next.tasks, habits: next.habits };
        saveState(); closeAll(); render(); toast('Backup restored');
      } catch (e) { toast('This backup could not be imported'); }
    };
    reader.readAsText(file);
  }

  // Events — delegated to survive re-rendering.
  $('weekDates').addEventListener('click', e => {
    const b = e.target.closest('[data-date]'); if (b) selectDate(b.dataset.date);
  });
  $('prevWeek').addEventListener('click', () => selectDate(plusDays(selectedDate, -7)));
  $('nextWeek').addEventListener('click', () => selectDate(plusDays(selectedDate, 7)));
  let weekTouch = null;
  $('weekDates').addEventListener('touchstart', e => { weekTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
  $('weekDates').addEventListener('touchend', e => {
    if (!weekTouch || !e.changedTouches.length) return;
    const dx = e.changedTouches[0].clientX - weekTouch.x;
    const dy = e.changedTouches[0].clientY - weekTouch.y;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.25) { e.preventDefault(); selectDate(plusDays(selectedDate, dx < 0 ? 1 : -1)); }
    weekTouch = null;
  });
  $('habitsList').addEventListener('click', e => {
    const toggle = e.target.closest('[data-toggle-habit]'); if (toggle) return toggleHabit(toggle.dataset.toggleHabit);
    const edit = e.target.closest('[data-edit-habit]'); if (edit) return openEditor('habit', edit.dataset.editHabit);
  });
  $('tasksList').addEventListener('click', e => {
    const remove = e.target.closest('[data-delete-task]'); if (remove) return deleteItem('task', remove.dataset.deleteTask);
    const toggle = e.target.closest('[data-toggle-task]'); if (toggle) return toggleTask(toggle.dataset.toggleTask);
    const edit = e.target.closest('[data-edit-task]'); if (edit) return openEditor('task', edit.dataset.editTask);
  });
  $('addButton').addEventListener('click', () => openEditor());
  $('disciplineButton').addEventListener('click', openStats);
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeAll));
  document.querySelectorAll('.modal-scrim').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) closeAll(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAll(); });
  $('rescheduleTools').addEventListener('click', event => {
    const button = event.target.closest('[data-reschedule]');
    if (!button) return;
    const days = { today: 0, tomorrow: 1, 'next-week': 7 };
    $('itemDate').value = plusDays(today, days[button.dataset.reschedule]);
    updateRescheduleChoices();
  });
  $('itemDate').addEventListener('change', updateRescheduleChoices);
  $('typeTask').addEventListener('click', () => setType('task'));
  $('typeHabit').addEventListener('click', () => setType('habit'));
  $('habitFrequency').addEventListener('change', () => {
    $('weekdayPicker').hidden = $('habitFrequency').value === 'daily';
    if ($('habitFrequency').value === 'weekly' && customDays.size !== 1) customDays = new Set([dayIndex($('habitStart').value)]);
    populateWeekdays();
  });
  $('habitStart').addEventListener('change', () => {
    if ($('habitFrequency').value === 'weekly') { customDays = new Set([dayIndex($('habitStart').value)]); populateWeekdays(); }
  });
  $('weekdayPicker').addEventListener('click', e => {
    const b = e.target.closest('[data-weekday]'); if (!b) return;
    const n = Number(b.dataset.weekday);
    if ($('habitFrequency').value === 'weekly') customDays = new Set([n]);
    else if (customDays.has(n)) customDays.delete(n);
    else customDays.add(n);
    populateWeekdays();
  });
  $('itemForm').addEventListener('submit', submitEditor);
  $('deleteFromEditor').addEventListener('click', () => {
    if (!editingId || !confirm(`Delete this ${currentType}?`)) return;
    deleteItem(currentType, editingId);
  });
  $('exportData').addEventListener('click', downloadBackup);
  $('importData').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', e => { importBackup(e.target.files[0]); e.target.value = ''; });
  $('resetData').addEventListener('click', () => {
    if (!confirm('Delete ALL tasks, habits and history from this device? Export a backup first if you need it.')) return;
    state = { version: 1, tasks: [], habits: [] }; saveState(); closeAll(); render(); toast('Planner reset');
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Offline mode unavailable:', e)));
  }
  // If the user returns later, refresh dates for a new day without requiring a full reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today !== isoDate(new Date())) location.reload();
  });
  render();
  try { if (!localStorage.getItem(KEY)) saveState(); } catch (e) { /* Private storage may be unavailable. */ }
})();
