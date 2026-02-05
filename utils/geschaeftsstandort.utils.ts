/**
 * Geschaeftsstandort is stored as JSON: { display: string }.
 * backupGeschaeftsstandort holds the legacy string as { legacyString: string }.
 * Use this helper to get a single display string for APIs and filters.
 */
export function getGeschaeftsstandortDisplay(
  geschaeftsstandort: unknown,
  backup?: unknown
): string | null {
  if (geschaeftsstandort != null && typeof geschaeftsstandort === "object" && "display" in geschaeftsstandort) {
    const d = (geschaeftsstandort as { display?: unknown }).display;
    if (typeof d === "string") return d || null;
  }
  if (typeof geschaeftsstandort === "string") return geschaeftsstandort || null;
  if (backup != null && typeof backup === "object" && "legacyString" in backup) {
    const s = (backup as { legacyString?: unknown }).legacyString;
    if (typeof s === "string") return s || null;
  }
  return null;
}

/** Build JSON value for geschaeftsstandort from a string (e.g. from API body). */
export function toGeschaeftsstandortJson(value: string | null | undefined): { display: string } | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  return { display: typeof value === "string" ? value : String(value) };
}

/** Build JSON value for backup (legacy string backup). */
export function toBackupGeschaeftsstandortJson(value: string | null | undefined): { legacyString: string } | null {
  if (value == null || (typeof value === "string" && !value.trim())) return null;
  return { legacyString: typeof value === "string" ? value : String(value) };
}
