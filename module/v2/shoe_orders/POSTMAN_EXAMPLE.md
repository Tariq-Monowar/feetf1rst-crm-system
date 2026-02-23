# Shoe Order Create - Postman Body Structure

## Endpoint

`POST /v2/shoe-orders/create`

---

## PAGE 1: Basic Order Info

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| quantity | number | ✓ | Order quantity |
| customerId | string (uuid) | ✓ | Valid customer ID (belongs to partner) |
| total_price | number | ✓ | Total order price |
| payment_status | string | ✓ | `Privat_Bezahlt`, `Privat_offen`, `Krankenkasse_Ungenehmigt`, `Krankenkasse_Genehmigt` |
| branch_location | string (JSON) | ✓ | e.g. `{"title": "Branch A", "description": "Main branch"}` |
| pick_up_location | string (JSON) | ✓ | e.g. `{"title": "Pickup Point 1"}` |
| store_location | string (JSON) | | e.g. `{"title": "Store Berlin"}` |
| order_note | string | | |
| medical_diagnosis | string | | Ärztliche Diagnose |
| detailed_diagnosis | string | | Ausführliche Diagnose |
| vat_rate | number | | Only for private orders |
| employeeId | string (uuid) | | Valid employee ID |
| kva | boolean | | default: true |
| halbprobe | boolean | | default: true |
| half_sample_required | boolean | | true = skip steps 4 & 5 |
| has_trim_strips | boolean | | true = skip step 2 |
| bedding_required | boolean | | true = skip step 3 |
| supply_note | string | | |

---

## PAGE 2: Conditional Data

### When `half_sample_required` = false (steps 4 & 5 required)

| Field | Type | Description |
|-------|------|-------------|
| preparation_date | string (ISO date) | Step 4 |
| notes | string | Step 4 notes |
| fitting_date | string (ISO date) | Step 5 |
| adjustments | string | Step 5 |
| customer_reviews | string | Step 5 |

### When `has_trim_strips` = false (step 2 required)

| Field | Type | Description |
|-------|------|-------------|
| step2_material | string | |
| step2_size | string | |
| step2_notes | string | |

### When `bedding_required` = false OR `has_trim_strips` = false (step 3 required)

| Field | Type | Description |
|-------|------|-------------|
| step3_material | string | |
| step3_thickness | string | |
| step3_notes | string | |

### Insurances (optional array)

| Field | Type | Description |
|-------|------|-------------|
| insurances | string (JSON array) | `[{"price": 50, "description": {"item": "..."}, "vat_country": "DE"}]` |

---

## Full JSON Example

```json
{
  "quantity": 2,
  "customerId": "8316981a-496d-4207-ac7e-925a5473bf05",
  "total_price": 150.00,
  "payment_status": "Privat_Bezahlt",
  "branch_location": "{\"title\": \"Branch A\", \"description\": \"Main branch\"}",
  "pick_up_location": "{\"title\": \"Pickup Point 1\"}",
  "store_location": "{\"title\": \"Store Berlin\"}",
  "order_note": "Handle with care",
  "medical_diagnosis": "Flat foot",
  "detailed_diagnosis": "Pes planus",
  "vat_rate": 19,
  "employeeId": "0d6ecfed-b9a7-454b-a4a3-ece4c2ffc57a",
  "kva": true,
  "halbprobe": true,
  "half_sample_required": false,
  "has_trim_strips": false,
  "bedding_required": false,
  "supply_note": "Rush order",
  "preparation_date": "2025-02-25T10:00:00.000Z",
  "notes": "Step 4 notes",
  "fitting_date": "2025-03-01T14:00:00.000Z",
  "adjustments": "Minor width adjustment",
  "customer_reviews": "Fits well",
  "step2_material": "Leather",
  "step2_size": "42",
  "step2_notes": "Step 2 notes",
  "step3_material": "Foam",
  "step3_thickness": "5mm",
  "step3_notes": "Step 3 notes",
  "insurances": "[{\"price\": 50.00, \"description\": {\"item\": \"Orthotic\"}, \"vat_country\": \"DE\"}]"
}
```
