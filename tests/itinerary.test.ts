import assert from "node:assert/strict";
import test from "node:test";
import { generateItinerary, ItineraryError, normalizeTripInput } from "../lib/itinerary.ts";
import type { TripInput } from "../lib/types.ts";

const baseInput: TripInput = {
  destination: "San Francisco, CA",
  startDate: "2026-08-12",
  days: 3,
  adults: 2,
  children: 1,
  budget: "Moderate",
  pace: "Balanced",
  interests: ["Food", "Museums", "Kid-friendly"],
};

test("normalizeTripInput trims valid values", () => {
  const normalized = normalizeTripInput({
    destination: "  San Francisco, CA  ",
    days: 2,
    adults: 3,
    children: 0,
    budget: "Premium",
    pace: "Relaxed",
    interests: ["Food"],
  });

  assert.equal(normalized.destination, "San Francisco, CA");
  assert.equal(normalized.days, 2);
  assert.equal(normalized.adults, 3);
  assert.equal(normalized.children, 0);
  assert.equal(normalized.budget, "Premium");
  assert.equal(normalized.pace, "Relaxed");
  assert.deepEqual(normalized.interests, ["Food"]);
});

test("normalizeTripInput returns structured validation details for invalid counts", () => {
  assert.throws(
    () =>
      normalizeTripInput({
        destination: "San Francisco, CA",
        days: 99,
        adults: 0,
        children: -4,
      }),
    (error: unknown) => {
      assert(error instanceof ItineraryError);
      assert.equal(error.code, "validation_error");
      assert.deepEqual(error.details, {
        days: "Days must be between 1 and 10.",
        adults: "Adults must be between 1 and 20.",
        children: "Children must be between 0 and 20.",
      });
      return true;
    },
  );
});

test("generateItinerary creates a 1-day demo itinerary without OpenAI", async () => {
  delete process.env.OPENAI_API_KEY;

  const result = await generateItinerary({
    input: { ...baseInput, days: 1, children: 0, pace: "Relaxed" },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  assert.equal(result.generatedBy, "demo");
  assert.equal(result.model, "local-demo");
  assert.equal(result.itinerary.days.length, 1);
  assert.equal(result.itinerary.days[0].activities.length, 2);
  assert.match(result.itinerary.days[0].activities[0].mapQuery, /San Francisco, CA/);
});

test("generateItinerary creates a 2-day demo itinerary with exact places", async () => {
  delete process.env.OPENAI_API_KEY;

  const result = await generateItinerary({
    input: { ...baseInput, days: 2 },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  assert.equal(result.itinerary.days.length, 2);
  assert.equal(result.itinerary.summary.activityCount, 6);
  assert.notEqual(result.itinerary.days[0].activities[0].title, "Main landmark area");
  assert.match(result.itinerary.days[0].activities[0].mapQuery, /San Francisco, CA/);
});

test("regenerate-day preserves unrelated days", async () => {
  delete process.env.OPENAI_API_KEY;

  const original = await generateItinerary({
    input: { ...baseInput, days: 3 },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  const updated = await generateItinerary({
    input: { ...baseInput, days: 3 },
    action: "regenerate-day",
    existingItinerary: original.itinerary,
    target: { dayIndex: 1 },
  });

  assert.deepEqual(updated.itinerary.days[0], original.itinerary.days[0]);
  assert.notDeepEqual(updated.itinerary.days[1], original.itinerary.days[1]);
  assert.deepEqual(updated.itinerary.days[2], original.itinerary.days[2]);
});

test("swap-activity preserves unrelated days and updates only the targeted stop", async () => {
  delete process.env.OPENAI_API_KEY;

  const original = await generateItinerary({
    input: { ...baseInput, days: 2 },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  const updated = await generateItinerary({
    input: { ...baseInput, days: 2 },
    action: "swap-activity",
    existingItinerary: original.itinerary,
    target: { dayIndex: 0, activityIndex: 1 },
  });

  assert.deepEqual(updated.itinerary.days[1], original.itinerary.days[1]);
  assert.deepEqual(updated.itinerary.days[0].activities[0], original.itinerary.days[0].activities[0]);
  assert.notDeepEqual(updated.itinerary.days[0].activities[1], original.itinerary.days[0].activities[1]);
});
