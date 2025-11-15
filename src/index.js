import path from 'path';
import helmet from 'helmet';
import express from 'express';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import './config/index.js';

import reportRoutes from './routes/report.route.js';
import reportQueue from './queues/report.queue.js';
import reportWorker from './workers/report.worker.js';
import * as browserService from './services/browser.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Main Application Setup ---
const app = express();

// --- Security Middlewares (Set various security HTTP headers) ---
app.use(helmet());

// Limit each IP to 100 requests per windowMs for 15 minutes
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// --- Body Parsers ---
app.use(express.json({ limit: "1024mb" }));
app.use(express.urlencoded({ extended: true }));

// --- Static Folders ---
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// --- API Routes ---
app.use('/api/v1/reports', reportRoutes);

// --- Global Error Handler ---
app.use((err, req, res) => {
    console.error('ERROR: ', err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        // Initialize the shared browser instance
        await browserService.init();

        const server = app.listen(PORT, () => {
            console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
        });

        // --- Graceful Shutdown ---
        const shutdown = async (signal) => {
            console.log(`\nReceived ${signal}, starting graceful shutdown...`);

            // 1. Stop the server from accepting new connections
            server.close(async (err) => {
                if (err) {
                    console.error('Error during server close:', err);
                    process.exit(1);
                }
                console.log('HTTP server closed.');

                try {
                    // 2. Close worker (waits for the current job to finish)
                    console.log('Closing BullMQ worker...');
                    await reportWorker.close();
                    console.log('BullMQ worker closed.');

                    // 3. Close queue
                    console.log('Closing BullMQ queue...');
                    await reportQueue.close();
                    console.log('BullMQ queue closed.');

                    // 4. Close the browser
                    console.log('Closing Puppeteer browser...');
                    await browserService.closeBrowser();
                    console.log('Puppeteer browser closed.');

                    console.log('Graceful shutdown complete.');
                    process.exit(0);
                } catch (shutdownError) {
                    console.error('Error during graceful shutdown:', shutdownError);
                    process.exit(1);
                }
            });
        };

        process.on('SIGTERM', () => shutdown('SIGTERM'));
        process.on('SIGINT', () => shutdown('SIGINT'));
    } catch (error) {
        console.error('Failed to start server:', error);
        process.exit(1);
    }
};

startServer();
