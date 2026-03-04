import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'
import Dashboard from './Dashboard.jsx'

const Root = window.location.pathname.startsWith('/dashboard') ? Dashboard : App

createRoot(document.getElementById('root')).render(
  <StrictMode><Root /></StrictMode>
)
