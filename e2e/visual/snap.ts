/**
 * Visual-QA capture helper. Copied into a project at `e2e/visual/snap.ts`.
 *
 * Writes, per call:
 *   <archiveRoot>/<viewport>/<feature>/<state>.png
 *   <archiveRoot>/<viewport>/<feature>/<state>.meta.json
 *
 * The sidecar meta file (not a shared manifest) is deliberate: Playwright
 * workers run in separate processes, so a single shared file would race.
 * The review step assembles the manifest from these sidecars.
 */
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import type { Locator, Page } from "@playwright/test";

interface VisualQaConfig {
  archiveRoot: string;
  viewportPreset: string;
  stabilize?: {
    maskSelectors?: string[];
    freezeClockAt?: string;
    flakinessRetries?: number;
    settleMs?: number;
  };
}

interface SnapOptions {
  /** Files that render this state, so the reviewer can cite file:line. */
  sources?: string[];
}

const DEFAULTS = {
  archiveRoot: ".visual-qa",
  flakinessRetries: 2,
  settleMs: 150,
};

const configCache = new Map<string, VisualQaConfig>();

/**
 * Reads visual-qa.json (or the file named by VISUAL_QA_CONFIG), cached per path.
 * @returns the project's visual-QA configuration
 */
async function loadConfig(): Promise<VisualQaConfig> {
  const path =
    process.env.VISUAL_QA_CONFIG ?? join(process.cwd(), "visual-qa.json");
  const cached = configCache.get(path);
  if (cached) return cached;
  let raw: string | null = null;
  try {
    raw = await readFile(path, "utf8");
  } catch (err) {
    // Only a missing file means "use defaults"; anything else is a real problem.
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
  let config: VisualQaConfig = {
    archiveRoot: DEFAULTS.archiveRoot,
    viewportPreset: "desktop",
  };
  if (raw !== null) {
    try {
      config = JSON.parse(raw) as VisualQaConfig;
    } catch (err) {
      throw new Error(
        `visual-qa.json at ${path} is not valid JSON: ${(err as Error).message}`,
      );
    }
  }
  configCache.set(path, config);
  return config;
}

/**
 * Folder name per screen size and colour scheme, so the same state captured at two
 * widths, or in light and dark, never overwrites itself.
 * @returns e.g. "375x812" or "1280x720-dark"
 */
async function viewportLabel(page: Page): Promise<string> {
  const vp = page.viewportSize();
  const size = vp ? `${vp.width}x${vp.height}` : "default";
  const dark = await page.evaluate(
    () => matchMedia("(prefers-color-scheme: dark)").matches,
  );
  return dark ? `${size}-dark` : size;
}

/**
 * Removes everything that makes two screenshots of an unchanged page differ.
 * @returns whether web fonts finished loading within the wait
 */
async function stabilize(
  page: Page,
  config: VisualQaConfig,
): Promise<{ fontsSettled: boolean }> {
  // Pointer left on the last clicked control would capture its hover style.
  await page.mouse.move(0, 0);

  // Fonts: a fallback face rendering for one frame changes every glyph. Capped, because
  // fonts.ready never resolves on a page still loading, and that state must be capturable.
  const fontsSettled = await page.evaluate(() =>
    Promise.race([
      document.fonts.ready.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 2000)),
    ]),
  );

  // Images: a late-loading image shifts everything below it.
  await page.evaluate(async () => {
    const pending = Array.from(document.images)
      .filter((img) => !img.complete)
      .map(
        (img) =>
          new Promise<void>((resolve) => {
            img.addEventListener("load", () => resolve(), { once: true });
            img.addEventListener("error", () => resolve(), { once: true });
          }),
      );
    await Promise.all(pending);
  });

  // Scrollbars are OS noise; overflow still shows because tiles span the full scroll width.
  await page.addStyleTag({
    content: `
      *::-webkit-scrollbar { display: none !important; }
      * { scrollbar-width: none !important; }
    `,
  });

  // Squiggles appear on some runs and not others. spellcheck is an attribute, not CSS.
  await page.evaluate(() => {
    for (const el of document.querySelectorAll(
      "input, textarea, [contenteditable]",
    )) {
      el.setAttribute("spellcheck", "false");
    }
  });

  await page.waitForTimeout(config.stabilize?.settleMs ?? DEFAULTS.settleMs);
  return { fontsSettled };
}

/**
 * Locators for regions whose content changes every run (timestamps, avatars).
 * @returns one locator per configured mask selector
 */
function maskLocators(page: Page, config: VisualQaConfig): Locator[] {
  return (config.stabilize?.maskSelectors ?? []).map((sel) =>
    page.locator(sel),
  );
}

/** Tiles overlap so an element cut at one tile's edge appears whole in the next. */
const TILE_OVERLAP = 0.15;

/**
 * Captures the whole page as screen-sized tiles. One tall image would be shrunk
 * by the reviewing model until its text is unreadable.
 * @returns the tiles, top to bottom, and the page width they were clipped to
 */
