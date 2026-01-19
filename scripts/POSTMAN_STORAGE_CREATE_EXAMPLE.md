# Postman - Create Storage Request Format

## Endpoint
`POST {{BASE_URL}}/store/create`

## Body Type
**form-data**

## Form Data Fields:

### Required Fields (Text):
- `produktname`: Product name (e.g., `"Nike Air Max"`)
- `hersteller`: Manufacturer/Brand (e.g., `"Nike"`)
- `artikelnummer`: Article number/SKU (e.g., `"ART123456"`)
- `groessenMengen`: **JSON string** - Sizes and quantities object
- `purchase_price`: Purchase price (e.g., `"100"`)
- `selling_price`: Selling price (e.g., `"150"`)

### Optional Fields (Text):
- `lagerort`: Storage location (e.g., `"Warehouse A"`)
- `mindestbestand`: Minimum stock level (e.g., `"5"`)
- `userId`: User ID (automatically from auth token)

### File Field:
- `image`: **File** - Product image (optional)

## groessenMengen JSON Format Example:

When using **form-data**, send `groessenMengen` as a **Text** field with this JSON structure:

```json
{
    "35": {
        "length": 225,
        "quantity": 5,
        "mindestmenge": 3
    },
    "36": {
        "length": 230,
        "quantity": 2,
        "mindestmenge": 3
    },
    "37": {
        "length": 235,
        "quantity": 1,
        "mindestmenge": 0
    },
    "38": {
        "length": 240,
        "quantity": 5,
        "mindestmenge": 9
    },
    "39": {
        "length": 245,
        "quantity": 5,
        "mindestmenge": 3
    },
    "40": {
        "length": 250,
        "quantity": 7,
        "mindestmenge": 3
    },
    "41": {
        "length": 255,
        "quantity": 8,
        "mindestmenge": 3
    },
    "42": {
        "length": 260,
        "quantity": 7,
        "mindestmenge": 3
    },
    "43": {
        "length": 265,
        "quantity": 9,
        "mindestmenge": 3
    },
    "44": {
        "length": 270,
        "quantity": 4,
        "mindestmenge": 3
    },
    "45": {
        "length": 275,
        "quantity": 3,
        "mindestmenge": 3
    },
    "46": {
        "length": 280,
        "quantity": 2,
        "mindestmenge": 3
    },
    "47": {
        "length": 285,
        "quantity": 2,
        "mindestmenge": 3
    },
    "48": {
        "length": 290,
        "quantity": 3,
        "mindestmenge": 3
    }
}
```

## Postman Setup:

1. Select **form-data** tab in Body
2. Add fields as shown above
3. For `groessenMengen`: 
   - Type: **Text**
   - Value: Paste the entire JSON object as a single line (Postman will handle it)
   - Or use line breaks for readability
4. For `image`: 
   - Type: **File**
   - Click "Select Files" and choose your image

## Important Notes:

- **`create_status`** is automatically set to `"by_self"` when creating storage this way
- **`adminStoreId`** is NOT included when `create_status: "by_self"`
- Make sure `groessenMengen` is valid JSON - the backend will parse it automatically
- All size keys (like "35", "36") should be strings in the JSON
- Each size object should contain: `length`, `quantity`, and optionally `mindestmenge`

## Example Request in Postman:

```
Key: produktname          Type: Text    Value: Nike Air Max 90
Key: hersteller           Type: Text    Value: Nike
Key: artikelnummer        Type: Text    Value: NIKE-AM90-001
Key: groessenMengen       Type: Text    Value: {"35":{"length":225,"quantity":5,"mindestmenge":3},"36":{"length":230,"quantity":2,"mindestmenge":3}}
Key: purchase_price       Type: Text    Value: 100
Key: selling_price        Type: Text    Value: 150
Key: lagerort             Type: Text    Value: Warehouse A
Key: mindestbestand       Type: Text    Value: 5
Key: image                Type: File    Value: [Select File]
```
