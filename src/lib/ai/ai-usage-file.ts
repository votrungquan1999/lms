import { existsSync, readFileSync } from "node:fs";
import { z } from "zod";

/** Token totals for one served model within one run. */
export interface ModelUsageTotals {
  modelServed: string;
  modelRequested: string;
  requests: number;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
}

/** What one run id left in the usage file. */
export interface RunUsageTotals {
  perModel: ModelUsageTotals[];
  requests: number;
  /** Unparseable lines in the whole file; they cannot be tied to a run. */
  malformedLines: number;
  environments: string[];
  fingerprints: string[];
}

/**
 * Totals one run's records in the usage file, per served model.
 * @param filePath - Absolute path of the JSONL usage file.
 * @param runId - The run to total; an empty id matches nothing.
 * @returns The run's totals, empty when the file or run is absent.
 */
export function readRunUsageTotals(
  filePath: string,
  runId: string,
): RunUsageTotals {
  const totals: RunUsageTotals = {
    perModel: [],
    requests: 0,
    malformedLines: 0,
    environments: [],
    fingerprints: [],
  };
  if (!existsSync(filePath)) return totals;

  const rows = new Map<string, ModelUsageTotals>();
  for (const line of readFileSync(filePath, "utf8").split("\n")) {
    if (line.trim() === "") continue;
    const record = parseLine(line);
    if (!record) {
      totals.malformedLines += 1;
      continue;
    }
    // An empty run id must never match records that have no run id.
    if (runId === "" || record.run_id !== runId) continue;

    totals.requests += 1;
    addUnique(totals.environments, record.environment);
    addUnique(totals.fingerprints, record.key_fingerprint);

    // Keyed on the served model (what is billed), requested alongside.
    const modelServed =
      record.model_served ?? record.model_requested ?? "unknown";
    const modelRequested = record.model_requested ?? modelServed;
    const key = `${modelServed}\u0000${modelRequested}`;
    const row = rows.get(key) ?? {
      modelServed,
      modelRequested,
      requests: 0,
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
    };
    row.requests += 1;
    row.inputTokens += record.input_tokens ?? 0;
    row.outputTokens += record.output_tokens ?? 0;
    row.thinkingTokens += record.thinking_tokens ?? 0;
    rows.set(key, row);
  }
  totals.perModel = [...rows.values()];
  return totals;
}

/** The record fields the totals read; the writer's other fields are ignored. */
const usageLineSchema = z.object({
  run_id: z.string().optional(),
  environment: z.string().optional(),
  key_fingerprint: z.string().optional(),
  model_requested: z.string().optional(),
  model_served: z.string().optional(),
  input_tokens: z.number().optional(),
  output_tokens: z.number().optional(),
  thinking_tokens: z.number().optional(),
});

/**
 * Parses one JSONL line.
 * @param line - A non-empty line of the usage file.
 * @returns The record fields, or undefined when the line is not a usable record.
 */
function parseLine(line: string): z.infer<typeof usageLineSchema> | undefined {
  try {
    const parsed = usageLineSchema.safeParse(JSON.parse(line));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

/**
 * Appends a value to a list once.
 * @param list - The list to extend.
 * @param value - The value to add; undefined is skipped.
 */
function addUnique(list: string[], value: string | undefined): void {
  if (value !== undefined && !list.includes(value)) list.push(value);
}
