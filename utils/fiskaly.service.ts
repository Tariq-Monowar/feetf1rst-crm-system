import { v4 as uuidv4 } from "uuid";

const FISKALY_BASE_URL =
  process.env.FISKALY_BASE_URL ||
  "https://kassensichv-middleware.fiskaly.com/api/v2";
const FISKALY_API_KEY = process.env.FISKALY_API_KEY || "";
const FISKALY_API_SECRET = process.env.FISKALY_API_SECRET || "";
const FISKALY_TSS_ID = process.env.FISKALY_TSS_ID || "";
const FISKALY_CLIENT_ID = process.env.FISKALY_CLIENT_ID || "";

// Cached auth token
let cachedToken: string | null = null;
let tokenExpiresAt = 0;

/**
 * Authenticate with Fiskaly and get a JWT token.
 * Caches the token in memory until it expires.
 */
export async function getAuthToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt) {
    return cachedToken;
  }

  const res = await fetch(`${FISKALY_BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      api_key: FISKALY_API_KEY,
      api_secret: FISKALY_API_SECRET,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fiskaly auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  // Expire 60s before actual expiry to avoid edge cases
  tokenExpiresAt = Date.now() + (data.access_token_expires_in - 60) * 1000;
  return cachedToken!;
}

/**
 * Start a Fiskaly transaction (set state to ACTIVE).
 */
export async function startTransaction(
  tssId: string,
  txId: string,
  clientId: string,
) {
  const token = await getAuthToken();

  const res = await fetch(
    `${FISKALY_BASE_URL}/tss/${tssId}/tx/${txId}?tx_revision=1`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: "ACTIVE",
        client_id: clientId,
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Fiskaly startTransaction failed (${res.status}): ${body}`);
  }

  return res.json();
}

/**
 * Finish a Fiskaly transaction (set state to FINISHED with receipt schema).
 */
export async function finishTransaction(
  tssId: string,
  txId: string,
  clientId: string,
  schema: {
    amounts_per_vat_rate: Array<{
      vat_rate: "NORMAL" | "REDUCED_1" | "NULL";
      amount: string;
    }>;
    amounts_per_payment_type: Array<{
      payment_type: "CASH" | "NON_CASH";
      amount: string;
      currency_code?: string;
    }>;
  },
) {
  const token = await getAuthToken();

  const res = await fetch(
    `${FISKALY_BASE_URL}/tss/${tssId}/tx/${txId}?tx_revision=2`,
    {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        state: "FINISHED",
        client_id: clientId,
        schema: {
          standard_v1: {
            receipt: {
              receipt_type: "RECEIPT",
              amounts_per_vat_rate: schema.amounts_per_vat_rate,
              amounts_per_payment_type: schema.amounts_per_payment_type,
            },
          },
        },
      }),
    },
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(
      `Fiskaly finishTransaction failed (${res.status}): ${body}`,
    );
  }

  return res.json();
}

/**
 * Map a numeric VAT percentage to Fiskaly's vat_rate enum.
 */
function mapVatRate(
  vatPercent: number,
): "NORMAL" | "REDUCED_1" | "NULL" {
  if (vatPercent >= 19) return "NORMAL";
  if (vatPercent >= 7) return "REDUCED_1";
  return "NULL";
}

/**
 * High-level: create a signed receipt via Fiskaly.
 * Generates a UUID for the transaction, starts it, finishes it with the
 * receipt schema, and returns the full Fiskaly response.
 */
export async function createSignedReceipt(
  amount: number,
  vatRatePercent: number,
  paymentType: "CASH" | "NON_CASH",
) {
  const tssId = FISKALY_TSS_ID;
  const clientId = FISKALY_CLIENT_ID;
  const txId = uuidv4();

  if (!tssId || !clientId) {
    throw new Error(
      "FISKALY_TSS_ID and FISKALY_CLIENT_ID must be set in environment",
    );
  }

  // Step 1: Start transaction
  await startTransaction(tssId, txId, clientId);

  // Step 2: Finish transaction with receipt data
  const fiskalyVatRate = mapVatRate(vatRatePercent);
  const amountStr = amount.toFixed(5);

  const result = await finishTransaction(tssId, txId, clientId, {
    amounts_per_vat_rate: [
      {
        vat_rate: fiskalyVatRate,
        amount: amountStr,
      },
    ],
    amounts_per_payment_type: [
      {
        payment_type: paymentType,
        amount: amountStr,
        currency_code: "EUR",
      },
    ],
  });

  return {
    txId,
    tssId,
    clientId,
    fiskalyResponse: result,
  };
}
