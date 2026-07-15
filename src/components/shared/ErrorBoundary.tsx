import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import styles from './ErrorBoundary.module.css';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Top-level safety net. Without this, any render-time throw (e.g. a
 * context hook used outside its provider) unmounts the entire React
 * tree with no visible feedback — a blank/black window and a console
 * error the user never sees. This never replaces fixing the underlying
 * bug; it exists so future regressions fail loudly instead of silently.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Athena crashed while rendering:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className={styles.crash} role="alert">
          <p className={styles.title}>Something went wrong.</p>
          <p className={styles.message}>{this.state.error.message}</p>
        </div>
      );
    }

    return this.props.children;
  }
}