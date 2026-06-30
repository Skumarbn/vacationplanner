"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type {
  ApiError,
  Budget,
  ItineraryAction,
  ItineraryResponse,
  ItineraryTarget,
  Pace,
  TripInput,
} from "@/lib/types";

const interests = ["Food", "Museums", "Outdoors", "Kid-friendly", "Nightlife", "Shopping"];

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

type SavedTrip = ItineraryResponse & {
  savedAt: string;
};

type StatusTone = "info" | "success" | "error";

type StatusState = {
  message: string;
  tone: StatusTone;
  retryable: boolean;
};

type PendingRequest = {
  action: ItineraryAction;
  target: ItineraryTarget;
  tripInput: TripInput;
};

export default function Home() {
  const [tripInput, setTripInput] = useState<TripInput>(defaultInput);
  const [payload, setPayload] = useState<ItineraryResponse | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [status, setStatus] = useState<StatusState | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [loadingRequest, setLoadingRequest] = useState<PendingRequest | null>(null);
  const activeRequestId = useRef(0);
  const lastRequestRef = useRef<PendingRequest | null>(null);
  const statusTimeoutRef = useRef<number | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const itinerary = payload?.itinerary;
  const skeletonDays = itinerary?.days.length || loadingRequest?.tripInput.days || tripInput.days;

  const shareLink = useMemo(() => {
    if (!payload?.token || typeof window === "undefined") return "Generate a trip first";
    return `${window.location.origin}/#trip=${payload.token}`;
  }, [payload?.token]);

  useEffect(() => {
    if (!loadSharedTrip()) {
      void requestItinerary("generate", {}, defaultInput);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function updateInput<T extends keyof TripInput>(key: T, value: TripInput[T]) {
    setTripInput((current) => ({ ...current, [key]: value }));
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
  }

  async function requestItinerary(
    action: ItineraryAction = "generate",
    target: ItineraryTarget = {},
    inputOverride?: TripInput,
  ) {
    const requestId = (activeRequestId.current += 1);
    const requestInput = inputOverride || tripInput;
    const nextRequest = { action, target, tripInput: requestInput };
    lastRequestRef.current = nextRequest;
    setIsLoading(true);
    setLoadingRequest(nextRequest);
    showStatus(getLoadingMessage(action, target), "info");

    try {
      const response = await fetch("/api/itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          target,
          token,
          tripInput: requestInput,
          existingItinerary: payload?.itinerary || null,
        }),
      });

      const nextPayload = (await response.json()) as ItineraryResponse | ApiError;

      if (!response.ok || "error" in nextPayload) {
        throw new Error("error" in nextPayload ? nextPayload.error : "Unable to generate itinerary.");
      }

      if (requestId !== activeRequestId.current) return;

      setPayload(nextPayload);
      setToken(nextPayload.token);
      saveTrip(nextPayload);
      showStatus(
        nextPayload.generatedBy === "openai"
          ? `Generated with ${nextPayload.model}.`
          : "Demo itinerary generated. Add OPENAI_API_KEY for real AI.",
        "success",
      );
    } catch (error) {
      if (requestId === activeRequestId.current) {
        showStatus(formatErrorMessage(error), "error", true);
      }
    } finally {
      if (requestId === activeRequestId.current) {
        setIsLoading(false);
        setLoadingRequest(null);
      }
    }
  }

  function saveTrip(nextPayload: ItineraryResponse) {
    localStorage.setItem(
      `vacationplanner:${nextPayload.token}`,
      JSON.stringify({
        ...nextPayload,
        savedAt: new Date().toISOString(),
      } satisfies SavedTrip),
    );
  }

  function loadSharedTrip() {
    const match = window.location.hash.match(/trip=([^&]+)/);
    if (!match) return false;

    const saved = localStorage.getItem(`vacationplanner:${match[1]}`);
    if (!saved) {
      showStatus("This trip link is not saved in this browser.", "error");
      return false;
    }

    const savedPayload = JSON.parse(saved) as SavedTrip;
    setPayload(savedPayload);
    setToken(savedPayload.token);
    setTripInput(savedPayload.tripInput);
    showStatus("Loaded saved trip.", "success");
    return true;
  }

  function showStatus(message: string, tone: StatusTone, retryable = false) {
    if (statusTimeoutRef.current) {
      window.clearTimeout(statusTimeoutRef.current);
    }

    setStatus({ message, tone, retryable });

    if (tone === "success") {
      statusTimeoutRef.current = window.setTimeout(() => setStatus(null), 3600);
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
    if (payload) {
      void requestItinerary("generate", {}, nextInput);
    }
  }

  async function copyShareLink() {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      showStatus("Copy is blocked in this browser, but the link is visible above.", "error");
    }
  }

  function retryLastRequest() {
    if (!lastRequestRef.current || isLoading) return;
    const { action, target, tripInput: lastTripInput } = lastRequestRef.current;
    void requestItinerary(action, target, lastTripInput);
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
            aria-busy={isLoading}
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
                  onChange={(event) => updateInput("destination", event.target.value)}
                />
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
                  onChange={(event) => onDaysChange(Number(event.target.value))}
                >
                  {[1, 2, 3, 5, 7, 10].map((day) => (
                    <option key={day} value={day}>
                      {day} day{day === 1 ? "" : "s"}
                    </option>
                  ))}
                </select>
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
                  onChange={(event) => updateInput("adults", Number(event.target.value))}
                />
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
                  onChange={(event) => updateInput("children", Number(event.target.value))}
                />
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
              </div>
            </div>

            <div className="submit-row">
              <button className="primary-btn" type="submit" disabled={isLoading}>
                {isLoading ? "Building trip..." : "Generate itinerary"}
              </button>
              <span className="hint">
                {isLoading
                  ? status?.message || "Preparing your next itinerary update."
                  : "Uses OpenAI when configured, otherwise demo mode."}
              </span>
            </div>
            {status ? (
              <div className={`status-note ${status.tone}`} role={status.tone === "error" ? "alert" : "status"}>
                <div>{status.message}</div>
                {status.retryable ? (
                  <button className="small-btn" type="button" disabled={isLoading} onClick={retryLastRequest}>
                    Retry request
                  </button>
                ) : null}
              </div>
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
              <button
                className="ghost-btn"
                type="button"
                disabled={isLoading}
                onClick={() => requestItinerary("generate")}
              >
                Regenerate all
              </button>
            </div>

            <div className="day-stack">
              {isLoading && !itinerary
                ? Array.from({ length: skeletonDays }, (_, index) => (
                    <DaySkeleton key={`loading-day-${index}`} dayNumber={index + 1} />
                  ))
                : itinerary?.days.map((day, dayIndex) => (
                    <article className="day-card" key={`${day.title}-${dayIndex}`}>
                      <header className="day-head">
                        <div>
                          <h3>{day.title}</h3>
                          <div className="day-meta">{day.meta}</div>
                        </div>
                        <button
                          className="small-btn"
                          type="button"
                          disabled={isLoading}
                          onClick={() => requestItinerary("regenerate-day", { dayIndex })}
                        >
                          Regenerate day
                        </button>
                      </header>
                      {day.activities.map((activity, activityIndex) => (
                        <div className="activity" key={`${activity.title}-${activityIndex}`}>
                          <div className="time">{activity.time}</div>
                          <div>
                            <h4>{activity.title}</h4>
                            <p>{activity.description}</p>
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
                            <button
                              className="small-btn"
                              type="button"
                              disabled={isLoading}
                              onClick={() => requestItinerary("swap-activity", { dayIndex, activityIndex })}
                            >
                              Swap
                            </button>
                            <a
                              className="map-link"
                              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activity.mapQuery)}`}
                              target="_blank"
                              rel="noreferrer"
                            >
                              Open map
                            </a>
                          </div>
                        </div>
                      ))}
                    </article>
                  ))}
            </div>
          </div>

          <aside className="side" aria-label="Trip sidebar">
            <section className="side-card">
              <div className="map">
                {itinerary?.destination || "Google Map Searches"}
                <span>
                  {itinerary
                    ? `${itinerary.summary.activityCount} stops across ${itinerary.days.length} day${itinerary.days.length === 1 ? "" : "s"}.`
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
              <p className="hint">Saved in this browser. Copy the link to reopen this local trip.</p>
              <div className="share-url">{shareLink}</div>
              <button className="primary-btn" type="button" disabled={isLoading} onClick={copyShareLink}>
                {copied ? "Copied" : "Copy share link"}
              </button>
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

function DaySkeleton({ dayNumber }: { dayNumber: number }) {
  return (
    <article className="day-card skeleton-card" aria-hidden="true">
      <header className="day-head">
        <div>
          <h3>Day {dayNumber}</h3>
          <div className="day-meta">Grouping nearby stops and pacing the route</div>
        </div>
        <span className="small-btn skeleton-chip">Working</span>
      </header>
      {Array.from({ length: 3 }, (_, index) => (
        <div className="activity skeleton-activity" key={`skeleton-activity-${dayNumber}-${index}`}>
          <div className="time skeleton-block short" />
          <div>
            <div className="skeleton-block title" />
            <div className="skeleton-block body" />
            <div className="skeleton-block body narrow" />
            <div className="tags">
              <span className="tag skeleton-tag" />
              <span className="tag skeleton-tag" />
              <span className="tag skeleton-tag" />
            </div>
          </div>
          <div className="activity-actions">
            <span className="small-btn skeleton-chip">Updating</span>
            <span className="map-link">Finding map search</span>
          </div>
        </div>
      ))}
    </article>
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

function getLoadingMessage(action: ItineraryAction, target: ItineraryTarget) {
  if (action === "regenerate-day") {
    return `Refreshing Day ${(target.dayIndex ?? 0) + 1} with a new plan.`;
  }

  if (action === "swap-activity") {
    return `Finding a replacement for stop ${(target.activityIndex ?? 0) + 1} on Day ${(target.dayIndex ?? 0) + 1}.`;
  }

  return "Building a fresh itinerary with pacing, meals, and map-ready stops.";
}

function formatErrorMessage(error: unknown) {
  const message =
    error instanceof Error && error.message.trim() ? error.message.trim() : "Something went wrong.";
  const normalized = message.toLowerCase();

  if (normalized.includes("destination is required")) {
    return "Enter a destination before generating a trip.";
  }

  if (normalized.includes("rate limit")) {
    return "OpenAI is rate-limiting requests right now. Wait a moment, then retry.";
  }

  if (normalized.includes("api key") || normalized.includes("incorrect api key")) {
    return "OpenAI could not be used with the current API key. Retry after updating the local environment.";
  }

  if (normalized.includes("openai")) {
    return "OpenAI could not finish this itinerary update. Retry the request or use demo mode if needed.";
  }

  if (normalized.includes("failed to fetch")) {
    return "The itinerary request could not reach the app server. Check the local connection and retry.";
  }

  return message;
}
