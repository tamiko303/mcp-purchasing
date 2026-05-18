import { makeRestRequest, getBaseUrl } from './utils';
import { formatScheduleLine, formatPOItem, aggregateMovements, aggregateInvoices } from './formatters';
import { buildODataUrl } from './odata.builder';

const MOVEMENT_TYPE_GR          = '101';
const MOVEMENT_TYPE_GR_REVERSAL = '102';

export async function fetchScheduleLines(from: string, to: string) {
    const baseUrl = String(await getBaseUrl());
    const url = buildODataUrl(baseUrl, '/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderScheduleLine', {
        filter: `ScheduleLineDeliveryDate ge datetime'${from}T00:00:00'`
              + ` and ScheduleLineDeliveryDate le datetime'${to}T23:59:59'`,
        select: [
            'PurchasingDocument', 'PurchasingDocumentItem', 'ScheduleLine',
            'ScheduleLineDeliveryDate', 'ScheduleLineOrderQuantity', 'PurchaseOrderQuantityUnit',
        ],
    });
    const resp = await makeRestRequest(url, 'GET', 30000);
    return (resp.data?.d?.results ?? []).map(formatScheduleLine);
}

export async function fetchPOItemDetails(po: string, item: string) {
    const baseUrl = String(await getBaseUrl());
    const url = buildODataUrl(
        baseUrl,
        `/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderItem(PurchaseOrder='${encodeURIComponent(po)}',PurchaseOrderItem='${encodeURIComponent(item)}')`,
        {
            expand: ['to_PurchaseOrder'],
            select: [
                'PurchaseOrder', 'PurchaseOrderItem', 'Material', 'PurchaseOrderItemText',
                'OrderQuantity', 'PurchaseOrderQuantityUnit', 'NetPriceAmount', 'DocumentCurrency',
                'to_PurchaseOrder/Supplier',
            ],
        }
    );
    const resp = await makeRestRequest(url, 'GET', 15000);
    const d    = resp.data?.d;
    return d ? formatPOItem(po, item, d) : null;
}

export async function fetchGoodsReceipts(po: string, item: string) {
    const baseUrl = String(await getBaseUrl());
    const url = buildODataUrl(baseUrl, '/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentItem', {
        filter: `PurchaseOrder eq '${po}'`
              + ` and PurchaseOrderItem eq '${item}'`
              + ` and (GoodsMovementType eq '${MOVEMENT_TYPE_GR}'`
              + ` or GoodsMovementType eq '${MOVEMENT_TYPE_GR_REVERSAL}')`,
        select: [
            'PurchaseOrder', 'PurchaseOrderItem', 'GoodsMovementType',
            'QuantityInEntryUnit', 'EntryUnit', 'GdsMvtExtAmtInCoCodeCrcy',
            'CompanyCodeCurrency', 'GoodsMovementIsCancelled', 'DebitCreditCode',
        ],
    });
    const resp  = await makeRestRequest(url, 'GET', 15000);
    return aggregateMovements(resp.data?.d?.results ?? []);
}

export async function fetchSupplierInvoices(po: string, item: string) {
    const baseUrl = String(await getBaseUrl());
    const url = buildODataUrl(baseUrl, '/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV/A_SuplrInvcItemPurOrdRef', {
        filter: `PurchaseOrder eq '${po}' and PurchaseOrderItem eq '${item}'`,
        select: [
            'PurchaseOrder', 'PurchaseOrderItem', 'QuantityInPurchaseOrderUnit',
            'SupplierInvoiceItemAmount', 'DocumentCurrency', 'IsSubsequentDebitCredit',
        ],
    });
    const resp  = await makeRestRequest(url, 'GET', 15000);
    return aggregateInvoices(resp.data?.d?.results ?? []);
}