import { Button } from '../../ui/button'
import { Minus, Square, X } from 'lucide-react'
import { useState, useEffect } from 'react'
import { useConfirmQuit } from '@/common/hooks/use-confirm-quit'

export function WindowControls() {
  const [isMaximized, setIsMaximized] = useState(false)
  const confirmQuit = useConfirmQuit()

  useEffect(() => {
    // Check initial maximized state
    window.electronAPI.windowControls.isMaximized().then(setIsMaximized)
  }, [])

  const handleMinimize = async () => {
    await window.electronAPI.windowControls.minimize()
  }

  const handleMaximize = async () => {
    await window.electronAPI.windowControls.maximize()
    const maximized = await window.electronAPI.windowControls.isMaximized()
    setIsMaximized(maximized)
  }

  const handleClose = async () => {
    const confirmed = await confirmQuit()
    if (confirmed) {
      await window.electronAPI.windowControls.close()
    }
  }

  // Only show window controls on Windows and Linux (not macOS)
  if (window.electronAPI.isMac) {
    return null
  }

  return (
    <div className="app-region-no-drag flex items-center gap-0">
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-accent/50 hover:text-accent-foreground h-8 w-12 rounded-none"
        onClick={handleMinimize}
      >
        <Minus className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-accent/50 hover:text-accent-foreground h-8 w-12 rounded-none"
        onClick={handleMaximize}
      >
        {isMaximized ? (
          <div className="relative size-4">
            <div className="absolute inset-0 h-3 w-3 border border-current" />
            <div className="bg-background absolute top-1 left-1 h-3 w-3 border border-current" />
          </div>
        ) : (
          <Square className="size-4" />
        )}
      </Button>
      <Button
        variant="ghost"
        size="icon"
        className="hover:bg-destructive hover:text-destructive-foreground h-8 w-12 rounded-none"
        onClick={handleClose}
      >
        <X className="size-4" />
      </Button>
    </div>
  )
}
