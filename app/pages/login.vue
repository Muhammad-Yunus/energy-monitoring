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
  <div class="flex min-h-screen items-center justify-center p-4">
    <UCard class="w-full max-w-sm">
      <template #header>
        <div class="space-y-1">
          <h1 class="text-xl font-semibold">
            {{ t('login.title') }}
          </h1>
          <p class="text-sm text-muted">
            {{ t('login.subtitle') }}
          </p>
        </div>
      </template>

      <form class="space-y-4" @submit.prevent="onSubmit">
        <UAlert v-if="error" color="error" :title="error" />

        <UFormField :label="t('login.email')" name="email">
          <UInput
            v-model="email"
            type="email"
            autocomplete="username"
            required
            class="w-full"
          />
        </UFormField>

        <UFormField :label="t('login.password')" name="password">
          <UInput
            v-model="password"
            type="password"
            autocomplete="current-password"
            required
            class="w-full"
          />
        </UFormField>

        <UButton type="submit" block :loading="loading">
          {{ t('login.submit') }}
        </UButton>
      </form>
    </UCard>
  </div>
</template>
