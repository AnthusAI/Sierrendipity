import "@xterm/xterm/css/xterm.css";
import "./monaco";
import "./styles.css";
import { Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";

// The app must never blank: show what happened and offer a reload.
class ErrorBoundary extends Component<{ children: ReactNode }, { error?: Error }> {
  state: { error?: Error } = {};
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="center" role="alert">
        <h1>Something went wrong</h1>
        <p>{this.state.error.message}</p>
        <button onClick={() => location.reload()}>Reload</button>
      </div>
    );
  }
}

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);
