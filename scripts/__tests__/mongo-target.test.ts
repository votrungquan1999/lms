import { describe, expect, it } from "vitest";
import { describeMongoTarget } from "../mongo-target";

/**
 * Feature: the backfill prints its connection target before it reads
 * As the operator
 * I want the host and database name printed before the first read, with
 * credentials stripped
 * So that I can confirm which database a run is about to touch without a
 * password ever landing in a terminal or a log
 */
describe("Feature: the backfill prints its connection target before it reads", () => {
  it("strips user:pass from a plain mongodb:// URI and keeps host and database", () => {
    const target = describeMongoTarget(
      "mongodb://dbuser:s3cr3t@localhost:27017/lms_test",
    );

    expect(target).toContain("localhost:27017");
    expect(target).toContain("lms_test");
    expect(target).not.toContain("s3cr3t");
    expect(target).not.toContain("dbuser");
  });

  it("strips user:pass from an Atlas mongodb+srv:// URI and keeps host and database", () => {
    const target = describeMongoTarget(
      "mongodb+srv://dbuser:s3cr3t@cluster0.abcde.mongodb.net/mydb?retryWrites=true&w=majority",
    );

    expect(target).toContain("cluster0.abcde.mongodb.net");
    expect(target).toContain("mydb");
    expect(target).not.toContain("s3cr3t");
    expect(target).not.toContain("dbuser");
  });
});
