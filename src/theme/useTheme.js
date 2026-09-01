import { useContext } from 'react'
import { ThemeContext } from './themeContext.js'

export function useTheme() {
  const theme = useContext(ThemeContext)
  if (!theme) throw new Error('useTheme muss innerhalb von ThemeProvider verwendet werden.')
  return theme
}
