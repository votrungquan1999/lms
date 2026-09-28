import { ensureIndexes } from "src/lib/database";
import { SchoolService } from "src/lib/school-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: the platform owner creates a school and sees every school
 * As the platform owner
 * I want to create a school with a name and a unique slug
 * So that a tenant exists for admins and students to belong to
 */
describe("Feature: the platform owner creates a school and sees every school", () => {
  dbIt("creates a school and lists it", async ({ db }) => {
    const schoolService = new SchoolService(db);

    const created = await schoolService.createSchool({
      name: "Acme School",
      slug: "acme",
      createdBy: "owner-1",
    });

    expect(created.name).toBe("Acme School");
    expect(created.slug).toBe("acme");
    expect(created.id).toBeTruthy();

    const schools = await schoolService.listSchools();
    expect(schools).toHaveLength(1);
    expect(schools[0]).toEqual(created);
  });

  dbIt("refuses a second school with an already-taken slug", async ({ db }) => {
    await ensureIndexes(db);
    const schoolService = new SchoolService(db);
    await schoolService.createSchool({
      name: "Acme School",
      slug: "acme",
      createdBy: "owner-1",
    });

    await expect(
      schoolService.createSchool({
        name: "A Different Name",
        slug: "acme",
        createdBy: "owner-1",
      }),
    ).rejects.toMatchObject({ code: 11000 });

    const schools = await schoolService.listSchools();
    expect(schools).toHaveLength(1);
  });

  dbIt(
    "allows two schools with the same name but different slugs",
    async ({ db }) => {
      await ensureIndexes(db);
      const schoolService = new SchoolService(db);

      await schoolService.createSchool({
        name: "Same Name School",
        slug: "same-name-a",
        createdBy: "owner-1",
      });
      await schoolService.createSchool({
        name: "Same Name School",
        slug: "same-name-b",
        createdBy: "owner-1",
      });

      const schools = await schoolService.listSchools();
      expect(schools).toHaveLength(2);
      expect(schools.map((s) => s.slug).sort()).toEqual([
        "same-name-a",
        "same-name-b",
      ]);
    },
  );
});

/**
 * Feature: the platform owner manages a school's admins
 * As the platform owner
 * I want to add and remove a school's admins by membership
 * So that access to a school's data comes only from a recorded membership
 */
describe("Feature: the platform owner manages a school's admins", () => {
  dbIt(
    "adds a membership, and stamps the access-managed marker on the user",
    async ({ db }) => {
      const schoolService = new SchoolService(db);
      const school = await schoolService.createSchool({
        name: "Acme School",
        slug: "acme",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();

      await schoolService.addMembership(school.id, userId, "owner-1");

      const memberIds = await schoolService.listMembershipsForSchool(school.id);
      expect(memberIds).toEqual([userId]);
      const user = await db
        .collection("user")
        .findOne({ _id: insert.insertedId });
      expect(user?.schoolAccessManagedAt).toBeInstanceOf(Date);
    },
  );

  dbIt(
    "removes a membership, and stamps the access-managed marker on the user",
    async ({ db }) => {
      const schoolService = new SchoolService(db);
      const school = await schoolService.createSchool({
        name: "Acme School",
        slug: "acme",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();
      await schoolService.addMembership(school.id, userId, "owner-1");
      // Clear the add's stamp so only the remove can set it again.
      await db
        .collection("user")
        .updateOne(
          { _id: insert.insertedId },
          { $unset: { schoolAccessManagedAt: "" } },
        );

      await schoolService.removeMembership(school.id, userId);

      expect(await schoolService.listMembershipsForSchool(school.id)).toEqual(
        [],
      );
      const user = await db
        .collection("user")
        .findOne({ _id: insert.insertedId });
      expect(user?.schoolAccessManagedAt).toBeInstanceOf(Date);
    },
  );

  dbIt(
    "refuses a second membership add for the same school and user",
    async ({ db }) => {
      await ensureIndexes(db);
      const schoolService = new SchoolService(db);
      const school = await schoolService.createSchool({
        name: "Acme School",
        slug: "acme",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();
      await schoolService.addMembership(school.id, userId, "owner-1");

      await expect(
        schoolService.addMembership(school.id, userId, "owner-1"),
      ).rejects.toMatchObject({ code: 11000 });

      expect(await schoolService.listMembershipsForSchool(school.id)).toEqual([
        userId,
      ]);
    },
  );

  dbIt(
    "deleteMembershipsForUser removes every school for that user, and no one else's",
    async ({ db }) => {
      const schoolService = new SchoolService(db);
      const schoolA = await schoolService.createSchool({
        name: "A",
        slug: "school-a",
        createdBy: "owner-1",
      });
      const schoolB = await schoolService.createSchool({
        name: "B",
        slug: "school-b",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();
      await schoolService.addMembership(schoolA.id, userId, "owner-1");
      await schoolService.addMembership(schoolB.id, userId, "owner-1");
      const other = await db
        .collection("user")
        .insertOne({ email: "colleague@example.com", role: "admin" });
      const otherId = other.insertedId.toString();
      await schoolService.addMembership(schoolA.id, otherId, "owner-1");

      await schoolService.deleteMembershipsForUser(userId);

      expect(await schoolService.listSchoolsForUser(userId)).toEqual([]);
      expect(await schoolService.listSchoolsForUser(otherId)).toEqual([
        { id: schoolA.id, name: "A" },
      ]);
    },
  );

  dbIt(
    "listSchoolsForUser returns {id, name} for each of the user's schools, and no other",
    async ({ db }) => {
      const schoolService = new SchoolService(db);
      const schoolA = await schoolService.createSchool({
        name: "School A",
        slug: "school-a",
        createdBy: "owner-1",
      });
      const schoolB = await schoolService.createSchool({
        name: "School B",
        slug: "school-b",
        createdBy: "owner-1",
      });
      const insert = await db
        .collection("user")
        .insertOne({ email: "teacher@example.com", role: "admin" });
      const userId = insert.insertedId.toString();
      await schoolService.addMembership(schoolA.id, userId, "owner-1");
      await schoolService.addMembership(schoolB.id, userId, "owner-1");
      // A school with only someone else in it must not show up.
      const schoolC = await schoolService.createSchool({
        name: "School C",
        slug: "school-c",
        createdBy: "owner-1",
      });
      const other = await db
        .collection("user")
        .insertOne({ email: "colleague@example.com", role: "admin" });
      await schoolService.addMembership(
        schoolC.id,
        other.insertedId.toString(),
        "owner-1",
      );

      const schools = await schoolService.listSchoolsForUser(userId);

      expect(schools.map((s) => s.id).sort()).toEqual(
        [schoolA.id, schoolB.id].sort(),
      );
      expect(schools.map((s) => s.name).sort()).toEqual([
        "School A",
        "School B",
      ]);
    },
  );
});
