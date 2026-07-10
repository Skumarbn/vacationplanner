"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  buildCalendarText,
  buildItineraryText,
  buildLocalTripUrl,
  deleteTripFromStorage,
  listSavedTrips,
  loadTripFromStorage,
  parseTripTokenFromHash,
  saveTripToStorage,
  type SavedTrip,
} from "@/lib/local-trip";
import type {
  ApiError,
  ApiErrorCode,
  Budget,
  ItineraryAction,
  ItineraryResponse,
  ItineraryTarget,
  Pace,
  TripInput,
} from "@/lib/types";

const interests = ["Food", "Museums", "Outdoors", "Kid-friendly", "Nightlife", "Shopping"];
const defaultInterests = ["Food", "Museums", "Kid-friendly"];

const defaultInput: TripInput = {
  destination: "California, USA",
  startDate: "2026-08-12",
  days: 5,
  adults: 2,
  children: 1,
  budget: "Moderate",
  pace: "Balanced",
  interests: ["Food", "Museums", "Kid-friendly"],
};

type FieldErrors = Partial<Record<"destination" | "days" | "adults" | "children" | "interests", string>>;

type PendingRequest = {
  action: ItineraryAction;
  target: ItineraryTarget;
  input: TripInput;
};

type StatusBanner = {
  tone: "info" | "success" | "error";
  title: string;
  message: string;
  details?: string[];
  canRetry?: boolean;
};

