// ============================================================
// MATRA — DigitalOcean Spaces (S3) Client
// ============================================================

import { S3Client, PutObjectCommand, DeleteObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.525.0';

const DO_SPACES_KEY = Deno.env.get('DO_SPACES_KEY')!;
const DO_SPACES_SECRET = Deno.env.get('DO_SPACES_SECRET')!;
const DO_SPACES_ENDPOINT = Deno.env.get('DO_SPACES_ENDPOINT') || 'https://nyc3.digitaloceanspaces.com';
const DO_SPACES_BUCKET = Deno.env.get('DO_SPACES_BUCKET') || 'alquimia-felina-spaces-bucket';
const DO_SPACES_CDN_URL = Deno.env.get('DO_SPACES_CDN_URL') || `https://${DO_SPACES_BUCKET}.nyc3.digitaloceanspaces.com`;

/** All Matra files live under this prefix in the bucket */
const MATRA_PREFIX = 'matra';

let _client: S3Client | null = null;

function getClient(): S3Client {
  if (!_client) {
    _client = new S3Client({
      region: 'nyc3',
      endpoint: DO_SPACES_ENDPOINT,
      credentials: {
        accessKeyId: DO_SPACES_KEY,
        secretAccessKey: DO_SPACES_SECRET,
      },
      forcePathStyle: false,
    });
  }
  return _client;
}

/**
 * Upload a file to DO Spaces under the matra/ prefix.
 * @param subPath Path within matra/ (e.g. "avatars/{id}.jpg", "audio/{groupId}/{id}.m4a")
 * @param body File bytes
 * @param contentType MIME type
 * @param options Additional options
 * @returns The full CDN URL of the uploaded file
 */
export async function uploadToSpaces(
  subPath: string,
  body: Uint8Array,
  contentType: string,
  options?: { cacheBust?: boolean; cacheControl?: string },
): Promise<string> {
  const key = `${MATRA_PREFIX}/${subPath}`;

  await getClient().send(new PutObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: 'public-read',
    CacheControl: options?.cacheControl || 'public, max-age=31536000',
  }));

  const url = `${DO_SPACES_CDN_URL}/${key}`;
  return options?.cacheBust ? `${url}?v=${Date.now()}` : url;
}

/**
 * Delete a file from DO Spaces by its CDN URL or subPath.
 */
export async function deleteFromSpaces(cdnUrlOrSubPath: string): Promise<void> {
  let key: string;
  if (cdnUrlOrSubPath.startsWith('http')) {
    // Extract key from CDN URL: https://bucket.nyc3.cdn.../matra/avatars/id.jpg?v=...
    const url = new URL(cdnUrlOrSubPath);
    key = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
  } else {
    key = `${MATRA_PREFIX}/${cdnUrlOrSubPath}`;
  }

  await getClient().send(new DeleteObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
  }));
}

export { DO_SPACES_CDN_URL, MATRA_PREFIX };
