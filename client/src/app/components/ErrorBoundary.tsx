import React, { Component, ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({
      error,
      errorInfo,
    });
    
    // You can log to an error reporting service here
    // logErrorToService(error, errorInfo);
  }

  handleReload = () => {
    window.location.reload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
          <div className="max-w-2xl w-full bg-white dark:bg-gray-800 rounded-xl shadow-xl p-6 md:p-8 text-center">
            <h2 className="text-2xl md:text-3xl font-bold mb-4 text-red-600 dark:text-red-400">
              Something went wrong
            </h2>
            <p className="mb-6 text-gray-600 dark:text-gray-400">
              An unexpected error occurred. Please try reloading the page.
            </p>
            {process.env.NODE_ENV === 'development' && this.state.error && (
              <details className="mb-6 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg text-left">
                <summary className="cursor-pointer font-semibold mb-2 text-gray-900 dark:text-white">
                  Error Details (Development Only)
                </summary>
                <pre className="text-xs overflow-auto text-red-600 dark:text-red-400">
                  {this.state.error.toString()}
                  {this.state.errorInfo?.componentStack}
                </pre>
              </details>
            )}
            <div className="flex gap-3 justify-center">
              <button
                onClick={this.handleReload}
                className="px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
              >
                Reload Page
              </button>
              <button
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/';
                }}
                className="px-6 py-3 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors font-semibold"
              >
                Clear Data & Login
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
