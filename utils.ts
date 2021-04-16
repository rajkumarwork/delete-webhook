import redis from 'redis';
import { promisify } from 'util';

const redisEndpoint = `redis://${process.env['REDIS_URL'] || ''}:6379`;
const redisClient = redis.createClient(redisEndpoint);
export const deleteContentFromCache = promisify(redisClient.del).bind(redisClient);