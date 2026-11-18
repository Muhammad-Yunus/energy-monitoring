<script setup lang="ts">
import type { EChartsOption } from 'echarts'
import { BarChart, LineChart } from 'echarts/charts'
import { GridComponent, MarkLineComponent, TooltipComponent } from 'echarts/components'
import { use } from 'echarts/core'
import { LabelLayout } from 'echarts/features'
import { CanvasRenderer } from 'echarts/renderers'
import VChart from 'vue-echarts'
import type { ReadingPoint } from '~/composables/useReadings'

use([CanvasRenderer, BarChart, LineChart, GridComponent, MarkLineComponent, TooltipComponent, LabelLayout])

const props = defineProps<{
  points: ReadingPoint[]
  markerTs?: number | null
}>()

const colorMode = useColorMode()
const { dateLocale, t } = useLocale()
const isDark = computed(() => colorMode.value === 'dark')

const axisTimeFormat = computed(() => new Intl.DateTimeFormat(dateLocale.value, {
  timeZone: 'Asia/Jakarta',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
}))

function barGradient(top: string, bottom: string) {
  return {
    type: 'linear' as const,
    x: 0,
    y: 0,
    x2: 0,
    y2: 1,
    colorStops: [
      { offset: 0, color: top },
      { offset: 1, color: bottom },
    ],
  }
}

const option = computed<EChartsOption>(() => {
  const muted = isDark.value ? '#6f7785' : '#8b929c'
  const accent = isDark.value ? '#6e7af7' : '#6572f4'
  const red = isDark.value ? '#f06a62' : '#e5534b'
  const pairs = props.points.map(point => [Date.parse(point.ts), point.value] as [number, number])
  const maxValue = pairs.length ? Math.max(...pairs.map(([, value]) => value)) : 0
  const yMax = maxValue > 0 ? maxValue * 1.1 : 1

  return {
    animation: false,
    grid: { left: 8, right: 8, top: 22, bottom: 26, containLabel: false },
    tooltip: {
      trigger: 'axis',
      backgroundColor: isDark.value ? '#262b33' : '#ffffff',
      borderColor: isDark.value ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.85)',
      textStyle: { color: isDark.value ? '#f2f4f8' : '#14171c', fontSize: 11 },
      valueFormatter: value => `${Number(value).toFixed(1)} mA`,
    },
    xAxis: {
      type: 'time',
      axisLabel: {
        color: muted,
        fontSize: 9.5,
        formatter: (value: string | number) => axisTimeFormat.value.format(new Date(Number(value))).replace(/\./g, ':'),
        hideOverlap: true,
      },
      axisLine: { show: false },
      axisTick: { show: false },
      splitLine: { show: false },
    },
    yAxis: {
      type: 'value',
      min: 0,
      max: yMax,
      show: false,
      splitLine: { show: false },
    },
    series: [
      {
        name: t('chart.current'),
        type: 'bar',
        z: 2,
        data: pairs.map(([timestamp, value]) => {
          const isDrop = value < 5
          return {
            value: [timestamp, value],
            itemStyle: {
              color: isDrop
                ? barGradient(
                    isDark.value ? 'rgba(240,106,98,0.42)' : 'rgba(229,83,75,0.38)',
                    isDark.value ? 'rgba(240,106,98,0.04)' : 'rgba(229,83,75,0.03)',
                  )
                : barGradient(
                    isDark.value ? 'rgba(101,114,244,0.34)' : 'rgba(109,121,246,0.28)',
                    isDark.value ? 'rgba(101,114,244,0.03)' : 'rgba(109,121,246,0.02)',
                  ),
              borderRadius: [3, 3, 0, 0] as [number, number, number, number],
            },
            label: {
              color: isDrop ? red : muted,
              fontWeight: isDrop ? 600 : 500,
            },
          }
        }),
        label: {
          show: true,
          position: 'top',
          distance: 4,
          fontSize: 9.5,
          formatter: (params: { value?: unknown }) => {
            const value = Array.isArray(params.value) ? params.value[1] : params.value
            return `${Number(value ?? 0).toFixed(1)} mA`
          },
        },
        labelLayout: { hideOverlap: true },
      },
      {
        name: t('chart.trend'),
        type: 'line',
        z: 3,
        data: pairs.map(([timestamp, value]) => ({
          value: [timestamp, value],
          symbolSize: value < 5 ? 9 : 6,
          itemStyle: {
            color: value < 5 ? red : accent,
            borderColor: '#ffffff',
            borderWidth: 1.4,
          },
        })),
        showSymbol: true,
        smooth: false,
        lineStyle: { width: 2, color: isDark.value ? 'rgba(110,122,247,0.72)' : 'rgba(101,114,244,0.65)' },
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
