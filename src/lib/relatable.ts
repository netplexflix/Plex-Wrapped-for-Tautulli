// Turns watch time into comparisons people can picture

import { format as formatDate } from "date-fns";
import type { YearSelection } from "@/components/YearSelector";
import type { WrappedStats } from "@/types/tautulli";

export interface RelatableFact {
  emoji: string;
  value: string;
  label: string;
}

const HOUR = 3600;
const DAY = 24 * HOUR;
const MAX_FACTS = 4;

// Approximate lengths of familiar things, in the order they are offered
const EQUIVALENTS = [
  { emoji: "🧙", seconds: 12 * HOUR, label: "times through the extended Lord of the Rings trilogy" },
  { emoji: "✈️", seconds: 22 * HOUR, label: "flights from London to Sydney" },
  { emoji: "💼", seconds: 40 * HOUR, label: "full-time work weeks" },
  { emoji: "😴", seconds: 8 * HOUR, label: "full nights of sleep" },
];

// One decimal below 10 ("4.5"), whole numbers above ("1,234")
const formatCount = (n: number) => (n >= 10 ? Math.round(n) : Math.round(n * 10) / 10).toLocaleString();

interface RelatableInput {
  stats: Pick<WrappedStats, "totalWatchTime" | "movieWatchTime" | "topShow">;
  selection: YearSelection;
  isGroup: boolean;
}

export const getRelatableFacts = ({ stats, selection, isGroup }: RelatableInput): RelatableFact[] => {
  const total = stats.totalWatchTime;
  if (total <= 0) return [];
  const facts: RelatableFact[] = [];
  const now = new Date();

  // Share of the period (not for All Time)
  if (selection.type !== "alltime") {
    const year = selection.type === "year" ? selection.year : null;
    const isCurrentYear = year === now.getFullYear();
    const yearStart = year !== null ? new Date(year, 0, 1) : null;
    const periodSeconds =
      year === null || !yearStart
        ? 365 * DAY
        : ((isCurrentYear ? now.getTime() : new Date(year + 1, 0, 1).getTime()) - yearStart.getTime()) / 1000;

    const periodLabel = year === null ? "the past 12 months" : isCurrentYear ? `${year} so far` : `${year}`;

    if (total <= periodSeconds) {
      facts.push({
        emoji: "⏳",
        value: `${(Math.round((total / periodSeconds) * 1000) / 10).toLocaleString()}%`,
        label: `of ${periodLabel}, spent watching`,
      });
      if (yearStart) {
        facts.push({
          emoji: "🎆",
          value: formatDate(new Date(yearStart.getTime() + total * 1000), "MMMM do"),
          label: "is when it would all end, played back to back from New Year's Day",
        });
      }
    } else {
      // Combined stats of many viewers can add up to more time than the period has
      facts.push({
        emoji: "⏳",
        value: `${formatCount(total / (365.25 * DAY))} years`,
        label: `of nonstop playback, squeezed into ${periodLabel}`,
      });
    }
  }

  // The top show compared with the rest of the watch time
  const topShow = stats.topShow;
  if (topShow && topShow.totalTime > 0) {
    const share = topShow.totalTime / total;
    if (stats.movieWatchTime > 0 && topShow.totalTime > stats.movieWatchTime) {
      facts.push({
        emoji: "📺",
        value: topShow.title,
        label: isGroup ? "got more watch time than all movies combined" : "got more of your time than all your movies combined",
      });
    } else if (share >= 0.1) {
      facts.push({
        emoji: "📺",
        value: `${Math.round(share * 100)}%`,
        label: `of ${isGroup ? "all" : "your"} watch time went to ${topShow.title}`,
      });
    }
  }

  for (const item of EQUIVALENTS) {
    const count = total / item.seconds;
    if (count >= 1) facts.push({ emoji: item.emoji, value: formatCount(count), label: item.label });
  }

  return facts.slice(0, MAX_FACTS);
};
