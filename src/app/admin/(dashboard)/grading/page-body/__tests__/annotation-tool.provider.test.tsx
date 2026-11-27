// @vitest-environment jsdom
import { act, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AnnotationToolProvider,
  useAnnotationTool,
  usePhotoMarks,
} from "../annotation-tool.state";

const KEY = "answers/s/p1.png";
const SIZE = { width: 400, height: 200 };

/** Stands in for the grade form: counts its renders and exposes the marks it would post. */
let formRenders = 0;
let latestMarks: ReturnType<typeof usePhotoMarks> = null;
function FormProbe() {
  formRenders += 1;
  latestMarks = usePhotoMarks();
  return null;
}

/** Stands in for the marking tool: hands its dispatch to the test. */
let dispatch: ReturnType<typeof useAnnotationTool>["dispatch"];
function ToolProbe() {
  dispatch = useAnnotationTool().dispatch;
  return null;
}

function mount() {
  formRenders = 0;
  render(
    <AnnotationToolProvider initialAnnotations={[]}>
      <ToolProbe />
      <FormProbe />
    </AnnotationToolProvider>,
  );
}

describe("photo marks while the pen is moving", () => {
  afterEach(() => vi.restoreAllMocks());

  it("does not re-render the form or rebuild the marks JSON on pen movement", () => {
    mount();
    act(() =>
      dispatch({
        type: "START_STROKE",
        mediaKey: KEY,
        point: { x: 0.1, y: 0.1 },
        size: SIZE,
      }),
    );
    const rendersBeforeMoves = formRenders;
    const stringify = vi.spyOn(JSON, "stringify");

    for (let i = 1; i <= 20; i++) {
      act(() =>
        dispatch({ type: "ADD_POINT", point: { x: 0.1 + i / 100, y: 0.2 } }),
      );
    }

    expect(formRenders).toBe(rendersBeforeMoves);
    expect(stringify).not.toHaveBeenCalled();
  });

  it("gives the form the finished stroke once the pen lifts", () => {
    mount();
    act(() =>
      dispatch({
        type: "START_STROKE",
        mediaKey: KEY,
        point: { x: 0.1, y: 0.1 },
        size: SIZE,
      }),
    );
    act(() => dispatch({ type: "ADD_POINT", point: { x: 0.3, y: 0.3 } }));
    expect(latestMarks?.hasUnsavedMarks).toBe(false);

    act(() => dispatch({ type: "END_STROKE" }));

    expect(latestMarks?.hasUnsavedMarks).toBe(true);
    expect(JSON.parse(latestMarks?.marksJson ?? "[]")).toEqual([
      expect.objectContaining({
        mediaKey: KEY,
        strokes: [expect.objectContaining({ points: expect.any(Array) })],
      }),
    ]);
  });
});
