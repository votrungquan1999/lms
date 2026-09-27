import { expect, test } from "@playwright/test";

test.describe("Dashboard layout", () => {
  test("the three summary cards are the same height, and the Grading card's two metric labels never wrap onto a second line", async ({
    page,
  }) => {
    await page.goto("/admin/dashboard");

    const cards = page.locator('[data-slot="card"]');
    await expect(cards).toHaveCount(3);

    const heights = await Promise.all(
      [0, 1, 2].map(async (i) => {
        const box = await cards.nth(i).boundingBox();
        if (!box) throw new Error(`Summary card ${i} not found`);
        return box.height;
      }),
    );
    expect(heights[1]).toBeCloseTo(heights[0], 0);
    expect(heights[2]).toBeCloseTo(heights[0], 0);

    // Compare against a sibling label that's always single-line — no hardcoded pixel guess.
    const referenceBox = await page
      .getByText("Registered accounts")
      .boundingBox();
    if (!referenceBox) throw new Error("Reference label not found");

    const testsLabelBox = await page
      .getByText("Tests needing grading")
      .boundingBox();
    const studentsLabelBox = await page
      .getByText("Students waiting")
      .boundingBox();
    if (!testsLabelBox || !studentsLabelBox) {
      throw new Error("Grading metric labels not found");
    }
    expect(testsLabelBox.height).toBeCloseTo(referenceBox.height, 0);
    expect(studentsLabelBox.height).toBeCloseTo(referenceBox.height, 0);
  });
});
