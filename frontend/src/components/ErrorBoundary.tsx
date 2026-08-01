import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  componentStack: string | null;
}

/**
 * Catches render-time errors so a single broken page shows a readable message
 * instead of unmounting the whole app to a blank screen (React 19 tears down
 * the entire root on an uncaught render error when there's no boundary).
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null, componentStack: null };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep the full detail in the console for debugging.
    console.error('[ErrorBoundary] Render crash:', error, info.componentStack);
    this.setState({ componentStack: info.componentStack ?? null });
  }

  handleReset = () => {
    this.setState({ error: null, componentStack: null });
  };

  render() {
    const { error, componentStack } = this.state;
    if (!error) return this.props.children;

    return (
      <div
        style={{
          padding: '32px',
          maxWidth: 900,
          margin: '0 auto',
          color: 'var(--text-1, #f5f5f5)',
        }}
      >
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something crashed on this page</h1>
        <p style={{ color: 'var(--text-2, #888)', marginBottom: 16 }}>
          The error is shown below. Nothing else in the app was affected — use the
          sidebar to navigate away, or reset this view.
        </p>
        <pre
          style={{
            background: 'var(--surface-2, #1a1a1a)',
            border: '1px solid var(--red, #f87171)',
            borderRadius: 8,
            padding: '12px 14px',
            fontSize: 12.5,
            lineHeight: 1.5,
            color: 'var(--red, #f87171)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word',
            overflowX: 'auto',
          }}
        >
          {error.message}
          {error.stack ? `\n\n${error.stack}` : ''}
          {componentStack ? `\n\nComponent stack:${componentStack}` : ''}
        </pre>
        <button
          type="button"
          className="btn btn--secondary"
          style={{ marginTop: 16 }}
          onClick={this.handleReset}
        >
          Reset view
        </button>
      </div>
    );
  }
}
