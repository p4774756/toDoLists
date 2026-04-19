<script setup>
import { ref, computed, nextTick, watch } from 'vue'
import { useTodos } from './composables/useTodos'
import { useListRowSwipe } from './composables/useListRowSwipe'

const {
  todos,
  filter,
  filteredTodos,
  activeCount,
  add,
  remove,
  removeMany,
  toggle,
  updateTitle,
  move,
  clearCompleted,
} = useTodos()

const draft = ref('')
const editingId = ref(null)
const editDraft = ref('')

const reorderDraggingId = ref(null)
const reorderDragAccum = ref(0)

const selectionMode = ref(false)
const selectedIds = ref([])

const rowSwipe = useListRowSwipe({
  onRight: (id) => toggle(id),
  isRowSwipeDisabled: (id) =>
    selectionMode.value ||
    editingId.value === id ||
    reorderDraggingId.value != null,
})

const LONG_PRESS_MS = 440
const REORDER_PRE_CANCEL_PX = 14
const REORDER_STEP_PX = 42

let reorderLongPressTimer = null
/** @type {string | null} */
let reorderPressPendingId = null
let reorderPressStartX = 0
let reorderPressStartY = 0
let reorderLastKnownY = 0
let reorderTouchLastY = 0
/** @type {((e: TouchEvent) => void) | null} */
let reorderProbeListener = null
/** @type {((e: TouchEvent) => void) | null} */
let reorderDragMoveListener = null
/** @type {((e: TouchEvent) => void) | null} */
let reorderDragEndListener = null

let mouseReorderTimer = null
/** @type {string | null} */
let mouseReorderPendingId = null
let mousePressX = 0
let mousePressY = 0
/** @type {((e: MouseEvent) => void) | null} */
let mouseMoveProbe = null
/** @type {((e: MouseEvent) => void) | null} */
let mouseDragMove = null
/** @type {((e: MouseEvent) => void) | null} */
let mouseDragUp = null

function canStartReorder(id) {
  return (
    filter.value === 'all' &&
    !selectionMode.value &&
    editingId.value !== id
  )
}

function clearReorderLongPressPending() {
  if (reorderLongPressTimer != null) {
    clearTimeout(reorderLongPressTimer)
    reorderLongPressTimer = null
  }
  if (reorderProbeListener) {
    document.removeEventListener('touchmove', reorderProbeListener, { capture: true })
    reorderProbeListener = null
  }
  reorderPressPendingId = null
}

function clearMouseReorderPending() {
  if (mouseReorderTimer != null) {
    clearTimeout(mouseReorderTimer)
    mouseReorderTimer = null
  }
  if (mouseMoveProbe) {
    document.removeEventListener('mousemove', mouseMoveProbe)
    mouseMoveProbe = null
  }
  mouseReorderPendingId = null
}

function detachReorderTouchDrag() {
  if (reorderDragMoveListener) {
    document.removeEventListener('touchmove', reorderDragMoveListener)
    reorderDragMoveListener = null
  }
  if (reorderDragEndListener) {
    document.removeEventListener('touchend', reorderDragEndListener)
    document.removeEventListener('touchcancel', reorderDragEndListener)
    reorderDragEndListener = null
  }
}

function detachMouseReorderDrag() {
  if (mouseDragMove) {
    document.removeEventListener('mousemove', mouseDragMove)
    mouseDragMove = null
  }
  if (mouseDragUp) {
    document.removeEventListener('mouseup', mouseDragUp)
    mouseDragUp = null
  }
}

function endReorderDrag() {
  reorderDraggingId.value = null
  reorderDragAccum.value = 0
  detachReorderTouchDrag()
  detachMouseReorderDrag()
}

function applyReorderDelta(id, dy) {
  let acc = reorderDragAccum.value + dy
  while (acc >= REORDER_STEP_PX) {
    if (!canMove(id, 1)) break
    moveTodo(id, 1)
    acc -= REORDER_STEP_PX
  }
  while (acc <= -REORDER_STEP_PX) {
    if (!canMove(id, -1)) break
    moveTodo(id, -1)
    acc += REORDER_STEP_PX
  }
  reorderDragAccum.value = acc
}

