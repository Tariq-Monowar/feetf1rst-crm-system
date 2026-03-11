/**
 * DEPRECATED — This script was for the German KassenSichV (SIGN DE) API.
 *
 * For Italian fiscal compliance, use the new script instead:
 *
 *   npx ts-node scripts/setup-fiskaly-sign-it.ts
 *
 * The SIGN IT API replaces TSS/Client with Taxpayer/Location/System entities
 * and transmits receipts directly to the Agenzia delle Entrate (AdE).
 */
console.error(
  "This script is deprecated. Use setup-fiskaly-sign-it.ts for Italian compliance.\n" +
    "Run: npx ts-node scripts/setup-fiskaly-sign-it.ts",
);
process.exit(1);
