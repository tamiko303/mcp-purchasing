// Стандартный MCP-ответ
export function toMcpResult(data: unknown) {
    return {
        isError: false,
        content: [{ type: 'text', text: JSON.stringify(data) }],
    };
}

export function formatScheduleLine(sl: any) {
    return {
        purchaseOrder:     sl.PurchasingDocument,
        purchaseOrderItem: sl.PurchasingDocumentItem,
        scheduleLine:      sl.ScheduleLine,
        deliveryDate:      sl.ScheduleLineDeliveryDate,
        scheduledQuantity: parseFloat(sl.ScheduleLineOrderQuantity) || 0,
        unit:              sl.PurchaseOrderQuantityUnit,
    };
}

export function formatPOItem(po: string, item: string, d: any) {
    return {
        purchaseOrder:       po,
        purchaseOrderItem:   item,
        supplier:            d.to_PurchaseOrder?.Supplier ?? '',
        material:            d.Material ?? '',
        materialDescription: d.PurchaseOrderItemText ?? '',
        orderedQuantity:     parseFloat(d.OrderQuantity) || 0,
        unit:                d.PurchaseOrderQuantityUnit ?? '',
        netPriceAmount:      parseFloat(d.NetPriceAmount) || 0,
        currency:            d.DocumentCurrency ?? '',
    };
}

// GR: суммирует движения 101 (+) и 102 (-) с учётом DebitCreditCode
export function aggregateMovements(items: any[]) {
    let totalQty = 0, totalAmount = 0, currency = '';
    for (const mi of items) {
        if (mi.GoodsMovementIsCancelled) continue;
        const sign = mi.DebitCreditCode === 'H' ? -1 : 1;
        totalQty    += sign * (parseFloat(mi.QuantityInEntryUnit) || 0);
        totalAmount += sign * (parseFloat(mi.GdsMvtExtAmtInCoCodeCrcy) || 0);
        if (!currency && mi.CompanyCodeCurrency) currency = mi.CompanyCodeCurrency;
    }
    return { deliveredQuantity: totalQty, deliveredAmount: totalAmount, currency };
}

export function aggregateInvoices(items: any[]) {
    let totalQty = 0, totalAmount = 0, currency = '';
    for (const inv of items) {
        totalQty    += parseFloat(inv.QuantityInPurchaseOrderUnit) || 0;
        totalAmount += parseFloat(inv.SupplierInvoiceItemAmount)   || 0;
        if (!currency && inv.DocumentCurrency) currency = inv.DocumentCurrency;
    }
    return { invoicedQuantity: totalQty, invoicedAmount: totalAmount, currency };
}