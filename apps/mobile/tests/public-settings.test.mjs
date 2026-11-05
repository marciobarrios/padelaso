import assert from "node:assert/strict";
import { test } from "node:test";
import { parsePublicSettings } from "../src/config/public-settings.ts";

test("a fresh checkout works without credentials", () => {
  assert.deepEqual(parsePublicSettings({}), {
    status: "sample",
    environment: "development",
  });
});
test("test backend accepts only an HTTPS origin and publishable key", () => {
  assert.deepEqual(
    parsePublicSettings({
      environment: "test",
      url: "https://example.supabase.co/",
      publishableKey: "sb_publishable_example",
    }),
    {
      status: "configured",
      environment: "test",
      url: "https://example.supabase.co",
      publishableKey: "sb_publishable_example",
    },
  );
});
test("unsafe and incomplete settings fail without echoing values", () => {
  for (const input of [
    { environment: "production" },
    { url: "https://example.supabase.co" },
    {
      url: "https://example.supabase.co",
      publishableKey: "sb_secret_do_not_echo",
    },
    { url: "https://example.supabase.co", publishableKey: "eyJservice_role" },
    ...[
      "http://example.com",
      "not-a-url",
      "https://user:password@example.com",
      "https://example.com/?secret=value",
      "https://example.com/api",
    ].map((url) => ({ url, publishableKey: "sb_publishable_example" })),
  ])
    assert.deepEqual(parsePublicSettings(input), { status: "invalid" });
});
