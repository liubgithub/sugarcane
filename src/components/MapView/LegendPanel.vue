<template>
    <div class="legend-panel">
        <!-- 图层选择控件 -->
        <div class="layer-control" v-if="showLayerControl">
            <div class="layer-control-title">图层列表</div>
            <div class="layer-options">
                <label v-for="layer in layerOptions" :key="layer.value" class="layer-option">
                    <input type="radio" name="layer-select" :value="layer.value" :checked="modelValue === layer.value"
                        @change="onLayerChange(layer.value)" />
                    <span>{{ layer.label }}</span>
                </label>
            </div>
        </div>

        <!-- 降雨图例 -->
        <div class="rain-legend" v-if="showRainLegend">
            <div class="legend-title">未来 10 天降雨距平差</div>
            <div class="legend-gradient">
                <div v-for="(color, index) in krigingColors" :key="index" class="legend-color-block"
                    :style="{ backgroundColor: color }"></div>
            </div>
            <div class="legend-values">
                <span v-for="(val, idx) in rainLegendValues" :key="idx">{{ val }}</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, watch } from 'vue';

const props = defineProps({
    modelValue: {
        type: String,
        default: 'district'
    },
    showLayerControl: {
        type: Boolean,
        default: true
    },
    showRainLegend: {
        type: Boolean,
        default: false
    },
    // 当前激活的图层类型，用于动态显示对应图例
    activeLayer: {
        type: String,
        default: ''
    },
    // 是否显示地图图例（WMS图层图例）
    showMapLegend: {
        type: Boolean,
        default: false
    },
    // 地图图例配置
    mapLegendConfig: {
        type: Object,
        default: () => ({})
    },
    // 县级图例数据
    districtLegendData: {
        type: Object,
        default: () => ({
            title: '甘蔗面积 (万亩)',
            ranges: []
        })
    },
    yieldLegendData: {
        type: Object,
        default: () => ({
            title: '产量 (吨/亩)',
            ranges: []
        })
    }
});

const emit = defineEmits(['update:modelValue', 'layer-change']);

// 图层选项
const layerOptions = [
    { label: '甘蔗种植分布（遥感）', value: 'plant' },
    { label: '甘蔗产量分布（遥感）', value: 'production' },
    { label: '种植面积分布图层', value: 'district' },
    { label: '亩产分布图层', value: 'yield' },
];

// 降雨图例颜色
const krigingColors = [
    '#0fa00f', '#37d23c', '#78f573', '#bafaaa', '#e6ffe1',
    '#ffffff', '#e1b1b4', '#b48c82', '#8c645a', '#643c32'
];

// 降雨图例数值
const rainLegendValues = [100, 75, 50, 25, 15, -15, -25, -50, -75, -100];

// 图层变更
const onLayerChange = (value) => {
    emit('update:modelValue', value);
    emit('layer-change', value);
};

// 颜色分级配置（用于生成默认图例数据）
const colorClassify = {
    "3": "#ffffff",
    "5": "#d4e6f1",
    "7": "#a9cce3",
    "10": "#7fb3d5",
    "15": "#5499c7"
};

const colorClassify_2 = {
    "1": "#ffffff",
    "2": "#d5f5e3",
    "3": "#a9dfbf",
    "4": "#7dcea0",
    "5": "#52be80"
};

// 获取种植面积分级区间
const getDistrictRanges = () => {
    const thresholds = Object.keys(colorClassify).map(Number).sort((a, b) => a - b);
    const ranges = [];
    ranges.push({
        label: "< 3",
        color: colorClassify[thresholds[0].toString()],
        min: -Infinity,
        max: thresholds[0],
    });
    for (let i = 0; i < thresholds.length - 1; i++) {
        ranges.push({
            label: `${thresholds[i]} - ${thresholds[i + 1]}`,
            color: colorClassify[thresholds[i + 1].toString()],
            min: thresholds[i],
            max: thresholds[i + 1],
        });
    }
    return ranges;
};

// 获取亩产分级区间
const getYieldRanges = () => {
    const thresholds = Object.keys(colorClassify_2).map(Number).sort((a, b) => a - b);
    const ranges = [];
    ranges.push({
        label: `< ${thresholds[0]}`,
        color: colorClassify_2[thresholds[0].toString()],
        min: -Infinity,
        max: thresholds[0],
    });
    for (let i = 0; i < thresholds.length - 1; i++) {
        ranges.push({
            label: `${thresholds[i]} - ${thresholds[i + 1]}`,
            color: colorClassify_2[thresholds[i + 1].toString()],
            min: thresholds[i],
            max: thresholds[i + 1],
        });
    }
    return ranges;
};

// 创建地图图例HTML（供父组件使用）
const createMapLegendHTML = (config) => {
    if (!config || !config.type) return '';

    const { type, title, color, colors, min, max } = config;

    let html = `<div style="margin-bottom: 8px; color: #475569; font-weight: bold;">${title || '图例'}</div>`;

    if (type === 'solid' && color) {
        html += `
            <div style="
                width: 100%;
                height: 20px;
                background: ${color};
                border-radius: 3px;
                margin-bottom: 5px;
            "></div>
        `;
    } else if (type === 'gradient' && colors && colors.length > 0) {
        const gradientStops = colors.map((c, index) => {
            const percent = (index / (colors.length - 1)) * 100;
            return `${c} ${percent}%`;
        }).join(", ");

        html += `
            <div style="
                width: 100%;
                height: 20px;
                background: linear-gradient(to right, ${gradientStops});
                border-radius: 3px;
                margin-bottom: 5px;
            "></div>
            <div style="display: flex; justify-content: space-between; font-size: 10px;">
                <span>${min !== undefined ? min : ''}</span>
                <span>${max !== undefined ? max : ''}</span>
            </div>
        `;
    }

    return html;
};

