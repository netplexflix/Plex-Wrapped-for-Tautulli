import { StatCard } from "./StatCard";
import { getRelatableFacts } from "@/lib/relatable";
import type { YearSelection } from "@/components/YearSelector";
import type { WrappedStats } from "@/types/tautulli";

interface RelatableNumbersProps {
  stats: Pick<WrappedStats, "totalWatchTime" | "movieWatchTime" | "topShow">;
  selection: YearSelection;
  isGroup: boolean;
}

export const RelatableNumbers = ({ stats, selection, isGroup }: RelatableNumbersProps) => {
  const facts = getRelatableFacts({ stats, selection, isGroup });
  if (facts.length === 0) return null;

  return (
    <div className="space-y-4">
      <p className="text-center text-sm font-medium text-primary tracking-wider uppercase">Picture this</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {facts.map((fact, index) => (
          <StatCard key={fact.label} delay={0.1 + index * 0.1}>
            <div className="flex items-center gap-4">
              <div className="text-4xl shrink-0" aria-hidden>
                {fact.emoji}
              </div>
              <div className="min-w-0">
                <p className="text-2xl md:text-3xl font-extrabold gradient-text break-words">{fact.value}</p>
                <p className="text-sm text-muted-foreground">{fact.label}</p>
              </div>
            </div>
          </StatCard>
        ))}
      </div>
    </div>
  );
};
