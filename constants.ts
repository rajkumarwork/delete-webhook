import redis from 'redis';
import { promisify } from 'util';

export const TIMEOUT = 10000;

export const contentfulCdnHost = process.env['CONTENTFUL_CDN_HOST'] || '';
export const contentfulPreviewHost = process.env['CONTENTFUL_PREVIEW_HOST'] || '';
export const contentfulTimeout =  process.env['CONTENTFUL_TIMEOUT'] || '';
export const contentfulSpace = process.env['CONTENTFUL_SPACE'] || '';
export const contentfulEnv = process.env['CONTENTFUL_ENV'] || '';
export const contentfulAccessToken = process.env['CONTENTFUL_ACCESSTOKEN'] || '';
export const contentfulPreviewAccessToken = process.env['CONTENTFUL_PREVIEW_ACCESSTOKEN'] || '';

const redisEndpoint = `redis://${process.env['REDIS_URL'] || ''}:6379`;
const redisClient = redis.createClient(redisEndpoint);
export const getContentFromCache = promisify(redisClient.get).bind(redisClient);
export const setContentToCache = promisify(redisClient.set).bind(redisClient);
export const deleteContentFromCache = promisify(redisClient.del).bind(redisClient);

export const PerfMeasurers = {
  GET_CMS_CONTENT: {
    event: 'get content from CMS',
    key: 'GET_CMS_CONTENT'
  },
  SET_CONTENT_TO_REDIS_CACHE: {
    event: 'set content to redis cache',
    key: 'SET_CONTENT_TO_REDIS_CACHE'
  },
  GET_CONTENT_FROM_REDIS_CACHE: {
    event: 'get content from redis cache',
    key: 'GET_CONTENT_FROM_REDIS_CACHE'
  },
  NORMALIZE_JSON: {
    event: 'normalize JSON',
    key: 'NORMALIZE_JSON'
  },
  GET_PUBLISHED_CONTENT_BY_ENTRYID: {
    event: "get published content by entry id",
    key: 'GET_PUBLISHED_CONTENT_BY_ENTRYID'
  },
  GET_PREVIEW_CONTENT: {
    event: "get preview content",
    key: 'GET_PREVIEW_CONTENT'
  }
}

export const Channels = {
  MOBILE: 'Mobile',
  DESKTOP: 'Desktop'
}

export const International = {
  INTERNATIONAL: 'International'
}

export const MobileDesktop = {
  NEWMOBILE: 'Mobile,Desktop'
}
