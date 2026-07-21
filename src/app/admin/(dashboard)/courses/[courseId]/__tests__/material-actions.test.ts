import {
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  addCourseMaterialAction,
  removeCourseMaterialAction,
  requestMaterialUploadSlotsAction,
} from "../material-actions";
import { MaterialContentType } from "../material-upload.schema";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }));

const requireAdminSession = vi.fn();
vi.mock("src/lib/auth-singleton", () => ({
  getAuthService: vi.fn(async () => ({ requireAdminSession })),
}));

beforeEach(async () => {
  await setupTestDb();
  requireAdminSession.mockResolvedValue({ userId: "admin-1", role: "admin" });
});

afterEach(async () => {
  await teardownTestDb();
  vi.clearAllMocks();
});

describe("Feature: instructor uploads course materials", () => {
  describe("requesting material upload slots", () => {
    it("returns a course-scoped presigned PUT slot for each file, in order", async () => {
      // When the instructor requests slots for two files
      const result = await requestMaterialUploadSlotsAction("course-1", [
        {
          fileName: "syllabus.pdf",
          contentType: MaterialContentType.PDF,
          size: 1000,
        },
        {
          fileName: "notes.docx",
          contentType: MaterialContentType.DOCX,
          size: 2000,
        },
      ]);

      // Then a presigned slot is returned for each, keyed under the course, in order
      expect(result.success).toBe(true);
      expect(result.slots).toHaveLength(2);
      expect(result.slots?.[0]).toMatchObject({
        url: expect.stringContaining("https://fake-s3.local/put/"),
        contentType: MaterialContentType.PDF,
        fileName: "syllabus.pdf",
        order: 0,
      });
      expect(result.slots?.[0].key).toContain("materials/courses/course-1/");
      expect(result.slots?.[1]).toMatchObject({
        contentType: MaterialContentType.DOCX,
        order: 1,
      });
      expect(result.slots?.[0].key).not.toBe(result.slots?.[1].key);
    });
  });

  describe("persisting an uploaded material", () => {
    it("saves the material against the course", async () => {
      // Given a course
      const { courseService } = getTestServices();
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });

      // When the instructor persists an uploaded material (key under the
      // course's own namespace)
      const result = await addCourseMaterialAction(course.id, {
        key: `materials/courses/${course.id}/syllabus.pdf`,
        contentType: MaterialContentType.PDF,
        fileName: "syllabus.pdf",
        size: 1234,
      });

      // Then it is saved on the course
      expect(result.success).toBe(true);
      const reloaded = await courseService.getCourse(course.id);
      expect(reloaded?.materials.map((m) => m.fileName)).toEqual([
        "syllabus.pdf",
      ]);
    });

    it("rejects a key outside the course's own materials namespace and persists nothing", async () => {
      // Given a course
      const { courseService } = getTestServices();
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });

      // When an admin tries to attach a key pointing at another bucket object
      // (e.g. a student's answer photo), which would later be served to
      // enrolled students as a signed download link.
      const result = await addCourseMaterialAction(course.id, {
        key: "answers/some-student/stolen-photo.jpg",
        contentType: MaterialContentType.PDF,
        fileName: "syllabus.pdf",
        size: 1234,
      });

      // Then it is rejected and nothing is attached to the course.
      expect(result.success).toBe(false);
      const reloaded = await courseService.getCourse(course.id);
      expect(reloaded?.materials ?? []).toHaveLength(0);
    });
  });

  describe("removing a material", () => {
    it("removes the material from the course", async () => {
      // Given a course with one attached material
      const { courseService } = getTestServices();
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });
      const key = `materials/courses/${course.id}/syllabus.pdf`;
      await addCourseMaterialAction(course.id, {
        key,
        contentType: MaterialContentType.PDF,
        fileName: "syllabus.pdf",
        size: 1234,
      });

      // When the instructor removes it
      const result = await removeCourseMaterialAction(course.id, key);

      // Then it is gone from the course
      expect(result.success).toBe(true);
      const reloaded = await courseService.getCourse(course.id);
      expect(reloaded?.materials ?? []).toHaveLength(0);
    });

    it("rejects a non-admin caller and removes nothing", async () => {
      // Given a course with one attached material
      const { courseService } = getTestServices();
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });
      const key = `materials/courses/${course.id}/syllabus.pdf`;
      await addCourseMaterialAction(course.id, {
        key,
        contentType: MaterialContentType.PDF,
        fileName: "syllabus.pdf",
        size: 1234,
      });

      // When a non-admin caller attempts the removal
      requireAdminSession.mockRejectedValueOnce(new Error("not admin"));
      const result = await removeCourseMaterialAction(course.id, key);

      // Then it is rejected and the material is still attached
      expect(result.success).toBe(false);
      const reloaded = await courseService.getCourse(course.id);
      expect(reloaded?.materials.map((m) => m.key)).toEqual([key]);
    });
  });
});
