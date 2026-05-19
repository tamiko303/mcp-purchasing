# SAP Purchasing Tools

This server provides tools for querying SAP purchasing data — purchase orders, goods receipts, supplier invoices, schedule lines, and business partners — via SAP OData APIs.

---

## Available Tools

| Tool | Group | What it does |
|---|---|---|
| `GetScheduleLines` | purchasing | PO schedule lines by delivery date range |
| `GetPOItemDetails` | purchasing | Master data for one PO item |
| `QueryApi` | purchasing | Flexible OData query (custom filters, fields, expand) |
| `GetGoodsReceipts` | material | Actual delivered qty and amount for one PO item |
| `GetSupplierInvoices` | invoice | Invoiced qty and amount for one PO item |
| `GetPOItemsByDateRange` | reporting | Full aggregate report for a period |
| `GetBusinessPartner` | business-partner | Business partner details |
| `GetTableContents` | query | Direct read of any ABAP table |
| `SetSupplierPurchasingBlock` | — | Set or remove purchasing block for a supplier |

---

## When to Use Which Tool

**Use `GetPOItemsByDateRange`** when the user asks for an overview of purchasing activity for a period — "what was ordered / received / invoiced this month", "show all PO items for Q1". It returns everything in one call: master data, GR, invoices, and schedule lines for each item.

**Use atomic tools** (`GetScheduleLines`, `GetPOItemDetails`, `GetGoodsReceipts`, `GetSupplierInvoices`) when:
- the user asks about a specific known PO + item
- only one type of data is needed (e.g. "how much has been received for PO 4500012345 item 10?")
- you need to enrich a specific set of positions step by step

**Use `QueryApi`** when:
- standard tools don't return the needed fields
- a custom OData filter is required
- the user wants to explore data ("show me the first 5 purchase order headers for supplier X")
- you need `$expand`, `$orderby`, or `$skip`

**Use `GetTableContents`** when:
- data is not available via OData APIs
- you need to verify what's actually in the SAP database (debugging)
- the user asks about a specific ABAP table by name

**Use `SetSupplierPurchasingBlock`** only when the user explicitly asks to block or unblock a supplier. This is a write operation — confirm intent before calling.

---

## Typical Workflows

### 1. Overview of purchasing activity for a period

The user asks: *"Show me all PO items with scheduled delivery this week"* or *"What was ordered and delivered in January?"*

```
GetPOItemsByDateRange(from, to)
```

Returns all items with schedule lines in the period, enriched with supplier, material, GR, and invoice data. No further calls needed.

---

### 2. Status check for a specific purchase order (three-way match)

The user asks: *"Check PO 4500012345 — what's ordered, received, and invoiced?"*

Call all three in parallel for each item:

```
purchasing:GetPOItemDetails(purchaseOrder, purchaseOrderItem)
material:GetGoodsReceipts(purchaseOrder, purchaseOrderItem)
invoice:GetSupplierInvoices(purchaseOrder, purchaseOrderItem)
```

Compare `orderedQuantity` vs `deliveredQuantity` vs `invoicedQuantity` and report discrepancies.

---

### 3. Finding open (undelivered) positions

The user asks: *"What hasn't been delivered yet from last month's orders?"*

```
1. purchasing:GetScheduleLines(from, to)
   → get list of PO + item pairs

2. For each pair (parallel, batch of 10):
   purchasing:GetPOItemDetails(po, item)
   material:GetGoodsReceipts(po, item)

3. Filter: orderedQuantity > deliveredQuantity
4. Report open items with the gap
```

---

### 4. Supplier reliability analysis

The user asks: *"How reliable is supplier 1000123? Are there delivery problems?"*

```
1. business-partner:GetBusinessPartner(partner_number)
   → check status and blocking flags

2. reporting:GetPOItemsByDateRange(from, to)
   → get all items for the period

3. Filter items by supplier = 1000123
4. Compare orderedQuantity vs deliveredQuantity per item
5. Report completion % and highlight underdelivered items
```

