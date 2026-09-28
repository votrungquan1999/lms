/**
 * Local-only Mongo URI guard, shared by seed scripts that accept an operator
 * `--mongo-uri` flag. Split into its own file (no top-level side effect) so
 * it can be unit-tested directly — every script file itself runs `main()` at
 * import time, which would connect to Mongo if imported from a test.
 */

// "[::1]" keeps the brackets: that's how URL.hostname renders the IPv6
// loopback literal, not the bare "::1" the host would otherwise suggest.
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * True only when the URI's actual host is local — parsed, not grepped, so a
 * remote host with "localhost" elsewhere in the URI (db name, path, query)
 * is never mistaken for local. A multi-host URI's combined host and an
 * unparsable URI are both treated as not local: this guard fails closed.
 */
export function isLocalMongoUri(uri: string): boolean {
  try {
    return LOCAL_HOSTS.has(new URL(uri).hostname);
  } catch {
    return false;
  }
}
