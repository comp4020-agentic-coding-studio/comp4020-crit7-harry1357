import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { type AddressInfo, createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ROUTES } from "../spec/routes.ts";

// Does the app work at the two viewports it is marked at?
//
// Carried from comp4020-ass2-harry1357 and re-pointed: A2 served a directory of
// built HTML, and a server-rendered app has none, so this boots
// dist/server/entry.mjs --- the same artefact production runs and the spec
// tests use --- with a throwaway database, and walks spec/routes.ts.
//
// Deliberately NOT in `pnpm check`: it needs Chrome, and a roster that can go
// red because a browser didn't launch teaches you to ignore it. Run it before
// you ship, and after any layout work:
//
//   pnpm build && pnpm check:viewports
//
// What it asserts is narrow and load-bearing: the page body never scrolls
// horizontally. Wide content is allowed to scroll inside its own
// `overflow-x: auto` container --- that is the fix, not the failure --- so the
// claim is about `documentElement.scrollWidth`, and the per-element list is
// only there to name what pushed it out.
//
// Why CDP rather than a screenshot: headless Chrome enforces a ~500px minimum
// window, so `--window-size=390,844` lays the page out at 500 and then crops
// the picture to 390. That looks exactly like overflow that isn't there.
// `Emulation.setDeviceMetricsOverride` gives a true 390px viewport instead. A
// number beats a screenshot.

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

/** The two viewports the work is marked in, per the course assessment page. */
const VIEWPORTS = [
  { name: "phone", width: 390, height: 844, mobile: true },
  { name: "desktop", width: 1920, height: 1080, mobile: false },
] as const;

const freePort = (): Promise<number> =>
  new Promise((resolve) => {
    const probe = createServer();
    probe.listen(0, () => {
      const address = probe.address() as AddressInfo;
      probe.close(() => resolve(address.port));
    });
  });

interface Cdp {
  send: (method: string, params?: Record<string, unknown>) => Promise<Record<string, unknown>>;
  close: () => void;
}

async function attach(wsUrl: string): Promise<Cdp> {
  const socket = new WebSocket(wsUrl);
  await new Promise((resolve) => socket.addEventListener("open", resolve, { once: true }));
  let id = 0;
  const pending = new Map<number, { resolve: (v: Record<string, unknown>) => void; reject: (e: Error) => void }>();
  let sessionId: string | undefined;
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(String(event.data)) as {
      id?: number;
      error?: unknown;
      result?: Record<string, unknown>;
    };
    if (message.id === undefined) return;
    const waiter = pending.get(message.id);
    if (!waiter) return;
    pending.delete(message.id);
    if (message.error) waiter.reject(new Error(JSON.stringify(message.error)));
    else waiter.resolve(message.result ?? {});
  });
  const raw = (method: string, params: Record<string, unknown> = {}, withSession = true) =>
    new Promise<Record<string, unknown>>((resolve, reject) => {
      const next = ++id;
      pending.set(next, { resolve, reject });
      socket.send(
        JSON.stringify({ id: next, method, params, ...(withSession && sessionId ? { sessionId } : {}) }),
      );
    });
  const target = (await raw("Target.createTarget", { url: "about:blank" }, false)) as {
    targetId: string;
  };
  const attached = (await raw(
    "Target.attachToTarget",
    { targetId: target.targetId, flatten: true },
    false,
  )) as { sessionId: string };
  sessionId = attached.sessionId;
  await raw("Page.enable");
  await raw("Runtime.enable");
  return { send: raw, close: () => socket.close() };
}

const MEASURE = `(() => {
  const vw = innerWidth;
  const offenders = [];
  for (const el of document.querySelectorAll('body *')) {
    const style = getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden') continue;
    if (!el.getClientRects().length) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) continue;
    if (rect.right > vw + 1 || rect.left < -1) {
      offenders.push(el.tagName.toLowerCase()
        + (el.id ? '#' + el.id : '')
        + (typeof el.className === 'string' && el.className ? '.' + el.className.trim().split(/\\s+/)[0] : '')
        + ' [' + Math.round(rect.left) + '…' + Math.round(rect.right) + ']');
    }
  }
  return { scrollWidth: document.documentElement.scrollWidth, viewport: vw, offenders: offenders.slice(0, 5) };
})()`;

