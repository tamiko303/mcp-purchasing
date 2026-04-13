import { McpError, ErrorCode, makeAdtRequest } from '../lib/utils';
import { getBaseUrl, return_response, return_error } from '../lib/utils';

export async function handleSetSupplierPurchasingBlock(args: any) {
    try {
        if (!args?.supplier) {
            throw new McpError(ErrorCode.InvalidParams, 'supplier is required');
        }
        if (!args?.purchasing_org) {
            throw new McpError(ErrorCode.InvalidParams, 'purchasing_org is required');
        }
        if (typeof args?.blocked !== 'boolean') {
            throw new McpError(ErrorCode.InvalidParams, 'blocked (boolean) is required');
        }

        const encodedSupplier     = encodeURIComponent(args.supplier);
        const encodedPurchOrg     = encodeURIComponent(args.purchasing_org);
        const baseUrl             = await getBaseUrl();
        
        const url = `${baseUrl}/sap/opu/odata/sap/api_business_partner/A_SupplierPurchasingOrg(Supplier='${encodedSupplier}',PurchasingOrganization='${encodedPurchOrg}')`;

        const supplierPOBody = { d: { PurchasingIsBlockedForSupplier: args.blocked } };

        const patchResponse = await makeAdtRequest( url, 'PATCH', 30000,  supplierPOBody );

        const action = args.blocked ? 'blocked' : 'unblocked';
        const parseData = {
            status:  patchResponse.status,
            message: `Supplier '${args.supplier}' / PurchasingOrg '${args.purchasing_org}': purchases ${action}`,
            data:    patchResponse.data ?? null,
        };
        return {
            isError: false,
            content: [{
                type: 'text',
                text: JSON.stringify(parseData)
            }]
        };

    } catch (error) {
        return return_error(error);
    }
}