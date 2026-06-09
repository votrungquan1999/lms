// @vitest-environment jsdom
import { render } from "@testing-library/react";
import { MediaContentType, type QuestionMedia } from "src/lib/question-service";
import { describe, expect, it } from "vitest";
import { QuestionMedia as QuestionMediaBlock } from "../question-media.ui";

describe("QuestionMedia", () => {
  it("renders images and video in the teacher's order with their presigned src", () => {
    const media: QuestionMedia[] = [
      {
        key: "media/a.png",
        url: "https://signed.example/a",
        contentType: MediaContentType.PNG,
        order: 0,
      },
      {
        key: "media/b.mp4",
        url: "https://signed.example/b",
        contentType: MediaContentType.MP4,
        order: 1,
      },
      {
        key: "media/c.webp",
        url: "https://signed.example/c",
        contentType: MediaContentType.WEBP,
        order: 2,
      },
    ];

    const { container } = render(<QuestionMediaBlock media={media} />);

    // DOM order matches the teacher's order, images as <img>, video as <video>
    const elements = Array.from(container.querySelectorAll("img, video"));
    expect(elements.map((el) => el.tagName.toLowerCase())).toEqual([
      "img",
      "video",
      "img",
    ]);
    expect(elements.map((el) => el.getAttribute("src"))).toEqual([
      "https://signed.example/a",
      "https://signed.example/b",
      "https://signed.example/c",
    ]);
    expect(container.querySelector("video")).toHaveAttribute("controls");
  });

  it("renders by the order field even when the array arrives out of order", () => {
    const media: QuestionMedia[] = [
      {
        key: "media/second.png",
        url: "https://signed.example/second",
        contentType: MediaContentType.PNG,
        order: 1,
      },
      {
        key: "media/first.png",
        url: "https://signed.example/first",
        contentType: MediaContentType.PNG,
        order: 0,
      },
    ];

    const { container } = render(<QuestionMediaBlock media={media} />);

    // Sorted by `order`, so "first" (order 0) renders before "second" (order 1)
    expect(
      Array.from(container.querySelectorAll("img")).map((el) =>
        el.getAttribute("src"),
      ),
    ).toEqual(["https://signed.example/first", "https://signed.example/second"]);
  });

  it("renders no media block when there is no media", () => {
    const { container } = render(<QuestionMediaBlock media={[]} />);

    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("video")).toBeNull();
  });
});
