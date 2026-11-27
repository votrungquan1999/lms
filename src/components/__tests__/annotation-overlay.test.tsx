// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import type { AnnotationStroke } from "src/lib/annotation-service";
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

  it("still shows the photo when a stored mark has no points", () => {
    // Given a stored mark that carries a color but no point list
    const pointless = { color: "#ff0000" } as unknown as AnnotationStroke;

    // When the photo renders with it
    render(
      <AnnotationOverlay
        src="https://files.example/p1.png"
        alt="work"
        strokes={[pointless]}
      />,
    );

    // Then the photo is still there
    expect(screen.getByRole("img")).toBeInTheDocument();
  });

  it("writes each text mark over the photo in its own color at its own spot", () => {
    // Given a photo with one text mark
    render(
      <AnnotationOverlay
        src="https://files.example/p1.png"
        alt="work"
        strokes={[]}
        texts={[{ x: 0.25, y: 0.5, text: "i never changes", color: "#ef4444" }]}
      />,
    );

    // Then the words show, colored and placed by their normalized position
    const mark = screen.getByText("i never changes");
    expect(mark).toHaveStyle({ left: "25%", top: "50%", color: "#ef4444" });
  });
  it("keeps a text mark placed near the right or bottom edge fully inside the photo by growing it left and up", () => {
    // Given a text mark near the bottom-right corner
    render(
      <AnnotationOverlay
        src="https://files.example/p1.png"
        alt="work"
        strokes={[]}
        texts={[{ x: 0.95, y: 0.9, text: "near the corner", color: "#ef4444" }]}
      />,
    );

    // Then it hangs from that spot toward the photo's middle, with room for most of the photo's width
    const mark = screen.getByText("near the corner");
    expect(mark).toHaveStyle({ right: "5%", bottom: "10%", maxWidth: "95%" });
    expect(mark.style.left).toBe("");
    expect(mark.style.top).toBe("");
  });
});
