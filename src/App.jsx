import { lazy, Suspense, useEffect, useState } from "react";
import { Analytics } from "@vercel/analytics/react";
import ErrorBoundary from "./ErrorBoundary.jsx";

// The product (PDF parsing, jsPDF, etc.) is a large bundle, so it only loads when someone opens it.
const ResumeIQ = lazy(() => import("./ResumeIQ"));
// Resume LLM: chat-first resume editing. It is the home page ("/" and any address that isn't under /app).
const ResumeLLM = lazy(() => import("./ResumeLLM"));

// The Resume LLM is the product: it opens at "/", at /app/editor (the address the editor ads use), and at /app/resume-llm and
// the older /app/tailor. The earlier sign-in-first editor and job matches stay under the rest of /app.
const isResumeLlmPath = (path) => /^\/app\/(resume-llm|tailor|editor)/.test(path);

// After a crash, "Start a new chat" removes only the chat that was open (the likely cause); the other chats are kept.
function removeActiveChat() {
  const KEY = "riq_resume_llm_v1";
  try {
    const store = JSON.parse(localStorage.getItem(KEY) || "null");
    if (store && Array.isArray(store.chats)) {
      localStorage.setItem(KEY, JSON.stringify({ ...store, chats: store.chats.filter((c) => c?.id !== store.activeId), activeId: null }));
    } else localStorage.removeItem(KEY);
  } catch {
    try { localStorage.removeItem(KEY); } catch { /* storage blocked: reloading is all that is left */ }
  }
}

// Under "/app" the older product screens still open (sign-in, job matches); everything else is the Resume LLM home.
const isOlderAppPath = (path) => path.startsWith("/app") && !isResumeLlmPath(path);

function App() {
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  return (
    <>
      <Suspense fallback={<div style={{ padding: 48, textAlign: "center", color: "#5b6068" }}>Loading ResumeIQ…</div>}>
        {isOlderAppPath(path) ? (
          <ResumeIQ />
        ) : (
          <ErrorBoundary onReset={removeActiveChat}>
            <ResumeLLM />
          </ErrorBoundary>
        )}
      </Suspense>
      <Analytics />
    </>
  );
}

export default App;
