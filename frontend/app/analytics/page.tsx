"use client";

import { useEffect, useState } from "react";
import { TrendChart } from "@/components/TrendChart";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import type { Analytics, Recommendation } from "@/lib/types";

// Validated against the dark chart surface for lightness, chroma, CVD
// separation and contrast (see the palette validator).
const SPEED_COLOR = "#0d9488";
const COMPREHENSION_COLOR = "#d97706";

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-surface p-5">
      <p className="text-xs uppercase tracking-wide text-muted">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

function shortDate(iso: string) {
  const date = new Date(`${iso}T00:00:00`);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export default function AnalyticsPage() {
  const { user, loading } = useRequireAuth();
  const [data, setData] = useState<Analytics | null>(null);
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    api.analytics().then(setData).catch((err) => setError(err.message));
    api.recommendation().then(setRecommendation).catch(() => {});
  }, [user]);

  if (loading || !user) return <p className="py-20 text-center text-muted">Loading…</p>;
  if (error) return <p className="py-20 text-center text-orp">{error}</p>;
  if (!data) return <p className="py-20 text-center text-muted">Crunching your numbers…</p>;

  const points = data.trend.map((point) => ({
    label: shortDate(point.date),
    value: point.wpm,
  }));

  const comprehensionPoints = data.trend.map((point) => ({
    label: shortDate(point.date),
    value: point.comprehension === null ? null : point.comprehension * 100,
  }));

  return (
    <div className="space-y-8 py-10">
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Reading analytics</h1>
        <p className="mt-2 text-muted">
          {data.words_read === 0
            ? "Once you have read a few passages, your speed and retention trends will appear here."
            : `${data.words_read.toLocaleString()} words across ${data.minutes_read.toFixed(0)} minutes of reading.`}
        </p>
      </section>

      {recommendation && recommendation.confidence !== "none" && (
        <section className="rounded-xl border border-brand/30 bg-brand/5 p-5">
          <p className="font-medium">
            Recommended speed: {recommendation.recommended_wpm} WPM
          </p>
          <p className="mt-1 text-sm text-muted">{recommendation.rationale}</p>
          <p className="mt-2 text-xs text-muted/80">
            Based on {recommendation.samples} scored{" "}
            {recommendation.samples === 1 ? "session" : "sessions"} &middot;{" "}
            {recommendation.confidence} confidence
          </p>
        </section>
      )}

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Average speed"
          value={`${data.average_wpm.toFixed(0)} wpm`}
          hint={`Best: ${data.best_wpm.toFixed(0)} wpm`}
        />
        <Stat
          label="Comprehension"
          value={
            data.average_comprehension === null
              ? "—"
              : `${Math.round(data.average_comprehension * 100)}%`
          }
          hint={data.average_comprehension === null ? "Take a quiz to start tracking" : "Average across quizzes"}
        />
        <Stat
          label="Words read"
          value={data.words_read.toLocaleString()}
          hint={`${data.minutes_read.toFixed(0)} minutes`}
        />
        <Stat
          label="Documents"
          value={`${data.documents_completed} / ${data.documents_total}`}
          hint={`${data.current_streak_days}-day streak`}
        />
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <TrendChart
          title="Reading speed (WPM)"
          points={points}
          color={SPEED_COLOR}
          format={(value) => value.toFixed(0)}
          emptyMessage="No reading sessions recorded yet."
        />
        <TrendChart
          title="Comprehension (%)"
          points={comprehensionPoints}
          color={COMPREHENSION_COLOR}
          format={(value) => `${value.toFixed(0)}%`}
          emptyMessage="Take a comprehension check to see retention over time."
        />
      </section>
    </div>
  );
}
