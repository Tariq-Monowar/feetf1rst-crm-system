/**
 * Format aligned with inventory_management / module/v2/news
 * -------------------------------------------------------
 * - Create/Update: multipart/form-data (not application/json).
 *   - Field "file" = document file; stored as S3 URL.
 *   - Other fields as form fields (strings).
 * - List: cursor pagination (query: type?, payment_date?, cursor?, limit?) → { success, message, data, hasMore }
 * - Single: { success, message, data }
 * - Create/Update: { success, message, data }
 * - Delete: { success, message, data: { id } }
 * - Error: { success: false, message, error? }
 */

export const DOCUMENTS_CLAIMS_RESPONSE_MESSAGES = {
  list: "Documents and claims fetched successfully",
  single: "Document details fetched successfully",
  create: "Document created successfully",
  update: "Document updated successfully",
  delete: "Document deleted successfully",
} as const;
