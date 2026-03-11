# Fiskaly SIGN IT Integration Guide

> Italian Fiscal Compliance (Documento Commerciale) for feetf1rst CRM

This guide covers the Fiskaly SIGN IT integration used to issue legally compliant fiscal receipts (documento commerciale) for Italian orthopedic product sales.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Environment Setup](#environment-setup)
4. [Entity Hierarchy & Initial Setup](#entity-hierarchy--initial-setup)
5. [How Receipt Creation Works](#how-receipt-creation-works)
6. [API Endpoints](#api-endpoints)
7. [Database Schema](#database-schema)
8. [VAT Rates](#vat-rates)
9. [Cancellation (Stornierung)](#cancellation-stornierung)
10. [Email Receipts](#email-receipts)
11. [Key Files](#key-files)
12. [Common Pitfalls](#common-pitfalls)
13. [Going Live](#going-live)

---

## Overview

Fiskaly SIGN IT is a cloud-based fiscal signing service for Italy. Every sale that is paid privately ("Privat_Bezahlt") must generate a signed fiscal receipt (documento commerciale) per Italian law (art. 2 D.Lgs. 127/2015).

**What it does:**
- Signs receipts through Italy's Agenzia delle Entrate via Fisconline credentials
- Returns a fiscal signature, compliance data, and a compliance URL for each receipt
- Supports cancellations (Stornierung) that reference the original receipt

**Two order types are supported:**
- `insole` — Custom orthopedic insoles (Plantari ortopedici su misura)
- `shoes` — Custom orthopedic shoes (Scarpe ortopediche su misura)

---

## Architecture

```
Frontend (React)
    |
    v
POST /v2/receipts/create/:orderId?type=insole|shoes
    |
    v
receipts.controllers.ts
    |  - Validates order is paid ("Privat_Bezahlt")
    |  - Checks idempotency (orderId + orderType unique constraint)
    |  - Gathers order data (price, VAT, customer, partner, employee)
    |
    v
fiskaly.service.ts
    |  - Authenticates with Fiskaly (JWT token, cached)
    |  - Step 1: POST /records → INTENTION
    |  - Step 2: POST /records → TRANSACTION::RECEIPT
    |
    v
Fiskaly SIGN IT API (test.api.fiskaly.com / live.api.fiskaly.com)
    |
    v
pos_receipt table (PostgreSQL via Prisma)
```

---

## Environment Setup

Add these variables to your `.env` file:

```env
# Fiskaly SIGN IT (Italian Fiscal Compliance)
FISKALY_API_KEY=<unit-subject-api-key>
FISKALY_API_SECRET=<unit-subject-api-secret>
FISKALY_BASE_URL=https://test.api.fiskaly.com   # or https://live.api.fiskaly.com
FISKALY_API_VERSION=2026-02-03
FISKALY_ORGANIZATION_ID=<unit-org-id>
FISKALY_TAXPAYER_ID=<taxpayer-id>
FISKALY_LOCATION_ID=<location-id>
FISKALY_SYSTEM_ID=<system-id>
```

> **Note:** The `FISKALY_API_KEY` and `FISKALY_API_SECRET` are the **Subject API Key** credentials scoped to the UNIT organization — NOT the Group-level dashboard credentials.

---

## Entity Hierarchy & Initial Setup

Fiskaly uses a hierarchy of entities that must be created and commissioned before you can issue receipts:

```
GROUP Organization (created in Fiskaly dashboard)
  └── UNIT Organization (created via API)
        └── Subject API Key (runtime credentials, scoped to UNIT)
              └── Taxpayer (company entity with Fisconline credentials)
                    └── Location (branch / store)
                          └── System (fiscal device)
```

### First-Time Setup

Run the setup script to create all entities:

```bash
npx ts-node scripts/setup-fiskaly-sign-it.ts
```

This script:
1. Authenticates with GROUP-level credentials (from Fiskaly dashboard)
2. Creates a UNIT organization
3. Creates a Subject API Key scoped to the UNIT
4. Creates a Taxpayer with IT fiscalization (Fisconline credentials)
5. Creates a Location (branch)
6. Creates a System (fiscal device)
7. Commissions all entities (Taxpayer, Location, System)

**Important:** All entities must be in `COMMISSIONED` state before they can process records. The setup script handles this automatically.

### Fisconline Credentials

The Taxpayer entity requires Fisconline credentials for communication with Agenzia delle Entrate:
- `tax_id_number` — Personal Codice Fiscale of the Fisconline user (16 chars, e.g. `RSSMRA85M01H501Z`)
- `password` — Fisconline password
- `pin` — Fisconline PIN

These are separate from the company's Partita IVA / Codice Fiscale.

---

## How Receipt Creation Works

Fiskaly uses a **two-step record creation flow**:

### Step 1: INTENTION

Reserves a slot in the fiscal journal.

```
POST /records
Body: {
  content: {
    type: "INTENTION",
    system: { id: "<FISKALY_SYSTEM_ID>" },
    operation: { type: "TRANSACTION" }
  }
}
```

Returns an `intentionId` used in Step 2.

### Step 2: TRANSACTION::RECEIPT

Submits the actual receipt data referencing the intention.

```
POST /records
Body: {
  content: {
    type: "TRANSACTION",
    record: { id: "<intentionId>" },
    operation: {
      type: "RECEIPT",
      document: {
        number: "ORDER-001",
        total_vat: {
          amount: "462",        // VAT in cents as string
          exclusive: "11538",   // subtotal excl. VAT in cents
          inclusive: "12000"    // total incl. VAT in cents
        }
      },
      entries: [{
        type: "SALE",
        data: {
          type: "ITEM",
          text: "Product description",
          unit: { quantity: "1", price: "12000" },
          value: { base: "12000" },
          vat: {
            type: "VAT_RATE",
            code: "REDUCED_3",
            percentage: "4",
            amount: "462",
            exclusive: "11538",
            inclusive: "12000"
          }
        },
        details: { concept: "GOOD" }
      }],
      payments: [{
        type: "CASH",
        details: { amount: "12000" }
      }]
    }
  }
}
```

Returns: `recordId`, `signature`, `complianceData`, `complianceUrl`.

### Critical Rules

| Rule | Detail |
|------|--------|
| Two-step flow | Always INTENTION first, then TRANSACTION. Never skip. |
| All amounts in cents | `€120.00` = `"12000"`. Always strings. |
| Body wrapping | Every request body is wrapped in `{ content: { ... } }` |
| Idempotency | Every request must include `X-Idempotency-Key` header (UUID) |
| API Version | Must include `X-Api-Version: 2026-02-03` header |

---

## API Endpoints

All endpoints are mounted at `/v2/receipts/` and require authentication with `PARTNER` or `EMPLOYEE` role.

### Create Receipt
```
POST /v2/receipts/create/:orderId?type=insole|shoes
```
- Creates a fiscal receipt for a paid order
- Idempotent: returns existing receipt if already created for this orderId + orderType
- Order must have payment status `"Privat_Bezahlt"`
- On fiskaly failure: receipt is saved without fiscal data (allows retry)

### Get Receipt by Order
```
GET /v2/receipts/by-order/:orderId?type=insole|shoes
```
- Returns the receipt for a specific order

### Get Receipt by ID
```
GET /v2/receipts/get/:receiptId
```
- Returns a specific receipt by its database ID

### List Receipts
```
GET /v2/receipts/list?page=1&limit=50
```
- Paginated list of receipts for the authenticated partner
- Max limit: 100, default: 50
- Ordered by `createdAt DESC`

### Email Receipt
```
POST /v2/receipts/email/:receiptId
Body: { "email": "customer@example.com" }
```
- Sends a formatted HTML email with receipt details
- Subject: "Il tuo documento commerciale — feetf1rst"
- Includes: order number, product, subtotal, VAT breakdown, total, fiscal record ID
- Italian legal footer per art. 2 D.Lgs. 127/2015

### Cancel Receipt (Stornierung)
```
POST /v2/receipts/cancel/:receiptId
```
- Cancels a fiscalized receipt via Fiskaly
- Only works on receipts that have a `fiskalyRecordId`
- See [Cancellation](#cancellation-stornierung) section for details

---

## Database Schema

The `pos_receipt` table (Prisma model: `pos_receipt`):

```
id                    String    PK, UUID
orderId               String    Order reference
orderType             String    "insole" | "shoes"
paymentMethod         String    "CASH"
amount                Float     Total amount (incl. VAT)
vatRate               Float     VAT percentage
vatAmount             Float     VAT amount
subtotal              Float     Amount excl. VAT

-- Fiskaly SIGN IT fields --
fiskalyRecordId       String?   Record ID from TRANSACTION response
fiskalyIntentionId    String?   Intention ID (used for cancellation reference)
fiskalySignature      String?   Fiscal signature
fiscalizedAt          DateTime? When fiscalized
fiskalyMetadata       Json?     Full fiskaly API response

-- Cancellation fields --
storniert             Boolean   Default false
storniertAt           DateTime? When cancelled
storniertRecordId     String?   Cancellation TRANSACTION record ID
storniertIntentionId  String?   Cancellation INTENTION ID

-- Relations --
partnerId             String?   FK → User
employeeId            String?   FK → Employees

-- Metadata --
receiptData           Json?     Snapshot (company, transaction, product, financial info)
createdAt             DateTime
updatedAt             DateTime

@@unique([orderId, orderType])   -- One receipt per order+type
@@index([partnerId])
@@index([orderId])
```

### receiptData JSON Structure

```json
{
  "company": {
    "companyName": "Partner Company Name",
    "address": "Street, City",
    "phone": "+39 ...",
    "vatNumber": "IT12345678901"
  },
  "transaction": {
    "order": "#12345",
    "customer": "Mario Rossi"
  },
  "product": {
    "description": "Plantari ortopedici su misura",
    "quantity": 1,
    "unitPrice": 120.00,
    "itemTotal": 120.00
  },
  "financial": {
    "subtotal": 115.38,
    "vatRate": 4,
    "vatAmount": 4.62,
    "total": 120.00
  },
  "servedBy": "Employee Name"
}
```

---

## VAT Rates

Italian VAT rates used by Fiskaly SIGN IT:

| Fiskaly Code | Rate | Typical Use |
|-------------|------|-------------|
| `STANDARD` | 22% | General goods and services |
| `REDUCED_1` | 10% | Certain food, hospitality |
| `REDUCED_2` | 5% | Some essential goods |
| `REDUCED_3` | 4% | Orthopedic devices, medical aids |

**feetf1rst typically uses `REDUCED_3` (4%)** for orthopedic insoles and shoes, though the VAT rate is configurable per order via the `supplyStatus.vatRate` field (insoles) or `vat_rate` field (shoes).

The service maps percentage → code:
```
22  → STANDARD
10  → REDUCED_1
5   → REDUCED_2
4   → REDUCED_3
```

### Tax Calculation

All prices in feetf1rst are **inclusive of VAT**. The service calculates:

```
exclusive = total / (1 + vatRate/100)    // subtotal excl. VAT
vatAmount = total - exclusive            // VAT portion
```

Example: €120.00 at 4% VAT → exclusive = €115.38, vatAmount = €4.62

---

## Cancellation (Stornierung)

To cancel a fiscalized receipt:

1. A new **INTENTION** is created (same as receipt flow)
2. A **TRANSACTION::CANCELLATION** is created, referencing the original receipt's `fiskalyRecordId`

```
POST /records
Body: {
  content: {
    type: "TRANSACTION",
    record: { id: "<new intentionId>" },
    operation: {
      type: "CANCELLATION",
      record: { id: "<original fiskalyRecordId>" }
    }
  }
}
```

After cancellation, the receipt is updated:
- `storniert` = `true`
- `storniertAt` = current timestamp
- `storniertRecordId` = cancellation transaction record ID
- `storniertIntentionId` = cancellation intention ID

---

## Email Receipts

The email receipt feature sends a formatted HTML email in Italian with:

- **Subject:** "Il tuo documento commerciale — feetf1rst"
- **Branding:** feetf1rst green (#61A175)
- **Content:**
  - Order number
  - Product description
  - Subtotal (Imponibile)
  - VAT rate and amount (IVA)
  - Total (Totale)
  - Payment method: Contanti (Cash)
  - Fiskaly Record ID (if fiscalized)
- **Footer:** "Documento commerciale di vendita o prestazione — art. 2 D.Lgs. 127/2015"

---

## Key Files

| File | Purpose |
|------|---------|
| `utils/fiskaly.service.ts` | Core service — auth, receipt creation, cancellation |
| `module/v2/receipts/receipts.controllers.ts` | Receipt endpoint handlers (6 endpoints) |
| `module/v2/receipts/receipts.routes.ts` | Route definitions with auth middleware |
| `scripts/setup-fiskaly-sign-it.ts` | One-time setup script (entity creation + commissioning) |
| `scripts/test-fiskaly-receipt.ts` | Test script for verifying the two-step flow |
| `prisma/schema.prisma` | `pos_receipt` model definition |
| `scripts/setup-fiskaly-tss.ts` | **DEPRECATED** — Old German KassenSichV (SIGN DE) setup |

---

## Common Pitfalls

### 1. "Unknown argument" Prisma errors
After running `prisma db push --skip-generate`, you **must** stop the backend, run `npx prisma generate`, and restart. The `--skip-generate` flag leaves the Prisma client out of sync.

### 2. Amounts must be strings in cents
Fiskaly expects all monetary values as **strings in cents**. `€120.00` = `"12000"`, not `120` or `"120.00"`.

### 3. Body wrapping
Every Fiskaly API request body must be wrapped in `{ content: { ... } }`. Forgetting the wrapper will result in validation errors.

### 4. Two-step flow is mandatory
You cannot create a TRANSACTION without first creating an INTENTION. Skipping the INTENTION step will fail.

### 5. Entity commissioning
All entities (Taxpayer, Location, System) must be in `COMMISSIONED` state before records can be created. Use `PATCH` to set `state: "COMMISSIONED"`.

### 6. Receipt idempotency
The system prevents duplicate receipts via the `@@unique([orderId, orderType])` constraint. Creating a receipt for an already-receipted order returns the existing receipt (HTTP 200).

### 7. Fiskaly failure handling
If the Fiskaly API call fails, the receipt is still saved to the database **without** fiscal fields. This allows retrying later. The receipt will not have `fiskalyRecordId`, `fiskalySignature`, etc.

### 8. Order number format
Fiskaly requires document numbers to match `^[0-9A-Z_/\\-\\.]{1,20}$`. The system sends `#orderNumber` — ensure order numbers conform to this pattern.

---

## Going Live

When ready to switch from test to production:

1. **Change the base URL** in `.env`:
   ```
   FISKALY_BASE_URL=https://live.api.fiskaly.com
   ```

2. **Run the setup script again** against the live environment to create new entities (Taxpayer, Location, System) with real Fisconline credentials.

3. **Update all entity IDs** in `.env` with the new live IDs:
   - `FISKALY_API_KEY` / `FISKALY_API_SECRET` (new Subject API Key for live UNIT)
   - `FISKALY_ORGANIZATION_ID`
   - `FISKALY_TAXPAYER_ID`
   - `FISKALY_LOCATION_ID`
   - `FISKALY_SYSTEM_ID`

4. **Verify** with a test receipt using `scripts/test-fiskaly-receipt.ts` (update its env to point to live).

> **Warning:** Live receipts are legally binding fiscal documents. Ensure all Fisconline credentials and company data are correct before going live.

---

## Testing

Run the test script to verify the integration is working:

```bash
npx ts-node scripts/test-fiskaly-receipt.ts
```

This will:
1. Authenticate with Fiskaly
2. Create an INTENTION
3. Create a TRANSACTION::RECEIPT for a sample orthopedic insole (€120.00, 4% VAT)
4. Print the record ID, signature, and compliance data

If successful, your Fiskaly setup is correctly configured.

---

## Quick Reference

```
# Create receipt for an insole order
POST /v2/receipts/create/ORDER_ID?type=insole

# Create receipt for a shoe order
POST /v2/receipts/create/ORDER_ID?type=shoes

# Get receipt for an order
GET /v2/receipts/by-order/ORDER_ID?type=insole

# Email receipt to customer
POST /v2/receipts/email/RECEIPT_ID
Body: { "email": "customer@example.com" }

# Cancel a receipt
POST /v2/receipts/cancel/RECEIPT_ID

# List all receipts (paginated)
GET /v2/receipts/list?page=1&limit=50
```
