import { motion } from "framer-motion";
import { Trophy, Medal, Award } from "lucide-react";
import { StatCard } from "./StatCard";
import { formatDuration, formatHours } from "@/lib/tautulli";
import type { LeaderboardEntry } from "@/types/api";

interface LeaderboardProps {
  userStats: LeaderboardEntry[];
}

export const Leaderboard = ({ userStats }: LeaderboardProps) => {
  const sortedUsers = [...userStats].sort((a, b) => b.totalWatchTime - a.totalWatchTime);
  const maxTime = sortedUsers[0]?.totalWatchTime || 1;

  const getRankIcon = (index: number) => {
    switch (index) {
      case 0:
        return <Trophy className="w-6 h-6 text-yellow" />;
      case 1:
        return <Medal className="w-6 h-6 text-muted-foreground" />;
      case 2:
        return <Award className="w-6 h-6 text-orange" />;
      default:
        return <span className="w-6 h-6 flex items-center justify-center text-muted-foreground font-bold">{index + 1}</span>;
    }
  };

  const getBarColor = (index: number) => {
    switch (index) {
      case 0:
        return "from-yellow to-orange";
      case 1:
        return "from-muted-foreground to-foreground/50";
      case 2:
        return "from-orange to-pink";
      default:
        return "from-cyan to-purple";
    }
  };

  if (sortedUsers.length <= 1) return null;

  return (
    <StatCard className="py-8">
      <div className="text-center mb-8">
        <motion.div
          initial={{ y: -10, opacity: 0 }}
          whileInView={{ y: 0, opacity: 1 }}
          viewport={{ once: true }}
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-yellow/20 mb-4"
        >
          <Trophy className="w-7 h-7 text-yellow" />
        </motion.div>
        <h2 className="text-3xl font-bold gradient-text">Leaderboard</h2>
        <p className="text-muted-foreground mt-2">Who watched the most?</p>
      </div>

      <div className="space-y-4 max-w-2xl mx-auto">
        {sortedUsers.slice(0, 10).map((user, index) => (
          <motion.div
            key={user.userId}
            initial={{ x: -20, opacity: 0 }}
            whileInView={{ x: 0, opacity: 1 }}
            viewport={{ once: true }}
            transition={{ delay: index * 0.1 }}
            className="flex items-center gap-4"
          >
            <div className="w-10 flex items-center justify-center">
              {getRankIcon(index)}
            </div>
            
            <div className="flex-1">
              <div className="flex items-center justify-between mb-1">
                <span className="font-semibold text-foreground truncate max-w-[150px] md:max-w-none">
                  {user.friendlyName || user.username}
                </span>
                <span className="text-sm text-muted-foreground ml-2 whitespace-nowrap">
                  {formatDuration(user.totalWatchTime)}
                </span>
              </div>
              
              <div className="h-3 bg-secondary rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  whileInView={{ width: `${(user.totalWatchTime / maxTime) * 100}%` }}
                  viewport={{ once: true }}
                  transition={{ delay: 0.3 + index * 0.1, duration: 0.6 }}
                  className={`h-full rounded-full bg-gradient-to-r ${getBarColor(index)}`}
                />
              </div>
            </div>
          </motion.div>
        ))}
      </div>

      <motion.div
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.5 }}
        className="mt-8 pt-6 border-t border-border text-center"
      >
        <p className="text-muted-foreground">
          Combined watch time: <span className="text-primary font-bold">{formatHours(sortedUsers.reduce((sum, u) => sum + u.totalWatchTime, 0))} hours</span>
        </p>
      </motion.div>
    </StatCard>
  );
};
