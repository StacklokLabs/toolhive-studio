import { useTheme } from '../../hooks/use-theme'
import { Button } from '../ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../ui/dropdown-menu'
import { Sun, Moon, Monitor, Check } from 'lucide-react'

export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme()

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    try {
      await setTheme(newTheme)
    } catch (error) {
      console.error('Failed to change theme:', error)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild className={className}>
        <Button variant="ghost" size="icon" className="cursor-pointer">
          <Sun
            className="text-muted-foreground size-4 scale-100 rotate-0
              transition-all dark:scale-0 dark:-rotate-90"
          />
          <Moon
            className="text-muted-foreground absolute size-4 scale-0 rotate-90
              transition-all dark:scale-100 dark:rotate-0"
          />
          <span className="sr-only">Toggle theme</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-24">
        <DropdownMenuItem
          onClick={() => handleThemeChange('light')}
          className="cursor-pointer"
        >
          <Sun className="mr-2 size-4" />
          Light
          {theme === 'light' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleThemeChange('dark')}
          className="cursor-pointer"
        >
          <Moon className="mr-2 size-4" />
          Dark
          {theme === 'dark' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleThemeChange('system')}
          className="cursor-pointer"
        >
          <Monitor className="mr-2 size-4" />
          System
          {theme === 'system' && <Check className="ml-auto size-4" />}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
