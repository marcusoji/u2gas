import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { MOCKS_ENABLED, bootstrapRoleFromUrl } from "./mocks/gate";
import "./styles/tokens.css";
import "./styles/components.css";

// Before the first render, so a `?as=staff` deep link lands in the right app
// rather than bouncing through the customer root.
if (MOCKS_ENABLED) bootstrapRoleFromUrl();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
