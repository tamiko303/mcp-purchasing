import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { fetchGoodsReceipts, fetchPOItemDetails, fetchScheduleLines } from "../../lib/purchasing.core";
import { toMcpResult } from "../../lib/formatters";
import { return_error } from "../../lib/utils";

export async function handleGetOpenPOItems(args: any) {
try {

    if (!args?.from || !args?.to)
              throw new McpError(ErrorCode.InvalidParams, 
                                `Parameters "from" and "to" are required (YYYY-MM-DD)`);

    const scheduleLines = await fetchScheduleLines(args.from, args.to);
        if (scheduleLines.length === 0)
            return toMcpResult({ items:[], totalOpenItems:0, overdueCount:0 });
    
        // Уникальные пары PO + Item
        const poItemMap = new Map<string, { po: string; item: string; deliveryDate: string; }>();
        
        for (const sl of scheduleLines) {
            const key = `${sl.purchaseOrder}_${sl.purchaseOrderItem}`;

            // Берём ближайшую дату поставки
            if (!poItemMap.has(key)) {
                poItemMap.set(key, {
                    po: sl.purchaseOrder,
                    item: sl.purchaseOrderItem,
                    deliveryDate: sl.deliveryDate,
                });
            }
        }

        const pairs = Array.from(poItemMap.values());
 
        const today     = new Date().toISOString().split('T')[0];
        const openItems: any[] = [];
 
        const BATCH = 10;
        const resultMap = new Map<string, any>();

        
        for (let i = 0; i < pairs.length; i += BATCH) {
            const results = await Promise.allSettled(
                pairs.slice(i, i + BATCH).map(async ({ po, item, deliveryDate }) => {
                    const key = `${po}_${item}`;
 
                    // Параллельно: мастер-данные + GR
                    const [itemData, gr] = await Promise.allSettled([
                        fetchPOItemDetails(po, item),
                        fetchGoodsReceipts(po, item),
                    ]);
                    const d   = itemData.status==='fulfilled' ? itemData.value : null;
                    const grV = gr.status ==='fulfilled' ? gr.value  : null;
 
                    const orderedQty   = Number(d?.orderedQuantity ?? 0);
                    const deliveredQty = Number(grV?.deliveredQuantity ?? 0);
                    const openQty = orderedQty - deliveredQty;
 
                    if (openQty <= 0) return null; // позиция закрыта
 
                    return {
                        purchaseOrder: po,  
                        purchaseOrderItem: item,

                        supplier:            d?.supplier            ?? '',
                        material:            d?.material            ?? '',
                        materialDescription: d?.materialDescription ?? '',

                        orderedQty, 
                        deliveredQty, 
                        openQty,

                        openPct: orderedQty > 0
                            ? Math.round((openQty / orderedQty) * 100) : 0,

                        unit:           d?.unit           ?? '',
                        netPriceAmount: d?.netPriceAmount ?? 0,
                        currency:       d?.currency       ?? '',

                        scheduledDeliveryDate: deliveryDate,

                        // Просрочка
                        isOverdue: deliveryDate < today,
                    };
                })
            );

for (const r of results)
                if (r.status==='fulfilled' && r.value!==null)
                    openItems.push(r.value);
        }
 
        // Просроченные вверх, потом по дате поставки
        openItems.sort((a, b) => {
            if (a.isOverdue !== b.isOverdue) return a.isOverdue ? -1 : 1;
            return a.scheduledDeliveryDate.localeCompare(b.scheduledDeliveryDate);
        });
 
        return toMcpResult({
            period:         { from: args.from, to: args.to },
            totalOpenItems: openItems.length,
            overdueCount:   openItems.filter(i => i.isOverdue).length,
            items:          openItems,
        });

 
        } catch (error) {
            return return_error(error);
    }

}