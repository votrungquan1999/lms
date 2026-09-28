import { describe, expect, it } from "vitest";
import { isLocalMongoUri } from "../mongo-uri-guard";

describe("isLocalMongoUri", () => {
  it("accepts the IPv6 loopback literal, which URL.hostname renders with its brackets kept", () => {
    expect(isLocalMongoUri("mongodb://[::1]:27017/lms")).toBe(true);
  });

  it.each([
    [
      "an Atlas SRV URI",
      "mongodb+srv://user:secret@cluster0.example.mongodb.net/lms",
    ],
    [
      "a multi-host URI, which cannot be parsed, even when one host is local",
      "mongodb://localhost:27017,remote.example.com:27017/lms",
    ],
  ])("refuses %s", (_label, uri) => {
    expect(isLocalMongoUri(uri)).toBe(false);
  });
});
