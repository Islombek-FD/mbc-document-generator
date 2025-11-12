import fs from 'fs';
import path from 'path';
import AWS from 'aws-sdk';

const s3 = new AWS.S3({
    region: process.env.AWS_REGION,
    // Credentials will be loaded from environment variables or IAM role
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME;

export const uploadFileAndGetSignedUrl = async (filePath, key) => {
    if (!BUCKET_NAME) {
        throw new Error('S3_BUCKET_NAME is not configured in environment variables.');
    }

    const fileStream = fs.createReadStream(filePath);
    const fileName = path.basename(filePath);

    const uploadParams = {
        Bucket: BUCKET_NAME,
        Key: key,
        Body: fileStream,
        ContentDisposition: `attachment; filename="${fileName}"`,
    };

    try {
        await s3.upload(uploadParams).promise();

        const urlParams = {
            Bucket: BUCKET_NAME,
            Key: key,
            Expires: parseInt(process.env.S3_LINK_EXPIRATION, 10) || 3600,
        };

        const signedUrl = await s3.getSignedUrlPromise('getObject', urlParams);
        return signedUrl;
    } catch (error) {
        console.error("S3 operation failed:", error);
        throw new Error(`Failed to upload or sign file in S3: ${error.message}`);
    }
};
