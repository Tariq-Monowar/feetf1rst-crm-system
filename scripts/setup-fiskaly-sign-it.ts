/**
 * Setup script for fiskaly SIGN IT (Italian fiscal compliance).
 *
 * Full entity hierarchy (verified against test.api.fiskaly.com):
 *   1. Authenticate with GROUP API Key → get GROUP token
 *   2. Create UNIT organization under GROUP
 *   3. Create Subject API Key for UNIT (uses X-Scope-Identifier header)
 *   4. Authenticate with UNIT Subject credentials
 *   5. Create Taxpayer with IT fiscalization (Fisconline credentials)
 *   6. Commission Taxpayer → COMMISSIONED
 *   7. Create Location (BRANCH) → Commission → COMMISSIONED
 *   8. Create System (FISCAL_DEVICE) → Commission → COMMISSIONED
 *
 * Prerequisites:
 *   Set these in .env:
 *     FISKALY_GROUP_API_KEY     — GROUP-level API key (from fiskaly dashboard)
 *     FISKALY_GROUP_API_SECRET  — GROUP-level API secret
 *     FISKALY_BASE_URL          — https://test.api.fiskaly.com (test) or https://live.api.fiskaly.com
 *
 * Usage:
 *   npx ts-node scripts/setup-fiskaly-sign-it.ts
 *
 * After running, copy the printed values into your .env.
 */
import "dotenv/config";
import { v4 as uuidv4 } from "uuid";

const BASE_URL =
  process.env.FISKALY_BASE_URL || "https://test.api.fiskaly.com";
const GROUP_API_KEY =
  process.env.FISKALY_GROUP_API_KEY || process.env.FISKALY_API_KEY || "";
const GROUP_API_SECRET =
  process.env.FISKALY_GROUP_API_SECRET || process.env.FISKALY_API_SECRET || "";
const API_VERSION = process.env.FISKALY_API_VERSION || "2026-02-03";

let TOKEN = "";

async function authenticate(key: string, secret: string) {
  const res = await fetch(`${BASE_URL}/tokens`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Version": API_VERSION,
      "X-Idempotency-Key": uuidv4(),
    },
    body: JSON.stringify({
      content: { type: "API_KEY", key, secret },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Auth failed (${res.status}): ${body}`);
  }

  const data = await res.json();
  TOKEN = data.content.authentication.bearer;
  return {
    token: TOKEN,
    orgId: data.content.organization?.id || "",
    orgType: data.content.organization?.type || "",
  };
}

async function api(method: string, path: string, body?: object, extraHeaders?: Record<string, string>) {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${TOKEN}`,
    "Content-Type": "application/json",
    "X-Api-Version": API_VERSION,
    "X-Idempotency-Key": uuidv4(),
    ...extraHeaders,
  };

  const opts: RequestInit = { method, headers };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${BASE_URL}${path}`, opts);
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${method} ${path} failed (${res.status}): ${text}`);
  }
  return text ? JSON.parse(text) : null;
}

