import { McpError, ErrorCode, return_error } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import { fetchScheduleLines } from '../../lib/purchasing.core';

/**
 * Возвращает строки расписания поставок по диапазону дат.
 * Используй как первый шаг — даёт список пар purchaseOrder + purchaseOrderItem
 * для передачи в GetPOItemDetails, GetGoodsReceipts, GetSupplierInvoices.
 */
export async function handleGetScheduleLines(args: any) {
    try {
        if (!args?.from || !args?.to) {
            throw new McpError(ErrorCode.InvalidParams,
                "Parameters 'from' and 'to' are required (format: YYYY-MM-DD)");
        }
        const lines = await fetchScheduleLines(args.from, args.to);
        return toMcpResult({ scheduleLines: lines });
    } catch (error) {
        return return_error(error);
    }
}