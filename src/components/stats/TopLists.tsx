import { motion } from "framer-motion";
import { Film, Clock, Star } from "lucide-react";
import { StatCard } from "./StatCard";
import { formatDuration } from "@/lib/tautulli";

interface TopListsProps {
  topMovies: { title: string; year: number; watchCount: number; totalTime: number; userCount: number }[];
  topShows: { title: string; watchCount: number; totalTime: number; episodeCount: number; userCount: number }[];
  /** Everyone's report: titles are ranked by how many people watched them, so show that */
  showViewers?: boolean;
}

export const TopLists = ({ topMovies, topShows, showViewers = false }: TopListsProps) => {
  if (!topMovies.length && !topShows.length) return null;

  const viewers = (count: number) => (showViewers ? ` · ${count} ${count === 1 ? "viewer" : "viewers"}` : "");

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      {topMovies.length > 0 && (
        <StatCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-orange/20">
              <Film className="w-5 h-5 text-orange" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Top 5 Movies</h3>
          </div>

          <div className="space-y-4">
            {topMovies.map((movie, index) => (
              <motion.div
                key={movie.title}
                initial={{ x: -20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index === 0 ? 'bg-yellow text-background' :
                  index === 1 ? 'bg-muted-foreground/50 text-foreground' :
                  index === 2 ? 'bg-orange/70 text-foreground' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{movie.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {movie.year}
                    {viewers(movie.userCount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-primary">{formatDuration(movie.totalTime)}</p>
                  {movie.watchCount > 1 && (
                    <p className="text-xs text-muted-foreground">{movie.watchCount}x plays</p>
                  )}
                </div>
              </motion.div>
            ))}
          </div>
        </StatCard>
      )}

      {topShows.length > 0 && (
        <StatCard>
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 rounded-lg bg-cyan/20">
              <Star className="w-5 h-5 text-cyan" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Top 5 TV Shows</h3>
          </div>

          <div className="space-y-4">
            {topShows.map((show, index) => (
              <motion.div
                key={show.title}
                initial={{ x: 20, opacity: 0 }}
                whileInView={{ x: 0, opacity: 1 }}
                viewport={{ once: true }}
                transition={{ delay: index * 0.1 }}
                className="flex items-center gap-4"
              >
                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm ${
                  index === 0 ? 'bg-yellow text-background' :
                  index === 1 ? 'bg-muted-foreground/50 text-foreground' :
                  index === 2 ? 'bg-orange/70 text-foreground' :
                  'bg-secondary text-muted-foreground'
                }`}>
                  {index + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-foreground truncate">{show.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {show.episodeCount} episodes
                    {viewers(show.userCount)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-medium text-primary">{formatDuration(show.totalTime)}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </StatCard>
      )}
    </div>
  );
};
