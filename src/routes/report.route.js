import fs from 'fs';
import path from 'path';
import express from 'express';
import { fileURLToPath } from 'url';

import reportQueue from '../queues/report.queue.js';

import apiKeyAuth from '../middleware/auth.middleware.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Protect generate + download
router.use(['/download', '/:id/generate'], apiKeyAuth);

/**
 * POST /reports/download
 * Query uploadPath
 * Download PDF by Streaming
 */
router.get('/download', async (req, res) => {
   const { uploadPath } = req.query;

   try {
      // Absolute path to file
      const filePath = path.join(__dirname, '../..', uploadPath);

      if (!fs.existsSync(filePath)) {
         return res.status(404).json({ message: 'Report file not found on server' });
      }

      res.setHeader('Content-Disposition', `attachment; filename=${path.basename(filePath)}`);
      res.setHeader('Content-Type', 'application/pdf');

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
   } catch (error) {
      console.error('Error streaming file: ', error);
      res.status(500).json({ message: 'Internal server error' });
   }
});

/**
 * POST /reports/:id/generate
 * Starts a new PDF generation job
 */
router.post('/:id/generate', async (req, res) => {
   const { id } = req.params;

        try {
            // Add the job to the BullMQ queue with details
            await reportQueue.add('generate-pdf', { reportId: id, ...req.body });

            res.status(202).json(id);
        } catch (error) {
            console.error('Failed to create report: ', error);
            res.status(500).json({ message: 'Failed to queue report.', error: error.message });
        }
    }
);

export default router;
