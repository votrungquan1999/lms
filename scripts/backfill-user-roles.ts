import { MongoClient, type ObjectId } from "mongodb";
import { Role } from "../src/lib/session";

/**
 * One-off backfill for the pre-role-model era (D17, D21).
 *
 * Rule: an `@lms.internal` synthetic address (every student created before
 * this feature) becomes `student`; any real address becomes `admin`.
 *
 * Report-then-apply, not idempotent-and-silent: today a real-email account
 * outside ADMIN_EMAILS has NO access at all, and the signup endpoint is
 * still open — so this rule PROMOTES anything that already slipped through.
 * A bare run only prints who would be promoted; `--apply` writes.
 *
 * Scoped to `{ role: { $exists: false } }` only — not a re-runnable sweep.
 * Once the feature ships, a Google self-registrant has a real Gmail address
 * too, and re-applying the raw "real email -> admin" rule to it would
 * silently promote a student. Roleless documents are exactly the accounts
 * that pre-date the field, so this scoping stays correct forever.
 *
 * PRECONDITION: deploy the role-model build (the one that makes every new
 * signup persist `role: Role.Student`) before running this. Against an
 * older build, new signups are still roleless, and `--apply` would promote
 * them right alongside the real pre-existing backlog (the exact risk D17
 * flagged) — the window this script assumes is empty is only actually
 * empty once that build is live.
 */

const SYNTHETIC_EMAIL_SUFFIX = "@lms.internal";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set in the environment");
  process.exit(1);
}

const client = new MongoClient(uri);

interface RolelessUserDocument {
  _id: ObjectId;
  email?: string | null;
}

/** Guards against a missing/null/empty email fail-opening into ADMIN. */
function hasUsableEmail(
  doc: RolelessUserDocument,
): doc is RolelessUserDocument & { email: string } {
  return typeof doc.email === "string" && doc.email.length > 0;
}

function isSyntheticEmail(email: string): boolean {
  return email.endsWith(SYNTHETIC_EMAIL_SUFFIX);
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");

  try {
    await client.connect();
    console.log("Connected successfully to MongoDB");

    const collection = client.db().collection<RolelessUserDocument>("user");

    const roleless = await collection
      .find({ role: { $exists: false } })
      .toArray();

    const usable = roleless.filter(hasUsableEmail);
    const skipped = roleless.filter((doc) => !hasUsableEmail(doc));
    const toStudent = usable.filter((doc) => isSyntheticEmail(doc.email));
    const toAdmin = usable.filter((doc) => !isSyntheticEmail(doc.email));

    console.log(`Found ${roleless.length} account(s) with no recorded role.`);
    console.log(
      `${toStudent.length} will become student (${SYNTHETIC_EMAIL_SUFFIX} address).`,
    );
    console.log(
      `${toAdmin.length} will become admin (real email address)${toAdmin.length > 0 ? ":" : "."}`,
    );
    for (const doc of toAdmin) {
      console.log(`  - ${doc.email}`);
    }
    if (skipped.length > 0) {
      console.log(
        `${skipped.length} account(s) skipped — no usable email; left roleless.`,
      );
    }

    if (!apply) {
      console.log(
        "\nDry run only — no changes written. Re-run with --apply to write these roles.",
      );
      return;
    }

    if (toStudent.length > 0) {
      const result = await collection.updateMany(
        {
          _id: { $in: toStudent.map((doc) => doc._id) },
          role: { $exists: false },
        },
        { $set: { role: Role.Student } },
      );
      console.log(`Set role=student on ${result.modifiedCount} account(s).`);
    }

    if (toAdmin.length > 0) {
      const result = await collection.updateMany(
        {
          _id: { $in: toAdmin.map((doc) => doc._id) },
          role: { $exists: false },
        },
        { $set: { role: Role.Admin } },
      );
      console.log(`Set role=admin on ${result.modifiedCount} account(s).`);
    }

    console.log("Backfill complete.");
  } catch (err) {
    console.error("Backfill failed:", err);
    process.exit(1);
  } finally {
    await client.close();
  }
}

run();
