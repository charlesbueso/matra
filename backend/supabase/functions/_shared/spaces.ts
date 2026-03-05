// ============================================================
// MATRA — DigitalOcean Spaces (S3) Client
// ============================================================

import { S3Client, PutObjectCommand, DeleteObjectCommand, GetObjectCommand } from 'https://esm.sh/@aws-sdk/client-s3@3.525.0';
import { getSignedUrl as s3GetSignedUrl } from 'https://esm.sh/@aws-sdk/s3-request-presigner@3.525.0';

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
 * @returns The S3 key of the uploaded file
 */
export async function uploadToSpaces(
  subPath: string,
  body: Uint8Array,
  contentType: string,
): Promise<string> {
  const key = `${MATRA_PREFIX}/${subPath}`;

  await getClient().send(new PutObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType,
    ACL: 'private',
    CacheControl: 'private, max-age=0',
  }));

  return key;
}

/**
 * Generate a time-limited presigned URL for a private object.
 * @param keyOrLegacyUrl S3 key (e.g. "matra/avatars/id.jpg") or legacy CDN URL
 * @param expiresIn Seconds until the URL expires (default: 1 hour)
 */
export async function getPresignedUrl(
  keyOrLegacyUrl: string,
  expiresIn = 3600,
): Promise<string> {
  const key = resolveKey(keyOrLegacyUrl);

  const command = new GetObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
  });

  return s3GetSignedUrl(getClient(), command, { expiresIn });
}

/** Resolve a stored value (key or legacy CDN URL) to an S3 key */
function resolveKey(keyOrUrl: string): string {
  if (keyOrUrl.startsWith('http')) {
    const url = new URL(keyOrUrl);
    const path = url.pathname.startsWith('/') ? url.pathname.slice(1) : url.pathname;
    return path;
  }
  // Already a key — ensure it has the prefix
  if (!keyOrUrl.startsWith(MATRA_PREFIX + '/')) {
    return `${MATRA_PREFIX}/${keyOrUrl}`;
  }
  return keyOrUrl;
}

/**
 * Delete a file from DO Spaces by its S3 key or legacy CDN URL.
 */
export async function deleteFromSpaces(keyOrUrl: string): Promise<void> {
  const key = resolveKey(keyOrUrl);

  await getClient().send(new DeleteObjectCommand({
    Bucket: DO_SPACES_BUCKET,
    Key: key,
  }));
}

export { DO_SPACES_CDN_URL, MATRA_PREFIX };
