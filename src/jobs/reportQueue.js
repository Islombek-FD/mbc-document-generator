const { Queue } = require('bullmq');
const redisOptions = require('../config/redis');

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

module.exports = reportQueue;
