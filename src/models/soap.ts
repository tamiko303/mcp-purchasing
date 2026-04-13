// Type for input arguments
export interface GetTableContentsArgs {
  table_name: string;
  max_rows?: number;
  fields?: string[];       
  where_clause?: string;  
  row_skip?: number;    
}

// Type for answer
export interface TableRow {
  [field: string]: string;
}

export interface GetTableContentsResult {
  fields: Array<{ fieldName: string; type: string; length: number; description: string }>;
  rows: TableRow[];
  totalRows: number;
}