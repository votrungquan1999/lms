import type { Db } from "mongodb";
import { revalidatePath } from "next/cache";
import {
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const mockRequireAdminSession = vi.fn();
const mockIsAdminEmail = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({
    requireAdminSession: mockRequireAdminSession,
    isAdminEmail: mockIsAdminEmail,
  })),
}));

import { grantAdminAction } from "../actions";

/**
 * Feature: an owner grants administrator access
 * As an owner (Tier 2)
 * I want to give a student administrator access
 * So that it is recorded and takes effect on their next sign-in — the same
 * `user.role` field `AuthService.getSession()` reads (Step 1)
 */
describe("Feature: an owner grants administrator access", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;

    mockRequireAdminSession.mockResolvedValue({
      userId: "owner-1",
      email: "owner@example.com",
      role: "admin",
    });
    mockIsAdminEmail.mockResolvedValue(true);
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("records the target user's role as admin", async () => {
    const insertResult = await db.collection("user").insertOne({
      email: "future-admin@example.com",
      name: "Future Admin",
    });
    const userId = insertResult.insertedId.toString();

    const formData = new FormData();
    formData.set("userId", userId);

    const state = await grantAdminAction(null, formData);

    expect(state.success).toBe(true);
    const updated = await db
      .collection("user")
      .findOne({ _id: insertResult.insertedId });
    expect(updated?.role).toBe("admin");
    expect(revalidatePath).toHaveBeenCalledWith("/admin/user-roles");
  });

  it("refuses to grant when the caller is not an owner, and writes nothing", async () => {
    mockIsAdminEmail.mockResolvedValue(false);

    const insertResult = await db.collection("user").insertOne({
      email: "future-admin@example.com",
      name: "Future Admin",
    });
    const userId = insertResult.insertedId.toString();

    const formData = new FormData();
    formData.set("userId", userId);

    const state = await grantAdminAction(null, formData);

    expect(state.success).toBe(false);
    const stored = await db
      .collection("user")
      .findOne({ _id: insertResult.insertedId });
    expect(stored?.role).toBeUndefined();
  });
});