function beginTouchReorder(id) {
  clearReorderLongPressPending()
  rowSwipe.cancelActiveSwipe()
  rowSwipe.closeDeleteReveal(id)
  reorderDraggingId.value = id
  reorderDragAccum.value = 0
  reorderTouchLastY = reorderLastKnownY

  reorderDragMoveListener = (e) => {
    if (reorderDraggingId.value !== id || !e.touches[0]) return
    e.preventDefault()
    const t = e.touches[0]
    const dy = t.clientY - reorderTouchLastY
    reorderTouchLastY = t.clientY
    applyReorderDelta(id, dy)
  }

  reorderDragEndListener = () => {
    if (reorderDraggingId.value === id) endReorderDrag()
  }

  document.addEventListener('touchmove', reorderDragMoveListener, { passive: false })
  document.addEventListener('touchend', reorderDragEndListener)
  document.addEventListener('touchcancel', reorderDragEndListener)

  if (typeof navigator !== 'undefined' && navigator.vibrate) {
    try {
      navigator.vibrate(12)
    } catch {
      /* ignore */
    }
  }
}

function onTodoRowTouchStart(id, e) {
  rowSwipe.onTouchStart(id, e)
  clearReorderLongPressPending()
  if (!canStartReorder(id) || !e.touches[0]) return

  const t = e.touches[0]
  reorderPressPendingId = id
  reorderPressStartX = t.clientX
  reorderPressStartY = t.clientY
  reorderLastKnownY = t.clientY

  reorderProbeListener = (ev) => {
    if (reorderPressPendingId !== id) return
    const touch = ev.touches[0]
    if (!touch) return
    reorderLastKnownY = touch.clientY
    const dx = touch.clientX - reorderPressStartX
    const dy = touch.clientY - reorderPressStartY
    if (Math.hypot(dx, dy) > REORDER_PRE_CANCEL_PX) clearReorderLongPressPending()
  }
  document.addEventListener('touchmove', reorderProbeListener, { capture: true, passive: true })

  reorderLongPressTimer = window.setTimeout(() => {
    if (reorderPressPendingId !== id) return
    beginTouchReorder(id)
  }, LONG_PRESS_MS)
}

function beginMouseReorder(id) {
  clearMouseReorderPending()
  rowSwipe.cancelActiveSwipe()
  rowSwipe.closeDeleteReveal(id)
  reorderDraggingId.value = id
  reorderDragAccum.value = 0

  let lastY = mousePressY
  mouseDragMove = (e) => {
    if (reorderDraggingId.value !== id) return
    const dy = e.clientY - lastY
    lastY = e.clientY
    applyReorderDelta(id, dy)
  }
  mouseDragUp = () => {
    if (reorderDraggingId.value === id) endReorderDrag()
  }
  document.addEventListener('mousemove', mouseDragMove)
  document.addEventListener('mouseup', mouseDragUp)
}

function onSwipeFrontPointerDown(id, e) {
  if (e.pointerType !== 'mouse' || e.button !== 0) return
  if (!canStartReorder(id)) return
  const el = e.target
  if (
    el instanceof Element &&
    (el.closest('.btn-icon') ||
      el.closest('.cb-wrap') ||
      el.closest('.cb-spacer-wrap') ||
      el.closest('.checkbox') ||
      el.closest('.input-inline'))
  ) {
    return
  }
  clearMouseReorderPending()
  mouseReorderPendingId = id
  mousePressX = e.clientX
  mousePressY = e.clientY

  mouseMoveProbe = (ev) => {
    if (mouseReorderPendingId !== id) return
    const dx = ev.clientX - mousePressX
    const dy = ev.clientY - mousePressY
    if (Math.hypot(dx, dy) > REORDER_PRE_CANCEL_PX) clearMouseReorderPending()
  }
  document.addEventListener('mousemove', mouseMoveProbe)

  mouseReorderTimer = window.setTimeout(() => {
    if (mouseReorderPendingId !== id) return
    clearMouseReorderPending()
    beginMouseReorder(id)
  }, LONG_PRESS_MS)
}

function reorderRowLiftStyle(rowId) {
  if (reorderDraggingId.value !== rowId) return {}
  const a = reorderDragAccum.value
  const nudge = Math.max(-20, Math.min(20, a * 0.42))
  return {
    transform: `translateY(calc(-7px + ${nudge}px))`,
    zIndex: 24,
    transition: 'none',
  }
}

watch(filter, () => {
  rowSwipe.closeAllDeleteReveals()
  endReorderDrag()
  clearReorderLongPressPending()
  clearMouseReorderPending()
  exitSelectionMode()
})

const allFilteredSelected = computed(() => {
  const visible = filteredTodos.value
  if (!visible.length) return false
  return visible.every((t) => selectedIds.value.includes(t.id))
})

const selectedCount = computed(() => selectedIds.value.length)

