import { motion } from "framer-motion";
import { Moon, CalendarDays, Flame, Sparkles, Sun, Clock, Sunrise, Zap, Heart, AlarmClock, Hourglass } from "lucide-react";
import { StatCard } from "./StatCard";
import { AnimatedNumber } from "./AnimatedNumber";
import { formatDuration } from "@/lib/tautulli";

interface FunFactsProps {
  lateNightSessions: number;
  weekendPercentage: number;
  mostActiveDay: { day: string; hours: number } | null;
  uniqueTitles: number;
  avgDailyWatchTime: number;
  mostBingedDay: { date: string; duration: number } | null;
  earlyBirdSessions: number;
  isGroup: boolean;
  peakHour: number;
  morningWatchTime: number;
  afternoonWatchTime: number;
  eveningWatchTime: number;
  nightWatchTime: number;
  totalSessions: number;
  avgSessionLength: number;
  longestBinge: { title: string; duration: number; date: string } | null;
}

type PersonalityColor = "purple" | "yellow" | "orange" | "cyan" | "pink";

const COLOR_CLASSES: Record<PersonalityColor, { bg: string; text: string }> = {
  purple: { bg: "bg-purple/20", text: "text-purple" },
  yellow: { bg: "bg-yellow/20", text: "text-yellow" },
  orange: { bg: "bg-orange/20", text: "text-orange" },
  cyan: { bg: "bg-cyan/20", text: "text-cyan" },
  pink: { bg: "bg-pink/20", text: "text-pink" },
};

const pluralizePersonality = (label: string) => {
  const map: Record<string, string> = {
    "Night Owl": "Night Owls",
    "Early Bird": "Early Birds",
    "Weekend Warrior": "Weekend Warriors",
    "Balanced Viewer": "Balanced Viewers",
    "Prime Time Viewer": "Prime Time Viewers",
    "Binge Master": "Binge Masters",
    "Marathon Runner": "Marathon Runners",
    "Content Explorer": "Content Explorers",
    "Comfort Watcher": "Comfort Watchers",
  };
  return map[label] ?? `${label}s`;
};

