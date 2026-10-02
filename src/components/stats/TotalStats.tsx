import { motion } from "framer-motion";
import { Clock, Film, Tv, Play, Medal, Users } from "lucide-react";
import { StatCard } from "./StatCard";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatHours } from "@/lib/tautulli";
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
  return <div className="space-y-6">
      <StatCard className="text-center py-12">
        <motion.div initial={{
        scale: 0
      }} whileInView={{
        scale: 1
      }} viewport={{
        once: true
      }} transition={{
        type: "spring",
        stiffness: 200,
        delay: 0.2
      }} className="inline-flex items-center justify-center w-16 h-16 rounded-2xl gradient-bg mb-6">
          <Clock className="w-8 h-8 text-primary" />
        </motion.div>
        
        <p className="text-muted-foreground text-lg mb-2">{timeframeText}</p>
        
        <div className="text-6xl md:text-8xl font-extrabold gradient-text glow-text mb-2">
          <AnimatedNumber value={hours} decimals={0} suffix="h" />
        </div>
        
        {days > 0 && <p className="text-xl text-muted-foreground">
            That's <span className="text-primary font-semibold">{days} days</span> of pure entertainment!
          </p>}

        {rank && <motion.div initial={{
        opacity: 0,
        y: 10
      }} whileInView={{
        opacity: 1,
        y: 0
      }} viewport={{
        once: true
      }} transition={{
        delay: 0.6
      }} className="mt-6 inline-flex items-center gap-2 rounded-full border border-primary/40 bg-primary/10 px-4 py-2 text-sm md:text-base text-foreground">
            <Medal className="w-5 h-5 text-yellow shrink-0" />
            {rank.position === 1 ? <span>You watched more than <span className="font-bold">anyone else</span> on this server!</span> : <span>
                You watched more than <span className="font-bold text-primary">{rank.percentile}%</span> of viewers on this server
              </span>}
          </motion.div>}
      </StatCard>

      <div className={`grid grid-cols-1 gap-4 ${activeUsers !== undefined ? "sm:grid-cols-2" : "md:grid-cols-3"}`}>
        {activeUsers !== undefined && <StatCard delay={0.05}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-orange/20">
                <Users className="w-6 h-6 text-orange" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Active Viewers</p>
                <p className="text-3xl font-bold text-foreground">
                  <AnimatedNumber value={activeUsers} />
                </p>
              </div>
            </div>
          </StatCard>}

        <StatCard delay={0.1}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-pink/20">
              <Film className="w-6 h-6 text-pink" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Movies</p>
              <p className="text-3xl font-bold text-foreground">
                <AnimatedNumber value={totalMovies} />
              </p>
            </div>
          </div>
        </StatCard>

        <StatCard delay={0.2}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-cyan/20">
              <Tv className="w-6 h-6 text-cyan" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">TV Shows</p>
              <p className="text-3xl font-bold text-foreground">
                <AnimatedNumber value={totalShows} />
              </p>
            </div>
          </div>
        </StatCard>

        <StatCard delay={0.3}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-purple/20">
              <Play className="w-6 h-6 text-purple" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Episodes</p>
              <p className="text-3xl font-bold text-foreground">
                <AnimatedNumber value={totalEpisodes} />
              </p>
            </div>
          </div>
        </StatCard>
      </div>
    </div>;
};