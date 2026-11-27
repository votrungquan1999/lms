import { describe, expect, it } from "vitest";
import { arrowPoints, ellipsePoints } from "../annotation-shapes";
import {
  type AnnotationToolState,
  annotationReducer,
  buildInitialAnnotationState,
} from "../annotation-tool.state";

const KEY = "answers/s/p1.png";

/** Draws a complete stroke (down → move → up) on a fresh state. */
function drawStroke(
  start: AnnotationToolState,
  points: { x: number; y: number }[],
): AnnotationToolState {
  let s = annotationReducer(start, {
    type: "START_STROKE",
    mediaKey: KEY,
    point: points[0],
    size: { width: 400, height: 200 },
  });
  for (const p of points.slice(1)) {
    s = annotationReducer(s, { type: "ADD_POINT", point: p });
  }
  return annotationReducer(s, { type: "END_STROKE" });
}

describe("annotationReducer", () => {
  it("records a freehand stroke in the active color, and undo/clear remove strokes", () => {
    let state = buildInitialAnnotationState([], "#ff0000");

    // Draw a red stroke over the photo
    state = drawStroke(state, [
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.3 },
    ]);
    expect(state.entriesByKey[KEY]).toHaveLength(1);
    expect(state.entriesByKey[KEY][0].color).toBe("#ff0000");
    expect(state.entriesByKey[KEY][0].points).toEqual([
      { x: 0.1, y: 0.1 },
      { x: 0.2, y: 0.3 },
    ]);

    // Switch color and draw a second stroke
    state = annotationReducer(state, { type: "SET_COLOR", color: "#0000ff" });
    state = drawStroke(state, [
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.6 },
    ]);
    expect(state.entriesByKey[KEY]).toHaveLength(2);
    expect(state.entriesByKey[KEY][1].color).toBe("#0000ff");

    // Undo removes the most recent stroke
    state = annotationReducer(state, { type: "UNDO", mediaKey: KEY });
    expect(state.entriesByKey[KEY]).toHaveLength(1);

    // Clear (erase) removes all strokes for the photo
    state = annotationReducer(state, { type: "CLEAR", mediaKey: KEY });
    expect(state.entriesByKey[KEY]).toHaveLength(0);
  });

  it("rebuilds a circle or an arrow from where the drag began, whatever path the pointer took", () => {
    const start = { x: 0.2, y: 0.2 };
    const wander = { x: 0.9, y: 0.1 };
    const end = { x: 0.5, y: 0.6 };
    const size = { width: 400, height: 200 };

    // A circle keeps only the box from the drag start to where it ended
    let state = annotationReducer(buildInitialAnnotationState([], "#ff0000"), {
      type: "SET_TOOL",
      tool: "circle",
    });
    state = drawStroke(state, [start, wander, end]);
    expect(state.entriesByKey[KEY][0].points).toEqual(
      ellipsePoints(start, end),
    );

    // An arrow runs from the drag start to where it ended, head included
    state = annotationReducer(state, { type: "SET_TOOL", tool: "arrow" });
    state = drawStroke(state, [start, wander, end]);
    expect(state.entriesByKey[KEY][1].points).toEqual(
      arrowPoints(start, end, size),
    );
  });

  it("seeds initial state from existing annotations", () => {
    const state = buildInitialAnnotationState(
      [
        {
          mediaKey: KEY,
          strokes: [{ color: "#000", points: [{ x: 0, y: 0 }] }],
        },
      ],
      "#ff0000",
    );
    expect(state.entriesByKey[KEY]).toHaveLength(1);
  });
});
