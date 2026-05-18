import { McpError, ErrorCode, return_error } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import { fetchSupplierInvoices } from '../../lib/purchasing.core';

/**
 * Возвращает итоговое выставленное количество и сумму по счетам поставщика
 * для одной позиции PO.
 * Используй для three-way match или проверки статуса invoicing.
 */
export async function handleGetSupplierInvoices(args: any) {
    try {
        if (!args?.purchaseOrder || !args?.purchaseOrderItem) {
            throw new McpError(ErrorCode.InvalidParams,
                "Parameters 'purchaseOrder' and 'purchaseOrderItem' are required");
        }
        const inv = await fetchSupplierInvoices(args.purchaseOrder, args.purchaseOrderItem);
        return toMcpResult({
            purchaseOrder:     args.purchaseOrder,
            purchaseOrderItem: args.purchaseOrderItem,
            invoices:          inv,
        });
    } catch (error) {
        return return_error(error);
    }
}