---

### 5. Exploring unknown data with QueryApi

The user asks: *"Show me purchase order headers for supplier VENDOR_001"*

```
QueryApi(
  entity: 'POHeaders',
  filter: "Supplier eq 'VENDOR_001'",
  select: ['PurchaseOrder', 'PurchaseOrderType', 'CreationDate', 'PurchaseOrderStatus'],
  top: 20
)
```

---

### 6. Verifying data in a specific SAP table

The user asks: *"What's in table EKPO for PO 4500012345?"* or you need to debug a data discrepancy:

```
GetTableContents(
  table_name: 'EKPO',
  where_clause: "EBELN = '4500012345'",
  fields: ['EBELN', 'EBELP', 'MATNR', 'MENGE', 'MEINS', 'NETPR']
)
```

---

## Important Notes

### Date format
All date parameters use `YYYY-MM-DD` format. When the user says "this week", "last month", "Q1 2024" — calculate the exact dates yourself before calling tools.

### PO item number format
SAP item numbers are zero-padded strings: `"00010"`, `"00020"`, not `10` or `20`. Use the value exactly as returned by `GetScheduleLines` or `GetPOItemDetails`.

### Parallel calls
When processing multiple PO + item pairs, call tools in parallel (batch of 10). Do not call them sequentially — it will be slow for large result sets.

### Partial failures
If one tool call fails for a specific item (e.g. GR data unavailable), continue processing other items. Report missing data as nulls or zeros, not as a full failure.

### GetGoodsReceipts — reversal logic
`GetGoodsReceipts` already accounts for reversals (movement type 102 cancels 101). The returned `deliveredQuantity` is the net quantity after reversals. Do not subtract anything manually.

### GetSupplierInvoices — credit notes
`GetSupplierInvoices` sums all invoice lines including credit notes. The returned `invoicedQuantity` and `invoicedAmount` are net values.

### QueryApi — entity names
The `entity` parameter is an enum. Valid values:
- `ScheduleLines` — A_PurchaseOrderScheduleLine
- `POItems` — A_PurchaseOrderItem
- `POHeaders` — A_PurchaseOrder
- `MaterialDocuments` — A_MaterialDocumentItem
- `SupplierInvoices` — A_SuplrInvcItemPurOrdRef

### QueryApi — filter syntax (OData v2)
```
String:  PurchaseOrder eq '4500012345'
Number:  OrderQuantity gt 100
Date:    ScheduleLineDeliveryDate ge datetime'2024-01-01T00:00:00'
And/Or:  PurchaseOrder eq '4500012345' and PurchaseOrderItem eq '00010'
```

### SetSupplierPurchasingBlock — write operation
This tool modifies SAP data. Always confirm with the user before calling it. Required parameters: `supplier` (account number), `purchasing_org`, `blocked` (true to block, false to unblock).

### GetTableContents — requires custom ABAP service
This tool depends on a custom service deployed in SAP. If it returns a connection or authorization error, the service may not be available in the target system.

---

## Response format

All tools return a JSON object wrapped in an MCP text content block. Parse `content[0].text` as JSON to access the data.

**Atomic tools** return domain objects:
```json
// GetGoodsReceipts
{
  "purchaseOrder": "4500012345",
  "purchaseOrderItem": "00010",
  "goodsReceipts": {
    "deliveredQuantity": 60,
    "deliveredAmount": 3000,
    "currency": "EUR"
  }
}
```

**Reporting tools** return arrays:
```json
// GetPOItemsByDateRange
{
  "items": [
    {
      "purchaseOrder": "4500012345",
      "purchaseOrderItem": "00010",
      "supplier": "VENDOR_001",
      "material": "MAT-001",
      "orderedQuantity": 100,
      "deliveredQuantity": 60,
      "invoicedQuantity": 60,
      ...
    }
  ]
}
```

**On error**, `isError: true` is returned with a message in `content[0].text`. Log the error and continue with other items if possible.
