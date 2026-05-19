# mcp-purchasing
This project provides an MCP (Model Context Protocol) server that connects Claude to your SAP system, enabling natural language queries against purchasing data — purchase orders, goods receipts, supplier invoices, and more.

Instead of navigating SAP transactions like ME23N, ME2M, or MIGO, you simply ask Claude:

> _"Show me all open purchase order items for this month that haven't been delivered yet."_

Claude will call the right tools, query SAP, and return a structured answer.

---

## Prerequisites

Before you start, make sure you have:

- **An SAP system** with OData services activated. The following standard SAP APIs are used:
  - `API_PURCHASEORDER_PROCESS_SRV`
  - `API_MATERIAL_DOCUMENT_SRV`
  - `API_SUPPLIERINVOICE_PROCESS_SRV`
  - `API_BUSINESS_PARTNER`
  - A custom service for direct table access (used by `GetTableContents`) — see note below
- **Node.js v18+** — [Download Node.js](https://nodejs.org/en/download/). Choose the LTS version.
  After installation, verify it works:
  ```bash
  node -v
  npm -v
  ```
- **Claude Desktop** — [Download Claude Desktop](https://claude.ai/download)
- **Git** — [Download Git](https://git-scm.com/downloads)

> **Note on GetTableContents:** This tool requires a custom ABAP service to be deployed in your SAP system. See [this guide](https://community.sap.com/t5/application-development-blog-posts/how-to-use-rfc-read-table-from-javascript-via-webservice/ba-p/13172358) for setup instructions.

---

## Installation

### 1. Clone the repository

```bash
git clone https://github.com/your-org/mcp-purchasing
cd mcp-purchasing
```

### 2. Install dependencies

```bash
npm install
```

### 3. Build the project

```bash
npm run build
```

### 4. Create a `.env` file

In the root directory, create a file named `.env` and fill in your SAP credentials:

```env
SAP_URL=https://your-sap-host:8000
SAP_USERNAME=your_username
SAP_PASSWORD=your_password
SAP_CLIENT=your_client
SAP_LANGUAGE=your_language
```

> **Important:** Never share your `.env` file or commit it to version control. If your password contains `#`, wrap it in quotes.

---

## Connecting to Claude Desktop

1. Open Claude Desktop
2. Go to **Settings → Developer → Edit Config**
3. This opens the `claude_desktop_config.json` file. Add the following entry under `mcpServers`:

```json
{
  "mcpServers": {
    "mcp-purchasing": {
      "command": "node",
      "args": ["dist/index.js"],
      "cwd": "C:/PATH_TO/mcp-purchasing"
    }
  }
}
```

Replace `C:/PATH_TO/mcp-purchasing` with the actual path to where you cloned the repository.

On **Windows**, use forward slashes or double backslashes:
```
C:/Users/yourname/projects/mcp-purchasing/dist/index.js
```

4. Restart Claude Desktop
5. You should see **mcp-purchasing** appear in the MCP servers list (hammer icon in the chat interface)

---

## Running in HTTP mode

The server also supports Streamable HTTP transport (MCP 2025 standard), useful for team deployments where multiple users connect to a shared server.

Add to your `.env`:

```env
MCP_TRANSPORT=http
MCP_PORT=3000
MCP_HOST=0.0.0.0
```

Then run:

```bash
node dist/index.js
```

The server will be available at:
- `POST http://your-server:3000/mcp` — MCP endpoint
- `GET  http://your-server:3000/health` — health check

By default (without `MCP_TRANSPORT`), the server runs in stdio mode for Claude Desktop.

---

## Testing with MCP Inspector

To test and explore tools interactively before connecting to Claude:

```bash
npm run dev
```

This launches the MCP Inspector in your browser. You can browse available tools, call them with test parameters, and inspect responses — without needing Claude Desktop.

---

## Available Tools

The server exposes 9 tools organized into logical groups using namespace prefixes.

### `purchasing:` — Purchase Orders

| Tool | Description | Parameters |
|---|---|---|
| `GetScheduleLines` | Returns PO schedule lines filtered by delivery date range. Use as the first step to discover PO + item pairs for a period. | `from`, `to` (YYYY-MM-DD) |
| `GetPOItemDetails` | Returns master data for one PO item: material, supplier, ordered quantity, net price, currency. | `purchaseOrder`, `purchaseOrderItem` |
| `QueryApi` | Flexible low-level OData query for SAP purchasing APIs. Use for custom filters, extra fields, `$expand`, or sampling with `$top`. Available entities: `ScheduleLines`, `POItems`, `POHeaders`, `MaterialDocuments`, `SupplierInvoices`. | `entity` (required), `filter`, `select`, `expand`, `top`, `skip`, `orderby` |

### `material:` — Goods Receipts

| Tool | Description | Parameters |
|---|---|---|
| `GetGoodsReceipts` | Returns total delivered quantity and amount for one PO item. Accounts for reversals (GR movement types 101 and 102). | `purchaseOrder`, `purchaseOrderItem` |

### `invoice:` — Supplier Invoices

| Tool | Description | Parameters |
|---|---|---|
| `GetSupplierInvoices` | Returns total invoiced quantity and amount for one PO item. Use for invoice status check or three-way match. | `purchaseOrder`, `purchaseOrderItem` |

### `reporting:` — Aggregate Reports

| Tool | Description | Parameters |
|---|---|---|
| `GetPOItemsByDateRange` | Full picture for a period: all PO items with schedule lines in the date range, enriched with master data, goods receipts, and supplier invoices. Use for overview and analysis. For single items or one data type, prefer the atomic tools above. | `from`, `to` (YYYY-MM-DD) |

### `business-partner:` — Business Partners

| Tool | Description | Parameters |
|---|---|---|
| `GetBusinessPartner` | Returns business partner information. | `partner_number` |

### `query:` — Direct Table Access

| Tool | Description | Parameters |
|---|---|---|
| `GetTableContents` | Reads contents of any ABAP table directly. Useful for debugging, exploring data structures, or accessing tables not covered by standard OData APIs. | `table_name` (required), `fields`, `where_clause`, `row_skip`, `max_rows` |

### No group — Write Operations

| Tool | Description | Parameters |
|---|---|---|
| `SetSupplierPurchasingBlock` | Sets or removes a purchasing block for a supplier at the purchasing organization level. | `supplier`, `purchasing_org`, `blocked` |

---

## Example questions to ask Claude

Once connected, you can ask Claude questions like:

- _"Show me all purchase order items with scheduled delivery this week."_
- _"Check purchase order 4500012345 — what's ordered, what's been received, and what's been invoiced?"_
- _"Which suppliers have the most open (undelivered) positions in Q1 2024?"_
- _"Are there any overdue deliveries from last month?"_
- _"Show me business partner details for supplier 1000123."_

Claude will automatically select the right tools, chain calls where needed, and return a structured answer in natural language.

---

## Troubleshooting

**Claude Desktop doesn't show mcp-purchasing in the tools list**
- Check that the path in `claude_desktop_config.json` is correct and points to `dist/index.js`
- Make sure the project was built: `npm run build`
- Restart Claude Desktop after editing the config
- Open MCP Inspector (`npm run dev`) to verify the server starts without errors

**`node -v` or `npm -v` returns an error**
- Node.js may not be installed or not in your PATH
- Reinstall Node.js LTS and open a new terminal window after installation

**SAP connection errors**
- Verify your credentials in `.env`
- Confirm the SAP system is reachable from your machine
- Check that the required OData services are activated (transaction `SICF`)
- If your SAP system uses self-signed certificates, you may need to set `NODE_TLS_REJECT_UNAUTHORIZED=0` in `.env` (only for internal/development use)

**`GetTableContents` returns an error**
- This tool requires a custom ABAP service. See the [setup guide](https://community.sap.com/t5/application-development-blog-posts/how-to-use-rfc-read-table-from-javascript-via-webservice/ba-p/13172358)

**Empty results from reporting tools**
- Check that the date range contains PO schedule lines in SAP
- Verify that the OData service returns data for the same range in a browser or Postman

---

## Project structure

```
mcp-purchasing/
├── src/
│   ├── index.ts                          ← server entrypoint, transport selection
│   ├── tools/
│   │   └── tools.ts                      ← tool definitions (names, descriptions, schemas)
│   ├── lib/
│   │   ├── utils.ts                      ← HTTP client, SAP auth, response helpers
│   │   ├── formatters.ts                 ← data formatters and aggregators
│   │   ├── odata.builder.ts              ← OData URL builder
│   │   └── purchasing.core.ts            ← core fetch functions (reused by handlers)
│   └── handlers/
│       ├── purchasing/
│       │   ├── getScheduleLines.ts       → purchasing:GetScheduleLines
│       │   ├── getPOItemDetails.ts       → purchasing:GetPOItemDetails
│       │   ├── getPOItemsByDateRange.ts  → reporting:GetPOItemsByDateRange
│       │   └── queryPurchasingApi.ts     → purchasing:QueryApi
│       ├── material/
│       │   └── getGoodsReceipts.ts       → material:GetGoodsReceipts
│       ├── invoice/
│       │   └── getSupplierInvoices.ts    → invoice:GetSupplierInvoices
│       ├── business-partner/
│       │   └── getBusinessPartner.ts     → business-partner:GetBusinessPartner
│       ├── query/
│       │   └── getTableContents.ts       → query:GetTableContents
│       └── handleSetSupplierPurchasingBlock.ts → SetSupplierPurchasingBlock
├── .env                                  ← SAP credentials (not committed)
├── package.json
└── tsconfig.json
```

---

## Environment variables

| Variable | Required | Description |
|---|---|---|
| `SAP_URL` | ✅ | SAP system URL, e.g. `https://your-sap-host:8000` |
| `SAP_USERNAME` | ✅ | SAP username |
| `SAP_PASSWORD` | ✅ | SAP password |
| `SAP_CLIENT` | ✅ | SAP client number, e.g. `100` |
| `SAP_LANGUAGE` | — | SAP language, e.g. `en` |
| `MCP_TRANSPORT` | — | `stdio` (default) or `http` |
| `MCP_PORT` | — | HTTP port (default: `3000`) |
| `MCP_HOST` | — | HTTP host (default: `0.0.0.0`) |


## For AI agents — SKILL.md

If you are integrating this server into an AI agent or using it with a custom system prompt, see [SKILL.md](./SKILL.md). It describes:

- when to use each tool and which to prefer
- typical multi-step workflows (three-way match, open items, supplier analysis)
- important notes on date formats, parallel calls, OData filter syntax
- response format and error handling