/**
 * Global application configuration.
 * Reads from environment variables with sensible defaults.
 */

export interface AppConfig {
  /** MongoDB connection URI. */
  mongodbUri: string;
  /** Secret for Better Auth session signing. */
  authSecret: string;
  /** Allowed hosts for dynamic base URL resolution. */
  authAllowedHosts: string[];
  /** Google OAuth credentials (required). */
  google: {
    clientId: string;
    clientSecret: string;
  };
  /**
   * S3 object storage for question media. Auth is keyless OIDC in production
   * (`roleArn` from `AWS_ROLE_ARN`); static keys are a local-dev fallback.
   */
  s3: {
    bucket: string;
    region: string;
    roleArn?: string;
    accessKeyId?: string;
    secretAccessKey?: string;
  };
  /**
   * CloudFront signed-URL delivery for reads. Present in production/preview
   * (injected by personal-infra); absent locally, where reads fall back to S3
   * presigned GET.
   */
  cloudfront?: {
    domain: string;
    keyPairId: string;
    privateKey: string;
  };
  /** List of email addresses recognized as admin. */
  adminEmails: string[];
  /** Trusted origins for Better Auth CORS. */
  trustedOrigins: string[];
}

/**
 * Loads app config from environment variables with defaults.
 */
export function loadConfig(): AppConfig {
  const googleClientId = process.env.GOOGLE_CLIENT_ID;
  const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET;

  if (!googleClientId || !googleClientSecret) {
    throw new Error(
      "Missing required env vars: GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set",
    );
  }

  const s3Bucket = process.env.S3_BUCKET_NAME;
  const s3Region = process.env.AWS_REGION;
  const s3RoleArn = process.env.AWS_ROLE_ARN;
  const s3AccessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const s3SecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  const hasStaticKeys = Boolean(s3AccessKeyId && s3SecretAccessKey);

  if (!s3Bucket || !s3Region || (!s3RoleArn && !hasStaticKeys)) {
    throw new Error(
      "Missing required env vars: S3_BUCKET_NAME and AWS_REGION are required, plus either AWS_ROLE_ARN (OIDC) or AWS_ACCESS_KEY_ID + AWS_SECRET_ACCESS_KEY (static)",
    );
  }

  const cfDomain = process.env.CLOUDFRONT_DOMAIN;
  const cfKeyPairId = process.env.CLOUDFRONT_KEY_PAIR_ID;
  const cfPrivateKey = process.env.CLOUDFRONT_PRIVATE_KEY;
  const cfVarsSet = [cfDomain, cfKeyPairId, cfPrivateKey].filter(
    Boolean,
  ).length;
  if (cfVarsSet !== 0 && cfVarsSet !== 3) {
    throw new Error(
      "CloudFront is partially configured: set all of CLOUDFRONT_DOMAIN, CLOUDFRONT_KEY_PAIR_ID, CLOUDFRONT_PRIVATE_KEY, or none (local dev falls back to S3 presigned URLs)",
    );
  }

  return {
    mongodbUri: process.env.MONGODB_URI ?? "mongodb://localhost:27017/lms",
    authSecret:
      process.env.BETTER_AUTH_SECRET ?? "dev-secret-change-in-production",
    authAllowedHosts: (process.env.AUTH_ALLOWED_HOSTS ?? "localhost:3000")
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean),
    google: { clientId: googleClientId, clientSecret: googleClientSecret },
    s3: {
      bucket: s3Bucket,
      region: s3Region,
      roleArn: s3RoleArn || undefined,
      accessKeyId: s3AccessKeyId || undefined,
      secretAccessKey: s3SecretAccessKey || undefined,
    },
    cloudfront:
      cfDomain && cfKeyPairId && cfPrivateKey
        ? {
            domain: cfDomain,
            keyPairId: cfKeyPairId,
            privateKey: cfPrivateKey,
          }
        : undefined,
    adminEmails: (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
    trustedOrigins: (process.env.TRUSTED_ORIGINS ?? "")
      .split(",")
      .map((e) => e.trim())
      .filter(Boolean),
  };
}
