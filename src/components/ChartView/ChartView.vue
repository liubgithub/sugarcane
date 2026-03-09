<template>
  <div ref="chart" class="chart-container"></div>
</template>

<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';

const props = defineProps<{
  option: EChartsOption;
}>();

const chart = ref<HTMLElement | null>(null);
let instance: echarts.ECharts | null = null;

const initChart = () => {
  if (chart.value) {
    instance = echarts.init(chart.value);
    instance.setOption(props.option);
  }
};

function resize() {
  instance?.resize();
}

onMounted(() => {
  initChart();
  window.addEventListener('resize', resize);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', resize);
  instance?.dispose();
});

watch(
  () => props.option,
  (newVal) => {
    if (instance && newVal) {
      instance.setOption(newVal);
    }
  },
  { deep: true }
);
</script>

<style scoped>
.chart-container {
  width: 100%;
  height: 100%;
}
</style>
