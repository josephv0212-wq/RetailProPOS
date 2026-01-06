
import React, { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./app/App.tsx";
import { AuthProvider } from "./app/contexts/AuthContext";
import { ErrorBoundary } from "./app/components/ErrorBoundary";
import "./styles/index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ErrorBoundary>
  </StrictMode>
);
  