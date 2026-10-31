// src/components/WrappedReport.tsx

import { useEffect, useState, useCallback, useRef } from "react";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "framer-motion";
import { RefreshCw, Settings, X, Shield, LogOut, Database, MonitorSmartphone, Share } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { UserSelector } from "./UserSelector";
import { UsernameInput } from "./UsernameInput";
import {
  YearSelector,
  YearSelection,
  getDisplayYear,
  getDefaultYear,
  getYearsCount,
  toPeriod,
} from "./YearSelector";
import { TotalStats } from "./stats/TotalStats";
import { TopMedia } from "./stats/TopMedia";
import { WatchHeatmap } from "./stats/WatchHeatmap";
import { MonthlyTrends } from "./stats/MonthlyTrends";
import { YearlyTrends } from "./stats/YearlyTrends";
import { FunFacts } from "./stats/FunFacts";
import { JourneyStats } from "./stats/JourneyStats";
import { PlatformStats } from "./stats/PlatformStats";
import { Leaderboard } from "./stats/Leaderboard";
import { ContentDecades } from "./stats/ContentDecades";
import { MostRewatched } from "./stats/MostRewatched";
import { GenreStats } from "./stats/GenreStats";
import { ActorStats } from "./stats/ActorStats";
import { PeakConcurrent } from "./stats/PeakConcurrent";
import { GeoLocationStats } from "./stats/GeoLocationStats";
import { RelatableNumbers } from "./stats/RelatableNumbers";
import { ThroughTheYears, hasThroughTheYears } from "./stats/ThroughTheYears";
import { AdminPanel } from "./AdminPanel";
import { ExportableStorySlides } from "./ExportableStorySlides";
import { TautulliUser, StreamingLocation } from "@/types/tautulli";
import type { ApiUser, BuildingResponse, PublicConfig, ReportResponse, SessionInfo } from "@/types/api";
import { api, ApiError, isBuilding } from "@/lib/api";
import { getServerAdminSettings } from "@/lib/serverConfig";
import { getDisplayTitle } from "@/lib/adminStorage";
import { getTheme } from "@/lib/themes";
import { isIos, isStandalone, useInstallPrompt } from "@/lib/pwa";
import { toast } from "sonner";
import html2canvas from "html2canvas";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import { createRoot } from "react-dom/client";
import { CustomLogo } from "./CustomLogo";
import { Finale } from "./Finale";
import { UnwrapBox } from "./stats/UnwrapBox";
import { HeroBackdrop, HeroScreen } from "./motion/HeroDecor";
import { AmbientBackground } from "./motion/AmbientBackground";
import { KineticText } from "./motion/KineticText";
import { Motes } from "./motion/Motes";
import { ScrollProgress } from "./motion/ScrollProgress";
import { useMagnetic } from "@/hooks/use-magnetic";
import { EASE_OUT_EXPO } from "@/lib/motion";

interface WrappedReportProps {
  publicConfig: PublicConfig;
  session: SessionInfo;
  onRefresh: () => Promise<void> | void;
}