function enterSelectionMode() {
  cancelEdit()
  rowSwipe.cancelActiveSwipe()
  rowSwipe.closeAllDeleteReveals()
  endReorderDrag()
  clearReorderLongPressPending()
  clearMouseReorderPending()
  selectionMode.value = true
  selectedIds.value = []
}

function exitSelectionMode() {
  selectionMode.value = false
  selectedIds.value = []
}

function toggleRowSelect(id, checked) {
  if (checked) {
    if (!selectedIds.value.includes(id)) {
      selectedIds.value = [...selectedIds.value, id]
    }
  } else {
    selectedIds.value = selectedIds.value.filter((x) => x !== id)
  }
}

function setSelectAllFiltered(selectAll) {
  const visibleIds = filteredTodos.value.map((t) => t.id)
  if (selectAll) {
    selectedIds.value = [...new Set([...selectedIds.value, ...visibleIds])]
  } else {
    const vis = new Set(visibleIds)
    selectedIds.value = selectedIds.value.filter((id) => !vis.has(id))
  }
}

function batchDeleteSelected() {
  const ids = [...selectedIds.value]
  if (!ids.length) return
  for (const id of ids) {
    rowSwipe.afterRowRemoved(id)
  }
  removeMany(ids)
  exitSelectionMode()
}

function removeTodoAndResetSwipe(id) {
  remove(id)
  rowSwipe.afterRowRemoved(id)
}

function canMove(id, delta) {
  if (filter.value !== 'all') return false
  const index = todos.value.findIndex((t) => t.id === id)
  if (index < 0) return false
  const target = index + delta
  return target >= 0 && target < todos.value.length
}

function moveTodo(id, delta) {
  if (!canMove(id, delta)) return
  rowSwipe.closeDeleteReveal(id)
  move(id, delta)
}

const emptyState = computed(() => {
  if (todos.value.length === 0) {
    return {
      title: '這裡還空空的',
      hint: '在上方輸入待辦，按 Enter 或點「新增」即可開始。',
    }
  }
  if (filter.value === 'active') {
    return {
      title: '沒有未完成項目',
      hint: '太棒了！可切換到「全部」或「已完成」檢視其他項目。',
    }
  }
  if (filter.value === 'completed') {
    return {
      title: '尚無已完成項目',
      hint: '在「全部」用左側方塊或右滑標記完成後，會出現在這裡。',
    }
  }
  return { title: '這裡還空空的', hint: '' }
})

function onSubmit() {
  add(draft.value)
  draft.value = ''
}

const filters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未完成' },
  { key: 'completed', label: '已完成' },
]

const appVersion = __APP_VERSION__

/** 每列附帶滑動底層模式，避免模板重複呼叫且正確依賴 translateX */
const listRows = computed(() =>
  filteredTodos.value.map((item) => {
    void rowSwipe.translateX[item.id]
    void rowSwipe.openDeleteId.value
    void reorderDraggingId.value
    return {
      ...item,
      swipeMode: rowSwipe.swipeUnderlayMode(item.id),
    }
  }),
)

function startEdit(item) {
  rowSwipe.closeAllDeleteReveals()
  editingId.value = item.id
  editDraft.value = item.title
  nextTick(() => {
    const el = document.getElementById(`todo-edit-${item.id}`)
    el?.focus()
    el?.select?.()
  })
}

function cancelEdit() {
  editingId.value = null
  editDraft.value = ''
}

function commitEdit() {
  if (!editingId.value) return
  const id = editingId.value
  const trimmed = editDraft.value.trim()
  if (!trimmed) {
    cancelEdit()
    return
  }
  updateTitle(id, trimmed)
  cancelEdit()
}
</script>