async function shoot(
  page: Page,
  config: VisualQaConfig,
): Promise<{ tiles: Buffer[]; pageWidth: number }> {
  const vp = page.viewportSize() ?? { width: 1280, height: 720 };
  // Full scroll width, so content spilling past the screen edge is visible in the image.
  const { pageWidth, pageHeight } = await page.evaluate(() => ({
    pageWidth: document.documentElement.scrollWidth,
    pageHeight: document.documentElement.scrollHeight,
  }));
  const step = Math.max(1, Math.round(vp.height * (1 - TILE_OVERLAP)));

  const offsets: number[] = [];
  for (let y = 0; y + vp.height < pageHeight; y += step) offsets.push(y);
  // Last tile is bottom-aligned so the end of the page is never skipped.
  offsets.push(Math.max(0, pageHeight - vp.height));

  const tiles: Buffer[] = [];
  for (const y of offsets) {
    tiles.push(
      await page.screenshot({
        fullPage: true,
        clip: {
          x: 0,
          y,
          width: pageWidth,
          height: Math.min(vp.height, pageHeight - y),
        },
        // Playwright defaults this ON for toHaveScreenshot but OFF for page.screenshot.
        animations: "disabled",
        caret: "hide",
        scale: "css",
        mask: maskLocators(page, config),
        maskColor: "#FF00FF",
      }),
    );
  }
  return { tiles, pageWidth };
}

/**
 * True only under playwright.visual.config.ts, which sets VISUAL_QA=1.
 * @returns whether this test run is a visual-QA run
 */
function isVisualRun(): boolean {
  return process.env.VISUAL_QA === "1";
}

const preparedPages = new WeakSet<Page>();

/**
 * Call before the first navigation. The clock must exist before the app's first
 * script runs; freezing it later leaves timestamps from two different timelines.
 */
export async function prepareVisualPage(page: Page): Promise<void> {
  // A fake clock in ordinary e2e runs could break tests that depend on real time.
  if (!isVisualRun()) return;
  preparedPages.add(page);
  const config = await loadConfig();
  if (config.stabilize?.freezeClockAt) {
    await page.clock.install({
      time: new Date(config.stabilize.freezeClockAt),
    });
  }
}

/**
 * One hash over every tile, so any change anywhere on the page changes it.
 * @returns "sha256:<hex>", the form manifest.json compares against
 */
function hash(tiles: Buffer[]): string {
  const h = createHash("sha256");
  for (const tile of tiles) h.update(tile);
  return `sha256:${h.digest("hex")}`;
}

/**
 * Capture one named UI state.
 *
 * @param page - the live Playwright page
 * @param name - "<feature>/<state>", e.g. "add-question/success"
 * @param options - extra capture metadata, such as the source files for this state
 */
export async function snap(
  page: Page,
  name: string,
  options: SnapOptions = {},
): Promise<void> {
  if (!/^[a-z0-9-]+\/[a-z0-9-]+$/.test(name)) {
    throw new Error(
      `snap(): name must be "<feature>/<state>" in kebab-case, got "${name}"`,
    );
  }
  // snap() lines also sit in ordinary e2e specs; only visual runs pay for capture.
  if (!isVisualRun()) return;

  const config = await loadConfig();
  // Without this, timers render against two timelines and look like app bugs.
  if (config.stabilize?.freezeClockAt && !preparedPages.has(page)) {
    throw new Error(
      "snap(): freezeClockAt is set, so call prepareVisualPage(page) before the first page.goto()",
    );
  }
  const { fontsSettled } = await stabilize(page, config);

  // page.screenshot also waits on fonts.ready and would hang on a still-loading page.
  // This undocumented switch skips that wait; the stuck-loading test catches its removal.
  const previousFontSwitch = process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
  if (!fontsSettled) process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = "1";

  // Re-shoot until two consecutive captures are byte-identical. The only
  // true auto-stabiliser found in any VRT tool (Lost Pixel's flakynessRetries).
  const retries =
    config.stabilize?.flakinessRetries ?? DEFAULTS.flakinessRetries;
  let shot: { tiles: Buffer[]; pageWidth: number };
  let previous: string;
  let attempts = 1;
  let stable = false;
  try {
    shot = await shoot(page, config);
    previous = hash(shot.tiles);
    for (let i = 0; i < retries; i++) {
      await page.waitForTimeout(
        config.stabilize?.settleMs ?? DEFAULTS.settleMs,
      );
      const next = await shoot(page, config);
      attempts++;
      const nextHash = hash(next.tiles);
      if (nextHash === previous) {
        stable = true;
        break;
      }
      shot = next;
      previous = nextHash;
    }
  } finally {
    // Process-wide switch: restore it so later captures wait on fonts normally.
    if (previousFontSwitch === undefined)
      delete process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY;
    else process.env.PW_TEST_SCREENSHOT_NO_FONTS_READY = previousFontSwitch;
  }
  // Still saved: an unstable state is worth reviewing, but the reviewer must know.

  const viewport = await viewportLabel(page);
  const viewportDir = join(
    config.archiveRoot ?? DEFAULTS.archiveRoot,
    viewport,
  );
  const base = join(viewportDir, name);
  await mkdir(dirname(base), { recursive: true });
  // First tile keeps the plain name; later tiles are <state>.2.png, <state>.3.png…
  const images: string[] = [];
  for (const [i, tile] of shot.tiles.entries()) {
    const image = i === 0 ? `${name}.png` : `${name}.${i + 1}.png`;
    images.push(image);
    await writeFile(join(viewportDir, image), tile);
  }
  await writeFile(
    `${base}.meta.json`,
    JSON.stringify(
      {
        state: name,
        viewport,
        images,
        stable,
        attempts,
        fontsSettled,
        // Wider than the viewport means the page scrolls sideways: a fact, not a judgement.
        pageWidth: shot.pageWidth,
        sources: options.sources ?? [],
        url: page.url(),
        imageHash: previous,
        capturedAt: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}
