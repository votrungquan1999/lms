// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import type { Db } from "mongodb";
import { getAuthService } from "src/lib/auth-singleton";
import { AdminSession } from "src/lib/session";
import { insertRawEnrollment } from "src/tests/raw-enrollment-seeds";
import {
  addTestSchool,
  getTestServices,
  servicesSingletonMockFactory,
  setupTestDb,
  signInAs,
  teardownTestDb,
} from "src/tests/render-server-page";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CourseDetailBreadcrumb from "../@breadcrumb/courses/[courseId]/page";
import ResultsReportBreadcrumb from "../@breadcrumb/courses/[courseId]/results-report/page";
import GradingBreadcrumb from "../@breadcrumb/courses/[courseId]/tests/[testId]/grading/page";
import ImportAiBreadcrumb from "../@breadcrumb/courses/[courseId]/tests/[testId]/import-ai/page";
import TestDetailBreadcrumb from "../@breadcrumb/courses/[courseId]/tests/[testId]/page";
import GradingTestBreadcrumb from "../@breadcrumb/grading/[testId]/page";
import PoolDetailBreadcrumb from "../@breadcrumb/pools/[poolId]/page";
import CourseDetailPage from "../courses/[courseId]/page";
import { GET as downloadResultsReport } from "../courses/[courseId]/results-report/download/route";
import ResultsReportPage from "../courses/[courseId]/results-report/page";
import TestGradingPage from "../courses/[courseId]/tests/[testId]/grading/page";
import ImportAiPage from "../courses/[courseId]/tests/[testId]/import-ai/page";
import TestDetailPage from "../courses/[courseId]/tests/[testId]/page";
import GradingVariantPage from "../grading/[testId]/page";
import PoolDetailPage from "../pools/[poolId]/page";

vi.mock("src/lib/services-singleton", () => servicesSingletonMockFactory());
vi.mock("next/navigation", () => ({
  // The import breadcrumb's leave-guarded link reads the router.
  useRouter: vi.fn(() => ({ push: vi.fn() })),
  notFound: vi.fn(() => {
    throw new Error("not found called");
  }),
  redirect: vi.fn(() => {
    throw new Error("redirect called");
  }),
  forbidden: vi.fn(() => {
    throw new Error("forbidden called");
  }),
}));
vi.mock("next/headers", () => ({ headers: vi.fn(), cookies: vi.fn() }));
vi.mock("src/lib/auth-singleton", () => ({ getAuthService: vi.fn() }));

/**
 * Signs in as the admin of a new, NON-default school, so a getter that falls
 * back to the default school shows the foreign data seeded there and fails.
 */
async function signInAsOtherSchoolAdmin(): Promise<{
  id: string;
  name: string;
}> {
  const school = await addTestSchool("School B");
  signInAs(
    new AdminSession({
      userId: "0000000000000000000000c1",
      email: "school-b-admin@example.com",
      school,
    }),
  );
  return school;
}

/** Creates a course in the DEFAULT school — a foreign record for these rows. */
async function createForeignCourse(): Promise<string> {
  const course = await getTestServices().courseService.createCourse({
    title: "Foreign Course",
    description: "",
    createdBy: "default-school-admin",
  });
  return course.id;
}

/** Creates a course + test in the DEFAULT school. */
async function createForeignTest(): Promise<{
  courseId: string;
  testId: string;
}> {
  const courseId = await createForeignCourse();
  const test = await getTestServices().testService.createTest(courseId, {
    title: "Foreign Test",
    description: "",
    createdBy: "default-school-admin",
  });
  return { courseId, testId: test.id };
}

/** Creates a pool in the DEFAULT school. */
async function createForeignPool(): Promise<string> {
  const pool = await getTestServices().questionPoolService.createPool({
    name: "Foreign Pool",
    description: "",
    createdBy: "default-school-admin",
  });
  return pool.id;
}

type Row = [string, () => Promise<void>];

/**
 * Feature: a school admin who opens another school's record by id gets "not found"
 * As a school admin working in one school
 * I want a course, test, grading, import-ai or pool link naming another
 * school's record to 404, the same as a link naming nothing at all
 * So that another school's title, roster or questions never reach my screen
 */
