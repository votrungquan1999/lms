import { describe, expect, it } from "vitest";
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
