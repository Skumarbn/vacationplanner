import assert from "node:assert/strict";
import test, { afterEach, beforeEach } from "node:test";
import { GET as getHealth } from "../app/api/health/route.ts";
import { POST as postItinerary } from "../app/api/itinerary/route.ts";
import { resetRateLimitStore } from "../lib/rate-limit.ts";
import type { ItineraryRequest } from "../lib/types.ts";

function buildRequest(body: ItineraryRequest) {
  return new Request("http://127.0.0.1:3000/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  resetRateLimitStore();
  delete process.env.OPENAI_API_KEY;
  delete process.env.ITINERARY_RATE_LIMIT_MAX_REQUESTS;
});

afterEach(() => {
  delete process.env.OPENAI_API_KEY;
  delete process.env.ITINERARY_RATE_LIMIT_MAX_REQUESTS;
});

test("POST /api/itinerary returns a demo itinerary response", async () => {
  const response = await postItinerary(
    buildRequest({
      action: "generate",
      tripInput: {
        destination: "San Francisco, CA",
        startDate: "2026-08-12",
        days: 1,
        adults: 2,
        children: 0,
        budget: "Moderate",
        pace: "Balanced",
        interests: ["Food", "Museums"],
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;

  assert.equal(body.generatedBy, "demo");
  assert.equal(body.model, "local-demo");
  assert.equal(typeof body.token, "string");
  assert.equal((body.itinerary as { days: unknown[] }).days.length, 1);
});

test("POST /api/itinerary returns a structured validation error", async () => {
  const response = await postItinerary(buildRequest({ tripInput: { destination: " " } }));

  assert.equal(response.status, 400);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.error, "Trip input is invalid.");
  assert.deepEqual(body.details, {
    destination: "Destination is required.",
  });
});

test("POST /api/itinerary rejects unsupported actions", async () => {
  const response = await postItinerary(
    buildRequest({
      action: "teleport-day" as never,
      tripInput: { destination: "San Francisco, CA" },
    }),
  );

  assert.equal(response.status, 400);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.code, "validation_error");
  assert.match(String(body.error), /Unsupported itinerary action/);
});

test("POST /api/itinerary preserves unrelated days during regeneration", async () => {
  const initialResponse = await postItinerary(
    buildRequest({
      action: "generate",
      tripInput: {
        destination: "San Francisco, CA",
        startDate: "2026-08-12",
        days: 2,
        adults: 2,
        children: 1,
        budget: "Moderate",
        pace: "Balanced",
        interests: ["Food", "Museums", "Kid-friendly"],
      },
    }),
  );
  const initialBody = (await initialResponse.json()) as {
    itinerary: { days: Array<Record<string, unknown>> };
    token: string;
    tripInput: ItineraryRequest["tripInput"];
  };

  const regenerateResponse = await postItinerary(
    buildRequest({
      action: "regenerate-day",
      token: initialBody.token,
      tripInput: initialBody.tripInput,
      existingItinerary: initialBody.itinerary as never,
      target: { dayIndex: 1 },
    }),
  );
  const regenerateBody = (await regenerateResponse.json()) as {
    itinerary: { days: Array<Record<string, unknown>> };
  };

  assert.deepEqual(regenerateBody.itinerary.days[0], initialBody.itinerary.days[0]);
  assert.notDeepEqual(regenerateBody.itinerary.days[1], initialBody.itinerary.days[1]);
});

test("POST /api/itinerary uses a mocked provider when OPENAI_API_KEY is set", async (t) => {
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  const mockedPayload = {
    output_text: JSON.stringify({
      title: "San Francisco family trip",
      summary: {
        pace: "Balanced",
        budget: "Moderate",
        bestFor: "Families",
        activityCount: 2,
      },
      destination: "San Francisco",
      notes: ["Verify hours, tickets, and travel times before going."],
      days: [
        {
          title: "Day 1",
          meta: "Family-aware pacing",
          activities: [
            {
              time: "9:00 AM",
              title: "California Academy of Sciences",
              description: "Start with the rainforest dome and aquarium exhibits.",
              duration: "2 hours",
              cost: "$$",
              tags: ["Museums", "Kid-friendly"],
              mapQuery: "California Academy of Sciences San Francisco, CA",
              neighborhood: "Golden Gate Park",
              bookingHint: "Reserve timed entry if possible.",
              setting: "Indoor",
              familyFriendly: "High",
            },
            {
              time: "1:00 PM",
              title: "Ferry Building Marketplace",
              description: "Lunch with easy browsing along the Embarcadero.",
              duration: "2 hours",
              cost: "$$",
              tags: ["Food", "Markets"],
              mapQuery: "Ferry Building Marketplace San Francisco, CA",
              neighborhood: "Embarcadero",
              bookingHint: "Go early for shorter lines.",
              setting: "Mixed",
              familyFriendly: "High",
            },
          ],
        },
      ],
    }),
  };

  global.fetch = async (input: string | URL | Request, init?: RequestInit) => {
    assert.match(String(input), /api\.openai\.com\/v1\/responses/);
    assert.equal(init?.method, "POST");
    return new Response(JSON.stringify(mockedPayload), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };

  t.after(() => {
    global.fetch = originalFetch;
  });

  const response = await postItinerary(
    buildRequest({
      action: "generate",
      tripInput: {
        destination: "San Francisco, CA",
        startDate: "2026-08-12",
        days: 1,
        adults: 2,
        children: 1,
        budget: "Moderate",
        pace: "Balanced",
        interests: ["Food", "Museums", "Kid-friendly"],
      },
    }),
  );

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.generatedBy, "openai");
  assert.equal(body.model, "gpt-5.4-mini");
});

test("GET /api/health returns OK with the active mode", async () => {
  process.env.PORT = "3000";
  delete process.env.APP_URL;

  const response = getHealth();
  assert.equal(response.status, 200);

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.mode, "demo");
  assert.equal(body.appUrl, "http://127.0.0.1:3000");
});

test("POST /api/itinerary rate limits repeated requests from the same client", async () => {
  process.env.ITINERARY_RATE_LIMIT_MAX_REQUESTS = "2";

  const body: ItineraryRequest = {
    action: "generate",
    tripInput: {
      destination: "San Francisco, CA",
      startDate: "2026-08-12",
      days: 1,
      adults: 2,
      children: 0,
      budget: "Moderate",
      pace: "Balanced",
      interests: ["Food", "Museums"],
    },
  };

  const headers = { "x-forwarded-for": "203.0.113.10" };
  const first = await postItinerary(buildRequestWithHeaders(body, headers));
  const second = await postItinerary(buildRequestWithHeaders(body, headers));
  const third = await postItinerary(buildRequestWithHeaders(body, headers));

  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(third.status, 429);
  assert.equal(third.headers.get("Retry-After"), "60");

  const payload = (await third.json()) as Record<string, unknown>;
  assert.equal(payload.code, "rate_limited");
  assert.match(String(payload.error), /Too many itinerary requests/);
});

test("POST /api/itinerary rejects oversized request bodies", async () => {
  const oversizedRequest = new Request("http://127.0.0.1:3000/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      tripInput: {
        destination: `San Francisco, CA ${"x".repeat(33_000)}`,
      },
    }),
  });

  const response = await postItinerary(oversizedRequest);

  assert.equal(response.status, 413);
  const payload = (await response.json()) as Record<string, unknown>;
  assert.equal(payload.code, "validation_error");
  assert.equal(payload.error, "Request body is too large.");
});

function buildRequestWithHeaders(body: ItineraryRequest, headers: HeadersInit) {
  return new Request("http://127.0.0.1:3000/api/itinerary", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    body: JSON.stringify(body),
  });
}
