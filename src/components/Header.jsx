import { Menu, Sun, Moon, Monitor } from 'lucide-react'
import { useAuth } from '../hooks/useAuth'
import { useTheme } from '../hooks/useTheme'
import NotificationBell from './NotificationBell'

const THEME_ICON = { system: Monitor, light: Sun, dark: Moon }
const NEXT_THEME = { system: 'light', light: 'dark', dark: 'system' }

export default function Header({ onMenuToggle }) {
  const { session, profile } = useAuth()
  const [theme, setTheme] = useTheme()
  const ThemeIcon = THEME_ICON[theme]
  const displayName = profile?.full_name || session?.user?.email || ''

  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between lg:px-6">
      <button
        onClick={onMenuToggle}
        className="lg:hidden p-2 rounded-md text-gray-500 hover:bg-gray-100"
      >
        <Menu size={20} />
      </button>

      <div className="lg:flex-1" />

      <div className="flex items-center gap-3">
        <button
          onClick={() => setTheme(NEXT_THEME[theme])}
          title={`Theme: ${theme} (click to change)`}
          aria-label={`Theme: ${theme}`}
          className="p-2 rounded-md text-gray-500 hover:bg-gray-100"
        >
          <ThemeIcon size={18} />
        </button>
        <NotificationBell />
        <div className="text-right">
          <p className="text-sm font-medium text-gray-800">{profile?.full_name || 'User'}</p>
          <p className="text-xs text-gray-500">{session?.user?.email}</p>
        </div>
        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white text-sm font-bold">
          {displayName[0]?.toUpperCase() || 'U'}
        </div>
      </div>
    </header>
  )
}
