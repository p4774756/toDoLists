import { reactive, ref, nextTick } from 'vue'

/** 右側刪除區寬度（與樣式一致） */
export const DELETE_PANEL_PX = 78
const RIGHT_COMMIT_PX = 56
/** 由關閉狀態左滑超過此值，鬆手後固定露出刪除鈕 */
const OPEN_LEFT_COMMIT_PX = 44
/** 已露出時再向右滑超過此距離，鬆手後收回 */
const CLOSE_RIGHT_COMMIT_PX = 36
const MAX_DRAG_FROM_CLOSED_PX = 104

/**
 * 右滑：觸發 onRight（切換完成）。
 * 左滑：鬆手達門檻後固定露出刪除區，需另外點刪除；再向右滑可收回。
 */
export function useListRowSwipe({ onRight, isRowSwipeDisabled = () => false }) {
  const translateX = reactive({})
  const openDeleteId = ref(null)
  const draggingId = ref(null)

  let activeId = null
  let startX = 0
  let startY = 0
  /** 本次手勢開始時的 translateX */
  let touchBase = 0
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
      const raw = touchBase + dx
      const opened = touchBase <= -DELETE_PANEL_PX / 2
      let clamped
      if (opened) {
        clamped = Math.max(-DELETE_PANEL_PX, Math.min(0, raw))
      } else {
        clamped = Math.max(-MAX_DRAG_FROM_CLOSED_PX, Math.min(MAX_DRAG_FROM_CLOSED_PX, raw))
      }
      translateX[activeId] = clamped
    }
  }

  function snapOpen(id) {
    const cur = openDeleteId.value
    if (cur && cur !== id) {
      translateX[cur] = 0
    }
    translateX[id] = -DELETE_PANEL_PX
    openDeleteId.value = id
  }

  function snapClosed(id) {
    translateX[id] = 0
    if (openDeleteId.value === id) openDeleteId.value = null
  }

  function onTouchEnd() {
    if (activeId == null) {
      cleanup()
      return
    }
    const id = activeId
    const x = translateX[id] ?? 0

    if (lock === 'h') {
      const startedOpen = touchBase <= -DELETE_PANEL_PX / 2

      if (!startedOpen) {
        if (x <= -OPEN_LEFT_COMMIT_PX) {
          snapOpen(id)
        } else if (x >= RIGHT_COMMIT_PX) {
          onRight(id)
          snapClosed(id)
          nextTick(() => {
            translateX[id] = 0
            if (openDeleteId.value === id) openDeleteId.value = null
          })
        } else {
          snapClosed(id)
        }
      } else {
        if (x > -DELETE_PANEL_PX + CLOSE_RIGHT_COMMIT_PX) {
          snapClosed(id)
        } else {
          translateX[id] = -DELETE_PANEL_PX
          openDeleteId.value = id
        }
      }
    }

    cleanup()
  }

  /**
   * @param {string} id
   * @param {TouchEvent} e
   */
  function onTouchStart(id, e) {
    if (isRowSwipeDisabled(id)) return
    if (!e.touches[0]) return
    if (activeId != null) return

    const curOpen = openDeleteId.value
    if (curOpen && curOpen !== id) {
      translateX[curOpen] = 0
      openDeleteId.value = null
    }

    const t = e.touches[0]
    activeId = id
    startX = t.clientX
    startY = t.clientY
    touchBase = translateX[id] ?? 0
    lock = null
    draggingId.value = id

    document.addEventListener('touchmove', onTouchMove, { passive: false })
    document.addEventListener('touchend', onTouchEnd)
    document.addEventListener('touchcancel', onTouchEnd)
  }

  function closeDeleteReveal(id) {
    if (translateX[id] != null) translateX[id] = 0
    if (openDeleteId.value === id) openDeleteId.value = null
  }

  function closeAllDeleteReveals() {
    const id = openDeleteId.value
    if (id) {
      translateX[id] = 0
      openDeleteId.value = null
    }
  }

  /** 刪除列後清掉位移狀態，避免 reactive 殘留 key */
  function afterRowRemoved(id) {
    delete translateX[id]
    if (openDeleteId.value === id) openDeleteId.value = null
  }

  function rowFrontStyle(id) {
    const raw = translateX[id]
    const x = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
    const dragging = draggingId.value === id
    return {
      transform: `translateX(${x}px)`,
      transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.22, 1, 0.36, 1)',
    }
  }

  /** 拖曳中、已固定露出刪除、或位移超過門檻時才顯示底層（避免歸零後仍透出紅綠） */
  function showSwipeUnderlay(id) {
    if (openDeleteId.value === id) return true
    if (draggingId.value === id) return true
    const raw = translateX[id]
    const x = typeof raw === 'number' && !Number.isNaN(raw) ? raw : 0
    return Math.abs(x) > 4
  }

  return {
    translateX,
    openDeleteId,
    draggingId,
    onTouchStart,
    rowFrontStyle,
    showSwipeUnderlay,
    closeDeleteReveal,
    closeAllDeleteReveals,
    afterRowRemoved,
  }
}
