import type { ItineraryResponse } from "./types.ts";

export const TRIP_STORAGE_PREFIX = "vacationplanner:";

export type SavedTrip = ItineraryResponse & {
  createdAt: string;
  savedAt: string;
  updatedAt: string;
  expiresAt?: string;
};

type StorageLike = Pick<Storage, "getItem" | "setItem" | "removeItem" | "key" | "length">;

export function getTripStorageKey(token: string) {
  return `${TRIP_STORAGE_PREFIX}${token}`;
}

export function parseTripTokenFromHash(hash: string) {
  const match = hash.match(/trip=([^&]+)/);
  return match?.[1] ? decodeURIComponent(match[1]) : null;
}

export function buildLocalTripUrl(origin: string, token: string) {
  return `${origin}/#trip=${encodeURIComponent(token)}`;
}

export function saveTripToStorage(
  storage: StorageLike,
  payload: ItineraryResponse,
  now = new Date().toISOString(),
) {
  const storageKey = getTripStorageKey(payload.token);
  const previousTrip = storage.getItem(storageKey);
  const previousPayload = previousTrip ? (JSON.parse(previousTrip) as SavedTrip) : null;
  const createdAt = previousPayload?.createdAt || previousPayload?.savedAt || now;

  const savedTrip: SavedTrip = {
    ...payload,
    createdAt,
    savedAt: now,
    updatedAt: now,
    expiresAt: previousPayload?.expiresAt,
  };

  storage.setItem(storageKey, JSON.stringify(savedTrip));
  return savedTrip;
}

export function loadTripFromStorage(storage: StorageLike, token: string, now = new Date()) {
  const saved = storage.getItem(getTripStorageKey(token));
  if (!saved) return null;

  const parsed = normalizeSavedTrip(JSON.parse(saved) as Partial<SavedTrip>);
  if (parsed.expiresAt && new Date(parsed.expiresAt).getTime() <= now.getTime()) {
    storage.removeItem(getTripStorageKey(token));
    return null;
  }

  return parsed;
}

export function deleteTripFromStorage(storage: StorageLike, token: string) {
  storage.removeItem(getTripStorageKey(token));
}

export function listSavedTrips(storage: StorageLike, now = new Date()) {
  const trips: SavedTrip[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key?.startsWith(TRIP_STORAGE_PREFIX)) continue;

    const token = key.slice(TRIP_STORAGE_PREFIX.length);
    const trip = loadTripFromStorage(storage, token, now);
    if (trip) trips.push(trip);
  }

  return trips.sort((left, right) => getSavedTripSortKey(right).localeCompare(getSavedTripSortKey(left)));
}

export function buildItineraryText(savedTrip: Pick<SavedTrip, "itinerary" | "tripInput" | "token">) {
  const lines = [
    savedTrip.itinerary.title,
    `${savedTrip.tripInput.destination} · ${savedTrip.tripInput.days} day${savedTrip.tripInput.days === 1 ? "" : "s"}`,
    "",
  ];

  savedTrip.itinerary.days.forEach((day) => {
    lines.push(`${day.title} - ${day.meta}`);
    day.activities.forEach((activity) => {
      lines.push(
        `${activity.time} - ${activity.title} (${activity.duration}, ${activity.cost})`,
        activity.description,
        `Map: ${activity.mapQuery}`,
      );
    });
    lines.push("");
  });

  if (savedTrip.itinerary.notes.length) {
    lines.push("Notes:");
    savedTrip.itinerary.notes.forEach((note) => lines.push(`- ${note}`));
  }

  return lines.join("\n").trim();
}

export function buildCalendarText(savedTrip: Pick<SavedTrip, "itinerary" | "tripInput">) {
  const lines = [
    `${savedTrip.itinerary.title} Calendar Outline`,
    `${savedTrip.tripInput.destination} · Starts ${savedTrip.tripInput.startDate || "TBD"}`,
    "",
  ];

  savedTrip.itinerary.days.forEach((day) => {
    lines.push(`${day.title} (${day.meta})`);
    day.activities.forEach((activity) => {
      lines.push(
        `${activity.time}: ${activity.title}`,
        `Focus: ${activity.description}`,
        `Map search: ${activity.mapQuery}`,
      );
    });
    lines.push("");
  });

  return lines.join("\n").trim();
}

function normalizeSavedTrip(savedTrip: Partial<SavedTrip>) {
  const fallbackTimestamp = savedTrip.savedAt || savedTrip.createdAt || new Date(0).toISOString();

  return {
    ...savedTrip,
    createdAt: savedTrip.createdAt || fallbackTimestamp,
    savedAt: savedTrip.savedAt || fallbackTimestamp,
    updatedAt: savedTrip.updatedAt || savedTrip.savedAt || savedTrip.createdAt || fallbackTimestamp,
  } as SavedTrip;
}

function getSavedTripSortKey(savedTrip: SavedTrip) {
  return savedTrip.updatedAt || savedTrip.savedAt || savedTrip.createdAt || "";
}
