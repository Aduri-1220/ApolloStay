const fs = require("node:fs");
const path = require("node:path");
const { PutObjectCommand, S3Client } = require("@aws-sdk/client-s3");
const {
  allowLocalOnlyUploads,
  objectStorageBucket,
  objectStorageRegion,
  objectStorageEndpoint,
  objectStorageAccessKeyId,
  objectStorageSecretAccessKey,
  objectStoragePublicBaseUrl,
  isProduction
} = require("./config");

let client = null;

function isObjectStorageEnabled() {
  return Boolean(objectStorageBucket && objectStorageEndpoint && objectStorageAccessKeyId && objectStorageSecretAccessKey);
}

function getClient() {
  if (!isObjectStorageEnabled()) {
    return null;
  }

  if (!client) {
    client = new S3Client({
      region: objectStorageRegion,
      endpoint: objectStorageEndpoint,
      credentials: {
        accessKeyId: objectStorageAccessKeyId,
        secretAccessKey: objectStorageSecretAccessKey
      }
    });
  }

  return client;
}

function writeLocalUpload(uploadDir, filename, buffer) {
  fs.mkdirSync(uploadDir, { recursive: true });
  const safeName = `${Date.now()}-${path.basename(filename).replace(/\s+/g, "_")}`;
  const outputPath = path.join(uploadDir, safeName);
  fs.writeFileSync(outputPath, buffer);
  return { safeName, localPath: outputPath };
}

async function persistUpload({ uploadDir, filename, buffer, mimeType }) {
  if (isProduction && !isObjectStorageEnabled() && !allowLocalOnlyUploads) {
    throw new Error("Object storage must be configured in production before accepting uploads.");
  }

  const { safeName, localPath } = writeLocalUpload(uploadDir, filename, buffer);
  if (!isObjectStorageEnabled()) {
    return { localPath, objectKey: null, objectUrl: null };
  }

  const key = `uploads/${safeName}`;
  await getClient().send(
    new PutObjectCommand({
      Bucket: objectStorageBucket,
      Key: key,
      Body: buffer,
      ContentType: mimeType
    })
  );

  return {
    localPath,
    objectKey: key,
    objectUrl: objectStoragePublicBaseUrl ? `${objectStoragePublicBaseUrl.replace(/\/$/, "")}/${key}` : null
  };
}

module.exports = {
  isObjectStorageEnabled,
  persistUpload
};
