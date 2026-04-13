import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';
import axios, { AxiosError, AxiosInstance } from 'axios';
import { Agent } from 'https';
import { AxiosResponse } from 'axios';
import { getConfig, SapConfig } from '../index'; // getConfig needs to be exported from index.ts

export { McpError, ErrorCode, AxiosResponse };

import { TableRow, GetTableContentsArgs, GetTableContentsResult } from '../models/soap';
import * as convert from "xml-js";

export function return_response(response: AxiosResponse) {
    return {
        isError: false,
        content: [{
            type: 'text',
            text: response.data
        }]
    };
}
export function return_error(error: any) {
    return {
        isError: true,
        content: [{
            type: 'text',
            text: `Error: ${error instanceof AxiosError ? String(error.response?.data)
                : error instanceof Error ? error.message
                    : String(error)}`
        }]
    };
}

let axiosInstance: AxiosInstance | null = null;
export function createAxiosInstance() {
    if (!axiosInstance) {
        axiosInstance = axios.create({
            httpsAgent: new Agent({
                rejectUnauthorized: false // Allow self-signed certificates
            })
        });
    }
    return axiosInstance;
}

// Cleanup function for tests
export function cleanup() {
    if (axiosInstance) {
        // Clear any interceptors
        const reqInterceptor = axiosInstance.interceptors.request.use((config) => config);
        const resInterceptor = axiosInstance.interceptors.response.use((response) => response);
        axiosInstance.interceptors.request.eject(reqInterceptor);
        axiosInstance.interceptors.response.eject(resInterceptor);
    }
    axiosInstance = null;
    config = undefined;
    csrfToken = null;
    cookies = null;
}

let config: SapConfig | undefined;
let csrfToken: string | null = null;
let cookies: string | null = null; // Variable to store cookies

export async function getBaseUrl() {
    if (!config) {
        config = getConfig();
    }
    const { url } = config;
    try {
        const urlObj = new URL(url);
        const baseUrl = Buffer.from(`${urlObj.origin}`);
        return baseUrl;
    } catch (error) {
        const errorMessage = `Invalid URL in configuration: ${error instanceof Error ? error.message : error}`;
        throw new Error(errorMessage);
    }
}

export async function getAuthHeaders() {
    if (!config) {
        config = getConfig();
    }
    const { username, password, client } = config;
    const auth = Buffer.from(`${username}:${password}`).toString('base64'); // Create Basic Auth string
    return {
        'Authorization': `Basic ${auth}`, // Basic Authentication header
        'X-SAP-Client': client            // SAP client header
    };
}

async function fetchCsrfToken(url: string): Promise<string> {
    try {
        const response = await createAxiosInstance()({
            method: 'GET',
            url,
            headers: {
                ...(await getAuthHeaders()),
                'x-csrf-token': 'fetch'
            }
        });

        const token = response.headers['x-csrf-token'];
        if (!token) {
            throw new Error('No CSRF token in response headers');
        }

        // Extract and store cookies
        if (response.headers['set-cookie']) {
            cookies = response.headers['set-cookie'].join('; ');
        }

        return token;
    } catch (error) {
        // Even if the request fails, try to get token from error response
        if (error instanceof AxiosError && error.response?.headers['x-csrf-token']) {
            const token = error.response.headers['x-csrf-token'];
            if (token) {
                // Extract and store cookies from the error response as well
                if (error.response.headers['set-cookie']) {
                    cookies = error.response.headers['set-cookie'].join('; ');
                }
                return token;
            }
        }
        // If we couldn't get token from error response either, throw the original error
        throw new Error(`Failed to fetch CSRF token: ${error instanceof Error ? error.message : String(error)}`);
    }
}

export async function makeRestRequest(url: string, method: string, timeout: number, data?: any, params?: any) {
    // For POST/PUT requests, ensure we have a CSRF token
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && !csrfToken) {
        try {
            csrfToken = await fetchCsrfToken(url);
        } catch (error) {
            throw new Error('CSRF token is required for POST/PUT requests but could not be fetched');
        }
    }

    const requestHeaders = {
        ...(await getAuthHeaders())
    };

    // Add CSRF token for POST/PUT requests
    if ((method === 'POST' || method === 'PUT' || method === 'PATCH') && csrfToken) {
        requestHeaders['x-csrf-token'] = csrfToken;
    }

    // Add cookies if available
    if (cookies) {
        requestHeaders['Cookie'] = cookies;
    }

    const config: any = {
        method,
        url,
        headers: requestHeaders,
        timeout,
        params: params
    };

    // Include data in the request configuration if provided
    if (data) {
        config.data = data;
    }

    try {
        const response = await createAxiosInstance()(config);
        return response;
    } catch (error) {
        // If we get a 403 with "CSRF token validation failed", try to fetch a new token and retry
        if (error instanceof AxiosError && error.response?.status === 403 &&
            error.response.data?.includes('CSRF')) {
            csrfToken = await fetchCsrfToken(url);
            config.headers['x-csrf-token'] = csrfToken;
            return await createAxiosInstance()(config);
        }
        throw error;
    }
}

