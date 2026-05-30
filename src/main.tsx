import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { ReadAloudProvider } from "./context/ReadAloudContext";
import { ErrorBoundary } from "./components/ErrorBoundary";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <ReadAloudProvider>
        <App />
      </ReadAloudProvider>
    </ErrorBoundary>
  </StrictMode>,
);
