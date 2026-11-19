import { lazy, Suspense, useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import Landing from "./Landing";

// The product (PDF parsing, jsPDF, etc.) is a large bundle, so it only loads when someone opens it.
const ResumeIQ = lazy(() => import("./ResumeIQ"));
// Prototype: Resume LLM, chat-first resume tailoring (/app/resume-llm, and the older /app/tailor). Not linked yet.
const ResumeLLM = lazy(() => import("./ResumeLLM"));

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
          {/^\/app\/(resume-llm|tailor)/.test(path) ? <ResumeLLM /> : <ResumeIQ />}
        </Suspense>
      ) : (
        <Landing onStart={openApp} />
      )}
      <Analytics />
    </>
  );
}

export default App;