async function main() {
  if (!GROUP_API_KEY || !GROUP_API_SECRET) {
    console.error(
      "ERROR: Set FISKALY_GROUP_API_KEY and FISKALY_GROUP_API_SECRET in .env first.\n" +
        "(Or FISKALY_API_KEY / FISKALY_API_SECRET if you haven't renamed them yet.)",
    );
    process.exit(1);
  }

  // ── 1. Authenticate with GROUP credentials ──────────────────────────
  console.log("1. Authenticating with GROUP credentials...");
  const groupAuth = await authenticate(GROUP_API_KEY, GROUP_API_SECRET);
  console.log(`   GROUP org: ${groupAuth.orgId}\n`);

  // ── 2. Create or reuse UNIT organization ────────────────────────────
  console.log("2. Checking for existing UNIT organization...");
  const orgs = await api("GET", "/organizations");
  let unitOrg = orgs?.results?.find(
    (o: any) => o.content?.type === "UNIT" && o.content?.state === "ENABLED",
  );

  let unitOrgId: string;
  if (unitOrg) {
    unitOrgId = unitOrg.content.id;
    console.log(`   Existing UNIT found: ${unitOrgId}\n`);
  } else {
    console.log("   Creating UNIT organization...");
    const newUnit = await api("POST", "/organizations", {
      content: { type: "UNIT", name: "feetf1rst POS Unit" },
    });
    unitOrgId = newUnit.content.id;
    console.log(`   UNIT created: ${unitOrgId}\n`);
  }

  // ── 3. Create Subject API Key for UNIT ──────────────────────────────
  console.log("3. Creating Subject API Key (X-Scope-Identifier → UNIT)...");
  let unitApiKey: string;
  let unitApiSecret: string;

  try {
    const subject = await api(
      "POST",
      "/subjects",
      { content: { type: "API_KEY", name: `feetf1rst-${Date.now()}` } },
      { "X-Scope-Identifier": unitOrgId },
    );
    unitApiKey = subject.content.credentials.key;
    unitApiSecret = subject.content.credentials.secret;
    console.log(`   Subject key: ${unitApiKey}`);
    console.log(`   Subject secret: ${unitApiSecret}\n`);
  } catch (err: any) {
    console.error("   Subject creation failed:", err.message);
    console.error(
      "   If a subject already exists, use the existing UNIT credentials in .env.",
    );
    process.exit(1);
  }

  // ── 4. Authenticate with UNIT Subject credentials ───────────────────
  console.log("4. Authenticating with UNIT Subject credentials...");
  const unitAuth = await authenticate(unitApiKey, unitApiSecret);
  console.log(`   UNIT org: ${unitAuth.orgId}\n`);

  // ── 5. Create Taxpayer with IT fiscalization ────────────────────────
  console.log("5. Creating taxpayer with IT fiscalization...");
  console.log("   NOTE: Using test Fisconline credentials. Replace with real ones for LIVE.\n");

  let taxpayerId: string;
  const existingTaxpayers = await api("GET", "/taxpayers");
  const existingTp = existingTaxpayers?.results?.[0]?.content;

  if (existingTp?.id && existingTp?.state === "COMMISSIONED") {
    taxpayerId = existingTp.id;
    console.log(`   Existing commissioned taxpayer: ${taxpayerId}\n`);
  } else {
    const tp = await api("POST", "/taxpayers", {
      content: {
        type: "COMPANY",
        name: { legal: "feetf1rst S.r.l.", trade: "feetf1rst" },
        address: {
          line: { type: "STREET_NUMBER", street: "Via Roma", number: "1" },
          code: "00100",
          city: "Roma",
          country: "IT",
        },
        fiscalization: {
          type: "IT",
          tax_id_number: "12345678901",
          vat_id_number: "12345678901",
          credentials: {
            type: "FISCONLINE",
            tax_id_number: "RSSMRA85M01H501Z",
            password: "TestPassword1!",
            pin: "12345678",
          },
        },
      },
    });
    taxpayerId = tp.content.id;
    console.log(`   Taxpayer created: ${taxpayerId}`);

    // Commission
    await api("PATCH", `/taxpayers/${taxpayerId}`, {
      content: { state: "COMMISSIONED" },
    });
    console.log("   Taxpayer commissioned.\n");
  }

  // ── 6. Create Location (BRANCH) ────────────────────────────────────
  console.log("6. Creating location...");
  let locationId: string;
  const existingLocations = await api("GET", "/locations");
  const existingLoc = existingLocations?.results?.find(
    (l: any) => l.content?.type === "BRANCH" && l.content?.state === "COMMISSIONED",
  );

  if (existingLoc) {
    locationId = existingLoc.content.id;
    console.log(`   Existing commissioned location: ${locationId}\n`);
  } else {
    const loc = await api("POST", "/locations", {
      content: {
        type: "BRANCH",
        taxpayer: { id: taxpayerId },
        name: "feetf1rst POS — sede principale",
        address: {
          line: { type: "STREET_NUMBER", street: "Via Roma", number: "1" },
          code: "00100",
          city: "Roma",
          country: "IT",
        },
      },
    });
    locationId = loc.content.id;
    console.log(`   Location created: ${locationId}`);

    await api("PATCH", `/locations/${locationId}`, {
      content: { state: "COMMISSIONED" },
    });
    console.log("   Location commissioned.\n");
  }

  // ── 7. Create System (FISCAL_DEVICE) ───────────────────────────────
  console.log("7. Creating system (FISCAL_DEVICE)...");
  let systemId: string;
  const existingSystems = await api("GET", "/systems");
  const existingSys = existingSystems?.results?.find(
    (s: any) => s.content?.state === "COMMISSIONED",
  );

  if (existingSys) {
    systemId = existingSys.content.id;
    console.log(`   Existing commissioned system: ${systemId}\n`);
  } else {
    const sys = await api("POST", "/systems", {
      content: {
        type: "FISCAL_DEVICE",
        location: { id: locationId },
        producer: {
          type: "MPN",
          number: "FEETF1RST-POS-001",
          details: { name: "feetf1rst POS System" },
        },
        software: { name: "feetf1rst CRM", version: "1.0.0" },
      },
    });
    systemId = sys.content.id;
    console.log(`   System created: ${systemId}`);

    await api("PATCH", `/systems/${systemId}`, {
      content: { state: "COMMISSIONED" },
    });
    console.log("   System commissioned.\n");
  }

  // ── Done ────────────────────────────────────────────────────────────
  console.log("=".repeat(60));
  console.log("Add / update these in your .env file:");
  console.log("=".repeat(60));
  console.log(`FISKALY_API_KEY=${unitApiKey}`);
  console.log(`FISKALY_API_SECRET=${unitApiSecret}`);
  console.log(`FISKALY_BASE_URL=${BASE_URL}`);
  console.log(`FISKALY_API_VERSION=${API_VERSION}`);
  console.log(`FISKALY_ORGANIZATION_ID=${unitOrgId}`);
  console.log(`FISKALY_TAXPAYER_ID=${taxpayerId}`);
  console.log(`FISKALY_LOCATION_ID=${locationId}`);
  console.log(`FISKALY_SYSTEM_ID=${systemId}`);
  console.log("=".repeat(60));
  console.log("\nSetup complete. All entities are COMMISSIONED and ready.");
}

main().catch((err) => {
  console.error("Unexpected error:", err);
  process.exit(1);
});
