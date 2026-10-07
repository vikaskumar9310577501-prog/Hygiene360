import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Phone browsers allow the live camera only on HTTPS; move LAN visitors on plain HTTP to the HTTPS port
const HTTPS_PORT = 5443;
const { protocol, hostname, pathname, search, hash } = window.location;
const isLocal = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '[::1]';
const isLanIp = /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);

if (protocol === 'http:' && !isLocal) {
  const port = isLanIp ? `:${HTTPS_PORT}` : '';
  window.location.replace(`https://${hostname}${port}${pathname}${search}${hash}`);
} else {
  createRoot(document.getElementById('root')).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
