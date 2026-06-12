import { QuestionPoolService } from "src/lib/question-pool-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

describe("QuestionPoolService", () => {
  dbIt(
    "creates a global pool and retrieves it by id with its name and description",
    async ({ db }) => {
      const service = new QuestionPoolService(db);

      const created = await service.createPool({
        name: "Algebra basics",
        description: "Linear equations and inequalities",
        createdBy: "admin-1",
      });

      expect(created.id).toBeTruthy();
      expect(created.name).toBe("Algebra basics");
      expect(created.description).toBe("Linear equations and inequalities");

      const fetched = await service.getPool(created.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.id).toBe(created.id);
      expect(fetched?.name).toBe("Algebra basics");
      expect(fetched?.description).toBe("Linear equations and inequalities");
    },
  );

  dbIt(
    "lists every pool globally, newest-first, regardless of creator",
    async ({ db }) => {
      const service = new QuestionPoolService(db);

      const first = await service.createPool({
        name: "Pool A",
        description: "",
        createdBy: "admin-1",
      });
      const second = await service.createPool({
        name: "Pool B",
        description: "",
        createdBy: "admin-2",
      });

      const pools = await service.listPools();

      expect(pools).toHaveLength(2);
      expect(pools.map((p) => p.id)).toEqual([second.id, first.id]);
    },
  );

  dbIt("renames a pool, leaving its description intact", async ({ db }) => {
    const service = new QuestionPoolService(db);

    const created = await service.createPool({
      name: "Old name",
      description: "keep me",
      createdBy: "admin-1",
    });

    await service.renamePool(created.id, "New name", "admin-2");

    const fetched = await service.getPool(created.id);
    expect(fetched?.name).toBe("New name");
    expect(fetched?.description).toBe("keep me");
  });

  dbIt(
    "soft-deletes a pool so it no longer appears in the list nor by id",
    async ({ db }) => {
      const service = new QuestionPoolService(db);

      const created = await service.createPool({
        name: "Doomed",
        description: "",
        createdBy: "admin-1",
      });

      await service.deletePool(created.id, "admin-2");

      expect(await service.getPool(created.id)).toBeNull();
      expect(await service.listPools()).toHaveLength(0);
    },
  );
});
