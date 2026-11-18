<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()
const { user, logout } = useAuth()
const connected = useState('em-live-connected', () => false)

useHead({ title: 'Dashboard · Gardu Demo' })

const navItems = [
  { to: '/', label: 'Dashboard', path: '/' },
  { to: '/events', label: 'Inbox Event', path: '/events' },
  { to: '/door', label: 'Door Log', path: '/door' },
  { to: '/health', label: 'Device Health & Storage', path: '/health' },
]

const initials = computed(() => {
  const name = user.value?.name ?? 'Operator'
  return name.split(/\s+/).map(part => part[0] ?? '').join('').slice(0, 2).toUpperCase()
})

function isActive(path: string) {
  return path === '/' ? route.path === '/' : route.path.startsWith(path)
}

function toggleTheme() {
  colorMode.preference = colorMode.value === 'dark' ? 'light' : 'dark'
}
</script>

<template>
  <div class="em-page">
    <div class="em-shell">
      <header class="em-header">
        <div class="em-brand">
          <svg class="em-brand-logo" viewBox="0 0 32 32" fill="none" aria-hidden="true">
            <path
              d="M16 3L27.2583 9.5V22.5L16 29L4.74167 22.5V9.5L16 3Z"
              stroke="currentColor"
              stroke-width="2"
              stroke-linejoin="round"
            />
            <path
              d="M17.2 8.5L11.5 16.5H16L14.8 23.5L20.5 15.5H16L17.2 8.5Z"
              fill="currentColor"
            />
          </svg>
          <div>
            <h1 class="em-brand-title">
              Gardu Demo
            </h1>
            <p class="em-brand-sub">
              EDGE-001 · Update real-time
            </p>
          </div>
        </div>

        <div class="em-header-actions">
          <span class="em-live" title="Status koneksi Server-Sent Events (SSE)">
            <span class="em-dot" :class="connected ? 'em-dot--online' : 'em-dot--offline'" />
            {{ connected ? 'Live tersambung' : 'Live terputus — mencoba lagi' }}
          </span>

          <button
            class="em-icon-btn"
            type="button"
            title="Refresh data"
            aria-label="Refresh data"
            @click="refreshNuxtData()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M23 4v6h-6" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M1 20v-6h6" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <button
            class="em-theme-btn"
            type="button"
            title="Switch Light / Dark Theme"
            @click="toggleTheme"
          >
            {{ colorMode.value === 'dark' ? 'Light' : 'Dark' }}
          </button>

          <div class="em-profile">
            <span class="em-avatar">{{ initials }}</span>
            <span class="em-profile-info">
              <span class="em-profile-role">{{ user?.role ?? 'admin' }}</span>
              <span class="em-profile-name">{{ user?.name ?? 'Operator' }}</span>
            </span>
            <button class="em-logout-mini" type="button" title="Keluar ke halaman login" @click="logout">
              Keluar
            </button>
          </div>
        </div>
      </header>

      <div class="em-body">
        <nav class="em-sidebar" aria-label="Navigasi utama">
          <NuxtLink
            v-for="item in navItems"
            :key="item.to"
            :to="item.to"
            class="em-nav-btn"
            :class="{ 'is-active': isActive(item.path) }"
            :aria-label="item.label"
            :title="item.label"
          >
            <svg v-if="item.to === '/'" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <rect x="4" y="4" width="16" height="16" rx="3" fill="none" stroke="currentColor" stroke-width="1.8" />
              <rect x="8" y="12" width="2" height="4" rx="0.5" />
              <rect x="11" y="9" width="2" height="7" rx="0.5" />
              <rect x="14" y="11" width="2" height="5" rx="0.5" />
            </svg>
            <svg v-else-if="item.to === '/events'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <path d="M12 9v4M12 17h.01" stroke-linecap="round" />
            </svg>
            <svg v-else-if="item.to === '/health'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="3" y="4" width="18" height="7" rx="2" />
              <rect x="3" y="13" width="18" height="7" rx="2" />
              <circle cx="7" cy="7.5" r="1" fill="currentColor" />
              <circle cx="7" cy="16.5" r="1" fill="currentColor" />
            </svg>
            <svg v-else width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <rect x="5" y="11" width="14" height="10" rx="2" />
              <path d="M8 11V7a4 4 0 0 1 8 0v4" />
            </svg>
          </NuxtLink>
        </nav>

        <main class="em-content">
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