<template>
  <div class="page">
    <div class="bg-grid" aria-hidden="true" />
    <div class="orb orb-a" aria-hidden="true" />
    <div class="orb orb-b" aria-hidden="true" />

    <div class="app">
      <header class="header">
        <div class="brand">
          <span class="logo" aria-hidden="true">
            <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect width="32" height="32" rx="8" fill="currentColor" opacity="0.12" />
              <path
                d="M10 16.5l4 4 8-9"
                stroke="currentColor"
                stroke-width="2.2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </span>
          <div class="brand-text">
            <h1 class="title">待辦清單</h1>
          </div>
        </div>
        <details class="help-details">
          <summary class="help-summary">使用說明</summary>
          <div class="help-body">
            <p>
              資料儲存在此瀏覽器的 <strong>localStorage</strong>，重新整理也不會消失。
              在待辦列上<strong>向右滑</strong>可切換完成；<strong>向左滑</strong>露出刪除鈕後，再點一下才會刪除（提示會依滑動方向單側出現）。
              在<strong>「全部」</strong>檢視下可<strong>長按</strong>列約半秒，列會略為浮起，再<strong>上下拖曳</strong>調整順序；滑鼠也可長按後拖曳；未完成在上、已完成會自動排到下面。
              輸入框右側為<strong>「多選／取消多選」</strong>，再右側為<strong>「新增」</strong>；多選可勾選多筆後<strong>批次刪除</strong>（多選時無法滑動列）。平常請用<strong>右滑</strong>切換完成。
            </p>
          </div>
        </details>
      </header>

      <main class="card">
        <form class="form" @submit.prevent="onSubmit">
          <label class="sr-only" for="todo-input">新增待辦</label>
          <div class="input-wrap">
            <input
              id="todo-input"
              v-model="draft"
              class="input"
              type="text"
              autocomplete="off"
              placeholder="今天想完成什麼？"
              maxlength="500"
            />
          </div>
          <button
            v-if="todos.length > 0"
            type="button"
            class="btn btn-ghost btn-form-action"
            @click="selectionMode ? exitSelectionMode() : enterSelectionMode()"
          >
            {{ selectionMode ? '取消多選' : '多選' }}
          </button>
          <button type="submit" class="btn btn-primary">新增</button>
        </form>

        <div class="toolbar" role="tablist" aria-label="篩選">
          <div class="tabs">
            <button
              v-for="f in filters"
              :key="f.key"
              type="button"
              role="tab"
              :aria-selected="filter === f.key"
              class="tab"
              :class="{ 'tab--active': filter === f.key }"
              @click="filter = f.key"
            >
              {{ f.label }}
            </button>
          </div>
        </div>

        <transition name="fade">
          <ul v-if="filteredTodos.length" class="list">
            <li
              v-for="item in listRows"
              :key="item.id"
              class="swipe-row"
              :class="{
                'swipe-row--drag': rowSwipe.draggingId === item.id,
                'swipe-row--reorder': reorderDraggingId === item.id,
              }"
              :style="reorderRowLiftStyle(item.id)"
            >
              <div class="swipe-back" :class="'swipe-back--' + item.swipeMode">
                <span
                  v-show="item.swipeMode === 'done'"
                  class="swipe-hint swipe-hint--done"
                  aria-hidden="true"
                >
                  {{ item.done ? '未完成' : '完成' }}
                </span>
                <button
                  v-show="item.swipeMode === 'delete' || item.swipeMode === 'delete-open'"
                  type="button"
                  class="swipe-delete-reveal"
                  :tabindex="rowSwipe.openDeleteId === item.id ? 0 : -1"
                  @click="removeTodoAndResetSwipe(item.id)"
                >
                  刪除
                </button>
              </div>
              <div
                class="swipe-front"
                :class="{ 'swipe-front--reorder': reorderDraggingId === item.id }"
                :style="rowSwipe.rowFrontStyle(item.id)"
                @touchstart="onTodoRowTouchStart(item.id, $event)"
                @pointerdown="onSwipeFrontPointerDown(item.id, $event)"
              >
                <div class="check-label">
                  <div
                    v-if="!selectionMode"
                    class="cb-wrap cb-spacer-wrap"
                    aria-hidden="true"
                  >
                    <span class="cb-spacer" />
                  </div>
                  <label
                    v-else
                    class="cb-wrap cb-select-wrap"
                    :for="'todo-sel-' + item.id"
                    @touchstart.stop
                  >
                    <span class="sr-only">選取「{{ item.title }}」以批次刪除</span>
                    <input
                      :id="'todo-sel-' + item.id"
                      type="checkbox"
                      class="checkbox cb-select"
                      :checked="selectedIds.includes(item.id)"
                      @change="toggleRowSelect(item.id, $event.target.checked)"
                    />
                  </label>
                  <input
                    v-if="editingId === item.id"
                    :id="'todo-edit-' + item.id"
                    v-model="editDraft"
                    class="input input-inline"
                    type="text"
                    autocomplete="off"
                    maxlength="500"
                    :aria-label="'編輯：' + item.title"
                    @keydown.enter.prevent="commitEdit"
                    @keydown.escape.prevent="cancelEdit"
                    @blur="commitEdit"
                  />
                  <button
                    v-else
                    type="button"
                    class="label-text label-text--btn"
                    :class="{ done: item.done }"
                    title="雙擊或按 Enter 編輯"
                    :disabled="selectionMode"
                    @dblclick.prevent="startEdit(item)"
                    @keydown.enter.prevent="startEdit(item)"
                  >
                    {{ item.title }}
                  </button>
                </div>
                <button
                  type="button"
                  class="btn-icon btn-edit"
                  title="編輯此項目"
                  :disabled="editingId === item.id || selectionMode"
                  @click="startEdit(item)"
                  @touchstart.stop
                >
                  <span class="sr-only">編輯</span>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path
                      d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
                      stroke="currentColor"
                      stroke-width="1.75"
                      stroke-linecap="round"
                      stroke-linejoin="round"
                    />
                  </svg>
                </button>
              </div>
            </li>
          </ul>
        </transition>

        <div v-if="!filteredTodos.length" class="empty">
          <span class="empty-icon" aria-hidden="true">✦</span>
          <p class="empty-title">{{ emptyState.title }}</p>
          <p v-if="emptyState.hint" class="empty-hint">{{ emptyState.hint }}</p>
        </div>

        <div v-if="selectionMode && todos.length > 0" class="toolbar toolbar--secondary">
          <button
            v-if="filteredTodos.length"
            type="button"
            class="btn btn-ghost btn-toolbar"
            @click="setSelectAllFiltered(!allFilteredSelected)"
          >
            {{ allFilteredSelected ? '取消全選' : '全選' }}
          </button>
          <button
            type="button"
            class="btn btn-ghost btn-batch-delete btn-toolbar"
            :disabled="selectedCount === 0"
            @click="batchDeleteSelected"
          >
            批次刪除（{{ selectedCount }}）
          </button>
        </div>

        <footer v-if="filteredTodos.length || activeCount > 0" class="footer">
          <span class="meta">
            <span class="meta-dot" aria-hidden="true" />
            未完成 <strong>{{ activeCount }}</strong> 筆
          </span>
          <button type="button" class="btn btn-ghost" @click="clearCompleted">
            清除已完成
          </button>
        </footer>
      </main>

      <p class="fineprint">離線可用 · 不會同步到其他裝置 · v{{ appVersion }}</p>
    </div>
  </div>
