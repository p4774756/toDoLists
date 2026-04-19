import { ref, computed, watch, onMounted } from 'vue'

const STORAGE_KEY = 'todolists-vue'

export function useTodos() {
  const todos = ref([])
  const filter = ref('all')

  /** 未完成在前、已完成在後（相對順序不變） */
  function sinkDoneToBottom() {
    const inc = todos.value.filter((t) => !t.done)
    const comp = todos.value.filter((t) => t.done)
    todos.value = [...inc, ...comp]
  }

  onMounted(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) todos.value = JSON.parse(raw)
    } catch {
      /* ignore */
    }
    sinkDoneToBottom()
  })

  watch(filter, (v) => {
    if (v === 'all') sinkDoneToBottom()
  })

  watch(
    todos,
    (v) => {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(v))
    },
    { deep: true },
  )

  const filteredTodos = computed(() => {
    if (filter.value === 'active') return todos.value.filter((t) => !t.done)
    if (filter.value === 'completed') return todos.value.filter((t) => t.done)
    return todos.value
  })

  const activeCount = computed(() => todos.value.filter((t) => !t.done).length)

  function add(title) {
    const t = title.trim()
    if (!t) return
    todos.value.push({ id: crypto.randomUUID(), title: t, done: false })
    sinkDoneToBottom()
  }

  function remove(id) {
    todos.value = todos.value.filter((t) => t.id !== id)
    sinkDoneToBottom()
  }

  /** @param {string[]} ids */
  function removeMany(ids) {
    if (!ids.length) return
    const drop = new Set(ids)
    todos.value = todos.value.filter((t) => !drop.has(t.id))
    sinkDoneToBottom()
  }

  function toggle(id) {
    const item = todos.value.find((t) => t.id === id)
    if (item) item.done = !item.done
    sinkDoneToBottom()
  }

  function updateTitle(id, title) {
    const t = title.trim()
    if (!t) return
    const item = todos.value.find((x) => x.id === id)
    if (item) item.title = t
  }

  function move(id, delta) {
    const index = todos.value.findIndex((t) => t.id === id)
    if (index < 0) return
    const target = index + delta
    if (target < 0 || target >= todos.value.length) return
    const list = [...todos.value]
    const [item] = list.splice(index, 1)
    list.splice(target, 0, item)
    todos.value = list
    sinkDoneToBottom()
  }

  function clearCompleted() {
    todos.value = todos.value.filter((t) => !t.done)
  }

  return {
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
  }
}