export const FunFacts = ({
  lateNightSessions,
  weekendPercentage,
  mostActiveDay,
  uniqueTitles,
  avgDailyWatchTime,
  mostBingedDay,
  earlyBirdSessions,
  isGroup,
  peakHour,
  morningWatchTime,
  afternoonWatchTime,
  eveningWatchTime,
  nightWatchTime,
  totalSessions,
  avgSessionLength,
  longestBinge,
}: FunFactsProps) => {
  const getPersonality = () => {
    const totalTime = morningWatchTime + afternoonWatchTime + eveningWatchTime + nightWatchTime;
    if (totalTime === 0) {
      return {
        icon: Sparkles,
        label: "Balanced Viewer",
        color: "cyan" as const,
        description: "You stream whenever inspiration strikes!",
      };
    }

    const morningPct = morningWatchTime / totalTime;
    const eveningPct = eveningWatchTime / totalTime;
    const nightPct = nightWatchTime / totalTime;
    
    // Average session in minutes
    const avgSessionMin = avgSessionLength / 60;
    // Average daily watch in hours
    const avgDailyHours = avgDailyWatchTime / 3600;

    // Binge Master: long average sessions (>90 min)
    if (avgSessionMin > 90) {
      return {
        icon: Flame,
        label: "Binge Master",
        color: "pink" as const,
        description: "You don't start what you can't finish!",
      };
    }

    // Marathon Runner: high daily average (>4 hours on active days)
    if (avgDailyHours > 4) {
      return {
        icon: Zap,
        label: "Marathon Runner",
        color: "orange" as const,
        description: "Streaming is your cardio!",
      };
    }

    // Night Owl: >35% of watch time is 10pm-5am
    if (nightPct > 0.35) {
      return {
        icon: Moon,
        label: "Night Owl",
        color: "purple" as const,
        description: "The night is dark and full of episodes!",
      };
    }

    // Early Bird: >35% of watch time is 5am-12pm
    if (morningPct > 0.35) {
      return {
        icon: Sunrise,
        label: "Early Bird",
        color: "yellow" as const,
        description: "Up and streaming with the sun!",
      };
    }

    // Weekend Warrior: >60% of sessions on weekends
    if (weekendPercentage > 60) {
      return {
        icon: CalendarDays,
        label: "Weekend Warrior",
        color: "orange" as const,
        description: "Weekends are sacred streaming time!",
      };
    }

    // Prime Time Viewer: >45% of watch time is 6pm-10pm
    if (eveningPct > 0.45) {
      return {
        icon: Sun,
        label: "Prime Time Viewer",
        color: "orange" as const,
        description: "Peak hours, peak entertainment!",
      };
    }

    // Explorer: many unique titles relative to sessions
    if (uniqueTitles > totalSessions * 0.7) {
      return {
        icon: Sparkles,
        label: "Content Explorer",
        color: "cyan" as const,
        description: "Always discovering something new!",
      };
    }

    // Comfort Watcher: few unique titles relative to sessions (rewatcher)
    if (uniqueTitles < totalSessions * 0.3 && totalSessions > 20) {
      return {
        icon: Heart,
        label: "Comfort Watcher",
        color: "pink" as const,
        description: "You know what you love!",
      };
    }

    return {
      icon: Sparkles,
      label: "Balanced Viewer",
      color: "cyan" as const,
      description: "You've got perfectly balanced taste!",
    };
  };

  const formatPeakHour = (hour: number) => {
    if (hour === 0) return "Midnight";
    if (hour === 12) return "Noon";
    return hour > 12 ? `${hour - 12} PM` : `${hour} AM`;
  };

  const personality = getPersonality();
  const tone = COLOR_CLASSES[personality.color];
  const personalityLabel = isGroup ? pluralizePersonality(personality.label) : personality.label;
  const personalityIntro = isGroup ? "Your streaming personalities are" : "Your streaming personality is";

  return (
    <div className="space-y-6">
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
        <h2 className="text-3xl font-bold gradient-text">Fun Facts</h2>
      </div>

      {/* Personality Card */}
      <StatCard className="overflow-hidden">
        <div className="relative">
          <div className="absolute inset-0 gradient-bg opacity-50" />
          <div className="relative text-center py-8">
            <motion.div
              initial={{ scale: 0, rotate: -180 }}
              whileInView={{ scale: 1, rotate: 0 }}
              viewport={{ once: true }}
              transition={{ type: "spring", stiffness: 150 }}
              className={`inline-flex items-center justify-center w-20 h-20 rounded-2xl ${tone.bg} mb-4`}
            >
              <personality.icon className={`w-10 h-10 ${tone.text}`} />
            </motion.div>
            <motion.p
              initial={{ opacity: 0, y: 10 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.2 }}
              className="text-muted-foreground mb-2"
            >
              {personalityIntro}
            </motion.p>
            <motion.h3
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ delay: 0.3 }}
              className="text-4xl font-extrabold gradient-text mb-2"
            >
              {personalityLabel}
            </motion.h3>
            <p className="text-muted-foreground">{personality.description}</p>
          </div>
        </div>
      </StatCard>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {lateNightSessions > 0 && (
          <StatCard delay={0.1}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-purple/20 animate-pulse-glow">
                <Moon className="w-6 h-6 text-purple" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Night Owl Sessions</p>
                <p className="text-3xl font-bold text-foreground">
                  <AnimatedNumber value={lateNightSessions} />
                </p>
                <p className="text-xs text-muted-foreground">Watched between midnight and 5am</p>
              </div>
            </div>
          </StatCard>
        )}

        {earlyBirdSessions > 0 && (
          <StatCard delay={0.15}>
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-xl bg-yellow/20">
                <Sunrise className="w-6 h-6 text-yellow" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm">Early Bird Sessions</p>
                <p className="text-3xl font-bold text-foreground">
                  <AnimatedNumber value={earlyBirdSessions} />
                </p>
                <p className="text-xs text-muted-foreground">Watched between 5am and 8am</p>
              </div>
            </div>
          </StatCard>
        )}

        <StatCard delay={0.2}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-orange/20">
              <CalendarDays className="w-6 h-6 text-orange" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Weekend Streaming</p>
              <p className="text-3xl font-bold text-foreground">
                <AnimatedNumber value={weekendPercentage} suffix="%" />
              </p>
              <p className="text-xs text-muted-foreground">of sessions on weekends</p>
            </div>
          </div>
        </StatCard>

        <StatCard delay={0.25}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-cyan/20">
              <Clock className="w-6 h-6 text-cyan" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Daily Average</p>
              <p className="text-3xl font-bold text-foreground">
                {formatDuration(avgDailyWatchTime)}
              </p>
              <p className="text-xs text-muted-foreground">per day when active</p>
            </div>
          </div>
        </StatCard>

        <StatCard delay={0.27}>
          <div className="flex items-center gap-4">
            <div className="p-3 rounded-xl bg-pink/20">
              <AlarmClock className="w-6 h-6 text-pink" />
            </div>
            <div>
              <p className="text-muted-foreground text-sm">Prime Time</p>
              <p className="text-3xl font-bold text-foreground">{formatPeakHour(peakHour)}</p>
              <p className="text-xs text-muted-foreground">{isGroup ? "the server's" : "your"} most-watched hour</p>
            </div>
          </div>
        </StatCard>

        {mostBingedDay && (
          <StatCard delay={0.3}>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-green/20">
                <Sun className="w-6 h-6 text-green" />
              </div>
              <div>
                <p className="text-muted-foreground text-sm mb-1">Most Epic Day</p>
                <p className="text-2xl font-bold text-foreground">{formatDuration(mostBingedDay.duration)}</p>
                <p className="text-xs text-muted-foreground">{mostBingedDay.date}</p>
              </div>
            </div>
          </StatCard>
        )}

        {longestBinge && (
          <StatCard delay={0.35}>
            <div className="flex items-start gap-4">
              <div className="p-3 rounded-xl bg-cyan/20">
                <Hourglass className="w-6 h-6 text-cyan" />
              </div>
              <div className="min-w-0">
                <p className="text-muted-foreground text-sm mb-1">Longest Session</p>
                <p className="text-2xl font-bold text-foreground">{formatDuration(longestBinge.duration)}</p>
                <p className="text-sm text-foreground line-clamp-2">{longestBinge.title}</p>
                <p className="text-xs text-muted-foreground">{longestBinge.date}</p>
              </div>
            </div>
          </StatCard>
        )}

        {mostActiveDay && (
          <StatCard delay={0.4}>
            <div className="text-center py-2">
              <p className="text-muted-foreground text-sm mb-2">Your Power Day</p>
              <p className="text-4xl font-extrabold gradient-text">{mostActiveDay.day}</p>
              <p className="text-sm text-muted-foreground mt-2">
                {mostActiveDay.hours}h total watch time
              </p>
            </div>
          </StatCard>
        )}

        <StatCard delay={0.5}>
          <div className="text-center py-2">
            <p className="text-muted-foreground text-sm mb-2">Unique Titles</p>
            <p className="text-4xl font-extrabold gradient-text">
              <AnimatedNumber value={uniqueTitles} />
            </p>
            <p className="text-sm text-muted-foreground mt-2">You're quite the explorer!</p>
          </div>
        </StatCard>
      </div>
    </div>
  );
};
