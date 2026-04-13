import { reactive, ref } from 'vue'

const COMMIT_PX = 56
const MAX_DRAG_PX = 104

/**
 * 水平滑動手勢：右滑觸發 onRight、左滑觸發 onLeft；鬆手未達門檻則回彈。
 * 使用 document 監聽 touchmove（passive: false）以便在判定為橫滑時 preventDefault。
 */
export function useListRowSwipe({ onRight, onLeft, isRowSwipeDisabled = () => false }) {
  const translateX = reactive({})
  const draggingId = ref(null)

  let activeId = null
  let startX = 0
  let startY = 0
  let base = 0
  /** @type {'h' | 'v' | null} */
  let lock = null

  function cleanup() {
    document.removeEventListener('touchmove', onTouchMove)
    document.removeEventListener('touchend', onTouchEnd)
    document.removeEventListener('touchcancel', onTouchEnd)
    draggingId.value = null
    activeId = null
    lock = null
  }

  function onTouchMove(e) {
    if (activeId == null || !e.touches[0]) return
    const t = e.touches[0]
    const dx = t.clientX - startX
    const dy = t.clientY - startY

    if (!lock) {
      if (Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.15) lock = 'h'
      else if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx) * 1.15) {
        cleanup()
        return
      }
      if (!lock) return
    }

    if (lock === 'h') {
      e.preventDefault()
      const raw = base + dx
      const clamped = Math.max(-MAX_DRAG_PX, Math.min(MAX_DRAG_PX, raw))
      translateX[activeId] = clamped
    }
  }

  function onTouchEnd() {
    if (activeId == null) {
      cleanup()
      return
    }
    const id = activeId
    const x = translateX[id] || 0

    if (lock === 'h') {
      if (x >= COMMIT_PX) onRight(id)
      else if (x <= -COMMIT_PX) onLeft(id)
    }

    cleanup()
    translateX[id] = 0
  }

  /**
   * @param {string} id
   * @param {TouchEvent} e
   */
  function onTouchStart(id, e) {
    if (isRowSwipeDisabled(id)) return
    if (!e.touches[0]) return
    if (activeId != null) return

    const t = e.touches[0]
    activeId = id
    startX = t.clientX
    startY = t.clientY
    base = translateX[id] || 0
    lock = null
    draggingId.value = id

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
  }

  function rowFrontStyle(id) {
    const x = translateX[id] || 0
    const dragging = draggingId.value === id
    return {
      transform: `translateX(${x}px)`,
      transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
    }
  }

  return {
    translateX,
    draggingId,
    onTouchStart,
    rowFrontStyle,
  }
}
