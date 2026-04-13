import { McpError, ErrorCode, AxiosResponse } from '../lib/utils';
import { makeAdtRequest, return_error, return_response, getBaseUrl } from '../lib/utils';

export async function handleGetBusinessPartner(args: any) {
    try {
        if (!args?.partner_number) {
            throw new McpError(ErrorCode.InvalidParams, 'Partner number is required');
        }
        const encodedPartnerNumber = encodeURIComponent(args.partner_number);
        const url = `${await getBaseUrl()}/sap/opu/odata/sap/api_business_partner/A_BusinessPartner('${encodedPartnerNumber}')?$format=json`;
        const response = await makeAdtRequest(url, 'GET', 30000);
        response.data = JSON.stringify(response.data);
        return return_response(response);
    } catch (error) {
        return return_error(error);
    }
}