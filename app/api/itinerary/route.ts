import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server.js";
import { generateItinerary, ItineraryError, normalizeTripInput } from "../../../lib/itinerary.ts";
import { takeRateLimitToken } from "../../../lib/rate-limit.ts";
import type { ApiError, ItineraryAction, ItineraryRequest } from "../../../lib/types.ts";

const allowedActions: ItineraryAction[] = [
  "generate",
  "regenerate-day",
  "swap-activity",
  "relax-day",
  "cheaper-day",
  "kid-friendly-activity",
  "remove-activity",
];
const maxBodyBytes = 32 * 1024;
const rateLimitWindowMs = 60_000;

export async function POST(request: Request) {
  const rateLimit = takeRateLimitToken(getRateLimitKey(request), {
    limit: getRateLimitMaxRequests(),
    windowMs: rateLimitWindowMs,
  });

  try {
    if (!rateLimit.allowed) {
      throw new ItineraryError(
        "rate_limited",
        "Too many itinerary requests from this client. Please wait and retry.",
        429,
        {
          retryAfter: `Retry after about ${rateLimit.retryAfterSeconds} seconds.`,
        },
      );
    }

    const bodyText = await request.text();
    if (Buffer.byteLength(bodyText, "utf8") > maxBodyBytes) {
      throw new ItineraryError("validation_error", "Request body is too large.", 413, {
        request: `Keep itinerary requests under ${Math.floor(maxBodyBytes / 1024)} KB.`,
      });
    }

    let payload: ItineraryRequest;
    try {
      payload = JSON.parse(bodyText) as ItineraryRequest;
    } catch {
      throw new ItineraryError("validation_error", "Request body must be valid JSON.", 400, {
        request: "Send a valid JSON itinerary payload.",
      });
    }

    const requestedAction = payload.action || "generate";
    if (!allowedActions.includes(requestedAction)) {
      throw new ItineraryError("validation_error", "Unsupported itinerary action.", 400, {
        action: `Supported actions: ${allowedActions.join(", ")}`,
      });
    }

    const input = normalizeTripInput(payload.tripInput);
    const action = requestedAction as ItineraryAction;

    const result = await generateItinerary({
      input,
      action,
      existingItinerary: payload.existingItinerary || null,
      target: payload.target || {},
    });

    return NextResponse.json(
      {
        itinerary: result.itinerary,
        tripInput: input,
        token: payload.token || randomBytes(6).toString("base64url"),
        generatedBy: result.generatedBy,
        model: result.model,
      },
      { headers: buildRateLimitHeaders(rateLimit) },
    );
  } catch (error) {
    const apiError = serializeError(error);
    return NextResponse.json(apiError.body, {
      status: apiError.status,
      headers: buildRateLimitHeaders(rateLimit),
    });
  }
}

function serializeError(error: unknown): { status: number; body: ApiError } {
  if (error instanceof ItineraryError) {
    return {
      status: error.status,
      body: {
        error: error.message,
        code: error.code,
        details: error.details,
      },
    };
  }

  return {
    status: 400,
    body: {
      error: error instanceof Error ? error.message : "Unable to generate itinerary.",
      code: "validation_error",
    },
  };
}

function getRateLimitKey(request: Request) {
  const forwarded = request.headers.get("x-forwarded-for");
  const realIp = request.headers.get("x-real-ip");
  const connectingIp = request.headers.get("cf-connecting-ip");
  const rawClient =
    forwarded?.split(",")[0]?.trim() || realIp?.trim() || connectingIp?.trim() || "local-demo-client";

  return `itinerary:${rawClient}`;
}

function buildRateLimitHeaders(rateLimit: {
  limit: number;
  remaining: number;
  retryAfterSeconds: number;
  resetAt: number;
}) {
  const headers = new Headers({
    "X-RateLimit-Limit": String(rateLimit.limit),
    "X-RateLimit-Remaining": String(rateLimit.remaining),
    "X-RateLimit-Reset": String(Math.ceil(rateLimit.resetAt / 1000)),
  });

  if (rateLimit.retryAfterSeconds > 0) {
    headers.set("Retry-After", String(rateLimit.retryAfterSeconds));
  }

  return headers;
}

function getRateLimitMaxRequests() {
  const parsed = Number.parseInt(process.env.ITINERARY_RATE_LIMIT_MAX_REQUESTS || "8", 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 8;
}
