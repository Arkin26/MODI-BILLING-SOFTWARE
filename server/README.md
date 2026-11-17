# Local Postgres + MODI API (office server PC)

This folder runs on the **server PC** (same Wi‑Fi as TSplus clients).  
Postgres stores all parties / invoices / ledger / photos on **that PC’s disk**.  
Closing the app or TSplus does **not** delete data — only Postgres on this machine holds it.

## One-time setup

1. Install PostgreSQL for Windows (EDB installer).
2. During install, set a password for user `postgres`. Remember it.
3. Open **SQL Shell (psql)** or pgAdmin and create the database:

```sql
CREATE DATABASE modi_electricals;
```

4. In this folder:

```bash
cd server
copy .env.example .env
notepad .env
```

Edit:

- `DATABASE_URL=postgresql://postgres:YOUR_PASSWORD@127.0.0.1:5432/modi_electricals`
- `MODI_API_TOKEN=` a long random secret (same value later in the MODI app)

5. Install and apply schema:

```bash
npm install
npm run init-db
npm start
```

6. Allow Windows Firewall inbound **TCP 8787** on private networks (Wi‑Fi).

7. Find this PC’s LAN IP (`ipconfig`, e.g. `192.168.1.50`).

8. In the MODI app → **Database**:

- API URL: `http://192.168.1.50:8787`
- API token: same as `MODI_API_TOKEN`
- Connect

## Party photos / PDFs

On each party → **Photos / PDFs** tab:

- Upload an image or PDF with a custom **name** and **date**
- Filter by date range
- **Preview** opens inline (image or PDF)
- When the office API is connected, files are stored under `server/uploads/<partyId>/` on the server PC disk (Postgres keeps metadata only)

After pulling schema updates, run `npm run init-db` again on the server PC (safe to re-run).

## Security

- Postgres listens on **127.0.0.1 only** (not open to Wi‑Fi).
- Only this API (port 8787) is reachable on the LAN, and every request needs the **API token**.
- Keep `MODI_API_TOKEN` private; rotate it if someone leaves the company.
- Do not commit `server/.env` to git.

## Live sync

Connected clients open a WebSocket to `/ws`. After any save, the server commits to Postgres, then pushes a fresh snapshot to every open session so changes appear instantly.

## Durability

Every write uses a Postgres **transaction** (`BEGIN` → writes → bump revision → `COMMIT`).  
After commit succeeds, data is on disk. Stopping TSplus or the app does not undo commits.

Keep this `npm start` process running on the server PC (Task Scheduler / NSSM / Windows service recommended for production).
