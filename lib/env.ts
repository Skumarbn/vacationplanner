function isValidUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export function getAppUrl() {
  const configured = process.env.APP_URL?.trim();
  return configured || `http://127.0.0.1:${process.env.PORT || "3000"}`;
}

export function validateProductionEnv() {
  if (process.env.NODE_ENV !== "production") {
    return;
  }

  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    throw new Error("APP_URL is required when NODE_ENV=production.");
  }

  if (!isValidUrl(appUrl)) {
    throw new Error("APP_URL must be a valid http:// or https:// URL.");
  }
}

export function getHealthSnapshot() {
  return {
    ok: true,
    appUrl: getAppUrl(),
    mode: process.env.OPENAI_API_KEY ? "openai" : "demo",
  } as const;
}
