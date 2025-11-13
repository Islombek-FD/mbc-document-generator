import express from 'express';

import Job from '../models/job.model.js';

const router = express.Router();

/**
 * GET /api/jobs
 * Paginated job list
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

      // Optional search by name or jobId
      if (req.query.search) {
         filter.$or = [
            { name: { $regex: req.query.search, $options: 'i' } },
            { _id: { $regex: req.query.search, $options: 'i' } },
         ];
      }

      // Get total count for pagination
      const total = await Job.countDocuments(filter);
      const totalPages = Math.ceil(total / limit);

      // Get paginated data (sorted by createdAt descending)
      const jobs = await Job.find(filter)
         .sort({ createdAt: -1 })
         .skip(skip)
         .limit(limit)
         .select('-__v');

      res.json({
         data: jobs,
         pagination: {
            page,
            limit,
            total,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
         },
      });
   } catch (error) {
      console.error('Failed to fetch jobs:', error);
      res.status(500).json({ message: 'Failed to fetch job list.' });
   }
});

/**
 * GET /api/jobs/:id
 * Get one job by ID
 */
router.get('/:id', async (req, res) => {
   const { id } = req.params;
   try {
      const job = await Job.findById(id).select('-__v');
      if (!job) {
         return res.status(404).json({ message: 'Job not found.' });
      }
      res.json(job);
   } catch (error) {
      console.error('Failed to get job status:', error);
      res.status(500).json({ message: 'Failed to retrieve job status.' });
   }
});

export default router;
