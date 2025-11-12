import { Queue } from 'bullmq';

import redisOptions from '../config/redis.js';

const reportQueue = new Queue('report-generation', {
    connection: redisOptions,
    defaultJobOptions: {
        attempts: 3, // Retry failed jobs 3 times
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    },
});

export default reportQueue;
