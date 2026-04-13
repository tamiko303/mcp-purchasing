#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  CallToolRequestSchema,
  ErrorCode,
  ListToolsRequestSchema,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import path from 'path';
import dotenv from 'dotenv';

// Import handler functions
import { handleGetTableContents } from './handlers/handleGetTableContents';
import { handleGetBusinessPartner } from './handlers/handleGetBusinessPartner';
import { handleSetSupplierPurchasingBlock } from './handlers/handleSetSupplierPurchasingBlock';
import { handleGetPurchaseOrder } from './handlers/handleGetPurchaseOrder';
import { handleGetPOItemsByDateRange } from './handlers/handleGetPOItemsByDateRange';

// Import tools
import { tools } from './tools/tools';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../.env') });

// Interface for SAP configuration
export interface SapConfig {
  url: string;
  username: string;
  password: string;
  client: string;
}

/**
 * Retrieves SAP configuration from environment variables.
 *
 * @returns {SapConfig} The SAP configuration object.
 * @throws {Error} If any required environment variable is missing.
 */
export function getConfig(): SapConfig {
  const url = process.env.SAP_URL;
  const username = process.env.SAP_USERNAME;
  const password = process.env.SAP_PASSWORD;
  const client = process.env.SAP_CLIENT;

  // Check if all required environment variables are set
  if (!url || !username || !password || !client) {
    throw new Error(`Missing required environment variables. Required variables:
    - SAP_URL
    - SAP_USERNAME
    - SAP_PASSWORD
    - SAP_CLIENT`);
  }

  return { url, username, password, client };
}

/**
 * Server class for interacting with ABAP systems via API_PURCHASEORDER_PROCESS_SRV.
 */
export class mcp_purchasing_server {
  private server: Server;  // Instance of the MCP server
  private sapConfig: SapConfig; // SAP configuration

  /**
   * Constructor for the mcp_purchasing_server class.
   */
  constructor() {
    this.sapConfig = getConfig(); // Load SAP configuration
    this.server = new Server(  // Initialize the MCP server
      {
        name: 'mcp-purchasing', // Server name
        version: '1.0.0',       // Server version
      },
      {
        capabilities: {
          tools: {}, // Initially, no tools are registered
        },
      }
    );

    this.setupHandlers(); // Setup request handlers
  }

  /**
   * Sets up request handlers for listing and calling tools.
   * @private
   */
  private setupHandlers() {
    // Setup tool handlers

    // Handler for ListToolsRequest
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      return { tools }; 
    });

    // Handler for CallToolRequest
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      switch (request.params.name) {
        case 'GetTableContents':
          return await handleGetTableContents(request.params.arguments);
        case 'GetBusinessPartner':
          return await handleGetBusinessPartner(request.params.arguments);
        case 'SetSupplierPurchasingBlock':
          return await handleSetSupplierPurchasingBlock(request.params.arguments);
        case 'GetPOItemsByDateRange':
          return await handleGetPOItemsByDateRange(request.params.arguments);
         case 'GetPOItemsByDateRange':
          return await handleGetPurchaseOrder(request.params.arguments);
        default:
          throw new McpError(
            ErrorCode.MethodNotFound,
            `Unknown tool: ${request.params.name}`
          );
      }
    });

    // Handle server shutdown on SIGINT (Ctrl+C)
    process.on('SIGINT', async () => {
      await this.server.close();
      process.exit(0);
    });
  }

  /**
   * Starts the MCP server and connects it to the transport.
   */
  async run() {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}

// Create and run the server
const server = new mcp_purchasing_server();
server.run().catch((error) => {
  process.exit(1);
});
