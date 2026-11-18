# My Money — Personal Money Tracker

A mobile-first personal money manager built with React + Vite.

## Features
- Opening balance (your current money when you start)
- Income and expense entries
- Money lent and repayments received
- Money borrowed and repayments made
- Dashboard with available balance, monthly income/expenses, today's expenses
- Lending/borrowing outstanding totals
- Monthly activity chart
- Searchable transaction history with edit/delete
- PDF report download
- Local browser storage (no account, backend, or paid service)

## Run in VS Code
1. Install Node.js (LTS) from https://nodejs.org/
2. Open this folder in VS Code.
3. Open Terminal → New Terminal.
4. Run:

   ```bash
   npm install
   npm run dev
   ```

5. Open the local URL shown by Vite (usually http://localhost:5173).

## Important notes
- Data is stored in this browser on this device using LocalStorage.
- Do not clear browser/site data unless you have exported or otherwise backed up your data.
- This starter version has a PDF report. It does not yet have cloud sync or an automatic backup.
- Opening balance is entered once. To change it, find that entry in Activity and edit it.
- Loans are tracked separately from income/expenses so borrowing is not counted as income and lending is not counted as an expense in the monthly totals. They do affect available cash balance.

## Deploy (GitHub Pages, free)
Live site: https://sbhsajid.github.io/my-money-tracker/

- `.github/workflows/deploy.yml` builds and deploys automatically on every push to `main`.
- `vite.config.js` sets `base` to `/my-money-tracker/`. If you rename the repository, update `REPO_NAME` there.
- In the repository: **Settings → Pages → Build and deployment → Source: GitHub Actions** (one-time).
- `npm run preview` serves the production build at the same sub-path as GitHub Pages, for checking before pushing.

To update the live site:

```bash
git add .
git commit -m "Describe your change"
git push
```

## Sync across devices
Data is stored in a **private** GitHub repo (`sbhSajid/my-money-data`, file `data.json`) via the GitHub
REST API (`src/sync.js`). Each device keeps a local copy (works offline) and merges with GitHub on save,
on open, when the app returns to the foreground, and every 30 s while open. Deletes are kept as
tombstones so they propagate. Set up per device with the cloud button in the top bar, using a
fine-grained token limited to that one repo with **Contents: Read and write**.
The token is stored only in that browser's LocalStorage; it is never in this code repository.

## আমাদের নিজেদের খরচ (shared household expenses)
A separate, Bangla-only section for household costs split between two people (default 60/40,
changeable in its settings). Each expense records who actually paid; settlements record money handed
over to clear dues. It shows who owes whom, a red warning when dues are older than 30 days, each
person's contribution vs. their share, monthly/category breakdowns and a written summary for any
date range or filter.

- Logic: `src/shared.js` (pure functions), UI: `src/Shared.jsx`, sync hook: `src/useSyncedList.js`.
- Data is kept apart from personal money: LocalStorage key `my-money-shared-v1` and, when sync is on,
  the file `shared.json` in the same private data repo. `data.json` is never touched by this section.

## iPhone / Add to Home Screen
Open the live site in Safari → Share → **Add to Home Screen**. It opens full-screen with its own icon
(`public/manifest.webmanifest`, `public/icons/`). The app has no offline mode yet, so it needs internet to open.

Data is saved per browser *and* per website address, so entries made at `localhost` do not appear on the
live site, and Safari data is separate from the Home Screen app's data.
