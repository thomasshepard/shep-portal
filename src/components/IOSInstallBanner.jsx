import { useState, useEffect } from 'react'

const STORAGE_KEY = 'ios_install_banner_dismissed'

function isIPhoneSafari() {
  const ua         = navigator.userAgent
  const isIPhone   = /iPhone/.test(ua)
  const isSafari   = /Safari/.test(ua) && !/CriOS|FxiOS|OPiOS/.test(ua)
  const standalone = window.navigator.standalone === true
  return isIPhone && isSafari && !standalone
}

export default function IOSInstallBanner() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (isIPhoneSafari() && !localStorage.getItem(STORAGE_KEY)) {
      setVisible(true)
    }
  }, [])

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, '1')
    setVisible(false)
  }

  if (!visible) return null

  return (
    <div
      style={{ zIndex: 9998 }}
      className="fixed bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl border-t border-slate-200 px-5 pt-4 pb-6 flex items-start gap-4"
    >
      {/* Share icon */}
      <div className="flex-shrink-0 mt-0.5 w-9 h-9 bg-slate-900 rounded-xl flex items-center justify-center">
        <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-5 h-5">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </div>
      <div className="flex-1">
        <p className="text-sm font-semibold text-slate-900 mb-0.5">Get push notifications</p>
        <p className="text-sm text-slate-500 leading-snug">
          Tap <strong>Share</strong> then <strong>"Add to Home Screen"</strong> to enable alerts on your iPhone.
        </p>
      </div>
      <button
        onClick={dismiss}
        className="flex-shrink-0 text-slate-400 hover:text-slate-600 mt-0.5 p-1"
        aria-label="Dismiss"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="w-4 h-4">
          <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </button>
    </div>
  )
}
