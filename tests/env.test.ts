import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { register } from "../instrumentation.ts";
import { getAppUrl, getHealthSnapshot, validateProductionEnv } from "../lib/env.ts";

const originalNodeEnv = process.env.NODE_ENV;
const originalAppUrl = process.env.APP_URL;
const originalPort = process.env.PORT;
const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  restoreEnv();
});

test("getAppUrl falls back to localhost with PORT when APP_URL is unset", () => {
  delete process.env.APP_URL;
  process.env.PORT = "4010";

  assert.equal(getAppUrl(), "http://127.0.0.1:4010");
});

test("validateProductionEnv allows non-production without APP_URL", () => {
  process.env.NODE_ENV = "test";
  delete process.env.APP_URL;

  assert.doesNotThrow(() => validateProductionEnv());
});

test("validateProductionEnv rejects missing APP_URL in production", () => {
  process.env.NODE_ENV = "production";
  delete process.env.APP_URL;

  assert.throws(
    () => validateProductionEnv(),
    /APP_URL is required when NODE_ENV=production\./,
  );
});

test("validateProductionEnv rejects invalid APP_URL protocols in production", () => {
  process.env.NODE_ENV = "production";
  process.env.APP_URL = "ftp://example.com";

  assert.throws(
    () => validateProductionEnv(),
    /APP_URL must be a valid http:\/\/ or https:\/\/ URL\./,
  );
});

test("register runs production env validation", async () => {
  process.env.NODE_ENV = "production";
  process.env.APP_URL = "https://vacationplanner.example";

  await assert.doesNotReject(() => register());
});

test("getHealthSnapshot reports configured APP_URL and provider mode", () => {
  process.env.APP_URL = "https://vacationplanner.example";
  process.env.OPENAI_API_KEY = "test-key";

  assert.deepEqual(getHealthSnapshot(), {
    ok: true,
    appUrl: "https://vacationplanner.example",
    mode: "openai",
  });
});

function restoreEnv() {
  setEnvValue("NODE_ENV", originalNodeEnv);
  setEnvValue("APP_URL", originalAppUrl);
  setEnvValue("PORT", originalPort);
  setEnvValue("OPENAI_API_KEY", originalOpenAiKey);
}

function setEnvValue(key: "NODE_ENV" | "APP_URL" | "PORT" | "OPENAI_API_KEY", value: string | undefined) {
  if (value === undefined) {
    delete process.env[key];
    return;
  }

  process.env[key] = value;
}
