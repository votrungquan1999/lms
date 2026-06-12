import { revalidatePath } from "next/cache";
import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// Real services backed by a per-test Mongo.
vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

import {
  createPoolAction,
  deletePoolAction,
  renamePoolAction,
} from "../actions";

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Pool actions", () => {
  it("createPoolAction persists a pool an admin can then see in the list", async () => {
    const form = new FormData();
    form.set("name", "Geometry");
    form.set("description", "Triangles and circles");

    const result = await createPoolAction(null, form);

    expect(result.success).toBe(true);

    const pools = await getTestServices().questionPoolService.listPools();
    expect(pools).toHaveLength(1);
    expect(pools[0].name).toBe("Geometry");
    expect(pools[0].description).toBe("Triangles and circles");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/pools");
  });

  it("renamePoolAction changes an existing pool's name", async () => {
    const pool = await getTestServices().questionPoolService.createPool({
      name: "Before",
      description: "",
      createdBy: "admin-1",
    });

    const form = new FormData();
    form.set("poolId", pool.id);
    form.set("name", "After");

    const result = await renamePoolAction(null, form);

    expect(result.success).toBe(true);
    const fetched = await getTestServices().questionPoolService.getPool(
      pool.id,
    );
    expect(fetched?.name).toBe("After");
  });

  it("deletePoolAction removes a pool from the list", async () => {
    const pool = await getTestServices().questionPoolService.createPool({
      name: "Doomed",
      description: "",
      createdBy: "admin-1",
    });

    const form = new FormData();
    form.set("poolId", pool.id);

    const result = await deletePoolAction(null, form);

    expect(result.success).toBe(true);
    expect(
      await getTestServices().questionPoolService.listPools(),
    ).toHaveLength(0);
  });

  it("rejects any pool action when the caller is not an admin", async () => {
    requireAdminSession.mockRejectedValueOnce(new Error("forbidden"));

    const form = new FormData();
    form.set("name", "Sneaky");

    const result = await createPoolAction(null, form);

    expect(result.success).toBe(false);
    expect(result.message).toBe("Unauthorized: admin access required");
    expect(
      await getTestServices().questionPoolService.listPools(),
    ).toHaveLength(0);
  });
});