export const WrappedReport = ({ publicConfig, session, onRefresh }: WrappedReportProps) => {
  const adminSettings = { ...getServerAdminSettings(), ...publicConfig.settings };
  const mode = adminSettings.accessMode;
  const canViewAnyone = session.canViewAnyone;
  const viewer = session.viewer;

  const [users, setUsers] = useState<ApiUser[]>([]);
  // null = everyone. Signed-in viewers (the server owner and admins too) start on their own stats.
  const [selectedUserId, setSelectedUserId] = useState<number | null>(viewer?.userId ?? null);
  // Discreet mode: the user the visitor identified as (to switch back from "Everyone")
  const [ownUserId, setOwnUserId] = useState<number | null>(viewer?.userId ?? null);
  const [yearSelection, setYearSelection] = useState<YearSelection>({
    type: "year",
    year: getDefaultYear(adminSettings.currentYearFrom),
  });
  const [report, setReport] = useState<ReportResponse | null>(null);
  const [building, setBuilding] = useState<BuildingResponse | null>(null);
  const [retryTick, setRetryTick] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const [showControls, setShowControls] = useState(false);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [isExportingSlides, setIsExportingSlides] = useState(false);
  const { canInstall, install } = useInstallPrompt();

  // Geolocation state
  const [geoLocations, setGeoLocations] = useState<StreamingLocation[]>([]);
  const [geoLoading, setGeoLoading] = useState(false);
  const [geoTotalIPs, setGeoTotalIPs] = useState(0);

  const requestIdRef = useRef(0);

  // The hero drifts up, shrinks a little and fades as it scrolls away
  const heroRef = useRef<HTMLElement>(null);
  const reduceMotion = useReducedMotion();
  const scrollCue = useMagnetic(10);
  const { scrollYProgress: heroProgress } = useScroll({ target: heroRef, offset: ["start start", "end start"] });
  const heroY = useTransform(heroProgress, [0, 1], [0, reduceMotion ? 0 : -140]);
  const heroScale = useTransform(heroProgress, [0, 1], [1, reduceMotion ? 1 : 0.9]);
  const heroOpacity = useTransform(heroProgress, [0, 0.8], [1, 0]);
  const heroInView = useInView(heroRef);

  const stats = report?.stats ?? null;
  const oldestYear = report?.oldestYear ?? undefined;
  const period = toPeriod(yearSelection);

  // Everyone's stats can be shown to privileged viewers, or to anyone when "All Users" is allowed
  const allowEveryone = canViewAnyone || adminSettings.allowAllUsers;
  const canLoad = selectedUserId !== null || allowEveryone;

  const getTitle = () => getDisplayTitle(adminSettings);

  useEffect(() => {
    if (!canViewAnyone) return;
    api
      .users()
      .then(setUsers)
      .catch(() => setUsers([]));
  }, [canViewAnyone]);

  const loadStats = useCallback(async () => {
    if (!canLoad) return;
    const requestId = ++requestIdRef.current;
    const query = { user: selectedUserId ?? ("all" as const), period };

    setIsLoading(true);
    setGeoLocations([]);
    setGeoTotalIPs(0);
    setGeoLoading(false);

    try {
      const result = await api.report(query);
      if (requestId !== requestIdRef.current) return;
      setBuilding(null);
      setReport(result);
      setIsLoading(false);

      if (adminSettings.enableGeolocation) {
        setGeoLoading(true);
        try {
          const geo = await api.reportLocations(query);
          if (requestId !== requestIdRef.current) return;
          setGeoLocations(geo.locations);
          setGeoTotalIPs(geo.totalIPs);
        } catch (error) {
          console.warn("Failed to load streaming locations:", error);
        } finally {
          if (requestId === requestIdRef.current) setGeoLoading(false);
        }
      }
    } catch (error) {
      if (requestId !== requestIdRef.current) return;
      setIsLoading(false);
      if (isBuilding(error)) {
        // First run: the server is still building its history cache
        setBuilding(error.data);
        setTimeout(() => setRetryTick((t) => t + 1), 3000);
        return;
      }
      setBuilding(null);
      if (error instanceof ApiError && error.status === 401) {
        if (error.data?.needsLogin) {
          onRefresh();
          return;
        }
        if (error.data?.needsPassword) {
          toast.error("Please enter your username and password");
          setSelectedUserId(null);
          setOwnUserId(null);
          setReport(null);
          setShowControls(true);
          return;
        }
      }
      toast.error(error instanceof ApiError ? error.message : "Failed to load watch history");
      console.error(error);
    }
  }, [canLoad, selectedUserId, period, adminSettings.enableGeolocation, onRefresh]);

  useEffect(() => {
    loadStats();
    // retryTick re-runs the request while the cache is being built
  }, [loadStats, retryTick]);

  const handleUserSelect = (userId: number | null) => {
    setSelectedUserId(userId);
  };

  const handleDiscreetUser = (userId: number) => {
    setOwnUserId(userId);
    setSelectedUserId(userId);
  };

  const handleSignOut = async () => {
    try {
      await api.logout();
    } finally {
      await onRefresh();
    }
  };

  const handleAdminSignOut = async () => {
    try {
      await api.admin.logout();
    } finally {
      await onRefresh();
    }
  };

  // Signed in to the Admin Panel in Discreet/Plex mode: make it obvious why everyone is visible
  const showAdminBadge = session.isAdmin && mode !== "regular";

  // iOS has no install prompt: point to Share > Add to Home Screen instead
  const showIosInstallHint = isIos() && !isStandalone();

  const scrollToContent = () => {
    window.scrollTo({
      top: window.innerHeight,
      behavior: "smooth",
    });
  };

  const reportUser: TautulliUser | null = report?.user
    ? {
        user_id: report.user.user_id,
        username: report.user.username,
        friendly_name: report.user.friendly_name,
        thumb: report.user.thumb,
      }
    : null;

  const handleExportSlides = async () => {
    if (!stats || !reportUser || selectedUserId === null) {
      toast.error("Please select a user first");
      return;
    }

    setIsExportingSlides(true);

    try {
      const displayYear = getDisplayYear(yearSelection);
      const userName = reportUser.friendly_name || reportUser.username;
      const safeFileName = userName.replace(/[^a-zA-Z0-9]/g, "_");
      const title = getTitle();
      // From the same settings the slides read their theme from
      const exportBg = getTheme(getServerAdminSettings().theme).exportColors.bg;

      // Create a temporary container
      const tempContainer = document.createElement('div');
      tempContainer.style.position = 'absolute';
      tempContainer.style.left = '-10000px';
      tempContainer.style.top = '0';
      tempContainer.style.width = '540px';
      tempContainer.style.backgroundColor = exportBg;
      document.body.appendChild(tempContainer);

      const root = createRoot(tempContainer);

      await new Promise<void>((resolve) => {
        root.render(
          <ExportableStorySlides
            user={reportUser}
            stats={stats}
            yearSelection={yearSelection}
            geoLocations={adminSettings.enableGeolocation ? geoLocations : []}
            onReady={() => {
              setTimeout(resolve, 500);
            }}
          />
        );
      });

      // Wait for images to load
      const images = tempContainer.querySelectorAll('img');
      await Promise.all(
        Array.from(images).map(img => {
          if (img.complete) return Promise.resolve();
          return new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.onerror = () => resolve();
            setTimeout(() => resolve(), 3000);
          });
        })
      );

      await new Promise(resolve => setTimeout(resolve, 300));

      // Capture each slide
      const slides = tempContainer.querySelectorAll('.story-slide');
      const zip = new JSZip();

      for (let i = 0; i < slides.length; i++) {
        const slideElement = slides[i] as HTMLElement;

        const canvas = await html2canvas(slideElement, {
          backgroundColor: exportBg,
          scale: 2,
          useCORS: true,
          allowTaint: true,
          logging: false,
          width: 540,
          height: 960,
        });

        const blob = await new Promise<Blob>((resolve, reject) => {
          canvas.toBlob(
            (b) => {
              if (b) resolve(b);
              else reject(new Error(`Failed to create slide ${i + 1}`));
            },
            'image/png',
            1.0
          );
        });

        zip.file(`slide_${String(i + 1).padStart(2, '0')}.png`, blob);
      }

      // Cleanup
      root.unmount();
      document.body.removeChild(tempContainer);

      // Download
      const zipBlob = await zip.generateAsync({ type: "blob" });
      saveAs(zipBlob, `${safeFileName}_${title.replace(/\s/g, '_')}_${displayYear.replace(/\s/g, '_')}_Slides.zip`);

      toast.success("Slides exported successfully!");
    } catch (error) {
      console.error("Export error:", error);
      toast.error("Failed to export slides. Please try again.");
    } finally {
      setIsExportingSlides(false);
    }
  };

  const selectedUserName =
    selectedUserId === null
      ? null
      : report?.user?.user_id === selectedUserId
        ? report.user.friendly_name || report.user.username
        : users.find((u) => u.user_id === selectedUserId)?.friendly_name || (viewer?.userId === selectedUserId ? viewer.name : null);
  const displayName = selectedUserId === null ? "Everyone" : selectedUserName || "Your";
  const displayYear = getDisplayYear(yearSelection);
  const isAllTime = yearSelection.type === "alltime";
  const yearsCount = getYearsCount(oldestYear);
  const title = getTitle();
  const leaderboard = report?.leaderboard ?? [];
  const reportHistory = report?.history ?? null;
  const showYearlyCharts = isAllTime && (stats?.watchByYear.length ?? 0) > 1;
  // Peak concurrent streams sit with the viewer charts: in Through the Years, under the
  // yearly charts in All Time, and otherwise near the end of the report
  const peakStreams = selectedUserId === null ? stats?.peakConcurrentStreams ?? null : null;
  const peakPlacement = !peakStreams
    ? null
    : hasThroughTheYears(reportHistory)
      ? "throughTheYears"
      : showYearlyCharts
        ? "yearly"
        : "end";

  // Welcome screen: discreet mode without "All Users" before a username was entered
  const showWelcomeScreen = !canLoad && !stats;

  // "My stats / Everyone" toggle for signed-in (Plex) or identified (Discreet) viewers. Admins
  // and the server owner get it too, and can still pick anyone else in Settings.
  const myUserId = mode === "plex" ? viewer?.userId ?? null : ownUserId;
  const showScopeToggle = myUserId !== null && allowEveryone;

  const renderScopeToggle = (className: string) => (
    <div className={`flex rounded-lg border border-border p-1 bg-card ${className}`}>
      <Button
        size="sm"
        variant={selectedUserId !== null && selectedUserId === myUserId ? "default" : "ghost"}
        className="flex-1"
        onClick={() => setSelectedUserId(myUserId)}
      >
        My stats
      </Button>
      <Button
        size="sm"
        variant={selectedUserId === null ? "default" : "ghost"}
        className="flex-1"
        onClick={() => setSelectedUserId(null)}
      >
        Everyone
      </Button>
    </div>
  );

  return (
    <div className="min-h-screen overflow-x-clip">
      <AmbientBackground />
      {stats && stats.totalWatchTime > 0 && !isLoading && !building && <ScrollProgress />}

      {/* Hero Section (padding keeps the content clear of the admin badge and the scroll cue) */}
      <section ref={heroRef} className="hero-section min-h-screen flex flex-col items-center justify-center relative px-4 pt-16 pb-28">
        <HeroBackdrop />
        <Motes />
        {/* A layer of its own, so scrolling moves and fades it without repainting its text every frame */}
        <motion.div style={{ y: heroY, scale: heroScale, opacity: heroOpacity }} className="relative text-center [will-change:transform,opacity]">
          {showWelcomeScreen ? (
            <>
              {/* Logo for welcome screen */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1 }}
                className="mb-6"
              >
                <CustomLogo className="mx-auto" />
              </motion.div>
              <KineticText
                as="h1"
                text={title}
                gradient
                trigger="mount"
                delay={0.2}
                className="font-display text-5xl md:text-7xl lg:text-8xl font-extrabold tracking-tighter leading-[0.95] mb-5 glow-text"
              />
              <motion.p
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
                className="text-xl text-muted-foreground mb-8"
              >
                Enter your username to view your stats
              </motion.p>
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8, ease: EASE_OUT_EXPO, duration: 0.8 }}
              >
                <Button
                  variant="outline"
                  size="lg"
                  onClick={() => setShowControls(true)}
                  className="text-lg px-8"
                >
                  <Settings className="w-5 h-5 mr-2" />
                  Get Started
                </Button>
              </motion.div>
            </>
          ) : (
            <>
              {/* Logo for main report view */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.05 }}
                className="mb-4"
              >
                <CustomLogo className="mx-auto" />
              </motion.div>
              <motion.div
                initial={{ opacity: 0, letterSpacing: "0.7em" }}
                animate={{ opacity: 1, letterSpacing: "0.25em" }}
                transition={{ delay: 0.1, duration: 1.4, ease: EASE_OUT_EXPO }}
                className="text-sm font-semibold text-primary mb-3 uppercase"
              >
                {displayName === "Your" ? "Your" : `${displayName}'s`}
              </motion.div>
              {/* The wrappers only show in Rental Night, where the year is printed on a ticket stub (index.css) */}
              <div className={`hero-year ${/^\d{4}$/.test(displayYear) ? "hero-year-short" : ""}`}>
                <div className="hero-year-ticket">
                  {/* Re-keyed so a newly picked year rolls in again */}
                  <KineticText
                    key={displayYear}
                    as="h1"
                    text={displayYear}
                    by="char"
                    gradient
                    trigger="mount"
                    delay={0.25}
                    stagger={0.07}
                    className={`font-display font-extrabold tracking-tighter leading-[0.9] mb-3 glow-text ${
                      /^\d{4}$/.test(displayYear) ? "text-[clamp(5rem,24vw,12rem)]" : "text-[clamp(3.5rem,15vw,8.5rem)]"
                    }`}
                  />
                </div>
              </div>
              {/* hero-title: hand-written on the tape's label in VHS Rewind (index.css) */}
              <KineticText
                as="h2"
                text={title}
                trigger="mount"
                delay={0.7}
                className="hero-title font-display text-3xl md:text-5xl font-bold tracking-tight text-foreground mb-6"
              />
              <motion.p
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1, duration: 0.8, ease: EASE_OUT_EXPO }}
                className="text-xl text-muted-foreground"
              >
                Let's see what you've been watching
              </motion.p>
              {showScopeToggle && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 1.1 }}
                  className="mt-6 flex justify-center"
                >
                  {renderScopeToggle("w-64")}
                </motion.div>
              )}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 1.2 }}
                className={`${showScopeToggle ? "mt-3" : "mt-6"} flex justify-center`}
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowControls(true)}
                  className="text-muted-foreground hover:text-foreground bg-background/40"
                >
                  <Settings className="w-4 h-4 mr-2" />
                  Settings
                </Button>
              </motion.div>
            </>
          )}
        </motion.div>

        {!showWelcomeScreen && (
          // Fades out together with the hero
          <motion.div style={{ opacity: heroOpacity }} className="hero-cue absolute bottom-10">
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.5, duration: 0.8, ease: EASE_OUT_EXPO }}
            >
              <motion.button
                type="button"
                onClick={scrollToContent}
                aria-label="Scroll to your stats"
                style={scrollCue.style}
                {...scrollCue.handlers}
                className="flex flex-col items-center gap-2 p-3 text-muted-foreground hover:text-foreground transition-colors outline-none focus-visible:text-foreground"
              >
                <span className="flex h-10 w-6 justify-center rounded-full border-2 border-current pt-2">
                  {/* Only while the hero is on screen: the loop would otherwise run for as long as the page is open */}
                  <motion.span
                    className="h-2 w-1 rounded-full bg-current"
                    animate={reduceMotion || !heroInView ? { y: 0, opacity: 1 } : { y: [0, 12, 0], opacity: [1, 0.2, 1] }}
                    transition={reduceMotion || !heroInView ? { duration: 0 } : { duration: 1.8, repeat: Infinity, ease: "easeInOut" }}
                  />
                </span>
                <span className="text-[10px] font-semibold uppercase tracking-[0.3em]">Scroll</span>
              </motion.button>
            </motion.div>
          </motion.div>
        )}

        {showAdminBadge && (
          <div className="absolute top-4 left-4 z-40 flex items-center gap-2 rounded-full border border-primary/40 bg-card/80 px-3 py-1.5 text-xs text-muted-foreground backdrop-blur">
            <Shield className="w-3.5 h-3.5 text-primary" />
            <span>
              <span className="text-foreground font-medium">Admin view</span>: all users are visible
            </span>
            <button onClick={handleAdminSignOut} className="text-primary hover:underline">
              Sign out
            </button>
          </div>
        )}

        <HeroScreen />
      </section>

      {/* Settings: a centred dialog, so it never covers part of the report on small screens */}
      <Dialog open={showControls} onOpenChange={setShowControls}>
        <DialogContent
          hideClose
          className="w-[calc(100%-2rem)] max-w-sm sm:max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto border-0 bg-transparent p-0 shadow-none"
        >
          {/* min-w-0: the dialog is a grid, so without it wide content stretches the card past the dialog */}
          <div className="stat-card min-w-0 space-y-4">
            <div className="flex items-center justify-between">
              <DialogTitle className="text-base">Settings</DialogTitle>
              <DialogClose asChild>
                <Button variant="ghost" size="icon" aria-label="Close settings">
                  <X className="w-4 h-4" />
                </Button>
              </DialogClose>
            </div>
            <DialogDescription className="sr-only">Choose whose stats to show and for which period</DialogDescription>
            {viewer?.kind === "plex" && (
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 break-words text-muted-foreground">
                  Signed in as <span className="text-foreground font-medium">{viewer.name}</span>
                  {viewer.owner ? " (server owner)" : ""}
                </span>
                <Button variant="ghost" size="sm" onClick={handleSignOut} className="shrink-0">
                  <LogOut className="w-4 h-4 mr-1" />
                  Sign out
                </Button>
              </div>
            )}
            {canViewAnyone ? (
              <UserSelector users={users} selectedUserId={selectedUserId} onSelectUser={handleUserSelect} />
            ) : mode === "discreet" ? (
              <UsernameInput onSelectUser={handleDiscreetUser} />
            ) : null}
            {/* The user picker above already offers "All Users" to those who can view anyone */}
            {showScopeToggle && !canViewAnyone && renderScopeToggle("w-full")}
            <YearSelector selection={yearSelection} onSelectionChange={setYearSelection} oldestYear={oldestYear} />
            <div className="flex gap-2 pt-2">
              <Button onClick={loadStats} disabled={isLoading || !canLoad} size="sm" className="flex-1">
                <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
                Refresh
              </Button>
              <Button
                onClick={() => {
                  setShowControls(false);
                  setShowAdminPanel(true);
                }}
                variant="outline"
                size="sm"
                aria-label="Admin panel"
              >
                <Shield className="w-4 h-4" />
              </Button>
            </div>
            {canInstall ? (
              <Button variant="ghost" size="sm" onClick={install} className="w-full text-muted-foreground hover:text-foreground">
                <MonitorSmartphone className="w-4 h-4 mr-2" />
                Install app
              </Button>
            ) : showIosInstallHint ? (
              <p className="flex flex-wrap items-center justify-center gap-1 text-xs text-muted-foreground">
                To install, tap <Share className="w-3.5 h-3.5" aria-label="Share" /> then "Add to Home Screen"
              </p>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>

      {/* Stats Sections */}
      {building ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center stat-card max-w-md mx-4">
            <Database className="w-10 h-10 text-primary mx-auto mb-4 animate-pulse" />
            <p className="text-foreground text-lg font-semibold mb-2">Building the stats cache for the first time</p>
            <p className="text-muted-foreground">
              {building.phase}
              {building.rows > 0 ? ` (${building.rows.toLocaleString()} sessions so far)` : ""}…
            </p>
            <p className="text-xs text-muted-foreground/70 mt-3">This only happens once. The report will appear automatically.</p>
            <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-muted/40">
              <div className="h-full w-full indeterminate-bar" />
            </div>
          </div>
        </div>
      ) : isLoading ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="flex flex-col items-center text-center" role="status">
            <UnwrapBox variant="movie" size="sm" />
            <p className="mt-2 font-display text-xl font-semibold shimmer-text">Unwrapping your year...</p>
          </div>
        </div>
      ) : stats && stats.totalWatchTime > 0 ? (
        <>
          <div className="max-w-4xl mx-auto px-4 pb-20 space-y-24">
            <section className="space-y-6">
              <TotalStats
                totalWatchTime={stats.totalWatchTime}
                totalMovies={stats.totalMovies}
                totalShows={stats.totalShows}
                totalEpisodes={stats.totalEpisodes}
                isAllTime={isAllTime}
                yearsCount={yearsCount}
                rank={report?.rank}
                activeUsers={selectedUserId === null ? stats.activeUsers : undefined}
              />
              <RelatableNumbers stats={stats} selection={yearSelection} isGroup={selectedUserId === null} />
            </section>
            {(stats.topMovie || stats.topShow) && (
              <section>
                <TopMedia
                topMovie={stats.topMovie}
                topShow={stats.topShow}
                topMovies={stats.topMovies}
                topShows={stats.topShows}
                showViewers={selectedUserId === null}
              />
              </section>
            )}
            {showYearlyCharts ? (
              <section className="space-y-6">
                <YearlyTrends watchByYear={stats.watchByYear} />
                {selectedUserId === null && <YearlyTrends watchByYear={stats.watchByYear} metric="viewers" />}
                {peakPlacement === "yearly" && <PeakConcurrent peakConcurrentStreams={peakStreams} />}
              </section>
            ) : (
              stats.watchByMonth.some((m) => m.hours > 0) && (
                <section>
                  <MonthlyTrends watchByMonth={stats.watchByMonth} />
                </section>
              )
            )}
            {stats.watchByDay.some((d) => d.hours > 0) && (
              <section>
                <WatchHeatmap watchByDay={stats.watchByDay} watchByHour={stats.watchByHour} />
              </section>
            )}
            <section>
              <FunFacts
                lateNightSessions={stats.lateNightSessions}
                weekendPercentage={stats.weekendPercentage}
                mostActiveDay={stats.mostActiveDay}
                uniqueTitles={stats.uniqueTitles}
                avgDailyWatchTime={stats.avgDailyWatchTime}
                mostBingedDay={stats.mostBingedDay}
                earlyBirdSessions={stats.earlyBirdSessions}
                isGroup={selectedUserId === null}
                peakHour={stats.peakHour}
                longestBinge={stats.longestBinge}
                personality={stats.personality}
              />
            </section>
            <section>
              <JourneyStats
                firstWatch={stats.firstWatch}
                lastWatch={stats.lastWatch}
                longestStreak={stats.longestStreak}
                totalSessions={stats.totalSessions}
                isAllTime={isAllTime}
                isGroup={selectedUserId === null}
              />
            </section>

            {hasThroughTheYears(reportHistory) && (
              <section>
                <ThroughTheYears
                  history={reportHistory}
                  current={{
                    watchTime: stats.totalWatchTime,
                    movies: stats.totalMovies,
                    shows: stats.totalShows,
                    episodes: stats.totalEpisodes,
                  }}
                  highlightYear={yearSelection.type === "year" ? yearSelection.year : undefined}
                  isGroup={selectedUserId === null}
                  peakConcurrentStreams={peakPlacement === "throughTheYears" ? peakStreams : null}
                />
              </section>
            )}

            {/* Geolocation Section - After Journey, Before Platforms */}
            {adminSettings.enableGeolocation && (geoLocations.length > 0 || geoLoading || geoTotalIPs > 0) && (
              <section>
                <GeoLocationStats locations={geoLocations} isLoading={geoLoading} totalIPs={geoTotalIPs} />
              </section>
            )}

            {stats.platforms.length > 0 && (
              <section>
                <PlatformStats platforms={stats.platforms} />
              </section>
            )}
            {stats.contentDecades.length > 0 && (
              <section>
                <ContentDecades decades={stats.contentDecades} />
              </section>
            )}
            {stats.mostRewatched && (
              <section>
                <MostRewatched mostRewatched={stats.mostRewatched} isGroup={selectedUserId === null} />
              </section>
            )}
            {stats.topGenres.length > 0 && (
              <section>
                <GenreStats genres={stats.topGenres} />
              </section>
            )}
            {(stats.topActors.length > 0 || stats.topDirectors.length > 0) && (
              <section>
                <ActorStats actors={stats.topActors} directors={stats.topDirectors} isGroup={selectedUserId === null} />
              </section>
            )}
            {peakPlacement === "end" && (
              <section>
                <PeakConcurrent peakConcurrentStreams={peakStreams} />
              </section>
            )}
            {adminSettings.showLeaderboard && leaderboard.length > 1 && (
              <section>
                <Leaderboard userStats={leaderboard} />
              </section>
            )}
          </div>
          <Finale
            name={selectedUserId !== null && displayName !== "Your" ? displayName : null}
            showExport={selectedUserId !== null && Boolean(stats) && Boolean(reportUser)}
            isExporting={isExportingSlides}
            onExport={handleExportSlides}
          />
        </>
      ) : !showWelcomeScreen && report ? (
        <div className="min-h-screen flex items-center justify-center">
          <div className="text-center stat-card max-w-md mx-4">
            <p className="text-foreground text-lg font-semibold mb-2">No watch history found</p>
            <p className="text-muted-foreground mb-4">
              {canViewAnyone ? "Try adjusting the date range or selecting a different user." : "Try adjusting the date range."}
            </p>
            <Button onClick={() => setShowControls(true)} variant="outline">
              <Settings className="w-4 h-4 mr-2" />
              Open Settings
            </Button>
          </div>
        </div>
      ) : null}

      <AdminPanel
        isOpen={showAdminPanel}
        onClose={() => {
          setShowAdminPanel(false);
          onRefresh();
        }}
      />
    </div>
  );
};
