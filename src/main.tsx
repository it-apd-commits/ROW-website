import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
// PWA disabled temporarily
import { registerSW } from 'virtual:pwa-register'

// Register Service Worker for PWA
registerSW({ immediate: true })

// The app manages its own scroll position on navigation (e.g. BeneficiaryList's
// sessionStorage-based restore). Left on 'auto', the browser's native scroll
// restoration on back/forward can race with that and win, snapping the page
// back to the top after the app already restored it.
if ('scrollRestoration' in window.history) {
  window.history.scrollRestoration = 'manual'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
