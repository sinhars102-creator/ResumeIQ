import { lazy, Suspense, useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import Landing from "./Landing";

// The product (PDF parsing, jsPDF, etc.) is a large bundle, so it only loads when someone opens it.
const ResumeIQ = lazy(() => import("./ResumeIQ"));
// Resume LLM: chat-first resume editing. The home page's "Edit my resume" / "Resume editor" (/app/editor)
// opens it; /app/resume-llm and the older /app/tailor too.
const ResumeLLM = lazy(() => import("./ResumeLLM"));

// Launch switch (module M9). When on, /app/editor (what the home page's "Edit my resume" and the editor ads open) shows
// Resume LLM; when off it shows the earlier sign-in-first editor. /app/resume-llm and /app/tailor always open Resume LLM,
// so it can be tried on the live site before the switch. Local development always has it on. To switch it on in
// production set VITE_RESUME_LLM=1 and redeploy; to switch back, remove it and redeploy.
const RESUME_LLM_EDITOR = import.meta.env.DEV || import.meta.env.VITE_RESUME_LLM === "1";
const isResumeLlmPath = (path) => /^\/app\/(resume-llm|tailor)/.test(path) || (RESUME_LLM_EDITOR && /^\/app\/editor/.test(path));

// "/app" shows the product; every other path shows the marketing landing page.
const isAppPath = (path) => path.startsWith("/app");

function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const openApp = (to = "/app") => {
    window.history.pushState({}, "", to);
    setPath(to);
    window.scrollTo(0, 0);
  };

  return (
    <>
      {isAppPath(path) ? (
        <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "#5b6068" }}>Loading ResumeIQ…</div>}>
          {isResumeLlmPath(path) ? <ResumeLLM /> : <ResumeIQ />}
        </Suspense>
      ) : (
        <Landing onStart={openApp} />
      )}
      <Analytics />
    </>
  );
}

export default App;
