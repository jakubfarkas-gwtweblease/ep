/* Coral Discipline — a fully local, offline-capable iPhone planner. No dependencies. */
(() => {
  'use strict';
  const KEY = 'coral-discipline-v1'; // Keep unchanged for v1–v3 compatibility
  const RECOVERY_KEY = 'coral-discipline-recovery-v4';
  const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const $ = (id) => document.getElementById(id);
  const today = isoDate(new Date());
  let selectedDate = today;
  let state = loadState();
  let currentType = 'task';
  let editingId = null;
  let customDays = new Set([dayIndex(selectedDate)]);
  let toastTimer;
  let modalTimer;
  let undoDeletion = null;
  let suppressNextSwipeClick = false;
  let contextTaskId = null;
  let longPressTimer = null;
  let draftPauses = [];
  let quickType = 'task';
  let quickDate = selectedDate;
  let undoMovement = null;
  const alerted = new Set();
  const runningTimers = [];

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
  function normalizeState(source) {
    if (!source || !Array.isArray(source.tasks) || !Array.isArray(source.habits)) return null;
    const value = { ...source, version: 4 };
    value.reschedules = Array.isArray(value.reschedules) ? value.reschedules.filter(m => m && typeof m.taskId === 'string' && typeof m.from === 'string' && typeof m.to === 'string') : [];
    value.deletedItems = Array.isArray(value.deletedItems) ? value.deletedItems.filter(x => x && typeof x.id === 'string' && typeof x.at === 'string' && x.item && typeof x.item.id === 'string' && ['task','habit'].includes(x.type)) : [];
    value.settings = { remindersEnabled: true, ...(value.settings || {}) };
    value.habits.forEach(h => { h.pauses = Array.isArray(h.pauses) ? h.pauses.filter(p => p && /^\d{4}-\d{2}-\d{2}$/.test(p.from) && /^\d{4}-\d{2}-\d{2}$/.test(p.to) && p.from <= p.to) : []; h.completedDates ||= {}; });
    value.tasks.forEach(t => { t.reminder = Number(t.reminder) || 0; });
    return value;
  }
  function loadState() {
    for (const key of [KEY, RECOVERY_KEY]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) continue;
        const parsed = normalizeState(JSON.parse(raw));
        if (parsed) { if (key === RECOVERY_KEY) setTimeout(() => toast('Recovered your previous saved planner'), 550); return parsed; }
      } catch (e) { console.warn('Planner read failed:', key, e); }
    }
    return normalizeState(defaultState());
  }
  function saveState() {
    try {
      // Store the previous valid snapshot before replacing the main data.
      const previous = localStorage.getItem(KEY);
      if (previous) {
        try { if (normalizeState(JSON.parse(previous))) localStorage.setItem(RECOVERY_KEY, previous); } catch (e) { /* Ignore invalid previous state. */ }
      }
      state.version = 4;
      localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { console.warn('Unable to save:', e); toast('Storage unavailable. Export a backup.'); }
  }
  function activePause(h, date) {
    return (h.pauses || []).some(p => p && p.from <= date && date <= p.to);
  }
  function dueHabit(h, date) {
    if (date < h.startDate) return false;
    if (h.endDate && date > h.endDate) return false;
    if (activePause(h, date)) return false;
    if (h.frequency === 'daily') return true;
    return Array.isArray(h.weekdays) && h.weekdays.includes(dayIndex(date));
  }
  function due(date) {
    return {
      tasks: state.tasks.filter(t => t.date === date).sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title)),
      habits: state.habits.filter(h => dueHabit(h, date))
    };
  }
  function movedOn(date) {
    // Rescheduling today's (or overdue) unfinished obligations keeps the original
    // day's denominator intact. A task moving back to the day isn't double-counted.
    const unique = new Map();
    for (const move of state.reschedules) {
      if (move.from === date && move.from <= today && state.tasks.find(t => t.id === move.taskId)?.date !== date)
        unique.set(move.taskId, move);
    }
    return [...unique.values()];
  }
  function dailyStats(date) {
    const { tasks, habits } = due(date);
    const completeTasks = tasks.filter(t => t.completed).length;
    const completeHabits = habits.filter(h => !!h.completedDates?.[date]).length;
    const moved = movedOn(date).length;
    const total = tasks.length + habits.length + moved;
    const completed = completeTasks + completeHabits;
    const missed = date < today ? (tasks.length - completeTasks) + (habits.length - completeHabits) : 0;
    return { total, completed, percent: total ? Math.round(100 * completed / total) : 0,
      completeTasks, completeHabits, tasksCount: tasks.length, habitsCount: habits.length,
      rescheduled: moved, missed };
  }
  function rangeStats(start, end, excludeFuture = true) {
    let date = start, completed = 0, total = 0, missed = 0, rescheduled = 0;
    while (date <= end && (!excludeFuture || date <= today)) {
      const stats = dailyStats(date);
      completed += stats.completed; total += stats.total; missed += stats.missed; rescheduled += stats.rescheduled;
      date = plusDays(date, 1);
    }
    return { completed, total, missed, rescheduled, percent: total ? Math.round(completed / total * 100) : 0 };
  }
  function streak() {
    let count = 0, d = today;
    const current = dailyStats(d);
    if (current.total === 0 || current.completed < current.total) d = plusDays(d, -1);
    for (let i = 0; i < 366; i++) {
      const score = dailyStats(d);
      if (!score.total) { d = plusDays(d, -1); continue; }
      if (score.completed !== score.total) break;
      count++; d = plusDays(d, -1);
    }
    return count;
  }
  function bestStreak() {
    let best = 0, current = 0, d = plusDays(today, -365);
    for (let i = 0; i <= 365; i++, d = plusDays(d, 1)) {
      const score = dailyStats(d);
      if (!score.total) continue;
      if (score.completed === score.total) best = Math.max(best, ++current);
      else if (d < today) current = 0;
    }
    return best;
  }
  function habitStreak(h) {
    let count = 0, d = today, foundAny = false;
    for (let i = 0; i < 366; i++, d = plusDays(d, -1)) {
      if (d < h.startDate) break;
      if (!dueHabit(h, d)) continue; // Paused days and non-scheduled weekdays are neutral.
      const done = !!h.completedDates?.[d];
      if (!foundAny && d === today && !done) continue; // Today remains in progress.
      foundAny = true;
      if (!done) break;
      count++;
    }
    return count;
  }
  function render() {
    const date = parseDate(selectedDate);
    $('todayEyebrow').textContent = selectedDate === today ? 'Today' : 'Selected day';
    $('largeDate').textContent = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    $('weekdayHeading').textContent = date.toLocaleDateString('en-US', { weekday: 'long' }).toUpperCase();
    updateIndicators();
    renderWeek(); renderHabits(); renderTasks();
    $('jumpToday').hidden = selectedDate === today;
  }
  function updateIndicators() {
    const score = dailyStats(selectedDate);
    $('dailyPercent').textContent = `${score.percent}%`;
    $('disciplineRing').style.setProperty('--angle', `${score.percent * 3.6}deg`);
    $('habitCount').textContent = `${score.completeHabits} / ${score.habitsCount}`;
    $('taskCount').textContent = `${score.tasksCount} ${selectedDate === today ? 'TODAY' : 'TASKS'}`;
  }
  function renderWeek() {
    const start = weekStart(selectedDate);
    $('weekDates').innerHTML = Array.from({ length: 7 }, (_, i) => {
      const ds = plusDays(start, i);
      const hasItems = state.tasks.some(t => t.date === ds);
      return `<button type="button" class="day-button ${ds === selectedDate ? 'active' : ''} ${ds === today ? 'is-today' : ''} ${hasItems ? 'has-items' : ''}" data-date="${ds}" aria-pressed="${ds === selectedDate}" aria-label="${parseDate(ds).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}"><span class="day-label">${WEEKDAYS[i]}</span><span class="day-number">${parseDate(ds).getDate()}</span></button>`;
    }).join('');
  }
  function renderHabits() {
    const items = due(selectedDate).habits;
    const paused = state.habits.filter(h => selectedDate >= h.startDate && activePause(h, selectedDate));
    const score = dailyStats(selectedDate);
    $('habitCount').textContent = `${score.completeHabits} / ${score.habitsCount}`;
    const scheduled = items.map(h => {
      const checked = !!h.completedDates?.[selectedDate];
      return `<div class="habit-pill" title="${habitStreak(h)} scheduled-day streak"><button class="check-circle ${checked ? 'checked' : ''}" type="button" data-toggle-habit="${escapeHtml(h.id)}" aria-label="${checked ? 'Uncheck' : 'Complete'} ${escapeHtml(h.title)}">${checked ? '✓' : ''}</button><button class="habit-name-button pill-name" data-edit-habit="${escapeHtml(h.id)}" type="button" title="Edit repeating habit">${escapeHtml(h.title)}</button></div>`;
    });
    const resting = paused.map(h => `<div class="habit-pill is-paused" title="Paused – tap to adjust"><span aria-hidden="true" class="pause-symbol">Ⅱ</span><button class="habit-name-button pill-name" data-edit-habit="${escapeHtml(h.id)}" type="button">${escapeHtml(h.title)} · paused</button></div>`);
    $('habitsList').innerHTML = scheduled.length || resting.length ? [...scheduled, ...resting].join('') : '<p class="habit-empty">No habits scheduled. Tap + to begin.</p>';
  }
  const trashIcon = `<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M9 6V4h6v2m4 0-1 14H6L5 6m5 4v7m4-7v7"/></svg>`;
  function renderTasks() {
    const items = due(selectedDate).tasks;
    $('taskCount').textContent = `${items.length} ${selectedDate === today ? 'TODAY' : 'TASKS'}`;
    $('tasksList').innerHTML = items.length ? items.map(t => {
      const meta = [t.category, t.time ? ordinalTime(t.time) : '', t.duration ? `${t.duration} MIN` : ''].filter(Boolean).join(' · ');
      return `<div class="task-swipe-track" data-task="${escapeHtml(t.id)}" title="Hold for quick actions">
        <button class="delete-action" type="button" data-delete-task="${escapeHtml(t.id)}" aria-label="Delete ${escapeHtml(t.title)}">${trashIcon}</button>
        <div class="task-row">
          <button class="check-circle ${t.completed ? 'checked' : ''}" type="button" data-toggle-task="${escapeHtml(t.id)}" aria-label="${t.completed ? 'Uncheck' : 'Complete'} ${escapeHtml(t.title)}">${t.completed ? '✓' : ''}</button>
          <button class="task-text" type="button" data-edit-task="${escapeHtml(t.id)}" aria-label="Edit ${escapeHtml(t.title)}"><span class="task-title">${escapeHtml(t.title)}</span><span class="task-meta">${escapeHtml(meta)}</span></button>
        </div></div>`;
    }).join('') : '<p class="task-empty">A clear day. Add your first task with +</p>';
    $('tasksList').querySelectorAll('.task-swipe-track').forEach(t => { installSwipe(t); installLongPress(t); });
  }
  function selectDate(date) {
    if (date === selectedDate) return;
    selectedDate = date; render();
    const content = $('app');
    content.classList.remove('animate-day');
    void content.offsetWidth;
    content.classList.add('animate-day');
  }
  // Update only the checkmark and ring when an item is tapped. Rebuilding the
  // entire list on every tap felt laggy and caused gesture targets to disappear.
  function updateCheck(control, checked, title) {
    if (!control) return;
    control.classList.toggle('checked', checked);
    control.textContent = checked ? '✓' : '';
    control.setAttribute('aria-label', `${checked ? 'Uncheck' : 'Complete'} ${title}`);
    if (checked) { control.classList.remove('just-checked'); void control.offsetWidth; control.classList.add('just-checked'); }
  }
  function toggleTask(id, control) {
    const item = state.tasks.find(t => t.id === id);
    if (!item) return;
    item.completed = !item.completed;
    updateCheck(control, item.completed, item.title);
    saveState(); updateIndicators();
    if (item.completed) navigator.vibrate?.(8);
  }
  function toggleHabit(id, control) {
    const item = state.habits.find(h => h.id === id);
    if (!item) return;
    if (!item.completedDates) item.completedDates = {};
    if (item.completedDates[selectedDate]) delete item.completedDates[selectedDate];
    else item.completedDates[selectedDate] = true;
    updateCheck(control, !!item.completedDates[selectedDate], item.title);
    saveState(); updateIndicators();
    if (item.completedDates[selectedDate]) navigator.vibrate?.(8);
  }
  function deleteItem(type, id) {
    const collection = type === 'task' ? state.tasks : state.habits;
    const index = collection.findIndex(t => t.id === id);
    if (index === -1) return;
    const saved = collection[index];
    collection.splice(index, 1);
    state.deletedItems ||= [];
    state.deletedItems.unshift({ id: generateId(), type, item: JSON.parse(JSON.stringify(saved)), at: new Date().toISOString() });
    state.deletedItems = state.deletedItems.filter(x => Date.now() - new Date(x.at).getTime() < 30 * 86400000).slice(0, 120);
    undoDeletion = { type, item: saved, index };
    saveState(); closeAll(); render();
    toast(type === 'task' ? 'Task deleted' : 'Habit deleted', true);
  }
  function undoDelete() {
    if (!undoDeletion) return;
    const { type, item, index } = undoDeletion;
    const collection = type === 'task' ? state.tasks : state.habits;
    if (!collection.some(x => x.id === item.id)) collection.splice(Math.min(index, collection.length), 0, item);
    state.deletedItems = state.deletedItems.filter(x => x.item.id !== item.id);
    undoDeletion = null;
    saveState(); render(); toast('Restored');
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
      distance = Math.max(-76, Math.min(0, dx + (startingOpen ? -76 : 0)));
      row.style.transform = `translate3d(${distance}px,0,0)`;
    }, { passive: false });
    track.addEventListener('touchend', () => {
      if (!isMoving) return;
      row.classList.remove('swiping'); row.style.transform = '';
      row.classList.toggle('is-open', distance < -39);
      suppressNextSwipeClick = true;
      setTimeout(() => { suppressNextSwipeClick = false; }, 60);
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

  function showModal(id) {
    clearTimeout(modalTimer);
    closeContext();
    for (const name of ['quickModal','editorModal','statsModal']) { $(name).hidden = name !== id; $(name).classList.remove('is-visible'); }
    document.body.style.overflow = 'hidden';
    $('addButton').setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => requestAnimationFrame(() => $(id).classList.add('is-visible')));
  }
  function closeAll() {
    const active = ['quickModal','editorModal','statsModal'].map($).find(el => !el.hidden);
    if (!active) return;
    active.classList.remove('is-visible');
    $('addButton').setAttribute('aria-expanded', 'false');
    clearTimeout(modalTimer);
    modalTimer = setTimeout(() => { active.hidden = true; document.body.style.overflow = ''; }, window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 290);
    if (document.activeElement?.closest('.modal-sheet')) document.activeElement.blur();
  }
  // The keyboard changes the VISUAL viewport on iOS, but not always 100dvh.
  // Keeping the sheet above it avoids large jumps and obscured save buttons.
  function syncVisualViewport() {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const keyboard = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard-offset', `${Math.round(keyboard)}px`);
    document.documentElement.style.setProperty('--visible-height', `${Math.round(viewport.height)}px`);
  }
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', syncVisualViewport, { passive: true });
    window.visualViewport.addEventListener('scroll', syncVisualViewport, { passive: true });
    syncVisualViewport();
  }
  function setType(type) {
    currentType = type;
    $('typeTask').classList.toggle('active', type === 'task');
    $('typeHabit').classList.toggle('active', type === 'habit');
    $('taskFields').hidden = type === 'habit';
    $('taskExtraDetails').hidden = type === 'habit';
    $('rescheduleTools').hidden = type !== 'task' || !editingId;
    $('habitFields').hidden = type !== 'habit';
    $('pauseSettings').hidden = type !== 'habit' || !editingId;
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
    $('itemForm').scrollTop = 0;
    $('taskExtraDetails').open = false;
    $('itemTypeSwitch').hidden = !!id;
    $('editorTitle').textContent = id ? (type === 'task' ? 'Edit task' : 'Edit habit') : 'New item';
    $('itemTitle').value = existing?.title || '';
    $('itemDate').value = existing?.date || selectedDate;
    $('itemTime').value = existing?.time || '';
    $('itemCategory').value = existing?.category || 'PERSONAL';
    $('itemDuration').value = existing?.duration || '';
    $('itemReminder').value = String(existing?.reminder || 0);
    $('habitStart').value = existing?.startDate || selectedDate;
    $('habitFrequency').value = existing?.frequency || 'daily';
    customDays = new Set(existing?.weekdays || [dayIndex(selectedDate)]);
    draftPauses = (existing?.pauses || []).map(p => ({ ...p }));
    renderPauses();
    populateWeekdays(); setType(type);
    updateRescheduleChoices();
    $('saveButton').textContent = id ? 'Save changes' : 'Save';
    $('typeTask').disabled = !!id; $('typeHabit').disabled = !!id;
    $('deleteFromEditor').hidden = !id;
    showModal('editorModal');
    // Do not auto-focus: opening the iOS keyboard immediately made the sheet jump.
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
      if (editingId && item.date !== newDate) recordReschedule(item, newDate);
      Object.assign(item, { title, date: newDate, time: newTime, category: $('itemCategory').value, duration: Number($('itemDuration').value) || 0, reminder: Number($('itemReminder').value) || 0 });
      if (!editingId) state.tasks.push(item);
      selectDate(item.date);
    } else {
      const frequency = $('habitFrequency').value;
      const days = frequency === 'daily' ? [0,1,2,3,4,5,6] : Array.from(customDays).sort();
      if (!days.length) { toast('Select at least one weekday'); return; }
      const item = editingId ? state.habits.find(h => h.id === editingId) : { id: generateId(), completedDates: {} };
      if (!item) return;
      Object.assign(item, { title, startDate: $('habitStart').value, frequency, weekdays: days, pauses: draftPauses.map(p => ({ ...p })) });
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
      const ds = plusDays(today, i - 6); const sc = dailyStats(ds); const p = sc.percent;
      return `<div class="chart-col" title="${escapeHtml(ds)}: ${p}%"><div class="chart-track"><div class="chart-fill" style="height:${p}%"></div></div><span>${WEEKDAYS[dayIndex(ds)]}</span></div>`;
    }).join('');
    $('monthLabel').textContent = date.toLocaleDateString('en-US', { month:'long', year:'numeric' });
    const leading = dayIndex(monthStart);
    const days = parseDate(monthEnd).getDate();
    const blank = Array.from({ length: leading }, () => `<span class="heatmap-spacer"></span>`).join('');
    $('monthHeatmap').innerHTML = blank + Array.from({ length: days }, (_, i) => {
      const ds = isoDate(new Date(date.getFullYear(), date.getMonth(), i + 1, 12));
      const stats = dailyStats(ds);
      const level = ds > today || !stats.total ? 'empty' : stats.percent >= 95 ? 'great' : stats.percent >= 65 ? 'good' : stats.percent >= 30 ? 'some' : 'low';
      return `<button type="button" class="heatmap-day ${level} ${ds === selectedDate ? 'selected' : ''}" data-heatmap-date="${ds}" aria-label="${ds}: ${stats.percent}% discipline"><span>${i+1}</span></button>`;
    }).join('');
    const period = rangeStats(monthStart, monthEnd);
    $('statsSummary').textContent = `${period.completed} completed · ${period.missed} missed · ${period.rescheduled} rescheduled · Unscheduled days are neutral.`;
    $('habitStreakList').innerHTML = state.habits.length ? state.habits.map(h => `<button type="button" class="streak-row" data-manage-habit="${escapeHtml(h.id)}" aria-label="Manage ${escapeHtml(h.title)}"><span>${escapeHtml(h.title)}</span><strong>🔥 ${habitStreak(h)} <small>scheduled days</small></strong></button>`).join('') : '<p class="stats-footnote">Add a repeating habit to track streaks.</p>';
    const current = streak(), best = bestStreak();
    const totalCompleted = state.tasks.filter(t => t.completed).length + state.habits.reduce((a, h) => a + Object.keys(h.completedDates || {}).length, 0);
    $('milestones').textContent = `🔥 ${current}-day current perfect streak · 🏆 ${best}-day best streak · ✓ ${totalCompleted} total completions`;
    $('remindersEnabled').checked = state.settings.remindersEnabled !== false;
    $('storageStatus').textContent = `Local-only storage · ${state.tasks.length} tasks · ${state.habits.length} habits. Export a backup regularly.`;
    renderTrash();
    showModal('statsModal');
  }
  function renderTrash() {
    state.deletedItems = (state.deletedItems || []).filter(x => Date.now() - new Date(x.at).getTime() < 30 * 86400000);
    $('trashList').innerHTML = state.deletedItems.length ? state.deletedItems.slice(0, 8).map(x => `<div class="trash-row"><div><strong>${escapeHtml(x.item.title)}</strong><small>${x.type === 'task' ? 'Task' : 'Habit'} · ${new Date(x.at).toLocaleDateString('en-US', {month:'short',day:'numeric'})}</small></div><button type="button" data-restore="${escapeHtml(x.id)}">Restore</button></div>`).join('') : '<p class="stats-footnote">Nothing in the bin.</p>';
  }
  function restoreDeleted(id) {
    const index = state.deletedItems.findIndex(x => x.id === id);
    if (index < 0) return;
    const saved = state.deletedItems.splice(index,1)[0];
    const target = saved.type === 'task' ? state.tasks : state.habits;
    if (!target.some(x => x.id === saved.item.id)) target.push(saved.item);
    saveState(); render(); renderTrash(); toast('Restored successfully');
  }
  function toast(message, offerUndo = false) {
    clearTimeout(toastTimer);
    const container = $('toast');
    container.replaceChildren(document.createTextNode(message));
    if (offerUndo) {
      const action = document.createElement('button');
      action.textContent = ' Undo';
      action.type = 'button';
      action.className = 'toast-undo';
      action.addEventListener('click', offerUndo === 'move' ? undoMove : undoDelete, { once: true });
      container.append(action);
    }
    container.hidden = false;
    toastTimer = setTimeout(() => { container.hidden = true; undoDeletion = null; }, offerUndo ? 4800 : 2100);
  }
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
        state = normalizeState(next);
        saveState(); closeAll(); render(); toast('Backup restored');
      } catch (e) { toast('This backup could not be imported'); }
    };
    reader.readAsText(file);
  }

  function recordReschedule(item, to) {
    if (item.date <= today) {
      state.reschedules.push({ id: generateId(), taskId: item.id, title: item.title,
        from: item.date, to, at: new Date().toISOString() });
      state.reschedules = state.reschedules.slice(-1000);
    }
  }
  function quickMove(id, date) {
    const item = state.tasks.find(t => t.id === id);
    if (!item || item.date === date) { closeContext(); return; }
    const before = item.date, beforeLogLength = state.reschedules.length;
    recordReschedule(item, date);
    item.date = date;
    undoMovement = { id, date: before, logs: state.reschedules.length - beforeLogLength };
    saveState(); closeContext(); render();
    toast(`Moved to ${parseDate(date).toLocaleDateString('en-US', {month:'short',day:'numeric'})}`, 'move');
  }
  function undoMove() {
    if (!undoMovement) return;
    const { id, date, logs } = undoMovement;
    const item = state.tasks.find(t => t.id === id);
    if (item) item.date = date;
    if (logs) state.reschedules.splice(-logs, logs);
    undoMovement = null;
    saveState(); render(); toast('Reschedule undone');
  }
  function closeContext() {
    clearTimeout(longPressTimer);
    $('taskContext').hidden = true;
    $('contextBackdrop').hidden = true;
    contextTaskId = null;
  }
  function openContext(id, row) {
    const item = state.tasks.find(t => t.id === id);
    if (!item) return;
    closeContext();
    contextTaskId = id;
    $('contextTitle').textContent = item.title;
    $('contextComplete').textContent = item.completed ? '○ Mark incomplete' : '✓ Mark complete';
    $('contextBackdrop').hidden = false;
    const context = $('taskContext');
    context.hidden = false;
    const bounds = row.getBoundingClientRect();
    const popupHeight = context.offsetHeight;
    const vp = window.visualViewport?.height || window.innerHeight;
    const top = bounds.bottom + popupHeight + 12 <= vp ? bounds.bottom + 8 : Math.max(12, bounds.top - popupHeight - 8);
    context.style.top = `${Math.round(top)}px`;
    context.style.left = `${Math.round(Math.max(12, Math.min(bounds.left, window.innerWidth - context.offsetWidth - 12)))}px`;
    navigator.vibrate?.(12);
    suppressNextSwipeClick = true;
    setTimeout(() => { suppressNextSwipeClick = false; }, 140);
  }
  function installLongPress(track) {
    let originX = 0, originY = 0, pending = false;
    track.addEventListener('pointerdown', e => {
      if (!e.target.closest('.task-text') || (e.pointerType === 'mouse' && e.button !== 0)) return;
      originX = e.clientX; originY = e.clientY; pending = true;
      clearTimeout(longPressTimer);
      longPressTimer = setTimeout(() => { if (pending) { pending = false; openContext(track.dataset.task, track); } }, 440);
    });
    const stop = () => { pending = false; clearTimeout(longPressTimer); };
    track.addEventListener('pointermove', e => {
      if (Math.abs(e.clientX - originX) > 10 || Math.abs(e.clientY - originY) > 10) stop();
    });
    track.addEventListener('pointerup', stop);
    track.addEventListener('pointercancel', stop);
    track.addEventListener('contextmenu', e => {
      if (e.target.closest('.task-text')) { e.preventDefault(); stop(); openContext(track.dataset.task, track); }
    });
  }
  function setQuickType(type) {
    quickType = type;
    $('quickTask').classList.toggle('active', type === 'task');
    $('quickHabit').classList.toggle('active', type === 'habit');
    $('quickSchedule').hidden = type !== 'task';
    $('quickHabitNote').hidden = type !== 'habit';
    $('quickSave').textContent = type === 'task' ? 'Add task' : 'Add habit';
    $('quickTitleInput').placeholder = type === 'task' ? 'What do you want to do?' : 'What habit will you build?';
  }
  function updateQuickPresets() {
    $('quickSelected').classList.toggle('active', quickDate === selectedDate);
    $('quickSelected').textContent = selectedDate === today ? 'Today' : parseDate(selectedDate).toLocaleDateString('en-US', {month:'short',day:'numeric'});
    $('quickTomorrow').classList.toggle('active', quickDate === plusDays(today,1));
  }
  function openQuick() {
    $('quickForm').reset();
    $('quickTimeWrap').hidden = true;
    $('quickTimeToggle').textContent = '+ Time';
    quickDate = selectedDate;
    setQuickType('task'); updateQuickPresets();
    showModal('quickModal');
  }
  function saveQuick(e) {
    e.preventDefault();
    const title = $('quickTitleInput').value.trim();
    if (!title) return;
    if (quickType === 'task') {
      state.tasks.push({ id:generateId(), title, date:quickDate, time:$('quickTime').value,
        category:'PERSONAL', duration:0, reminder:0, completed:false });
      selectedDate = quickDate;
    } else {
      state.habits.push({ id:generateId(), title, startDate:selectedDate, frequency:'daily',
        weekdays:[0,1,2,3,4,5,6], completedDates:{}, pauses:[] });
    }
    saveState(); closeAll(); render(); toast('Added successfully');
  }
  function renderPauses() {
    $('pausesList').innerHTML = draftPauses.length ? draftPauses.map((p,i) =>
      `<div class="pause-row"><span>${escapeHtml(p.from)} → ${escapeHtml(p.to)}</span><button type="button" data-remove-pause="${i}" aria-label="Remove pause">×</button></div>`).join('') : '<p class="stats-footnote">No pauses scheduled.</p>';
  }
  function checkReminders() {
    if (document.visibilityState !== 'visible' || !state.settings.remindersEnabled) return;
    const now = Date.now();
    for (const t of state.tasks) {
      if (!t.reminder || !t.time || t.completed) continue;
      const at = new Date(`${t.date}T${t.time}:00`).getTime() - Number(t.reminder) * 60000;
      const key = `${t.id}-${t.date}-${t.time}-${t.reminder}`;
      if (now >= at && now - at <= 120000 && !alerted.has(key)) {
        alerted.add(key);
        toast(`⏰ ${t.title} · ${t.reminder} min before`);
        navigator.vibrate?.([12,24,12]);
      }
    }
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
    const toggle = e.target.closest('[data-toggle-habit]'); if (toggle) return toggleHabit(toggle.dataset.toggleHabit, toggle);
    const edit = e.target.closest('[data-edit-habit]'); if (edit) return openEditor('habit', edit.dataset.editHabit);
  });
  $('tasksList').addEventListener('click', e => {
    if (suppressNextSwipeClick) { e.preventDefault(); return; }
    const remove = e.target.closest('[data-delete-task]'); if (remove) return deleteItem('task', remove.dataset.deleteTask);
    const toggle = e.target.closest('[data-toggle-task]'); if (toggle) return toggleTask(toggle.dataset.toggleTask, toggle);
    const edit = e.target.closest('[data-edit-task]'); if (edit) return openEditor('task', edit.dataset.editTask);
  });
  $('addButton').addEventListener('click', openQuick);
  $('jumpToday').addEventListener('click', () => selectDate(today));
  $('contextBackdrop').addEventListener('click', closeContext);
  $('taskContext').addEventListener('click', e => {
    const b = e.target.closest('[data-context]'); if (!b || !contextTaskId) return;
    const id = contextTaskId;
    const action = b.dataset.context;
    if (action === 'tomorrow') return quickMove(id, plusDays(today,1));
    if (action === 'next-week') return quickMove(id, plusDays(today,7));
    if (action === 'custom') { closeContext(); return openEditor('task',id); }
    if (action === 'complete') { closeContext(); const control = $('tasksList').querySelector(`[data-toggle-task="${CSS.escape(id)}"]`); return toggleTask(id,control); }
    if (action === 'delete') return deleteItem('task',id);
  });
  $('quickTask').addEventListener('click', () => setQuickType('task'));
  $('quickHabit').addEventListener('click', () => setQuickType('habit'));
  $('quickSelected').addEventListener('click', () => {quickDate=selectedDate;updateQuickPresets();});
  $('quickTomorrow').addEventListener('click', () => {quickDate=plusDays(today,1);updateQuickPresets();});
  $('quickTimeToggle').addEventListener('click', () => {
    $('quickTimeWrap').hidden = !$('quickTimeWrap').hidden;
    $('quickTimeToggle').textContent = $('quickTimeWrap').hidden ? '+ Time' : '− Time';
  });
  $('quickMore').addEventListener('click', () => {
    const title = $('quickTitleInput').value;
    const type = quickType, date = quickDate, time = $('quickTime').value;
    openEditor(type);
    $('itemTitle').value = title;
    if (type === 'task') { $('itemDate').value = date; $('itemTime').value = time; }
  });
  $('quickForm').addEventListener('submit',saveQuick);
  $('todayEyebrow').addEventListener('click', () => selectDate(today));
  $('todayEyebrow').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectDate(today); } });
  $('disciplineButton').addEventListener('click', openStats);
  document.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', closeAll));
  document.querySelectorAll('.modal-scrim').forEach(modal => modal.addEventListener('click', e => { if (e.target === modal) closeAll(); }));
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeContext(); closeAll(); } });
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
  $('addPause').addEventListener('click', () => {
    const from = $('pauseFrom').value, to = $('pauseUntil').value || from;
    if (!from || to < from) { toast('Choose a valid pause range'); return; }
    draftPauses.push({from,to}); draftPauses.sort((a,b)=>a.from.localeCompare(b.from));
    renderPauses(); $('pauseFrom').value = ''; $('pauseUntil').value = '';
  });
  $('pausesList').addEventListener('click', e => {
    const b=e.target.closest('[data-remove-pause]'); if(!b)return;
    draftPauses.splice(Number(b.dataset.removePause),1);renderPauses();
  });
  $('itemForm').addEventListener('submit', submitEditor);
  // Pull the small sheet handle down to dismiss, as with a native iOS sheet.
  document.querySelectorAll('.sheet-handle').forEach(handle => {
    let startY, travel, sheet;
    handle.addEventListener('pointerdown', e => {
      startY = e.clientY; travel = 0; sheet = handle.closest('.modal-sheet');
      handle.setPointerCapture?.(e.pointerId);
      sheet.classList.add('is-dragging');
    });
    handle.addEventListener('pointermove', e => {
      if (startY == null) return;
      travel = Math.max(0, e.clientY - startY);
      sheet.style.transform = `translate3d(0,${travel}px,0)`;
    });
    const stop = () => {
      if (startY == null) return;
      sheet.style.transform = '';
      sheet.classList.remove('is-dragging');
      startY = null;
      if (travel > 85) closeAll();
    };
    handle.addEventListener('pointerup', stop);
    handle.addEventListener('pointercancel', stop);
  });
  $('deleteFromEditor').addEventListener('click', () => {
    if (!editingId) return;
    // An undoable action is quicker and less disruptive than a browser alert.
    deleteItem(currentType, editingId);
  });
  $('monthHeatmap').addEventListener('click', e => {
    const b = e.target.closest('[data-heatmap-date]'); if(!b)return;
    const ds=b.dataset.heatmapDate;closeAll();selectDate(ds);
  });
  $('habitStreakList').addEventListener('click', e => {
    const b = e.target.closest('[data-manage-habit]'); if (b) openEditor('habit', b.dataset.manageHabit);
  });
  $('trashList').addEventListener('click',e=>{
    const b=e.target.closest('[data-restore]');if(b)restoreDeleted(b.dataset.restore);
  });
  $('remindersEnabled').addEventListener('change',e=>{
    state.settings.remindersEnabled=e.target.checked;saveState();
    toast(e.target.checked?'In-app reminders on':'In-app reminders off');
  });
  $('exportData').addEventListener('click', downloadBackup);
  $('importData').addEventListener('click', () => $('importFile').click());
  $('importFile').addEventListener('change', e => { importBackup(e.target.files[0]); e.target.value = ''; });
  $('resetData').addEventListener('click', () => {
    if (!confirm('Delete ALL tasks, habits and history from this device? Export a backup first if you need it.')) return;
    state = normalizeState({ tasks: [], habits: [], reschedules: [], deletedItems: [], settings: { remindersEnabled:true } }); saveState(); closeAll(); render(); toast('Planner reset');
  });
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(e => console.warn('Offline mode unavailable:', e)));
  }
  // If the user returns later, refresh dates for a new day without requiring a full reload.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && today !== isoDate(new Date())) location.reload();
    if (document.visibilityState === 'visible') checkReminders();
  });
  render();
  checkReminders();
  window.setInterval(checkReminders, 20000);
  try { if (!localStorage.getItem(KEY)) saveState(); } catch (e) { /* Private storage may be unavailable. */ }
})();
