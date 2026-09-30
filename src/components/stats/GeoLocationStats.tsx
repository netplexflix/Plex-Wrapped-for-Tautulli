// src/components/stats/GeoLocationStats.tsx

import { useEffect, useMemo, useState, lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { MapPin, Globe, Loader2 } from "lucide-react";
import { StreamingLocation } from "@/types/tautulli";
import { generateLocationInsight } from "@/lib/geolocation";

interface GeoLocationStatsProps {
  locations: StreamingLocation[];
  isLoading?: boolean;
  totalIPs?: number;
}

// Lazy load the map component to avoid SSR issues
const LazyMap = lazy(() => import("./GeoLocationMap"));

const getFlagEmoji = (countryCode: string): string => {
  if (!countryCode || countryCode.length !== 2) return "";
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
};

export const GeoLocationStats = ({ locations, isLoading = false, totalIPs = 0 }: GeoLocationStatsProps) => {
  const [isClient, setIsClient] = useState(false);

  useEffect(() => {
    setIsClient(true);
  }, []);

  const insight = generateLocationInsight(locations);

  // Aggregate locations by city+country to avoid duplicates
  const aggregatedLocations = useMemo(() => {
    const locationMap = new Map<
      string,
      {
        ip: string;
        city: string;
        region: string;
        country: string;
        countryCode: string;
        lat: number;
        lon: number;
        sessionCount: number;
        sessionDates: string[];
      }
    >();

    locations.forEach((loc) => {
      const key = `${loc.city}-${loc.country}`;
      const existing = locationMap.get(key);
      if (existing) {
        existing.sessionCount += loc.sessionCount;
        if (loc.sessionDates) {
          existing.sessionDates.push(...loc.sessionDates);
        }
      } else {
        locationMap.set(key, {
          ip: loc.ip,
          city: loc.city,
          region: loc.region,
          country: loc.country,
          countryCode: loc.countryCode,
          lat: loc.lat,
          lon: loc.lon,
          sessionCount: loc.sessionCount,
          sessionDates: loc.sessionDates ? [...loc.sessionDates] : [],
        });
      }
    });

    return Array.from(locationMap.values()).map((v) => ({
      ...v,
      sessionDates: Array.from(new Set(v.sessionDates)),
    }));
  }, [locations]);

  const countries = [...new Set(locations.map((l) => l.country))];
  const cities = [...new Set(locations.map((l) => l.city).filter((c) => c !== "Unknown"))];
  const totalSessions = locations.reduce((sum, l) => sum + l.sessionCount, 0);

  const sortedLocations = [...aggregatedLocations].sort((a, b) => b.sessionCount - a.sessionCount);
  const topLocations = sortedLocations.slice(0, 5);

  // Show the component if loading, has locations, or attempted geolocation (totalIPs > 0)
  if (locations.length === 0 && !isLoading && totalIPs === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 40 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.6 }}
      className="stat-card"
    >
      <div className="flex items-center gap-3 mb-6">
        <div className="p-3 rounded-xl bg-gradient-to-br from-cyan/20 to-purple/20">
          <Globe className="w-6 h-6 text-cyan" />
        </div>
        <div>
          <h3 className="text-2xl font-bold text-foreground">Streaming Globe</h3>
          <p className="text-muted-foreground text-sm">Where you've been watching from</p>
        </div>
      </div>

      {/* Insight text */}
      <motion.p
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ delay: 0.3 }}
        className="text-lg text-center mb-6 gradient-text font-semibold"
      >
        {insight}
      </motion.p>

      {/* Map container */}
      <div className="relative rounded-xl overflow-hidden border border-border" style={{ height: "400px" }}>
        {isClient && (
          <Suspense
            fallback={
              <div className="h-full w-full flex items-center justify-center bg-secondary/30">
                <Loader2 className="w-8 h-8 text-cyan animate-spin" />
              </div>
            }
          >
            <LazyMap locations={aggregatedLocations} />
          </Suspense>
        )}

        {/* Gradient overlay at bottom for blend */}
        <div className="absolute bottom-0 left-0 right-0 h-12 pointer-events-none bg-gradient-to-t from-card to-transparent" />
      </div>

      {/* Loading indicator below map */}
      {isLoading && (
        <div className="mt-3 mb-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" />
          Locating sessions...
        </div>
      )}

      {!isLoading && locations.length === 0 && totalIPs > 0 && (
        <div className="mt-3 mb-6 text-sm text-muted-foreground text-center">
          Couldn't locate any sessions from these IPs.
        </div>
      )}

      {!isLoading && <div className="mb-6" />}

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.4 }}
          className="text-center p-4 rounded-lg bg-secondary/50"
        >
          <div className="text-3xl font-bold gradient-text">{countries.length}</div>
          <div className="text-sm text-muted-foreground">{countries.length === 1 ? "Country" : "Countries"}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.5 }}
          className="text-center p-4 rounded-lg bg-secondary/50"
        >
          <div className="text-3xl font-bold gradient-text">{cities.length}</div>
          <div className="text-sm text-muted-foreground">{cities.length === 1 ? "City" : "Cities"}</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ delay: 0.6 }}
          className="text-center p-4 rounded-lg bg-secondary/50"
        >
          <div className="text-3xl font-bold gradient-text">{totalSessions}</div>
          <div className="text-sm text-muted-foreground">Sessions</div>
        </motion.div>
      </div>

      {/* Top locations list */}
      {topLocations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
            Top Streaming Spots
          </h4>
          {topLocations.map((loc, i) => (
            <motion.div
              key={`${loc.city}-${loc.country}`}
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              viewport={{ once: true }}
              transition={{ delay: 0.7 + i * 0.1 }}
              className="flex items-center justify-between p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan/30 to-purple/30 flex items-center justify-center text-sm font-bold">
                  {i + 1}
                </div>
                <div>
                  <div className="font-medium text-foreground">
                    {loc.city !== "Unknown" ? loc.city : loc.region || loc.country}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {loc.city !== "Unknown" && loc.country !== loc.city ? loc.country : ""}
                    {loc.countryCode && ` ${getFlagEmoji(loc.countryCode)}`}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MapPin className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm font-medium text-foreground">{loc.sessionCount} streams</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};