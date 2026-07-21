import { CourseService } from "src/lib/course-service";
import { withTestDb } from "src/tests/create-test-db";
import { describe, expect, it } from "vitest";

const dbIt = withTestDb(it);

/**
 * Feature: Course materials
 * As an instructor
 * I want to attach downloadable files to a course
 * So that students can download lesson materials
 */
describe("Feature: Course materials", () => {
  dbIt("saves an uploaded material against the course", async ({ db }) => {
    // Given a course
    const courseService = new CourseService(db);
    const course = await courseService.createCourse({
      title: "Algorithms",
      description: "",
      createdBy: "admin-1",
    });

    // When an instructor adds a material
    await courseService.addCourseMaterial(course.id, {
      key: "materials/courses/c1/file.pdf",
      contentType: "application/pdf",
      fileName: "syllabus.pdf",
      size: 2048,
    });

    // Then the material appears on the course
    const reloaded = await courseService.getCourse(course.id);
    expect(reloaded?.materials).toHaveLength(1);
    expect(reloaded?.materials[0]).toMatchObject({
      key: "materials/courses/c1/file.pdf",
      fileName: "syllabus.pdf",
      contentType: "application/pdf",
      size: 2048,
      order: 0,
    });
    expect(reloaded?.materials[0].uploadedAt).toBeDefined();
  });

  dbIt(
    "removes a material so it no longer appears on the course",
    async ({ db }) => {
      // Given a course with two materials
      const courseService = new CourseService(db);
      const course = await courseService.createCourse({
        title: "Algorithms",
        description: "",
        createdBy: "admin-1",
      });
      await courseService.addCourseMaterial(course.id, {
        key: "materials/courses/c1/a.pdf",
        contentType: "application/pdf",
        fileName: "a.pdf",
        size: 100,
      });
      await courseService.addCourseMaterial(course.id, {
        key: "materials/courses/c1/b.pdf",
        contentType: "application/pdf",
        fileName: "b.pdf",
        size: 200,
      });

      // When an instructor removes the first material
      await courseService.removeCourseMaterial(
        course.id,
        "materials/courses/c1/a.pdf",
      );

      // Then only the other material remains
      const reloaded = await courseService.getCourse(course.id);
      expect(reloaded?.materials).toHaveLength(1);
      expect(reloaded?.materials[0].key).toBe("materials/courses/c1/b.pdf");
    },
  );
});
