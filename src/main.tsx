import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ReadAloudProvider } from "./context/ReadAloudContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

window.addEventListener('error', (event) => {
  try {
    fetch("/api/aistudio-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CLIENT_WINDOW_ERROR",
        message: event.message,
        args: [event.filename, event.lineno, event.colno, event.error?.stack],
      }),
    });
  } catch(e) {}
});

window.addEventListener('unhandledrejection', (event) => {
  try {
    fetch("/api/aistudio-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CLIENT_UNHANDLED_REJECTION",
        message: event.reason?.message || 'Unhandled Promise Rejection',
        args: [event.reason?.stack || event.reason],
      }),
    });
  } catch(e) {}
});

const originalConsoleError = console.error;
console.error = (...args) => {
  originalConsoleError(...args);
  try {
    fetch("/api/aistudio-logs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "CLIENT_CONSOLE_ERROR",
        message: args[0]?.toString() || 'Console Error',
        args: args.slice(1).map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)),
      }),
    });
  } catch(e) {}
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ReadAloudProvider>
        <App />
      </ReadAloudProvider>
    </ErrorBoundary>
  </StrictMode>,
);
