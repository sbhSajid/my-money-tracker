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

## iPhone / Add to Home Screen
Open the live site in Safari → Share → **Add to Home Screen**. It opens full-screen with its own icon
(`public/manifest.webmanifest`, `public/icons/`). The app has no offline mode yet, so it needs internet to open.

Data is saved per browser *and* per website address, so entries made at `localhost` do not appear on the
live site, and Safari data is separate from the Home Screen app's data.
