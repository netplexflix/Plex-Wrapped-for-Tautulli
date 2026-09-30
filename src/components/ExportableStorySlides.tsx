// src/components/ExportableStorySlides.tsx

import { useEffect, useState } from "react";
import { TautulliUser, WrappedStats, StreamingLocation } from "@/types/tautulli";
import { YearSelection, getDisplayYear, getYearsCount } from "./YearSelector";
import { formatHours, getImageUrl } from "@/lib/tautulli";
import { Clock, Film, Tv, Play, Calendar, Flame, Moon, Star, Trophy, Sparkles, Sunrise, Clapperboard, Globe, MapPin } from "lucide-react";
import { getServerAdminSettings, checkLogoExists, getLogoUrl } from "@/lib/serverConfig";
import { generateLocationInsight } from "@/lib/geolocation";

interface ExportableStorySlidesProps {
  user: TautulliUser;
  stats: WrappedStats;
  yearSelection: YearSelection;
  geoLocations?: StreamingLocation[];
  onReady?: () => void;
}

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

export const ExportableStorySlides = ({
  user,
  stats,
  yearSelection,
  geoLocations = [],
  onReady,
}: ExportableStorySlidesProps) => {
  const displayName = user.friendly_name || user.username;
  const displayYear = getDisplayYear(yearSelection);
  const isAllTime = yearSelection.type === 'alltime';
  const yearsCount = getYearsCount();
  
  // Get custom title and logo settings
  const adminSettings = getServerAdminSettings();
  const title = adminSettings.useCustomTitle && adminSettings.customTitle 
    ? adminSettings.customTitle 
    : 'Plex Wrapped';
  const titleWithYear = `${title} ${displayYear}`;

  // Logo state
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoLoaded, setLogoLoaded] = useState(false);

  const hours = formatHours(stats.totalWatchTime);
  const days = Math.floor(hours / 24);

  // Reorder watch by day to start with Monday
  const orderedWatchByDay = reorderDaysFromMonday(stats.watchByDay);

  useEffect(() => {
    const loadLogo = async () => {
      if (adminSettings.useCustomLogo) {
        const exists = await checkLogoExists();
        if (exists) {
          setLogoUrl(getLogoUrl());
        }
      }
      setLogoLoaded(true);
    };
    loadLogo();
  }, [adminSettings.useCustomLogo]);

  useEffect(() => {
    // Signal ready after component mounts and logo is checked
    if (!logoLoaded) return;
    
    const timer = setTimeout(() => {
      console.log('[ExportableStorySlides] Signaling ready');
      onReady?.();
    }, 200);
    return () => clearTimeout(timer);
  }, [onReady, logoLoaded]);

  const colors = {
    bg: '#0a0a0f',
    card: '#0f0f14',
    cardAlt: '#141419',
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

  const slideStyle: React.CSSProperties = {
    width: '540px',
    height: '960px',
    backgroundColor: colors.bg,
    color: colors.text,
    fontFamily: 'system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    boxSizing: 'border-box',
  };

  const gradientOverlay: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: `radial-gradient(ellipse at 30% 20%, ${colors.purple}15 0%, transparent 50%), radial-gradient(ellipse at 70% 80%, ${colors.cyan}10 0%, transparent 50%)`,
    pointerEvents: 'none',
  };

  const headerStyle: React.CSSProperties = {
    position: 'absolute',
    top: '20px',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '14px',
    fontWeight: 600,
    color: colors.textMuted,
    letterSpacing: '0.05em',
  };

  const footerStyle: React.CSSProperties = {
    position: 'absolute',
    bottom: '24px',
    left: 0,
    right: 0,
    textAlign: 'center',
    fontSize: '12px',
    color: 'rgba(148, 163, 184, 0.4)',
  };

  // Logo component for slides
  const LogoDisplay = ({ maxHeight = 80 }: { maxHeight?: number }) => {
    if (!adminSettings.useCustomLogo || !logoUrl) return null;
    
    return (
      <img
        src={logoUrl}
        alt="Logo"
        style={{
          maxHeight: `${maxHeight}px`,
          width: 'auto',
          objectFit: 'contain',
          marginBottom: '24px',
        }}
        crossOrigin="anonymous"
      />
    );
  };

  if (!stats || stats.totalWatchTime === 0) {
    return (
      <div className="story-slide" style={slideStyle}>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <p>No watch history found.</p>
        </div>
      </div>
    );
  }

  const slides: React.ReactNode[] = [];

  // Slide 1: Hero (with logo and footer)
  slides.push(
    <div key="hero" className="story-slide" style={slideStyle}>
      <div style={gradientOverlay} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <LogoDisplay maxHeight={adminSettings.logoMaxHeight || 80} />
        <div style={{ fontSize: '16px', fontWeight: 500, color: colors.purple, marginBottom: '24px', letterSpacing: '0.15em', textTransform: 'uppercase' }}>
          {displayName}'s
        </div>
        <h1 style={{ fontSize: '96px', fontWeight: 800, marginBottom: '16px', lineHeight: 0.9, color: colors.cyan }}>
          {displayYear}
        </h1>
        <h2 style={{ fontSize: '42px', fontWeight: 700, color: colors.text, marginBottom: '48px' }}>
          {title}
        </h2>
        <div style={{ width: '80px', height: '4px', background: `linear-gradient(90deg, ${colors.cyan}, ${colors.pink})`, borderRadius: '2px', marginBottom: '48px' }} />
        <p style={{ fontSize: '20px', color: colors.textMuted }}>
          Let's see what you've been watching
        </p>
      </div>
      <div style={footerStyle}>Powered by Tautulli</div>
    </div>
  );

  // Slide 2: Total Watch Time
  slides.push(
    <div key="watchtime" className="story-slide" style={slideStyle}>
      <div style={gradientOverlay} />
      <div style={headerStyle}>{titleWithYear}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <div style={{
          fontSize: '80px',
          marginBottom: '32px',
        }}>
          🍿
        </div>
        
        <p style={{ color: colors.textMuted, fontSize: '18px', marginBottom: '20px', textTransform: 'uppercase', letterSpacing: '0.1em' }}>
          {isAllTime && yearsCount > 1 ? `The past ${yearsCount} years` : 'This year'} you watched
        </p>
        
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '40px' }}>
          <div style={{ 
            fontSize: '100px', 
            fontWeight: 800, 
            lineHeight: 1, 
            marginBottom: '8px', 
            color: colors.cyan,
          }}>
            {hours}
          </div>
          <p style={{ fontSize: '32px', fontWeight: 600, color: colors.text, margin: 0 }}>hours</p>
        </div>

        {days > 0 && (
          <div style={{ 
            padding: '16px 32px', 
            backgroundColor: `${colors.cyan}15`,
            borderRadius: '16px',
            border: `1px solid ${colors.cyan}33`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <p style={{ fontSize: '18px', color: colors.textMuted, margin: 0, lineHeight: 1 }}>
              That's <span style={{ color: colors.cyan, fontWeight: 700, fontSize: '24px' }}>{days} days</span> of entertainment!
            </p>
          </div>
        )}
      </div>
    </div>
  );

  // Slide 3: Content Breakdown
  slides.push(
    <div key="content" className="story-slide" style={slideStyle}>
      <div style={gradientOverlay} />
      <div style={headerStyle}>{titleWithYear}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '80px 48px 64px', position: 'relative', zIndex: 1 }}>
        <h2 style={{ fontSize: '32px', fontWeight: 700, color: colors.text, marginBottom: '48px', textAlign: 'center' }}>
          Your Content
        </h2>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '32px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '28px', backgroundColor: colors.cardAlt, borderRadius: '20px' }}>
            <div style={{ padding: '20px', borderRadius: '16px', backgroundColor: `${colors.pink}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Film size={40} color={colors.pink} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', marginTop: '-8px' }}>
              <p style={{ fontSize: '48px', fontWeight: 800, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalMovies}</p>
              <p style={{ fontSize: '18px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>Movies Watched</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '28px', backgroundColor: colors.cardAlt, borderRadius: '20px' }}>
            <div style={{ padding: '20px', borderRadius: '16px', backgroundColor: `${colors.cyan}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Tv size={40} color={colors.cyan} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', marginTop: '-8px' }}>
              <p style={{ fontSize: '48px', fontWeight: 800, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalShows}</p>
              <p style={{ fontSize: '18px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>TV Shows</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '24px', padding: '28px', backgroundColor: colors.cardAlt, borderRadius: '20px' }}>
            <div style={{ padding: '20px', borderRadius: '16px', backgroundColor: `${colors.purple}22`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Play size={40} color={colors.purple} />
            </div>
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'flex-start', justifyContent: 'center', marginTop: '-8px' }}>
              <p style={{ fontSize: '48px', fontWeight: 800, color: colors.text, lineHeight: 1, margin: 0 }}>{stats.totalEpisodes}</p>
              <p style={{ fontSize: '18px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>Episodes</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );

  // Slide 4: Top 5 Movies
  if (stats.topMovies.length > 0) {
    slides.push(
      <div key="topmovies" className="story-slide" style={slideStyle}>
        <div style={gradientOverlay} />
        <div style={headerStyle}>{titleWithYear}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '70px 28px 50px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', justifyContent: 'center' }}>
            <Film size={28} color={colors.pink} />
            <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>Top Movies</span>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
            {stats.topMovies.slice(0, 5).map((movie, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                padding: '14px 16px', 
                backgroundColor: i === 0 ? `${colors.pink}15` : colors.cardAlt, 
                borderRadius: '16px', 
                border: i === 0 ? `2px solid ${colors.pink}40` : 'none',
              }}>
                <span style={{ fontSize: '22px', fontWeight: 800, color: i === 0 ? colors.pink : colors.purple, width: '32px', flexShrink: 0, textAlign: 'center' }}>#{i + 1}</span>
                {movie.thumb && (
                  <div style={{ width: '50px', height: '75px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: colors.cardAlt }}>
                    <img 
                      src={getImageUrl(movie.thumb)} 
                      alt={movie.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ 
                    fontSize: '15px', 
                    fontWeight: 600, 
                    color: colors.text, 
                    margin: 0, 
                    lineHeight: 1.4,
                  }}>{movie.title}</p>
                  <p style={{ fontSize: '13px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{movie.watchCount} play{movie.watchCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Slide 5: Top 5 Shows
  if (stats.topShows.length > 0) {
    slides.push(
      <div key="topshows" className="story-slide" style={slideStyle}>
        <div style={gradientOverlay} />
        <div style={headerStyle}>{titleWithYear}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '70px 28px 50px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', justifyContent: 'center' }}>
            <Tv size={28} color={colors.cyan} />
            <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>Top Shows</span>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '10px' }}>
            {stats.topShows.slice(0, 5).map((show, i) => (
              <div key={i} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '12px', 
                padding: '14px 16px', 
                backgroundColor: i === 0 ? `${colors.cyan}15` : colors.cardAlt, 
                borderRadius: '16px', 
                border: i === 0 ? `2px solid ${colors.cyan}40` : 'none',
              }}>
                <span style={{ fontSize: '22px', fontWeight: 800, color: i === 0 ? colors.cyan : colors.purple, width: '32px', flexShrink: 0, textAlign: 'center' }}>#{i + 1}</span>
                {show.thumb && (
                  <div style={{ width: '50px', height: '75px', borderRadius: '8px', overflow: 'hidden', flexShrink: 0, backgroundColor: colors.cardAlt }}>
                    <img 
                      src={getImageUrl(show.thumb)} 
                      alt={show.title}
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                      crossOrigin="anonymous"
                    />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                  <p style={{ 
                    fontSize: '15px', 
                    fontWeight: 600, 
                    color: colors.text, 
                    margin: 0, 
                    lineHeight: 1.4,
                  }}>{show.title}</p>
                  <p style={{ fontSize: '13px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{show.episodeCount} episode{show.episodeCount !== 1 ? 's' : ''}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // Slide 6: Trends
  if (stats.watchByMonth.some(m => m.hours > 0) || stats.watchByDay.some(d => d.hours > 0)) {
    slides.push(
      <div key="trends" className="story-slide" style={slideStyle}>
        <div style={gradientOverlay} />
        <div style={headerStyle}>{titleWithYear}</div>
        <div style={{ 
          flex: 1, 
          display: 'grid',
          gridTemplateRows: 'repeat(3, 1fr)',
          gap: '24px', 
          padding: '60px 28px 40px', 
          position: 'relative', 
          zIndex: 1 
        }}>
          
          {/* Monthly Activity */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', justifyContent: 'center' }}>
              <Calendar size={20} color={colors.purple} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: colors.text }}>Monthly Activity</span>
            </div>
            
            <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: '3px', height: '120px' }}>
              {stats.watchByMonth.map((month, idx) => {
                const maxHours = Math.max(...stats.watchByMonth.map(m => m.hours), 1);
                const heightPct = maxHours > 0 ? (month.hours / maxHours) * 100 : 0;
                const barHeight = month.hours > 0 ? Math.max(heightPct, 8) : 4;
                return (
                  <div key={idx} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, height: '100%' }}>
                    <span style={{ fontSize: '8px', color: colors.textMuted, marginBottom: '3px', fontWeight: 600 }}>
                      {month.hours > 0 ? `${Math.round(month.hours)}h` : ''}
                    </span>
                    <div style={{ flex: 1, width: '100%', display: 'flex', alignItems: 'flex-end' }}>
                      <div
                        style={{
                          width: '100%',
                          height: `${barHeight}%`,
                          background: month.hours > 0 ? `linear-gradient(180deg, ${colors.cyan} 0%, ${colors.purple} 100%)` : 'rgba(255,255,255,0.1)',
                          borderRadius: '3px 3px 0 0',
                        }}
                      />
                    </div>
                    <span style={{ fontSize: '8px', color: colors.textMuted, marginTop: '6px', fontWeight: 500 }}>
                      {month.month.slice(0, 3)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Watch by Day */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', justifyContent: 'center' }}>
              <Flame size={20} color={colors.orange} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: colors.text }}>Watch by Day</span>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {orderedWatchByDay.map((day) => {
                const maxHours = Math.max(...orderedWatchByDay.map(d => d.hours));
                const width = maxHours > 0 ? (day.hours / maxHours) * 100 : 0;
                return (
                  <div key={day.day} style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ width: '36px', fontSize: '10px', color: colors.textMuted }}>{day.day.slice(0, 3)}</span>
                    <div style={{ flex: 1, height: '18px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${width}%`,
                          height: '100%',
                          background: `linear-gradient(90deg, ${colors.orange} 0%, ${colors.pink} 100%)`,
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                    <span style={{ width: '32px', fontSize: '10px', color: colors.text, textAlign: 'right' }}>{day.hours.toFixed(0)}h</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* When You Watch */}
          <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px', justifyContent: 'center' }}>
              <Clock size={20} color={colors.cyan} />
              <span style={{ fontSize: '16px', fontWeight: 700, color: colors.text }}>When You Watch</span>
            </div>
            
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '4px' }}>
              {stats.watchByHour?.map((hourData) => {
                const maxMinutes = Math.max(...(stats.watchByHour?.map(h => h.minutes) || [1]), 1);
                const intensity = hourData.minutes / maxMinutes;
                const bgColor = intensity > 0 
                  ? `rgba(0, 212, 170, ${Math.max(intensity * 0.8, 0.15)})` 
                  : 'rgba(255,255,255,0.03)';
                const hour = hourData.hour;
                const label = hour === 0 ? '12a' : hour === 12 ? '12p' : hour > 12 ? `${hour-12}p` : `${hour}a`;
                return (
                  <div 
                    key={hourData.hour} 
                    style={{ 
                      backgroundColor: bgColor,
                      borderRadius: '4px',
                      padding: '8px 2px',
                      textAlign: 'center',
                    }}
                  >
                    <span style={{ fontSize: '9px', color: intensity > 0.3 ? colors.text : colors.textMuted }}>{label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '8px' }}>
              <span style={{ fontSize: '9px', color: colors.textMuted }}>Less active</span>
              <span style={{ fontSize: '9px', color: colors.textMuted }}>More active</span>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Slide 7: Genres
  if (stats.topGenres.length > 0) {
    slides.push(
      <div key="genres" className="story-slide" style={slideStyle}>
        <div style={gradientOverlay} />
        <div style={headerStyle}>{titleWithYear}</div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '80px 40px 64px', position: 'relative', zIndex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', justifyContent: 'center' }}>
            <Clapperboard size={28} color={colors.pink} />
            <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>Your Genres</span>
          </div>
          
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', gap: '16px' }}>
            {stats.topGenres.slice(0, 6).map((genre, i) => {
              const maxTime = Math.max(...stats.topGenres.map(g => g.watchTime), 1);
              const widthPct = (genre.watchTime / maxTime) * 100;
              const watchHours = Math.round(genre.watchTime / 3600);
              const genreEmojis: Record<string, string> = {
                'Action': '💥', 'Adventure': '🗺️', 'Animation': '🎬', 'Comedy': '😂',
                'Crime': '🔍', 'Documentary': '📹', 'Drama': '🎭', 'Family': '👨‍👩‍👧‍👦',
                'Fantasy': '🧙', 'Horror': '👻', 'Mystery': '🕵️', 'Romance': '💕',
                'Sci-Fi': '🚀', 'Science Fiction': '🚀', 'Thriller': '😱', 'War': '⚔️',
                'Western': '🤠', 'Music': '🎵', 'History': '📜', 'Sport': '⚽', 'Biography': '📖',
              };
              const emoji = genreEmojis[genre.genre] || '🎬';
              return (
                <div key={genre.genre} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '16px', fontWeight: 600, color: colors.text }}>
                      {emoji} {genre.genre}
                    </span>
                    <span style={{ fontSize: '13px', color: colors.textMuted }}>
                      {watchHours}h • {genre.count} titles
                    </span>
                  </div>
                  <div style={{ height: '10px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '5px', overflow: 'hidden' }}>
                    <div
                      style={{
                        width: `${widthPct}%`,
                        height: '100%',
                        background: `linear-gradient(90deg, ${colors.purple} 0%, ${colors.pink} 100%)`,
                        borderRadius: '5px',
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  // Optional Slide: GeoLocation
  if (adminSettings.enableGeolocation && geoLocations.length > 0) {
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
  
    slides.push(
      <div key="geolocation" className="story-slide" style={slideStyle}>
        <div style={gradientOverlay} />
        <div style={headerStyle}>{titleWithYear}</div>
        <div style={{ 
          flex: 1, 
          display: 'flex', 
          flexDirection: 'column', 
          padding: '70px 36px 50px', 
          position: 'relative', 
          zIndex: 1,
          justifyContent: 'space-between',
        }}>
          {/* Top section */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px', justifyContent: 'center' }}>
              <Globe size={28} color={colors.cyan} />
              <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>Streaming Globe</span>
            </div>
  
            {/* Insight - no gradient, just colored text */}
            <p style={{ 
              fontSize: '15px', 
              fontWeight: 600, 
              textAlign: 'center', 
              marginBottom: '20px',
              color: colors.cyan,
              lineHeight: 1.4,
            }}>
              {insight}
            </p>
          </div>
  
          {/* Globe Image - centered */}
          <div style={{ 
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: '20px',
          }}>
            <img 
              src="/globe.png" 
              alt="Streaming Globe"
              style={{
                width: '160px',
                height: '160px',
                objectFit: 'contain',
              }}
              crossOrigin="anonymous"
            />
          </div>
  
          {/* Stats Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
            <div style={{ textAlign: 'center', padding: '14px 8px', backgroundColor: colors.cardAlt, borderRadius: '12px' }}>
              <p style={{ fontSize: '28px', fontWeight: 700, color: colors.cyan, margin: 0, lineHeight: 1.2 }}>{countries.length}</p>
              <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{countries.length === 1 ? 'Country' : 'Countries'}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '14px 8px', backgroundColor: colors.cardAlt, borderRadius: '12px' }}>
              <p style={{ fontSize: '28px', fontWeight: 700, color: colors.pink, margin: 0, lineHeight: 1.2 }}>{cities.length}</p>
              <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>{cities.length === 1 ? 'City' : 'Cities'}</p>
            </div>
            <div style={{ textAlign: 'center', padding: '14px 8px', backgroundColor: colors.cardAlt, borderRadius: '12px' }}>
              <p style={{ fontSize: '28px', fontWeight: 700, color: colors.purple, margin: 0, lineHeight: 1.2 }}>{totalSessions}</p>
              <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0, marginTop: '4px' }}>Sessions</p>
            </div>
          </div>
  
          {/* Top Locations */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
            <h4 style={{ fontSize: '12px', fontWeight: 600, color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '12px', textAlign: 'center' }}>
              Top Streaming Spots
            </h4>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topLocations.map((loc, i) => (
                <div 
                  key={`${loc.city}-${loc.country}`} 
                  style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '10px', 
                    padding: '10px 12px', 
                    backgroundColor: i === 0 ? `${colors.cyan}15` : colors.cardAlt, 
                    borderRadius: '10px',
                    border: i === 0 ? `1px solid ${colors.cyan}40` : 'none',
                  }}
                >
                  <div style={{ 
                    width: '26px', 
                    height: '26px', 
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
                      lineHeight: 0,
                      marginTop: '-15px', // FORCE LIFT:
                    }}>
                      {i + 1}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: '14px', fontWeight: 600, color: colors.text, margin: 0, lineHeight: 1.3 }}>
                      {loc.city !== "Unknown" ? loc.city : loc.region || loc.country}
                    </p>
                    <p style={{ fontSize: '11px', color: colors.textMuted, margin: 0, lineHeight: 1.3 }}>
                      {loc.city !== "Unknown" && loc.country !== loc.city ? `${loc.country} ` : ''}
                      {getFlagEmoji(loc.countryCode)}
                    </p>
                  </div>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: '4px', 
                    flexShrink: 0,
                  }}>
                    <MapPin size={12} color={colors.textMuted} />
                    <span style={{ 
                      fontSize: '12px', 
                      fontWeight: 500, 
                      color: colors.text,
                      lineHeight: 1,
                      marginTop: '-15px', // FORCE LIFT
                    }}>
                      {loc.sessionCount}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Slide 8: Fun Facts
  slides.push(
    <div key="funfacts" className="story-slide" style={slideStyle}>
      <div style={gradientOverlay} />
      <div style={headerStyle}>{titleWithYear}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '80px 40px 64px', position: 'relative', zIndex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '40px', justifyContent: 'center' }}>
          <Sparkles size={28} color={colors.yellow} />
          <span style={{ fontSize: '24px', fontWeight: 700, color: colors.text }}>Fun Facts</span>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {(() => {
            const getPersonality = () => {
              const totalTime = (stats.morningWatchTime || 0) + (stats.afternoonWatchTime || 0) + (stats.eveningWatchTime || 0) + (stats.nightWatchTime || 0);
              if (totalTime === 0) return { label: "Balanced Viewer", color: colors.cyan, emoji: "⚖️" };
              
              const nightPct = (stats.nightWatchTime || 0) / totalTime;
              const morningPct = (stats.morningWatchTime || 0) / totalTime;
              const avgSessionMin = (stats.avgSessionLength || 0) / 60;
              const avgDailyHours = stats.avgDailyWatchTime / 3600;
              
              if (avgSessionMin > 90) return { label: "Binge Master", color: colors.pink, emoji: "🍿" };
              if (avgDailyHours > 4) return { label: "Marathon Runner", color: colors.orange, emoji: "🏃" };
              if (nightPct > 0.35) return { label: "Night Owl", color: colors.purple, emoji: "🦉" };
              if (morningPct > 0.35) return { label: "Early Bird", color: colors.yellow, emoji: "🐦" };
              if (stats.weekendPercentage > 60) return { label: "Weekend Warrior", color: colors.orange, emoji: "⚔️" };
              return { label: "Balanced Viewer", color: colors.cyan, emoji: "⚖️" };
            };
            const personality = getPersonality();
            return (
              <div style={{ textAlign: 'center', padding: '32px', marginBottom: '32px', background: `linear-gradient(135deg, ${personality.color}22 0%, transparent 100%)`, borderRadius: '24px' }}>
                <span style={{ fontSize: '48px' }}>{personality.emoji}</span>
                <p style={{ fontSize: '14px', color: colors.textMuted, marginTop: '12px' }}>You're a</p>
                <p style={{ fontSize: '36px', fontWeight: 800, color: personality.color }}>{personality.label}</p>
              </div>
            );
          })()}
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '16px' }}>
            {stats.lateNightSessions > 0 && (
              <div style={{ padding: '20px', backgroundColor: colors.cardAlt, borderRadius: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Moon size={28} color={colors.purple} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '32px', fontWeight: 700, color: colors.text, margin: 0, marginBottom: '8px' }}>{stats.lateNightSessions}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Late nights</p>
              </div>
            )}
            {stats.earlyBirdSessions > 0 && (
              <div style={{ padding: '20px', backgroundColor: colors.cardAlt, borderRadius: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Sunrise size={28} color={colors.yellow} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '32px', fontWeight: 700, color: colors.text, margin: 0, marginBottom: '8px' }}>{stats.earlyBirdSessions}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Early mornings</p>
              </div>
            )}
            {stats.longestStreak > 0 && (
              <div style={{ padding: '20px', backgroundColor: colors.cardAlt, borderRadius: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Flame size={28} color={colors.orange} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '32px', fontWeight: 700, color: colors.text, margin: 0, marginBottom: '8px' }}>{stats.longestStreak}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Day streak</p>
              </div>
            )}
            {stats.uniqueTitles > 0 && (
              <div style={{ padding: '20px', backgroundColor: colors.cardAlt, borderRadius: '16px', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                <Star size={28} color={colors.yellow} style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '32px', fontWeight: 700, color: colors.text, margin: 0, marginBottom: '8px' }}>{stats.uniqueTitles}</p>
                <p style={{ fontSize: '12px', color: colors.textMuted, margin: 0 }}>Unique titles</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  // Slide 9: Thank You (with logo)
  slides.push(
    <div key="thankyou" className="story-slide" style={slideStyle}>
      <div style={gradientOverlay} />
      <div style={headerStyle}>{titleWithYear}</div>
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 48px', textAlign: 'center', position: 'relative', zIndex: 1 }}>
        <LogoDisplay maxHeight={adminSettings.logoMaxHeight || 80} />
        <span style={{ fontSize: '64px', marginBottom: '32px' }}>🎉</span>
        <h2 style={{ fontSize: '36px', fontWeight: 700, color: colors.text, marginBottom: '24px' }}>
          That's a wrap!
        </h2>
        <p style={{ fontSize: '20px', color: colors.textMuted, marginBottom: '48px', lineHeight: 1.6 }}>
          Thanks for streaming with us, {displayName}!
        </p>
        
        <div style={{ display: 'flex', gap: '24px', marginBottom: '48px' }}>
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '42px', fontWeight: 800, color: colors.cyan, margin: 0 }}>{hours}h</p>
            <p style={{ fontSize: '14px', color: colors.textMuted, margin: 0 }}>watched</p>
          </div>
          <div style={{ width: '1px', backgroundColor: 'rgba(255,255,255,0.1)' }} />
          <div style={{ textAlign: 'center' }}>
            <p style={{ fontSize: '42px', fontWeight: 800, color: colors.pink, margin: 0 }}>{stats.totalMovies + stats.totalShows}</p>
            <p style={{ fontSize: '14px', color: colors.textMuted, margin: 0 }}>titles</p>
          </div>
        </div>
        
        <p style={{ fontSize: '18px', color: colors.purple, fontWeight: 600 }}>
          See you next year! 🚀
        </p>
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {slides}
    </div>
  );
};

ExportableStorySlides.displayName = 'ExportableStorySlides';