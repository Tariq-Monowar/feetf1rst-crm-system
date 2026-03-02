/**
 * One-time script to set up Fiskaly TSS and Client.
 *
 * Usage:
 *   1. Set FISKALY_API_KEY and FISKALY_API_SECRET in your .env
 *   2. Run: npx ts-node scripts/setup-fiskaly-tss.ts
 *   3. Copy the printed TSS_ID and CLIENT_ID into your .env
 */
import "dotenv/config";

const BASE_URL =
  process.env.FISKALY_BASE_URL ||
  "https://kassensichv-middleware.fiskaly.com/api/v2";
const API_KEY = process.env.FISKALY_API_KEY;
const API_SECRET = process.env.FISKALY_API_SECRET;

async function main() {
  if (!API_KEY || !API_SECRET) {
    console.error(
      "ERROR: Set FISKALY_API_KEY and FISKALY_API_SECRET in your .env file first.",
    );
    process.exit(1);
  }

  // Step 1: Authenticate with API credentials
  console.log("Authenticating with Fiskaly...");
  const authRes = await fetch(`${BASE_URL}/auth`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ api_key: API_KEY, api_secret: API_SECRET }),
  });

  if (!authRes.ok) {
    console.error("Auth failed:", await authRes.text());
    process.exit(1);
  }

  const { access_token: token } = await authRes.json();
  console.log("Authenticated successfully.\n");

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  // Step 2: Create TSS
  const tssId = crypto.randomUUID();
  console.log(`Creating TSS (id: ${tssId})...`);
  const createTssRes = await fetch(`${BASE_URL}/tss/${tssId}`, {
    method: "PUT",
    headers,
    body: JSON.stringify({ description: "feetf1rst POS TSS" }),
  });

  if (!createTssRes.ok) {
    console.error("Create TSS failed:", await createTssRes.text());
    process.exit(1);
  }

  const tss = await createTssRes.json();
  console.log("TSS created:", tss.state);
  console.log("Admin PUK:", tss.admin_puk);

  // Step 3: Deploy TSS (CREATED → UNINITIALIZED)
  if (tss.state === "CREATED") {
    console.log("\nDeploying TSS (CREATED → UNINITIALIZED)...");
    const deployRes = await fetch(`${BASE_URL}/tss/${tssId}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({ state: "UNINITIALIZED" }),
    });

    if (!deployRes.ok) {
      console.error("Deploy TSS failed:", await deployRes.text());
      process.exit(1);
    }

    const deployData = await deployRes.json();
    console.log("TSS deployed:", deployData.state);
  }

  // Step 4a: Change admin PIN using the PUK (PATCH /tss/{tss_id}/admin)
  console.log("\nSetting admin PIN...");
  const adminPin = "123456"; // Must be at least 6 characters
  const pinRes = await fetch(
    `${BASE_URL}/tss/${tssId}/admin`,
    {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        admin_puk: tss.admin_puk,
        new_admin_pin: adminPin,
      }),
    },
  );

  if (!pinRes.ok) {
    console.error("Set admin PIN failed:", await pinRes.text());
    process.exit(1);
  }

  console.log("Admin PIN set successfully.");

  // Step 4b: Authenticate as TSS admin with the PIN
  console.log("Authenticating TSS admin...");
  const adminAuthRes = await fetch(
    `${BASE_URL}/tss/${tssId}/admin/auth`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        admin_pin: adminPin,
      }),
    },
  );

  if (!adminAuthRes.ok) {
    console.error("Admin auth failed:", await adminAuthRes.text());
    process.exit(1);
  }

  console.log("TSS admin authenticated.");

  // Step 5: Initialize TSS (UNINITIALIZED → INITIALIZED)
  console.log("\nInitializing TSS (UNINITIALIZED → INITIALIZED)...");
  const initRes = await fetch(`${BASE_URL}/tss/${tssId}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({ state: "INITIALIZED" }),
  });

  if (!initRes.ok) {
    console.error("Initialize TSS failed:", await initRes.text());
    process.exit(1);
  }

  const initData = await initRes.json();
  console.log("TSS initialized:", initData.state);

  // Step 6: Create Client
  const clientId = crypto.randomUUID();
  console.log(`\nCreating Client (id: ${clientId})...`);
  const createClientRes = await fetch(
    `${BASE_URL}/tss/${tssId}/client/${clientId}`,
    {
      method: "PUT",
      headers,
      body: JSON.stringify({ serial_number: `feetf1rst-pos-${clientId.slice(0, 8)}` }),
    },
  );

  if (!createClientRes.ok) {
    console.error("Create Client failed:", await createClientRes.text());
    process.exit(1);
  }

  console.log("Client created successfully.\n");

  // Print results
  console.log("=".repeat(60));
  console.log("Add these to your .env file:");
  console.log("=".repeat(60));
  console.log(`FISKALY_TSS_ID=${tssId}`);
  console.log(`FISKALY_CLIENT_ID=${clientId}`);
  console.log("=".repeat(60));
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
