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

import { grantAdminAction, revokeAdminAction } from "../actions";

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

/**
 * Feature: an owner cannot take away their own administrator access
 * As an owner (Tier 2)
 * I want to revoke someone else's admin access
 * But be refused if I try to revoke my own
 * So that the last person with the keys can never lock the school out (D25)
 */
describe("Feature: an owner cannot take away their own administrator access", () => {
  let db: Db;

  beforeEach(async () => {
    const setup = await setupTestDb();
    db = setup.db;
    mockIsAdminEmail.mockResolvedValue(true);
  });

  afterEach(async () => {
    await teardownTestDb();
    vi.clearAllMocks();
  });

  it("revokes another admin's access but refuses to remove the caller's own", async () => {
    const ownerInsert = await db.collection("user").insertOne({
      email: "owner@example.com",
      name: "Owner",
      role: "admin",
    });
    const ownerId = ownerInsert.insertedId.toString();
    mockRequireAdminSession.mockResolvedValue({
      userId: ownerId,
      email: "owner@example.com",
      role: "admin",
    });

    const otherAdminInsert = await db.collection("user").insertOne({
      email: "other-admin@example.com",
      name: "Other Admin",
      role: "admin",
    });
    const otherAdminId = otherAdminInsert.insertedId.toString();

    const otherFormData = new FormData();
    otherFormData.set("userId", otherAdminId);
    const otherState = await revokeAdminAction(null, otherFormData);

    expect(otherState.success).toBe(true);
    const otherUpdated = await db
      .collection("user")
      .findOne({ _id: otherAdminInsert.insertedId });
    expect(otherUpdated?.role).toBe("student");

    const selfFormData = new FormData();
    selfFormData.set("userId", ownerId);
    const selfState = await revokeAdminAction(null, selfFormData);

    expect(selfState.success).toBe(false);
    const ownerUnchanged = await db
      .collection("user")
      .findOne({ _id: ownerInsert.insertedId });
    expect(ownerUnchanged?.role).toBe("admin");
  });

  it("refuses self-demotion even when the caller's own id is posted in uppercase hex", async () => {
    const ownerInsert = await db.collection("user").insertOne({
      email: "owner@example.com",
      name: "Owner",
      role: "admin",
    });
    const ownerId = ownerInsert.insertedId.toString();
    mockRequireAdminSession.mockResolvedValue({
      userId: ownerId,
      email: "owner@example.com",
      role: "admin",
    });

    const selfFormData = new FormData();
    selfFormData.set("userId", ownerId.toUpperCase());
    const selfState = await revokeAdminAction(null, selfFormData);

    expect(selfState.success).toBe(false);
    const ownerUnchanged = await db
      .collection("user")
      .findOne({ _id: ownerInsert.insertedId });
    expect(ownerUnchanged?.role).toBe("admin");
  });

  it("refuses to revoke when the caller is not an owner, and writes nothing", async () => {
    mockRequireAdminSession.mockResolvedValue({
      userId: "owner-1",
      email: "owner@example.com",
      role: "admin",
    });
    mockIsAdminEmail.mockResolvedValue(false);

    const targetInsert = await db.collection("user").insertOne({
      email: "some-admin@example.com",
      name: "Some Admin",
      role: "admin",
    });
    const targetId = targetInsert.insertedId.toString();

    const formData = new FormData();
    formData.set("userId", targetId);
    const state = await revokeAdminAction(null, formData);

    expect(state.success).toBe(false);
    const stored = await db
      .collection("user")
      .findOne({ _id: targetInsert.insertedId });
    expect(stored?.role).toBe("admin");
  });
});
