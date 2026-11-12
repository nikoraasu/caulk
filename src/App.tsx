import { useState, useCallback } from "react";
import { boardKey, clearSession, loadSession, loadTarget, type Session } from "./config";
import { BoardScreen } from "./ui/BoardScreen";
import { SetupScreen } from "./ui/SetupScreen";
import { ErrorBoundary } from "./ui/ErrorBoundary";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    // Check if the current URL explicitly points to a board (via query params or hash)
    const hash = window.location.hash.replace(/^#/, "");
    const search = new URLSearchParams(window.location.search);
    const hashParams = new URLSearchParams(hash);
    const hasExplicitBoardUrl = Boolean(
      search.get("board") ||
        hashParams.get("board") ||
        (hash.includes("/") && hash.split("/").length >= 2),
    );

    // Check if this browser tab had an actively open board (preserved across page refresh F5)
    let isTabSessionActive = false;
    try {
      isTabSessionActive = sessionStorage.getItem("caulk.active_session.v1") === "true";
    } catch {}

    if (hasExplicitBoardUrl || isTabSessionActive) {
      const target = loadTarget();
      return target ? loadSession(target) : null;
    }

    // On fresh visits (new tab, browser restart), do not auto-open the last board.
    // Instead, land on SetupScreen (which renders HomeDashboard if logged in) so
    // users can select boards cleanly with fresh GitHub authentication and zero desyncs.
    return null;
  });

  const handleCloseBoard = useCallback(() => {
    clearSession();
    setSession(null);
  }, []);

  if (!session) {
    return (
      <ErrorBoundary>
        <SetupScreen onReady={setSession} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <BoardScreen
        key={boardKey(session)}
        session={session}
        onClose={handleCloseBoard}
      />
    </ErrorBoundary>
  );
}
