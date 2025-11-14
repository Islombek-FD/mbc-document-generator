import puppeteer from 'puppeteer';
import pLimit from 'p-limit';

let browser = null;
let limiter = null;

export const init = async () => {
    if (browser) return;

    try {
        const args = [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-infobars',
            '--window-position=0,0',
            '--ignore-certificate-errors',
            '--ignore-certificate-errors-spki-list',
        ];

        browser = await puppeteer.launch({
            headless: true,
            args,
            ignoreHTTPSErrors: true,
        });

        // concurrency limit
        const concurrency = parseInt(process.env.PUPPETEER_PAGE_CONCURRENCY, 10) || 5;
        limiter = pLimit(concurrency);

        console.log(`Puppeteer concurrency: ${concurrency}`);
    } catch (error) {
        console.error('Failed to launch Puppeteer browser:', error);
        throw error;
    }
};

export const getBrowser = () => {
    if (!browser) {
        throw new Error('Browser not initialized. Call init() first.');
    }
    return browser;
};

export const getLimiter = () => {
    if (!limiter) {
        throw new Error('Limiter not initialized. Call init() first.');
    }
    return limiter;
};

export const closeBrowser = async () => {
    if (browser) {
        await browser.close();
        browser = null;
        limiter = null;
    }
};
