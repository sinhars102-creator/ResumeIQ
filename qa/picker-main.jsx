import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "../src/index.css";
import "../src/ResumeLLM.css";
import TemplatePicker from "../src/TemplatePicker.jsx";
import { DEFAULT_DESIGN } from "../src/resumeTemplates.js";
import { resume } from "./resume-fixture.js";

function App() {
  const [id, setId] = useState("sidebar-light");
  const [design, setDesign] = useState(DEFAULT_DESIGN);
  return (
    <div className="rl-app" style={{ padding: 24 }}>
      <div className="rl-modal rl-modal-wide" style={{ position: "static", margin: "0 auto", maxHeight: "none", overflow: "visible" }}>
        <h2 id="title">Design your resume</h2>
        <TemplatePicker resume={resume} selected={id} onSelect={setId} design={design} onDesign={setDesign} />
        <button id="go" type="button" className="rl-btn rl-btn-primary rl-wide">Continue</button>
      </div>
    </div>
  );
}
createRoot(document.getElementById("root")).render(<App />);
