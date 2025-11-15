import os from 'os';
import path from 'path';
import fs from 'fs/promises';
import { Worker } from 'bullmq';

import redisOptions from '../config/redis.js';
import * as pdfService from '../services/pdf.service.js';
import * as integrationService from '../services/integration.service.js';

const BATCH_SIZE = 100;

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

        await integrationService.updateReport(reportId, { status: 'PROCESSING' });

        // --- 2. Get Total Count ---
        const totalPages = await integrationService.getDefectsCount(filter);

        if (totalPages === 0) {
            console.log(`Report ${reportId} has no content. Completing early.`);
            await integrationService.updateReport(reportId, { status: 'COMPLETED' });
            await fs.rm(tempDir, { recursive: true, force: true });
            return;
        }

        // --- 3. Paginated Data Fetching and PDF Generation ---
        let processedPages = 0;
        const allPagePaths = [];
        const totalBatches = Math.ceil(totalPages / BATCH_SIZE);

        for (let i = 0; i < totalBatches; i++) {
            console.log(`Report ${reportId}: Fetching page ${i+1}/${totalBatches}.`);

            const defects = await integrationService.getDefects(i, BATCH_SIZE, filter);

            if (defects && defects.length > 0) {
                const generatedPaths = await pdfService.generatePdfPages(
                   defects,
                   utils,
                   tempDir,
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

        await integrationService.updateReport(reportId, { uploadPath: `/${destPath}`, status: 'COMPLETED' });
        console.log(`Report ${reportId} completed successfully. Report available at: ${destPath}`);
    } catch (error) {
        console.error(`Report ${reportId} failed: `, error);
        await integrationService.updateReport(reportId, { error: error.message, status: 'FAILED' });

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
        await integrationService.updateReport(reportId, { status: 'PROCESSING' });

        // --- 2. Generate Report PDF and Get upload path ---
        const destPath = await pdfService.generatePdf(data, utils);

        // --- 3. Set upload path to report ---
        await integrationService.updateReport(reportId, { uploadPath: `/${destPath}`, status: 'COMPLETED' });
        console.log(`Report ${reportId} completed successfully. Report available at: ${destPath}`);
    } catch (error) {
        console.error(`Report ${reportId} failed: `, error);
        await integrationService.updateReport(reportId, { error: error.message, status: 'FAILED' });

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
