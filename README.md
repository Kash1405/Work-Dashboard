# Work Dashboard

A private, single-page work dashboard (React + Vite + Tailwind v4), styled with the Accenture palette. It shares its sign-in and sync design with the Personal Dashboard ([Dashboard-AK](https://github.com/Kash1405/Dashboard-AK)).

- **Lock screen**: password unlock, the same as the Personal Dashboard.
- **Overview**: a rotating city-skyline hero with a countdown to your next event or timed task, plus Daily Tasks, Overall Goals, Links, Calendar and Notes.
- **Overview** also shows a rotating quote (a new one every 5 hours, or press *Next quote*).
- **Focus**: a session timer and the completed-task log.
- **Meetings**: a meeting-minutes template (details, attendance, agenda, discussion, decisions, action items, next steps). Submitted minutes are listed by meeting name, sorted by when they were first submitted, and can be expanded, edited, copied as text or deleted.
- **Guidelines & Shortcuts**: Word, PowerPoint and Excel sections, each with an editable shortcuts table, editable quality checklists (add as many as you like), and reference links.

## Google sign-in and sync

Sign in with Google from the sync menu at the top right to keep everything in a **Work Dashboard** folder in your Google Drive:

- **Dashboard Data** (Sheet): Settings, Links, Daily Tasks, Goals, Calendar Events, Shortcuts, Checklists and Guide Links tabs.
- **Dashboard Logs** (Sheet): Focus Sessions and Meeting Minutes (one row per meeting; action items are one per line, as `[ ] Task | Owner | Due`).
- **Notes** (Doc).

Changes upload a couple of seconds after you make them, and edits made in Drive load in every 30 seconds. If both sides changed, Drive wins. **Link Google Calendar** on the Calendar panel to show your Google events and to add or delete them from the dashboard.

The site uses the same Google OAuth Client ID as the Personal Dashboard (set in `.github/workflows/deploy.yml`). Both sites live on `https://kash1405.github.io`, so the client's authorised JavaScript origin already covers this one. For local development, paste the Client ID into the sync menu and add `http://localhost:5180` to the client's authorised origins.

## Microsoft Sync

**Microsoft Sync** (in the sync menu, once Google Drive is connected) saves Excel and Word copies of the Drive folder to your computer: `Dashboard Data.xlsx`, `Dashboard Logs.xlsx`, `Notes.docx` and `About this folder.docx`. It saves any pending changes to Drive first, then has Drive convert the files.

- In Chrome or Edge you pick a folder once and later runs overwrite the files there. Pick your OneDrive (for Business) folder and the copies sync to Microsoft 365 / SharePoint.
- Other browsers download the files instead.
- It only copies one way. Edits made to the Office copies are not read back; keep editing in the dashboard or in Google Drive.

## Development

```bash
npm install
npm run dev        # http://localhost:5180
npm run build
npm run vault      # set a new lock-screen password (rewrites src/lib/vault.data.ts)
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`.

Skyline photos are from Wikimedia Commons under CC BY-SA licences; each photo is credited on the page.
