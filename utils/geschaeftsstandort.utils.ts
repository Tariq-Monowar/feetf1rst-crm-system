/**
 * Geschaeftsstandort is stored as JSON: { title: string, description?: string }.
 * Use this helper to get a display string (title) for APIs and filters.
 */
export type GeschaeftsstandortJson = { title: string; description?: string };

export function getGeschaeftsstandortDisplay(geschaeftsstandort: unknown): string | null {
  if (geschaeftsstandort != null && typeof geschaeftsstandort === "object") {
    const o = geschaeftsstandort as Record<string, unknown>;
    if (typeof o.title === "string") return o.title || null;
    // Legacy: was { display: string }
    if (typeof o.display === "string") return o.display || null;
  }
  if (typeof geschaeftsstandort === "string") return geschaeftsstandort || null;
  return null;
}

/** Build JSON value for geschaeftsstandort. Accepts object { title, description } or a single string (used as title, description empty). */
export function toGeschaeftsstandortJson(
  value: string | { title: string; description?: string } | null | undefined
): GeschaeftsstandortJson | null {
  if (value == null) return null;
  if (typeof value === "object" && "title" in value) {
    const title = value.title;
    if (title == null || (typeof title === "string" && !title.trim())) return null;
    return {
      title: typeof title === "string" ? title : String(title),
      description: value.description != null ? String(value.description) : "",
    };
  }
  if (typeof value === "string" && !value.trim()) return null;
  return { title: typeof value === "string" ? value : String(value), description: "" };
}
