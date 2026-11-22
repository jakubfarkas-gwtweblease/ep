# Coral Discipline — v3

A compact, offline-capable iPhone web app (PWA) for a daily planner and recurring habits, with a coral-pink ocean design. Built without frameworks, APIs, login or subscriptions.

## What changed in v3

- Rebalanced the main screen for iPhone: a smaller date, discipline ring, habit pills and task rows; responsive widths from 320px upward.
- A compact bottom sheet for adding and editing. It includes native date/time pickers, **Today / Tomorrow / Next week** shortcuts, and **More options** for category and duration. It does not bring up the keyboard until you tap a text field.
- Smooth 200–360ms CSS transitions using GPU-friendly transforms: bottom-sheet opening/closing, pull-down-to-dismiss, checkmark feedback, date changes, press states and a percentage-ring animation. Animations honor Reduce Motion.
- Task completion updates instantly without redrawing the entire list.
- Swipe left on a task to reveal Delete; deleting offers an Undo action for several seconds.
- Accommodates the virtual keyboard using the iOS visual viewport so the editor remains reachable.
- Continues to read the same `coral-discipline-v1` localStorage key, so upgrading from v1/v2 on **the same origin and installed-app data store** retains existing tasks and habits.

## Features

- Tap a date in the week strip, use week arrows, or swipe the strip sideways to move between dates. Tap **Today** to return to the present.
- Tap a task's **circle** to complete or uncomplete; tap its **name** to edit or reschedule. Task start time determines display order.
- Tap **+** to create a one-time task or repeating habit. Habits can run daily, weekly, or on selected weekdays.
- Reschedule tasks by editing them and selecting a quick preset or custom date/time. Saving moves the task to its new date and **preserves completion status**.
- The discipline ring shows **(completed tasks + completed habits) / (scheduled tasks + scheduled habits)**, all equally weighted. Tap the ring for day/week/month statistics, previous 7 days, streaks, backup and reset.
- Every edit and completion is saved in your browser using `localStorage` (no accounts, sync or tracking). Export a JSON backup in the statistics sheet.
- Static files plus a versioned service worker let the installed app open without a network connection after its assets have been successfully cached.

## Preview locally

Serve the folder with an HTTP server:

```bash
python3 -m http.server 8080
```

Visit `http://localhost:8080` in a browser. Opening `index.html` as a `file://` page will not allow service-worker offline caching.

## Publish on GitHub Pages

1. Create a new **public** repository named `coral-discipline` on GitHub, optionally with a README.
2. Upload the *contents* of this zip to the repository root. Ensure `index.html`, `styles.css`, `app.js`, `sw.js`, `manifest.webmanifest`, and `assets/` are at the top level.
3. Visit repository **Settings → Pages** → **Deploy from a branch** → `main` → `/ (root)` → Save.
4. Open `https://YOUR-USERNAME.github.io/coral-discipline/` in iPhone Safari. Use **Share → Add to Home Screen**, then launch it from the icon.

In iOS, the Home Screen web app may have separate storage from Safari. Data is tied to the specific origin/storage container and does **not** sync between devices or browsers. Back up periodically via the statistics sheet. Clearing website data or removing the app may erase its data.

## Technical notes

The app uses HTML, CSS and vanilla JavaScript. All graphics are local assets. No dependencies, API keys or external resources. To ship future visual/code updates, increment the `CACHE` name in `sw.js`.

The installed app's UI and gestures are designed to feel like iOS, but are web implementations; actual iOS Safari/standalone behavior and performance must be checked on an iPhone after deployment.