export async function makeSoapRequest(url: string, method: string, timeout: number, body?: any) {

    const requestHeaders = {
        "Content-Type": "text/xml; charset=utf-8",
        ...(await getAuthHeaders())
    };

    const config: any = {
        method,
        url,
        headers: requestHeaders,
        timeout,
        data: body
    };

    try {
        const response = await createAxiosInstance()(config);
        return response;
    } catch (error) {
        throw error;
    }

}

export function buildSoapEnvelope(tableName: string, args: GetTableContentsArgs): string {
  const maxRows = args.max_rows ?? 100;
  const rowSkip = args.row_skip ?? 0;

  // FIELDS table
  const rawFields = args.fields ?? [];
  const fieldsArray = Array.isArray(rawFields) 
  ? rawFields 
  : typeof rawFields === 'string' 
      ? JSON.parse(rawFields) 
      : [];

  const fieldsXml = fieldsArray
    .map(
      (f) => `
        <item>
          <FIELDNAME>${escapeXml(f)}</FIELDNAME>
        </item>`
    )
    .join('');

  // Forming WHERE conditions (OPTIONS table) - SAP accepts strings up to 72 characters
  const whereChunks = chunkString(args.where_clause ?? '', 72);
  const optionsXml = whereChunks
    .map(
      (chunk) => `
        <item>
          <TEXT>${escapeXml(chunk)}</TEXT>
        </item>`
    )
    .join('');

  return `<?xml version="1.0" encoding="UTF-8"?>
    <soapenv:Envelope
    xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"
    xmlns:urn="urn:sap-com:document:sap:rfc:functions">
    <soapenv:Header/>
    <soapenv:Body>
        <urn:RFC_READ_TABLE>
        <QUERY_TABLE>${escapeXml(tableName)}</QUERY_TABLE>
        <DELIMITER>|</DELIMITER>
        <NO_DATA></NO_DATA>
        <ROWSKIPS>${rowSkip}</ROWSKIPS>
        <ROWCOUNT>${maxRows}</ROWCOUNT>
        <OPTIONS>${optionsXml}</OPTIONS>
        <FIELDS>${fieldsXml}</FIELDS>
        <DATA/>
        </urn:RFC_READ_TABLE>
    </soapenv:Body>
    </soapenv:Envelope>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function chunkString(str: string, size: number): string[] {
    if (!str) return [];
    const chunks: string[] = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

// ─── Parse SOAP-response ───
export function parseSoapResponse(xml: string): GetTableContentsResult {
  // xml-js synchronous, compact:true - the most convenient structure for navigation
  const parsed = convert.xml2js(xml, {
    compact: true,          // { TagName: { _text: "...", ChildTag: {...} } }
    ignoreComment: true,
    ignoreDeclaration: true,
    nativeType: false,      // We don't convert numbers automatically—SAP may return "0001"
    trim: true,
  }) as any;

  // Remove namespace prefixes manually (xml-js preserves them)
  // "soapenv:Envelope" → look for a key containing "Envelope"
  const envelope = findKey(parsed, 'Envelope');
  const body     = findKey(envelope, 'Body');
  const rfc      = findKey(body, 'RFC_READ_TABLEResponse') ??
                   findKey(body, 'RFC_READ_TABLE.Response');

  if (!rfc) {
    throw new Error('Could not find RFC_READ_TABLE response body in SOAP envelope');
  }

  // ── FIELDS ──
  const rawFields = normalizeToArray(findKey(rfc, "FIELDS")?.item);

  const fields = rawFields.map((f: any) => ({
    fieldName:   getText(f.FIELDNAME),
    type:        getText(f.TYPE),
    length:      parseInt(getText(f.LENGTH) || "0", 10),
    description: getText(f.FIELDTEXT),
  }));

  // ── DATA — SAP returns strings with the separator "|" ──
  const rawData = normalizeToArray(findKey(rfc, "DATA")?.item);

  const rows: TableRow[] = rawData.map((d: any) => {
    const waSplit = getText(d.WA).split("|");
    const row: TableRow = {};
    fields.forEach((field, index) => {
      row[field.fieldName] = (waSplit[index] ?? "").trim();
    });
    return row;
  });

  return { fields, rows, totalRows: rows.length };
}

// ─── Helpers ────

// XML-js in compact mode stores text in the _text property
function getText(node: any): string {
  if (!node) return "";
  if (typeof node._text === "string") return node._text.trim();
  return "";
}

// Looks up an object key by suffix (ignoring namespace prefixes like "ns:")
function findKey(obj: any, suffix: string): any {
  if (!obj || typeof obj !== "object") return undefined;
  const key = Object.keys(obj).find((k) => k === suffix || k.endsWith(`:${suffix}`));
  return key ? obj[key] : undefined;
}

// compact mode: single <item> → object, multiple → array; normalize
function normalizeToArray<T>(value: T | T[] | undefined): T[] {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

