import { McpError, ErrorCode, makeRestRequest, return_error, getBaseUrl } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import { buildODataUrl, ODataOptions } from '../../lib/odata.builder';

const ALLOWED_ENTITIES: Record<string, string> = {
    'ScheduleLines':     '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderScheduleLine',
    'POItems':           '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem',
    'POHeaders':         '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrder',
    'MaterialDocuments': '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentItem',
    'SupplierInvoices':  '/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV/A_SuplrInvcItemPurOrdRef',
};

/**
 * Гибкий низкоуровневый OData-запрос к SAP.
 * Используй когда стандартные инструменты не покрывают сценарий:
 * нестандартная фильтрация, дополнительные поля, $expand, $top для разведки.
 * Возвращает сырой ответ SAP OData v2 без агрегации.
 */
export async function handleQueryPurchasingApi(args: any) {
    try {
        if (!args?.entity) {
            throw new McpError(ErrorCode.InvalidParams,
                `Parameter 'entity' is required. Allowed: ${Object.keys(ALLOWED_ENTITIES).join(', ')}`);
        }
        const path = ALLOWED_ENTITIES[args.entity];
        if (!path) {
            throw new McpError(ErrorCode.InvalidParams,
                `Unknown entity '${args.entity}'. Allowed: ${Object.keys(ALLOWED_ENTITIES).join(', ')}`);
        }

        const top = args.top != null ? Math.min(Number(args.top), 1000) : 100;

        const opts: ODataOptions = {
            filter:  args.filter  ?? undefined,
            select:  Array.isArray(args.select)  ? args.select  : undefined,
            expand:  Array.isArray(args.expand)  ? args.expand  : undefined,
            orderby: args.orderby ?? undefined,
            top,
            skip:    args.skip ?? undefined,
        };

        const baseUrl = String(await getBaseUrl());
        const url     = buildODataUrl(baseUrl, path, opts);
        const resp    = await makeRestRequest(url, 'GET', 30000);
        const results = resp.data?.d?.results ?? resp.data?.d ?? [];

        return toMcpResult({
            entity:     args.entity,
            count:      Array.isArray(results) ? results.length : 1,
            appliedTop: top,
            results,
        });
    } catch (error) {
        return return_error(error);
    }
}