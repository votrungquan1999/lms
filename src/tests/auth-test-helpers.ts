import type { AuthService } from "src/lib/auth-service";
import type { AppConfig } from "src/lib/config";

/**
 * A real, valid AppConfig for tests that build a real AuthService — every
 * field is a harmless placeholder (no network call ever reads them), except
 * `adminEmails`, which callers pass to control the owner check.
 */
export function testConfig(adminEmails: string[] = []): AppConfig {
  return {
    mongodbUri: "unused-in-test",
    authSecret: "test-secret",
    authAllowedHosts: ["localhost:3000"],
    google: { clientId: "test-client-id", clientSecret: "test-client-secret" },
    s3: {
      bucket: "test-bucket",
      region: "ap-southeast-1",
      accessKeyId: "test-key",
      secretAccessKey: "test-secret",
    },
    adminEmails,
    trustedOrigins: [],
    allowPublicSignUp: false,
  };
}

/**
 * Signs in through the real Better Auth instance and turns the response's
 * Set-Cookie header into a Cookie header usable by AuthService.getSession.
 */
export async function signedInHeaders(
  authService: AuthService,
  email: string,
  password: string,
): Promise<Headers> {
  const { headers: signInHeaders } = await authService.auth.api.signInEmail({
    body: { email, password },
    returnHeaders: true,
  });
  const cookie = signInHeaders
    .getSetCookie()
    .map((entry) => entry.split(";")[0])
    .join("; ");
  return new Headers({ cookie });
}