async function main(): Promise<void> {
  const dbDir = mkdtempSync(join(tmpdir(), "viewports-db-"));
  const profile = mkdtempSync(join(tmpdir(), "viewports-profile-"));
  const port = await freePort();
  const appUrl = `http://127.0.0.1:${port}`;

  const server = spawn("node", ["./dist/server/entry.mjs"], {
    env: { ...process.env, HOST: "127.0.0.1", PORT: String(port), DATABASE_PATH: join(dbDir, "probe.db") },
    stdio: "ignore",
  });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--remote-debugging-port=9222",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--disable-gpu",
      "about:blank",
    ],
    { stdio: "ignore" },
  );

  // Best-effort: Chrome is still writing to its profile as it dies, so a
  // recursive remove races it and throws ENOTEMPTY. A probe that reports a
  // cleanup race instead of its actual finding is worse than no probe, and the
  // OS reaps these directories anyway.
  const cleanup = (): void => {
    server.kill();
    chrome.kill();
    for (const dir of [dbDir, profile]) {
      try {
        rmSync(dir, { recursive: true, force: true });
      } catch {
        /* the OS will reap it */
      }
    }
  };

  let failures = 0;
  try {
    for (let attempt = 0; ; attempt++) {
      try {
        if ((await fetch(appUrl)).ok) break;
      } catch {
        /* not up yet */
      }
      if (attempt >= 50) throw new Error(`the built server did not come up at ${appUrl}`);
      await new Promise((r) => setTimeout(r, 200));
    }

    let wsUrl = "";
    for (let attempt = 0; ; attempt++) {
      try {
        const version = (await (await fetch("http://localhost:9222/json/version")).json()) as {
          webSocketDebuggerUrl: string;
        };
        wsUrl = version.webSocketDebuggerUrl;
        break;
      } catch {
        /* not up yet */
      }
      if (attempt >= 50) throw new Error("Chrome did not expose a debugging port");
      await new Promise((r) => setTimeout(r, 200));
    }

    const cdp = await attach(wsUrl);
    const measure = async (): Promise<{ scrollWidth: number; viewport: number; offenders: string[] }> => {
      const result = (await cdp.send("Runtime.evaluate", {
        expression: MEASURE,
        returnByValue: true,
      })) as { result: { value: { scrollWidth: number; viewport: number; offenders: string[] } } };
      return result.result.value;
    };
    const goto = async (url: string): Promise<void> => {
      await cdp.send("Page.navigate", { url });
      await cdp.send("Runtime.evaluate", {
        expression: "new Promise(r => setTimeout(r, 350))",
        awaitPromise: true,
      });
    };

    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: 390,
      height: 844,
      deviceScaleFactor: 3,
      mobile: true,
    });

    // Prove the probe can fail before trusting a green one: plant something
    // 3000px wide and check it is detected. A sensor that has stopped looking
    // reports exactly what a clean page reports.
    await goto(`${appUrl}/`);
    await cdp.send("Runtime.evaluate", {
      expression:
        "document.body.insertAdjacentHTML('beforeend', '<div id=\"probe-canary\" style=\"width:3000px;height:8px\"></div>')",
    });
    const canary = await measure();
    if (canary.offenders.length === 0 || canary.scrollWidth <= canary.viewport) {
      console.error("✗ self-test: a planted 3000px element was NOT detected — the probe is blind");
      cleanup();
      process.exit(1);
    }
    console.log("✓ self-test: planted 3000px element detected, the probe is looking");

    for (const viewport of VIEWPORTS) {
      await cdp.send("Emulation.setDeviceMetricsOverride", {
        width: viewport.width,
        height: viewport.height,
        deviceScaleFactor: viewport.mobile ? 3 : 1,
        mobile: viewport.mobile,
      });
      for (const route of ROUTES) {
        await goto(new URL(route, appUrl).href);
        const { scrollWidth, viewport: vw, offenders } = await measure();
        if (scrollWidth > vw + 1) {
          failures += 1;
          console.error(
            `✗ ${route} at ${viewport.width}×${viewport.height}: scrollWidth ${scrollWidth} > ${vw}`,
          );
          for (const offender of offenders) console.error(`    ${offender}`);
        } else {
          console.log(`✓ ${route} at ${viewport.width}×${viewport.height}`);
        }
      }
    }
    cdp.close();
  } finally {
    cleanup();
  }

  if (failures > 0) {
    console.error(`\n✗ ${failures} page/viewport combination(s) scroll sideways`);
    process.exit(1);
  }
  console.log(
    `\n✓ ${ROUTES.length} route(s) × ${VIEWPORTS.length} viewports — no page scrolls horizontally`,
  );
}

await main();
