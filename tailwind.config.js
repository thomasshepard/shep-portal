import fs from 'node:fs'
import path from 'node:path'
import plugin from 'tailwindcss/plugin'
import colors from 'tailwindcss/colors'

// ── Dark mode ───────────────────────────────────────────────────────────────
// Every palette colour the app uses is a CSS variable (`--c-<family>-<shade>`),
// so `bg-white`-style light utilities flip automatically when `<html class="dark">`.
// Light values are Tailwind's defaults; dark values come from DARK_SHADE / NEUTRAL_DARK.
// Fill utilities (bg-X-600…950) and light-on-dark text (text-X-50…300) must NOT
// flip — they are pinned back to their original colour under `.dark` (see PINS below).

const NEUTRALS = ['gray', 'slate', 'stone']
const TINTED = ['red', 'orange', 'amber', 'yellow', 'green', 'emerald', 'teal', 'cyan', 'blue', 'indigo', 'violet', 'purple', 'fuchsia', 'pink']
const SHADES = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

// dark shade -> which light shade's value it takes (tinted families)
const DARK_SHADE = {
  50: '950', 100: '900', 200: '800', 300: '700', 400: '400', 500: '500',
  600: '400', 700: '300', 800: '200', 900: '100', 950: '50',
}

// neutral dark ramp (r g b)
const NEUTRAL_DARK = {
  50: '22 33 53', 100: '28 41 64', 200: '42 58 85', 300: '59 77 107',
  400: '100 116 139', 500: '132 148 171', 600: '163 177 198', 700: '195 206 221',
  800: '219 227 238', 900: '241 245 249', 950: '248 250 252',
}

function hexToTriplet(hex) {
  const h = hex.replace('#', '')
  return [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)).join(' ')
}

const families = [...NEUTRALS, ...TINTED]
const themeColors = {}
const lightVars = { '--page': '249 250 251', '--surface': '255 255 255' }
const darkVars = { '--page': '11 18 32', '--surface': '17 26 44' }

for (const fam of families) {
  themeColors[fam] = {}
  for (const shade of SHADES) {
    const v = `--c-${fam}-${shade}`
    themeColors[fam][shade] = `rgb(var(${v}) / <alpha-value>)`
    lightVars[v] = hexToTriplet(colors[fam][shade])
    darkVars[v] = NEUTRALS.includes(fam)
      ? NEUTRAL_DARK[shade]
      : hexToTriplet(colors[fam][DARK_SHADE[shade]])
  }
}

// Pinned utilities: scan the source for fills and light-on-dark text that must
// keep their original colour in dark mode.
const SRC = path.resolve('src')
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(e =>
    e.isDirectory() ? walk(path.join(dir, e.name)) : /\.(jsx?|css)$/.test(e.name) ? [path.join(dir, e.name)] : []
  )
}
const famRe = families.join('|')
const pinRe = new RegExp(`\\b((?:bg-(?:${famRe})-(?:600|700|800|900|950))|(?:text-(?:${famRe})-(?:50|100|200|300)))(?:\\/(\\d{1,3}))?(?![\\w-])`, 'g')
const pins = new Map() // class name -> { prop, hex, alpha }
for (const file of walk(SRC)) {
  const src = fs.readFileSync(file, 'utf8')
  for (const m of src.matchAll(pinRe)) {
    const [, base, alpha] = m
    const [prefix, fam, shade] = base.split('-')
    const key = alpha ? `${base}/${alpha}` : base
    pins.set(key, {
      prop: prefix === 'bg' ? 'background-color' : 'color',
      rgb: hexToTriplet(colors[fam][shade]),
      alpha: alpha ? Number(alpha) / 100 : 1,
    })
  }
}

const esc = cls => cls.replace(/[:/]/g, '\\$&')
const VARIANTS = [
  cls => `.dark .${esc(cls)}`,
  cls => `.dark .${esc('hover:' + cls)}:hover`,
  cls => `.dark .${esc('focus:' + cls)}:focus`,
  cls => `.dark .${esc('active:' + cls)}:active`,
  cls => `.dark .${esc('disabled:' + cls)}:disabled`,
  cls => `.dark .group:hover .${esc('group-hover:' + cls)}`,
]

const darkMode = plugin(({ addBase }) => {
  const base = { ':root': lightVars, '.dark': { ...darkVars, 'color-scheme': 'dark' } }
  for (const [cls, { prop, rgb, alpha }] of pins) {
    const value = `rgb(${rgb} / ${alpha})`
    for (const sel of VARIANTS) base[sel(cls)] = { [prop]: value }
  }
  // bg-white is the card surface; text-white is untouched.
  for (const sel of VARIANTS) {
    base[sel('bg-white')] = { 'background-color': 'rgb(var(--surface) / var(--tw-bg-opacity, 1))' }
  }
  addBase(base)
})

/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        ...themeColors,
        page: 'rgb(var(--page) / <alpha-value>)',
        surface: 'rgb(var(--surface) / <alpha-value>)',
      },
    },
  },
  plugins: [darkMode],
}
