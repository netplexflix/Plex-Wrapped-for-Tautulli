import { motion } from "framer-motion";
import { History, ArrowUp, ArrowDown, Flag } from "lucide-react";
import { StatCard } from "./StatCard";
import { YearlyTrends } from "./YearlyTrends";
import type { PeriodSummary, PreviousPeriod, ReportHistory } from "@/types/api";

interface ThroughTheYearsProps {
  history: ReportHistory;
  /** Totals of the report period, compared with history.previous */
  current: PeriodSummary;
  /** The report's year, highlighted in the yearly chart */
  highlightYear?: number;
  isGroup: boolean;
}

// Hidden when there is nothing to compare: no previous period and only one year of history
export const hasThroughTheYears = (history: ReportHistory | null | undefined): history is ReportHistory =>
  Boolean(history && (history.previous || history.yearly.filter((y) => y.hours > 0).length >= 2));

const percentChange = (current: number, previous: number) =>
  previous > 0 ? Math.round(((current - previous) / previous) * 100) : null;

const formatHoursValue = (seconds: number) => `${Math.round(seconds / 3600).toLocaleString()}h`;

const comparedWith = (previous: PreviousPeriod) => {
  if (previous.kind === "rolling") return "in the 12 months before";
  if (previous.kind === "yearToDate") return `at this point in ${previous.year}`;
  return `in ${previous.year}`;
};

const ChangeBadge = ({ change }: { change: number | null }) => {
  if (change === null) return <span className="text-xs font-semibold text-cyan">New</span>;
  if (change === 0) return <span className="text-xs font-semibold text-muted-foreground">±0%</span>;
  const up = change > 0;
  const Arrow = up ? ArrowUp : ArrowDown;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-semibold ${up ? "text-green" : "text-pink"}`}>
      <Arrow className="w-3 h-3" />
      {Math.abs(change).toLocaleString()}%
    </span>
  );
};

export const ThroughTheYears = ({ history, current, highlightYear, isGroup }: ThroughTheYearsProps) => {
  const { previous, yearly, firstSession } = history;
  const showYearly = yearly.filter((y) => y.hours > 0).length >= 2;
  const watchChange = previous ? percentChange(current.watchTime, previous.watchTime) : null;

  const tiles = previous
    ? [
        { label: "Watch time", current: formatHoursValue(current.watchTime), previous: formatHoursValue(previous.watchTime), change: watchChange },
        { label: "Movies", current: current.movies.toLocaleString(), previous: previous.movies.toLocaleString(), change: percentChange(current.movies, previous.movies) },
        { label: "TV Shows", current: current.shows.toLocaleString(), previous: previous.shows.toLocaleString(), change: percentChange(current.shows, previous.shows) },
        { label: "Episodes", current: current.episodes.toLocaleString(), previous: previous.episodes.toLocaleString(), change: percentChange(current.episodes, previous.episodes) },
      ]
    : [];

  const yearsAgo = firstSession ? new Date().getFullYear() - firstSession.year : 0;
  const yearsAgoText = yearsAgo <= 0 ? "this year" : yearsAgo === 1 ? "1 year ago" : `${yearsAgo} years ago`;

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <motion.div
          initial={{ rotate: -10, scale: 0 }}
          whileInView={{ rotate: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gradient-to-br from-purple/30 to-pink/30 mb-4"
        >
          <History className="w-7 h-7 text-purple" />
        </motion.div>
        <h2 className="text-3xl font-bold gradient-text">Through the Years</h2>
      </div>

      {previous && watchChange !== null && (
        <StatCard className="text-center">
          <p className="text-xl md:text-2xl font-bold text-foreground mb-1">
            {isGroup ? "The server watched" : "You watched"}{" "}
            {Math.abs(watchChange) < 5 ? (
              <>about as much as {comparedWith(previous)}</>
            ) : (
              <>
                <span className="gradient-text">
                  {Math.abs(watchChange).toLocaleString()}% {watchChange > 0 ? "more" : "less"}
                </span>{" "}
                than {comparedWith(previous)}
              </>
            )}
          </p>
          {previous.kind === "yearToDate" && previous.until && (
            <p className="text-sm text-muted-foreground">Compared with January 1st – {previous.until}</p>
          )}

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6">
            {tiles.map((tile, index) => (
              <motion.div
                key={tile.label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.1 + index * 0.1 }}
                className="rounded-xl bg-muted/40 p-3"
              >
                <p className="text-xs text-muted-foreground mb-1">{tile.label}</p>
                <p className="text-2xl font-extrabold text-foreground">{tile.current}</p>
                <div className="flex items-center justify-center gap-2 mt-1">
                  <span className="text-xs text-muted-foreground">vs {tile.previous}</span>
                  <ChangeBadge change={tile.change} />
                </div>
              </motion.div>
            ))}
          </div>
        </StatCard>
      )}

      {showYearly && <YearlyTrends watchByYear={yearly} highlightYear={highlightYear} />}

      {isGroup && showYearly && <YearlyTrends watchByYear={yearly} metric="viewers" highlightYear={highlightYear} />}

      {firstSession && (
        <StatCard delay={0.2}>
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-xl bg-green/20">
              <Flag className="w-6 h-6 text-green" />
            </div>
            <div className="min-w-0">
              <p className="text-muted-foreground text-sm mb-1">
                {isGroup ? "The server's first recorded session" : "Where it all began"}
              </p>
              <p className="text-xl font-bold text-foreground">{firstSession.title}</p>
              <p className="text-sm text-muted-foreground">
                {firstSession.date} · {yearsAgoText}
              </p>
            </div>
          </div>
        </StatCard>
      )}
    </div>
  );
};
