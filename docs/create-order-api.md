# Create Order API (`/customer-orders/create-order/please`)

This endpoint creates an insole order.

- **Method:** `POST`
- **Route (v1):** `/v1/customer-orders/create-order/please`
- **Auth:** `ADMIN | PARTNER | EMPLOYEE`
- **Content-Type:** `application/json`

## Foot Length Rule (Important)

Foot length is resolved in this order:

1. `customerFootLength` from request body (if valid number)
2. Otherwise `max(customer.fusslange1, customer.fusslange2)` from DB

The resolved value is used for:

- size matching
- `targetLengthRady` (`footLength + 5`)
- saving into `customerOrders.customerFootLength`

If no `screenerId` and no valid foot length source exists, API returns `400`.

## Minimum Required Body

### Normal order

- `customerId`
- `versorgungId` (or `key` when using private/shadow supply)
- `geschaeftsstandort`
- `bezahlt`

### Halbprobe

- `customerId`
- `versorgungId` (or `key`)
- `geschaeftsstandort`
- `bezahlt` not required

## Common Optional Fields

- `customerFootLength` (number, preferred if you already know exact value)
- `screenerId`
- `totalPrice`
- `vat_rate`
- `quantity`
- `discount`
- `privatePrice`
- `insuranceTotalPrice`
- `addonPrices`
- `insoleStandards`
- `orderNotes`
- `pickUpLocation`
- `prescriptionId`

## Example Request

```json
{
  "customerId": "cus_123",
  "versorgungId": "ver_123",
  "geschaeftsstandort": {
    "name": "Main Store"
  },
  "bezahlt": "Privat_offen",
  "customerFootLength": 264.5,
  "quantity": 1,
  "totalPrice": 129.9
}
```

## Example Success Response

```json
{
  "success": true,
  "message": "Order created successfully",
  "orderId": "order_123",
  "matchedSize": "42",
  "foorSize": 42,
  "supplyType": "public"
}
```

## Error Notes

- `400 customerFootLength must be a valid number`
- `400 Either provide screenerId or ensure customer has fusslange1/fusslange2 or customerFootLength`
- `400/404` for store/supply/size mismatch cases
