import React from 'react'
import ReactDOM from 'react-dom/client'

import './styles.css'
import App from './App.jsx'

if (import.meta.env.DEV) {
  window.__errs = []
  window.addEventListener('error', (e) => window.__errs.push(String(e.error?.stack ?? e.message).slice(0, 300)))
  window.addEventListener('unhandledrejection', (e) => window.__errs.push('rej: ' + String(e.reason?.stack ?? e.reason).slice(0, 300)))
  const origErr = console.error.bind(console)
  console.error = (...a) => { window.__errs.push('console: ' + a.map(String).join(' ').slice(0, 300)); origErr(...a) }
}

try {
  // 初始元素转换在模块顶层执行，失败在这里可见
  window.__initOk = true
} catch (e) {
  window.__errs?.push('module: ' + String(e))
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
