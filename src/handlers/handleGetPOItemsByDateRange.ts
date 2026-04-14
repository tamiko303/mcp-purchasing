import { McpError, ErrorCode } from '../lib/utils';
import { makeRestRequest, return_error, getBaseUrl } from '../lib/utils';
import { POItemData, GRData, ScheduleLine } from '../models/poItems';

// Types of product movement
const MOVEMENT_TYPE_GR          = '101'; // Goods Receipt — delivery
const MOVEMENT_TYPE_GR_REVERSAL = '102'; // Reversal GR

export async function handleGetPOItemsByDateRange(args: any) {
    try {
        if (!args?.from || !args?.to) {
            throw new McpError(
                ErrorCode.InvalidParams,
                "Parameters 'from' and 'to' are required (format: YYYY-MM-DD)"
            );
        }

        const baseUrl = await getBaseUrl();

        // ── 1. Schedule Lines (EKET) — Filter by delivery date
        const filter = `ScheduleLineDeliveryDate ge datetime'${args.from}T00:00:00'`
                     + ` and ScheduleLineDeliveryDate le datetime'${args.to}T23:59:59'`;

        const scheduleUrl = `${baseUrl}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV/A_PurchaseOrderScheduleLine`
            + `?$format=json`
            + `&$filter=${encodeURIComponent(filter)}`
            + `&$select=PurchasingDocument,PurchasingDocumentItem,ScheduleLine`
            + `,ScheduleLineDeliveryDate,ScheduleLineOrderQuantity,PurchaseOrderQuantityUnit`;

        const scheduleResp = await makeRestRequest(scheduleUrl, 'GET', 30000);
        const scheduleLines: ScheduleLine[] = (scheduleResp.data?.d?.results ?? []).map((sl: any) => ({
            purchasingDocument:     sl.PurchasingDocument,
            purchasingDocumentItem: sl.PurchasingDocumentItem,
            scheduleLine:           sl.ScheduleLine,
            deliveryDate:           sl.ScheduleLineDeliveryDate,
            scheduledQuantity:      parseFloat(sl.ScheduleLineOrderQuantity) || 0,
            unit:                   sl.PurchaseOrderQuantityUnit,
        }));

        if (scheduleLines.length === 0) {
            return {
                isError: false,
                content: [{
                    type: 'text',
                    text: JSON.stringify(JSON.stringify({ items: [] }))
            }]
        };
        }

        // ── 2. Unique pairs PO + Item
        const poItemMap = new Map<string, { po: string; item: string }>();
        for (const sl of scheduleLines) {
            const key = `${sl.purchasingDocument}_${sl.purchasingDocumentItem}`;
            if (!poItemMap.has(key)) {
                poItemMap.set(key, { po: sl.purchasingDocument, item: sl.purchasingDocumentItem });
            }
        }
        const pairs = Array.from(poItemMap.values());

        // ── 3. PO Items (EKPO) + header with supplier - parallel
        const itemsData = new Map<string, POItemData>();

        const BATCH = 10;
        for (let i = 0; i < pairs.length; i += BATCH) {
            await Promise.all(
                pairs.slice(i, i + BATCH).map(async ({ po, item }) => {
                    try {
                        const url = `${baseUrl}/sap/opu/odata/sap/API_PURCHASEORDER_PROCESS_SRV`
                            + `/A_PurchaseOrderItem(PurchaseOrder='${encodeURIComponent(po)}',PurchaseOrderItem='${encodeURIComponent(item)}')`
                            + `?$format=json`
                            + `&$expand=to_PurchaseOrder`
                            + `&$select=PurchaseOrder,PurchaseOrderItem,Material,PurchaseOrderItemText`
                            + `,OrderQuantity,PurchaseOrderQuantityUnit,NetPriceAmount,DocumentCurrency`
                            + `,to_PurchaseOrder/Supplier`;

                        const resp = await makeRestRequest(url, 'GET', 15000);
                        const d = resp.data?.d;
                        if (d) {
                            itemsData.set(`${po}_${item}`, {
                                supplier:            d.to_PurchaseOrder?.Supplier ?? '',
                                material:            d.Material ?? '',
                                materialDescription: d.PurchaseOrderItemText ?? '',
                                orderedQuantity:     parseFloat(d.OrderQuantity) || 0,
                                unit:                d.PurchaseOrderQuantityUnit ?? '',
                                netPriceAmount:      parseFloat(d.NetPriceAmount) || 0,
                                currency:            d.DocumentCurrency ?? '',
                            });
                        }
                    } catch { /* position unavailable - skip */ }
                })
            );
        }

        // ── 4. Material Documents (EKBE (analog) — GR for each PO+Item pair ─
        // Filter by PurchaseOrder + PurchaseOrderItem + GoodsMovementType
        // OData v2 allows filtering A_MaterialDocumentItem directly
        const grData = new Map<string, GRData>();

        for (let i = 0; i < pairs.length; i += BATCH) {
            await Promise.all(
                pairs.slice(i, i + BATCH).map(async ({ po, item }) => {
                    try {
                        // Movements 101 (GR) and 102 (reversal) for this order position
                        const grFilter = `PurchaseOrder eq '${po}'`
                            + ` and PurchaseOrderItem eq '${item}'`
                            + ` and (GoodsMovementType eq '${MOVEMENT_TYPE_GR}'`
                            + ` or GoodsMovementType eq '${MOVEMENT_TYPE_GR_REVERSAL}')`;

                        const grUrl = `${baseUrl}/sap/opu/odata/sap/API_MATERIAL_DOCUMENT_SRV/A_MaterialDocumentItem`
                            + `?$format=json`
                            + `&$filter=${encodeURIComponent(grFilter)}`
                            + `&$select=PurchaseOrder,PurchaseOrderItem,GoodsMovementType`
                            + `,QuantityInEntryUnit,EntryUnit,GdsMvtExtAmtInCoCodeCrcy`
                            + `,CompanyCodeCurrency,GoodsMovementIsCancelled,DebitCreditCode`;

                        const grResp = await makeRestRequest(grUrl, 'GET', 15000);
                        const items: any[] = grResp.data?.d?.results ?? [];

                        // We sum: 101 = +, 102 = - (or use DebitCreditCode: S=+, H=-)
                        let totalQty    = 0;
                        let totalAmount = 0;
                        let currency    = '';

                        for (const mi of items) {
                            if (mi.GoodsMovementIsCancelled) continue;

                            const qty    = parseFloat(mi.QuantityInEntryUnit) || 0;
                            const amount = parseFloat(mi.GdsMvtExtAmtInCoCodeCrcy) || 0;
                            // DebitCreditCode: 'S' = debit (income), 'H' = credit (reversal/return)
                            const sign = mi.DebitCreditCode === 'H' ? -1 : 1;

                            totalQty    += sign * qty;
                            totalAmount += sign * amount;
                            if (!currency && mi.CompanyCodeCurrency) {
                                currency = mi.CompanyCodeCurrency;
                            }
                        }

                        grData.set(`${po}_${item}`, {
                            deliveredQuantity: totalQty,
                            deliveredAmount:   totalAmount,
                            currency,
                        });
                    } catch { /* no movement - leave zeros */ }
                })
            );
        }

        const invoiceData = new Map<string, { invoicedQuantity: number; invoicedAmount: number; currency: string }>();

        for (let i = 0; i < pairs.length; i += BATCH) {
            await Promise.all(
                pairs.slice(i, i + BATCH).map(async ({ po, item }) => {
                    try {
                        const invFilter = `PurchaseOrder eq '${po}' and PurchaseOrderItem eq '${item}'`;

                        const invUrl = `${baseUrl}/sap/opu/odata/sap/API_SUPPLIERINVOICE_PROCESS_SRV/A_SuplrInvcItemPurOrdRef`
                            + `?$format=json`
                            + `&$filter=${encodeURIComponent(invFilter)}`
                            + `&$select=PurchaseOrder,PurchaseOrderItem,QuantityInPurchaseOrderUnit`
                            + `,SupplierInvoiceItemAmount,DocumentCurrency,IsSubsequentDebitCredit`;

                        const invResp = await makeRestRequest(invUrl, 'GET', 15000);
                        const invItems: any[] = invResp.data?.d?.results ?? [];

                        let totalQty    = 0;
                        let totalAmount = 0;
                        let currency    = '';

                        for (const inv of invItems) {
                            // IsSubsequentDebitCredit: 'X' = subsequent debits/credits
                            // Regular invoices and credit notes are summed by the sum sign
                            const qty    = parseFloat(inv.QuantityInPurchaseOrderUnit) || 0;
                            const amount = parseFloat(inv.SupplierInvoiceItemAmount)   || 0;

                            totalQty    += qty;
                            totalAmount += amount;

                            if (!currency && inv.DocumentCurrency) {
                                currency = inv.DocumentCurrency;
                            }
                        }

                        invoiceData.set(`${po}_${item}`, {
                            invoicedQuantity: totalQty,
                            invoicedAmount:   totalAmount,
                            currency,
                        });
                    } catch { /* no invoices - leave zeros */ }
                })
            );
        }

        // ── 5. Result
        const resultMap = new Map<string, any>();

        for (const sl of scheduleLines) {
            const key      = `${sl.purchasingDocument}_${sl.purchasingDocumentItem}`;
            const itemData = itemsData.get(key);
            const gr       = grData.get(key);

            const inv = invoiceData.get(key);

            if (!resultMap.has(key)) {
                resultMap.set(key, {
                    purchaseOrder:     sl.purchasingDocument,
                    purchaseOrderItem: sl.purchasingDocumentItem,

                    // Поставщик
                    supplier: itemData?.supplier ?? '',

                    // Материал
                    material:            itemData?.material ?? '',
                    materialDescription: itemData?.materialDescription ?? '',

                    // Order
                    orderedQuantity: itemData?.orderedQuantity ?? 0,
                    unit:            itemData?.unit ?? sl.unit,
                    netPriceAmount:  itemData?.netPriceAmount ?? 0,
                    currency:        itemData?.currency ?? '',

                    // Supplied (from GR documents, type 101/102)
                    deliveredQuantity: gr?.deliveredQuantity ?? 0,
                    deliveredAmount:   gr?.deliveredAmount   ?? 0,
                    grCurrency:        gr?.currency          ?? '',

                    // Invoiced
                    invoicedQuantity: inv?.invoicedQuantity ?? 0,
                    invoicedAmount:   inv?.invoicedAmount   ?? 0,
                    invoiceCurrency:  inv?.currency         ?? '',

                    // Delivery schedule lines
                    scheduleLines: [],
                });
            }

            resultMap.get(key).scheduleLines.push({
                scheduleLine:      sl.scheduleLine,
                deliveryDate:      sl.deliveryDate,
                scheduledQuantity: sl.scheduledQuantity,
                unit:              sl.unit,
            });
        }

        return {
            isError: false,
            content: [{
                type: 'text',
                text: JSON.stringify({
                        items: Array.from(resultMap.values())
                      })
            }]
        };

    } catch (error) {
        return return_error(error);
    }
}
