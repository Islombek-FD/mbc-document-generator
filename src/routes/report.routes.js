import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { body, validationResult } from 'express-validator';

import Job from '../models/job.model.js';
import reportQueue from '../jobs/reportQueue.js';

import apiKeyAuth from '../middleware/auth.middleware.js';

const router = express.Router();

// Middleware to protect the generation endpoint
// router.use('/generate', apiKeyAuth);

// Starts a new PDF generation job, protected by API Key
router.post('/generate', body('filters').isObject().withMessage('Filters must be an object.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const jobId = uuidv4();

        try {
            // Create a job record in MongoDB
            await Job.create({ _id: jobId, status: 'pending' });

            // Add the job to the BullMQ queue with filters
            await reportQueue.add('generate-pdf-from-filters', { jobId, ...req.body });

            res.status(202).json({ jobId });
        } catch (error) {
            console.error('Failed to create job:', error);
            res.status(500).json({ message: 'Failed to queue job.', error: error.message });
        }
    }
);

// Retrieves the status of a job (publicly accessible)
router.get('/status/:jobId', async (req, res) => {
    const { jobId } = req.params;
    try {
        const job = await Job.findById(jobId).select('-__v'); // Exclude version key
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
