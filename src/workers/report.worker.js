import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { Worker } from 'bullmq';

import Report from '../models/report.model.js';
import redisOptions from '../config/redis.js';
import * as pdfService from '../services/pdf.service.js';

const BACKEND_API_URL = process.env.BACKEND_API_URL;
const BATCH_SIZE = 100;
const PROGRESS_UPDATE_BATCH = 100;

if (!BACKEND_API_URL) {
    throw new Error("BACKEND_API_URL environment variable is not set.");
}

const processor = async (job) => {
    const { reportId, utils: { template } } = job.data;

    console.log(`Report processing has begun. ID: ${reportId}`);

    if (template === 'defects') {
       await generateDefectsPdf(job.data);
    } else if (template === 'defect') {
        await generateDefectPdf(job.data);
    }
};

const generateDefectsPdf = async ({ reportId, filter, utils }) => {
    let tempDir;
    try {
        // --- 1. Setup ---
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `report-${reportId}-`));
        await Report.updateOne({ _id: reportId }, { status: 'processing' });

        // --- 2. Get Total Count ---
        const countResponse = await fetch(`${BACKEND_API_URL}/api/v1/generator/defects/count`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(filter),
        });
        if (!countResponse.ok) {
            throw new Error(`Failed to fetch total count: ${await countResponse.text()}`);
        }
        const totalPages = await countResponse.json();

        if (totalPages === 0) {
            console.log(`Report ${reportId} has no content. Completing early.`);
            await Report.updateOne({ _id: reportId }, { status: 'completed', progress: 100, totalPages: 0, uploadPath: null });
            await fs.rm(tempDir, { recursive: true, force: true });
            return;
        }

        await Report.updateOne({ _id: reportId }, { totalPages });

        // --- 3. Paginated Data Fetching and PDF Generation ---
        let processedPages = 0;
        const allPagePaths = [];
        const totalBatches = Math.ceil(totalPages / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            const backendUrl = new URL(`${BACKEND_API_URL}/api/v1/generator/defects`);
            backendUrl.searchParams.append('page', i);
            backendUrl.searchParams.append('size', BATCH_SIZE);

            console.log(`Report ${reportId}: Fetching page ${i+1}/${totalBatches} from ${backendUrl}`);

            const dataResponse = await fetch(backendUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(filter),
            });
            if (!dataResponse.ok) {
                throw new Error(`Failed to fetch data page ${i}: ${await dataResponse.text()}`);
            }
            const { data: defects } = await dataResponse.json();

            if (defects && defects.length > 0) {
                const generatedPaths = await pdfService.generatePdfPages(
                   defects,
                   utils,
                   tempDir,
                   async (batchProgress) => {
                       const newProcessedCount = processedPages + batchProgress;
                       if (newProcessedCount % PROGRESS_UPDATE_BATCH === 0 || newProcessedCount === totalPages) {
                           await Report.updateOne({ _id: reportId }, {
                               progress: Math.round((newProcessedCount / totalPages) * 100),
                               processedPages: newProcessedCount
                           });
                       }
                   },
                   processedPages // Starting page number for this batch
                );
                allPagePaths.push(...generatedPaths);
                processedPages += defects.length;
            }
        }

        // --- 4. Merge PDFs ---
        if (allPagePaths.length === 0) {
            throw new Error("No PDF pages were generated despite having a total count > 0.");
        }
        const finalPdfPath = path.join(tempDir, 'final-report.pdf');
        await pdfService.mergePdfPages(allPagePaths, finalPdfPath);

        // --- 5. Save final PDF to /reports/X_YEAR/Y_MONTH/Z_DAY/{date}.pdf ---
        const destPath = await pdfService.saveReportPdf(finalPdfPath);

        await Report.updateOne({ _id: reportId }, {
            status: 'completed',
            progress: 100,
            processedPages: totalPages,
            uploadPath: `/${destPath}`
        });
        console.log(`Report ${reportId} completed successfully. Report available at: ${destPath}`);
    } catch (error) {
        console.error(`Report ${reportId} failed: `, error);
        await Report.updateOne({ _id: reportId }, {
            status: 'failed',
            error: error.message || 'An unknown error occurred.',
        });
        // Re-throw the error to let BullMQ know the job failed
        throw error;
    } finally {
        // --- 6. Cleanup temp directory ---
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            console.log(`Cleaned up temp directory: ${tempDir}`);
        }
    }
};

const generateDefectPdf = async ({ reportId, data, utils }) => {
    try {
        // --- 1. Setup ---
        await Report.updateOne({ _id: reportId }, { status: 'processing' });

        // --- 2. Generate Report PDF and Get upload path ---
        const destPath = await pdfService.generatePdf(data, utils);

        // --- 3. Set upload path to report ---
        await Report.updateOne({ _id: reportId }, {
            status: 'completed',
            progress: 100,
            uploadPath: `/${destPath}`
        });
        console.log(`Report ${reportId} completed successfully. Report available at: ${destPath}`);
    } catch (error) {
        console.error(`Report ${reportId} failed: `, error);
        await Report.updateOne({ _id: reportId }, {
            status: 'failed',
            error: error.message || 'An unknown error occurred.',
        });
        // Re-throw the error to let BullMQ know the job failed
        throw error;
    }
};

const reportWorker = new Worker('report-generation', processor, {
    connection: redisOptions,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 2,
    lockDuration: 1800000, // 30 minutes
    limiter: {
        max: 10,
        duration: 1000
    },
    autorun: true,
});

reportWorker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed.`);
});

reportWorker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with ${err.message}`);
});

export default reportWorker;
