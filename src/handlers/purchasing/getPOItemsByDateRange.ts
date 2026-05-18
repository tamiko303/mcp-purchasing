import { McpError, ErrorCode, return_error } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import { fetchPOItemDetails } from '../../lib/putchasing.core';

/**
 * Возвращает мастер-данные одной позиции PO: материал, поставщик,
 * заказанное количество, цена, валюта.
 * Не содержит данных о GR или счетах.
 */
export async function handleGetPOItemDetails(args: any) {
    try {
        if (!args?.purchaseOrder || !args?.purchaseOrderItem) {
            throw new McpError(ErrorCode.InvalidParams,
                "Parameters 'purchaseOrder' and 'purchaseOrderItem' are required");
        }
        const item = await fetchPOItemDetails(args.purchaseOrder, args.purchaseOrderItem);
        return toMcpResult({ item: item ?? null });
    } catch (error) {
        return return_error(error);
    }
}