describe("Feature: a school admin who opens another school's record by id gets not found", () => {
  let school: { id: string; name: string };

  beforeEach(async () => {
    await setupTestDb();
    school = await signInAsOtherSchoolAdmin();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  const rows: Row[] = [
    [
      "courses/[courseId]/page.tsx",
      async () => {
        const courseId = await createForeignCourse();
        await expect(
          CourseDetailPage({ params: Promise.resolve({ courseId }) }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "courses/[courseId]/results-report/page.tsx",
      async () => {
        const courseId = await createForeignCourse();
        await expect(
          ResultsReportPage({ params: Promise.resolve({ courseId }) }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "courses/[courseId]/tests/[testId]/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        await expect(
          TestDetailPage({ params: Promise.resolve({ courseId, testId }) }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "courses/[courseId]/tests/[testId]/grading/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        await expect(
          TestGradingPage({
            params: Promise.resolve({ courseId, testId }),
            searchParams: Promise.resolve({}),
          }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "courses/[courseId]/tests/[testId]/import-ai/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        await expect(
          ImportAiPage({ params: Promise.resolve({ courseId, testId }) }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "grading/[testId]/page.tsx",
      async () => {
        const { testId } = await createForeignTest();
        await expect(
          GradingVariantPage({
            params: Promise.resolve({ testId }),
            searchParams: Promise.resolve({}),
          }),
        ).rejects.toThrow("not found called");
      },
    ],
    [
      "pools/[poolId]/page.tsx",
      async () => {
        const poolId = await createForeignPool();
        await expect(
          PoolDetailPage({ params: Promise.resolve({ poolId }) }),
        ).rejects.toThrow("not found called");
      },
    ],
  ];

  it.each(rows)(
    "%s gets not found for another school's id",
    async (_name, run) => {
      await run();
    },
  );

  // The only by-id page that gained its own check here — a blanket not-found
  // would pass the row above, so its own course must still render.
  it("courses/[courseId]/results-report/page.tsx still renders the admin's own course", async () => {
    const course = await getTestServices(school.id).courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });

    await expect(
      ResultsReportPage({ params: Promise.resolve({ courseId: course.id }) }),
    ).resolves.toBeDefined();
  });

  // Already covered by the pre-existing within-school `test.courseId !==
  // courseId` check — proven here as a guard row, not a real red.
  it("courses/[courseId]/tests/[testId]/page.tsx still refuses a test from a different course in the SAME school", async () => {
    const school = await addTestSchool("School C");
    const own = getTestServices(school.id);
    signInAs(
      new AdminSession({
        userId: "0000000000000000000000c2",
        email: "school-c-admin@example.com",
        school,
      }),
    );
    const courseA = await own.courseService.createCourse({
      title: "Course A",
      description: "",
      createdBy: "school-c-admin",
    });
    const courseB = await own.courseService.createCourse({
      title: "Course B",
      description: "",
      createdBy: "school-c-admin",
    });
    const test = await own.testService.createTest(courseA.id, {
      title: "Test",
      description: "",
      createdBy: "school-c-admin",
    });

    await expect(
      TestDetailPage({
        params: Promise.resolve({ courseId: courseB.id, testId: test.id }),
      }),
    ).rejects.toThrow("not found called");
  });
});

/**
 * Feature: a school admin's breadcrumbs never name another school's record
 * As a school admin working in one school
 * I want a breadcrumb slot naming another school's course, test or pool to
 * fall back to its generic label instead of that record's real title
 * So that another school's title is never readable from the breadcrumb bar
 */
describe("Feature: a school admin's breadcrumbs never name another school's record", () => {
  beforeEach(async () => {
    await setupTestDb();
    await signInAsOtherSchoolAdmin();
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  const rows: Row[] = [
    [
      "@breadcrumb/courses/[courseId]/page.tsx",
      async () => {
        const courseId = await createForeignCourse();
        render(
          await CourseDetailBreadcrumb({
            params: Promise.resolve({ courseId }),
          }),
        );
        expect(screen.getByText("Course")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/courses/[courseId]/results-report/page.tsx",
      async () => {
        const courseId = await createForeignCourse();
        render(
          await ResultsReportBreadcrumb({
            params: Promise.resolve({ courseId }),
          }),
        );
        expect(screen.getByText("Course")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/courses/[courseId]/tests/[testId]/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        render(
          await TestDetailBreadcrumb({
            params: Promise.resolve({ courseId, testId }),
          }),
        );
        expect(screen.getByText("Course")).toBeInTheDocument();
        expect(screen.getByText("Test")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/courses/[courseId]/tests/[testId]/grading/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        render(
          await GradingBreadcrumb({
            params: Promise.resolve({ courseId, testId }),
          }),
        );
        expect(screen.getByText("Course")).toBeInTheDocument();
        expect(screen.getByText("Test")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/courses/[courseId]/tests/[testId]/import-ai/page.tsx",
      async () => {
        const { courseId, testId } = await createForeignTest();
        render(
          await ImportAiBreadcrumb({
            params: Promise.resolve({ courseId, testId }),
          }),
        );
        expect(screen.getByText("Course")).toBeInTheDocument();
        expect(screen.getByText("Test")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/grading/[testId]/page.tsx",
      async () => {
        const { testId } = await createForeignTest();
        render(
          await GradingTestBreadcrumb({ params: Promise.resolve({ testId }) }),
        );
        expect(screen.getByText("Test")).toBeInTheDocument();
      },
    ],
    [
      "@breadcrumb/pools/[poolId]/page.tsx",
      async () => {
        const poolId = await createForeignPool();
        render(
          await PoolDetailBreadcrumb({ params: Promise.resolve({ poolId }) }),
        );
        expect(screen.getByText("Pool")).toBeInTheDocument();
      },
    ],
  ];

  it.each(rows)(
    "%s falls back to the generic label for another school's id",
    async (_name, run) => {
      await run();
      expect(screen.queryByText(/Foreign/)).not.toBeInTheDocument();
    },
  );
});

/**
 * Feature: a grading link naming a student who isn't on the roster falls
 * back to the first roster student
 * As a school admin opening a grading link with a stale or crafted studentId
 * I want the page to render the first enrolled roster student instead
 * So that another school's (or an un-enrolled) student is never shown
 */
describe("Feature: a grading link naming a student who isn't on the roster falls back to the first roster student", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("shows the first enrolled roster student instead of a foreign ?studentId=", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "school-b-admin",
    });
    const test = await own.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "school-b-admin",
    });
    const ownStudent = await own.studentService.createStudentDocument({
      authUserId: "auth-own-roster",
      username: "own.roster",
      name: "Own Roster Student",
      createdBy: "school-b-admin",
    });
    await own.enrollmentService.enrollStudent(course.id, ownStudent.id, "seed");

    // Legacy data can enrol a foreign student here; the school-bound
    // enrolment service hides them from the roster regardless.
    const foreignStudent =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign-roster",
        username: "foreign.roster",
        name: "Foreign Roster Student",
        createdBy: "default-school-admin",
      });
    await insertRawEnrollment(db, course.id, foreignStudent.id);

    render(
      await TestGradingPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
        searchParams: Promise.resolve({ studentId: foreignStudent.id }),
      }),
    );

    expect(
      screen.queryByTestId(`roster-cell-${foreignStudent.id}`),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByTestId("grading-main-pane")).getByTestId(
        `student-card-${ownStudent.id}`,
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Foreign Roster Student"),
    ).not.toBeInTheDocument();
  });

  it("shows the first enrolled roster student instead of a same-school student not in the course", async () => {
    const school = await signInAsOtherSchoolAdmin();
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Course",
      description: "",
      createdBy: "school-b-admin",
    });
    const test = await own.testService.createTest(course.id, {
      title: "Test",
      description: "",
      createdBy: "school-b-admin",
    });
    const rosterStudent = await own.studentService.createStudentDocument({
      authUserId: "auth-roster",
      username: "roster.student",
      name: "Roster Student",
      createdBy: "school-b-admin",
    });
    await own.enrollmentService.enrollStudent(
      course.id,
      rosterStudent.id,
      "seed",
    );
    const outsider = await own.studentService.createStudentDocument({
      authUserId: "auth-outsider",
      username: "outsider",
      name: "Unenrolled Student",
      createdBy: "school-b-admin",
    });

    render(
      await TestGradingPage({
        params: Promise.resolve({ courseId: course.id, testId: test.id }),
        searchParams: Promise.resolve({ studentId: outsider.id }),
      }),
    );

    expect(
      within(screen.getByTestId("grading-main-pane")).getByTestId(
        `student-card-${rosterStudent.id}`,
      ),
    ).toBeInTheDocument();
    expect(screen.queryByText("Unenrolled Student")).not.toBeInTheDocument();
  });
});

/**
 * Feature: the results-report download refuses a student outside this school
 * As a school admin working in one school
 * I want a report link naming another school's student to be refused cleanly
 * So that a stray enrolment never crashes the download or exports anything
 */
describe("Feature: the results-report download refuses a student outside this school", () => {
  let db: Db;

  beforeEach(async () => {
    ({ db } = await setupTestDb());
  });

  afterEach(async () => {
    await teardownTestDb();
  });

  it("returns a non-PDF 404 for another school's student enrolled in the admin's own course", async () => {
    const school = await addTestSchool("School B");
    const session = new AdminSession({
      userId: "0000000000000000000000c1",
      email: "school-b-admin@example.com",
      school,
    });
    vi.mocked(getAuthService).mockResolvedValue({
      requireAdminSession: async () => session,
    } as unknown as Awaited<ReturnType<typeof getAuthService>>);
    const own = getTestServices(school.id);
    const course = await own.courseService.createCourse({
      title: "Own Course",
      description: "",
      createdBy: "school-b-admin",
    });
    const test = await own.testService.createTest(course.id, {
      title: "Own Test",
      description: "",
      createdBy: "school-b-admin",
    });
    const foreign =
      await getTestServices().studentService.createStudentDocument({
        authUserId: "auth-foreign",
        username: "foreign.student",
        name: "Foreign Student",
        createdBy: "default-school-admin",
      });
    // Enrolments carry no school, so legacy data can hold this row.
    await insertRawEnrollment(db, course.id, foreign.id);

    const res = await downloadResultsReport(
      new Request(
        `http://test/admin/courses/${course.id}/results-report/download?studentId=${foreign.id}&testId=${test.id}`,
      ),
      { params: Promise.resolve({ courseId: course.id }) },
    );

    expect(res.status).toBe(404);
    expect(res.headers.get("content-type")).not.toContain("application/pdf");
    expect(res.headers.get("content-disposition")).toBeNull();
  });

  it("returns the same non-PDF 404 for another school's course whether or not the named student is enrolled there", async () => {
    const school = await addTestSchool("School B");
    const session = new AdminSession({
      userId: "0000000000000000000000c1",
      email: "school-b-admin@example.com",
      school,
    });
    vi.mocked(getAuthService).mockResolvedValue({
      requireAdminSession: async () => session,
    } as unknown as Awaited<ReturnType<typeof getAuthService>>);
    const foreign = getTestServices();
    const course = await foreign.courseService.createCourse({
      title: "Foreign Course",
      description: "",
      createdBy: "default-school-admin",
    });
    const test = await foreign.testService.createTest(course.id, {
      title: "Foreign Test",
      description: "",
      createdBy: "default-school-admin",
    });
    const enrolled = await foreign.studentService.createStudentDocument({
      authUserId: "auth-foreign-enrolled",
      username: "foreign.enrolled",
      name: "Foreign Enrolled",
      createdBy: "default-school-admin",
    });
    const notEnrolled = await foreign.studentService.createStudentDocument({
      authUserId: "auth-foreign-not-enrolled",
      username: "foreign.not.enrolled",
      name: "Foreign Not Enrolled",
      createdBy: "default-school-admin",
    });
    await foreign.enrollmentService.enrollStudent(
      course.id,
      enrolled.id,
      "default-school-admin",
    );
    const download = (studentId: string) =>
      downloadResultsReport(
        new Request(
          `http://test/admin/courses/${course.id}/results-report/download?studentId=${studentId}&testId=${test.id}`,
        ),
        { params: Promise.resolve({ courseId: course.id }) },
      );

    const withEnrolment = await download(enrolled.id);
    const withoutEnrolment = await download(notEnrolled.id);

    // A differing status would tell the admin the foreign enrolment exists.
    expect(withEnrolment.status).toBe(404);
    expect(withoutEnrolment.status).toBe(404);
    expect(withoutEnrolment.headers.get("content-type")).not.toContain(
      "application/pdf",
    );
  });
});
