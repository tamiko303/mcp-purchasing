import { McpError, ErrorCode, return_error } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import { fetchGoodsReceipts } from '../../lib/purchasing.core';

/**
 * Возвращает итоговое фактически поставленное количество и сумму
 * по одной позиции PO (движения 101 = приход, 102 = сторно).
 * Реверсированные документы учитываются автоматически.
 */
export async function handleGetGoodsReceipts(args: any) {
    try {
        if (!args?.purchaseOrder || !args?.purchaseOrderItem) {
            throw new McpError(ErrorCode.InvalidParams,
                "Parameters 'purchaseOrder' and 'purchaseOrderItem' are required");
        }
        const gr = await fetchGoodsReceipts(args.purchaseOrder, args.purchaseOrderItem);
        return toMcpResult({
            purchaseOrder: args.purchaseOrder,
            purchaseOrderItem: args.purchaseOrderItem,
            goodsReceipts: gr,
        });
    } catch (error) {
        return return_error(error);
    }
}