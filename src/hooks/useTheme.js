import { useSyncExternalStore } from 'react'

// Theme preference: 'system' (follow OS) | 'light' | 'dark'. Stored per-device.
// index.html applies the class before first paint; this keeps it in sync after.
const KEY = 'shep_theme'
const media = window.matchMedia('(prefers-color-scheme: dark)')
const listeners = new Set()

function readPref() {
  try {
    const v = localStorage.getItem(KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch {
    return 'system'
  }
}

let pref = readPref()

function apply() {
  const dark = pref === 'dark' || (pref === 'system' && media.matches)
  document.documentElement.classList.toggle('dark', dark)
}

function emit() {
  apply()
  listeners.forEach(l => l())
}

media.addEventListener('change', () => pref === 'system' && emit())
apply()

export function setThemePref(next) {
  pref = next
  try {
    if (next === 'system') localStorage.removeItem(KEY)
    else localStorage.setItem(KEY, next)
  } catch { /* storage unavailable */ }
  emit()
}

export function useTheme() {
  const current = useSyncExternalStore(
    cb => { listeners.add(cb); return () => listeners.delete(cb) },
    () => pref,
  )
  return [current, setThemePref]
}
