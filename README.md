# Daily Equipment Inspection

A server-based daily equipment inspection app with individual accounts and
two roles: **admin** and **general user**. Inspections (equipment info,
fluid checks, checklist, attachment checks, photos, comments) are stored in
a real Postgres database — not in the browser — so records persist across
devices and are shared by everyone using the app.

## Roles

- **General users** can sign in, log new inspections, and view/print inspection history and reports.
- **Admins** can additionally: edit or delete any inspection, add/remove user accounts, manage email alert recipients, and edit the checklist configuration (equipment types, checklist items, fluid checks, attachments, **locations**) — all from within the app, no code changes needed.

The very first account created (via the one-time setup screen the app shows when no users exist yet) is automatically an admin.

## How it's built

- **Frontend:** a single static page, `index.html` (vanilla JS, no build step). Shows a login/setup screen until you're signed in.
- **Backend:** Vercel serverless functions in `/api`:
  - `GET/POST /api/auth` — setup, login, logout, change password
  - `GET/POST/DELETE /api/users` — admin-only user management
  - `GET/PUT/DELETE /api/config` — checklist configuration (any signed-in user can read it, only admins can change it)
  - `GET/PUT /api/notify` — admin-only management of who gets emailed on flagged inspections
  - `GET/POST/DELETE /api/inspections` — list, create (any signed-in user), delete (admin only); posting with an existing inspection's id is treated as an edit and is admin-only
  - `GET /api/inspection` — fetch one full inspection record (`?id=...`)
- **Email alerts:** via [Resend](https://resend.com) (`lib/email.js`). Fires after an inspection with a flagged item is saved, to whichever addresses are configured in the app's Users tab. No-ops safely if `RESEND_API_KEY` isn't set.
- **Reports:** a dedicated tab filters inspections by location, equipment type, asset/unit #, operator, shift, and date range, shows summary counts and breakdowns by each dimension, and exports the filtered results as CSV or a printable report.
- **Admin Center:** a structured, form-based tab for admins to manage Departments, Regions, Locations, Equipment Types (with their checklist items and Make/Model options), and a real Asset/Unit registry — no JSON editing required. The Checklist Setup tab's JSON editor still exists underneath for bulk edits or the fields Admin Center doesn't cover (common items, fluid items, attachment checklists); both operate on the same config, so either interface reflects the other's changes.
- **Asset registry:** `GET/POST/DELETE /api/assets`. Registering a unit (Unit/Asset Number + its equipment type, model, location, region, department, cost center) makes it autocomplete on the New Inspection form's Unit/Asset Number field — typing or selecting a known unit auto-fills the rest of those fields. Unregistered unit numbers still work fine as free text; the registry is a convenience, not a requirement. The Admin Center's Assets section can filter the registry by any of those fields and print a full inventory report — filters applied, total count, a breakdown by equipment type/location/region/department/cost center, and the complete filtered unit list. A "Populate from existing inspections" button scans all logged inspections for unique unit numbers and registers any not already in the list, using each unit's most recent inspection for its details — it never overwrites a unit you've already registered manually.
- **Bulk import:** `POST /api/import` (admin only) accepts `{ "records": [...] }` and inserts them, skipping and reporting any individually invalid records rather than failing the whole batch. There's an "Import inspections" panel on the Reports tab for admins that does this from a JSON file. `demo-data.json` in this repo is 18 sample inspections (spread across all locations/equipment types/operators/shifts, 6 flagged) for testing History, Reports, and email alerts.
- **Work orders:** one is filed automatically per flagged item (not per inspection — a record with 3 flagged items files 3 work orders) the first time a new inspection is saved with something marked Needs Attention or Low. Editing an already-saved inspection never files duplicates. Any signed-in user can view work orders and move them through Open → In Progress → Closed with resolution notes; only admins can delete one outright. Every inspection's detail view also offers manual work order creation: a "+ Work order" button on each individual check, and a "+ Create work order for this inspection" button at the bottom for a general, not-item-specific issue (prompts for a note). Both dedupe against any already-open work order for that same item/inspection so repeat clicks don't spam duplicates. `GET/POST/PUT/DELETE /api/workorders`.
- **Database:** Postgres via the standard `pg` driver (works with Neon, Supabase, or any Postgres — see setup below). Tables are created automatically the first time the app runs.
- **Auth:** bcrypt-hashed passwords, JWT session tokens in an httpOnly cookie.

## One-time setup after deploying

### 1. Add a Postgres database

Vercel's own "Postgres" storage product is now Neon under the Vercel Marketplace. In the Vercel dashboard, open this project → **Storage** → **Create Database** → **Neon** (or **Marketplace Database Providers** → Neon/Supabase — whichever your dashboard shows), and connect it to this project. This auto-injects a `DATABASE_URL` (or `POSTGRES_URL`) environment variable — the app reads either.

### 2. Add a JWT secret

In **Settings → Environment Variables**, add:

```
JWT_SECRET = <any long random string>
```

This signs login session tokens. You can generate one with `openssl rand -base64 32` in a terminal, or just mash the keyboard for 40+ characters — it just needs to be secret and stay the same across deploys.

### 3. (Optional) Turn on email alerts

The app can email a list of people whenever an inspection is saved with an item marked **Needs Attention** or **Low**. This uses [Resend](https://resend.com) — sign up (free tier is plenty for this), create an API key, then add it in **Settings → Environment Variables**:

```
RESEND_API_KEY = <your Resend API key>
```

Optionally also set:

```
ALERT_FROM_EMAIL = "Equipment Inspections <alerts@yourdomain.com>"
```

If you skip this, `onboarding@resend.dev` is used as the sender — fine for testing, but Resend restricts who that address can send to, so a verified sending domain is worth setting up for real use. Once `RESEND_API_KEY` is set, sign in as an admin and add recipient addresses under **Users → Email alerts** — nothing else needs to change in code. If `RESEND_API_KEY` isn't set, the app still works completely normally; it just skips sending (and tells admins so on the Email alerts panel).

### 4. Redeploy

Redeploy (or push a commit) so the function picks up the new environment variables.

### 5. Create the first admin account

Visit the deployed app. Since no users exist yet, it will show a "Create the first admin account" screen instead of a login form. Whatever account you create here is an admin, and can add more users (admin or general) from the **Users** tab afterward.

## Local development

```bash
npm install
npx vercel dev
```

You'll need to link the project to Vercel (`npx vercel link`) and pull env vars (`npx vercel env pull`) first so `DATABASE_URL` and `JWT_SECRET` are available locally.

## Notes

- Photos are compressed client-side (resized + JPEG-compressed) before upload and stored as part of the inspection record in the database.
- Equipment types, checklist items, fluid checks, attachment checklists, **locations**, **regions**, **departments**, **cost centers**, and **make/model options per equipment type** are no longer hardcoded — admins manage them from the **Checklist Setup** tab in the app (edited as JSON). `DEFAULT_CONFIG` in `lib/db.js` is the fallback/reset-to-defaults value. On the New Inspection form, picking an equipment type reveals a Make/Model dropdown populated from that type's configured models (hidden entirely if a type has none configured).
