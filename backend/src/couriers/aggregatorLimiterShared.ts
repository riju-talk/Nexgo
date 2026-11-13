import { config } from '../config.js';
import { AdaptiveLimiter } from './aggregatorLimiter.js';

// One brake for every call to the aggregator made by this process (API and worker each have their own).
export const aggregatorLimiter = new AdaptiveLimiter(config.AGGREGATOR_MAX_CONCURRENCY, 4, 24);
