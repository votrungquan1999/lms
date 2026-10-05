/**
 * Bun script: preview, then apply, moving existing pre-multi-tenant data
 * and admins into a default school.
 *
 * Usage:
 *   bun scripts/backfill-schools.ts [--school-name <name>] [--apply]
 *
 * Runbook: see the "Multi-Tenant Backfill Runbook" section of
 * scripts/instruction.md for the full deploy-order precondition (dry run
 * before the branch is pushed, --apply again right after the production
 * promote, and the older-deployments step) — this JSDoc covers only what
 * to do when the dry run itself reports a problem.
 *
 * Reads MONGODB_URI from env (Bun auto-loads .env.local at the repo root
 * — NEVER run this from the worktree root; run it only through the
 * Vitest subprocess harness in scripts/__tests__, or by hand with an
 * explicit MONGODB_URI, per the runbook).
 *
 * Dry run (default) writes nothing. --apply writes, but refuses first
 * while any duplicate student username or sign-in account (authUserId)
 * exists — recover those, then rerun:
 *   - Duplicate username: rename the stale row directly in Mongo
 *     (`db.student.updateOne({id}, {$set:{username: "..."}})`), or delete
 *     it if it was never a real account. The dry-run report's created date
 *     and enrollment count tell you which row is the real one.
 *   - Duplicate authUserId: one row's sign-in account was deleted or
 *     reused — delete the orphaned student row.
 * There is no rename UI; these are direct database fixes.
 *
 * Booting the new build while any such duplicate exists (the dry run
 * lists them) makes every request fail until it is resolved — the app
 * cannot create its unique username and sign-in-account indexes — so
 * resolve them before any boot.
 *
 * Idempotent and safe to rerun at any time: a rerun after the owner
 * creates a second school or edits admins grants nothing new, moves
 * nothing between schools, and never guesses a school for a still-
 * unassigned root once another school exists.
 */

import { type Db, MongoClient, MongoServerError, ObjectId } from "mongodb";
import type { CourseDocument } from "../src/lib/course-service";
import { ensureIndexes } from "../src/lib/database";
import type { EnrollmentDocument } from "../src/lib/enrollment-service";
import { SchoolService } from "../src/lib/school-service";
import { Role } from "../src/lib/session";
import type { StudentDocument } from "../src/lib/student-service";
import { describeMongoTarget } from "./mongo-target";
import { getArgValue } from "./script-args";

const uri = process.env.MONGODB_URI;

if (!uri) {
  console.error("MONGODB_URI is not set in the environment");
  process.exit(1);
}

const client = new MongoClient(uri);

const DEFAULT_SCHOOL_SLUG = "default";
const BACKFILL_AUTHOR = "backfill-schools-script";
/**
 * The old, unscoped join-queue index this backfill retires. Mongo's own
 * default naming for an unnamed `{status:1, requestedAt:1, _id:1}` index
 * — confirmed against a real local instance, not guessed.
 */
const OLD_QUEUE_INDEX_NAME = "status_1_requestedAt_1__id_1";
/** MongoServerError code for "index not found" — a fresh DB never had it. */
const INDEX_NOT_FOUND_CODE = 27;
/** MongoDB duplicate-key error code (E11000). */
const DUPLICATE_KEY_CODE = 11000;
/** Matches a record with no school — Mongo's `null` also matches a missing key. */
const UNASSIGNED = { schoolId: null };

/** One student in a duplicate group, with enough detail to pick which to keep. */
interface DuplicateStudentInfo {
  id: string;
  authUserId: string;
  createdAt: Date;
  enrollmentCount: number;
}

/** One group of students sharing the same username or authUserId value. */
interface DuplicateGroup {
  value: string | null;
  students: DuplicateStudentInfo[];
}

/**
 * Groups students by a field, missing and null folded into the same group —
 * a non-sparse unique index treats them as equal, so a rerun would collide
 * on either combination the same way. Each member is enriched with its
 * sign-in account, created date and enrollment count, so the operator can
 * tell which row is the real account before renaming or deleting the
 * other by hand.
 */
