# Coral Discipline — Version 4

A refined, offline-first iPhone-style habits and daily calendar web app. Deep plum / coral-pink color palette, translucent cards, a delicate serif date header, and a local sunset-ocean background. **No server, account, cloud database, dependencies, analytics, or subscription.**

## What's new in V4

### Fast interactions
- Tap **+** for a small **Quick add** sheet. Type a task or habit and save. Date defaults to the selected day; choose **Tomorrow** or **+ Time** if necessary.
- Tap **More options** for a full editor, including optional category, duration, and reminder time.
- **Long-press a task name** (~440 ms) for quick actions: move to tomorrow, move to next week, choose a custom date/time, mark complete, or delete. Tap the task name normally to open its editor.
- Keep **swipe left** to reveal Delete; deleting offers **Undo**. Quick rescheduling offers Undo too.
- Subtle transitions, animated checkmarks and a moving percentage ring. Animations honor the device's **Reduce Motion** setting.

### Calendar, scoring and history
- Tap dates in the week strip, use week arrows, or swipe the week strip to move one day at a time. Dates with a task are marked. A small **Back to today** shortcut appears when you are viewing another day.
- Every task and habit counts equally toward the score. The selected day's percentage is `completed / (scheduled + same-day-or-overdue-rescheduled) × 100`. A task rescheduled *from today or a past day* remains in that original day's denominator, rather than making its score artificially perfect. Rescheduling a future task before it is due does not penalize the future date.
- Tap the discipline ring for daily, weekly and monthly percentages, seven-day progress bars, a **monthly heatmap**, current and best perfect-day streaks, and separate counts for **completed, missed and rescheduled**.
- **Missed** means an incomplete task/habit on a past date; **rescheduled** is tracked separately. Dates with nothing scheduled are neutral.

### Habits
- Daily, weekly (one weekday), or custom weekday schedules.
- In an existing habit's editor, define **pause ranges** for rest days or vacations. Paused days don't enter the discipline denominator or break scheduled-day habit streaks.
- Paused habits remain as muted, editable chips so you can find and unpause them. The statistics screen also lists every habit and allows you to tap one to manage it.

### Local data protection
- Uses the **same localStorage key as V1–V3** (`coral-discipline-v1`). Existing data on the same site/origin and app storage container is migrated automatically to V4.
- Maintains a previous-state recovery copy for malformed-primary-storage recovery; this is **not a substitute for a separate backup**.
- Deleted items enter a **Recently deleted** bin for up to **30 days** (max 120 recent items), accessible from the statistics screen.
- Export a complete JSON backup and import it to restore data. Import requires a confirmation before replacing current data.

### Optional task reminders (important limitation)
- Under **More options** in the task editor, select an in-app reminder at 5, 15, 30 or 60 minutes before the task's start time.
- Toggle in-app reminders in the statistics screen. If the app is **open and visible**, an alert is displayed when the reminder time arrives. The scheduler checks roughly every 20 seconds.
- **There are no reliable background/lock-screen alerts in V4.** iOS background Web Push needs a server sending push events to an installed Home Screen web app. A static, local-data-only GitHub Pages app cannot create reliable scheduled background alerts on its own.

## Preview the source locally

Serve the project directory over HTTP/HTTPS so the service worker can install:

```bash
python3 -m http.server 8080
```

Visit `http://localhost:8080` on your computer. Opening the raw `index.html` file won't enable the service worker. For reliable persistence, use a normal HTTP(S) browser origin.

## Deploy on GitHub Pages

1. Create a **public** GitHub repository, for example `coral-discipline`.
2. Upload the **contents** of this ZIP to the repository root: `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, `assets/`, and this README. Do not upload the enclosing directory as a nested folder.
3. In the GitHub repository, open **Settings → Pages → Build and deployment → Deploy from a branch**, select `main`, `/ (root)`, and save.
4. Open `https://YOUR-USERNAME.github.io/coral-discipline/` on your iPhone using **Safari**. Tap **Share → Add to Home Screen**, then open the icon. The app shell and local ocean image work offline after the first successful cache installation.

### Preserve existing data

Storage belongs to the **website origin and storage container**. Keeping the same GitHub Pages site/path normally preserves your data when updating files. A newly hosted repo, a different domain, clearing site data or removing the installed app may give you a different or empty storage container. **Export a backup from the original app and import it into the new one** whenever changing hosting or installation context.

## Development notes

- HTML/CSS/vanilla JavaScript only. All graphical assets are local.
- The service worker uses `coral-discipline-shell-v4`. Bump the cache name on future releases.
- Reschedules, pauses, deletion history, reminders and exports are retained in the same JSON state.
- Features were tested in an emulated mobile Chromium DOM environment at 320, 375, 390 and 430 px; **physical iPhone Safari testing is still needed**, particularly for long-press behavior, keyboard, iOS input pickers, and Home Screen installation.
- Browser storage is not encrypted by this app, is not cloud-synced, and can be removed by the user or operating system. Keep downloaded backups somewhere you control.
