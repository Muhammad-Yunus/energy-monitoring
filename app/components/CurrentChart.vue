<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { LineChart } from 'echarts/charts'
import { GridComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ReadingPoint } from '~/composables/useReadings'

use([CanvasRenderer, LineChart, GridComponent, TooltipComponent])

const props = defineProps<{
  points: ReadingPoint[]
}>()

const axisTimeFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
})

const option = computed<EChartsOption>(() => ({
  animation: false,
  grid: { left: 8, right: 16, top: 16, bottom: 8, containLabel: true },
  tooltip: {
    trigger: 'axis',
  },
  xAxis: {
    type: 'time',
    axisLabel: {
      formatter: (value: string | number) => axisTimeFormat.format(new Date(Number(value))),
      hideOverlap: true,
    },
    splitLine: { show: false },
  },
  yAxis: {
    type: 'value',
    name: 'A',
    scale: true,
    axisLabel: {
      formatter: (value: string | number) => Number(value).toFixed(1),
    },
    splitLine: { lineStyle: { opacity: 0.2 } },
  },
  series: [
    {
      name: 'Arus',
      type: 'line',
      data: props.points.map(point => [Date.parse(point.ts), point.value]),
      showSymbol: false,
      lineStyle: { width: 2 },
      areaStyle: { opacity: 0.12 },
    },
  ],
}))
</script>

<template>
  <div class="h-72 w-full">
    <VChart :option="option" autoresize />
  </div>
</template>
