import assert from "node:assert/strict";
import { test } from "node:test";
import { Buffer } from "node:buffer";
import { createRequire } from "node:module";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { appSchemes } from "../src/config/public-settings.ts";

const require = createRequire(import.meta.url);
const appRoot = fileURLToPath(new URL("..", import.meta.url));
const environments = ["development", "test", "production"];
let loads = 0;
async function loadConfig(values) {
  let config;
  await withEnvironment(values, async () => {
    config = (await import(`../app.config.ts?load-${loads++}`)).default;
  });
  return config;
}

async function withEnvironment(values, operation) {
  const previous = Object.fromEntries(
    Object.keys(values).map((name) => [name, process.env[name]]),
  );
  try {
    for (const [name, value] of Object.entries(values))
      process.env[name] = value;
    await operation();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test("development, test and production apps can coexist on the same device", async () => {
  const configs = [];
  for (const environment of environments)
    configs.push(await loadConfig({ EXPO_PUBLIC_APP_ENV: environment }));
  for (const key of [
    (config) => config.name,
    (config) => config.scheme,
    (config) => config.ios.bundleIdentifier,
    (config) => config.android.package,
  ])
    assert.equal(new Set(configs.map(key)).size, environments.length);
  const production = configs[2];
  assert.equal(production.name, "Padelaso");
  assert.equal(production.ios.bundleIdentifier, "com.padelaso.mobile");
  assert.equal(production.android.package, "com.padelaso.mobile");
});

test("each build registers the link scheme its auth client expects", async () => {
  for (const environment of environments) {
    const config = await loadConfig({ EXPO_PUBLIC_APP_ENV: environment });
    assert.equal(config.scheme, appSchemes[environment]);
  }
});

test("unknown environments are rejected", async () => {
  await withEnvironment({ EXPO_PUBLIC_APP_ENV: "staging" }, async () => {
    await assert.rejects(
      import("../app.config.ts?staging"),
      /development, test or production/,
    );
  });
});

test("version comes from package.json and one build number covers every platform", async () => {
  const config = await loadConfig({
    EXPO_PUBLIC_APP_ENV: "production",
    APP_BUILD_NUMBER: "12",
  });
  assert.equal(config.version, require("../package.json").version);
  assert.equal(config.ios.buildNumber, "12");
  assert.equal(config.android.versionCode, 12);
  assert.deepEqual(config.runtimeVersion, { policy: "fingerprint" });
});

test("build numbers must be positive whole numbers", async () => {
  for (const value of ["0", "-1", "1.2", "abc", "01"]) {
    await withEnvironment({ APP_BUILD_NUMBER: value }, async () => {
      await assert.rejects(
        import(`../app.config.ts?build-${loads++}`),
        /APP_BUILD_NUMBER must be a positive whole number/,
      );
    });
  }
});

test("build config blocks privileged keys without including the value in its error", async () => {
  const secret = "sb_secret_do_not_ship_or_log";
  await withEnvironment(
    { EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: secret },
    async () => {
      await assert.rejects(import("../app.config.ts?secret"), (error) => {
        assert.match(error.message, /publishable client key/);
        assert.equal(error.message.includes(secret), false);
        return true;
      });
    },
  );
});

test("build config blocks unexpected public variables", async () => {
  await withEnvironment(
    { EXPO_PUBLIC_PRIVATE_TOKEN: "do-not-ship" },
    async () => {
      await assert.rejects(
        import("../app.config.ts?unexpected"),
        /Unrecognized public mobile setting/,
      );
    },
  );
});

test("Watch target follows the phone signing team and bundle namespace", async () => {
  const targetConfig = require("../targets/watch/expo-target.config.js");
  for (const environment of environments) {
    await withEnvironment({ EXPO_PUBLIC_APP_ENV: environment, APPLE_TEAM_ID: "TESTTEAM01", APP_BUILD_NUMBER: "7" }, async () => {
      const config = (await import(`../app.config.ts?watch-${environment}`)).default;
      const target = targetConfig(config);
      assert.equal(config.ios.appleTeamId, "TESTTEAM01");
      assert.equal(config.ios.buildNumber, "7");
      assert.equal(target.appleTeamId, "TESTTEAM01");
      assert.equal(target.bundleIdentifier, ".watch");
      assert.equal(target.displayName, config.name);
      assert.equal(target.type, "watch");
    });
  }
});

test("JS-only changes keep the native runtime; Watch Swift changes replace it", async () => {
  const expoRoot = dirname(require.resolve("expo/package.json"));
  const fingerprint = createRequire(`${expoRoot}/`)("@expo/fingerprint");
  // Appends a line to one file while hashing, without touching the checkout.
  const hashWithEdit = async (file) => {
    const result = await fingerprint.createFingerprintAsync(appRoot, {
      platforms: ["ios"],
      silent: true,
      fileHookTransform: (source, chunk, isEndOfFile) =>
        file && isEndOfFile && source.type === "file" && source.filePath === file
          ? Buffer.concat([Buffer.from(chunk ?? ""), Buffer.from("\n// edit\n")])
          : chunk,
    });
    return result.hash;
  };
  await withEnvironment({ EXPO_PUBLIC_APP_ENV: "test" }, async () => {
    const base = await hashWithEdit();
    assert.equal(await hashWithEdit("src/strings.ts"), base);
    assert.notEqual(
      await hashWithEdit("targets/watch/PadelasoWatchApp.swift"),
      base,
    );
    assert.notEqual(
      await hashWithEdit("modules/watch-spike/ios/WatchSpikeModule.swift"),
      base,
    );
  });
});
