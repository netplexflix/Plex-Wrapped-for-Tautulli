import { motion } from "framer-motion";
import { Sparkles } from "lucide-react";
import { TopMediaReveal } from "./TopMediaReveal";
import { getImageUrl } from "@/lib/tautulli";

interface TopMediaProps {
  topMovie: { title: string; year: number; watchCount: number; totalTime: number; thumb?: string; userCount?: number } | null;
  topShow: { title: string; watchCount: number; totalTime: number; episodeCount: number; thumb?: string; userCount?: number } | null;
  skipAnimations?: boolean;
}

export const TopMedia = ({ topMovie, topShow, skipAnimations = false }: TopMediaProps) => {
  return (
    <div className="space-y-8">
      <div className="text-center mb-8">
        <motion.div
          initial={{ rotate: -10, scale: 0 }}
          whileInView={{ rotate: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ type: "spring", stiffness: 200 }}
          className="inline-flex items-center justify-center w-14 h-14 rounded-2xl gradient-bg mb-4"
        >
          <Sparkles className="w-7 h-7 text-primary" />
        </motion.div>
        <h2 className="text-3xl font-bold gradient-text">Your Top Picks</h2>
        <p className="text-muted-foreground mt-2">Tap to reveal your favorites</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {topMovie && (
          <TopMediaReveal
            type="movie"
            title={topMovie.title}
            subtitle={`${topMovie.year}`}
            watchTime={topMovie.totalTime}
            playCount={topMovie.watchCount}
            userCount={topMovie.userCount}
            imageUrl={topMovie.thumb ? getImageUrl(topMovie.thumb) : undefined}
            skipAnimations={skipAnimations}
          />
        )}

        {topShow && (
          <TopMediaReveal
            type="show"
            title={topShow.title}
            subtitle={`${topShow.episodeCount} episodes watched`}
            watchTime={topShow.totalTime}
            playCount={topShow.watchCount}
            userCount={topShow.userCount}
            imageUrl={topShow.thumb ? getImageUrl(topShow.thumb) : undefined}
            skipAnimations={skipAnimations}
          />
        )}
      </div>
    </div>
  );
};
