import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { Worker } from 'bullmq';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

import Job from '../models/job.model.js';
import redisOptions from '../config/redis.js';
import * as s3Service from '../services/s3.service.js';
import * as pdfService from '../services/pdf.service.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BACKEND_API_URL = process.env.BACKEND_API_URL;
const BATCH_SIZE = 100;
const PROGRESS_UPDATE_BATCH = 100;

if (!BACKEND_API_URL) {
    throw new Error("BACKEND_API_URL environment variable is not set.");
}

const processor = async (job) => {
    const { jobId, filters, utils } = job.data;

    console.log(`Processing job ${jobId} with filters: ${filters} and utils: ${utils}.`);

    let tempDir;
    try {
        // --- 1. Setup ---
        tempDir = await fs.mkdtemp(path.join(os.tmpdir(), `report-${jobId}-`));
        await Job.updateOne({ _id: jobId }, { status: 'processing' });

        // --- 2. Get Total Count ---
        const countResponse = await fetch(`${BACKEND_API_URL}/api/v1/references/defects/count`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIrOTk4ODg3MDYyMzE4IiwiaWF0IjoxNzYyOTY0NzQzLCJleHAiOjE3NjMzOTY3NDMsInJvbGUiOiLQotC10YXQvdCw0LTQt9C-0YAifQ.9lVAonxGA1cz25bFv7DMuY4z14bUZdbcnTYBak9kHTd9-rJErrMOmyDBECQnBT7xbjDWyeoHYVAl8WD1RSiCnQ'
            },
            body: JSON.stringify(filters),
        });
        if (!countResponse.ok) {
            throw new Error(`Failed to fetch total count: ${await countResponse.text()}`);
        }
        const totalPages = await countResponse.json();

        if (totalPages === 0) {
            console.log(`Job ${jobId} has no content. Completing early.`);
            await Job.updateOne({ _id: jobId }, { status: 'completed', progress: 100, totalPages: 0, s3Url: null });
            await fs.rm(tempDir, { recursive: true, force: true });
            return;
        }

        await Job.updateOne({ _id: jobId }, { totalPages });

        // --- 3. Paginated Data Fetching and PDF Generation ---
        let processedPages = 0;
        const allPagePaths = [];
        const totalBatches = Math.ceil(totalPages / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            const backendUrl = new URL(`${BACKEND_API_URL}/api/v1/references/defects`);
            backendUrl.searchParams.append('page', i);
            backendUrl.searchParams.append('size', BATCH_SIZE);

            console.log(`Job ${jobId}: Fetching page ${i+1}/${totalBatches} from ${backendUrl}`);

            const dataResponse = await fetch(backendUrl.toString(), {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': 'Bearer eyJhbGciOiJIUzUxMiJ9.eyJzdWIiOiIrOTk4ODg3MDYyMzE4IiwiaWF0IjoxNzYyOTY0NzQzLCJleHAiOjE3NjMzOTY3NDMsInJvbGUiOiLQotC10YXQvdCw0LTQt9C-0YAifQ.9lVAonxGA1cz25bFv7DMuY4z14bUZdbcnTYBak9kHTd9-rJErrMOmyDBECQnBT7xbjDWyeoHYVAl8WD1RSiCnQ'
                },
                body: JSON.stringify(filters),
            });
            if (!dataResponse.ok) {
                throw new Error(`Failed to fetch data page ${i}: ${await dataResponse.text()}`);
            }
            const defectPage = await dataResponse.json();
            const defects = defectPage.data;

            if (defects && defects.length > 0) {
                const generatedPaths = await pdfService.generatePdfPages(
                   defects,
                   utils,
                   tempDir,
                   async (batchProgress) => {
                       const newProcessedCount = processedPages + batchProgress;
                       if (newProcessedCount % PROGRESS_UPDATE_BATCH === 0 || newProcessedCount === totalPages) {
                           await Job.updateOne({ _id: jobId }, {
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
        const date = new Date();
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');

        const reportsDir = path.join(__dirname, '../..', 'reports', `${year.toString()}_YEAR`, `${month}_MONTH`, `${day}_DAY`);
        await fs.mkdir(reportsDir, { recursive: true });

        const fileName = `${Date.now()}.pdf`;
        const destPath = path.join(reportsDir, fileName);

        await fs.copyFile(finalPdfPath, destPath);
        console.log(`PDF saved at: ${destPath}`);

        // --- 5. Upload to S3 ---
        //const s3Key = `reports/${jobId}/${uuidv4()}-report.pdf`;
        //const s3Url = await s3Service.uploadFileAndGetSignedUrl(finalPdfPath, s3Key);

        // --- 6. Finalize Job ---
        // await Job.updateOne({ _id: jobId }, {
        //     status: 'completed',
        //     progress: 100,
        //     processedPages: totalPages,
        //     s3Url: s3Url,
        // });
        // console.log(`Job ${jobId} completed successfully. Report available at: ${s3Url}`);
    } catch (error) {
        console.error(`Job ${jobId} failed:`, error);
        await Job.updateOne({ _id: jobId }, {
            status: 'failed',
            error: error.message || 'An unknown error occurred.',
        });
        // Re-throw the error to let BullMQ know the job failed
        throw error;
    } finally {
        // --- 7. Cleanup temp directory ---
        if (tempDir) {
            await fs.rm(tempDir, { recursive: true, force: true });
            console.log(`Cleaned up temp directory: ${tempDir}`);
        }
    }
};

const worker = new Worker('report-generation', processor, {
    connection: redisOptions,
    concurrency: parseInt(process.env.WORKER_CONCURRENCY, 10) || 4,
    limiter: {
        max: 10,
        duration: 1000,
    },
});

worker.on('completed', (job) => {
    console.log(`Job ${job.id} has completed.`);
});

worker.on('failed', (job, err) => {
    console.error(`Job ${job.id} has failed with ${err.message}`);
});

// Export the worker instance for graceful shutdown
export default worker;
