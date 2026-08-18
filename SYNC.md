# Realmate Mobile — Snapshot & Sync Log

This project is the **Realmate mobile app**. It is a **separate, independent project**
from the Realmate website. It contains a **one-way snapshot** of the website's
client-side frontend, wrapped (later) with Capacitor for iOS and Android.

## Source of this snapshot

| Field | Value |
|-------|-------|
| Source repository (path) | `~/Desktop/Realmate` (the Realmate WEBSITE repo) |
| Source branch | `main` |
| Source commit | `90abb0392a031b55f09cd417b005383f91ad77ba` (short `90abb03`) |
| Snapshot date | 2026-08-18 |
| Snapshot method | Copy of **root-level client files only** (maxdepth 1) + `images/` |

## Synchronization direction — ONE WAY ONLY

```
WEBSITE  ──────────────►  MOBILE
(source of truth)         (downstream copy)
```

- Code flows **WEBSITE → MOBILE only.**
- Mobile changes must **NEVER** be pushed back into the website automatically or manually.
- The website repository is **PROTECTED** and must remain untouched by mobile work.
- To refresh this snapshot, re-copy the same file set from the website and record a new
  entry in the "Sync history" section below.

## What WAS copied into `www/` (client runtime only)

- All **root-level HTML** pages (24)
- All **root-level CSS** (14)
- All **root-level frontend JS** (33)
- **images/** — the only local asset directory referenced by the frontend (15 assets)

Fonts and icons load from public CDNs (Font Awesome, Google Fonts) and the Supabase
JS SDK loads from jsDelivr — same as the website. No local copies of those are needed.

## What was INTENTIONALLY EXCLUDED (and why)

| Excluded | Reason |
|----------|--------|
| `realmate-frontend/` mirror | Duplicate of root; copied from canonical root only |
| `*.sql` migrations | Backend schema, already applied to Supabase; not client runtime |
| `supabase/functions/` (Edge Functions) | Deployed in Supabase cloud; called over HTTPS, not bundled |
| `scripts/` | Node tooling that expects **service-role secrets** — must never ship in an app |
| `intelligence-service/` (+ `.venv`) | Dormant server-side Python; not client runtime |
| `realmate-backend/` | Legacy Node server; not part of the static frontend |
| `render.yaml`, `_headers` | Website's Render deploy config — irrelevant to a native app |
| `.github/` workflows | Website CI/deployment configuration |
| `dev-tests/`, `tests/` | Website-repo tests/tooling |
| `*.md` docs, `package-lock.json` (orphan) | Website-repo documentation/tooling |
| Any server-side secrets | **None copied.** Verified: only public **anon** key present (`www/nexus-env.js`, `"role":"anon"`). `service_role` appears only inside code comments, never as a key. |

## Backend

The mobile app reuses the **same Supabase project** as the website via the **public anon
key** already embedded in the frontend. No website or backend configuration was changed.
Any future Supabase change (e.g. adding a mobile deep-link redirect URL) will be
**additive** and flagged before it is made — it will not alter the website's behavior.

## Not done yet (deferred, by design)

- Capacitor dependencies are **declared** in `package.json` but **not installed**.
- No native `ios/` or `android/` projects generated.
- No mobile-specific code, deep links, or push notifications added.
- No cloud builds, signing, or app-store setup.

## Sync history

| Date | Source commit | Notes |
|------|---------------|-------|
| 2026-08-18 | `90abb03` | Initial snapshot — client frontend copied into `www/`. |
