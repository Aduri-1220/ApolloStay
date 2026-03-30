# ApolloStay Production Storage

ApolloStay now includes a production migration foundation built around:

- Neon PostgreSQL for application data
- Cloudflare R2 or another S3-compatible bucket for uploaded files

## Recommended production setup

### PostgreSQL

Set:

- `DATABASE_URL`

Then run:

```bash
npm run db:setup
npm run db:migrate
```

This migrates the current local JSON stores into PostgreSQL tables for:

- users
- sessions
- profiles
- medical records
- meal logs
- hydration logs
- meal plans
- custom foods
- favorite foods
- workout logs
- workout exercises
- medical parser cache

### Object storage

Optional upload mirroring uses:

- `OBJECT_STORAGE_BUCKET`
- `OBJECT_STORAGE_ENDPOINT`
- `OBJECT_STORAGE_REGION`
- `OBJECT_STORAGE_ACCESS_KEY_ID`
- `OBJECT_STORAGE_SECRET_ACCESS_KEY`
- `OBJECT_STORAGE_PUBLIC_BASE_URL`

When configured, uploads are still written locally for OCR and parsing, and are also mirrored to object storage under:

- `uploads/<timestamp>-filename>`

## Why this is the current best path

The app already works locally with JSON files. This production foundation gives you a realistic publish path for multi-user deployment without destabilizing the current app during development.