</template>

<style scoped>
.page {
  position: relative;
  min-height: 100svh;
  overflow-x: clip;
  padding: clamp(1.5rem, 4vw, 3rem) 1.25rem 2.5rem;
}

.bg-grid {
  pointer-events: none;
  position: fixed;
  inset: 0;
  background-image:
    linear-gradient(rgba(148, 163, 184, 0.09) 1px, transparent 1px),
    linear-gradient(90deg, rgba(148, 163, 184, 0.09) 1px, transparent 1px);
  background-size: 48px 48px;
  mask-image: radial-gradient(ellipse 80% 70% at 50% -10%, black 40%, transparent 75%);
}

@media (prefers-color-scheme: dark) {
  .bg-grid {
    background-image:
      linear-gradient(rgba(148, 163, 184, 0.06) 1px, transparent 1px),
      linear-gradient(90deg, rgba(148, 163, 184, 0.06) 1px, transparent 1px);
  }
}

.orb {
  pointer-events: none;
  position: fixed;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.55;
  mix-blend-mode: multiply;
}

@media (prefers-color-scheme: dark) {
  .orb {
    mix-blend-mode: normal;
    opacity: 0.35;
  }
}

.orb-a {
  width: min(42vw, 320px);
  height: min(42vw, 320px);
  top: -8%;
  right: -5%;
  background: radial-gradient(circle, var(--accent) 0%, var(--bg-accent) 55%, transparent 70%);
}

