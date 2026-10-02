import { motion } from "framer-motion";
import { TrendingUp, Users } from "lucide-react";
import { StatCard } from "./StatCard";

type YearlyMetric = "hours" | "viewers";

interface YearlyTrendsProps {
  watchByYear: { year: number; hours: number; viewers?: number }[];
  /** "hours": watch time per year; "viewers": people who watched something that year */
  metric?: YearlyMetric;
  /** The year to highlight (the report's year); the peak year is highlighted when not given */
  highlightYear?: number;
}

const METRICS: Record<
  YearlyMetric,
  { title: string; icon: typeof TrendingUp; iconTone: string; bar: string; format: (value: number) => string; peak: (value: number) => string }
> = {
  hours: {
    title: "Yearly Activity",
    icon: TrendingUp,
    iconTone: "bg-blue/20 text-blue",
    bar: "bg-gradient-to-t from-cyan/60 to-cyan",
    format: (value) => `${Math.round(value)}h`,
    peak: (value) => `${Math.round(value)}h`,
  },
  viewers: {
    title: "Active Viewers",
    icon: Users,
    iconTone: "bg-purple/20 text-purple",
    bar: "bg-gradient-to-t from-purple/60 to-purple",
    format: (value) => value.toLocaleString(),
    peak: (value) => `${value.toLocaleString()} ${value === 1 ? "viewer" : "viewers"}`,
  },
};

export const YearlyTrends = ({ watchByYear, metric = "hours", highlightYear }: YearlyTrendsProps) => {
  const config = METRICS[metric];
  const valueOf = (y: { hours: number; viewers?: number }) => (metric === "viewers" ? y.viewers ?? 0 : y.hours);
  const maxValue = Math.max(...watchByYear.map(valueOf), 1);
  const minVisibleHeight = 3;
  const peakYear = [...watchByYear].sort((a, b) => valueOf(b) - valueOf(a))[0];
  const highlightedYear = highlightYear ?? peakYear?.year;
  // Newest year first, so the current year is visible without scrolling
  const years = [...watchByYear].sort((a, b) => b.year - a.year);
  const Icon = config.icon;

  return (
    <StatCard>
      <div className="flex items-center gap-3 mb-6">
        <div className={`p-2 rounded-lg ${config.iconTone}`}>
          <Icon className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-xl font-bold text-foreground">{config.title}</h3>
          {peakYear && valueOf(peakYear) > 0 && (
            <p className="text-sm text-muted-foreground">
              Peak: <span className="text-primary font-semibold">{peakYear.year}</span> with {config.peak(valueOf(peakYear))}
            </p>
          )}
        </div>
      </div>

      {/* Scroll horizontally when there are more years than fit (e.g. All Time on mobile) */}
      <div className="w-full overflow-x-auto overscroll-x-contain">
        <div
          className="flex items-end justify-between gap-2 h-48 pt-6"
          style={{ minWidth: `${years.length * 48}px` }}
        >
          {years.map((yearData, index) => {
            const value = valueOf(yearData);
            const rawHeight = maxValue > 0 ? (value / maxValue) * 100 : 0;
            const height = value > 0 ? Math.max(rawHeight, minVisibleHeight) : 6;
            const isHighlighted = yearData.year === highlightedYear;
            const valueLabel = config.format(value);

            return (
              <div key={yearData.year} className="flex-1 flex flex-col items-center h-full min-w-[40px]">
                <span className="text-[9px] text-muted-foreground mb-1 font-medium">
                  {valueLabel}
                </span>

                <div className="w-full flex-1 flex items-end">
                  <motion.div
                    initial={{ scaleY: 0 }}
                    whileInView={{ scaleY: 1 }}
                    viewport={{ once: true }}
                    transition={{ delay: index * 0.05, duration: 0.5 }}
                    style={{ height: `${height}%` }}
                    className={`w-full origin-bottom rounded-t-md transition-colors ${
                      isHighlighted ? "bg-gradient-to-t from-pink to-orange" : config.bar
                    }`}
                    title={`${yearData.year}: ${valueLabel}`}
                  />
                </div>

                <span
                  className={`text-[11px] mt-2 ${
                    highlightYear === yearData.year ? "text-foreground font-bold" : "text-muted-foreground font-medium"
                  }`}
                >
                  {yearData.year}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </StatCard>
  );
};
