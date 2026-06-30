import test from "node:test";
import assert from "node:assert/strict";
import { POST as postItinerary } from "../app/api/itinerary/route.ts";
import { GET as getHealth } from "../app/api/health/route.ts";
import type { ItineraryRequest } from "../lib/types.ts";

function buildRequest(body: ItineraryRequest) {
  return new Request("http://127.0.0.1:3000/api/itinerary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

test("POST /api/itinerary returns a demo itinerary response", async () => {
  delete process.env.OPENAI_API_KEY;

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
  assert.equal(body.error, "Destination is required.");
});

test("POST /api/itinerary preserves unrelated days during regeneration", async () => {
  delete process.env.OPENAI_API_KEY;

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

test("GET /api/health returns OK with the active mode", async () => {
  delete process.env.OPENAI_API_KEY;
  process.env.PORT = "3000";
  delete process.env.APP_URL;

  const response = getHealth();
  assert.equal(response.status, 200);

  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.ok, true);
  assert.equal(body.mode, "demo");
  assert.equal(body.appUrl, "http://127.0.0.1:3000");
});
