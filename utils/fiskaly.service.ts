/**
 * Fiskaly SIGN IT service – Italian fiscal compliance (documento commerciale).
 *
 * Two-step record flow (verified against test.api.fiskaly.com):
 *   1. POST /records → INTENTION (reserves a slot on the system journal)
 *   2. POST /records → TRANSACTION::RECEIPT (submits the actual receipt data)
 *
 * For cancellations:
 *   1. POST /records → INTENTION
 *   2. POST /records → TRANSACTION::CANCELLATION
 *
 * All request bodies are wrapped in { content: { ... } }.
 * All amounts are in CENTS (e.g. €120.00 → "12000").
 */
import { v4 as uuidv4 } from "uuid";

const FISKALY_BASE_URL =
  process.env.FISKALY_BASE_URL || "https://test.api.fiskaly.com";
const FISKALY_API_KEY = process.env.FISKALY_API_KEY || "";
const FISKALY_API_SECRET = process.env.FISKALY_API_SECRET || "";
const FISKALY_API_VERSION = process.env.FISKALY_API_VERSION || "2026-02-03";
const FISKALY_SYSTEM_ID = process.env.FISKALY_SYSTEM_ID || "";

// ─── VAT rate codes ─────────────────────────────────────────────────
// Italian VAT rates as defined by the fiskaly system:
//   STANDARD   = 22%
//   REDUCED_1  = 10%
//   REDUCED_2  = 5%
//   REDUCED_3  = 4%  (orthopedic devices, medical aids)
const VAT_RATE_MAP: Record<number, { code: string; percentage: string }> = {
  22: { code: "STANDARD", percentage: "22" },
  10: { code: "REDUCED_1", percentage: "10" },
  5: { code: "REDUCED_2", percentage: "5" },
  4: { code: "REDUCED_3", percentage: "4" },
};

// ─── Token cache ─────────────────────────────────────────────────────
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * POST /tokens — authenticate and cache the JWT.
 */
export async function getAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${FISKALY_BASE_URL}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Version": FISKALY_API_VERSION,
      "X-Idempotency-Key": uuidv4(),
    },
    body: JSON.stringify({
      content: {
        type: "API_KEY",
        key: FISKALY_API_KEY,
        secret: FISKALY_API_SECRET,
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fiskaly auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = data.content.authentication.bearer;
  const expiresAt = new Date(
    data.content.authentication.expires_at,
  ).getTime();
  tokenExpiresAt = expiresAt - 60_000;
  return cachedToken!;
}

// ─── Low-level API call ─────────────────────────────────────────────

async function fiskalyPost(path: string, body: object): Promise<any> {
  const token = await getAuthToken();
  const res = await fetch(`${FISKALY_BASE_URL}${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      "X-Api-Version": FISKALY_API_VERSION,
      "X-Idempotency-Key": uuidv4(),
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errBody = await res.text();
    throw new Error(`Fiskaly POST ${path} failed (${res.status}): ${errBody}`);
  }

  return res.json();
}

// ─── Step 1: INTENTION ──────────────────────────────────────────────

async function createIntention(): Promise<string> {
  const data = await fiskalyPost("/records", {
    content: {
      type: "INTENTION",
      system: { id: FISKALY_SYSTEM_ID },
      operation: { type: "TRANSACTION" },
    },
  });
  return data.content.id;
}

// ─── Step 2: TRANSACTION (RECEIPT) ──────────────────────────────────

export interface FiskalyReceiptResult {
  recordId: string;
  intentionId: string;
  signature: string;
  signedAt: string;
  complianceData: string;
  complianceUrl: string;
  raw: any;
}

/**
 * Create a signed fiscal receipt (documento commerciale).
 *
 * Two-step flow:
 *   1. INTENTION  — reserves a journal slot
 *   2. TRANSACTION::RECEIPT — submits line items + payment
 *
 * All monetary values are in cents. VAT is computed from the total (inclusive).
 */
export async function createSignedReceipt(opts: {
  orderId: string;
  orderReference: string;
  amount: number; // total in cents (e.g. 12000 for €120.00)
  vatRatePercent: number; // 4, 5, 10, or 22
  productDescription: string;
  quantity: number;
  unitPrice: number; // unit price in cents
}): Promise<FiskalyReceiptResult> {
  if (!FISKALY_SYSTEM_ID) {
    throw new Error("FISKALY_SYSTEM_ID must be set");
  }

  const vatInfo = VAT_RATE_MAP[opts.vatRatePercent];
  if (!vatInfo) {
    throw new Error(
      `Unsupported VAT rate: ${opts.vatRatePercent}%. Use 4, 5, 10, or 22.`,
    );
  }

  // Amounts in cents (strings for the API)
  const inclusive = Math.round(opts.amount);
  const exclusive = Math.round(
    inclusive / (1 + opts.vatRatePercent / 100),
  );
  const vatAmount = inclusive - exclusive;

  // Step 1: INTENTION
  const intentionId = await createIntention();

  // Step 2: TRANSACTION::RECEIPT
  const data = await fiskalyPost("/records", {
    content: {
      type: "TRANSACTION",
      record: { id: intentionId },
      operation: {
        type: "RECEIPT",
        document: {
          number: opts.orderReference.replace(/[^0-9A-Z_/\\\-.]/gi, "").slice(0, 20) || "1",
          total_vat: {
            amount: String(vatAmount),
            exclusive: String(exclusive),
            inclusive: String(inclusive),
          },
        },
        entries: [
          {
            type: "SALE",
            data: {
              type: "ITEM",
              text: opts.productDescription,
              unit: {
                quantity: String(opts.quantity),
                price: String(Math.round(opts.unitPrice)),
              },
              value: {
                base: String(inclusive),
              },
              vat: {
                type: "VAT_RATE",
                code: vatInfo.code,
                percentage: vatInfo.percentage,
                amount: String(vatAmount),
                exclusive: String(exclusive),
                inclusive: String(inclusive),
              },
            },
            details: {
              concept: "GOOD",
            },
          },
        ],
        payments: [
          {
            type: "CASH",
            details: {
              amount: String(inclusive),
            },
          },
        ],
      },
    },
  });

  return {
    recordId: data.content.id,
    intentionId,
    signature: data.content.journal?.signature || "",
    signedAt: data.content.journal?.signed_at || "",
    complianceData: data.content.compliance?.data || "",
    complianceUrl: data.content.compliance?.url || "",
    raw: data.content,
  };
}

// ─── CANCELLATION ───────────────────────────────────────────────────

/**
 * Cancel a previously issued receipt (two-step: INTENTION → CANCELLATION).
 */
export async function createCancellation(opts: {
  originalIntentionId: string;
}): Promise<any> {
  if (!FISKALY_SYSTEM_ID) {
    throw new Error("FISKALY_SYSTEM_ID must be set");
  }

  // Step 1: INTENTION
  const intentionId = await createIntention();

  // Step 2: TRANSACTION::CANCELLATION
  const data = await fiskalyPost("/records", {
    content: {
      type: "TRANSACTION",
      record: { id: intentionId },
      operation: {
        type: "CANCELLATION",
        record: { id: opts.originalIntentionId },
      },
    },
  });

  return {
    recordId: data.content.id,
    intentionId,
    raw: data.content,
  };
}
