import React, { ErrorInfo, ReactNode } from "react";

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<any, any> {
  public props!: Props;
  public state!: State;

  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  public render() {
    const { hasError, error } = this.state as State;
    const { fallback, children } = this.props as Props;

    if (hasError) {
      if (fallback) {
        return fallback;
      }

      return (
        <div className="flex flex-col items-center justify-center min-h-screen bg-[#0a0a0a] text-white p-6">
          <div className="bg-red-500/10 border border-red-500/20 p-6 rounded-xl max-w-lg w-full text-center space-y-4">
            <h2 className="text-xl font-bold text-red-400">
              Oops, something went wrong
            </h2>
            <p className="text-sm text-neutral-400">
              The application encountered an unexpected error.
            </p>
            <div className="text-xs text-left bg-black/50 p-4 rounded-lg overflow-auto max-h-48 whitespace-pre-wrap font-mono text-red-300">
              {error?.toString()}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="px-6 py-2 bg-neutral-800 hover:bg-neutral-700 transition rounded-lg font-medium text-sm"
            >
              Reload Page
            </button>
          </div>
        </div>
      );
    }

    return children;
  }
}
