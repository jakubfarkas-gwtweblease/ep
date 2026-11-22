# Coral Discipline 🌅

A lightweight, installable iPhone habit tracker and daily planner inspired by a burgundy, coral-pink ocean design.

**Live features**

- Day view with horizontal week navigation, day tapping and swipe gestures.
- Task creation, editing, **rescheduling** and check-off. Chronological sorting by task time.
- To reschedule: tap a task title, then choose **Today**, **Tomorrow**, **Next week**, or a custom date and time; tap **Save changes**. The task moves to the chosen day, retains its completion state and updates discipline statistics.
- Touch **swipe left** on a task to reveal a delete button.
- Recurring habits: every day, once a week, or selected weekdays.
- Discipline percentage: **completed scheduled tasks + completed scheduled habits**, each worth exactly one point. Blank days show 0%.
- Tap the discipline ring to see daily, weekly and monthly discipline, a 7-day chart, streaks and achievements.
- All planner data stored locally in your browser, without sign-up, analytics, tracking or backend.
- JSON export/import for backups, with reset option in the statistics sheet.
- Installable web app with offline app-shell caching.

## Try it locally

Serve this folder over HTTP (opening `index.html` as a `file://` page is not suitable for service worker testing):

```bash
python3 -m http.server 8080
```

Visit `http://localhost:8080` in your browser. On iPhone, publish via HTTPS first.

## Publish on GitHub Pages

1. Create a **public** GitHub repository named `coral-discipline`.
2. Upload all the contents of this folder to the repository root (including the `assets` folder).
3. Go to **Settings → Pages**, choose **Deploy from a branch** → `main` → `/ (root)`, and save.
4. Visit `https://YOUR-USERNAME.github.io/coral-discipline/` once deployment finishes.
5. On iPhone Safari: **Share → Add to Home Screen** → Add. Launch via the Home Screen icon.

Because this is a static site, no npm or build step is needed. Relative asset paths make it work under a GitHub Pages repository subdirectory.

## Data and privacy

Data is saved in `localStorage` for the origin from which the app is opened. It **does not automatically sync** between Safari, a different domain, and a Home Screen web app. Safari/iOS may erase website data in some circumstances, especially after clearing browser data or removing the web app. Use **Export backup** in the stats screen regularly. Importing a backup replaces current data after confirmation.

On first launch, a small set of **sample habits and tasks** shows the visual layout. Tap item names to edit them, swipe task rows left to delete, or open the discipline ring → Reset planner for a completely blank start.

### Implementation notes

This project uses plain HTML, CSS and JavaScript, and requires no third-party libraries. For future UI updates, change the cache version in `sw.js` so installed users can receive the changed app-shell files.
