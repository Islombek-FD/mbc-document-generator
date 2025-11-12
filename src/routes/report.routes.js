const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const reportQueue = require('../jobs/reportQueue');
const Job = require('../models/job.model');
const apiKeyAuth = require('../middleware/auth.middleware');

const router = express.Router();

// Middleware to protect the generation endpoint
router.use('/generate', apiKeyAuth);

// POST /api/generate
// Starts a new PDF generation job, protected by API Key
router.post(
    '/generate',
    // Input validation
    body('filters').isObject().withMessage('Filters must be an object.'),
    async (req, res) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        const { filters } = req.body;
        const jobId = uuidv4();

        try {
            // Create a job record in MongoDB
            await Job.create({
                _id: jobId,
                status: 'pending',
            });

            // Add the job to the BullMQ queue with filters
            await reportQueue.add('generate-pdf-from-filters', { jobId, filters });
            
            res.status(202).json({ jobId });
        } catch (error) {
            console.error('Failed to create job:', error);
            res.status(500).json({ message: 'Failed to queue job.', error: error.message });
        }
    }
);

// GET /api/status/:jobId
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

module.exports = router;
