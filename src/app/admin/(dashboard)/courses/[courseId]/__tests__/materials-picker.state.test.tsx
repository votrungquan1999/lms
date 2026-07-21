// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MaterialContentType } from "../material-upload.schema";
import {
  MaterialsPickerProvider,
  useMaterialsPickerActions,
  useMaterialsPickerState,
} from "../materials-picker.state";

const { requestMaterialUploadSlotsAction, addCourseMaterialAction } =
  vi.hoisted(() => ({
    requestMaterialUploadSlotsAction: vi.fn(),
    addCourseMaterialAction: vi.fn(),
  }));

vi.mock("../material-actions", () => ({
  requestMaterialUploadSlotsAction,
  addCourseMaterialAction,
}));

/** Builds a File with a forced type/size without allocating real bytes. */
function makeFile(name: string, type: string, size: number): File {
  const file = new File(["x"], name, { type });
  Object.defineProperty(file, "size", { value: size });
  return file;
}

const TEN_MB = 10 * 1024 * 1024;

function usePicker() {
  return {
    ...useMaterialsPickerState(),
    ...useMaterialsPickerActions(),
  };
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <MaterialsPickerProvider courseId="course-1">
      {children}
    </MaterialsPickerProvider>
  );
}

describe("materials picker: addFiles validation", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("rejects an unsupported file type and adds nothing", () => {
    const { result } = renderHook(() => usePicker(), { wrapper });

    act(() => {
      result.current.addFiles([
        makeFile("evil.exe", "application/x-msdownload", 10),
      ]);
    });

    expect(result.current.validationError).toBe("Unsupported file type");
    expect(result.current.selectedFiles).toHaveLength(0);
  });

  it("rejects a file larger than 10 MB and adds nothing", () => {
    const { result } = renderHook(() => usePicker(), { wrapper });

    act(() => {
      result.current.addFiles([
        makeFile("big.pdf", MaterialContentType.PDF, TEN_MB + 1),
      ]);
    });

    expect(result.current.validationError).toBe(
      "Each file must be 10 MB or smaller",
    );
    expect(result.current.selectedFiles).toHaveLength(0);
  });
});

describe("materials picker: uploadSelectedFiles error boundary", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("surfaces the failure as a validation error and clears the uploading flag when slot minting fails", async () => {
    requestMaterialUploadSlotsAction.mockResolvedValue({
      success: false,
      message: "slot minting boom",
    });

    const { result } = renderHook(() => usePicker(), { wrapper });

    // Given a valid file is selected
    act(() => {
      result.current.addFiles([
        makeFile("syllabus.pdf", MaterialContentType.PDF, 1000),
      ]);
    });
    expect(result.current.selectedFiles).toHaveLength(1);

    // When the upload runs and slot minting fails
    await act(async () => {
      await result.current.uploadSelectedFiles();
    });

    // Then the error surfaces, uploading resets, and nothing was persisted
    expect(result.current.validationError).toBe("slot minting boom");
    expect(result.current.isUploading).toBe(false);
    expect(addCourseMaterialAction).not.toHaveBeenCalled();
  });
});
