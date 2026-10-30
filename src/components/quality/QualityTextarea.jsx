import { useLayoutEffect, useRef } from 'react'

export default function QualityTextarea({ value, ...props }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const element = ref.current
    const resize = () => {
      element.style.height = 'auto'
      element.style.height = `${element.scrollHeight + element.offsetHeight - element.clientHeight}px`
    }
    resize()
    let width = -1
    const observer = new ResizeObserver(([entry]) => {
      if (entry.contentRect.width !== width) {
        width = entry.contentRect.width
        resize()
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [value])
  return <textarea ref={ref} value={value} {...props} />
}
