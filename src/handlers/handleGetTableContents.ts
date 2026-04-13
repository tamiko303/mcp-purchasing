import { McpError, ErrorCode, makeSoapRequest } from '../lib/utils';
import { getBaseUrl, buildSoapEnvelope, parseSoapResponse, return_error } from '../lib/utils';

export async function handleGetTableContents( args: any) {
    try {
        if (!args?.table_name) {
            throw new McpError(ErrorCode.InvalidParams, 'Table name is required');
        }

        const soapBody = buildSoapEnvelope(args.table_name, args);

        // SAP SOAP endpoint for RFC call
        const url = `${await getBaseUrl()}/sap/bc/srt/rfc/sap/z_tablecontent/100/z_tablecontent/rfc_read_table`;
        
        const response = await makeSoapRequest(url, 'POST', 30000, soapBody);
        const responseText = await response.data;

        if (response.status < 200 || response.status >= 300) {
            // SAP can return a SOAP Fault with error details.
            throw new McpError(ErrorCode.InvalidParams,  `SAP return HTTP ${response.status}. Response body:\n${responseText}`
            );
        }

        // Checking for a SOAP Fault
        if (responseText.includes("<faultcode>") || responseText.includes(":faultcode>")) {
            const faultMatch = responseText.match(/<faultstring[^>]*>([^<]+)<\/faultstring>/i);
            throw new McpError(ErrorCode.InvalidParams, `SAP SOAP Fault: ${faultMatch?.[1] ?? "Unknown error"}`);
        }
        
        const parseData = parseSoapResponse(responseText);
        return {
            isError: false,
            content: [{
                type: 'text',
                text: JSON.stringify(parseData)
            }]
        };

    } catch (error) {
        // Specific error message for GetTableContents since it requires custom implementation
        return return_error(error);
    }
}
