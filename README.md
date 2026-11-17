# MODI ELECTRICALS — Invoice Management

Desktop / TSplus app for invoice tracking, PDF scan, parties, ledger, and due-date reminders.

## Office setup (TSplus + local Postgres)

All business data lives on **one office server PC** (Postgres on that machine’s disk).  
TSplus clients on the same Wi‑Fi connect through a small API with **live sync**.

### Transfer pack (recommended)

On your build machine:

```bash
npm install
npm run pack:office
```

Copy `release/MODI-Office/` to the office PC (USB / shared folder).

On the office PC (Postgres 17 already installed):

1. Prefer double‑click **`MODI ELECTRICALS.exe`** if present → enter Postgres password once  
2. Or run **`SETUP-SERVER.bat`** once, then **`START-SERVER.bat`** daily  
3. See `README-TRANSFER.txt` in that folder

### Manual setup

1. Install Postgres on the server PC → create database `modi_electricals`
2. Configure and run the API — see **[`server/README.md`](server/README.md)**
3. In the app → **Database**, enter:
   - API URL: `http://<server-lan-ip>:8787`
   - API token: same as `MODI_API_TOKEN` in `server/.env`
4. Click **Connect** (use **Connect + upload local cache** once if the server is empty and this PC still has old local data)

After connect:

- Saves commit to Postgres **before** the UI updates
- Other open sessions get changes over WebSocket **instantly**
- Closing the app / TSplus does **not** delete data (it stays on the server disk)

## Auth (local only)

- Login users / passwords live in **local Postgres** (`app_users`) on the office PC
- No Supabase / cloud auth
- First admin is created during office setup (or on first login if none exist)
- Admins add more users from **Dashboard → User access**

## Run the app

```bash
npm install
npm run dev
```

Web UI only:

```bash
npm run dev:web
```

## Run the office DB API (server PC)

```bash
npm run server:install
# configure server/.env first
npm run server:init-db
npm run server
```

## Party-centric accounts

- Parties hold invoices + ledger
- Scan PDF → extract → save under party
- Credit limits, payments, FY period filters, party photos

## Stack

- Electron + React + TypeScript + Vite + Tailwind
- Local Postgres + Node API + WebSocket (auth, office data, live sync)
- `pdfjs-dist` for PDF text extraction
# MODI-BILLING-SOFTWARE
