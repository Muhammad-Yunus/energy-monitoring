<script setup lang="ts">
const { data: health } = await useFetch('/api/health')
</script>

<template>
  <UContainer class="py-12">
    <div class="max-w-2xl space-y-6">
      <div class="space-y-2">
        <h1 class="text-2xl font-semibold">
          Energy Monitoring
        </h1>
        <p class="text-muted">
          Scaffold aplikasi siap. Dashboard, autentikasi, dan ingest edge akan ditambahkan pada fitur berikutnya.
        </p>
      </div>

      <UCard>
        <template #header>
          <h2 class="font-medium">
            Status layanan
          </h2>
        </template>

        <div class="space-y-2 text-sm">
          <p>Database: {{ health?.db ? 'ok' : 'gagal' }}</p>
          <p>MinIO: {{ health?.minio ? 'ok' : 'gagal' }}</p>
        </div>
      </UCard>
    </div>
  </UContainer>
</template>
