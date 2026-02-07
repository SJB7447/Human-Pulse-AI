import { createRoot } from "react-dom/client";
import App from "./App";
import "@fontsource/playfair-display/400.css";
import "@fontsource/playfair-display/700.css";
import "@fontsource/merriweather/400.css";
import "@fontsource/merriweather/700.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