async function findDuplicates(
  db: Db,
  field: "username" | "authUserId",
): Promise<DuplicateGroup[]> {
  const students = db.collection<StudentDocument>("student");
  const enrollments = db.collection("enrollment");
  const groups = await students
    .aggregate<{ _id: string | null; studentIds: string[]; count: number }>([
      {
        $group: {
          _id: `$${field}`,
          studentIds: { $push: "$id" },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  const result: DuplicateGroup[] = [];
  for (const group of groups) {
    const docs = await students
      .find({ id: { $in: group.studentIds } })
      .toArray();
    const infos: DuplicateStudentInfo[] = [];
    for (const doc of docs) {
      const enrollmentCount = await enrollments.countDocuments({
        studentId: doc.id,
      });
      infos.push({
        id: doc.id,
        authUserId: doc.authUserId,
        createdAt: doc.createdAt,
        enrollmentCount,
      });
    }
    result.push({ value: group._id, students: infos });
  }
  return result;
}

/** Prints one field's duplicate report; returns whether any were found. */
function reportDuplicates(field: string, groups: DuplicateGroup[]): boolean {
  if (groups.length === 0) {
    console.log(`No duplicate student ${field} values found.`);
    return false;
  }
  console.log(
    `${groups.length} duplicate student ${field} value(s) found (--apply refused while any exist):`,
  );
  for (const group of groups) {
    console.log(`  ${field}=${JSON.stringify(group.value)}:`);
    for (const student of group.students) {
      console.log(
        `    ${student.id} (authUserId=${student.authUserId}, created ${student.createdAt.toISOString()}, ${student.enrollmentCount} enrollment(s))`,
      );
    }
  }
  return true;
}

/** A child record with no school yet, and which category it falls into. */
interface ChildReport {
  orphanIds: string[];
  waitingIds: string[];
  /** Parent exists and has a school — this child can be stamped with it. */
  stampable: { id: string; schoolId: string }[];
}

/**
 * Finds every unassigned row in a child collection and sorts it into an
 * orphan (parent doesn't exist), a waiting child (parent exists but has no
 * school yet) or stampable (parent's school is known).
 */
async function categorizeChildren(
  db: Db,
  childCollectionName: string,
  parentCollectionName: string,
  parentIdField: string,
): Promise<ChildReport> {
  const children = db.collection(childCollectionName);
  const parents = db.collection<{ id: string; schoolId: string | null }>(
    parentCollectionName,
  );
  const unassigned = await children.find(UNASSIGNED).toArray();

  const report: ChildReport = { orphanIds: [], waitingIds: [], stampable: [] };
  for (const child of unassigned) {
    const parentId = child[parentIdField] as string;
    const parent = await parents.findOne({ id: parentId });
    if (!parent) {
      report.orphanIds.push(child.id);
    } else if (!parent.schoolId) {
      report.waitingIds.push(child.id);
    } else {
      report.stampable.push({ id: child.id, schoolId: parent.schoolId });
    }
  }
  return report;
}

/** The three child collections whose school is derived from a parent. */
const CHILD_SPECS = [
  { child: "test", parent: "course", parentIdField: "courseId" },
  { child: "course_join_request", parent: "course", parentIdField: "courseId" },
  { child: "pool_question", parent: "question_pool", parentIdField: "poolId" },
] as const;

/**
 * Counts children already stamped with a school that differs from their
 * existing parent's. Reported for a manual decision, never rewritten: the
 * backfill only fills in a missing school, it never moves a record.
 */
async function countMismatchedChildren(
  db: Db,
  childCollectionName: string,
  parentCollectionName: string,
  parentIdField: string,
): Promise<number> {
  const parents = db.collection<{ id: string; schoolId: string | null }>(
    parentCollectionName,
  );
  const stamped = await db
    .collection(childCollectionName)
    .find({ schoolId: { $ne: null } })
    .toArray();

  let mismatched = 0;
  for (const child of stamped) {
    const parent = await parents.findOne({
      id: child[parentIdField] as string,
    });
    if (parent && parent.schoolId !== child.schoolId) {
      mismatched++;
    }
  }
  return mismatched;
}

/** An enrollment whose course and student are stamped with different schools. */
interface CrossSchoolEnrollment {
  id: string;
  courseId: string;
  courseSchoolId: string;
  studentId: string;
  studentSchoolId: string;
}

/**
 * Finds enrollments whose course and student both have a school, but not the
 * same one. Reported for a manual decision, never rewritten: enrollments
 * carry no school, so the app already hides such a row from both schools.
 */
async function findCrossSchoolEnrollments(
  db: Db,
): Promise<CrossSchoolEnrollment[]> {
  const [courses, students, enrollments] = await Promise.all([
    db
      .collection<CourseDocument>("course")
      .find({ schoolId: { $ne: null } })
      .toArray(),
    db
      .collection<StudentDocument>("student")
      .find({ schoolId: { $ne: null } })
      .toArray(),
    db.collection<EnrollmentDocument>("enrollment").find({}).toArray(),
  ]);
  const courseSchools = new Map(courses.map((c) => [c.id, c.schoolId]));
  const studentSchools = new Map(students.map((s) => [s.id, s.schoolId]));

  const crossing: CrossSchoolEnrollment[] = [];
  for (const enrollment of enrollments) {
    const courseSchoolId = courseSchools.get(enrollment.courseId);
    const studentSchoolId = studentSchools.get(enrollment.studentId);
    // An unassigned or missing side is not a second school.
    if (
      courseSchoolId &&
      studentSchoolId &&
      courseSchoolId !== studentSchoolId
    ) {
      crossing.push({
        id: enrollment.id,
        courseId: enrollment.courseId,
        courseSchoolId,
        studentId: enrollment.studentId,
        studentSchoolId,
      });
    }
  }
  return crossing;
}

/** Prints every cross-school enrollment, one per line, after a count. */
function reportCrossSchoolEnrollments(rows: CrossSchoolEnrollment[]): void {
  console.log(
    `Enrollments whose course and student are in different schools: ${rows.length} (reported only, never changed)`,
  );
  for (const row of rows) {
    console.log(
      `  ${row.id}: course ${row.courseId} (${row.courseSchoolId}), student ${row.studentId} (${row.studentSchoolId})`,
    );
  }
}

/**
 * Drops the old unscoped join-queue index if present. A fresh database
 * that never had it still applies cleanly — only IndexNotFound (27) is
 * swallowed; anything else is a real failure and rethrows.
 */
async function dropOldQueueIndexIfPresent(db: Db): Promise<void> {
  try {
    await db.collection("course_join_request").dropIndex(OLD_QUEUE_INDEX_NAME);
  } catch (err) {
    if (err instanceof MongoServerError && err.code === INDEX_NOT_FOUND_CODE) {
      return;
    }
    throw err;
  }
}

/** Raw better-auth `user` collection shape this script reads and writes. */
interface UserDocument {
  _id: ObjectId;
  role?: string;
  schoolAccessManagedAt?: Date;
}

/**
 * Grants default-school membership to every legacy admin — `role: "admin"`
 * with no `schoolAccessManagedAt` marker. The marker check gates the grant
 * before it happens: an admin already managed by hand (added to any school,
 * or removed from one) already carries the marker and is skipped, so a
 * rerun never re-grants what the owner deliberately changed.
 * `SchoolService.addMembership` stamps the marker as its own side effect;
 * an admin whose membership exists without the marker (a run stopped
 * between the two writes) only gets the marker, so a rerun can finish.
 */
async function grantLegacyAdminMemberships(
  db: Db,
  schoolService: SchoolService,
  schoolId: string,
): Promise<number> {
  const users = db.collection<UserDocument>("user");
  const legacyAdmins = await users
    .find({ role: Role.Admin, schoolAccessManagedAt: { $exists: false } })
    .toArray();
  for (const user of legacyAdmins) {
    try {
      await schoolService.addMembership(
        schoolId,
        user._id.toHexString(),
        BACKFILL_AUTHOR,
      );
    } catch (err) {
      if (
        !(err instanceof MongoServerError && err.code === DUPLICATE_KEY_CODE)
      ) {
        throw err;
      }
      // A run stopped after the membership insert but before the marker:
      // already a member, so only the marker is missing.
      await users.updateOne(
        { _id: user._id },
        { $set: { schoolAccessManagedAt: new Date() } },
      );
    }
  }
  return legacyAdmins.length;
}

/** Membership document shape, as `school_membership` stores it. */
interface SchoolMembershipDocument {
  id: string;
  schoolId: string;
  userId: string;
}

/**
 * Deletes a `default` membership whose user is no longer `role: "admin"`.
 * The old, pre-multi-tenant build revokes with a bare `$set: {role}`, so a
 * membership granted by an earlier apply outlives the revoke, marker and
 * all — hence no marker check here. The current build's revoke
 * (`revokeAdminAction`) deletes every membership right after the role
 * flip, so retracting only ever finishes a revoke. Writes the collection
 * directly: `SchoolService.removeMembership` would re-stamp the marker.
 */
async function retractStaleDefaultMemberships(
  db: Db,
  schoolId: string,
): Promise<number> {
  const memberships =
    db.collection<SchoolMembershipDocument>("school_membership");
  const users = db.collection<UserDocument>("user");
  const rows = await memberships.find({ schoolId }).toArray();

  let retracted = 0;
  for (const row of rows) {
    const user = await users.findOne({ _id: new ObjectId(row.userId) });
    const isAdmin = user?.role === Role.Admin;
    if (!isAdmin) {
      await memberships.deleteOne({ id: row.id });
      retracted++;
    }
  }
  return retracted;
}

/** Stamps every unassigned row in a root collection with the given school. */
async function stampRoots(
  db: Db,
  collectionName: string,
  schoolId: string,
): Promise<number> {
  const result = await db
    .collection(collectionName)
    .updateMany(UNASSIGNED, { $set: { schoolId } });
  return result.modifiedCount;
}

async function run(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const schoolName =
    getArgValue(process.argv, "--school-name") ?? "Default school";

  try {
    await client.connect();
    const db = client.db();
    console.log(`Target: ${describeMongoTarget(uri)}`);

    const usernameDuplicates = await findDuplicates(db, "username");
    const authUserIdDuplicates = await findDuplicates(db, "authUserId");
    const hasUsernameDuplicates = reportDuplicates(
      "username",
      usernameDuplicates,
    );
    const hasAuthUserIdDuplicates = reportDuplicates(
      "authUserId",
      authUserIdDuplicates,
    );

    const rootCollections = ["course", "student", "question_pool"] as const;
    const unassignedRootCounts = await Promise.all(
      rootCollections.map((name) =>
        db.collection(name).countDocuments(UNASSIGNED),
      ),
    );
    console.log(
      `Unassigned roots: ${unassignedRootCounts[0]} course(s), ${unassignedRootCounts[1]} student(s), ${unassignedRootCounts[2]} question pool(s)`,
    );

    const childReports = await Promise.all(
      CHILD_SPECS.map((spec) =>
        categorizeChildren(db, spec.child, spec.parent, spec.parentIdField),
      ),
    );
    const totalOrphans = childReports.reduce(
      (n, r) => n + r.orphanIds.length,
      0,
    );
    const totalWaiting = childReports.reduce(
      (n, r) => n + r.waitingIds.length,
      0,
    );
    console.log(
      `Children needing a school: ${totalOrphans} orphan(s) (parent missing), ${totalWaiting} waiting on their parent (parent not yet assigned a school)`,
    );
    const mismatchCounts = await Promise.all(
      CHILD_SPECS.map((spec) =>
        countMismatchedChildren(
          db,
          spec.child,
          spec.parent,
          spec.parentIdField,
        ),
      ),
    );
    const totalMismatches = mismatchCounts.reduce((n, count) => n + count, 0);
    console.log(
      `Children in a different school than their parent: ${totalMismatches} mismatch(es) (reported only, never changed)`,
    );
    reportCrossSchoolEnrollments(await findCrossSchoolEnrollments(db));

    if (!apply) {
      console.log(
        "Dry run only — no changes written. Re-run with --apply to write these changes.",
      );
      return;
    }

    if (hasUsernameDuplicates || hasAuthUserIdDuplicates) {
      console.log(
        "Duplicates found — refusing to apply. See the recovery steps in this script's JSDoc.",
      );
      return;
    }

    // Correctness indexes first: a production conflict surfaces here,
    // before anything is stamped, rather than breaking a later boot.
    await ensureIndexes(db);
    await dropOldQueueIndexIfPresent(db);

    const schoolService = new SchoolService(db);
    // Read before ensuring `default` — root-stamping is gated on whether
    // any OTHER school already exists, which a rerun's own `default` must
    // never count against itself.
    const schoolsBefore = await schoolService.listSchools();
    const otherSchoolExists = schoolsBefore.some(
      (school) => school.slug !== DEFAULT_SCHOOL_SLUG,
    );
    const school = await schoolService.ensureSchoolBySlug({
      slug: DEFAULT_SCHOOL_SLUG,
      name: schoolName,
      createdBy: BACKFILL_AUTHOR,
    });

    if (otherSchoolExists) {
      console.log(
        "Another school already exists — unassigned roots are reported only, never guessed.",
      );
    } else {
      for (const name of rootCollections) {
        const modified = await stampRoots(db, name, school.id);
        console.log(
          `Stamped ${modified} unassigned ${name} row(s) with "${school.slug}".`,
        );
      }
    }

    // Children are derived from their parent's CURRENT school, read fresh
    // after root-stamping so a parent stamped moments ago still counts.
    let totalStamped = 0;
    for (const spec of CHILD_SPECS) {
      const report = await categorizeChildren(
        db,
        spec.child,
        spec.parent,
        spec.parentIdField,
      );
      for (const { id, schoolId } of report.stampable) {
        await db
          .collection(spec.child)
          .updateOne({ id }, { $set: { schoolId } });
        totalStamped++;
      }
    }
    console.log(
      `Stamped ${totalStamped} child row(s) from their parent's school.`,
    );

    const grantedCount = await grantLegacyAdminMemberships(
      db,
      schoolService,
      school.id,
    );
    console.log(
      `Granted ${grantedCount} legacy admin(s) membership in "${school.slug}".`,
    );

    const retractedCount = await retractStaleDefaultMemberships(db, school.id);
    console.log(
      `Retracted ${retractedCount} stale "${school.slug}" membership(s) (their admin access was already revoked).`,
    );

    console.log(`Applied. Default school: "${school.name}" (${school.id}).`);
  } finally {
    await client.close();
  }
}

run();
