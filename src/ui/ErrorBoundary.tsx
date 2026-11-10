import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  hasError: boolean;
  error: Error | null;
};

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("Caulk Uncaught Error:", error, errorInfo);
  }

  handleReload = (): void => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  handleDismiss = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "#151A13",
            color: "#E6D6AC",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            fontFamily: "monospace",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              maxWidth: 600,
              background: "#283125",
              border: "1px solid #7D6B27",
              boxShadow: "0 8px 32px rgba(0,0,0,0.8)",
              padding: 24,
            }}
          >
            <h2 style={{ color: "#E2B038", margin: "0 0 12px 0" }}>
              ⚠️ Whiteboard Error Encountered
            </h2>
            <p style={{ fontSize: 13, lineHeight: 1.5, margin: "0 0 16px 0", color: "#FFFFFF" }}>
              An unexpected render issue occurred:
            </p>
            <pre
              style={{
                background: "#151A13",
                padding: 12,
                fontSize: 12,
                color: "#f87171",
                overflowX: "auto",
                border: "1px solid #3B4438",
                marginBottom: 16,
              }}
            >
              {this.state.error?.message || "Unknown error"}
            </pre>
            <div style={{ display: "flex", gap: 8 }}>
              <button
                type="button"
                className="btn primary"
                onClick={this.handleReload}
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                Reload Whiteboard
              </button>
              <button
                type="button"
                className="btn ghost"
                onClick={this.handleDismiss}
                style={{ padding: "6px 14px", fontSize: 12 }}
              >
                Try to Dismiss
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
