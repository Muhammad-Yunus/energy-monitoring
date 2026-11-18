<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ReadingPoint } from '~/composables/useReadings'

use([CanvasRenderer, BarChart, LineChart, GridComponent, MarkLineComponent, TooltipComponent])

const props = defineProps<{
  points: ReadingPoint[]
  markerTs?: number | null
}>()

const colorMode = useColorMode()
const isDark = computed(() => colorMode.value === 'dark')

const axisTimeFormat = new Intl.DateTimeFormat('id-ID', {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

const option = computed<EChartsOption>(() => {
  const muted = isDark.value ? '#6f7785' : '#8b929c'
  const splitLine = isDark.value ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.055)'
  const accent = isDark.value ? '#6e7af7' : '#6572f4'
  const red = isDark.value ? '#f06a62' : '#e5534b'
  const pairs = props.points.map(point => [Date.parse(point.ts), point.value] as [number, number])

  return {
    animation: false,
    grid: { left: 4, right: 8, top: 24, bottom: 4, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark.value ? '#262b33' : '#ffffff',
      borderColor: isDark.value ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
      textStyle: { color: isDark.value ? '#f2f4f8' : '#14171c', fontSize: 11 },
      valueFormatter: value => `${Number(value).toFixed(1)} A`,
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: muted,
        fontSize: 9.5,
        formatter: (value: string | number) => axisTimeFormat.format(new Date(Number(value))).replace(/\./g, ':'),
        hideOverlap: true,
      },
      axisLine: { lineStyle: { color: splitLine } },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      scale: true,
      axisLabel: {
        color: muted,
        fontSize: 9.5,
        formatter: (value: string | number) => Number(value).toFixed(0),
      },
      axisLine: { show: false },
      splitLine: { lineStyle: { color: splitLine } },
    },
    series: [
      {
        name: 'Arus',
        type: 'bar',
        barMaxWidth: 16,
        data: pairs.map(([timestamp, value]) => ({
          value: [timestamp, value],
          itemStyle: {
            color: value < 5 ? red : accent,
            borderRadius: [3, 3, 0, 0] as [number, number, number, number],
            opacity: 0.75,
          },
        })),
        label: {
          show: true,
          position: 'top',
          distance: 4,
          color: muted,
          fontSize: 9.5,
          formatter: (params: { value?: unknown }) => {
            const value = Array.isArray(params.value) ? params.value[1] : params.value
            return `${Number(value ?? 0).toFixed(1)} A`
          },
        },
      },
      {
        name: 'Tren',
        type: 'line',
        data: pairs,
        showSymbol: true,
        symbolSize: 5,
        smooth: false,
        lineStyle: { width: 2, color: isDark.value ? 'rgba(110,122,247,0.72)' : 'rgba(101,114,244,0.65)' },
        itemStyle: { color: accent, borderColor: '#ffffff', borderWidth: 1.4 },
        areaStyle: { opacity: 0 },
        markLine: props.markerTs == null
          ? undefined
          : {
              silent: true,
              symbol: 'none',
              lineStyle: { color: red, width: 1.5, type: 'dashed' },
              label: { show: false },
              data: [{ xAxis: props.markerTs }],
            },
      },
    ],
  }
})
</script>

<template>
  <div class="h-full w-full">
    <VChart :option="option" autoresize />
  </div>
</template>
