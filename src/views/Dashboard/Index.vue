<template>
    <div class="dashboard">
        <MapView :districtData="districtData" :yieldData="yieldData" :cityData="cityData"
            @layer-change="handleLayerChange" />
    </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue';
import MapView from '@/components/MapView/MapView.vue';

// 修复了中文冒号问题，并为键名添加引号以确保兼容性
const districtData = ref({
    '江州区': 67, '扶绥县': 80, '龙州县': 40, '宁明县': 20, '大新县': 40,
    '江南区': 60, '良庆区': 50, '武鸣区': 5, '邕宁区': 5, '青秀区': 20,
});

const yieldData = ref({
    '江州区': 3.5, '扶绥县': 4.2, '龙州县': 3.8,
});

const cityData = ref({
    '崇左': { '种植面积': 374.85, '总产量': 1803.79 },
    '来宾': { '种植面积': 223.21, '总产量': 1234.70 },
});

// 补充缺失的事件处理函数，避免模板报错
const handleLayerChange = (layer: any) => {
    console.log('Layer changed:', layer);
};
</script>

<style scoped lang="scss">
.dashboard {
    width: 100%;
    height: 100%;
}
</style>