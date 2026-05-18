import { McpError, ErrorCode, return_error } from '../../lib/utils';
import { toMcpResult } from '../../lib/formatters';
import {
    fetchScheduleLines,
    fetchPOItemDetails,
    fetchGoodsReceipts,
    fetchSupplierInvoices,
} from '../../lib/purchasing.core';

/**
 * Сводный инструмент: полная картина по всем позициям PO,
 * у которых есть строки расписания в указанном диапазоне дат.
 * Включает: мастер-данные, GR, счета, строки расписания.
 *
 * Для одной позиции или одного типа данных используй атомарные инструменты.
 */
export async function handleGetPOItemsByDateRange(args: any) {
    try {
        if (!args?.from || !args?.to) {
            throw new McpError(ErrorCode.InvalidParams,
                "Parameters 'from' and 'to' are required (format: YYYY-MM-DD)");
        }

        // 1. Schedule lines → уникальные пары PO + Item
        const scheduleLines = await fetchScheduleLines(args.from, args.to);
        if (scheduleLines.length === 0) return toMcpResult({ items: [] });

        const poItemMap = new Map<string, { po: string; item: string }>();
        for (const sl of scheduleLines) {
            const key = `${sl.purchaseOrder}_${sl.purchaseOrderItem}`;
            if (!poItemMap.has(key)) poItemMap.set(key, { po: sl.purchaseOrder, item: sl.purchaseOrderItem });
        }
        const pairs = Array.from(poItemMap.values());

        // 2. Параллельное обогащение батчами по 10
        const BATCH = 10;
        const resultMap = new Map<string, any>();

        for (let i = 0; i < pairs.length; i += BATCH) {
            await Promise.all(
                pairs.slice(i, i + BATCH).map(async ({ po, item }) => {
                    const key = `${po}_${item}`;

                    // Promise.allSettled: если один SAP-сервис недоступен,
                    // остальные данные всё равно вернутся
                    const [itemData, gr, inv] = await Promise.allSettled([
                        fetchPOItemDetails(po, item),
                        fetchGoodsReceipts(po, item),
                        fetchSupplierInvoices(po, item),
                    ]);

                    const d   = itemData.status === 'fulfilled' ? itemData.value : null;
                    const grV = gr.status       === 'fulfilled' ? gr.value       : null;
                    const inV = inv.status      === 'fulfilled' ? inv.value      : null;

                    resultMap.set(key, {
                        purchaseOrder:       po,
                        purchaseOrderItem:   item,
                        supplier:            d?.supplier            ?? '',
                        material:            d?.material            ?? '',
                        materialDescription: d?.materialDescription ?? '',
                        orderedQuantity:     d?.orderedQuantity     ?? 0,
                        unit:                d?.unit                ?? '',
                        netPriceAmount:      d?.netPriceAmount      ?? 0,
                        currency:            d?.currency            ?? '',
                        deliveredQuantity:   grV?.deliveredQuantity ?? 0,
                        deliveredAmount:     grV?.deliveredAmount   ?? 0,
                        grCurrency:          grV?.currency          ?? '',
                        invoicedQuantity:    inV?.invoicedQuantity  ?? 0,
                        invoicedAmount:      inV?.invoicedAmount    ?? 0,
                        invoiceCurrency:     inV?.currency          ?? '',
                        scheduleLines:       [],
                    });
                })
            );
        }

        // 3. Добавляем строки расписания
        for (const sl of scheduleLines) {
            const key = `${sl.purchaseOrder}_${sl.purchaseOrderItem}`;
            resultMap.get(key)?.scheduleLines.push({
                scheduleLine:      sl.scheduleLine,
                deliveryDate:      sl.deliveryDate,
                scheduledQuantity: sl.scheduledQuantity,
                unit:              sl.unit,
            });
        }

        return toMcpResult({ items: Array.from(resultMap.values()) });
    } catch (error) {
        return return_error(error);
    }
}