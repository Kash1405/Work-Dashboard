# Work Dashboard

A private, single-page work dashboard (React + Vite + Tailwind v4), styled with the Accenture palette.

- **Lock screen**: password unlock, the same as the Personal Dashboard.
- **Overview**: a rotating city-skyline hero with a countdown to your next meeting or timed task, plus Daily Tasks, Overall Goals, Links, Calendar and Notes.
- **Focus**: a session timer and the completed-task log.

## Microsoft 365

Sign in with a Microsoft work account (MSAL, from the sync menu at the top right) to:

- keep all data in a **Work Dashboard** folder in your OneDrive for Business (your personal SharePoint): `Tasks.csv`, `Goals.csv`, `Links.csv`, `Focus Log.csv`, `Settings.csv` and `Notes.txt`. The dashboard saves changes there within seconds and picks up edits made to the files every 30 seconds. If both sides changed, the OneDrive copy wins.
- sync the **calendar with Outlook** both ways: Outlook events appear on the dashboard (refreshed every 5 minutes or with **Sync**), and events you add or delete on the dashboard are written to Outlook.

### One-time app registration

1. In [Microsoft Entra → App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade), create a **New registration**, for accounts in this organizational directory only.
2. Add a **Single-page application** redirect URI for each address you open the dashboard from, ending in `/redirect.html`: for example `http://localhost:5180/redirect.html` and `https://kash1405.github.io/Work-Dashboard/redirect.html`.
3. Under **API permissions**, add the Microsoft Graph delegated permissions `User.Read`, `Files.ReadWrite` and `Calendars.ReadWrite`.
4. Paste the **Application (client) ID** and **Directory (tenant) ID** into the dashboard's sync menu. Or set them as the repository variables `MS_CLIENT_ID` and `MS_TENANT_ID` so the GitHub Pages build includes them.

If your organisation blocks app registrations or user consent, IT has to register or approve the app.

## Development

```bash
npm install
npm run dev        # http://localhost:5180
npm run build
npm run vault      # set a new lock-screen password (rewrites src/lib/vault.data.ts)
```

Pushing to `main` deploys to GitHub Pages through `.github/workflows/deploy.yml`. In the repository settings, set Pages → Source to **GitHub Actions**.

Skyline photos are from Wikimedia Commons under CC BY-SA licences; each photo is credited on the page.
