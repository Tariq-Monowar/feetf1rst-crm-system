/**
 * Format aligned with module/v2/news
 * ----------------------------------
 * - Create/Update: multipart/form-data (not application/json).
 *   - Field "deleveary_note" = file (delivery note document); stored as S3 URL.
 *   - Other fields as form fields (strings).
 * - List: cursor pagination (query: cursor?, limit?) → { success, message, data, hasMore }
 * - Single: { success, message, data }
 * - Create/Update: { success, message, data }
 * - Delete: { success, message, data: { id } }
 * - Error: { success: false, message, error? }
 */

export const INVENTORY_RESPONSE_MESSAGES = {
  list: "Inventories fetched successfully",
  single: "Inventory details fetched successfully",
  create: "Inventory created successfully",
  update: "Inventory updated successfully",
  delete: "Inventory deleted successfully",
} as const;
