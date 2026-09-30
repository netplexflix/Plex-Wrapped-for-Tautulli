import { useState } from "react";
import { User, Lock, ArrowRight, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api";
import { toast } from "sonner";

interface UsernameInputProps {
  onSelectUser: (userId: number) => void;
}

// Discreet mode: users type their exact username (and password, if enabled).
// Both are checked by the server; the user list never reaches the browser.
export const UsernameInput = ({ onSelectUser }: UsernameInputProps) => {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [matchedUser, setMatchedUser] = useState<{ userId: number; friendlyName: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const handleUsernameSubmit = async () => {
    if (!username.trim()) {
      toast.error("Please enter a username");
      return;
    }

    // Prevent "user" as username in discreet mode
    if (username.trim().toLowerCase() === "user") {
      toast.error("Invalid username. Please enter a specific user.");
      return;
    }

    setBusy(true);
    try {
      const user = await api.lookupUser(username.trim());
      if (user.needsPassword) {
        setMatchedUser(user);
      } else {
        onSelectUser(user.userId);
        setUsername("");
      }
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 404 ? "User not found" : (error as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handlePasswordSubmit = async () => {
    if (!matchedUser) return;
    setBusy(true);
    try {
      await api.passwordLogin(matchedUser.userId, password);
      onSelectUser(matchedUser.userId);
      handleClear();
    } catch (error) {
      toast.error(error instanceof ApiError && error.status === 401 ? "Incorrect password" : (error as Error).message);
      handleClear();
    } finally {
      setBusy(false);
    }
  };

  const handleClear = () => {
    setUsername("");
    setPassword("");
    setMatchedUser(null);
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <User className="w-5 h-5 text-primary" />
        <div className="flex items-center gap-2 flex-1">
          <Input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Enter username"
            className="bg-card border-border"
            onKeyDown={(e) => e.key === "Enter" && handleUsernameSubmit()}
            disabled={Boolean(matchedUser) || busy}
          />
          {!matchedUser && (
            <Button size="icon" onClick={handleUsernameSubmit} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </Button>
          )}
        </div>
      </div>

      {matchedUser && (
        <div className="flex items-center gap-3">
          <Lock className="w-5 h-5 text-primary" />
          <div className="flex items-center gap-2 flex-1">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={`Password for ${matchedUser.friendlyName}`}
              className="bg-card border-border"
              onKeyDown={(e) => e.key === "Enter" && handlePasswordSubmit()}
              autoFocus
            />
            <Button size="icon" onClick={handlePasswordSubmit} disabled={busy}>
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
            </Button>
            <Button size="icon" variant="outline" onClick={handleClear}>
              ×
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};
