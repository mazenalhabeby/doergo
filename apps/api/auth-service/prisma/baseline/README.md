# Fresh database baseline

`prisma migrate deploy` cannot build a database from zero: some early tables were
created by syncing the schema directly, so `20260618120000_space_centric_dynamic_access`
alters a table no migration creates. Production is unaffected.

To build a new, empty database (dev machine, staging, a test run):

```bash
DATABASE_URL=postgresql://user:pass@localhost:5432/new_db pnpm db:create-fresh
pnpm db:seed   # optional sample data
```

`create-fresh-db.ts` loads `schema.sql` (production's structure, no data), marks every
migration up to the baseline as applied with Prisma's own checksum, then runs
`prisma migrate deploy` for anything newer. It refuses a database that already has tables.

## Regenerating the baseline

Only needed if the gap between the baseline and today grows large. With production
fully migrated, take a structure-only dump and update the marker line at the top:

```bash
pg_dump -U doergo -d doergo --schema-only --no-owner --no-privileges --no-comments
```

⚠️ Never edit a migration production has already applied — that changes its checksum.
