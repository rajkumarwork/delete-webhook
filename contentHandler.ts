import axios from 'axios';
import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import isEmpty from 'lodash/isEmpty';
import normalizeJSON from './util/dataNormalizer';
import { ok, error } from './util/http';
import { Log, buildParams } from './util/Logger';
import { deleteContentFromCache } from './constants';
import { CMSEndpointQueryParams, CMSResponse, ContentHandlerQueryParams, ContentItem } from './interfaces';
import { Channels, International, MobileDesktop, contentfulCdnHost, contentfulPreviewHost, contentfulSpace, contentfulEnv, contentfulAccessToken, contentfulPreviewAccessToken, getContentFromCache, setContentToCache, PerfMeasurers, TIMEOUT } from './constants';

const log = new Log();
const perf = require('execution-time')();

const getCmsEndpoint = (host: string,
  accessToken: string,
  queryParams: CMSEndpointQueryParams
): string => {
  const { brand, channel, path, isInternational, entryId } = queryParams;
  let cmsQueryParams = `access_token=${accessToken}&include=10&content_type=frame&fields.brand=${brand}&fields.metaData.sys.contentType.sys.id=metaData&fields.metaData.fields.slugs[in]=${path}`;
  cmsQueryParams = channel ? cmsQueryParams.concat(`&fields.channel[in]=${channel}`) : cmsQueryParams;
  cmsQueryParams = isInternational ? cmsQueryParams : cmsQueryParams.concat(`&fields.isInternational[nin]=International`);
  let baseQuery = entryId ? `access_token=${accessToken}&sys.id=${entryId}` : cmsQueryParams;
  return `https://${host}/spaces/${contentfulSpace}/environments/${contentfulEnv}/entries?${baseQuery}`

}

const setContentToRedis = async (cacheKey, queryPath, cmsResponse) => {
  const { event, key } = PerfMeasurers.SET_CONTENT_TO_REDIS_CACHE;

  try {
    perf.start(key);
    await setContentToCache(cacheKey, JSON.stringify(cmsResponse.data));
    log.info(`EVENT: ${event}`,
      'STATUS: successfully set content to redis cache',
      buildParams(queryPath, perf.stop(key).time, new Date().getTime(), '200')
    );
  } catch (error) {
    log.error(`EVENT: ${event}`,
      `STATUS: error occurred while setting content to redis cache: ${error}`,
      buildParams(queryPath, perf.stop(key).time, new Date().getTime(), '500')
    );
  }
}

const getContentFromRedis = async (cacheKey, queryPath) => {
  const { event, key } = PerfMeasurers.GET_CONTENT_FROM_REDIS_CACHE;

  try {
    perf.start(key);
    const content = await getContentFromCache(cacheKey);
    log.info(`EVENT: ${event}`,
      'STATUS: successfully retrieved content from redis cache',
      buildParams(queryPath, perf.stop(key).time, new Date().getTime(), '200')
    );

    return JSON.parse(content);
  } catch (error) {
    log.error(`EVENT: ${event}`,
      `STATUS: error occurred while getting content from redis cache: ${error}`,
      buildParams(queryPath, perf.stop(key).time, new Date().getTime(), '500')
    );
  }
}
const handleIsInternational = (cmsResponse, queryParams): any => {
  const { channel, isInternational } = queryParams;
  const { DESKTOP, MOBILE } = Channels;
  const { INTERNATIONAL } = International;
  const { NEWMOBILE } = MobileDesktop;
  let contentItems = cmsResponse.data.items;
  if (channel === DESKTOP && !isInternational) {
    // Do Nothing
  } else if (channel === NEWMOBILE && !isInternational) {
    let mobileContent = contentItems.filter(item => item.fields.channel && item.fields.channel.includes(MOBILE));
    cmsResponse.data.items = mobileContent.length !== 0 ? mobileContent :
      contentItems.filter(item => item.fields.channel && item.fields.channel.includes(DESKTOP));
  } else if (channel === DESKTOP && isInternational === INTERNATIONAL) {
    let internationalContent = contentItems.filter(item => item.fields.isInternational && item.fields.isInternational.includes(INTERNATIONAL));
    cmsResponse.data.items = internationalContent.length !== 0 ?
      internationalContent :
      contentItems.filter(item => !item.fields.isInternational);
  } else if (channel === NEWMOBILE && isInternational === INTERNATIONAL) {
    let mobileIntlContent = contentItems.filter(item => item.fields.channel && item.fields.channel.includes(MOBILE) && item.fields.isInternational && item.fields.isInternational.includes(INTERNATIONAL));
    let mobileDomesticContent = contentItems.filter(item => item.fields.channel && item.fields.channel.includes(MOBILE) && !item.fields.isInternational);
    let desktopIntlContent = contentItems.filter(item => item.fields.channel && item.fields.channel.includes(DESKTOP) && item.fields.isInternational && item.fields.isInternational.includes(INTERNATIONAL));
    let desktopDomesticContent = contentItems.filter(item => item.fields.channel && item.fields.channel.includes(DESKTOP) && !item.fields.isInternational);
    if (mobileIntlContent.length !== 0) {
      cmsResponse.data.items = mobileIntlContent;
    } else if (mobileDomesticContent.length !== 0) {
      cmsResponse.data.items = mobileDomesticContent;
    } else if (desktopIntlContent.length !== 0) {
      cmsResponse.data.items = desktopIntlContent;
    } else if (desktopDomesticContent.length !== 0) {
      cmsResponse.data.items = desktopDomesticContent;
    }
  }
  return cmsResponse;
}

