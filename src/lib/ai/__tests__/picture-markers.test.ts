import { describe, expect, it } from "vitest";
import {
  documentPictureNumbers,
  type MarkedQuestion,
  readPictureMarkers,
} from "../picture-markers";

/** A question whose content is `content`, the rest filled in. */
function question(content: string, extra: Partial<MarkedQuestion> = {}) {
  return { title: "Câu 1", content, ...extra };
}

describe("readPictureMarkers", () => {
  it("attaches the pictures marked in the title, content and options, in the order found, and removes the markers", () => {
    const read = readPictureMarkers(
      question("Quan sát [image 2] hình", {
        title: "[image 1]Câu 1",
        options: [
          { text: "Tế bào", isCorrect: true },
          { text: "[image 3]Mô", isCorrect: false },
        ],
      }),
      [1, 2, 3],
    );

    expect(read.imageNumbers).toEqual([1, 2, 3]);
    expect(read.title).toBe("Câu 1");
    expect(read.content).toBe("Quan sát hình");
    expect(read.options).toEqual([
      { text: "Tế bào", isCorrect: true },
      { text: "Mô", isCorrect: false },
    ]);
  });
});

describe("readPictureMarkers numbers", () => {
  it("attaches a picture once, and removes but does not attach a marker the document does not have", () => {
    const read = readPictureMarkers(
      question(
        "[image 1] Hình [image 1] và [image 9] và [image 99999999999999999999]",
      ),
      [1, 2],
    );

    expect(read.imageNumbers).toEqual([1]);
    expect(read.content).not.toContain("[image");
  });
});

describe("readPictureMarkers marker forms", () => {
  it.each([
    "[Image 3]",
    "[image  3]",
    "[ image 3 ]",
    "[image 03]",
    "[IMAGE 3]",
  ])("reads %s as picture 3", (marker) => {
    const read = readPictureMarkers(question(`Hình ${marker} bên`), [3]);

    expect(read.imageNumbers).toEqual([3]);
    expect(read.content).toBe("Hình bên");
  });

  it.each([
    "[hình 3]",
    "\\[image 3\\]",
    "[image 3, 4]",
    "[image\n3]",
    "[\nimage 3]",
    "[image 3\n]",
  ])("leaves %s as text and attaches nothing", (odd) => {
    const read = readPictureMarkers(question(`Hình ${odd} bên`), [3, 4]);

    expect(read.imageNumbers).toEqual([]);
    expect(read.content).toBe(`Hình ${odd} bên`);
  });
});

describe("readPictureMarkers whitespace", () => {
  it("drops a marker's whole line and leaves one blank line where marker lines were stacked", () => {
    const read = readPictureMarkers(
      question("Đề bài\n\n[image 1]\n\n\n\n[image 1]\n\nCâu hỏi"),
      [1],
    );

    expect(read.imageNumbers).toEqual([1]);
    expect(read.content).toBe("Đề bài\n\nCâu hỏi");
  });

  it("turns a text that was only a marker into an empty one, so the import check can name it", () => {
    const read = readPictureMarkers(
      question("Hình", { options: [{ text: " [image 2] ", isCorrect: true }] }),
      [2],
    );

    expect(read.options?.[0]?.text).toBe("");
    expect(read.imageNumbers).toEqual([2]);
  });

  it.each([
    ["sinh [image 12]trưởng", "sinh trưởng"],
    ["sinh[image 12]trưởng", "sinh trưởng"],
    ["[image 11]TL2: đáp án", "TL2: đáp án"],
    ["Hình: [image 12]", "Hình:"],
    ["| A | [image 12] |\n| B | x |", "| A | |\n| B | x |"],
    ["- bước 1\n- [image 12]\n- bước 3", "- bước 1\n-\n- bước 3"],
    ["a[image 1][image 2]b", "a b"],
    ["a[image 1] [image 2]b", "a b"],
    ["x  [image 2]\ny", "x\ny"],
    ["line\n   \n[image 1]\n   \nnext", "line\n\nnext"],
  ])(
    "removes the marker in %j without gluing or splitting words",
    (content, expected) => {
      expect(readPictureMarkers(question(content), [12, 11]).content).toBe(
        expected,
      );
    },
  );
});

describe("readPictureMarkers without markers", () => {
  it("returns a field that has no marker byte for byte", () => {
    const content = "  x\n\n\n\ny  ";

    expect(readPictureMarkers(question(content), [1]).content).toBe(content);
  });
});

describe("documentPictureNumbers", () => {
  it("lists each picture the document marks once, in the order first seen", () => {
    expect(
      documentPictureNumbers(
        "[image 2]Câu 1\n[image 1] x [image 2]\n[image 10]",
      ),
    ).toEqual([2, 1, 10]);
  });

  it("does not count a marker the extractor could not have written", () => {
    expect(documentPictureNumbers("[IMAGE 3] and [image 4]")).toEqual([4]);
  });

  it("lists nothing for a document without markers", () => {
    expect(documentPictureNumbers("Câu 1: không có hình")).toEqual([]);
  });
});

describe("readPictureMarkers answer-key fields", () => {
  it("removes markers from the model answer and explanation without attaching their pictures", () => {
    const read = readPictureMarkers(
      question("Đề", {
        referenceAnswer: "[image 4]\n\n[image 4]\nĐáp án [image 5]",
        explanation: "Vì sao [image 6] vậy",
      }),
      [4, 5, 6],
    );

    expect(read.imageNumbers).toEqual([]);
    expect(read.referenceAnswer).toBe("Đáp án");
    expect(read.explanation).toBe("Vì sao vậy");
  });

  it("still attaches a picture the question's own text marks when its answer marks it too", () => {
    const read = readPictureMarkers(
      question("[image 4]Đề", { referenceAnswer: "Đáp án [image 4]" }),
      [4],
    );

    expect(read.imageNumbers).toEqual([4]);
    expect(read.referenceAnswer).toBe("Đáp án");
  });

  it("leaves out a model answer or explanation that was only a marker, so the import is not stopped on a field the question card does not show", () => {
    const read = readPictureMarkers(
      question("Đề", {
        referenceAnswer: "[image 4]",
        explanation: " [image 5] ",
      }),
      [4, 5],
    );

    expect(read.referenceAnswer).toBeUndefined();
    expect(read.explanation).toBeUndefined();
  });
});
