import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { initPwa } from "./lib/pwa";
import "./index.css";

initPwa();

createRoot(document.getElementById("root")!).render(<App />);
