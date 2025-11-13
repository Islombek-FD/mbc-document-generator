import mongoose from 'mongoose';

const reportSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    }, // Using UUID from the Report
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
    uploadPath: {
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

const Report = mongoose.model('Report', reportSchema);

export default Report;
