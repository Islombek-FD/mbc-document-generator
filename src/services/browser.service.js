const puppeteer = require('puppeteer');
const pLimit = require('p-limit');

let browser = null;
let limiter = null;

const init = async () => {
    if (browser) {
        return;
    }
    try {
        // Production-ready arguments for running in a server/container environment
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certifcate-errors',
            '--ignore-certifcate-errors-spki-list',
            '--user-agent="Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36"',
            '--disable-gpu', // Important for server environments
            '--disable-dev-shm-usage', // Important for container environments
        ];

        browser = await puppeteer.launch({
            headless: true,
            args: args,
            ignoreHTTPSErrors: true,
        });
        
        // --- CONCURRENCY OPTIMIZATION ---
        // Create a global limiter for all Puppeteer page operations
        const concurrency = parseInt(process.env.PUPPETEER_PAGE_CONCURRENCY, 10) || 20;
        limiter = pLimit(concurrency);
        console.log(`Puppeteer page concurrency limit set to ${concurrency}`);

    } catch (error) {
        console.error('Failed to launch Puppeteer browser:', error);
        throw error;
    }
};

const getBrowser = () => {
    if (!browser) {
        throw new Error('Browser has not been initialized. Call init() first.');
    }
    return browser;
};

const getLimiter = () => {
    if (!limiter) {
        throw new Error('Limiter has not been initialized. Call init() first.');
    }
    return limiter;
}

const closeBrowser = async () => {
    if (browser) {
        await browser.close();
        browser = null;
        limiter = null;
    }
};

module.exports = {
    init,
    getBrowser,
    getLimiter,
    closeBrowser,
};
