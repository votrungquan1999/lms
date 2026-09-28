import { createAuthService } from "src/lib/auth-service";
import { realAuthServiceDeps } from "src/tests/auth-service-deps";
import { signedInHeaders, testConfig } from "src/tests/auth-test-helpers";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

/**
 * Feature: a signup request cannot grant itself the admin role
 * As the school
 * I want the sign-up request body to have no say over the role it is given
 * So that D15's `input: false` is proven empirically — the enforcement site
 * was never located by reading the Better Auth bundle
 */

const dbIt = withTestDb(it);

describe("Feature: a signup request cannot grant itself the admin role", () => {
  dbIt(
    "posting role: admin in the sign-up body does not make the created user an admin",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      // A real HTTP-shaped request — not the typed api.signUpEmail() wrapper —
      // so TypeScript's excess-property check can't be the thing blocking `role`.
      const request = new Request(
        "http://localhost:3000/api/auth/sign-up/email",
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            email: "attacker@example.com",
            password: "password-123",
            name: "Attacker",
            role: "admin",
          }),
        },
      );

      const response = await authService.auth.handler(request);
      expect(response.status).toBe(200);

      const storedUser = await db
        .collection("user")
        .findOne({ email: "attacker@example.com" });

      expect(storedUser).not.toBeNull();
      expect(storedUser?.role).toBe("student");
    },
  );

  dbIt(
    "a signed-in student posting role: admin to /api/auth/update-user does not change their stored role",
    async ({ db }) => {
      const authService = createAuthService(
        db,
        testConfig(),
        realAuthServiceDeps(db),
      );

      await authService.auth.api.signUpEmail({
        body: {
          email: "victim@example.com",
          password: "password-123",
          name: "Victim",
        },
      });
      const headers = await signedInHeaders(
        authService,
        "victim@example.com",
        "password-123",
      );

      const request = new Request(
        "http://localhost:3000/api/auth/update-user",
        {
          method: "POST",
          headers: {
            ...Object.fromEntries(headers.entries()),
            "content-type": "application/json",
          },
          body: JSON.stringify({ role: "admin" }),
        },
      );
      const response = await authService.auth.handler(request);
      expect(response.ok).toBe(false);

      const storedUser = await db
        .collection("user")
        .findOne({ email: "victim@example.com" });

      expect(storedUser).not.toBeNull();
      expect(storedUser?.role).toBe("student");
    },
  );
});
