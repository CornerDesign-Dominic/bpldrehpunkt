import { createContext, useContext } from 'react'

export const PageHeaderContext = createContext({ setTitle: () => {} })

export function usePageHeader() {
  return useContext(PageHeaderContext)
}
