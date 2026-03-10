import { createAuthClient } from "better-auth/react";

/**
 * Client-side auth instance.
 * Used by client components for social sign-in and session hooks.
 */
export const authClient = createAuthClient();
