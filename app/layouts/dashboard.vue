<script setup lang="ts">
const route = useRoute()
const colorMode = useColorMode()
const { user, logout } = useAuth()
const connected = useState('em-live-connected', () => false)
const { locale, t, setLocale } = useLocale()

useHead({ title: computed(() => `${t('nav.dashboard')} · ${t('app.name')}`) })

const navItems = computed(() => [
  { to: '/', label: t('nav.dashboard'), path: '/' },
  { to: '/events', label: t('nav.inbox'), path: '/events' },
  { to: '/door', label: t('nav.door'), path: '/door' },
  { to: '/health', label: t('nav.health'), path: '/health' },
])

const initials = computed(() => {
  const name = user.value?.name ?? t('role.operator')
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
              {{ t('app.name') }}
            </h1>
            <p class="em-brand-sub">
              {{ t('app.tagline') }}
            </p>
          </div>
        </div>

        <div class="em-header-actions">
          <span class="em-live" :title="t('header.liveTitle')">
            <span class="em-dot" :class="connected ? 'em-dot--online' : 'em-dot--offline'" />
            {{ connected ? t('header.liveConnected') : t('header.liveDisconnected') }}
          </span>

          <button
            class="em-icon-btn"
            type="button"
            :title="t('header.refresh')"
            :aria-label="t('header.refresh')"
            @click="refreshNuxtData()"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
              <path d="M23 4v6h-6" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M1 20v-6h6" stroke-linecap="round" stroke-linejoin="round" />
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <div class="em-range-pills" role="group" :aria-label="t('lang.label')">
            <button
              type="button"
              class="em-range-pill-btn"
              :class="{ active: locale === 'id' }"
              :aria-pressed="locale === 'id'"
              @click="setLocale('id')"
            >
              ID
            </button>
            <button
              type="button"
              class="em-range-pill-btn"
              :class="{ active: locale === 'en' }"
              :aria-pressed="locale === 'en'"
              @click="setLocale('en')"
            >
              EN
            </button>
          </div>

          <button
            class="em-icon-btn"
            type="button"
            :title="t('header.theme')"
            :aria-label="t('header.theme')"
            @click="toggleTheme"
          >
            <svg v-if="colorMode.value === 'dark'" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <circle cx="12" cy="12" r="4" />
              <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" stroke-linecap="round" />
            </svg>
            <svg v-else width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79Z" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>

          <div class="em-profile">
            <span class="em-avatar">{{ initials }}</span>
            <span class="em-profile-info">
              <span class="em-profile-role">{{ user?.role === 'admin' ? t('role.admin') : (user?.role ?? t('role.admin')) }}</span>
              <span class="em-profile-name">{{ user?.name ?? t('role.operator') }}</span>
            </span>
            <button class="em-logout-mini" type="button" :title="t('header.logout')" @click="logout">
              {{ t('header.logoutShort') }}
            </button>
          </div>
        </div>
      </header>

      <div class="em-body">
        <nav class="em-sidebar" :aria-label="t('nav.aria')">
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
