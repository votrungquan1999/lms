import type { AnnotationEntry } from "src/lib/annotation-service";
import { describe, expect, it } from "vitest";
import { arrowPoints, ellipsePoints } from "../annotation-shapes";
import {
  type AnnotationToolState,
  annotationReducer,
  buildInitialAnnotationState,
  collectAnnotations,
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

  it("loads a stored photo entry that holds only text marks, and Undo takes the text back", () => {
    // Given a stored entry with text marks and no stroke list
    const textOnly = {
      mediaKey: KEY,
      texts: [{ x: 0.2, y: 0.3, text: "i never changes", color: "#ef4444" }],
    } as unknown as AnnotationEntry;

    // When the tool loads it
    let state = buildInitialAnnotationState([textOnly], "#ff0000");
    expect(state.entriesByKey[KEY]).toEqual([]);
    expect(state.textsByKey[KEY]).toHaveLength(1);

    // Then one Undo removes the text
    state = annotationReducer(state, { type: "UNDO", mediaKey: KEY });
    expect(state.textsByKey[KEY]).toEqual([]);
  });
  it("keeps one true order across save and reopen, so Undo takes back a stroke made after a text", () => {
    // Given a text made first, then a stroke, saved and reopened
    let state = buildInitialAnnotationState([], "#ff0000");
    state = annotationReducer(state, {
      type: "START_TEXT",
      mediaKey: KEY,
      point: { x: 0.2, y: 0.2 },
    });
    state = annotationReducer(state, { type: "SET_TEXT", text: "first" });
    state = annotationReducer(state, { type: "COMMIT_TEXT" });
    state = drawStroke(state, [
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.6 },
    ]);
    const reopened = buildInitialAnnotationState(
      JSON.parse(JSON.stringify(collectAnnotations(state))),
      "#ff0000",
    );

    // When she presses Undo once
    const undone = annotationReducer(reopened, { type: "UNDO", mediaKey: KEY });

    // Then the stroke goes and the text stays
    expect(undone.entriesByKey[KEY]).toEqual([]);
    expect(undone.textsByKey[KEY]).toHaveLength(1);
  });

  it("opens marks saved without an order as strokes then texts, ahead of marks made after", () => {
    // Given a photo saved before marks carried an order
    const old: AnnotationEntry = {
      mediaKey: KEY,
      strokes: [{ color: "#000", points: [{ x: 0, y: 0 }] }],
      texts: [{ x: 0.2, y: 0.3, text: "old", color: "#ef4444" }],
    };
    let state = buildInitialAnnotationState([old], "#ff0000");

    // When a new stroke is made and the marks are saved and reopened
    state = drawStroke(state, [
      { x: 0.5, y: 0.5 },
      { x: 0.6, y: 0.6 },
    ]);
    state = buildInitialAnnotationState(
      JSON.parse(JSON.stringify(collectAnnotations(state))),
      "#ff0000",
    );

    // Then Undo takes the new stroke, then the old text, then the old stroke
    state = annotationReducer(state, { type: "UNDO", mediaKey: KEY });
    expect(state.entriesByKey[KEY]).toHaveLength(1);
    state = annotationReducer(state, { type: "UNDO", mediaKey: KEY });
    expect(state.textsByKey[KEY]).toEqual([]);
    expect(state.entriesByKey[KEY]).toHaveLength(1);
  });
});
