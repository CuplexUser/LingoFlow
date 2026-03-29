import { Component, type ErrorInfo, type ReactNode } from "react";

type SessionPlayerErrorBoundaryProps = {
  children: ReactNode;
};

type SessionPlayerErrorBoundaryState = {
  hasError: boolean;
};

export class SessionPlayerErrorBoundary extends Component<
  SessionPlayerErrorBoundaryProps,
  SessionPlayerErrorBoundaryState
> {
  state: SessionPlayerErrorBoundaryState = {
    hasError: false
  };

  static getDerivedStateFromError(): SessionPlayerErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(_error: Error, _errorInfo: ErrorInfo) {
    // Fallback UI prevents hard crashes from blanking out the whole app shell.
  }

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <section className="panel lesson-player">
        <h2>Session interrupted</h2>
        <p className="subtitle">
          Something unexpected happened in this exercise. Exit and start a fresh session to continue.
        </p>
      </section>
    );
  }
}