// 创建县级图例HTML
const createDistrictLegendHTML = (data) => {
    const ranges = data.ranges?.length > 0 ? data.ranges : getDistrictRanges();

    let html = `
        <div style="
            font-weight: bold;
            margin-bottom: 8px;
            color: #334155;
            font-size: 12px;
            text-align: center;
            border-bottom: 1px solid rgba(203, 213, 225, 0.3);
            padding-bottom: 6px;
        ">${data.title || '甘蔗面积 (万亩)'}</div>
    `;

    ranges.forEach((range, index) => {
        html += `
            <div style="
                display: flex;
                align-items: center;
                margin-bottom: ${index === ranges.length - 1 ? "0" : "6px"};
            ">
                <div style="
                    width: 55px;
                    height: 16px;
                    background-color: ${range.color};
                    border: 1px solid rgba(0, 0, 0, 0.2);
                    margin-right: 8px;
                    flex-shrink: 0;
                "></div>
                <span style="color: #334155; font-size: 12px;">${range.label}</span>
            </div>
        `;
    });

    return html;
};

// 创建亩产图例HTML
const createYieldLegendHTML = (data) => {
    const ranges = data.ranges?.length > 0 ? data.ranges : getYieldRanges();

    let html = `
        <div style="
            font-weight: bold;
            margin-bottom: 8px;
            color: #334155;
            font-size: 12px;
            text-align: center;
            border-bottom: 1px solid rgba(203, 213, 225, 0.3);
            padding-bottom: 6px;
        ">${data.title || '产量 (吨/亩)'}</div>
    `;

    ranges.forEach((range, index) => {
        html += `
            <div style="
                display: flex;
                align-items: center;
                margin-bottom: ${index === ranges.length - 1 ? "0" : "6px"};
            ">
                <div style="
                    width: 55px;
                    height: 16px;
                    background-color: ${range.color};
                    border: 1px solid rgba(0, 0, 0, 0.2);
                    margin-right: 8px;
                    flex-shrink: 0;
                "></div>
                <span style="color: #334155; font-size: 12px;">${range.label}</span>
            </div>
        `;
    });

    return html;
};

// 获取当前应该显示的图例类型
const getCurrentLegendType = () => {
    switch (props.activeLayer) {
        case 'plant':
            return { type: 'solid', config: { title: '甘蔗种植分布遥感图', color: '#9ac698' } };
        case 'production':
            return {
                type: 'gradient',
                config: {
                    title: '甘蔗产量分布遥感图(吨/亩)',
                    colors: ["#ff20ff", "#2401ff", "#0efefa", "#ffec01", "#9a2401"],
                    min: 1.34,
                    max: 10.25
                }
            };
        case 'district':
            return { type: 'district', config: props.districtLegendData };
        case 'yield':
            return { type: 'yield', config: props.yieldLegendData };
        default:
            return null;
    }
};

// 暴露方法给父组件
defineExpose({
    createMapLegendHTML,
    createDistrictLegendHTML,
    createYieldLegendHTML,
    getCurrentLegendType,
    getDistrictRanges,
    getYieldRanges,
    layerOptions
});
</script>

<style scoped>
.legend-panel {
    position: relative;
}

/* 图层控制 */
.layer-control {
    position: absolute;
    top: 12px;
    right: 12px;
    background: rgba(255, 255, 255, 0.95);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid rgba(203, 213, 225, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 180px;
}

.layer-control-title {
    font-weight: bold;
    color: #334155;
    font-size: 14px;
    margin-bottom: 8px;
    border-bottom: 1px solid rgba(203, 213, 225, 0.3);
    padding-bottom: 6px;
}

.layer-options {
    display: flex;
    flex-direction: column;
    gap: 8px;
}

.layer-option {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #334155;
    font-size: 12px;
    transition: color 0.2s;
}

.layer-option:hover {
    color: #4fc3f7;
}

.layer-option input {
    margin-right: 8px;
    cursor: pointer;
}

/* 降雨图例 */
.rain-legend {
    position: absolute;
    bottom: 20px;
    right: 12px;
    background: rgba(255, 255, 255, 0.95);
    padding: 10px;
    border-radius: 6px;
    border: 1px solid rgba(203, 213, 225, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 200px;
}

.legend-title {
    font-weight: bold;
    color: #334155;
    font-size: 12px;
    margin-bottom: 8px;
    text-align: center;
}

.legend-gradient {
    display: flex;
    height: 20px;
    border-radius: 3px;
    overflow: hidden;
    margin-bottom: 5px;
}

.legend-color-block {
    flex: 1;
    height: 100%;
}

.legend-values {
    display: flex;
    justify-content: space-between;
    font-size: 10px;
    color: #64748b;
}
</style>