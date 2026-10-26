import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { initAnalytics } from './analytics.js'
import { initGoogleAds } from './googleAds.js'
import CookieNotice from './CookieNotice.jsx'

initAnalytics()
initGoogleAds()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
    <CookieNotice />
  </StrictMode>,
)
