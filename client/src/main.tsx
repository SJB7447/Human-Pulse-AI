import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/playfair-display/latin-400.css";
import "@fontsource/playfair-display/latin-700.css";
import "@fontsource/merriweather/latin-400.css";
import "@fontsource/merriweather/latin-700.css";
import "./index.css";
import { registerServiceWorker } from "./hooks/usePWA";

createRoot(document.getElementById("root")!).render(<App />);

if (import.meta.env.PROD) {
  registerServiceWorker();
}
