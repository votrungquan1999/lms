/**
 * The admin's active-school choice — read from the raw `Cookie` header by
 * `AuthService`, written via `cookies().set(...)` by the switch-school
 * action. HttpOnly and unsigned: it is re-checked against the admin's
 * memberships on every request, so tampering can only ever pick among the
 * admin's own schools, and a revoked membership stops working immediately.
 */
export const ACTIVE_SCHOOL_COOKIE_NAME = "lms_active_school";

/**
 * Write options for `cookies().set(ACTIVE_SCHOOL_COOKIE_NAME, schoolId, ...)`.
 * Long-lived (400 days, the browser-enforced max): a school switch is a
 * standing choice, not a per-session one, so it should survive between
 * sign-ins the way "the school they last chose" implies.
 */
export const activeSchoolCookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 60 * 60 * 24 * 400,
};

/**
 * Reads the active-school cookie from a plain `Headers` object.
 * `AuthService` never sees Next's `cookies()` API, only the raw `Cookie`
 * header it already receives — this is the read-side counterpart to
 * `activeSchoolCookieOptions`'s write side.
 * @param headers - The request's headers.
 * @returns The cookie's raw value, or undefined if absent. Never validated
 * here: `classify` only ever compares it against the admin's own membership
 * list, so an untrusted or malformed value simply fails to match and falls
 * through to the default school — it must never reach a query.
 */
export function readActiveSchoolCookie(headers: Headers): string | undefined {
  const cookieHeader = headers.get("cookie");
  if (!cookieHeader) {
    return undefined;
  }

  for (const pair of cookieHeader.split(";")) {
    const separatorIndex = pair.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }
    const name = pair.slice(0, separatorIndex).trim();
    if (name === ACTIVE_SCHOOL_COOKIE_NAME) {
      // Not URI-decoded: school ids are UUIDs, which cookie encoding leaves
      // untouched, and decoding would throw on a tampered `%` value.
      return pair.slice(separatorIndex + 1).trim();
    }
  }
  return undefined;
}
