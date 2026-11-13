import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics, identifyUser, resetAnalytics } from './analytics.js'
import { saveAttribution } from './attribution.js'
import { supabase } from './easyApply/supabaseClient.js'
import CookieNotice from './CookieNotice.jsx'

initAnalytics()

// Every sign-in (including a session restored on page load) links analytics to the account and
// saves where the user came from; signing out starts a fresh anonymous visitor.
supabase?.auth.onAuthStateChange((event, session) => {
  if (session?.user) {
    identifyUser(session.user)
    // Deferred: Supabase calls made inside this callback can wait on the auth lock.
    setTimeout(() => saveAttribution(supabase, session.user), 0)
  } else if (event === 'SIGNED_OUT') {
    resetAnalytics()
  }
})

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <CookieNotice />
  </StrictMode>,
)