.orb-b {
  width: min(55vw, 420px);
  height: min(55vw, 420px);
  bottom: -15%;
  left: -15%;
  background: radial-gradient(circle, #38bdf8 0%, transparent 65%);
  opacity: 0.25;
}

.app {
  position: relative;
  z-index: 1;
  max-width: 26.5rem;
  margin: 0 auto;
}

.header {
  margin-bottom: 1.35rem;
}

.brand {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  margin-bottom: 0.65rem;
}

.logo {
  display: flex;
  color: var(--accent);
  filter: drop-shadow(0 8px 20px var(--accent-glow)) drop-shadow(0 2px 6px rgba(79, 70, 229, 0.2));
}

.logo svg {
  width: 2.5rem;
  height: 2.5rem;
}

.brand-text {
  min-width: 0;
}

.title {
  margin: 0;
  font-size: clamp(1.65rem, 4.5vw, 2rem);
  font-weight: 700;
  letter-spacing: -0.03em;
  line-height: 1.15;
  color: var(--text-h);
  background: linear-gradient(120deg, var(--text-h) 0%, var(--accent) 160%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

@media (prefers-color-scheme: dark) {
  .title {
    background: linear-gradient(120deg, #f8fafc 0%, var(--accent) 130%);
    -webkit-background-clip: text;
    background-clip: text;
  }
}

.help-details {
  margin: 0.15rem 0 0;
  max-width: 34em;
}

.help-summary {
  list-style: none;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 500;
  color: var(--text-muted);
  user-select: none;
}

.help-summary::-webkit-details-marker {
  display: none;
}

.help-summary::marker {
  content: '';
}

.help-summary:hover {
  color: var(--accent);
}

.help-body {
  margin-top: 0.55rem;
  padding-top: 0.55rem;
  border-top: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.55;
}

.help-body p {
  margin: 0;
}

.help-body strong {
  color: var(--text);
  font-weight: 600;
}

.card {
  border-radius: var(--radius);
  padding: 1.1rem 1.1rem 0.35rem;
  background: var(--surface);
  backdrop-filter: blur(var(--blur));
  -webkit-backdrop-filter: blur(var(--blur));
  border: 1px solid var(--border);
  box-shadow: var(--shadow-card);
  transition:
    transform 0.22s ease,
    box-shadow 0.22s ease;
}

@media (hover: hover) and (pointer: fine) {
  @media (prefers-reduced-motion: no-preference) {
    .card:hover {
      transform: translateY(-2px);
      box-shadow: var(--shadow-card-hover);
    }
  }
}

@media (prefers-color-scheme: dark) {
  .card {
    background: var(--surface);
  }
}

.form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.55rem;
  margin-bottom: 1rem;
}

.btn-form-action {
  flex-shrink: 0;
  font-size: 0.8125rem;
  padding: var(--control-pad-y) 0.75rem;
}

.input-wrap {
  flex: 1;
  min-width: 0;
}

.input {
  width: 100%;
  padding: var(--control-pad-y) var(--control-pad-x);
  font: inherit;
  font-size: 0.95rem;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-solid);
  color: var(--text-h);
  box-shadow: inset 0 1px 2px rgba(15, 23, 42, 0.04);
  transition:
    border-color 0.18s ease,
    box-shadow 0.18s ease;
}

.input::placeholder {
  color: var(--text-muted);
}

.input:hover {
  border-color: var(--border-strong);
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.04),
    0 3px 12px rgba(15, 23, 42, 0.07);
}

.input:focus {
  outline: none;
  border-color: var(--accent);
  box-shadow:
    inset 0 1px 2px rgba(15, 23, 42, 0.04),
    0 0 0 3px var(--accent-soft);
}

.toolbar {
  margin-bottom: 0.85rem;
}

.toolbar--secondary {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.75rem;
  margin-bottom: 0.15rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--border);
}

.btn-toolbar {
  font-size: 0.8125rem;
  padding: 0.42rem 0.7rem;
}

.btn-batch-delete {
  margin-left: auto;
  color: var(--danger);
  border-color: rgba(225, 29, 72, 0.35);
}

.btn-batch-delete:not(:disabled):hover {
  background: var(--danger-soft);
  border-color: var(--danger);
}

.btn-batch-delete:disabled {
  opacity: 0.42;
  cursor: not-allowed;
}

@media (max-width: 380px) {
  .btn-batch-delete {
    margin-left: 0;
    width: 100%;
  }
}

.tabs {
  display: flex;
  padding: 0.2rem;
  gap: 0.2rem;
  border-radius: var(--radius-pill);
  background: rgba(148, 163, 184, 0.12);
}

@media (prefers-color-scheme: dark) {
  .tabs {
    background: rgba(15, 23, 42, 0.65);
  }
}

.tab {
  flex: 1;
  padding: 0.5rem 0.4rem;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 500;
  border: none;
  border-radius: var(--radius-pill);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.tab:hover {
  color: var(--text);
}

.tab--active {
  color: var(--text-h);
  background: var(--surface-solid);
  box-shadow:
    var(--shadow-sm),
    0 4px 14px -4px rgba(15, 23, 42, 0.1);
}

@media (prefers-color-scheme: dark) {
  .tab--active {
    background: rgba(51, 65, 85, 0.95);
    box-shadow:
      var(--shadow-sm),
      0 8px 24px -4px rgba(0, 0, 0, 0.5);
  }

  .input:hover {
    box-shadow:
      inset 0 1px 2px rgba(0, 0, 0, 0.22),
      0 4px 20px rgba(0, 0, 0, 0.38);
  }
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--surface-solid);
  overflow: hidden;
  box-shadow:
    var(--shadow-sm),
    inset 0 1px 0 rgba(255, 255, 255, 0.55);
}