const getPreviewContent = async (cmsCallString, entryOrQueryParams) => {
  const { event, key } = PerfMeasurers.GET_PREVIEW_CONTENT;
  perf.start(key);
  let cmsResponse = { data: {} } as CMSResponse;
  try {
    cmsResponse = await axios.get(cmsCallString, { timeout: Number(TIMEOUT) });
    cmsResponse = handleIsInternational(cmsResponse, entryOrQueryParams);

    log.info(`EVENT: ${event}`,
    `STATUS: entryId: successfully retrieved data from Contentful for ID:  ${entryOrQueryParams}`,
      buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '200')
    );
  } catch (error) {
    log.info(`EVENT: ${event}`,
    `STATUS: error occurred while retriving preview content from Contentful for ID:  ${entryOrQueryParams}. Error: ${error}`,
      buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '500')
    );
  }

  return cmsResponse;
}

const getPublishedContentBySlug = async (cacheKey, queryPaths, queryParams, cmsCallString) => {
  const { event, key } = PerfMeasurers.GET_CMS_CONTENT;
  let cmsResponse = { data: {} } as CMSResponse;
  let cacheResponse: any = {};

  try {
    cacheResponse = await getContentFromRedis(cacheKey, queryPaths);
    log.info(`EVENT: ${event}`,
    `STATUS: slug: ${queryPaths}, response from cache: ${JSON.stringify(cacheResponse)}`,
    buildParams("", "", new Date().getTime(), '200'));
  } catch (error) {
    log.error(`EVENT: ${event}`,
    `STATUS: error occurred while retriving content from cache for key:  ${cacheKey}. Error: ${error}`,
      buildParams(cmsCallString, '', new Date().getTime(), '500')
    );
  }
  
  const shouldCallContentful = (cacheResponse) => {
    return null == cacheResponse || !isEmpty(cacheResponse['items']);
  }

  const getFallbackContent = (cacheResponse) => {
    if (!isEmpty(cacheResponse['items'])) {
      return cacheResponse;
    }
    return {};
  }

  if (!shouldCallContentful(cacheResponse)) {
    cmsResponse.data = cacheResponse;

    log.info(`EVENT: ${event}`,
    `STATUS: returning cached response for slug: ${queryPaths} : ${JSON.stringify(cmsResponse.data)}`,
    buildParams("", "", new Date().getTime(), '200'));  

  } else {
    try {
      perf.start(key);
      cmsResponse = await axios.get(cmsCallString, { timeout: Number(TIMEOUT) });
      log.info(`EVENT: ${event}`,
        `STATUS: received Contentful response for slug: ${queryPaths} : ${JSON.stringify(cmsResponse.data)}`,
        buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '200')
      );
    } catch (err) {
      cmsResponse.data = getFallbackContent(cacheResponse);
      log.error(`EVENT: ${event}`,
        `STATUS: Couldn't reach Contentful. Returning cached response for slug: ${queryPaths} : ${JSON.stringify(cmsResponse.data)}`,
        buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '200')
      );
    }

    try {
      await setContentToRedis(cacheKey, queryPaths, cmsResponse);
    } catch (err) {
      await deleteContentFromCache(cacheKey);

      log.error(`EVENT: ${event}`,
      `STATUS: Failed to update cache for slug: ${queryPaths}: ${JSON.stringify(cmsResponse.data)}`,
      buildParams(cmsCallString, '', new Date().getTime(), '500')
      );
    }
    try {
      cmsResponse = handleIsInternational(cmsResponse, queryParams);
    } catch (err) {
      log.error(`EVENT: ${event}`,
      `STATUS: Error occurred while applying international logic for path: ${queryPaths}`,
      buildParams(cmsCallString, '', new Date().getTime(), '500')
      );
    }
  }

  return cmsResponse;
}

const getPublishedContentByEntryId = async (cmsCallString, entryId) => {
  const { event, key }= PerfMeasurers.GET_PUBLISHED_CONTENT_BY_ENTRYID;
  let cmsResponse = { data: {} } as CMSResponse;
  try {
    perf.start(key);
    cmsResponse = await axios.get(cmsCallString, { timeout: Number(TIMEOUT) });
    cmsResponse = handleIsInternational(cmsResponse, entryId);

    log.info(`EVENT: ${event}`,
    `STATUS: entryId: successfully retrieved data from Contentful for entryId:  ${entryId}`,
    buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '200')
    );
  } catch (err) {
    log.info(`EVENT: ${event}`,
    `STATUS: entryId: successfully retrieved data from Contentful for entryId:  ${entryId}`,
    buildParams(cmsCallString, perf.stop(key).time, new Date().getTime(), '200')
    );
  }
  
  return cmsResponse;
}

