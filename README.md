# Daily Equipment Inspection

A server-based daily equipment inspection app. Inspections (equipment info,
fluid checks, inspection checklist, attachment checklist, photos, comments)
are stored in a real Postgres database on the server — not in the browser —
so records persist across devices and are shared by everyone using the app.

## How it's built

- **Frontend:** a single static page, `index.html` (vanilla JS, no build step).
- **Backend:** two Vercel serverless functions in `/api`:
  - `GET/POST /api/inspections` — list inspection summaries / save a new inspection
  - `GET /api/inspections/:id` — fetch one full inspection record (with photos)
- **Database:** Postgres, accessed via `@vercel/postgres`. The `inspections`
  table is created automatically the first time the app runs — you don't
  need to run any SQL yourself (see `schema.sql` for reference).

## One-time setup after deploying

The app needs a Postgres database connected to the Vercel project:

1. In the Vercel dashboard, open this project.
2. Go to **Storage** → **Create Database** → choose **Postgres** (Neon).
3. Follow the prompts to create it and connect it to this project. Vercel
   will automatically add the `POSTGRES_URL` (and related) environment
   variables — no manual configuration needed.
4. Redeploy the project (or just wait for the next deploy) so the function
   picks up the new environment variables.

That's it — the next time anyone saves an inspection, the app creates the
`inspections` table automatically.

## Local development

```bash
npm install
npx vercel dev
```

You'll need to link the project to Vercel (`npx vercel link`) and pull env
vars (`npx vercel env pull`) first so `POSTGRES_URL` is available locally.

## Notes

- Photos are compressed client-side (resized + JPEG-compressed) before
  upload and stored as part of the inspection record in the database.
- The equipment types, checklist items, and attachment configurations are
  defined in the `<script>` block in `index.html` — edit the `EQUIPMENT_TYPES`,
  `FLUID_ITEMS`, and `ATTACHMENT_CHECKS` objects there to customize.
