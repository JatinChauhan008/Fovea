"use client";

/*
 * Stats: totals, speeds, streak and the daily speed chart, in the reader's time zone.
 *
 * Docs: ../architecture.md
 */

import { useEffect, useState } from "react";
import { ErrorText, PageHeading, PageLoading } from "@/components/PageParts";
import { TrendChart } from "@/components/TrendChart";
import { api } from "@/lib/api";
import { useRequireAuth } from "@/lib/auth";
import { formatDuration } from "@/lib/format";
import type { Analytics } from "@/lib/types";

function Stat({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="border-t border-ink pt-3">
      <dt className="text-sm text-muted">{label}</dt>
      <dd className="mt-1 font-serif text-3xl tabular-nums">{value}</dd>
      {note && <dd className="mt-1 text-sm text-faint">{note}</dd>}
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
  const [error, setError] = useState<string | null>(null);

  const userId = user?.id;
  useEffect(() => {
    if (userId === undefined) return;
    // getTimezoneOffset counts minutes *behind* UTC, so flip its sign.
    api
      .analytics(-new Date().getTimezoneOffset())
      .then(setData)
      .catch((err) => setError(err.message));
  }, [userId]);

  if (loading || !user) return <PageLoading />;

  return (
    <div className="pb-20 pt-8">
      <PageHeading>Stats</PageHeading>

      {error ? (
        <ErrorText className="mt-4">{error}</ErrorText>
      ) : !data ? (
        <PageLoading inline className="mt-4" />
      ) : data.words_read === 0 ? (
        <p className="mt-3 max-w-prose text-muted">
          Nothing recorded yet. Each time you pause or finish in the reader, that stretch is logged
          here with its speed and length.
        </p>
      ) : (
        <>
          <dl className="mt-8 grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
            <Stat label="Words read" value={data.words_read.toLocaleString()} />
            <Stat label="Time reading" value={formatDuration(data.minutes_read)} />
            <Stat
              label="Average speed"
              value={`${Math.round(data.average_wpm)}`}
              // Fastest only counts stretches of 50+ words, so it can be missing.
              note={data.best_wpm > 0 ? `wpm, fastest ${Math.round(data.best_wpm)}` : "wpm"}
            />
            <Stat
              label="Finished"
              value={`${data.documents_completed} of ${data.documents_total}`}
              note={
                data.current_streak_days > 1
                  ? `Reading ${data.current_streak_days} days in a row`
                  : undefined
              }
            />
          </dl>

          <div className="mt-12">
            <TrendChart
              title="Speed by day"
              points={data.trend.map((point) => ({ label: shortDate(point.date), value: point.wpm }))}
              format={(value) => `${Math.round(value)}`}
              unit="wpm"
            />
          </div>
        </>
      )}
    </div>
  );
}
