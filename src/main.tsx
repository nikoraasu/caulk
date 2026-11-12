import { createRoot } from "react-dom/client";
import "@excalidraw/excalidraw/index.css";
import "./styles.css";
import "./features/tasks/tasks.css";
import App from "./App";

const container = document.getElementById("root");
if (!container) throw new Error("Missing #root");
createRoot(container).render(<App />);
