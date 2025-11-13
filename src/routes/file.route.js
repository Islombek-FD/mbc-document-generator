import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import express from 'express';

import Job from '../models/job.model.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Download PDF by Streaming
router.get('/download/:jobId', async (req, res) => {
   const { jobId } = req.params;

   try {
      const job = await Job.findById(jobId);

      if (!job) {
         return res.status(404).json({ message: 'Job not found' });
      }

      if (job.status !== 'completed' || !job.uploadPath) {
         return res.status(400).json({ message: 'Report not ready yet' });
      }

      // Absolute path to file
      const filePath = path.join(__dirname, '../..', job.uploadPath);

      if (!fs.existsSync(filePath)) {
         return res.status(404).json({ message: 'File not found on server' });
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

export default router;
