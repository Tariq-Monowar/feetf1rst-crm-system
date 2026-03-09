# Insurance List – Table Header ↔ API Response Mapping

Reference: **GET** `/get-insurance-list` (see `insurance.routes.ts` + `insurance.cotrollers.ts`).

Each row in the response is either **insole** (`customerOrders`) or **shoes** (`shoe_order`), with a normalized shape. Use `data[].insuranceType` to tell them apart.

---

## Database ↔ External (Excel / excl) – Prescription create/update

When **creating or updating prescriptions** (POST/PUT), the API accepts both **database field names** and **external names**:

| External (excl) | Database field        | Notes |
|-----------------|------------------------|--------|
| **PeNr**        | `proved_number`        | Same value, either name accepted. |
| **Datum**       | `prescription_date`    | ISO date or month/year (e.g. `03.2026`, `2026-03`). |
| **ABZR**        | `prescription_date`    | Time like month and year → mapped to `prescription_date` (first of month). |
| **Meldung**     | `insurance_provider`   | Same value, either name accepted. |
| **Patient**     | customer (vorname/nachname) | If **Patient** is sent instead of **customerId**, the customer is resolved by matching **vorname** or **nachname** (case-insensitive). If exactly one customer matches, that customer is used. |

- **Patient**: Customer name = `vorname` and `nachname`. If either matches the given **Patient** string, that customer is used (one match). Prefer **customerId** when you know it to avoid ambiguity when multiple customers share the same first or last name.

---

## Table header → API field mapping

| # | Table header (Intake) | API path in response | Schema source | In API? |
|---|------------------------|------------------------|---------------|---------|
| 1 | **PeNr** | `data[].prescription.proved_number` | `prescription.proved_number` (comment: PeNr) | ✅ Yes |
| 2 | **ReNrOD** / Rezeptnummer | `data[].prescription.referencen_number` | `prescription.referencen_number` (Rezeptnummer) | ✅ Yes |
| 3 | **Filiale** (branch) | — | Insole: `customerOrders.geschaeftsstandort` (Json). Shoes: `shoe_order.branch_location` / `store_location` (Json) | ❌ No |
| 4 | **Datum** | `data[].prescription.prescription_date` or `data[].createdAt` | `prescription.prescription_date`; order `createdAt` | ✅ Yes (prescription_date + createdAt) |
| 5 | **ABZR** | `data[].prescription.prescription_date` (month/year) | Input: map to `prescription_date`. Output: same as Datum. | ✅ Input + output |
| 6 | **VoNr** | `data[].orderNumber` (possible match) | `customerOrders.orderNumber` / `shoe_order.orderNumber` | ✅ Yes (as order number) |
| 7 | **FallNr** | — | Not clearly in schema | ❌ No |
| 8 | **Statistik** | — | Not in schema | ❌ No |
| 9 | **Versicherter** (insured) | `data[].customer` (vorname, nachname, telefon) | `customers` via relation | ✅ Yes (customer) |
| 10 | **Patient** | Same as Versicherter: `data[].customer` | Same | ✅ Yes (customer) |
| 11 | **Meldung** | `data[].prescription.insurance_provider` | `prescription.insurance_provider` | ✅ Yes |
| 12 | **Korr.-Beschreibung** | — | Not in schema | ❌ No |
| 13 | **Korr.-Code** | — | Not in schema | ❌ No |
| 14 | **Belegverbleib (BV) Beschreibung** | — | Could map to prescription notes / type; not explicitly in response | ❌ No |
| 15 | **BV-Code** | `data[].prescription.aid_code` | `prescription.aid_code` (BVH / Hilfsmittel Code) | ✅ Yes |
| 16 | **Abgerechnet** | `data[].insurance_status` | `insurance_status` (pending / approved / rejected) | ✅ Yes |
| 17 | **Akzeptiert** | Same or derived from `data[].insurance_status` | Same | ✅ Yes |
| 18 | **Betrag** | `data[].totalPrice`, `data[].insuranceTotalPrice` | Insole: `totalPrice` / `insuranceTotalPrice`. Shoes: `total_price` / `insurance_price` | ✅ Yes (normalized as totalPrice, insuranceTotalPrice) |
| 19 | **Basis 10%** | — | Not in response (schema has `vatRate` on orders but not selected) | ❌ No |
| 20 | **MwSt 10%** | — | Not in response | ❌ No |
| 21 | **Basis 20%** | — | Not in response | ❌ No |
| 22 | **MwSt 20%** | — | Not in response | ❌ No |
| 23 | **Rezeptgebühr** | — | Not in schema | ❌ No |

---

## What the API actually returns (frontend can use)

**Per item in `data[]` (same shape for insole and shoes):**

```ts
{
  id: string;
  orderNumber: number | null;
  paymnentType: "insurance" | "broth" | ...;
  totalPrice: number | null;
  insuranceTotalPrice: number | null;
  private_payed: boolean | null;
  insurance_status: "pending" | "approved" | "rejected";
  createdAt: string; // ISO date
  updatedAt?: string; // shoes only
  insuranceType: "insole" | "shoes";
  prescription: {
    id: string;
    insurance_provider: string | null;
    prescription_number: string | null;
    proved_number: string | null;      // → PeNr
    referencen_number: string | null;  // → ReNrOD / Rezeptnummer
    doctor_name: string | null;
    doctor_location: string | null;
    prescription_date: string | null;  // → Datum
    validity_weeks: number | null;
    establishment_number: string | null; // LANR
    aid_code: string | null;           // → BV-Code
  } | null;
  customer: {
    id: string;
    vorname: string | null;
    nachname: string | null;
    telefon: string | null;
  } | null;
}
```

---

## Summary for frontend

- **Use for table (available in API):**  
  PeNr, ReNrOD, Datum, VoNr (orderNumber), Versicherter/Patient (customer), BV-Code, Abgerechnet/Akzeptiert (insurance_status), Betrag (totalPrice / insuranceTotalPrice).  
  Optional: prescription_number, doctor_name, doctor_location, establishment_number, validity_weeks, insurance_provider.

- **Not in API (hide column or show “—”):**  
  Filiale, ABZR, FallNr, Statistik, Meldung, Korr.-Beschreibung, Korr.-Code, Belegverbleib Beschreibung, Basis 10%, MwSt 10%, Basis 20%, MwSt 20%, Rezeptgebühr.

- **In schema but not in this API:**  
  Filiale (geschaeftsstandort / branch_location / store_location), VAT fields (vatRate / vat_rate), and the intake-only columns above would need backend changes if you want them in the list response.
