<script setup lang="ts">
const { t } = useLocale()
const { login } = useAuth()
const email = ref('')
const password = ref('')
const error = ref<string | null>(null)
const loading = ref(false)

async function onSubmit() {
  error.value = null
  loading.value = true

  try {
    await login(email.value, password.value)
    await navigateTo('/')
  }
  catch (err) {
    const data = (err as { data?: { error?: { message?: string } } }).data
    error.value = data?.error?.message ?? t('login.error')
  }
  finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="em-page em-login-page">
    <div class="em-card em-login-card">
      <div class="em-login-head">
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
          <h1 class="em-login-title">
            {{ t('login.title') }}
          </h1>
          <p class="em-login-sub">
            {{ t('login.subtitle') }}
          </p>
        </div>
      </div>

      <form class="em-login-form" @submit.prevent="onSubmit">
        <p v-if="error" class="em-login-error">
          {{ error }}
        </p>

        <label class="em-login-field">
          <span class="em-login-label">{{ t('login.email') }}</span>
          <input
            v-model="email"
            class="em-input-control"
            type="email"
            autocomplete="username"
            required
          >
        </label>

        <label class="em-login-field">
          <span class="em-login-label">{{ t('login.password') }}</span>
          <input
            v-model="password"
            class="em-input-control"
            type="password"
            autocomplete="current-password"
            required
          >
        </label>

        <button class="em-btn-primary" type="submit" :disabled="loading">
          {{ loading ? '…' : t('login.submit') }}
        </button>
      </form>
    </div>
  </div>
</template>
