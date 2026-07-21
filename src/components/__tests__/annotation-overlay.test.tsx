// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AnnotationOverlay } from "../annotation-overlay";

describe("AnnotationOverlay", () => {
  it("renders the image and one polyline per stroke over it", () => {
    // Given an image with two annotation strokes
    const { container } = render(
      <AnnotationOverlay
        src="https://files.example/p1.png"
        alt="work"
        strokes={[
          {
            color: "#ff0000",
            points: [
              { x: 0, y: 0 },
              { x: 0.5, y: 0.5 },
            ],
          },
          {
            color: "#00ff00",
            points: [
              { x: 0.2, y: 0.2 },
              { x: 0.9, y: 0.1 },
            ],
          },
        ]}
      />,
    );

    // Then the photo renders
    expect(screen.getByRole("img")).toHaveAttribute(
      "src",
      "https://files.example/p1.png",
    );
    // And each stroke renders as a polyline with the right color + points
    const polylines = container.querySelectorAll("polyline");
    expect(polylines).toHaveLength(2);
    expect(polylines[0].getAttribute("stroke")).toBe("#ff0000");
    expect(polylines[0].getAttribute("points")).toBe("0,0 0.5,0.5");
  });
});
