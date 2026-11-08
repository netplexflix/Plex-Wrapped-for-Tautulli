import { motion } from "framer-motion";
import { Clock, Film, Tv, Play, Medal, Users, type LucideIcon } from "lucide-react";
import { StatCard } from "./StatCard";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatHours } from "@/lib/tautulli";
import { EASE_OUT_EXPO, SPRING_POP, VIEWPORT } from "@/lib/motion";
import type { ViewerRank } from "@/types/api";

interface TotalStatsProps {
  totalWatchTime: number;
  totalMovies: number;
  totalShows: number;
  totalEpisodes: number;
  isAllTime?: boolean;
  yearsCount?: number;
  rank?: ViewerRank | null;
  /** Everyone's report: the number of people who watched something in the period */
  activeUsers?: number;
}

// A count with its icon; the icon tile wiggles when hovered
const CountCard = ({ icon: Icon, tone, label, value, delay }: {
  icon: LucideIcon;
  tone: { bg: string; text: string };
  label: string;
  value: number;
  delay: number;
}) => (
  <StatCard delay={delay} className="group">
    <div className="flex items-center gap-4">
      <div className={`p-3 rounded-xl ${tone.bg} transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110`}>
        <Icon className={`w-6 h-6 ${tone.text}`} />
      </div>
      <div>
        <p className="text-muted-foreground text-sm">{label}</p>
        <p className="font-display text-4xl font-extrabold tracking-tight text-foreground">
          <AnimatedNumber value={value} grouping />
        </p>
      </div>
    </div>
  </StatCard>
);

export const TotalStats = ({
  totalWatchTime,
  totalMovies,
  totalShows,
  totalEpisodes,
  isAllTime = false,
  yearsCount = 1,
  rank = null,
  activeUsers,
}: TotalStatsProps) => {
  const hours = formatHours(totalWatchTime);
  const days = Math.floor(hours / 24);

  const timeframeText = isAllTime && yearsCount > 1
    ? `The past ${yearsCount} years you watched a combined`
    : "This year you watched a combined";
  return (
    <div className="space-y-6">
      <StatCard className="relative overflow-hidden text-center py-14">
        {/* A slow halo behind the big number: a soft-edged colour wheel, its centre washed to one
            colour (as a heavy blur would leave it) */}
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 h-[205%] aspect-square -translate-x-1/2 -translate-y-1/2 rounded-full opacity-[0.12] soft-edge [--soft-from:38%] animate-spin-slow pointer-events-none"
          style={{
            background:
              "radial-gradient(closest-side, hsl(var(--purple)), transparent 25%), conic-gradient(from 0deg, hsl(var(--cyan)), hsl(var(--purple)), hsl(var(--pink)), hsl(var(--cyan)))",
          }}
        />
        <div className="relative">
          <motion.div
            initial={{ scale: 0, rotate: -20 }}
            whileInView={{ scale: 1, rotate: 0 }}
            viewport={VIEWPORT}
            transition={{ ...SPRING_POP, delay: 0.2 }}
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-bg ring-1 ring-white/10 mb-6"
          >
            <Clock className="w-8 h-8 text-primary" />
          </motion.div>

          <p className="text-muted-foreground text-lg mb-2">{timeframeText}</p>

          {/* The glow is a copy behind the number, and the number has a layer of its own: the gradient
              panning across it repaints only the number every frame, not the blurred glow */}
          <div className="relative font-display text-7xl md:text-9xl font-extrabold tracking-tighter leading-none mb-3 py-1">
            <div aria-hidden className="absolute inset-0 py-1 text-transparent glow-text">
              <AnimatedNumber value={hours} decimals={0} suffix="h" grouping />
            </div>
            <div className="relative gradient-text-animated will-change-transform">
              <AnimatedNumber value={hours} decimals={0} suffix="h" grouping />
            </div>
          </div>

          {days > 0 && (
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={VIEWPORT}
              transition={{ delay: 0.4, duration: 0.8, ease: EASE_OUT_EXPO }}
              className="text-xl text-muted-foreground"
            >
              That's <span className="text-primary font-semibold">{days} days</span> of pure entertainment!
            </motion.p>
          )}

          {rank && (
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.9 }}
              whileInView={{ opacity: 1, y: 0, scale: 1 }}
              viewport={VIEWPORT}
              transition={{ ...SPRING_POP, delay: 0.6 }}
              className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm md:text-base text-foreground"
            >
              <Medal className="w-5 h-5 text-yellow shrink-0" />
              {rank.position === 1 ? (
                <span>
                  You watched more than <span className="font-bold">anyone else</span> on this server!
                </span>
              ) : (
                <span>
                  You watched more than <span className="font-bold text-primary">{rank.percentile}%</span> of viewers on this server
                </span>
              )}
            </motion.div>
          )}
        </div>
      </StatCard>

      <div className={`grid grid-cols-1 gap-4 ${activeUsers !== undefined ? "sm:grid-cols-2" : "md:grid-cols-3"}`}>
        {activeUsers !== undefined && (
          <CountCard icon={Users} tone={{ bg: "bg-orange/20", text: "text-orange" }} label="Active Viewers" value={activeUsers} delay={0.05} />
        )}
        <CountCard icon={Film} tone={{ bg: "bg-pink/20", text: "text-pink" }} label="Movies" value={totalMovies} delay={0.1} />
        <CountCard icon={Tv} tone={{ bg: "bg-cyan/20", text: "text-cyan" }} label="TV Shows" value={totalShows} delay={0.2} />
        <CountCard icon={Play} tone={{ bg: "bg-purple/20", text: "text-purple" }} label="Episodes" value={totalEpisodes} delay={0.3} />
      </div>
    </div>
  );
};
