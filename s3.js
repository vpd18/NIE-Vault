// s3.js — Dual-Mode S3 Storage Service
// If AWS_S3_BUCKET is provided, files are uploaded directly to Amazon S3.
// Otherwise, it seamlessly falls back to local disk storage in 'uploads/'.

const fs = require('fs');
const path = require('path');
const { S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

const isS3Configured = Boolean(
  process.env.AWS_S3_BUCKET &&
  (process.env.AWS_ACCESS_KEY_ID || process.env.AWS_CONTAINER_CREDENTIALS_RELATIVE_URI || process.env.AWS_ROLE_ARN)
);

let s3Client = null;
if (isS3Configured) {
  s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: process.env.AWS_ACCESS_KEY_ID ? {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
    } : undefined // If undefined, AWS SDK automatically picks up Elastic Beanstalk / EC2 IAM role
  });
  console.log(`[Storage] Amazon S3 enabled with bucket: ${process.env.AWS_S3_BUCKET} (${process.env.AWS_REGION || 'ap-south-1'})`);
} else {
  console.log('[Storage] AWS S3 not configured or credentials missing. Using local disk storage in uploads/');
}

/**
 * Uploads a file buffer either to S3 or local disk.
 * @param {Buffer} buffer File data buffer from Multer memoryStorage
 * @param {string} originalName Original filename
 * @param {string} mimeType Mime type of the image
 * @returns {Promise<string>} S3 public URL or local filename
 */
async function uploadFile(buffer, originalName, mimeType) {
  const ext = path.extname(originalName).toLowerCase();
  const uniqueName = `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;

  if (isS3Configured && s3Client) {
    const bucket = process.env.AWS_S3_BUCKET;
    const region = process.env.AWS_REGION || 'ap-south-1';
    const key = `items/${uniqueName}`;

    await s3Client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType || 'image/jpeg'
    }));

    // Return the public S3 URL
    return `https://${bucket}.s3.${region}.amazonaws.com/${key}`;
  }

  // Local fallback: save to uploads/
  const uploadsDir = path.join(__dirname, 'uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const localPath = path.join(uploadsDir, uniqueName);
  await fs.promises.writeFile(localPath, buffer);
  return uniqueName;
}

/**
 * Deletes a file from S3 or local disk.
 * @param {string} fileIdentifier Full S3 URL or local filename
 */
async function deleteFile(fileIdentifier) {
  if (!fileIdentifier) return;

  if (fileIdentifier.startsWith('http://') || fileIdentifier.startsWith('https://')) {
    if (!isS3Configured || !s3Client) return;
    try {
      const url = new URL(fileIdentifier);
      const key = url.pathname.replace(/^\/+/, ''); // remove leading slash
      await s3Client.send(new DeleteObjectCommand({
        Bucket: process.env.AWS_S3_BUCKET,
        Key: key
      }));
    } catch (err) {
      console.warn('[Storage] Failed to delete file from S3:', err.message);
    }
  } else {
    // Local deletion
    const localPath = path.join(__dirname, 'uploads', fileIdentifier);
    if (fs.existsSync(localPath)) {
      try {
        await fs.promises.unlink(localPath);
      } catch (err) {
        console.warn('[Storage] Failed to delete local file:', err.message);
      }
    }
  }
}

module.exports = {
  uploadFile,
  deleteFile,
  isS3Configured
};
