<script setup>
import { ref } from 'vue'
import { useTodos } from './composables/useTodos'

const { filter, filteredTodos, activeCount, add, remove, toggle, clearCompleted } =
  useTodos()

const draft = ref('')

function onSubmit() {
  add(draft.value)
  draft.value = ''
}

const filters = [
  { key: 'all', label: '全部' },
  { key: 'active', label: '未完成' },
  { key: 'completed', label: '已完成' },
]
</script>

<template>
  <div class="app">
    <header class="header">
      <h1 class="title">待辦清單</h1>
      <p class="subtitle">資料存在瀏覽器（localStorage），重新整理不會遺失。</p>
    </header>

    <form class="form" @submit.prevent="onSubmit">
      <label class="sr-only" for="todo-input">新增待辦</label>
      <input
        id="todo-input"
        v-model="draft"
        class="input"
        type="text"
        autocomplete="off"
        placeholder="輸入待辦後按 Enter…"
        maxlength="500"
      />
      <button type="submit" class="btn btn-primary">新增</button>
    </form>

    <div class="toolbar" role="tablist" aria-label="篩選">
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

    <ul v-if="filteredTodos.length" class="list">
      <li v-for="item in filteredTodos" :key="item.id" class="row">
        <label class="check-label">
          <input
            class="checkbox"
            type="checkbox"
            :checked="item.done"
            @change="toggle(item.id)"
          />
          <span class="label-text" :class="{ done: item.done }">{{ item.title }}</span>
        </label>
        <button type="button" class="btn btn-ghost" @click="remove(item.id)">
          刪除
        </button>
      </li>
    </ul>
    <p v-else class="empty">目前沒有項目。新增一筆開始吧。</p>

    <footer v-if="filteredTodos.length || activeCount > 0" class="footer">
      <span class="meta">未完成：{{ activeCount }} 筆</span>
      <button type="button" class="btn btn-ghost" @click="clearCompleted">
        清除已完成
      </button>
    </footer>
  </div>
</template>

<style scoped>
.app {
  max-width: 32rem;
  margin: 0 auto;
  padding: 2rem 1.25rem 3rem;
}

.header {
  margin-bottom: 1.5rem;
}

.title {
  margin: 0 0 0.35rem;
  font-size: 1.75rem;
  font-weight: 600;
  letter-spacing: -0.02em;
}

.subtitle {
  margin: 0;
  font-size: 0.9rem;
  opacity: 0.85;
  line-height: 1.45;
}

.form {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.input {
  flex: 1;
  min-width: 0;
  padding: 0.65rem 0.85rem;
  font: inherit;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  background: var(--surface);
  color: var(--text-h);
}

.input:focus {
  outline: 2px solid var(--accent);
  outline-offset: 1px;
}

.toolbar {
  display: flex;
  gap: 0.35rem;
  margin-bottom: 0.75rem;
}

.tab {
  flex: 1;
  padding: 0.45rem 0.5rem;
  font: inherit;
  font-size: 0.875rem;
  border: 1px solid var(--border);
  border-radius: 0.4rem;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.tab--active {
  border-color: var(--accent);
  color: var(--text-h);
  background: var(--accent-bg);
}

.list {
  list-style: none;
  margin: 0;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  overflow: hidden;
  background: var(--surface);
}

.row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.6rem 0.65rem;
  border-bottom: 1px solid var(--border);
}

.row:last-child {
  border-bottom: none;
}

.check-label {
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}

.checkbox {
  margin-top: 0.2rem;
  accent-color: var(--accent);
  flex-shrink: 0;
}

.label-text {
  word-break: break-word;
  text-align: left;
  line-height: 1.4;
}

.label-text.done {
  text-decoration: line-through;
  opacity: 0.55;
}

.empty {
  margin: 1rem 0 0;
  font-size: 0.95rem;
  opacity: 0.8;
}

.footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 1rem;
  flex-wrap: wrap;
}

.meta {
  font-size: 0.875rem;
  opacity: 0.9;
}

.btn {
  font: inherit;
  font-size: 0.875rem;
  padding: 0.45rem 0.75rem;
  border-radius: 0.4rem;
  border: 1px solid transparent;
  cursor: pointer;
}

.btn-primary {
  background: var(--accent);
  color: #fff;
  border-color: transparent;
}

.btn-primary:hover {
  filter: brightness(1.05);
}

.btn-ghost {
  background: transparent;
  border-color: var(--border);
  color: var(--text-h);
}

.btn-ghost:hover {
  background: var(--accent-bg);
  border-color: var(--accent-border);
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
</style>
