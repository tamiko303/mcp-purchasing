export interface ODataOptions {
    select?:  string[];
    expand?:  string[];
    filter?:  string;
    top?:     number;
    skip?:    number;
    orderby?: string;
}

export function buildODataUrl(baseUrl: string, path: string, opts: ODataOptions = {}): string {
    const params: string[] = ['$format=json'];

    if (opts.select?.length)  params.push(`$select=${opts.select.join(',')}`);
    if (opts.expand?.length)  params.push(`$expand=${opts.expand.join(',')}`);
    if (opts.filter)          params.push(`$filter=${encodeURIComponent(opts.filter)}`);
    if (opts.top    != null)  params.push(`$top=${opts.top}`);
    if (opts.skip   != null)  params.push(`$skip=${opts.skip}`);
    if (opts.orderby)         params.push(`$orderby=${opts.orderby}`);

    return `${baseUrl}${path}?${params.join('&')}`;
}