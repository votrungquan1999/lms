import { afterEach, describe, expect, it, vi } from "vitest";
import { loadConfig } from "../config";

/**
 * Stubs every S3-relevant env var explicitly (empty string = "absent", since
 * loadConfig treats falsy as unset) so each test is isolated from the real env.
 */
function stubS3Env(overrides: Record<string, string>): void {
  const env: Record<string, string> = {
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    AWS_REGION: "ap-southeast-1",
    S3_BUCKET_NAME: "quanvo-lms",
    AWS_ROLE_ARN: "",
    AWS_ACCESS_KEY_ID: "",
    AWS_SECRET_ACCESS_KEY: "",
    CLOUDFRONT_DOMAIN: "",
    CLOUDFRONT_KEY_PAIR_ID: "",
    CLOUDFRONT_PRIVATE_KEY: "",
    ...overrides,
  };
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("loadConfig S3 credentials", () => {
  it("uses AWS_ROLE_ARN (OIDC) + S3_BUCKET_NAME when the role is set", () => {
    // Given a Vercel-style env: a bucket name and an OIDC role, no static keys
    stubS3Env({ AWS_ROLE_ARN: "arn:aws:iam::847822617400:role/lms-s3-access" });

    // When config is loaded
    const config = loadConfig();

    // Then S3 config carries the bucket, region, and OIDC role (no static keys)
    expect(config.s3).toEqual({
      bucket: "quanvo-lms",
      region: "ap-southeast-1",
      roleArn: "arn:aws:iam::847822617400:role/lms-s3-access",
      accessKeyId: undefined,
      secretAccessKey: undefined,
    });
  });

  it("falls back to static keys when no role is set (local dev)", () => {
    // Given a local-dev env: static keys, no OIDC role
    stubS3Env({
      AWS_ACCESS_KEY_ID: "AKIAEXAMPLE",
      AWS_SECRET_ACCESS_KEY: "s3cr3t",
    });

    // When config is loaded
    const config = loadConfig();

    // Then the static keys are carried and no role is set
    expect(config.s3).toEqual({
      bucket: "quanvo-lms",
      region: "ap-southeast-1",
      roleArn: undefined,
      accessKeyId: "AKIAEXAMPLE",
      secretAccessKey: "s3cr3t",
    });
  });

  it("throws when neither a role nor a complete static key pair is set", () => {
    // Given an env with a bucket + region but no usable credentials
    stubS3Env({ AWS_ACCESS_KEY_ID: "AKIAEXAMPLE" }); // secret missing

    // When config is loaded, Then it throws naming the accepted auth options
    expect(() => loadConfig()).toThrow(/AWS_ROLE_ARN.*AWS_ACCESS_KEY_ID/);
  });
});

describe("loadConfig CloudFront", () => {
  it("loads the cloudfront block when all CLOUDFRONT_* vars are set", () => {
    // Given a Vercel-style env with the CloudFront signing values injected
    stubS3Env({
      AWS_ROLE_ARN: "arn:aws:iam::847822617400:role/lms-s3-access",
      CLOUDFRONT_DOMAIN: "d111abc.cloudfront.net",
      CLOUDFRONT_KEY_PAIR_ID: "K1234567890",
      CLOUDFRONT_PRIVATE_KEY:
        "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    });

    // When config is loaded
    const config = loadConfig();

    // Then the cloudfront block carries the domain, key pair id, and private key
    expect(config.cloudfront).toEqual({
      domain: "d111abc.cloudfront.net",
      keyPairId: "K1234567890",
      privateKey: "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
    });
  });

  it("leaves cloudfront undefined when no CLOUDFRONT_* vars are set (local dev)", () => {
    // Given a local-dev env with S3 creds but no CloudFront vars
    stubS3Env({ AWS_ROLE_ARN: "arn:aws:iam::847822617400:role/lms-s3-access" });

    // When config is loaded, Then there is no cloudfront block
    expect(loadConfig().cloudfront).toBeUndefined();
  });

  it("throws when CloudFront is only partially configured", () => {
    // Given only the domain set (key pair id + private key missing)
    stubS3Env({
      AWS_ROLE_ARN: "arn:aws:iam::847822617400:role/lms-s3-access",
      CLOUDFRONT_DOMAIN: "d111abc.cloudfront.net",
    });

    // When config is loaded, Then it throws naming the CloudFront vars
    expect(() => loadConfig()).toThrow(
      /CLOUDFRONT_DOMAIN.*CLOUDFRONT_PRIVATE_KEY/,
    );
  });
});
