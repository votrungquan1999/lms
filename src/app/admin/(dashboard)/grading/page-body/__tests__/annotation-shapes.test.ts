import { describe, expect, it } from "vitest";
import { arrowPoints, ellipsePoints } from "../annotation-shapes";

const SIZE = { width: 400, height: 200 };

/** Distance between two normalized points, measured in pixels of the surface. */
function pixelDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
) {
  return Math.hypot((a.x - b.x) * SIZE.width, (a.y - b.y) * SIZE.height);
}

describe("arrowPoints", () => {
  it("draws both head wings at the same pixel length on a non-square photo", () => {
    // Given an arrow dragged diagonally across a 400 x 200 photo
    const tail = { x: 0.1, y: 0.2 };
    const tip = { x: 0.8, y: 0.7 };

    // When the arrow's points are built
    const points = arrowPoints(tail, tip, SIZE);

    // Then the shaft runs tail to tip and the two head lines leave the tip with equal pixel length
    expect(points[0]).toEqual(tail);
    expect(points[1]).toEqual(tip);
    expect(points).toHaveLength(5);
    const [, , wingA, tipAgain, wingB] = points;
    expect(tipAgain).toEqual(tip);
    expect(pixelDistance(tip, wingA)).toBeGreaterThan(5);
    expect(pixelDistance(tip, wingA)).toBeCloseTo(pixelDistance(tip, wingB), 5);
  });

  it("points the head back along the shaft, one wing on each side of it", () => {
    // Given an arrow dragged diagonally across a 400 x 200 photo
    const tail = { x: 0.1, y: 0.2 };
    const tip = { x: 0.8, y: 0.7 };

    // When the arrow's points are built
    const [, , wingA, , wingB] = arrowPoints(tail, tip, SIZE);

    // Then both wings lean back toward the tail and sit on opposite sides of the shaft
    const shaft = {
      x: (tail.x - tip.x) * SIZE.width,
      y: (tail.y - tip.y) * SIZE.height,
    };
    const fromTip = (wing: { x: number; y: number }) => ({
      x: (wing.x - tip.x) * SIZE.width,
      y: (wing.y - tip.y) * SIZE.height,
    });
    const along = (v: { x: number; y: number }) =>
      v.x * shaft.x + v.y * shaft.y;
    const side = (v: { x: number; y: number }) => shaft.x * v.y - shaft.y * v.x;
    expect(along(fromTip(wingA))).toBeGreaterThan(0);
    expect(along(fromTip(wingB))).toBeGreaterThan(0);
    expect(Math.sign(side(fromTip(wingA)))).toBe(
      -Math.sign(side(fromTip(wingB))),
    );
    expect(side(fromTip(wingA))).not.toBe(0);
  });
});

describe("ellipsePoints", () => {
  it("closes an ellipse that touches the four sides of the dragged box", () => {
    // Given a box dragged from the bottom right to the top left
    const points = ellipsePoints({ x: 0.6, y: 0.8 }, { x: 0.2, y: 0.4 });

    // Then the outline starts and ends at the same point and spans exactly the box
    expect(points[0].x).toBeCloseTo(points[points.length - 1].x, 10);
    expect(points[0].y).toBeCloseTo(points[points.length - 1].y, 10);
    const xs = points.map((p) => p.x);
    const ys = points.map((p) => p.y);
    expect(Math.min(...xs)).toBeCloseTo(0.2, 10);
    expect(Math.max(...xs)).toBeCloseTo(0.6, 10);
    expect(Math.min(...ys)).toBeCloseTo(0.4, 10);
    expect(Math.max(...ys)).toBeCloseTo(0.8, 10);
  });
});
