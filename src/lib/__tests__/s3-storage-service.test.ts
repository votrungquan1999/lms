import { GetObjectCommand, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl as getCloudFrontSignedUrl } from "@aws-sdk/cloudfront-signer";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { awsCredentialsProvider } from "@vercel/oidc-aws-credentials-provider";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { S3StorageService } from "../s3-storage-service";

vi.mock("@aws-sdk/s3-request-presigner", () => ({
  getSignedUrl: vi.fn(async () => "https://signed.example/put"),
}));

vi.mock("@aws-sdk/cloudfront-signer", () => ({
  getSignedUrl: vi.fn(() => "https://cdn.example/media/abc.png?Signature=x"),
}));

vi.mock("@vercel/oidc-aws-credentials-provider", () => ({
  awsCredentialsProvider: vi.fn(() => async () => ({
    accessKeyId: "oidc-key",
    secretAccessKey: "oidc-secret",
    sessionToken: "oidc-token",
  })),
}));

const testS3Config = {
  bucket: "test-bucket",
  region: "ap-southeast-1",
  accessKeyId: "test-key",
  secretAccessKey: "test-secret",
};

beforeEach(() => {
  vi.mocked(getSignedUrl).mockClear();
  vi.mocked(getCloudFrontSignedUrl).mockClear();
  vi.mocked(awsCredentialsProvider).mockClear();
});

describe("S3StorageService.getPresignedDownloadUrl with CloudFront", () => {
  const cfConfig = {
    domain: "d111abc.cloudfront.net",
    keyPairId: "K123",
    privateKey: "-----BEGIN PRIVATE KEY-----\nx\n-----END PRIVATE KEY-----",
  };

  it("returns a CloudFront signed URL (not S3) when cloudfront config is provided", async () => {
    // Given a service configured with CloudFront delivery, at a fixed time
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-09T00:00:00.000Z"));
    const service = new S3StorageService(testS3Config, cfConfig);

    // When a download URL is requested with a 4h TTL
    const url = await service.getPresignedDownloadUrl(
      "media/questions/abc.png",
      14400,
    );

    // Then the CloudFront-signed URL is returned, signed for the right resource + expiry
    expect(url).toBe("https://cdn.example/media/abc.png?Signature=x");
    expect(vi.mocked(getCloudFrontSignedUrl)).toHaveBeenCalledWith({
      url: "https://d111abc.cloudfront.net/media/questions/abc.png",
      keyPairId: "K123",
      privateKey: cfConfig.privateKey,
      dateLessThan: "2026-06-09T04:00:00.000Z",
    });
    // And it did NOT fall back to the S3 presigner
    expect(vi.mocked(getSignedUrl)).not.toHaveBeenCalled();

    vi.useRealTimers();
  });
});

describe("S3StorageService credentials", () => {
  it("wires the Vercel OIDC credentials provider when the config has a roleArn", () => {
    // Given an S3 config that authenticates via an OIDC role (no static keys)
    new S3StorageService({
      bucket: "test-bucket",
      region: "ap-southeast-1",
      roleArn: "arn:aws:iam::847822617400:role/lms-s3-access",
    });

    // Then the client is built with the OIDC provider for that exact role
    expect(vi.mocked(awsCredentialsProvider)).toHaveBeenCalledWith({
      roleArn: "arn:aws:iam::847822617400:role/lms-s3-access",
    });
  });

  it("does not use the OIDC provider when only static keys are configured", () => {
    // Given a static-key config (local dev)
    new S3StorageService(testS3Config);

    // Then the OIDC provider is never invoked
    expect(vi.mocked(awsCredentialsProvider)).not.toHaveBeenCalled();
  });
});

describe("S3StorageService.getPresignedUploadUrl", () => {
  it("returns a presigned PUT URL and the signed key for a key + content-type", async () => {
    // Given an S3 storage service backed by a configured private bucket
    const service = new S3StorageService(testS3Config);

    // When an upload URL is requested for a key and content-type
    const result = await service.getPresignedUploadUrl(
      "media/questions/abc.png",
      "image/png",
    );

    // Then the stubbed presigned URL and the signed key are returned
    expect(result).toEqual({
      url: "https://signed.example/put",
      key: "media/questions/abc.png",
    });

    // And the URL was signed for a PUT against the configured bucket/key/content-type
    const signedCommand = vi.mocked(getSignedUrl).mock.calls[0][1];
    expect(signedCommand).toBeInstanceOf(PutObjectCommand);
    expect((signedCommand as PutObjectCommand).input).toMatchObject({
      Bucket: "test-bucket",
      Key: "media/questions/abc.png",
      ContentType: "image/png",
    });
  });
});

describe("S3StorageService.getPresignedDownloadUrl", () => {
  it("returns a presigned GET URL signed for a ~4h default TTL when none is given", async () => {
    // Given an S3 storage service backed by a configured private bucket
    const service = new S3StorageService(testS3Config);

    // When a download URL is requested for a stored key without an explicit TTL
    const url = await service.getPresignedDownloadUrl(
      "media/questions/abc.png",
    );

    // Then the stubbed presigned URL is returned
    expect(url).toBe("https://signed.example/put");

    // And it was signed for a GET against the configured bucket/key with the default 4h TTL
    const [, signedCommand, options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(signedCommand).toBeInstanceOf(GetObjectCommand);
    expect((signedCommand as GetObjectCommand).input).toMatchObject({
      Bucket: "test-bucket",
      Key: "media/questions/abc.png",
    });
    expect(options).toEqual({ expiresIn: 14400 });
  });

  it("honors an explicit TTL when one is provided", async () => {
    // Given an S3 storage service
    const service = new S3StorageService(testS3Config);

    // When a download URL is requested with an explicit 600s TTL
    await service.getPresignedDownloadUrl("media/questions/abc.png", 600);

    // Then getSignedUrl was called with that exact expiry
    const [, , options] = vi.mocked(getSignedUrl).mock.calls[0];
    expect(options).toEqual({ expiresIn: 600 });
  });
});
