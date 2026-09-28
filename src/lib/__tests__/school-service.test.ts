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
