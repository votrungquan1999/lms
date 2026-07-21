// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AnswerImagePickerProvider,
  useAnswerImagePickerActions,
  useAnswerImagePickerState,
} from "../answer-image-picker.state";

/** Builds a File with a forced type/size without allocating real bytes. */
function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const TEN_MB = 10 * 1024 * 1024;

function usePicker() {
  return {
    ...useAnswerImagePickerState(),
    ...useAnswerImagePickerActions(),
  };
}

describe("answer-image picker: addFiles validation", () => {
  it("rejects an unsupported content type and adds nothing", () => {
    const { result } = renderHook(() => usePicker(), {
      wrapper: AnswerImagePickerProvider,
    });

    act(() => {
      result.current.addFiles([makeFile("notes.txt", "text/plain", 100)]);
    });

    expect(result.current.validationError).toBe("Unsupported image type");
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it("rejects a photo larger than 10 MB and adds nothing", () => {
    const { result } = renderHook(() => usePicker(), {
      wrapper: AnswerImagePickerProvider,
    });

    act(() => {
      result.current.addFiles([makeFile("big.png", "image/png", TEN_MB + 1)]);
    });

    expect(result.current.validationError).toBe(
      "Each photo must be 10 MB or smaller",
    );
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it("rejects the 4th photo past the 3-photo cap while keeping the first three", () => {
    const { result } = renderHook(() => usePicker(), {
      wrapper: AnswerImagePickerProvider,
    });

    act(() => {
      result.current.addFiles([
        makeFile("a.png", "image/png", 10),
        makeFile("b.png", "image/png", 10),
        makeFile("c.png", "image/png", 10),
      ]);
    });
    expect(result.current.selectedFiles).toHaveLength(3);

    act(() => {
      result.current.addFiles([makeFile("d.png", "image/png", 10)]);
    });

    expect(result.current.selectedFiles).toHaveLength(3);
    expect(result.current.validationError).toBe(
      "You can attach at most 3 photos",
    );
  });

  it("accepts valid photos and clears any prior error", () => {
    const { result } = renderHook(() => usePicker(), {
      wrapper: AnswerImagePickerProvider,
    });

    // Given a prior rejection sets an error
    act(() => {
      result.current.addFiles([makeFile("notes.txt", "text/plain", 10)]);
    });
    expect(result.current.validationError).not.toBeNull();

    // When a valid photo is added
    act(() => {
      result.current.addFiles([makeFile("ok.png", "image/png", 10)]);
    });

    // Then it is accepted and the error clears
    expect(result.current.selectedFiles).toHaveLength(1);
    expect(result.current.validationError).toBeNull();
  });
});
