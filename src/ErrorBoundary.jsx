import { Component } from "react";

/** Catches a render crash so the page shows a way out instead of staying blank. */
export default class ErrorBoundary extends Component {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch(error) {
    console.error("Page crashed", error);
  }
  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 480, margin: "80px auto", padding: 24, textAlign: "center", fontFamily: "system-ui, sans-serif", color: "#1f2933" }}>
        <h1 style={{ fontSize: 22, margin: "0 0 8px" }}>Something went wrong on this page</h1>
        <p style={{ color: "#4a5560", margin: "0 0 16px" }}>Reload to try again. If it keeps happening, start a new chat: that removes only the chat that was open and keeps your others.</p>
        <button type="button" onClick={() => window.location.reload()} style={{ minHeight: 44, padding: "0 20px", marginRight: 8, cursor: "pointer" }}>Reload</button>
        <button
          type="button"
          onClick={() => {
            try {
              this.props.onReset?.();
            } catch {
              // Storage blocked: reloading still works.
            }
            window.location.reload();
          }}
          style={{ minHeight: 44, padding: "0 20px", cursor: "pointer" }}
        >
          Start a new chat
        </button>
      </div>
    );
  }
}
