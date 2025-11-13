import fs from 'fs';
import path from 'path';
import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { fileURLToPath } from 'url';

import Report from '../models/report.model.js';
import reportQueue from '../queues/report.queue.js';

// import apiKeyAuth from '../middleware/auth.middleware.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middleware to protect the generation endpoint
// router.use('/generate', apiKeyAuth);

/**
 * GET /reports
 * Paginated report list
 * Query params:
 *   - page (default: 1)
 *   - limit (default: 10)
 *   - status (optional)
 *   - search (optional)
 */
router.get('/', async (req, res) => {
   try {
      const page = parseInt(req.query.page) || 1;
      const limit = parseInt(req.query.limit) || 10;
      const skip = (page - 1) * limit;

      const filter = {};

      // Optional filter by status (e.g. ?status=completed)
      if (req.query.status) {
         filter.status = req.query.status;
      }

      // Optional search by name or reportId
      if (req.query.search) {
         filter.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { _id: { $regex: req.query.search, $options: 'i' } },
         ];
      }

      // Get total count for pagination
      const total = await Report.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      // Get paginated data (sorted by createdAt descending)
      const reports = await Report.find(filter)
         .sort({ createdAt: -1 })
         .skip(skip)
         .limit(limit)
         .select('-__v');

      res.json({
         data: reports,
         pagination: {
            page,
            limit,
            total,
            totalPages
         },
      });
   } catch (error) {
      console.error('Failed to fetch reports: ', error);
      res.status(500).json({ message: 'Failed to fetch reports.' });
   }
});

/**
 * GET /reports/:id
 * Get one report by ID
 */
router.get('/:id', async (req, res) => {
   const { id } = req.params;
   try {
      const report = await Report.findById(id).select('-__v');
      if (!report) {
         return res.status(404).json({ message: 'Report not found.' });
      }
      res.json(report);
   } catch (error) {
      console.error('Failed to get report: ', error);
      res.status(500).json({ message: 'Failed to retrieve report.' });
   }
});

/**
 * POST /reports/download/:reportId
 * Download PDF by Streaming
 */
router.get('/:id/download', async (req, res) => {
   const { id } = req.params;

   try {
      const report = await Report.findById(id);

      if (!report) {
         return res.status(404).json({ message: 'Report not found' });
      }

      if (report.status !== 'completed' || !report.uploadPath) {
         return res.status(400).json({ message: 'Report not ready yet' });
      }

      // Absolute path to file
      const filePath = path.join(__dirname, '../..', report.uploadPath);

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

/**
 * POST /reports/generate
 * Starts a new PDF generation job
 */
router.post('/generate', async (req, res) => {
        const reportId = uuidv4();

        try {
            // Create a report record in MongoDB
            await Report.create({ _id: reportId, status: 'pending' });

            // Add the job to the BullMQ queue with filters
            await reportQueue.add('generate-pdf', { reportId, ...req.body });

            res.status(202).json(reportId);
        } catch (error) {
            console.error('Failed to create report: ', error);
            res.status(500).json({ message: 'Failed to queue report.', error: error.message });
        }
    }
);

export default router;
