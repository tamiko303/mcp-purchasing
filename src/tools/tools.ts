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
  }
];