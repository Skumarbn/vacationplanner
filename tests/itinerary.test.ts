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

test("generateItinerary caps 1-day packed trips at three activities", async () => {
  delete process.env.OPENAI_API_KEY;

  const result = await generateItinerary({
    input: { ...baseInput, days: 1, children: 0, pace: "Packed" },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  assert.equal(result.itinerary.days[0].activities.length, 3);
});

test("generateItinerary repairs provider output with meal balance and nearby clustering", async (t) => {
  const originalFetch = global.fetch;
  process.env.OPENAI_API_KEY = "test-key";

  global.fetch = async () =>
    new Response(
      JSON.stringify({
        output_text: JSON.stringify({
          title: "San Francisco family trip",
          summary: {
            pace: "Balanced",
            budget: "Moderate",
            bestFor: "Families",
            activityCount: 3,
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
                  description: "Museum start in the park.",
                  duration: "2 hours",
                  cost: "$$",
                  tags: ["Museums", "Indoor"],
                  mapQuery: "California Academy of Sciences San Francisco, CA",
                  neighborhood: "Golden Gate Park",
                  bookingHint: "Book ahead.",
                  setting: "Indoor",
                  familyFriendly: "High",
                },
                {
                  time: "12:30 PM",
                  title: "Coit Tower",
                  description: "Views across the bay.",
                  duration: "1 hour",
                  cost: "$$",
                  tags: ["Views", "History"],
                  mapQuery: "Coit Tower San Francisco, CA",
                  neighborhood: "Telegraph Hill",
                  bookingHint: "Check the elevator line.",
                  setting: "Outdoor",
                  familyFriendly: "Medium",
                },
                {
                  time: "3:30 PM",
                  title: "Twin Peaks",
                  description: "A second big-view stop.",
                  duration: "1 hour",
                  cost: "$$",
                  tags: ["Views", "Scenic"],
                  mapQuery: "Twin Peaks San Francisco, CA",
                  neighborhood: "Twin Peaks",
                  bookingHint: "Go when visibility is good.",
                  setting: "Outdoor",
                  familyFriendly: "Medium",
                },
              ],
            },
          ],
        }),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );

  t.after(() => {
    global.fetch = originalFetch;
  });

  const result = await generateItinerary({
    input: { ...baseInput, days: 1, pace: "Balanced", children: 1 },
    action: "generate",
    existingItinerary: null,
    target: {},
  });

  const activities = result.itinerary.days[0].activities;
  assert.equal(activities.length, 3);
  assert.ok(activities.some((activity) => activity.tags.some((tag) => /Food|Market|Bakery|Dessert/i.test(tag))));

  const neighborhoods = new Set(activities.map((activity) => activity.neighborhood));
  assert.ok(neighborhoods.size <= 2);
});
