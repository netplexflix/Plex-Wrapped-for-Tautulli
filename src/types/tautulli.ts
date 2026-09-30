export interface TautulliUser {
  user_id: number;
  username: string;
  friendly_name: string;
  thumb: string;
  email?: string;
  is_admin?: boolean | number;
  is_active?: boolean | number;
}

export interface WatchHistory {
  reference_id: number;
  row_id: number;
  id: number;
  date: number;
  started: number;
  stopped: number;
  duration: number;
  play_duration: number;
  paused_counter: number;
  user_id: number;
  user: string;
  friendly_name: string;
  platform: string;
  product: string;
  player: string;
  ip_address: string;
  live: number;
  machine_id: string;
  location: string;
  secure: number;
  relayed: number;
  media_type: string;
  rating_key: number;
  parent_rating_key: number;
  grandparent_rating_key: number;
  full_title: string;
  title: string;
  parent_title: string;
  grandparent_title: string;
  original_title: string;
  year: number;
  media_index: number;
  parent_media_index: number;
  thumb: string;
  originally_available_at: string;
  guid: string;
  transcode_decision: string;
  percent_complete: number;
  watched_status: number;
  group_count: number;
  group_ids: string;
  state: string | null;
  session_key: string | null;
}

export interface MediaInfo {
  rating_key: number;
  title: string;
  year: number;
  thumb: string;
  art: string;
  genres: string[];
  actors: string[];
  directors: string[];
  duration: number;
  media_type: string;
  grandparent_title?: string;
  parent_title?: string;
}

export interface WrappedStats {
  totalWatchTime: number;
  totalMovies: number;
  totalShows: number;
  totalEpisodes: number;
  topMovie: { title: string; year: number; watchCount: number; totalTime: number; thumb?: string; userCount?: number } | null;
  topShow: { title: string; watchCount: number; totalTime: number; episodeCount: number; thumb?: string; userCount?: number } | null;
  topMovies: { title: string; year: number; watchCount: number; totalTime: number; thumb?: string }[];
  topShows: { title: string; watchCount: number; totalTime: number; episodeCount: number; thumb?: string }[];
  watchByDay: { day: string; hours: number }[];
  watchByHour: { hour: number; minutes: number }[];
  watchByMonth: { month: string; hours: number }[];
  watchByYear: { year: number; hours: number }[];
  longestBinge: { title: string; duration: number; date: string } | null;
  lateNightSessions: number;
  weekendPercentage: number;
  mostActiveDay: { day: string; hours: number } | null;
  uniqueTitles: number;
  avgDailyWatchTime: number;
  avgSessionLength: number;
  mostBingedDay: { date: string; duration: number } | null;
  earlyBirdSessions: number;
  platforms: { name: string; count: number; percentage: number }[];
  firstWatch: { title: string; date: string } | null;
  lastWatch: { title: string; date: string } | null;
  longestStreak: number;
  totalSessions: number;
  // New stats
  peakHour: number;
  morningWatchTime: number;
  afternoonWatchTime: number;
  eveningWatchTime: number;
  nightWatchTime: number;
  topGenres: { genre: string; count: number; watchTime: number }[];
  topActors: { name: string; count: number; titleCount: number; watchTime: number }[];
  topDirectors: { name: string; count: number; titleCount: number; watchTime: number }[];
  contentDecades: { decade: string; count: number; watchTime: number }[];
  mostRewatched: { title: string; rewatchCount: number } | null;
  topMoviesByUsers: { title: string; userCount: number; totalTime: number }[];
  topShowsByUsers: { title: string; userCount: number; totalTime: number }[];
  peakConcurrentStreams: { count: number; date: string; time: string; timestamp?: number } | null;
  streamingLocations?: StreamingLocation[];
}

export interface StreamingLocation {
  ip: string; // opaque id (raw IPs are never sent to the browser)
  city: string;
  region: string;
  country: string;
  countryCode: string;
  lat: number;
  lon: number;
  sessionCount: number;
  sessionDates?: string[]; // Array of formatted date strings for each session
}

export interface UserStats extends WrappedStats {
  userId: number;
  username: string;
  friendlyName: string;
}

export interface TautulliConfig {
  url: string;
  apiKey: string;
}