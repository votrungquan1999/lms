import type { Collection, CollectionOptions, Db, Document } from "mongodb";
import { withSpan } from "src/lib/observability/with-span";

/**
 * Collection methods that hit the DB directly and return a Promise — spanned
 * as `db.<op>` right at the call.
 */
const DIRECT_TERMINALS = new Set([
  "findOne",
  "insertOne",
  "insertMany",
  "updateOne",
  "updateMany",
  "deleteOne",
  "deleteMany",
  "countDocuments",
]);

/** Collection methods that return a lazy cursor (not spanned until a terminal). */
const CURSOR_FACTORIES = new Set(["find", "aggregate"]);

/** Cursor methods that execute the query — the span belongs here. */
const CURSOR_TERMINALS = new Set(["toArray", "next"]);

/** Cursor methods that mutate-and-return the cursor (keep the chain traced). */
const CURSOR_CHAINABLES = new Set(["sort", "limit"]);

/**
 * Builds the locked DB span attribute set. NEVER includes `db.statement` — the
 * query filter / pipeline / update doc must not leak (PII policy).
 * @param op - The Mongo operation name (e.g. "findOne", "find").
 * @param collection - The collection name.
 * @returns The allowlisted attribute object for the span.
 */
function dbAttributes(op: string, collection: string) {
  return {
    "db.system": "mongodb",
    "db.operation": op,
    "db.mongodb.collection": collection,
  };
}

/**
 * Wraps a cursor (`FindCursor`/`AggregationCursor`) so its terminal ops
 * (`toArray`/`next`) emit a `db.<op>` span. Chainables (`sort`/`limit`) return
 * the same proxy so the whole `.sort().limit().toArray()` chain stays traced.
 * @param cursor - The raw driver cursor.
 * @param collection - The originating collection name.
 * @param op - The originating op ("find" or "aggregate").
 * @returns A transparent proxy of the cursor with traced terminals.
 */
function tracedCursor<C extends object>(
  cursor: C,
  collection: string,
  op: string,
): C {
  return new Proxy(cursor, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const fn = value as (...args: unknown[]) => unknown;

      if (typeof prop === "string" && CURSOR_TERMINALS.has(prop)) {
        return (...args: unknown[]): unknown =>
          withSpan(`db.${op}`, dbAttributes(op, collection), async () =>
            fn.apply(target, args),
          );
      }

      if (typeof prop === "string" && CURSOR_CHAINABLES.has(prop)) {
        return (...args: unknown[]): unknown => {
          // The driver mutates and returns the raw cursor; discard it and hand
          // back our proxy so downstream terminals stay spanned.
          fn.apply(target, args);
          return receiver;
        };
      }

      return fn.bind(target);
    },
  }) as C;
}

/**
 * Wraps a `Collection` so each Mongo op emits a `db.<op>` child span. Direct
 * terminals are spanned inline; `find`/`aggregate` return a {@link tracedCursor}.
 * @param coll - The raw driver collection.
 * @param name - The collection name (becomes `db.mongodb.collection`).
 * @returns A transparent proxy of the collection with traced ops.
 */
function tracedCollection<T extends Document>(
  coll: Collection<T>,
  name: string,
): Collection<T> {
  return new Proxy(coll, {
    get(target, prop, receiver) {
      const value = Reflect.get(target, prop, receiver);
      if (typeof value !== "function") {
        return value;
      }

      const fn = value as (...args: unknown[]) => unknown;

      if (typeof prop === "string" && DIRECT_TERMINALS.has(prop)) {
        const op = prop;
        return (...args: unknown[]): unknown =>
          withSpan(`db.${op}`, dbAttributes(op, name), async () =>
            fn.apply(target, args),
          );
      }

      if (typeof prop === "string" && CURSOR_FACTORIES.has(prop)) {
        const op = prop;
        return (...args: unknown[]): unknown => {
          const cursor = fn.apply(target, args) as object;
          return tracedCursor(cursor, name, op);
        };
      }

      return fn.bind(target);
    },
  }) as Collection<T>;
}

/**
 * Wraps a `Db` so every `db.collection(name)` returns a span-aware collection
 * handle. Only `collection` is intercepted; all other `Db` members pass through
 * unchanged. Apply once at connection time so the wrapped `Db` is cached.
 * @param db - The raw MongoDB `Db` instance.
 * @returns A `Db`-typed proxy whose collections emit per-op spans.
 */
export function tracedDb(db: Db): Db {
  return new Proxy(db, {
    get(target, prop, receiver) {
      if (prop === "collection") {
        return <T extends Document = Document>(
          name: string,
          options?: CollectionOptions,
        ): Collection<T> =>
          tracedCollection<T>(target.collection<T>(name, options), name);
      }

      const value = Reflect.get(target, prop, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
  }) as Db;
}
