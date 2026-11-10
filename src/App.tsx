import { useState } from "react";
import { boardKey, clearSession, loadSession, loadTarget, type Session } from "./config";
import { BoardScreen } from "./ui/BoardScreen";
import { SetupScreen } from "./ui/SetupScreen";
import { ErrorBoundary } from "./ui/ErrorBoundary";

export default function App() {
  const [session, setSession] = useState<Session | null>(() => {
    const target = loadTarget();
    return target ? loadSession(target) : null;
  });

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
        onClose={() => {
          clearSession();
          setSession(null);
        }}
      />
    </ErrorBoundary>
  );
}
