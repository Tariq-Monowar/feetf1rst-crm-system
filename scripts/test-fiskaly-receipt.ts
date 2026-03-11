/**
 * Test script: exercises the fiskaly SIGN IT two-step receipt flow.
 *
 * Prerequisites:
 *   1. Run setup-fiskaly-sign-it.ts (or manually set up entities)
 *   2. Set FISKALY_API_KEY, FISKALY_API_SECRET, FISKALY_SYSTEM_ID in .env
 *   3. Run: npx ts-node scripts/test-fiskaly-receipt.ts
 *
 * Tests:
 *   - POST /tokens (auth)
 *   - POST /records INTENTION → TRANSACTION::RECEIPT (two-step flow)
 *
 * TEST env only — nothing is sent to the real Agenzia delle Entrate.
 */
import "dotenv/config";
import { getAuthToken, createSignedReceipt } from "../utils/fiskaly.service";

async function main() {
  const baseUrl = process.env.FISKALY_BASE_URL || "";
  const systemId = process.env.FISKALY_SYSTEM_ID || "";

  console.log("─── fiskaly SIGN IT Receipt Test ───\n");
  console.log(`Base URL:   ${baseUrl}`);
  console.log(`System ID:  ${systemId || "(not set!)"}`);
  console.log();

  if (!systemId) {
    console.error(
      "ERROR: FISKALY_SYSTEM_ID must be set.\n" +
        "Run setup-fiskaly-sign-it.ts first:\n" +
        "  npx ts-node scripts/setup-fiskaly-sign-it.ts",
    );
    process.exit(1);
  }

  // ── 1. Test authentication ──────────────────────────────────────────
  console.log("1. Testing authentication (POST /tokens)...");
  try {
    const token = await getAuthToken();
    console.log(`   Token: ${token.slice(0, 20)}...\n`);
  } catch (err: any) {
    console.error("   AUTH FAILED:", err.message);
    process.exit(1);
  }

  // ── 2. Create a test RECEIPT (two-step: INTENTION → TRANSACTION) ────
  console.log("2. Creating test receipt...");
  console.log("   Step A: POST /records (INTENTION)");
  console.log("   Step B: POST /records (TRANSACTION::RECEIPT)");
  console.log("   Product: Plantari ortopedici su misura");
  console.log("   Amount:  €120.00 (IVA 4%) — 12000 cents");
  console.log("   Payment: CASH\n");

  try {
    const result = await createSignedReceipt({
      orderId: `test-${Date.now()}`,
      orderReference: "TEST-001",
      amount: 12000, // cents
      vatRatePercent: 4,
      productDescription: "Plantari ortopedici su misura",
      quantity: 1,
      unitPrice: 12000, // cents
    });

    console.log("   RECEIPT CREATED!\n");
    console.log("   Record ID:       ", result.recordId);
    console.log("   Intention ID:    ", result.intentionId);
    console.log("   Signature:       ", result.signature.slice(0, 30) + "...");
    console.log("   Signed at:       ", result.signedAt);
    console.log("   Compliance data: ", result.complianceData);
    console.log("   Compliance URL:  ", result.complianceUrl);

    console.log("\n── Full fiskaly response ──");
    console.log(JSON.stringify(result.raw, null, 2));
  } catch (err: any) {
    console.error("   RECEIPT CREATION FAILED:", err.message);
    console.error("\n   Possible causes:");
    console.error("   - FISKALY_SYSTEM_ID is wrong");
    console.error("   - API key/secret mismatch");
    console.error("   - Entities not in COMMISSIONED state");
    process.exit(1);
  }

  console.log("\n─── Test complete ───");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