@media (prefers-color-scheme: dark) {
  .list {
    box-shadow:
      var(--shadow-sm),
      inset 0 1px 0 rgba(255, 255, 255, 0.06);
  }
}

.swipe-row {
  position: relative;
  overflow: hidden;
  border-bottom: 1px solid var(--border);
}

.swipe-row:last-child {
  border-bottom: none;
}

.swipe-row--reorder {
  box-shadow:
    0 14px 32px -10px rgba(15, 23, 42, 0.22),
    0 6px 14px -6px rgba(79, 70, 229, 0.12);
}

@media (prefers-color-scheme: dark) {
  .swipe-row--reorder {
    box-shadow:
      0 18px 40px -12px rgba(0, 0, 0, 0.55),
      0 8px 18px -8px rgba(99, 102, 241, 0.18);
  }
}

.swipe-back {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: stretch;
  justify-content: space-between;
  pointer-events: none;
  z-index: 0;
}

.swipe-back--none {
  opacity: 0;
  visibility: hidden;
  pointer-events: none !important;
  transition:
    opacity 0.16s ease,
    visibility 0.16s ease;
}

.swipe-back--done {
  justify-content: flex-start;
}

.swipe-back--delete,
.swipe-back--delete-open {
  justify-content: flex-end;
}

.swipe-hint {
  display: flex;
  align-items: center;
  padding: 0 0.85rem;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: none;
  white-space: nowrap;
}

.swipe-hint--done {
  color: #166534;
  background: linear-gradient(90deg, rgba(34, 197, 94, 0.18), rgba(34, 197, 94, 0.02));
  border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
}

.swipe-delete-reveal {
  flex-shrink: 0;
  width: 78px;
  margin: 0;
  padding: 0 0.35rem;
  border: none;
  border-radius: var(--radius-sm) 0 0 var(--radius-sm);
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  color: #fff;
  cursor: pointer;
  pointer-events: auto;
  background: linear-gradient(180deg, #f87171 0%, #dc2626 100%);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.2);
  transition:
    filter 0.15s ease,
    transform 0.12s ease;
}

.swipe-delete-reveal:hover {
  filter: brightness(1.05);
}

.swipe-delete-reveal:active {
  transform: scale(0.98);
}

.swipe-delete-reveal:focus-visible {
  outline: none;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    0 0 0 2px var(--danger-soft);
}

@media (prefers-color-scheme: dark) {
  .swipe-hint--done {
    color: #bbf7d0;
    background: linear-gradient(90deg, rgba(34, 197, 94, 0.2), rgba(34, 197, 94, 0.03));
  }

  .swipe-delete-reveal {
    background: linear-gradient(180deg, #b91c1c 0%, #7f1d1d 100%);
  }
}

.swipe-front {
  position: relative;
  z-index: 1;
  box-sizing: border-box;
  width: 100%;
  min-width: 100%;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.55rem 0.5rem 0.55rem 0.65rem;
  background: var(--surface-solid);
  touch-action: pan-y;
  will-change: transform;
  transition: background 0.15s ease;
}

.swipe-row:hover .swipe-front {
  background: var(--row-hover);
}

.swipe-row--drag .swipe-front {
  transition: none;
}

.swipe-front--reorder {
  touch-action: none;
}

.check-label {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  flex: 1;
  min-width: 0;
  padding: 0.15rem 0;
}

.cb-wrap {
  display: flex;
  align-items: flex-start;
  flex-shrink: 0;
  padding-top: 0.2rem;
  cursor: pointer;
}

.cb-spacer-wrap {
  cursor: default;
}

.cb-spacer {
  display: block;
  box-sizing: border-box;
  width: 1.125rem;
  height: 1.125rem;
  margin: 0.2rem 0 0;
  flex-shrink: 0;
  border: 2px solid transparent;
  border-radius: var(--radius-xs);
  pointer-events: none;
}

.checkbox {
  appearance: none;
  width: 1.125rem;
  height: 1.125rem;
  margin: 0.2rem 0 0;
  flex-shrink: 0;
  border: 2px solid var(--border-strong);
  border-radius: var(--radius-xs);
  background-color: var(--surface-solid);
  background-image: none;
  cursor: pointer;
  transition:
    border-color 0.15s ease,
    background-color 0.15s ease,
    box-shadow 0.15s ease,
    transform 0.12s ease;
}

.checkbox:hover {
  border-color: var(--accent);
}

.checkbox:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.checkbox:checked {
  border-color: var(--accent);
  background-color: var(--accent);
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16' fill='none'%3E%3Cpath d='M3.5 8.5l3 3 6-7' stroke='white' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
  background-size: 0.7rem;
  background-position: center;
  background-repeat: no-repeat;
}

.checkbox:active {
  transform: scale(0.92);
}

.label-text {
  word-break: break-word;
  text-align: left;
  line-height: 1.45;
  font-size: 0.9375rem;
  color: var(--text-h);
  transition:
    color 0.15s ease,
    opacity 0.15s ease;
}

.label-text.done {
  text-decoration: line-through;
  color: var(--text-muted);
  opacity: 0.75;
}

.label-text--btn {
  display: block;
  width: 100%;
  margin: 0;
  padding: 0;
  border: none;
  background: transparent;
  font: inherit;
  font-size: 0.9375rem;
  line-height: 1.45;
  text-align: left;
  cursor: text;
  border-radius: var(--radius-sm);
}

.label-text--btn:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-soft);
}

