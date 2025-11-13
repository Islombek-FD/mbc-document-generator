import path from 'path';
import helmet from 'helmet';
import express from 'express';
import mongoose from 'mongoose';
import bodyParser from 'body-parser';
import { fileURLToPath } from 'url';
import rateLimit from 'express-rate-limit';

import './config/index.js';

import connectDB from './config/db.js';
import jobRoutes from './routes/job.routes.js';
import fileRoutes from './routes/file.routes.js';
import reportRoutes from './routes/report.routes.js';
import reportQueue from './jobs/reportQueue.js';
import reportWorker from './workers/reportWorker.js';
import * as browserService from './services/browser.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// --- Main Application Setup ---
const app = express();

// --- Security Middlewares (Set various security HTTP headers) ---
app.use(helmet());

const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutes
    max: 100,                   // Limit each IP to 100 requests per windowMs
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);

// --- Body Parsers ---
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(bodyParser.json({ limit: "1024mb" }));

// --- Static Folders ---
app.use('/css', express.static(path.join(__dirname, 'public', 'css')));
app.use('/fonts', express.static(path.join(__dirname, 'public', 'fonts')));
app.use('/images', express.static(path.join(__dirname, 'public', 'images')));

// --- API Routes ---
app.use('/api/v1/jobs', jobRoutes);
app.use('/api/v1/files', fileRoutes);
app.use('/api/v1/reports', reportRoutes);

// --- Global Error Handler ---
app.use((err, _req, res) => {
    console.error(err.stack);
    res.status(500).send('Something broke!');
});

const PORT = process.env.PORT || 3000;

const startServer = async () => {
    try {
        await connectDB();
        await browserService.init(); // Initialize the shared browser instance

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

                    // 5. Close database connection
                    console.log('Closing MongoDB connection...');
                    await mongoose.connection.close();
                    console.log('MongoDB connection closed.');

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
