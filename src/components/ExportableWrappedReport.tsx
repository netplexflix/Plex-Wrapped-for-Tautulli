// src/components/ExportableWrappedReport.tsx

import { useEffect } from "react";
import { TautulliUser, WrappedStats, StreamingLocation } from "@/types/tautulli";
import { YearSelection, getDisplayYear, getYearsCount } from "./YearSelector";
import { formatHours } from "@/lib/tautulli";
import { Clock, Film, Tv, Play, Calendar, Flame, Moon, Star, Clapperboard, Users, Smartphone, Trophy, Sparkles, CalendarDays, Sunrise, Globe, MapPin } from "lucide-react";
import { getServerAdminSettings } from "@/lib/serverConfig";
import { generateLocationInsight } from "@/lib/geolocation";

// Format duration as "Xh Ym" for readability
const formatDurationHM = (seconds: number): string => {
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h`;
  return `${mins}m`;
};

// Reorder days to start with Monday
const reorderDaysFromMonday = (watchByDay: { day: string; hours: number }[]) => {
  const dayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  return dayOrder.map(dayName => 
    watchByDay.find(d => d.day === dayName) || { day: dayName, hours: 0 }
  );
};

// Flag emoji helper
const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

interface ExportableWrappedReportProps {
  user: TautulliUser;
  stats: WrappedStats;
  yearSelection: YearSelection;
  geoLocations?: StreamingLocation[];
  onReady?: () => void;
}

// Fully self-contained export component with inline styles
// No framer-motion, no CSS variables - everything inline for html2canvas compatibility
export const ExportableWrappedReport = ({
  user,
  stats,
  yearSelection,
  geoLocations = [],
  onReady,
}: ExportableWrappedReportProps) => {
  const displayName = user.friendly_name || user.username;
  const displayYear = getDisplayYear(yearSelection);
  const adminSettings = getServerAdminSettings();
  const title = adminSettings.useCustomTitle && adminSettings.customTitle 
    ? adminSettings.customTitle 
    : 'Plex Wrapped';
  const isAllTime = yearSelection.type === 'alltime';
  const yearsCount = getYearsCount();

  const hours = formatHours(stats.totalWatchTime);
  const days = Math.floor(hours / 24);

  // Reorder watch by day to start with Monday - INSIDE the component
  const orderedWatchByDay = reorderDaysFromMonday(stats.watchByDay);

  // Signal ready after a delay to ensure rendering
  useEffect(() => {
    const timer = setTimeout(() => {
      onReady?.();
    }, 300);
    return () => clearTimeout(timer);
  }, [onReady]);

  // Color constants
  const colors = {
    bg: '#0a0a0f',
    card: '#0f0f14',
    text: '#fafafa',
    textMuted: '#71717a',
    cyan: '#00d4aa',
    purple: '#a855f7',
    pink: '#ec4899',
    orange: '#f97316',
    yellow: '#eab308',
    green: '#22c55e',
    blue: '#3b82f6',
  };

  const cardStyle: React.CSSProperties = {
    backgroundColor: colors.card,
    borderRadius: '16px',
    padding: '24px',
    border: '1px solid rgba(255,255,255,0.1)',
  };

  if (!stats || stats.totalWatchTime === 0) {
    return (
      <div style={{ backgroundColor: colors.bg, color: colors.text, width: '800px', padding: '32px', textAlign: 'center' }}>
        <p>No watch history found for this user.</p>
      </div>
    );
  }

  // Geolocation data processing
  const showGeolocation = adminSettings.enableGeolocation && geoLocations.length > 0;

  return (
    <div
      className="export-report"
      style={{
        backgroundColor: colors.bg,
        color: colors.text,
        width: '800px',
        fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        position: 'relative',
      }}
    >
      {/* Hero Section */}
      <section
        style={{
          minHeight: '350px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '48px 32px',
          background: `linear-gradient(135deg, rgba(139, 92, 246, 0.15) 0%, rgba(236, 72, 153, 0.1) 50%, rgba(6, 182, 212, 0.08) 100%)`,
        }}
      >
        <div style={{ textAlign: 'center', paddingBottom: '24px' }}>
          <div style={{ fontSize: '14px', fontWeight: 500, color: colors.purple, marginBottom: '16px', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {displayName}'s
          </div>
          <h1 style={{ fontSize: '72px', fontWeight: 800, marginBottom: '16px', lineHeight: 1, color: colors.cyan }}>
            {displayYear}
          </h1>
          <h2 style={{ fontSize: '36px', fontWeight: 700, color: colors.text, marginBottom: '8px' }}>
            {title}
          </h2>
          <p style={{ fontSize: '24px', fontWeight: 700, color: colors.pink }}>
            {hours} hours watched
          </p>
          <p style={{ fontSize: '16px', color: colors.textMuted, marginTop: '8px' }}>
            Let's see what you've been watching
          </p>
        </div>
      </section>

      {/* Content */}
      <div style={{ padding: '32px', display: 'flex', flexDirection: 'column', gap: '32px' }}>
        
        {/* Total Watch Time */}
        <div style={{ textAlign: 'center', padding: '32px 24px' }}>
          <div style={{
            width: '64px',
            height: '64px',
            borderRadius: '16px',
            background: `${colors.cyan}22`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            margin: '0 auto 16px',
          }}>
            <Clock size={32} color={colors.cyan} />
          </div>
          <p style={{ color: colors.textMuted, fontSize: '16px', marginBottom: '8px' }}>
            {isAllTime && yearsCount > 1 ? `The past ${yearsCount} years you watched` : 'This year you watched'}
          </p>
          <div style={{ fontSize: '64px', fontWeight: 800, lineHeight: 1, color: colors.cyan }}>
            {hours}h
          </div>
          {days > 0 && (
            <p style={{ fontSize: '18px', color: colors.textMuted, marginTop: '12px' }}>
              That's <span style={{ color: colors.cyan, fontWeight: 600 }}>{days} days</span> of entertainment!
            </p>
          )}
        </div>
        
        {/* Stats Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: `${colors.pink}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Film size={24} color={colors.pink} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '14px', margin: 0 }}>Movies</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalMovies}</p>
              </div>
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: `${colors.cyan}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Tv size={24} color={colors.cyan} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '14px', margin: 0 }}>TV Shows</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalShows}</p>
              </div>
            </div>
          </div>
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{ padding: '12px', borderRadius: '12px', backgroundColor: `${colors.purple}33`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Play size={24} color={colors.purple} />
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                <p style={{ color: colors.textMuted, fontSize: '14px', margin: 0 }}>Episodes</p>
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalEpisodes}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Top Movie & Show */}
        {(stats.topMovie || stats.topShow) && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {stats.topMovie && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Film size={20} color={colors.pink} />
                  <span style={{ fontSize: '14px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Movie</span>
                </div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '8px' }}>
                  {stats.topMovie.title}
                </h3>
                <p style={{ fontSize: '16px', color: colors.cyan }}>
                  Watched {stats.topMovie.watchCount} time{stats.topMovie.watchCount !== 1 ? 's' : ''}
                </p>
              </div>
            )}
            {stats.topShow && (
              <div style={cardStyle}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                  <Tv size={20} color={colors.cyan} />
                  <span style={{ fontSize: '14px', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Top Show</span>
                </div>
                <h3 style={{ fontSize: '24px', fontWeight: 700, color: colors.text, marginBottom: '8px' }}>
                  {stats.topShow.title}
                </h3>
                <p style={{ fontSize: '16px', color: colors.pink }}>
                  {stats.topShow.episodeCount} episode{stats.topShow.episodeCount !== 1 ? 's' : ''} watched
                </p>
              </div>
            )}
          </div>
        )}

        {/* Top Movies List */}
        {stats.topMovies.length > 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Trophy size={20} color={colors.yellow} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Top Movies</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.topMovies.slice(0, 5).map((movie, i) => (
                <div key={movie.title} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: colors.purple, width: '30px' }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '16px', color: colors.text }}>{movie.title}</span>
                  <span style={{ fontSize: '14px', color: colors.textMuted }}>{movie.watchCount} plays</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Top Shows List */}
        {stats.topShows.length > 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Trophy size={20} color={colors.cyan} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Top Shows</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.topShows.slice(0, 5).map((show, i) => (
                <div key={show.title} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '20px', fontWeight: 700, color: colors.cyan, width: '30px' }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '16px', color: colors.text }}>{show.title}</span>
                  <span style={{ fontSize: '14px', color: colors.textMuted }}>{show.episodeCount} eps</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Monthly Trends Bar Chart */}
        {stats.watchByMonth.some(m => m.hours > 0) && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
              <Calendar size={20} color={colors.purple} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Monthly Trends</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', height: '160px', gap: '4px' }}>
              {stats.watchByMonth.map((month) => {
                const maxHours = Math.max(...stats.watchByMonth.map(m => m.hours), 1);
                const heightPct = maxHours > 0 ? (month.hours / maxHours) * 100 : 0;
                const barHeight = month.hours > 0 ? Math.max(heightPct, 5) : 2;
                return (
                  <div key={month.month} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%' }}>
                    <span style={{ fontSize: '9px', color: colors.textMuted, marginBottom: '4px', fontWeight: 500 }}>
                      {month.hours.toFixed(1)}h
                    </span>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${barHeight}%`,
                          background: `linear-gradient(180deg, ${colors.cyan} 0%, ${colors.purple} 100%)`,
                          borderRadius: '4px 4px 0 0',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '6px' }}>
                      {month.month.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Watch by Day */}
        {orderedWatchByDay.some(d => d.hours > 0) && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Flame size={20} color={colors.orange} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Watch by Day</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {orderedWatchByDay.map((day) => {
                const maxHours = Math.max(...orderedWatchByDay.map(d => d.hours));
                const width = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
                return (
                  <div key={day.day} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <span style={{ width: '80px', fontSize: '14px', color: colors.textMuted }}>{day.day}</span>
                    <div style={{ flex: 1, height: '24px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '6px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${width}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${colors.orange} 0%, ${colors.pink} 100%)`,
                          borderRadius: '6px',
                        }}
                      />
                    </div>
                    <span style={{ width: '50px', fontSize: '14px', color: colors.text, textAlign: 'right' }}>{day.hours.toFixed(0)}h</span>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* When You Watch - Heatmap style */}
        {stats.watchByHour && stats.watchByHour.some(h => h.minutes > 0) && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Clock size={20} color={colors.cyan} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>When You Watch</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
              {stats.watchByHour.map((hourData) => {
                const maxMinutes = Math.max(...stats.watchByHour.map(h => h.minutes), 1);
                const intensity = hourData.minutes / maxMinutes;
                const bgColor = intensity > 0 
                  ? `rgba(0, 212, 170, ${Math.max(intensity * 0.8, 0.1)})` 
                  : 'rgba(255,255,255,0.03)';
                const hour = hourData.hour;
                const label = hour === 0 ? '12a' : hour === 12 ? '12p' : hour > 12 ? `${hour-12}p` : `${hour}a`;
                return (
                  <div 
                    key={hourData.hour} 
                    style={{ 
                      backgroundColor: bgColor,
                      borderRadius: '4px',
                      padding: '8px 4px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '10px', color: colors.textMuted }}>{label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '12px' }}>
              <span style={{ fontSize: '11px', color: colors.textMuted }}>Less active</span>
              <span style={{ fontSize: '11px', color: colors.textMuted }}>More active</span>
            </div>
          </div>
        )}

        {/* Fun Facts */}
        <div style={cardStyle}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <Sparkles size={20} color={colors.yellow} />
            <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Fun Facts</span>
          </div>
          
          {/* Streaming Personality */}
          {(() => {
            const getPersonality = () => {
              const totalTime = (stats.morningWatchTime || 0) + (stats.afternoonWatchTime || 0) + (stats.eveningWatchTime || 0) + (stats.nightWatchTime || 0);
              if (totalTime === 0) return { label: "Balanced Viewer", color: colors.cyan, description: "You stream whenever inspiration strikes!" };
              
              const morningPct = (stats.morningWatchTime || 0) / totalTime;
              const eveningPct = (stats.eveningWatchTime || 0) / totalTime;
              const nightPct = (stats.nightWatchTime || 0) / totalTime;
              const avgSessionMin = (stats.avgSessionLength || 0) / 60;
              const avgDailyHours = stats.avgDailyWatchTime / 3600;
              
              if (avgSessionMin > 90) return { label: "Binge Master", color: colors.pink, description: "You don't start what you can't finish!" };
              if (avgDailyHours > 4) return { label: "Marathon Runner", color: colors.orange, description: "Streaming is your cardio!" };
              if (nightPct > 0.35) return { label: "Night Owl", color: colors.purple, description: "The night is dark and full of episodes!" };
              if (morningPct > 0.35) return { label: "Early Bird", color: colors.yellow, description: "Up and streaming with the sun!" };
              if (stats.weekendPercentage > 60) return { label: "Weekend Warrior", color: colors.orange, description: "Weekends are sacred streaming time!" };
              if (eveningPct > 0.45) return { label: "Prime Time Viewer", color: colors.orange, description: "Peak hours, peak entertainment!" };
              return { label: "Balanced Viewer", color: colors.cyan, description: "You've got perfectly balanced taste!" };
            };
            const personality = getPersonality();
            return (
              <div style={{ textAlign: 'center', padding: '20px', marginBottom: '20px', background: `linear-gradient(135deg, ${personality.color}22 0%, transparent 100%)`, borderRadius: '12px' }}>
                <p style={{ fontSize: '14px', color: colors.textMuted, marginBottom: '4px' }}>Your streaming personality is</p>
                <p style={{ fontSize: '32px', fontWeight: 800, color: personality.color, marginBottom: '4px' }}>{personality.label}</p>
                <p style={{ fontSize: '14px', color: colors.textMuted }}>{personality.description}</p>
              </div>
            );
          })()}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {stats.earlyBirdSessions > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Sunrise size={24} color={colors.yellow} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{stats.earlyBirdSessions}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Early bird sessions (5-8am)</p>
              </div>
            )}
            {stats.lateNightSessions > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Moon size={24} color={colors.purple} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{stats.lateNightSessions}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Night owl sessions (12-5am)</p>
              </div>
            )}
            {stats.mostBingedDay && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Flame size={24} color={colors.green} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '24px', fontWeight: 700, color: colors.text, margin: 0 }}>{formatDurationHM(stats.mostBingedDay.duration)}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Most epic day ({stats.mostBingedDay.date})</p>
              </div>
            )}
            {stats.uniqueTitles > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Star size={24} color={colors.yellow} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{stats.uniqueTitles}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Unique titles</p>
              </div>
            )}
            {stats.longestStreak > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Flame size={24} color={colors.orange} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{stats.longestStreak}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Day streak</p>
              </div>
            )}
            {stats.weekendPercentage > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Calendar size={24} color={colors.cyan} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{Math.round(stats.weekendPercentage)}%</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Weekend watching</p>
              </div>
            )}
            {stats.avgDailyWatchTime > 0 && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <Clock size={24} color={colors.cyan} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '28px', fontWeight: 700, color: colors.text, margin: 0 }}>{formatDurationHM(stats.avgDailyWatchTime)}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Daily average</p>
              </div>
            )}
            {stats.mostActiveDay && (
              <div style={{ padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center' }}>
                <CalendarDays size={24} color={colors.pink} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '24px', fontWeight: 700, color: colors.text, margin: 0 }}>{stats.mostActiveDay.day}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Power day ({stats.mostActiveDay.hours}h)</p>
              </div>
            )}
          </div>
        </div>

        {/* Geolocation Section */}
        {showGeolocation && (() => {
          // Aggregate locations by city+country to avoid duplicates
          const locationMap = new Map<
            string,
            {
              city: string;
              region: string;
              country: string;
              countryCode: string;
              lat: number;
              lon: number;
              sessionCount: number;
            }
          >();
        
          geoLocations.forEach((loc) => {
            const key = `${loc.city}-${loc.country}`;
            const existing = locationMap.get(key);
            if (existing) {
              existing.sessionCount += loc.sessionCount;
            } else {
              locationMap.set(key, {
                city: loc.city,
                region: loc.region,
                country: loc.country,
                countryCode: loc.countryCode,
                lat: loc.lat,
                lon: loc.lon,
                sessionCount: loc.sessionCount,
              });
            }
          });
        
          const aggregatedLocations = Array.from(locationMap.values());
          const countries = [...new Set(aggregatedLocations.map(l => l.country))];
          const cities = [...new Set(aggregatedLocations.map(l => l.city).filter(c => c !== 'Unknown'))];
          const totalSessions = aggregatedLocations.reduce((sum, l) => sum + l.sessionCount, 0);
          const sortedLocations = [...aggregatedLocations].sort((a, b) => b.sessionCount - a.sessionCount);
          const topLocations = sortedLocations.slice(0, 5);
          const insight = generateLocationInsight(aggregatedLocations);
        
          return (
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
                <Globe size={20} color={colors.cyan} />
                <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Streaming Globe</span>
              </div>
              
              {/* Insight */}
              <p style={{ 
                fontSize: '16px', 
                fontWeight: 600, 
                textAlign: 'center', 
                marginBottom: '24px',
                color: colors.cyan,
              }}>
                {insight}
              </p>
        
              {/* Globe Image */}
              <div style={{ 
                display: 'flex',
                justifyContent: 'center',
                alignItems: 'center',
                marginBottom: '24px',
              }}>
                <img 
                  src="/globe.png" 
                  alt="Streaming Globe"
                  style={{
                    width: '180px',
                    height: '180px',
                    objectFit: 'contain',
                  }}
                  crossOrigin="anonymous"
                />
              </div>
        
              {/* Stats Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '24px' }}>
                <div style={{ textAlign: 'center', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                  <p style={{ fontSize: '28px', fontWeight: 700, color: colors.cyan, margin: 0 }}>{countries.length}</p>
                  <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{countries.length === 1 ? 'Country' : 'Countries'}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                  <p style={{ fontSize: '28px', fontWeight: 700, color: colors.pink, margin: 0 }}>{cities.length}</p>
                  <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{cities.length === 1 ? 'City' : 'Cities'}</p>
                </div>
                <div style={{ textAlign: 'center', padding: '16px', backgroundColor: 'rgba(255,255,255,0.03)', borderRadius: '12px' }}>
                  <p style={{ fontSize: '28px', fontWeight: 700, color: colors.purple, margin: 0 }}>{totalSessions}</p>
                  <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>Sessions</p>
                </div>
              </div>
        
              {/* Top Locations */}
              {topLocations.length > 0 && (
                <>
                  <h4 style={{ fontSize: '14px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px' }}>
                    Top Streaming Spots
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {topLocations.map((loc, i) => (
                      <div 
                        key={`${loc.city}-${loc.country}`} 
                        style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '12px', 
                          padding: '12px 16px', 
                          backgroundColor: i === 0 ? `${colors.cyan}15` : 'rgba(255,255,255,0.03)', 
                          borderRadius: '12px',
                          border: i === 0 ? `1px solid ${colors.cyan}40` : 'none',
                        }}
                      >
                        <div style={{ 
                          width: '28px', 
                          height: '28px', 
                          borderRadius: '50%', 
                          background: `linear-gradient(135deg, ${colors.cyan}40, ${colors.purple}40)`,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}>
                          <span style={{
                            fontSize: '12px',
                            fontWeight: 700,
                            color: colors.text,
                            lineHeight: 1,
                            marginTop: '-15px', // FORCE LIFT
                          }}>
                            {i + 1}
                          </span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: '14px', fontWeight: 600, color: colors.text, margin: 0 }}>
                            {loc.city !== "Unknown" ? loc.city : loc.region || loc.country}
                          </p>
                          <p style={{ fontSize: '11px', color: colors.textMuted, margin: 0 }}>
                            {loc.city !== "Unknown" && loc.country !== loc.city ? `${loc.country} ` : ''}
                            {getFlagEmoji(loc.countryCode)}
                          </p>
                        </div>
                        <div style={{ 
                          display: 'flex', 
                          alignItems: 'center', 
                          gap: '6px', 
                          flexShrink: 0,
                        }}>
                          <MapPin size={14} color={colors.textMuted} />
                          <span style={{ 
                            fontSize: '13px', 
                            fontWeight: 500, 
                            color: colors.text,
                            lineHeight: 1,
                            marginTop: '-15px', // FORCE LIFT
                          }}>
                            {loc.sessionCount} streams
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* Genres with bar chart */}
        {stats.topGenres.length > 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Clapperboard size={20} color={colors.pink} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Your Genres</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.topGenres.slice(0, 6).map((genre) => {
                const maxTime = Math.max(...stats.topGenres.map(g => g.watchTime), 1);
                const widthPct = (genre.watchTime / maxTime) * 100;
                const genreEmojis: Record<string, string> = {
                  'Action': '💥', 'Adventure': '🗺️', 'Animation': '🎬', 'Comedy': '😂',
                  'Crime': '🔍', 'Documentary': '📹', 'Drama': '🎭', 'Family': '👨‍👩‍👧‍👦',
                  'Fantasy': '🧙', 'Horror': '👻', 'Mystery': '🕵️', 'Romance': '💕',
                  'Sci-Fi': '🚀', 'Science Fiction': '🚀', 'Thriller': '😱', 'War': '⚔️',
                  'Western': '🤠', 'Music': '🎵', 'History': '📜', 'Sport': '⚽', 'Biography': '📖',
                };
                const emoji = genreEmojis[genre.genre] || '🎬';
                const watchHours = Math.round(genre.watchTime / 3600);
                return (
                  <div key={genre.genre} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '14px', fontWeight: 500, color: colors.text }}>
                        {emoji} {genre.genre}
                      </span>
                      <span style={{ fontSize: '12px', color: colors.textMuted }}>
                        {watchHours}h • {genre.count} titles
                      </span>
                    </div>
                    <div style={{ height: '8px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${widthPct}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${colors.purple} 0%, ${colors.pink} 100%)`,
                          borderRadius: '4px',
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actors */}
        {stats.topActors.length > 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Users size={20} color={colors.blue} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Top Actors</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {stats.topActors.slice(0, 5).map((actor, i) => (
                <div key={actor.name} style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <span style={{ fontSize: '18px', fontWeight: 700, color: colors.blue, width: '30px' }}>#{i + 1}</span>
                  <span style={{ flex: 1, fontSize: '16px', color: colors.text }}>{actor.name}</span>
                  <span style={{ fontSize: '14px', color: colors.textMuted }}>{actor.titleCount} title{actor.titleCount !== 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Platforms */}
        {stats.platforms.length > 0 && (
          <div style={cardStyle}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Smartphone size={20} color={colors.green} />
              <span style={{ fontSize: '18px', fontWeight: 600, color: colors.text }}>Platforms</span>
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px' }}>
              {stats.platforms.slice(0, 6).map((platform, i) => (
                <div
                  key={platform.name}
                  style={{
                    padding: '12px 20px',
                    borderRadius: '12px',
                    backgroundColor: i === 0 ? `${colors.green}22` : 'rgba(255,255,255,0.05)',
                    border: i === 0 ? `1px solid ${colors.green}` : '1px solid rgba(255,255,255,0.1)',
                  }}
                >
                  <p style={{ fontSize: '14px', fontWeight: 600, color: colors.text, margin: 0 }}>{platform.name}</p>
                  <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>{platform.count} plays</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Footer */}
        <footer style={{ textAlign: 'center', padding: '24px 0', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize: '14px', color: 'rgba(148, 163, 184, 0.5)', margin: 0 }}>Powered by Tautulli</p>
        </footer>
      </div>
    </div>
  );
};

ExportableWrappedReport.displayName = 'ExportableWrappedReport';