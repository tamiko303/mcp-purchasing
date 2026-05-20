import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const tools: Tool[] = [
  {
    name: 'GetTableContents',
    description: 'Retrieve contents of an ABAP table',
    inputSchema: {
      type: 'object',
      properties: {
        table_name: {
          type: 'string',
          description: 'Name of the ABAP table'
        },
        fields: {
          type: 'array',
          items: { type: 'string' },
          description: 'Fields to select'
        },
        where_clause: {
          type: 'string',
          description: 'List of selection conditions'
        },
        row_skip: {
          type: 'number',
          description: 'Maximum number of rows to skip'
        },
        max_rows: {
          type: 'number',
          description: 'Maximum number of rows to retrieve',
          default: 100
        }
      },
      required: ['table_name']
    }
  },
  {
    name: 'GetBusinessPartner',
    description: 'Retrieve information about a business partner',
    inputSchema: {
      type: 'object',
      properties: {
        partner_number: {
          type: 'string',
          description: 'Partner number'
        }
      },
      required: ['partner_number']
    }
  },
  {
    name: 'SetSupplierPurchasingBlock',
    description: 'Setting/removing purchase blocks from a supplier at the purchasing organization level',
    inputSchema: {
      type: 'object',
      properties: {
        supplier: {
          type: 'string',
          description: `Supplier's Account Number`
        },
        purchasing_org: {
          type: 'string',
          description: 'Purchasing Organization'
        },
        blocked: {
          type: 'boolean',
          description: 'Purchasing block at purchasing org level'
        }
      },
      required: ['supplier', 'purchasing_org', 'blocked']
    }
  },
  {
        name: 'GetScheduleLines',
        description: 'Returns PO schedule lines by delivery date range. '
                   + 'First step to discover purchaseOrder + purchaseOrderItem pairs for a period.',
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', description: 'Start date YYYY-MM-DD' },
                to:   { type: 'string', description: 'End date YYYY-MM-DD' },
            },
            required: ['from', 'to'],
        },
    },
    {
        name: 'GetPOItemDetails',
        description: 'Returns master data for one PO item: material, supplier, ordered quantity, price, currency.',
        inputSchema: {
            type: 'object',
            properties: {
                purchaseOrder:     { type: 'string' },
                purchaseOrderItem: { type: 'string' },
            },
            required: ['purchaseOrder', 'purchaseOrderItem'],
        },
    },
    {
        name: 'GetGoodsReceipts',
        description: 'Returns total delivered quantity and amount (GR movements 101/102) for one PO item. '
                   + 'Reversals are accounted automatically.',
        inputSchema: {
            type: 'object',
            properties: {
                purchaseOrder:     { type: 'string' },
                purchaseOrderItem: { type: 'string' },
            },
            required: ['purchaseOrder', 'purchaseOrderItem'],
        },
    },
    {
        name: 'GetSupplierInvoices',
        description: 'Returns total invoiced quantity and amount for one PO item. '
                   + 'Use for invoice status check or three-way match.',
        inputSchema: {
            type: 'object',
            properties: {
                purchaseOrder:     { type: 'string' },
                purchaseOrderItem: { type: 'string' },
            },
            required: ['purchaseOrder', 'purchaseOrderItem'],
        },
    },
    {
        name: 'GetPOItemsByDateRange',
        description: `Aggregate report: all PO items with schedule lines in the date range,
enriched with master data (material, supplier, price), goods receipts, and supplier invoices.
Use for the full picture over a period. For single items or one data type, prefer atomic tools.`,
        inputSchema: {
            type: 'object',
            properties: {
                from: { type: 'string', 
                        description: 'Delivery date from (inclusive), format YYYY-MM-DD' },
                to:   { type: 'string', 
                        description: 'Delivery date to (inclusive), format: YYYY-MM-DD' },
            },
            required: ['from', 'to'],
        },
    },
    {
        name: 'QueryApi',
        description: `Flexible low-level OData query for SAP purchasing APIs.
Use when standard tools don't cover your scenario: custom filters, extra fields, $expand, $top for sampling.
Entities: ScheduleLines, POItems, POHeaders, MaterialDocuments, SupplierInvoices.`,
        inputSchema: {
            type: 'object',
            properties: {
                entity: {
                    type: 'string',
                    enum: ['ScheduleLines', 'POItems', 'POHeaders', 'MaterialDocuments', 'SupplierInvoices'],
                    description: 'SAP entity to query',
                },
                filter:  { type: 'string',  description: "OData v2 $filter, e.g. \"PurchaseOrder eq '4500012345'\" or \"DeliveryDate ge datetime'2024-01-01T00:00:00'\"" },
                select:  { type: 'array', items: { type: 'string' }, description: 'Fields to return' },
                expand:  { type: 'array', items: { type: 'string' }, description: "Navigation props, e.g. ['to_PurchaseOrder']" },
                top:     { type: 'number', description: 'Max records (default 100, max 1000)' },
                skip:    { type: 'number', description: 'Records to skip (pagination)' },
                orderby: { type: 'string', description: "e.g. 'ScheduleLineDeliveryDate desc'" },
            },
            required: ['entity'],
        },
    },
    {
    name: 'GetOpenPOItems',
    description:
        `Returns all open PO items (ordered but not fully delivered) within the scheduled delivery 
date range. Each item includes ordered/delivered/open quantities, open %, isOverdue flag, supplier, 
material, price. Results sorted: overdue first, then by delivery date. Use to monitor delivery 
backlog and identify at-risk orders.`,
    inputSchema: {
        type: 'object',
        properties: {
            from: { type: 'string', 
                        description: 'Delivery date from (inclusive), format YYYY-MM-DD' },
            to:   { type: 'string', 
                    description: 'Delivery date to (inclusive), format: YYYY-MM-DD' },
        },
        required: ['from', 'to'],
    },
  },
];