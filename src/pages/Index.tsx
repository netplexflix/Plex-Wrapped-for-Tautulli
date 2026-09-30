import { useCallback, useEffect, useState } from "react";
import { WrappedReport } from "@/components/WrappedReport";
import { ChristmasMusic } from "@/components/ChristmasMusic";
import { AdminPanel } from "@/components/AdminPanel";
import { PlexLogin } from "@/components/PlexLogin";
import { plexLoginErrorMessage, waitForPlexPin } from "@/lib/plexAuth";
import { Button } from "@/components/ui/button";
import { Shield, Sparkles } from "lucide-react";
import { loadPublicConfig } from "@/lib/serverConfig";
import { api } from "@/lib/api";
import type { PublicConfig, SessionInfo } from "@/types/api";

const NO_SESSION: SessionInfo = { viewer: null, isAdmin: false, canViewAnyone: false };

export default function Index() {
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [session, setSession] = useState<SessionInfo>(NO_SESSION);
  const [loading, setLoading] = useState(true);
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [pinPending, setPinPending] = useState(false);

  const refresh = useCallback(async () => {
    const [nextConfig, nextSession] = await Promise.all([loadPublicConfig(), api.session().catch(() => NO_SESSION)]);
    setConfig(nextConfig);
    setSession(nextSession);
  }, []);

  useEffect(() => {
    const init = async () => {
      await refresh();
      setLoading(false);

      // Returning from a Plex sign-in redirect (?plexPin=<id>)
      const params = new URLSearchParams(window.location.search);
      const pin = Number(params.get("plexPin"));
      if (!pin) return;
      params.delete("plexPin");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);

      setPinPending(true);
      try {
        const result = await waitForPlexPin(pin, () => false);
        if (result === "ok") await refresh();
        else setLoginError("The Plex sign-in expired. Please try again.");
      } catch (error) {
        setLoginError(plexLoginErrorMessage(error));
      } finally {
        setPinPending(false);
      }
    };
    init();
  }, [refresh]);

  const adminPanel = (
    <AdminPanel
      isOpen={showAdminPanel}
      onClose={() => {
        setShowAdminPanel(false);
        refresh();
      }}
    />
  );

  if (loading || !config) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading Plex Wrapped…
      </div>
    );
  }

  // Show setup screen if not configured
  if (!config.configured) {
    return (
      <>
        <ChristmasMusic />
        <div className="min-h-screen flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-noise pointer-events-none" />

          <div className="text-center max-w-md relative z-10">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl gradient-bg mb-6 glow">
              <Sparkles className="w-10 h-10 text-primary" />
            </div>

            <h1 className="text-4xl md:text-5xl font-extrabold mb-3 gradient-text">
              Plex Wrapped
            </h1>

            <p className="text-muted-foreground text-lg mb-8">
              Plex Wrapped is not configured yet
            </p>

            <Button
              size="lg"
              onClick={() => setShowAdminPanel(true)}
              className="bg-gradient-to-r from-cyan to-pink hover:opacity-90 transition-opacity"
            >
              <Shield className="w-5 h-5 mr-2" />
              Open Admin Panel
            </Button>

            <p className="text-sm text-muted-foreground mt-6">
              Server administrators can configure Tautulli connection
            </p>
          </div>
        </div>

        {adminPanel}
      </>
    );
  }

  // Plex Login mode: sign in first (admins are let through)
  if (config.settings.accessMode === "plex" && !session.viewer && !session.isAdmin) {
    return (
      <>
        <ChristmasMusic />
        <PlexLogin
          serverName={config.plexServerName}
          initialError={loginError}
          pending={pinPending}
          onSignedIn={refresh}
          onOpenAdmin={() => setShowAdminPanel(true)}
        />
        {adminPanel}
      </>
    );
  }

  // Remount the report whenever who is viewing (or how) changes, so no state leaks between sessions
  const reportKey = [config.settings.accessMode, session.viewer?.kind, session.viewer?.userId, session.isAdmin, session.canViewAnyone].join(":");

  return (
    <>
      <ChristmasMusic />
      <WrappedReport key={reportKey} publicConfig={config} session={session} onRefresh={refresh} />
    </>
  );
}
