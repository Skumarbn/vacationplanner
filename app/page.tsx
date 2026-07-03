"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
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
  createdAt: string;
  savedAt: string;
  updatedAt: string;
};

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
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const activeRequestId = useRef(0);
  const statusTimeoutRef = useRef<number | null>(null);
  const lastRequestRef = useRef<PendingRequest | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const resultsRef = useRef<HTMLElement>(null);

  const itinerary = payload?.itinerary;

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
    const pendingRequest = { action, target, input: requestInput };
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
          tripInput: requestInput,
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
        showBanner(buildErrorBanner(error, pendingRequest));
      }
    } finally {
      if (requestId === activeRequestId.current) {
        setIsLoading(false);
      }
    }
  }

  function saveTrip(nextPayload: ItineraryResponse) {
    const storageKey = `vacationplanner:${nextPayload.token}`;
    const previousTrip = localStorage.getItem(storageKey);
    const previousPayload = previousTrip ? (JSON.parse(previousTrip) as SavedTrip) : null;
    const createdAt = previousPayload?.createdAt || previousPayload?.savedAt || new Date().toISOString();

    localStorage.setItem(
      storageKey,
      JSON.stringify({
        ...nextPayload,
        createdAt,
        savedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      } satisfies SavedTrip),
    );
  }

  function loadSharedTrip() {
    const match = window.location.hash.match(/trip=([^&]+)/);
    if (!match) return false;

    const saved = localStorage.getItem(`vacationplanner:${match[1]}`);
    if (!saved) {
      showBanner({
        tone: "error",
        title: "Trip not found",
        message: "This local trip link is not saved in this browser anymore.",
      });
      return false;
    }

    const savedPayload = JSON.parse(saved) as SavedTrip;
    setPayload(savedPayload);
    setToken(savedPayload.token);
    setTripInput(savedPayload.tripInput);
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
      showBanner({
        tone: "error",
        title: "Copy blocked",
        message: "Clipboard access is blocked here, but the local link is still visible above.",
      });
    }
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
                {itinerary.days.map((day, dayIndex) => (
                  <article className={`day-card${isLoading ? " is-updating" : ""}`} key={`${day.title}-${dayIndex}`}>
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
              <p className="hint">Saved in this browser. Copy the link to reopen this local trip.</p>
              <div className="share-url">{shareLink}</div>
              <button className="primary-btn" type="button" onClick={copyShareLink}>
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
    default:
      return "Unable to generate the itinerary";
  }
}

function isApiError(value: unknown): value is ApiError & { code?: ApiErrorCode } {
  return typeof value === "object" && value !== null && "error" in value;
}
