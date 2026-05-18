#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamablehttp.js';
import {
    CallToolRequestSchema,
    ErrorCode,
    ListToolsRequestSchema,
    McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { randomUUID } from 'crypto';
import express, { Request, Response } from 'express';
import path from 'path';
import dotenv from 'dotenv';

// Import handler functions
import { handleGetTableContents }           from './handlers/query/getTableContents';
import { handleGetScheduleLines }           from './handlers/purchasing/getScheduleLines';
import { handleGetPOItemDetails }           from './handlers/purchasing/getPOItemDetails';
import { handleQueryPurchasingApi }         from './handlers/purchasing/queryPurchasingApi';
import { handleGetGoodsReceipts }           from './handlers/material/getGoodsReceipts';
import { handleGetSupplierInvoices }        from './handlers/invoice/getSupplierInvoices';
import { handleGetBusinessPartner }         from './handlers/business-partner/getBusinessPartner';
import { handleGetPOItemsByDateRange }      from './handlers/purchasing/getPOItemsByDateRange';
import { handleSetSupplierPurchasingBlock } from './handlers/handleSetSupplierPurchasingBlock';

// Import tools
import { tools } from './tools/tools';

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '../.env'), quiet: true });

// ─── SAP Config ────────────────────────────────────────────────────────────

export interface SapConfig {
    url:      string;
    username: string;
    password: string;
    client:   string;
}

export function getConfig(): SapConfig {
    const url      = process.env.SAP_URL;
    const username = process.env.SAP_USERNAME;
    const password = process.env.SAP_PASSWORD;
    const client   = process.env.SAP_CLIENT;

    if (!url || !username || !password || !client) {
        throw new Error(`Missing required environment variables:
    - SAP_URL
    - SAP_USERNAME
    - SAP_PASSWORD
    - SAP_CLIENT`);
    }
    return { url, username, password, client };
}

// ─── Tool handlers registry ────────────────────────────────────────────────

const HANDLERS: Record<string, (args: any) => Promise<any>> = {
    'GetBusinessPartner':         handleGetBusinessPartner,
    'GetSupplierInvoices':        handleGetSupplierInvoices,
    'GetGoodsReceipts':           handleGetGoodsReceipts,
    'GetPOItemDetails':           handleGetPOItemDetails,
    'GetPOItemsByDateRange':      handleGetPOItemsByDateRange,
    'GetScheduleLines':           handleGetScheduleLines,
    'QueryPurchasingApi':         handleQueryPurchasingApi,
    'GetTableContents':           handleGetTableContents,
    'SetSupplierPurchasingBlock': handleSetSupplierPurchasingBlock,
};

// ─── MCP Server factory ────────────────────────────────────────────────────
//
// Creates a new MCP server instance with all tool handlers registered.
// Called once for stdio, and once per request for stateless HTTP.

function createMcpServer(): Server {
    const server = new Server(
        { name: 'mcp-purchasing', version: '1.0.0' },
        { capabilities: { tools: {} } }
    );

    server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));

    server.setRequestHandler(CallToolRequestSchema, async (request) => {
        const handler = HANDLERS[request.params.name];
        if (!handler) {
            throw new McpError(ErrorCode.MethodNotFound, `Unknown tool: ${request.params.name}`);
        }
        return handler(request.params.arguments);
    });

    return server;
}

// ─── Transport: stdio ──────────────────────────────────────────────────────

async function runStdio() {
    const server    = createMcpServer();
    const transport = new StdioServerTransport();
    await server.connect(transport);

    process.on('SIGINT', async () => {
        await server.close();
        process.exit(0);
    });
}

// ─── Transport: HTTP (Streamable HTTP) ──────────────────────

async function runHttp() {
    const app  = express();
    const PORT = parseInt(process.env.MCP_PORT ?? '3000', 10);
    const HOST = process.env.MCP_HOST ?? '0.0.0.0';

    app.use(express.json());

    // ── Streamable HTTP (MCP 2025 standard) ───────────────────────────────
    //
    // Stateless mode: each POST /mcp creates a new transport and server instance.
    // This simplifies horizontal scaling — no sticky sessions required.
    //
    // To enable stateful mode (shared session state across requests),
    // set stateless: false and implement a sessionStore.

    app.post('/mcp', async (req: Request, res: Response) => {
        try {
            const server    = createMcpServer();
            const transport = new StreamableHTTPServerTransport({
                sessionIdGenerator: () => randomUUID(),
            });
            await server.connect(transport);
            await transport.handleRequest(req, res);
        } catch (error) {
            if (!res.headersSent) {
                res.status(500).json({ error: 'Internal server error' });
            }
        }
    });


    // ── Health check ───────────────────────────────────────────────────────

    app.get('/health', (_req: Request, res: Response) => {
        res.json({ status: 'ok', transport: 'http', version: '1.0.0' });
    });

    // ── Start server ───────────────────────────────────────────────────────

    app.listen(PORT, HOST, () => {
        console.error(`MCP server listening on http://${HOST}:${PORT}`);
        console.error(`  Streamable HTTP : POST http://${HOST}:${PORT}/mcp`);
        console.error(`  Health          : GET  http://${HOST}:${PORT}/health`);
    });

    process.on('SIGINT', () => process.exit(0));
}

// ─── Entrypoint ────────────────────────────────────────────────────────────
//
// Transport is selected via the MCP_TRANSPORT environment variable:
//   MCP_TRANSPORT=stdio  node dist/index.js   (default)
//   MCP_TRANSPORT=http   node dist/index.js

(async () => {
    try {
        getConfig(); // Validate SAP configuration before starting

        const transport = (process.env.MCP_TRANSPORT ?? 'stdio').toLowerCase();

        if (transport === 'http') {
            await runHttp();
        } else {
            await runStdio();
        }
    } catch (error) {
        console.error('Failed to start server:', error instanceof Error ? error.message : error);
        process.exit(1);
    }
})();