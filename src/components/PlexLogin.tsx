import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, LogIn, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomLogo } from "./CustomLogo";
import { api } from "@/lib/api";
import { plexLoginErrorMessage, waitForPlexPin } from "@/lib/plexAuth";
import { getServerAdminSettings } from "@/lib/serverConfig";
import { getDisplayTitle } from "@/lib/adminStorage";
import { isStandalone } from "@/lib/pwa";

interface PlexLoginProps {
  serverName: string | null;
  initialError?: string | null;
  pending?: boolean;
  onSignedIn: () => void;
  onOpenAdmin: () => void;
}

export const PlexLogin = ({ serverName, initialError, pending = false, onSignedIn, onOpenAdmin }: PlexLoginProps) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(initialError ?? null);
  const unmounted = useRef(false);
  const title = getDisplayTitle(getServerAdminSettings());

  useEffect(() => setError(initialError ?? null), [initialError]);
  useEffect(
    () => () => {
      unmounted.current = true;
    },
    []
  );

  const signIn = async () => {
    setError(null);
    setBusy(true);
    // Open the popup synchronously in the click handler so popup blockers allow it.
    // Installed apps can't track a popup reliably, so they always use the redirect.
    const popup = isStandalone() ? null : window.open("", "plex-auth", "width=600,height=720");
    try {
      const forwardUrl = popup ? undefined : `${window.location.origin}${window.location.pathname}`;
      const { id, authUrl } = await api.plexCreatePin(forwardUrl);

      if (!popup) {
        // Popup blocked (common on mobile) or installed app: continue with a full-page redirect
        window.location.href = authUrl;
        return;
      }
      popup.location.href = authUrl;

      // Keep polling briefly after the popup closes, in case it closed right after approving
      let closedAt: number | null = null;
      const result = await waitForPlexPin(id, () => {
        if (unmounted.current) return true;
        if (popup.closed) {
          closedAt ??= Date.now();
          return Date.now() - closedAt > 5000;
        }
        return false;
      });
      if (!popup.closed) popup.close();

      if (result === "ok") {
        onSignedIn();
      } else if (result === "expired") {
        setError("The Plex sign-in expired. Please try again.");
      }
    } catch (err) {
      if (popup && !popup.closed) popup.close();
      setError(plexLoginErrorMessage(err));
    } finally {
      if (!unmounted.current) setBusy(false);
    }
  };

  const working = busy || pending;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <div className="fixed inset-0 bg-noise pointer-events-none" />

      <Button
        variant="outline"
        size="sm"
        onClick={onOpenAdmin}
        className="absolute top-4 right-4 text-muted-foreground hover:text-foreground"
        aria-label="Admin panel"
      >
        <Shield className="w-4 h-4" />
      </Button>

      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md relative z-10">
        <CustomLogo className="mx-auto mb-6" />
        <h1 className="text-5xl md:text-7xl font-extrabold mb-4">
          <span className="gradient-text glow-text">{title}</span>
        </h1>
        <p className="text-xl text-muted-foreground mb-8">
          Sign in with Plex to see your stats{serverName ? ` on ${serverName}` : ""}
        </p>

        <Button
          size="lg"
          onClick={signIn}
          disabled={working}
          className="text-lg px-8 bg-[#e5a00d] hover:bg-[#cc8f0c] text-black font-semibold"
        >
          {working ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <LogIn className="w-5 h-5 mr-2" />}
          {working ? "Waiting for Plex..." : "Sign in with Plex"}
        </Button>

        {error && <p className="mt-6 text-sm text-destructive">{error}</p>}

        <p className="text-xs text-muted-foreground/70 mt-8">
          Only accounts with access to this Plex server can sign in.
        </p>
      </motion.div>
    </div>
  );
};
