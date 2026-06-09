import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import type { AppConfig } from "./config";

/** Default presigned-PUT lifetime, in seconds (15 minutes). */
const UPLOAD_URL_TTL_SECONDS = 900;

/**
 * Default presigned-GET lifetime, in seconds (4 hours). Long enough to outlast a
 * timed test or a video playback session; objects also carry a long Cache-Control.
 */
const DEFAULT_DOWNLOAD_TTL_SECONDS = 4 * 60 * 60;

/** Long cache lifetime set on the stored object so repeat views are cheap. */
const OBJECT_CACHE_CONTROL = "public, max-age=31536000, immutable";

/** Result of minting a presigned upload URL: the URL to PUT to and the key it signed. */
export interface PresignedUpload {
  url: string;
  key: string;
}

/**
 * Wraps S3 object storage for question media: minting presigned upload (PUT)
 * and download (GET) URLs. Authenticates via keyless Vercel OIDC when a
 * `roleArn` is configured (production), falling back to static keys (local dev).
 */
export class S3StorageService {
  private readonly client: S3Client;

  constructor(
    private readonly config: AppConfig["s3"],
    private readonly cloudfront?: AppConfig["cloudfront"],
  ) {
    this.client = new S3Client({
      region: config.region,
      credentials: config.roleArn
        ? awsCredentialsProvider({ roleArn: config.roleArn })
        : config.accessKeyId && config.secretAccessKey
          ? {
              accessKeyId: config.accessKeyId,
              secretAccessKey: config.secretAccessKey,
            }
          : undefined,
    });
  }

  /**
   * Mints a presigned PUT URL the browser can upload a file directly to.
   * The object's long-lived Cache-Control is baked in at upload time.
   * @param key - The S3 object key to store the file under.
   * @param contentType - The MIME type the client will upload.
   * @returns The presigned PUT URL and the key it was signed for.
   */
  async getPresignedUploadUrl(
    key: string,
    contentType: string,
  ): Promise<PresignedUpload> {
    const command = new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
      ContentType: contentType,
      CacheControl: OBJECT_CACHE_CONTROL,
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: UPLOAD_URL_TTL_SECONDS,
    });

    return { url, key };
  }

  /**
   * Mints a signed GET URL an `<img>`/`<video>` can load directly. Uses a
   * CloudFront signed URL when CloudFront delivery is configured (link lifetime
   * is independent of the OIDC session); otherwise falls back to an S3 presigned
   * GET (local dev).
   * @param key - The stored S3 object key.
   * @param ttlSeconds - URL lifetime in seconds; defaults to the ~4h render TTL.
   * @returns The signed GET URL.
   */
  async getPresignedDownloadUrl(
    key: string,
    ttlSeconds: number = DEFAULT_DOWNLOAD_TTL_SECONDS,
  ): Promise<string> {
    if (this.cloudfront) {
      return getCloudFrontSignedUrl({
        url: `https://${this.cloudfront.domain}/${key}`,
        keyPairId: this.cloudfront.keyPairId,
        privateKey: this.cloudfront.privateKey,
        dateLessThan: new Date(Date.now() + ttlSeconds * 1000).toISOString(),
      });
    }

    const command = new GetObjectCommand({
      Bucket: this.config.bucket,
      Key: key,
    });

    return getSignedUrl(this.client, command, { expiresIn: ttlSeconds });
  }
}
