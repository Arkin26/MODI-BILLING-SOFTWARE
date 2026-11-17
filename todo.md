# MODI ELECTRICALS — To-do

## Pending

_(none)_

## Done

### Auto-update from Mac (2026-09-10)
- [x] `npm run pack:update` small pack
- [x] Office app auto-apply from `MODI-Office\\updates\\` (START-MODI.bat + Electron dialog)

### Bill scan + admin workflow (2026-09-10)
- [x] Auto-read bill number (e.g. `2910/26-27`) and Grand Total amount from PDF
- [x] Staff scan → `pending_approval` → admin Approve/Reject on Dashboard
- [x] Admin assigns collection task to user → user “Collection done” → admin “Mark paid”
- [x] Scan PDF available to all logged-in users (not admin-only)

### Party folder bifurcation (backup folders)
- [x] Parent folder for all parties (`parties/`)
- [x] One folder per client with `data.json`, `photos/`, `pdfs/`
- [x] Preview fix (authenticated blob URL)

### Earlier
- [x] Local Postgres + local login (no Supabase)
- [x] Packaged Windows `MODI-Office` app
- [x] Live sync on port 8787
