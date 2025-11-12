import mongoose from 'mongoose';

const jobSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    }, // Using UUID from the job
    progress: {
        type: Number,
        default: 0
    },
    totalPages: {
        type: Number,
        default: 0
    },
    processedPages: {
        type: Number,
        default: 0
    },
    s3Url: {
        type: String
    },
    error: {
        type: String
    },
    status: {
        type: String,
        enum: ['pending', 'processing', 'completed', 'failed'],
        default: 'pending',
    },
}, { timestamps: true });

const Job = mongoose.model('Job', jobSchema);

export default Job;
