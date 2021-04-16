export interface CMSResponse {
  data: {
    items: ContentItem[];
    limit: number;
    skip: number;
    sys: Object;
    total: number;
  }
}

export interface ContentItem {
  sys: Object;
  fields: {
    brand: string;
    channel: string[];
    metaData: Object;
    name: string;
    isInternational?: string[];
  }
}

export interface CMSEndpointQueryParams {
  path: string;
  brand: string;
  channel: string;
  isInternational?: string;
  entryId?: string;
}

export interface ContentHandlerQueryParams {
  cPath: string;
  brand: string;
  preview: string;
  channel?: string;
  isInternational?: string;
  entryId: string;
}
