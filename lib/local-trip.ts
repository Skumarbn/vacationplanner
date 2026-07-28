import type { ItineraryResponse, TripFeedbackEntry } from "./types.ts";

export const TRIP_STORAGE_PREFIX = "vacationplanner:";

export type SavedTrip = ItineraryResponse & {
  createdAt: string;
  savedAt: string;
  updatedAt: string;
  expiresAt?: string;
  feedback?: TripFeedbackEntry[];
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
  payload: ItineraryResponse & { feedback?: TripFeedbackEntry[] },
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
    feedback: payload.feedback || previousPayload?.feedback || [],
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

export function buildCalendarIcs(savedTrip: Pick<SavedTrip, "itinerary" | "tripInput" | "token">, now = new Date()) {
  const tripStartDate = savedTrip.tripInput.startDate || formatDateForInput(now);
  const events = savedTrip.itinerary.days.flatMap((day, dayIndex) =>
    day.activities.map((activity, activityIndex) =>
      buildCalendarEvent({
        tripToken: savedTrip.token,
        destination: savedTrip.tripInput.destination,
        tripStartDate,
        dayIndex,
        activityIndex,
        activity,
      }),
    ),
  );

  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Vacation Planner//Trip Export//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...events,
    "END:VCALENDAR",
  ].join("\r\n");
}

function normalizeSavedTrip(savedTrip: Partial<SavedTrip>) {
  const fallbackTimestamp = savedTrip.savedAt || savedTrip.createdAt || new Date(0).toISOString();

  return {
    ...savedTrip,
    createdAt: savedTrip.createdAt || fallbackTimestamp,
    savedAt: savedTrip.savedAt || fallbackTimestamp,
    updatedAt: savedTrip.updatedAt || savedTrip.savedAt || savedTrip.createdAt || fallbackTimestamp,
    feedback: Array.isArray(savedTrip.feedback) ? savedTrip.feedback : [],
  } as SavedTrip;
}

function getSavedTripSortKey(savedTrip: SavedTrip) {
  return savedTrip.updatedAt || savedTrip.savedAt || savedTrip.createdAt || "";
}

function buildCalendarEvent({
  tripToken,
  destination,
  tripStartDate,
  dayIndex,
  activityIndex,
  activity,
}: {
  tripToken: string;
  destination: string;
  tripStartDate: string;
  dayIndex: number;
  activityIndex: number;
  activity: SavedTrip["itinerary"]["days"][number]["activities"][number];
}) {
  const startDate = addDays(tripStartDate, dayIndex);
  const startDateTime = combineDateAndTime(startDate, activity.time);
  const endDateTime = addMinutes(startDateTime, parseDurationMinutes(activity.duration));
  const timestamp = formatUtcDateTime(new Date());
  const uid = `${tripToken}-${dayIndex}-${activityIndex}@vacationplanner`;
  const mapUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.mapQuery)}`;
  const description = escapeIcsText(
    [
      activity.description,
      `Duration: ${activity.duration}`,
      `Cost: ${activity.cost}`,
      `Map search: ${activity.mapQuery}`,
    ].join("\n"),
  );

  return [
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${timestamp}`,
    `DTSTART:${formatLocalDateTime(startDateTime)}`,
    `DTEND:${formatLocalDateTime(endDateTime)}`,
    `SUMMARY:${escapeIcsText(activity.title)}`,
    `DESCRIPTION:${description}`,
    `LOCATION:${escapeIcsText(`${activity.mapQuery}, ${destination}`)}`,
    `URL:${escapeIcsText(mapUrl)}`,
    `CATEGORIES:${activity.tags.map(escapeIcsText).join(",")}`,
    "END:VEVENT",
  ].join("\r\n");
}

function formatDateForInput(value: Date) {
  const year = value.getFullYear();
  const month = `${value.getMonth() + 1}`.padStart(2, "0");
  const day = `${value.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function addDays(dateText: string, daysToAdd: number) {
  const date = new Date(`${dateText}T00:00:00`);
  date.setDate(date.getDate() + daysToAdd);
  return formatDateForInput(date);
}

function combineDateAndTime(dateText: string, timeText: string) {
  const match = timeText.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  const date = new Date(`${dateText}T09:00:00`);
  if (!match) return date;

  const [, hoursText, minutesText, meridiem] = match;
  const rawHours = Number(hoursText) % 12;
  const hours = meridiem.toUpperCase() === "PM" ? rawHours + 12 : rawHours;
  date.setHours(hours, Number(minutesText), 0, 0);
  return date;
}

function parseDurationMinutes(durationText: string) {
  const normalized = durationText.toLowerCase();
  const hourMatch = normalized.match(/(\d+(?:\.\d+)?)\s*hour/);
  const minuteMatch = normalized.match(/(\d+)\s*minute/);
  const hours = hourMatch ? Number(hourMatch[1]) * 60 : 0;
  const minutes = minuteMatch ? Number(minuteMatch[1]) : 0;
  return Math.max(30, Math.round(hours + minutes) || 90);
}

function addMinutes(date: Date, minutesToAdd: number) {
  return new Date(date.getTime() + minutesToAdd * 60 * 1000);
}

function formatLocalDateTime(date: Date) {
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hours = `${date.getHours()}`.padStart(2, "0");
  const minutes = `${date.getMinutes()}`.padStart(2, "0");
  const seconds = `${date.getSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}`;
}

function formatUtcDateTime(date: Date) {
  const year = date.getUTCFullYear();
  const month = `${date.getUTCMonth() + 1}`.padStart(2, "0");
  const day = `${date.getUTCDate()}`.padStart(2, "0");
  const hours = `${date.getUTCHours()}`.padStart(2, "0");
  const minutes = `${date.getUTCMinutes()}`.padStart(2, "0");
  const seconds = `${date.getUTCSeconds()}`.padStart(2, "0");
  return `${year}${month}${day}T${hours}${minutes}${seconds}Z`;
}

function escapeIcsText(value: string) {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}
