import { useEffect, useRef, useState } from 'react'

// Measures an element's content width so charts can size (and thin their axis
// ticks) to the container instead of a fixed pixel width.
export default function useContainerWidth() {
  const ref = useRef(null)
  const [width, setWidth] = useState(0)
  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const update = () => setWidth(Math.floor(el.getBoundingClientRect().width))
    update()
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  return [ref, width]
}