const getContent = async (entryOrQueryParams, preview = '', queryPaths: string, cacheKey: string) => {
  let host = contentfulCdnHost;
  let accessToken = contentfulAccessToken;
  let cmsResponse = { data: {} } as CMSResponse;

  if (preview) {
    host = contentfulPreviewHost;
    accessToken = contentfulPreviewAccessToken;
    const cmsCallString = getCmsEndpoint(host, accessToken, entryOrQueryParams);
    cmsResponse = await getPreviewContent(cmsCallString, entryOrQueryParams);

  } else {
    const cmsCallString = getCmsEndpoint(host, accessToken, entryOrQueryParams);
    if (isEmpty(entryOrQueryParams.entryId)) {
      cmsResponse = await getPublishedContentBySlug(cacheKey, queryPaths, entryOrQueryParams, cmsCallString);
    } else {
      cmsResponse = await getPublishedContentByEntryId(cmsCallString, entryOrQueryParams.entryId);
    }
  }
  
  return cmsResponse;
}

const sortedItemFiltering = (response, requestedChannels) => {
  const sortedItems: ContentItem[] = [];
  response.data.items.forEach((content: ContentItem) => {
    content.fields && content.fields.channel[0] === requestedChannels[0] ?
      sortedItems.unshift(content) :
      sortedItems.push(content);
  });
  return sortedItems;
  
}

const getCacheKey = (brand, queryPaths, channelParam, isInternational) => {
  const internationalKey = isInternational ? isInternational : "";
  log.info(`EVENT: CACHE_KEY_INFO`,
        `STATUS: brand: ${brand}, queryPaths: ${queryPaths}, channelParam: ${channelParam}, internationalKey: ${internationalKey}`,
        buildParams(queryPaths, '', new Date().getTime(), '404')
      );
  return brand + "_" + queryPaths + "_" + channelParam + "_" + internationalKey;
}

export const slotData = async (event: APIGatewayProxyEvent, context: Context) => {
  const { cPath: queryPath, preview, channel, brand, isInternational, entryId } = event.queryStringParameters as unknown as ContentHandlerQueryParams;
  const { DESKTOP, MOBILE } = Channels;
  const channelParam = channel === MOBILE ? `${MOBILE},${DESKTOP}` : channel;

  const queryParams = {
    path: queryPath,
    channel: channelParam,
    brand,
    isInternational,
  };
  const entryIdQueryParam = {
    entryId,
  };
  const entryOrQueryParams = entryId ? entryIdQueryParam : queryParams;
  const queryPaths = entryId ? entryIdQueryParam.entryId : queryParams.path;
  const { event: normalizeJSONEvent, key } = PerfMeasurers.NORMALIZE_JSON;
  let response = { data: {} } as CMSResponse;

  let cacheKey = getCacheKey(brand, queryPaths, channelParam, isInternational);
  log.info(`EVENT: GET_CACHE_KEY`,
  `STATUS: Cache key for the request is: ${cacheKey}`,
  buildParams('', '', new Date().getTime(), '200')
  );

  context.callbackWaitsForEmptyEventLoop = false;

  try {
    const requestedChannels = channelParam && channelParam.split(',') || [];
    response = await getContent(entryOrQueryParams, preview, queryPaths, cacheKey);
    if (!response?.data?.items?.length) {
      log.error(`EVENT: DATA_NOT_FOUND`,
        `STATUS: No data found for request: ${queryPaths}`,
        buildParams(queryPaths, '', new Date().getTime(), '404')
      );
      return error(404, '', {});
    }

    const entireResponse = entryId ? response.data.items : sortedItemFiltering(response, requestedChannels);
    response.data = { ...response.data, items: entireResponse};

    perf.start(key);
    const normalizedJSON = normalizeJSON(response.data);

    log.info(`EVENT: ${normalizeJSONEvent}`,
      'STATUS: response was normalized',
      buildParams('', perf.stop(key).time, new Date().getTime(), '')
    );

    return ok(200, normalizedJSON);
  } catch (err) {
    if (!response?.data?.items?.length) {
      log.error(`EVENT: ${event}`,
        `STATUS: error occurred while retrieving data from CMS: ${err}`,
        buildParams(queryPaths, perf.stop(key).time, new Date().getTime(), '404')
      );
      return error(404, err, response?.data);
    }
    log.error(`EVENT: ${event}`,
        `STATUS: Internal server error: ${err}`,
        buildParams('', '', new Date().getTime(), '500')
      );
    return error(500, 'Internal server error');
  }
};