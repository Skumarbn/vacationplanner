import assert from "node:assert/strict";
import test from "node:test";
import {
  buildItineraryText,
  buildLocalTripUrl,
  deleteTripFromStorage,
  listSavedTrips,
  loadTripFromStorage,
  parseTripTokenFromHash,
  saveTripToStorage,
} from "../lib/local-trip.ts";
import type { ItineraryResponse } from "../lib/types.ts";

class MemoryStorage implements Storage {
  private values = new Map<string, string>();

  get length() {
    return this.values.size;
  }

  clear() {
    this.values.clear();
  }

  getItem(key: string) {
    return this.values.get(key) ?? null;
  }

  key(index: number) {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string) {
    this.values.delete(key);
  }

  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
}

const basePayload: ItineraryResponse = {
  token: "trip-123",
  generatedBy: "demo",
  model: "local-demo",
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
  itinerary: {
    title: "San Francisco family trip",
    summary: {
      pace: "Balanced",
      budget: "Moderate",
      bestFor: "Families",
      activityCount: 2,
    },
    destination: "San Francisco, CA",
    notes: ["Verify hours, tickets, and travel times before going."],
    days: [
      {
        title: "Day 1",
        meta: "Waterfront and family museums",
        activities: [
          {
            time: "9:00 AM",
            title: "Exploratorium",
            description: "Hands-on science exhibits on the Embarcadero.",
            duration: "2 hours",
            cost: "$$",
            tags: ["Museums", "Kid-friendly"],
            mapQuery: "Exploratorium San Francisco, CA",
          },
          {
            time: "1:00 PM",
            title: "Ferry Building Marketplace",
            description: "Lunch and bay views with easy browsing.",
            duration: "90 minutes",
            cost: "$$",
            tags: ["Food"],
            mapQuery: "Ferry Building Marketplace San Francisco, CA",
          },
        ],
      },
    ],
  },
};

test("saveTripToStorage preserves createdAt while updating timestamps", () => {
  const storage = new MemoryStorage();

  const first = saveTripToStorage(storage, basePayload, "2026-07-06T18:00:00.000Z");
  const second = saveTripToStorage(storage, basePayload, "2026-07-06T19:00:00.000Z");

  assert.equal(first.createdAt, "2026-07-06T18:00:00.000Z");
  assert.equal(second.createdAt, "2026-07-06T18:00:00.000Z");
  assert.equal(second.updatedAt, "2026-07-06T19:00:00.000Z");
});

test("loadTripFromStorage removes expired trips and listSavedTrips sorts newest first", () => {
  const storage = new MemoryStorage();

  saveTripToStorage(storage, basePayload, "2026-07-06T18:00:00.000Z");
  saveTripToStorage(storage, { ...basePayload, token: "trip-456" }, "2026-07-06T20:00:00.000Z");
  storage.setItem(
    "vacationplanner:expired",
    JSON.stringify({
      ...basePayload,
      token: "expired",
      createdAt: "2026-07-01T00:00:00.000Z",
      savedAt: "2026-07-01T00:00:00.000Z",
      updatedAt: "2026-07-01T00:00:00.000Z",
      expiresAt: "2026-07-02T00:00:00.000Z",
    }),
  );

  const expired = loadTripFromStorage(storage, "expired", new Date("2026-07-03T00:00:00.000Z"));
  const trips = listSavedTrips(storage, new Date("2026-07-06T21:00:00.000Z"));

  assert.equal(expired, null);
  assert.deepEqual(
    trips.map((trip) => trip.token),
    ["trip-456", "trip-123"],
  );
});

test("share helpers parse tokens, delete saved trips, and build itinerary text", () => {
  const storage = new MemoryStorage();
  saveTripToStorage(storage, basePayload, "2026-07-06T18:00:00.000Z");

  assert.equal(parseTripTokenFromHash("#trip=trip-123"), "trip-123");
  assert.equal(
    buildLocalTripUrl("http://127.0.0.1:3000", "trip-123"),
    "http://127.0.0.1:3000/#trip=trip-123",
  );

  const itineraryText = buildItineraryText(basePayload);
  assert.match(itineraryText, /Exploratorium/);
  assert.match(itineraryText, /Map: Ferry Building Marketplace San Francisco, CA/);

  deleteTripFromStorage(storage, "trip-123");
  assert.equal(loadTripFromStorage(storage, "trip-123"), null);
});
