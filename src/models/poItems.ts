
export interface ScheduleLine {
    purchasingDocument:     string;
    purchasingDocumentItem: string;
    scheduleLine:           string;
    deliveryDate:           string;
    scheduledQuantity:      number;
    unit:                   string;
}

export interface POItemData {
    supplier:            string;
    material:            string;
    materialDescription: string;
    orderedQuantity:     number;
    unit:                string;
    netPriceAmount:      number;
    currency:            string;
}

export interface GRData {
    deliveredQuantity: number;
    deliveredAmount:   number;
    currency:          string;
}