export default function Home() {
  const [tripInput, setTripInput] = useState<TripInput>(defaultInput);
  const [payload, setPayload] = useState<ItineraryResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusBanner | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [copiedItinerary, setCopiedItinerary] = useState(false);
  const [copiedCalendar, setCopiedCalendar] = useState(false);
  const [expandedDays, setExpandedDays] = useState<number[]>([]);
  const activeRequestId = useRef(0);
  const statusTimeoutRef = useRef<number | null>(null);
  const lastRequestRef = useRef<PendingRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const itinerary = payload?.itinerary;

  const shareLink = useMemo(() => {
    if (!payload?.token || typeof window === "undefined") return "Generate a trip first";
    return buildLocalTripUrl(window.location.origin, payload.token);
  }, [payload?.token]);

  const savedTrips = useMemo(() => {
    if (typeof window === "undefined") return [];
    return listSavedTrips(window.localStorage);
  }, [payload]);

  useEffect(() => {
    if (!loadSharedTrip()) {
      void requestItinerary("generate", {}, defaultInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!itinerary) {
      setExpandedDays([]);
      return;
    }

    setExpandedDays(itinerary.days.map((_, index) => index));
  }, [itinerary]);

  function updateInput<T extends keyof TripInput>(key: T, value: TripInput[T]) {
    setTripInput((current) => ({ ...current, [key]: value }));
    clearFieldError(key);
  }

  function toggleInterest(interest: string) {
    setTripInput((current) => {
      const hasInterest = current.interests.includes(interest);
      return {
        ...current,
        interests: hasInterest
          ? current.interests.filter((item) => item !== interest)
          : [...current.interests, interest],
      };
    });
    clearFieldError("interests");
  }

  async function requestItinerary(
    action: ItineraryAction = "generate",
    target: ItineraryTarget = {},
    inputOverride?: TripInput,
  ) {
    const requestId = (activeRequestId.current += 1);
    const requestInput = inputOverride || tripInput;
    const nextFieldErrors = validateTripInput(requestInput);
    if (Object.keys(nextFieldErrors).length > 0) {
      setFieldErrors(nextFieldErrors);
      showBanner({
        tone: "error",
        title: "Trip details need attention",
        message: "Fix the highlighted trip inputs and try again.",
        details: Object.values(nextFieldErrors),
      });
      return;
    }

    const requestInputWithDefaults = withDefaultInterests(requestInput);
    if (requestInputWithDefaults !== requestInput) {
      setTripInput(requestInputWithDefaults);
      showBanner(
        {
          tone: "info",
          title: "Default interests restored",
          message: "Using Food, Museums, and Kid-friendly so the planner still has guidance.",
        },
        3200,
      );
    }

    setFieldErrors({});
    const pendingRequest = { action, target, input: requestInputWithDefaults };
    lastRequestRef.current = pendingRequest;
    setIsLoading(true);
    showBanner({
      tone: "info",
      title: loadingTitle(action, target),
      message: loadingMessage(action, target),
    });

    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          target,
          token,
          tripInput: requestInputWithDefaults,
          existingItinerary: payload?.itinerary || null,
        }),
      });

      const nextPayload = (await response.json()) as ItineraryResponse | ApiError;

      if (!response.ok || "error" in nextPayload) {
        throw nextPayload;
      }

      if (requestId !== activeRequestId.current) return;

      setPayload(nextPayload);
      setToken(nextPayload.token);
      setTripInput(nextPayload.tripInput);
      saveTrip(nextPayload);
      showBanner(
        {
          tone: "success",
          title: nextPayload.generatedBy === "openai" ? "Trip ready" : "Demo trip ready",
          message:
            nextPayload.generatedBy === "openai"
              ? `Generated with ${nextPayload.model}.`
              : "Generated in demo mode. Add OPENAI_API_KEY to switch to real AI.",
        },
        3200,
      );
    } catch (error) {
      if (requestId === activeRequestId.current) {
        if (isApiError(error) && error.code === "validation_error") {
          setFieldErrors(toFieldErrors(error.details));
        }
        showBanner(buildErrorBanner(error, pendingRequest));
      }
    } finally {
      if (requestId === activeRequestId.current) {
        setIsLoading(false);
      }
    }
  }

  function saveTrip(nextPayload: ItineraryResponse) {
    const savedTrip = saveTripToStorage(localStorage, nextPayload);
    window.location.hash = `trip=${encodeURIComponent(savedTrip.token)}`;
    setPayload(savedTrip);
  }

  function loadSharedTrip() {
    const tripToken = parseTripTokenFromHash(window.location.hash);
    if (!tripToken) return false;

    const savedPayload = loadTripFromStorage(localStorage, tripToken);
    if (!savedPayload) {
      showBanner({
        tone: "error",
        title: "Trip not found",
        message: "This local trip link works only in the same browser and is not saved here anymore.",
      });
      return false;
    }

    setPayload(savedPayload);
    setToken(savedPayload.token);
    setTripInput(savedPayload.tripInput);
    setFieldErrors({});
    showBanner(
      {
        tone: "success",
        title: "Saved trip loaded",
        message: "This itinerary was restored from browser storage.",
      },
      2800,
    );
    return true;
  }

  function showBanner(nextBanner: StatusBanner | null, timeoutMs?: number) {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
      statusTimeoutRef.current = null;
    }

    setStatusBanner(nextBanner);

    if (nextBanner && timeoutMs) {
      statusTimeoutRef.current = window.setTimeout(() => {
        setStatusBanner(null);
        statusTimeoutRef.current = null;
      }, timeoutMs);
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestItinerary("generate").then(() => {
      resultsRef.current?.scrollIntoView({ behavior: "smooth" });
    });
  }

  function onDaysChange(days: number) {
    const nextInput = { ...tripInput, days };
    setTripInput(nextInput);
    clearFieldError("days");
    if (payload) {
      void requestItinerary("generate", {}, nextInput);
    }
  }

  function clearFieldError(field: keyof FieldErrors | keyof TripInput) {
    setFieldErrors((current) => {
      if (!(field in current)) return current;
      const nextErrors = { ...current };
      delete nextErrors[field as keyof FieldErrors];
      return nextErrors;
    });
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showBanner({
        tone: "error",
        title: "Copy blocked",
        message: "Clipboard access is blocked here, but the local link is still visible above.",
      });
    }
  }

  async function copyItinerarySummary() {
    if (!payload) return;

    try {
      await navigator.clipboard.writeText(buildItineraryText({ ...payload, tripInput }));
      setCopiedItinerary(true);
      window.setTimeout(() => setCopiedItinerary(false), 1600);
    } catch {
      showBanner({
        tone: "error",
        title: "Copy blocked",
        message: "Clipboard access is blocked here, so the itinerary text could not be copied.",
      });
    }
  }

  async function copyCalendarSummary() {
    if (!payload) return;

    try {
      await navigator.clipboard.writeText(buildCalendarText({ ...payload, tripInput }));
      setCopiedCalendar(true);
      window.setTimeout(() => setCopiedCalendar(false), 1600);
    } catch {
      showBanner({
        tone: "error",
        title: "Copy blocked",
        message: "Clipboard access is blocked here, so the calendar-friendly outline could not be copied.",
      });
    }
  }

  function printCurrentTrip() {
    if (!itinerary) return;

    setExpandedDays(itinerary.days.map((_, index) => index));
    window.setTimeout(() => window.print(), 40);
  }

  function toggleDayExpanded(dayIndex: number) {
    setExpandedDays((current) =>
      current.includes(dayIndex) ? current.filter((index) => index !== dayIndex) : [...current, dayIndex],
    );
  }

  function deleteCurrentTrip() {
    if (!token) return;

    deleteTripFromStorage(localStorage, token);
    window.location.hash = "";
    setPayload(null);
    setToken(null);
    setTripInput(defaultInput);
    setFieldErrors({});
    showBanner(
      {
        tone: "success",
        title: "Local trip removed",
        message: "This browser-only trip was deleted. Generate a new one to keep planning.",
      },
      2800,
    );
  }

  function retryLastRequest() {
    const lastRequest = lastRequestRef.current;
    if (!lastRequest || isLoading) return;
    void requestItinerary(lastRequest.action, lastRequest.target, lastRequest.input);
  }

  return (
    <>
      <header className="shell nav" aria-label="Main navigation">
        <Logo />
        <nav className="nav-actions" aria-label="Product actions">
          <button
            className="ghost-btn"
            type="button"
            onClick={() => resultsRef.current?.scrollIntoView({ behavior: "smooth" })}
          >
            View sample
          </button>
          <button
            className="primary-btn"
            type="button"
            onClick={() => {
              formRef.current?.scrollIntoView({ behavior: "smooth" });
              formRef.current?.querySelector<HTMLInputElement>("#destination")?.focus();
            }}
          >
            Start planning
          </button>
        </nav>
      </header>

      <main className="shell">
        <section className="hero">
          <div className="hero-copy">
            <span className="eyebrow">AI itinerary builder for any place</span>
            <h1>Turn a destination into a trip plan in seconds.</h1>
            <p>
              Enter where you are going, how long you will be there, and who is coming.
              The app builds a day-by-day plan with pacing, meals, travel notes, and
              Google Maps searches.
            </p>
            <div className="trust-row" aria-label="Key product promises">
              <span className="trust-pill">AI-generated plan</span>
              <span className="trust-pill">Family-aware pacing</span>
              <span className="trust-pill">Private local save</span>
            </div>
          </div>

          <form
            id="planner-form"
            ref={formRef}
            className="planner-card"
            aria-label="Create itinerary form"
            onSubmit={onSubmit}
          >
            <h2>Plan your trip</h2>
            <div className="form-grid">
              <div className="field full">
                <label htmlFor="destination">Destination</label>
                <input
                  id="destination"
                  name="destination"
                  value={tripInput.destination}
                  required
                  aria-invalid={Boolean(fieldErrors.destination)}
                  onChange={(event) => updateInput("destination", event.target.value)}
                />
                {fieldErrors.destination ? <p className="field-error">{fieldErrors.destination}</p> : null}
              </div>

              <div className="field">
                <label htmlFor="start-date">Start date</label>
                <input
                  id="start-date"
                  name="startDate"
                  type="date"
                  value={tripInput.startDate}
                  onChange={(event) => updateInput("startDate", event.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="days">Trip length</label>
                <select
                  id="days"
                  name="days"
                  value={tripInput.days}
                  aria-invalid={Boolean(fieldErrors.days)}
                  onChange={(event) => onDaysChange(Number(event.target.value))}
                >
                  {[1, 2, 3, 5, 7, 10].map((day) => (
                    <option key={day} value={day}>
                      {day} day{day === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
                {fieldErrors.days ? <p className="field-error">{fieldErrors.days}</p> : null}
              </div>

              <div className="field">
                <label htmlFor="adults">Adults</label>
                <input
                  id="adults"
                  name="adults"
                  type="number"
                  min="1"
                  max="20"
                  value={tripInput.adults}
                  aria-invalid={Boolean(fieldErrors.adults)}
                  onChange={(event) => updateInput("adults", Number(event.target.value))}
                />
                {fieldErrors.adults ? <p className="field-error">{fieldErrors.adults}</p> : null}
              </div>

              <div className="field">
                <label htmlFor="children">Children</label>
                <input
                  id="children"
                  name="children"
                  type="number"
                  min="0"
                  max="20"
                  value={tripInput.children}
                  aria-invalid={Boolean(fieldErrors.children)}
                  onChange={(event) => updateInput("children", Number(event.target.value))}
                />
                {fieldErrors.children ? <p className="field-error">{fieldErrors.children}</p> : null}
              </div>

              <div className="field">
                <label htmlFor="budget">Budget</label>
                <select
                  id="budget"
                  name="budget"
                  value={tripInput.budget}
                  onChange={(event) => updateInput("budget", event.target.value as Budget)}
                >
                  <option>Budget</option>
                  <option>Moderate</option>
                  <option>Premium</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="pace">Pace</label>
                <select
                  id="pace"
                  name="pace"
                  value={tripInput.pace}
                  onChange={(event) => updateInput("pace", event.target.value as Pace)}
                >
                  <option>Relaxed</option>
                  <option>Balanced</option>
                  <option>Packed</option>
                </select>
              </div>

              <div className="field full">
                <label>Interests</label>
                <div className="interest-chips" aria-label="Interest choices">
                  {interests.map((interest) => (
                    <button
                      key={interest}
                      className={`chip${tripInput.interests.includes(interest) ? " active" : ""}`}
                      type="button"
                      onClick={() => toggleInterest(interest)}
                    >
                      {interest}
                    </button>
                  ))}
                </div>
                <p className={`field-note${fieldErrors.interests ? " is-error" : ""}`}>
                  {fieldErrors.interests ||
                    (tripInput.interests.length > 0
                      ? `${tripInput.interests.length} interest${tripInput.interests.length === 1 ? "" : "s"} selected.`
                      : "If none are selected, the planner restores default interests before generating.")}
                </p>
              </div>
            </div>

            <div className="submit-row">
              <button className="primary-btn" type="submit" disabled={isLoading}>
                {isLoading ? "Building trip..." : "Generate itinerary"}
              </button>
              <span className="hint">Uses OpenAI when configured, otherwise demo mode.</span>
            </div>
            {statusBanner ? (
              <StatusCard
                banner={statusBanner}
                isLoading={isLoading}
                onRetry={statusBanner.canRetry ? retryLastRequest : undefined}
              />
            ) : null}
          </form>
        </section>

        <section
          ref={resultsRef}
          className="results"
          aria-label="Generated itinerary preview"
          aria-busy={isLoading}
        >
          <div>
            <div className="section-title">
              <div>
                <h2>{itinerary?.title || "California family trip"}</h2>
                <p>{subtitle(tripInput)}</p>
              </div>
              <button className="ghost-btn" type="button" disabled={isLoading} onClick={() => requestItinerary("generate")}>
                Regenerate all
              </button>
            </div>

            {isLoading && !itinerary ? <DaySkeletonGroup dayCount={tripInput.days} /> : null}

            {itinerary ? (
              <div className="day-stack">
                <div className="mobile-trip-bar" aria-label="Mobile trip actions">
                  <button
                    className="ghost-btn"
                    type="button"
                    onClick={() => formRef.current?.scrollIntoView({ behavior: "smooth" })}
                  >
                    Edit trip
                  </button>
                  <button className="ghost-btn" type="button" onClick={copyCalendarSummary}>
                    {copiedCalendar ? "Calendar copied" : "Copy calendar outline"}
                  </button>
                  <button className="primary-btn" type="button" onClick={printCurrentTrip}>
                    Print / save PDF
                  </button>
                </div>
                <div className="verify-banner" role="note">
                  Verify hours, tickets, travel times, and availability before you go.
                </div>
                {itinerary.days.map((day, dayIndex) => (
                  <article className={`day-card${isLoading ? " is-updating" : ""}`} key={`${day.title}-${dayIndex}`}>
                    <header className="day-head">
                      <div className="day-heading">
                        <h3>{day.title}</h3>
                        <div className="day-meta">{day.meta}</div>
                        <div className="day-summary-row">
                          <span className="day-summary-pill">
                            {day.activities.length} stop{day.activities.length === 1 ? "" : "s"}
                          </span>
                          <button
                            className="day-toggle"
                            type="button"
                            aria-expanded={expandedDays.includes(dayIndex)}
                            onClick={() => toggleDayExpanded(dayIndex)}
                          >
                            {expandedDays.includes(dayIndex) ? "Hide details" : "Show details"}
                          </button>
                        </div>
                      </div>
                      <div className="day-actions">
                        <a
                          className="day-map-link"
                          href={buildGoogleMapsSearchUrl(buildDayMapQuery(day, itinerary.destination))}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Open day in Google Maps
                        </a>
                        <button
                          className="small-btn"
                          type="button"
                          disabled={isLoading}
                          onClick={() => requestItinerary("relax-day", { dayIndex })}
                        >
                          Relax day
                        </button>
                        <button
                          className="small-btn"
                          type="button"
                          disabled={isLoading}
                          onClick={() => requestItinerary("cheaper-day", { dayIndex })}
                        >
                          Lower cost
                        </button>
                        <button
                          className="small-btn"
                          type="button"
                          disabled={isLoading}
                          onClick={() => requestItinerary("regenerate-day", { dayIndex })}
                        >
                          Regenerate day
                        </button>
                      </div>
                    </header>
                    {expandedDays.includes(dayIndex) ? (
                      day.activities.map((activity, activityIndex) => (
                        <div className="activity" key={`${activity.title}-${activityIndex}`}>
                          <div className="time">{activity.time}</div>
                          <div>
                            <div className="activity-title-row">
                              <h4>{activity.title}</h4>
                              {activity.neighborhood ? (
                                <span className="detail-chip detail-chip-location">{activity.neighborhood}</span>
                              ) : null}
                            </div>
                            <p>{activity.description}</p>
                            <div className="detail-grid" aria-label="Activity details">
                              {activity.setting ? (
                                <div className="detail-card">
                                  <span className="detail-label">Setting</span>
                                  <strong>{activity.setting}</strong>
                                </div>
                              ) : null}
                              {activity.familyFriendly ? (
                                <div className="detail-card">
                                  <span className="detail-label">Kid fit</span>
                                  <strong>{familyFriendlyLabel(activity.familyFriendly)}</strong>
                                </div>
                              ) : null}
                              {activity.bookingHint ? (
                                <div className="detail-card detail-card-wide">
                                  <span className="detail-label">Booking hint</span>
                                  <strong>{activity.bookingHint}</strong>
                                </div>
                              ) : null}
                            </div>
                            <div className="tags">
                              {activity.tags.map((tag) => (
                                <span className="tag" key={tag}>
                                  {tag}
                                </span>
                              ))}
                              <span className="tag">{activity.duration}</span>
                              <span className="tag">{activity.cost}</span>
                            </div>
                          </div>
                          <div className="activity-actions">
                            <div className="activity-action-group">
                              <button
                                className="small-btn"
                                type="button"
                                disabled={isLoading}
                                onClick={() => requestItinerary("swap-activity", { dayIndex, activityIndex })}
                              >
                                Swap
                              </button>
                              <button
                                className="small-btn"
                                type="button"
                                disabled={isLoading}
                                onClick={() => requestItinerary("kid-friendly-activity", { dayIndex, activityIndex })}
                              >
                                More kid-friendly
                              </button>
                              <button
                                className="small-btn"
                                type="button"
                                disabled={isLoading}
                                onClick={() => requestItinerary("remove-activity", { dayIndex, activityIndex })}
                              >
                                Remove
                              </button>
                            </div>
                            <a
                              className="map-link"
                              href={buildGoogleMapsSearchUrl(activity.mapQuery)}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open in Google Maps
                            </a>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="day-collapsed-note">
                        Expand this day to review the full stop list, activity details, and map links.
                      </div>
                    )}
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <aside className="side" aria-label="Trip sidebar">
            <section className="side-card">
              <div className={`map${isLoading ? " map-loading" : ""}`}>
                {itinerary?.destination || "Google Map Searches"}
                <span>
                  {itinerary
                    ? `${itinerary.summary.activityCount} stops across ${itinerary.days.length} day${itinerary.days.length === 1 ? "" : "s"}.`
                    : isLoading
                      ? loadingMessage("generate", {})
                      : "Each activity includes a Maps search link."}
                </span>
              </div>
            </section>

            <section className="side-card">
              <h2>Trip summary</h2>
              <ul className="summary-list">
                <li>
                  <span>Total activities</span>
                  <strong>{itinerary?.summary.activityCount || 0}</strong>
                </li>
                <li>
                  <span>Average pace</span>
                  <strong>{itinerary?.summary.pace || tripInput.pace}</strong>
                </li>
                <li>
                  <span>Estimated cost</span>
                  <strong>{itinerary?.summary.budget || tripInput.budget}</strong>
                </li>
                <li>
                  <span>Best for</span>
                  <strong>{itinerary?.summary.bestFor || "Families"}</strong>
                </li>
                <li>
                  <span>Generator</span>
                  <strong>{payload?.generatedBy === "openai" ? "OpenAI" : "Demo"}</strong>
                </li>
              </ul>
            </section>

            <section className="side-card share-box">
              <h2>Private link</h2>
              <p className="hint">
                Saved only in this browser. The link reopens the trip here, not on other devices or browsers.
              </p>
              <div className="share-url">{shareLink}</div>
              <div className="share-actions">
                <button className="primary-btn" type="button" onClick={copyShareLink}>
                  {copied ? "Copied" : "Copy share link"}
                </button>
                <button
                  className="ghost-btn"
                  type="button"
                  onClick={copyItinerarySummary}
                  disabled={!payload}
                >
                  {copiedItinerary ? "Itinerary copied" : "Copy itinerary text"}
                </button>
                <button className="small-btn" type="button" onClick={deleteCurrentTrip} disabled={!token}>
                  Delete local trip
                </button>
              </div>
              {token ? (
                <div className="share-meta">
                  <span>{savedTrips.length} saved trip{savedTrips.length === 1 ? "" : "s"} in this browser</span>
                  {"updatedAt" in (payload || {}) ? (
                    <span>Last updated {new Date((payload as SavedTrip).updatedAt).toLocaleString()}</span>
                  ) : null}
                </div>
              ) : null}
            </section>

            <section className="side-card share-box">
              <h2>Take it with you</h2>
              <p className="hint">
                Use the current local itinerary data for printing, PDF save, or a calendar-friendly outline.
              </p>
              <div className="share-actions">
                <button className="primary-btn" type="button" onClick={printCurrentTrip} disabled={!payload}>
                  Print / save PDF
                </button>
                <button className="ghost-btn" type="button" onClick={copyCalendarSummary} disabled={!payload}>
                  {copiedCalendar ? "Calendar copied" : "Copy calendar outline"}
                </button>
              </div>
            </section>

            <section className="side-card">
              <h2>Planner notes</h2>
              <ul className="notes-list">
                {(itinerary?.notes || ["Verify tickets, hours, and travel times before going."]).map((note) => (
                  <li key={note}>{note}</li>
                ))}
              </ul>
            </section>
          </aside>
        </section>
      </main>

      <Footer />
    </>
  );
}

function StatusCard({
  banner,
  isLoading,
  onRetry,
}: {
  banner: StatusBanner;
  isLoading: boolean;
  onRetry?: () => void;
}) {
  return (
    <div className={`status-note status-${banner.tone}`} role={banner.tone === "error" ? "alert" : "status"}>
      <div>
        <strong>{banner.title}</strong>
        <p>{banner.message}</p>
        {banner.details?.length ? (
          <ul className="status-list">
            {banner.details.map((detail) => (
              <li key={detail}>{detail}</li>
            ))}
          </ul>
        ) : null}
      </div>
      {banner.canRetry && onRetry ? (
        <button className="small-btn" type="button" disabled={isLoading} onClick={onRetry}>
          Retry
        </button>
      ) : null}
    </div>
  );
}

function DaySkeletonGroup({ dayCount }: { dayCount: number }) {
  return (
    <div className="day-stack" aria-hidden="true">
      {Array.from({ length: Math.min(Math.max(dayCount, 1), 2) }).map((_, dayIndex) => (
        <article className="day-card day-skeleton-card" key={`skeleton-day-${dayIndex}`}>
          <header className="day-head">
            <div className="skeleton-block title" />
            <div className="skeleton-block pill" />
          </header>
          {Array.from({ length: 3 }).map((_, activityIndex) => (
            <div className="activity" key={`skeleton-activity-${dayIndex}-${activityIndex}`}>
              <div className="skeleton-block time" />
              <div className="activity-copy">
                <div className="skeleton-block heading" />
                <div className="skeleton-block line" />
                <div className="skeleton-block line short" />
                <div className="tags">
                  <span className="skeleton-block chip" />
                  <span className="skeleton-block chip" />
                  <span className="skeleton-block chip" />
                </div>
              </div>
              <div className="activity-actions">
                <div className="skeleton-block button" />
                <div className="skeleton-block link" />
              </div>
            </div>
          ))}
        </article>
      ))}
    </div>
  );
}

function subtitle(input: TripInput) {
  const travelerText = `${input.adults} adult${input.adults === 1 ? "" : "s"}, ${input.children} child${input.children === 1 ? "" : "ren"}`;
  return `${input.days} day${input.days === 1 ? "" : "s"} · ${travelerText} · ${input.budget.toLowerCase()} budget · ${input.pace.toLowerCase()} pace`;
}

function Logo() {
  return (
    <div className="logo">
      <span className="logo-mark">VP</span>
      <span>Vacation Planner</span>
    </div>
  );
}

function Footer() {
  return (
    <footer className="footer">
      <div className="shell footer-inner">
        <div className="footer-brand">
          <Logo />
          <p>
            Build thoughtful day-by-day itineraries with AI-generated plans,
            traveler-aware pacing, and private local trip links.
          </p>
        </div>

        <FooterColumn title="Plan" links={["Create itinerary", "Sample trip", "Family travel"]} />
        <FooterColumn title="Support" links={["How it works", "Trip privacy", "Contact"]} />
        <FooterColumn title="Company" links={["About", "Terms", "Privacy"]} />
      </div>

      <div className="shell footer-bottom">
        <span>© 2026 Vacation Planner. Made for easier getaways.</span>
        <div className="footer-badges" aria-label="Footer trust badges">
          <span className="tag">OpenAI ready</span>
          <span className="tag">Local save</span>
          <span className="tag">No account needed</span>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, links }: { title: string; links: string[] }) {
  return (
    <div>
      <h3>{title}</h3>
      <ul className="footer-links">
        {links.map((link) => (
          <li key={link}>
            <a href="#planner-form">{link}</a>
          </li>
        ))}
      </ul>
    </div>
  );
}

function loadingTitle(action: ItineraryAction, target: ItineraryTarget) {
  switch (action) {
    case "regenerate-day":
      return `Refreshing day ${(target.dayIndex ?? 0) + 1}`;
    case "swap-activity":
      return "Swapping one stop";
    case "relax-day":
      return `Relaxing day ${(target.dayIndex ?? 0) + 1}`;
    case "cheaper-day":
      return `Lowering the cost for day ${(target.dayIndex ?? 0) + 1}`;
    case "kid-friendly-activity":
      return "Finding a more kid-friendly stop";
    case "remove-activity":
      return "Tightening the plan";
    default:
      return "Building your itinerary";
  }
}

function loadingMessage(action: ItineraryAction, target: ItineraryTarget) {
  switch (action) {
    case "regenerate-day":
      return `Reworking day ${(target.dayIndex ?? 0) + 1} while keeping the rest of the trip intact.`;
    case "swap-activity":
      return "Looking for a better-matched activity and keeping the rest of the day steady.";
    case "relax-day":
      return `Reducing the pace for day ${(target.dayIndex ?? 0) + 1} without changing the full trip.`;
    case "cheaper-day":
      return `Adjusting day ${(target.dayIndex ?? 0) + 1} toward lower-cost stops.`;
    case "kid-friendly-activity":
      return "Replacing this stop with an option that fits children better.";
    case "remove-activity":
      return "Removing one stop and repairing the day around it.";
    default:
      return "Balancing stops, pacing, and map-ready place names for your trip.";
  }
}

function buildErrorBanner(error: unknown, request: PendingRequest): StatusBanner {
  if (isApiError(error)) {
    const details = error.details ? Object.values(error.details) : undefined;

    switch (error.code) {
      case "validation_error":
        return {
          tone: "error",
          title: "Trip details need attention",
          message: "Fix the highlighted trip inputs and try again.",
          details,
        };
      case "invalid_destination":
        return {
          tone: "error",
          title: "Destination needs more detail",
          message: "Try a specific city, region, or country so the planner can anchor the trip.",
          details,
          canRetry: true,
        };
      case "rate_limited":
        return {
          tone: "error",
          title: "Planner is temporarily busy",
          message: "Wait a moment, then retry the same request.",
          canRetry: true,
        };
      case "provider_error":
        return {
          tone: "error",
          title: "AI planner is unavailable",
          message: "The trip service had a temporary issue. Retry the request without refreshing.",
          canRetry: true,
        };
      case "malformed_response":
        return {
          tone: "error",
          title: "Returned trip was unusable",
          message: "The planner produced an incomplete response. Retry to generate a cleaner draft.",
          canRetry: true,
        };
      case "demo_fallback":
        return {
          tone: "error",
          title: "Switched to demo mode",
          message: error.error,
          canRetry: true,
        };
      default:
        return {
          tone: "error",
          title: "Unable to update the trip",
          message: error.error,
          details,
          canRetry: true,
        };
    }
  }

  return {
    tone: "error",
    title: actionFailureTitle(request.action),
    message: error instanceof Error ? error.message : "Something went wrong while updating the trip.",
    canRetry: true,
  };
}

function actionFailureTitle(action: ItineraryAction) {
  switch (action) {
    case "regenerate-day":
      return "Could not refresh that day";
    case "swap-activity":
      return "Could not swap this stop";
    case "relax-day":
      return "Could not relax this day";
    case "cheaper-day":
      return "Could not lower the cost for this day";
    case "kid-friendly-activity":
      return "Could not find a more kid-friendly stop";
    case "remove-activity":
      return "Could not remove this stop";
    default:
      return "Unable to generate the itinerary";
  }
}

function isApiError(value: unknown): value is ApiError & { code?: ApiErrorCode } {
  return typeof value === "object" && value !== null && "error" in value;
}

function validateTripInput(input: TripInput): FieldErrors {
  const nextErrors: FieldErrors = {};

  if (!input.destination.trim()) {
    nextErrors.destination = "Destination is required.";
  }
  if (!Number.isInteger(input.days) || input.days < 1 || input.days > 10) {
    nextErrors.days = "Days must be between 1 and 10.";
  }
  if (!Number.isInteger(input.adults) || input.adults < 1 || input.adults > 20) {
    nextErrors.adults = "Adults must be between 1 and 20.";
  }
  if (!Number.isInteger(input.children) || input.children < 0 || input.children > 20) {
    nextErrors.children = "Children must be between 0 and 20.";
  }

  return nextErrors;
}

function withDefaultInterests(input: TripInput): TripInput {
  if (input.interests.length > 0) {
    return input;
  }

  return {
    ...input,
    interests: defaultInterests,
  };
}

function toFieldErrors(details: ApiError["details"]): FieldErrors {
  if (!details) return {};

  const nextErrors: FieldErrors = {};
  for (const field of ["destination", "days", "adults", "children", "interests"] as const) {
    if (details[field]) {
      nextErrors[field] = details[field];
    }
  }
  return nextErrors;
}

function familyFriendlyLabel(level: "High" | "Medium" | "Low") {
  switch (level) {
    case "High":
      return "Great for kids";
    case "Medium":
      return "Works for families";
    default:
      return "Better for adults";
  }
}

function buildGoogleMapsSearchUrl(query: string) {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildDayMapQuery(day: ItineraryResponse["itinerary"]["days"][number], destination: string) {
  const uniquePlaces = Array.from(
    new Set(
      day.activities
        .map((activity) => activity.mapQuery.trim())
        .filter(Boolean),
    ),
  ).slice(0, 3);

  if (!uniquePlaces.length) return destination;
  return `${day.title} ${destination} ${uniquePlaces.join(" ")}`;
}
