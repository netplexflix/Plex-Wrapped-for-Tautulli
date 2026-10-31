import { Sparkles } from "lucide-react";
import { TopMediaReveal } from "./TopMediaReveal";
import { SectionHeader } from "./SectionHeader";
import type { RunnerUp } from "./RunnersUp";
import { getImageUrl } from "@/lib/tautulli";
import type { WrappedStats } from "@/types/tautulli";

interface TopMediaProps {
  topMovie: WrappedStats["topMovie"];
  topShow: WrappedStats["topShow"];
  /** The top 5s: places 2–5 slide out under the #1 tiles */
  topMovies?: WrappedStats["topMovies"];
  topShows?: WrappedStats["topShows"];
  /** Everyone's report: titles are ranked by how many people watched them, so show that */
  showViewers?: boolean;
  skipAnimations?: boolean;
}

// Everything in the top 5 except #1 (the list's first entry is the top title itself)
const others = <T extends { title: string }>(list: T[], top: { title: string }) =>
  list.filter((item) => item.title !== top.title).slice(0, 4);

export const TopMedia = ({ topMovie, topShow, topMovies = [], topShows = [], showViewers = false, skipAnimations = false }: TopMediaProps) => {
  const viewers = (count: number) => (showViewers ? ` · ${count} ${count === 1 ? "viewer" : "viewers"}` : "");

  const movieRunnersUp: RunnerUp[] = topMovie
    ? others(topMovies, topMovie).map((movie) => ({
        title: movie.title,
        detail: `${movie.year}${viewers(movie.userCount)}`,
        totalTime: movie.totalTime,
        plays: movie.watchCount,
        thumb: movie.thumb,
      }))
    : [];
  const showRunnersUp: RunnerUp[] = topShow
    ? others(topShows, topShow).map((show) => ({
        title: show.title,
        detail: `${show.episodeCount} episodes${viewers(show.userCount)}`,
        totalTime: show.totalTime,
        thumb: show.thumb,
      }))
    : [];
  // The bars compare against the longest watch time in each top 5 (in everyone's report the
  // ranking is by viewers, so #1 isn't always the longest)
  const longest = (times: number[]) => Math.max(...times, 1);

  return (
    <div className="space-y-8">
      <SectionHeader icon={Sparkles} title="Your Top Picks" subtitle="Tap to reveal your favorites" />

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        {topMovie && (
          <TopMediaReveal
            type="movie"
            title={topMovie.title}
            subtitle={`${topMovie.year}`}
            watchTime={topMovie.totalTime}
            playCount={topMovie.watchCount}
            userCount={showViewers ? topMovie.userCount : undefined}
            imageUrl={topMovie.thumb ? getImageUrl(topMovie.thumb) : undefined}
            skipAnimations={skipAnimations}
            runnersUp={movieRunnersUp}
            maxTime={longest([topMovie.totalTime, ...movieRunnersUp.map((r) => r.totalTime)])}
          />
        )}

        {topShow && (
          <TopMediaReveal
            type="show"
            title={topShow.title}
            subtitle={`${topShow.episodeCount} episodes watched`}
            watchTime={topShow.totalTime}
            playCount={topShow.watchCount}
            userCount={showViewers ? topShow.userCount : undefined}
            imageUrl={topShow.thumb ? getImageUrl(topShow.thumb) : undefined}
            skipAnimations={skipAnimations}
            runnersUp={showRunnersUp}
            maxTime={longest([topShow.totalTime, ...showRunnersUp.map((r) => r.totalTime)])}
          />
        )}
      </div>
    </div>
  );
};