.input-inline {
  flex: 1;
  min-width: 0;
  padding: 0.25rem 0.5rem;
  margin: -0.05rem 0;
  font-size: 0.9375rem;
  line-height: 1.45;
  border-radius: var(--radius-sm);
}

.btn-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 2.25rem;
  height: 2.25rem;
  padding: 0;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
  opacity: 0.55;
  flex-shrink: 0;
  transition:
    opacity 0.15s ease,
    color 0.15s ease,
    background 0.15s ease;
}

.swipe-row:hover .btn-icon {
  opacity: 1;
}

.btn-icon:disabled {
  cursor: default;
  opacity: 0.35;
}

.btn-edit:hover:not(:disabled) {
  color: var(--accent);
  background: var(--accent-soft);
}

.btn-edit:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--accent-soft);
  color: var(--accent);
}

.empty {
  text-align: center;
  padding: 2rem 1rem 1.75rem;
}

.empty-icon {
  display: block;
  font-size: 1.5rem;
  line-height: 1;
  margin-bottom: 0.5rem;
  color: var(--accent);
  opacity: 0.55;
}

.empty-title {
  margin: 0 0 0.35rem;
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-h);
}

.empty-hint {
  margin: 0;
  font-size: 0.875rem;
  color: var(--text-muted);
  line-height: 1.5;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.85rem 0.15rem 1rem;
  margin-top: 0.15rem;
  border-top: 1px solid var(--border);
}

.meta {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8125rem;
  color: var(--text-muted);
}

.meta strong {
  color: var(--text-h);
  font-weight: 600;
}

.meta-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--accent);
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font: inherit;
  font-size: 0.8125rem;
  font-weight: 600;
  min-height: calc(2 * var(--control-pad-y) + 1.25em);
  padding: var(--control-pad-y) 0.9rem;
  border-radius: var(--radius-sm);
  border: 1px solid transparent;
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease;
}

.btn:active {
  transform: scale(0.98);
}

.btn-primary {
  flex-shrink: 0;
  color: #fff;
  background: linear-gradient(165deg, var(--accent) 0%, var(--accent-hover) 100%);
  box-shadow:
    0 1px 2px rgba(15, 23, 42, 0.12),
    0 6px 20px -4px var(--accent-glow),
    0 14px 36px -8px rgba(79, 70, 229, 0.35);
}

.btn-primary:hover {
  filter: brightness(1.06);
  box-shadow:
    0 2px 4px rgba(15, 23, 42, 0.14),
    0 10px 28px -4px var(--accent-glow),
    0 22px 48px -10px rgba(79, 70, 229, 0.38);
}

.btn-primary:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 3px var(--accent-soft),
    0 10px 28px -4px var(--accent-glow),
    0 22px 48px -10px rgba(79, 70, 229, 0.35);
}

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-h);
}

.btn-ghost:hover {
  background: var(--surface-solid);
  border-color: var(--border-strong);
  box-shadow: var(--shadow-sm);
}

.btn-ghost:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--accent-soft);
}

.fineprint {
  margin: 1.25rem 0 0;
  text-align: center;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  color: var(--text-muted);
  opacity: 0.85;
}

.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
