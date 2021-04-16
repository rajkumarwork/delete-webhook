import { APIGatewayProxyEvent, Context } from 'aws-lambda';
import isEmpty from 'lodash/isEmpty';
import { deleteContentFromCache } from './utils';
import { ok, error } from './http';
import { Log, buildParams } from './logger';

const log = new Log();
const perf = require('execution-time')();

const DEL_KEY_FROM_CACHE = 'DEL_KEY_FROM_CACHE';

export const deleteKey = async (event: APIGatewayProxyEvent, context: Context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  perf.start(DEL_KEY_FROM_CACHE);

    let contentfulBody: any;
    try {
      if (null != event.body) {
        contentfulBody = JSON.parse(event.body);
        const slugsReceived = contentfulBody?.fields?.slugs?.['en-US'];
        const keysToRemove: any = constructKeysToRemove(slugsReceived);

        if (!isEmpty(keysToRemove)) {
          await deleteContentFromCache(keysToRemove);
          log.info(`EVENT: DEL_KEY_FROM_CACHE`,
            'STATUS: Successfully deleted key from redis cache',
            buildParams(keysToRemove, perf.stop(DEL_KEY_FROM_CACHE).time, new Date().getTime(), '200')
          );
          return ok(200, "Slugs deleted successfully from redis cache");
        }
        return ok(200, "No slugs found for the event");
      }
    } catch (err) {
      log.error(`Error: ${err}`,
          'STATUS: Error occurred while deleting keys',
          buildParams('', '', new Date().getTime(), '500')
        );
      return error(500, 'Internal server error');
    }
};

const constructKeysToRemove = (slugsReceived) => {
  const keysToRemove : string[] = [];
  try {
    const channelVariations = ['Desktop', 'Mobile', 'Mobile,Desktop', 'Desktop,Mobile', 'App', 'Email'];
    for (let i = 0; i < slugsReceived.length; i ++) {
      const slug = slugsReceived[i];
      for (let j = 0; j < channelVariations.length; j ++) {
        const nmLocalKey = `NM_${slug}_${channelVariations[j]}_`;
        const nmInternationalKey = `NM_${slug}_${channelVariations[j]}_International`;
        const bgLocalKey = `BG_${slug}_${channelVariations[j]}_`;
        const bgInternationalKey = `BG_${slug}_${channelVariations[j]}_International`;
        keysToRemove.push(nmLocalKey, nmInternationalKey, bgLocalKey, bgInternationalKey);
      }
    }
    log.info(`EVENT: CACHE_KEY_CONTRUCTION`,
      'STATUS: Successfully created keys to remove from cache',
      buildParams(keysToRemove.toString(), '', new Date().getTime(), '200')
    );
  } catch (err) {
    log.error(`EVENT: CACHE_KEY_CONTRUCTION`,
      `STATUS: Error occurred while creating keys to remove from cache: ${err}`,
      buildParams('', '', new Date().getTime(), '')
    );
  }
  
  return keysToRemove;
}