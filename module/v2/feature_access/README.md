# Feature Access

## Adding a new feature (3 steps)

1. **Add one row in `feature_access.data.ts`** in the `FEATURES` array:
   ```ts
   { key: "my_new_feature", title: "My New Feature", path: "/dashboard/my-feature" },
   ```
   `key` must be a valid Prisma field name (snake_case, no spaces).

2. **Add the column in Prisma schema** (`prisma/schema.prisma`):
   - In `FeatureAccess`: `my_new_feature Boolean @default(true)`
   - In `employee_feature_access`: `my_new_feature Boolean @default(false)`

3. **Regenerate and sync DB:**
   ```bash
   npx prisma generate && npx prisma db push
   ```
   Restart the app so it uses the new client.

No changes needed in the controller – defaults, API response mapping, and backfill are derived from `FEATURES`.

## Maintaining nested (sub-menu) items

Features that have sub-items (e.g. **Einstellungen** and its sub-pages) are defined in the same data file. Add an optional `nested` array to that feature in `FEATURES`:

```ts
{
  key: "einstellungen",
  title: "Einstellungen",
  path: "/dashboard/settings",
  nested: [
    { title: "Grundeinstellungen", path: "/dashboard/settings-profile" },
    { title: "Backup Einstellungen", path: "/dashboard/settings-profile/backup" },
    // ... add or reorder items here
  ],
},
```

- **To add a sub-item:** add a new `{ title, path }` entry to the feature’s `nested` array in `feature_access.data.ts`.
- **To remove or reorder:** edit the same `nested` array. No Prisma or controller changes are required; the API response is built from this list and the parent feature’s `action` (on/off) is applied to all nested items.
