<template>
    <div class="map-wrapper">
        <!-- 地图容器 -->
        <div ref="mapContainer" class="map-container"></div>

        <!-- 图层选择控件 -->
        <div class="layer-control" v-if="showLayerControl">
            <div class="layer-control-title">图层列表</div>
            <div class="layer-options">
                <label v-for="layer in layerOptions" :key="layer.value" class="layer-option">
                    <input type="radio" name="layer-select" :value="layer.value" v-model="currentLayer"
                        @change="onLayerChange" />
                    <span>{{ layer.label }}</span>
                </label>
            </div>
        </div>

        <!-- 降雨图例 -->
        <div class="rain-legend" v-if="showRainLegend" ref="rainLegend">
            <div class="legend-title">未来 10 天降雨距平差</div>
            <div class="legend-gradient">
                <div v-for="(color, index) in krigingColors" :key="index" class="legend-color-block"
                    :style="{ backgroundColor: color }"></div>
            </div>
            <div class="legend-values">
                <span>100</span>
                <span>75</span>
                <span>50</span>
                <span>25</span>
                <span>15</span>
                <span>-15</span>
                <span>-25</span>
                <span>-50</span>
                <span>-75</span>
                <span>-100</span>
            </div>
        </div>
    </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// 修复 Vue 3 + Vite/Webpack 下默认图标丢失的问题
import iconDefault from 'leaflet/dist/images/marker-icon.png';
import iconShadow from 'leaflet/dist/images/marker-shadow.png';

const DefaultIcon = L.icon({
    iconUrl: iconDefault,
    shadowUrl: iconShadow,
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
    shadowSize: [41, 41]
});
L.Marker.prototype.options.icon = DefaultIcon;

// ==================== Props 定义 ====================
const props = defineProps({
    // 地图中心点和缩放
    center: {
        type: Array,
        default: () => [22.30904671920277, 109.01733398437501]
    },
    zoom: {
        type: Number,
        default: 7
    },
    // 县级种植面积数据
    districtData: {
        type: Object,
        default: () => ({})
    },
    // 县级亩产数据
    yieldData: {
        type: Object,
        default: () => ({})
    },
    // 城市数据映射
    cityDataMap: {
        type: Object,
        default: () => ({})
    },
    // 是否显示图层控制
    showLayerControl: {
        type: Boolean,
        default: true
    },
    // 是否显示降雨图例
    showRainLegend: {
        type: Boolean,
        default: false
    }
});

// ==================== 响应式变量 ====================
const mapContainer = ref(null);
const rainLegend = ref(null);
const currentLayer = ref('district');

let mapInstance = null;

// 地图初始视图
const initialMapView = {
    center: [22.30904671920277, 109.01733398437501],
    zoom: 7,
};

// 图层选项配置
const layerOptions = [
    { label: '甘蔗种植分布（遥感）', value: 'plant' },
    { label: '甘蔗产量分布（遥感）', value: 'production' },
    { label: '种植面积分布图层', value: 'district' },
    { label: '亩产分布图层', value: 'yield' },
];

// ==================== 图层配置（完整 WMS 配置） ====================
const layerConfig = [
    {
        name: "plant",
        type: "wms",
        url: "http://39.170.97.139:6080/arcgis/services/oge/guangxi2/MapServer/WmsServer",
        layers: "0",
        format: "image/png",
        transparent: true,
        extent: [102.82104492187501, 20.447602397594167, 113.69750976562501, 26.82407078047018],
        legendType: "solid",
        legendColor: "#9ac698",
        legendTitle: "甘蔗种植分布遥感图",
        legendMin: 0,
        legendMax: 100,
    },
    {
        name: "production",
        type: "wms",
        url: "http://39.170.97.139:6080/arcgis/services/oge/guangxi2/MapServer/WmsServer",
        layers: "1",
        format: "image/png",
        transparent: true,
        extent: [102.82104492187501, 20.447602397594167, 113.69750976562501, 26.82407078047018],
        legendType: "gradient",
        legendColors: ["#ff20ff", "#2401ff", "#0efefa", "#ffec01", "#9a2401"],
        legendTitle: "甘蔗产量分布遥感图",
        legendMin: 1.34,
        legendMax: 10.25,
    },
];

// ==================== 颜色分级配置 ====================
const colorClassify = {
    "3": "#feffe6",
    "6": "#f5f5be",
    "30": "#baed7a",
    "60": "#38a800",
    "100": "#005200"
};

const colorClassify_2 = {
    "1": "#feffe6",
    "2": "#f5f5be",
    "3": "#c0dc50",
    "4": "#baed7a",
    "5": "#008000",
    "6": "#008000",
    "7": "#005200",
};

// 降雨距平差颜色（kriging 插值）
const krigingColors = [
    '#0fa00f', '#37d23c', '#78f573', '#bafaaa', '#e6ffe1',
    '#ffffff', '#e1b1b4', '#b48c82', '#8c645a', '#643c32', '#fffaaa'
];

// ==================== 状态变量 ====================
let chinaBoundary = null;
let layerImageOverlays = {};
let layerWMSOverlays = {};
let currentActiveLayer = null;
let cityLabels = [];
let worldLayer = null;
let chinaLayer = null;
let guangxiLayer = null;
let guangxiCityLayer = null;
let guangxiDistrictLayer = null;
let guangxiDistrictYieldLayer = null;
let currentViewLevel = "world";
let isZoomSwitching = false;

// 图例控制变量
let mapLegendControl = null;
let cityLegendControl = null;
let rainLegendControl = null;
let legendMinElement = null;
let legendMaxElement = null;
let layerControlInitialized = false;

// ==================== 工具函数 ====================

// 获取边界框
function getChinaBounds(geojson) {
    let minLon = Infinity, maxLon = -Infinity;
    let minLat = Infinity, maxLat = -Infinity;

    function processCoordinates(coords) {
        if (Array.isArray(coords[0][0])) {
            coords.forEach((coord) => processCoordinates(coord));
        } else {
            coords.forEach((coord) => {
                const [lon, lat] = coord;
                minLon = Math.min(minLon, lon);
                maxLon = Math.max(maxLon, lon);
                minLat = Math.min(minLat, lat);
                maxLat = Math.max(maxLat, lat);
            });
        }
    }

    if (geojson.type === "FeatureCollection") {
        geojson.features.forEach((feature) => {
            if (feature.geometry.type === "Polygon") {
                processCoordinates(feature.geometry.coordinates);
            } else if (feature.geometry.type === "MultiPolygon") {
                feature.geometry.coordinates.forEach((polygon) => {
                    processCoordinates(polygon);
                });
            }
        });
    }

    return { minLon, maxLon, minLat, maxLat };
}

// 根据值获取分级颜色
function getDistrictColor(value) {
    if (value === 0 || value === undefined || value === null) {
        return colorClassify["3"];
    }
    const thresholds = Object.keys(colorClassify).map(Number).sort((a, b) => a - b);
    if (value < thresholds[0]) {
        return colorClassify[thresholds[0].toString()];
    }
    for (let i = 0; i < thresholds.length - 1; i++) {
        if (value >= thresholds[i] && value < thresholds[i + 1]) {
            return colorClassify[thresholds[i + 1].toString()];
        }
    }
    return colorClassify[thresholds[thresholds.length - 1].toString()];
}

// 根据值获取分级颜色（亩产分布）
function getDistrictColor2(value) {
    if (value === 0 || value === undefined || value === null) {
        const thresholds = Object.keys(colorClassify_2).map(Number).sort((a, b) => a - b);
        return colorClassify_2[thresholds[0].toString()];
    }
    const thresholds = Object.keys(colorClassify_2).map(Number).sort((a, b) => a - b);
    if (value < thresholds[0]) {
        return colorClassify_2[thresholds[0].toString()];
    }
    for (let i = 0; i < thresholds.length - 1; i++) {
        if (value >= thresholds[i] && value < thresholds[i + 1]) {
            return colorClassify_2[thresholds[i + 1].toString()];
        }
    }
    return colorClassify_2[thresholds[thresholds.length - 1].toString()];
}

// 生成随机百分比
function generateRandomPercentage() {
    const num = (Math.random() * 20 - 10).toFixed(2);
    return num > 0 ? `+${num}%` : `${num}%`;
}

// 获取颜色分级区间
function getColorClassifyRanges() {
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
}

// 获取亩产颜色分级区间
function getColorClassify2Ranges() {
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
}

// ==================== 图例函数 ====================

// 创建纯色图例
function updateMapLegendSolid(title, color, minValue, maxValue) {
    if (mapLegendControl) {
        mapInstance.removeControl(mapLegendControl);
        mapLegendControl = null;
    }

    const LegendControl = L.Control.extend({
        onAdd: function (map) {
            const div = L.DomUtil.create("div", "map-legend");
            div.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        padding: 10px;
        border-radius: 6px;
        border: 1px solid rgba(203, 213, 225, 0.5);
        color: #334155;
        font-size: 12px;
        min-width: 120px;
      `;
            div.innerHTML = `<div style="margin-bottom: 8px; color: #475569; font-weight: bold;">${title}</div>`;
            const colorBar = document.createElement("div");
            colorBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: ${color};
        border-radius: 3px;
        margin-bottom: 5px;
      `;
            div.appendChild(colorBar);
            return div;
        },
        onRemove: function (map) { },
    });

    mapLegendControl = new LegendControl({ position: "bottomright" });
    mapLegendControl.addTo(mapInstance);
}

// 创建渐变色图例
function updateMapLegendGradient(title, colors, minValue, maxValue) {
    if (mapLegendControl) {
        mapInstance.removeControl(mapLegendControl);
        mapLegendControl = null;
    }

    const LegendControl = L.Control.extend({
        onAdd: function (map) {
            const div = L.DomUtil.create("div", "map-legend");
            div.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        padding: 10px;
        border-radius: 6px;
        width: 150px;
        border: 1px solid rgba(203, 213, 225, 0.5);
        color: #334155;
        font-size: 12px;
        min-width: 120px;
      `;
            div.innerHTML = `<div style="margin-bottom: 8px; color: #475569; font-size:12px;">${title}(吨/亩)</div>`;
            const colorBar = document.createElement("div");
            const gradientStops = colors.map((color, index) => {
                const percent = (index / (colors.length - 1)) * 100;
                return `${color} ${percent}%`;
            }).join(", ");
            colorBar.style.cssText = `
        width: 100%;
        height: 20px;
        background: linear-gradient(to right, ${gradientStops});
        border-radius: 3px;
        margin-bottom: 5px;
      `;
            div.appendChild(colorBar);
            const rangeDiv = document.createElement("div");
            rangeDiv.style.cssText = "display: flex; justify-content: space-between; font-size: 10px;";
            rangeDiv.innerHTML = `<span>${minValue}</span><span>${maxValue}</span>`;
            div.appendChild(rangeDiv);
            return div;
        },
        onRemove: function (map) { },
    });

    mapLegendControl = new LegendControl({ position: "bottomright" });
    mapLegendControl.addTo(mapInstance);
}

// 创建县级行政区划图例
function createDistrictLegend() {
    if (!mapInstance) return;
    if (cityLegendControl) {
        mapInstance.removeControl(cityLegendControl);
        cityLegendControl = null;
    }

    const LegendControl = L.Control.extend({
        onAdd: function (map) {
            const div = L.DomUtil.create("div", "legend custom-legend-position");
            div.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
        font-size: 12px;
        min-width: 136px;
      `;

            const title = document.createElement("div");
            title.style.cssText = `
        font-weight: bold;
        margin-bottom: 8px;
        color: #334155;
        font-size: 12px;
        text-align: center;
        border-bottom: 1px solid rgba(203, 213, 225, 0.3);
        padding-bottom: 6px;
      `;
            title.textContent = "甘蔗面积 (万亩)";
            div.appendChild(title);

            const ranges = getColorClassifyRanges();
            ranges.forEach((range, index) => {
                const item = document.createElement("div");
                item.style.cssText = `
          display: flex;
          align-items: center;
          margin-bottom: ${index === ranges.length - 1 ? "0" : "6px"};
        `;
                const colorBox = document.createElement("div");
                colorBox.style.cssText = `
          width: 55px;
          height: 16px;
          background-color: ${range.color};
          border: 1px solid rgba(0, 0, 0, 0.2);
          margin-right: 8px;
          flex-shrink: 0;
        `;
                const label = document.createElement("span");
                label.style.cssText = `color: #334155; font-size: 12px;`;
                label.textContent = range.label;
                item.appendChild(colorBox);
                item.appendChild(label);
                div.appendChild(item);
            });
            return div;
        },
        onRemove: function (map) { },
    });

    cityLegendControl = new LegendControl({ position: "bottomright" });
    cityLegendControl.addTo(mapInstance);
}

// 创建县级亩产分布图例
function createDistrictYieldLegend() {
    if (!mapInstance) return;
    if (cityLegendControl) {
        mapInstance.removeControl(cityLegendControl);
        cityLegendControl = null;
    }

    const LegendControl = L.Control.extend({
        onAdd: function (map) {
            const div = L.DomUtil.create("div", "legend");
            div.style.cssText = `
        background: rgba(255, 255, 255, 0.95);
        padding: 10px;
        border-radius: 4px;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
        font-size: 12px;
        min-width: 100px;
      `;

            const title = document.createElement("div");
            title.style.cssText = `
        font-weight: bold;
        margin-bottom: 8px;
        color: #334155;
        font-size: 12px;
        text-align: center;
        border-bottom: 1px solid rgba(203, 213, 225, 0.3);
        padding-bottom: 6px;
      `;
            title.textContent = "产量 (吨/亩)";
            div.appendChild(title);

            const ranges = getColorClassify2Ranges();
            ranges.forEach((range, index) => {
                const item = document.createElement("div");
                item.style.cssText = `
          display: flex;
          align-items: center;
          margin-bottom: ${index === ranges.length - 1 ? "0" : "6px"};
        `;
                const colorBox = document.createElement("div");
                colorBox.style.cssText = `
          width: 55px;
          height: 16px;
          background-color: ${range.color};
          border: 1px solid rgba(0, 0, 0, 0.2);
          margin-right: 8px;
          flex-shrink: 0;
        `;
                const label = document.createElement("span");
                label.style.cssText = `color: #334155; font-size: 12px;`;
                label.textContent = range.label;
                item.appendChild(colorBox);
                item.appendChild(label);
                div.appendChild(item);
            });
            return div;
        },
        onRemove: function (map) { },
    });

    cityLegendControl = new LegendControl({ position: "bottomright" });
    cityLegendControl.addTo(mapInstance);
}

// 创建降雨图例
function createRainLegend() {
    if (!rainLegend.value) return;

    const legendValues = [100, 75, 50, 25, 15, -15, -25, -50, -75, -100];
    const colors = krigingColors.slice(0, 10);

    console.log('降雨图例已创建');
}

// ==================== 图层控制函数 ====================

// 控制广西地级市边界图层是否响应鼠标事件
function setGuangxiLayerInteractive(enabled) {
    if (!guangxiLayer) return;
    guangxiLayer.eachLayer((layer) => {
        if (layer._path) {
            layer._path.style.pointerEvents = enabled ? "auto" : "none";
        }
    });
}

// 图层变更处理
function onLayerChange() {
    showLayer(currentLayer.value);
}

// 显示指定图层
function showLayer(layerName) {
    if (!mapInstance) return;

    // 隐藏所有图层
    Object.keys(layerImageOverlays).forEach((name) => {
        if (layerImageOverlays[name] && mapInstance.hasLayer(layerImageOverlays[name])) {
            mapInstance.removeLayer(layerImageOverlays[name]);
        }
    });

    Object.keys(layerWMSOverlays).forEach((name) => {
        if (layerWMSOverlays[name] && mapInstance.hasLayer(layerWMSOverlays[name])) {
            mapInstance.removeLayer(layerWMSOverlays[name]);
        }
    });

    // 根据图层类型移除相关图层
    if (layerName === "plant" || layerName === "production") {
        if (guangxiCityLayer) mapInstance.removeLayer(guangxiCityLayer);
        if (guangxiDistrictLayer) mapInstance.removeLayer(guangxiDistrictLayer);
        if (guangxiDistrictYieldLayer) mapInstance.removeLayer(guangxiDistrictYieldLayer);
        if (cityLegendControl) {
            mapInstance.removeControl(cityLegendControl);
            cityLegendControl = null;
        }
        setGuangxiLayerInteractive(true);
    }

    if (layerName === "district") {
        if (guangxiCityLayer) mapInstance.removeLayer(guangxiCityLayer);
        if (guangxiDistrictYieldLayer) mapInstance.removeLayer(guangxiDistrictYieldLayer);
        if (cityLegendControl) {
            mapInstance.removeControl(cityLegendControl);
            cityLegendControl = null;
        }
        if (mapLegendControl) {
            mapInstance.removeControl(mapLegendControl);
            mapLegendControl = null;
        }
        setGuangxiLayerInteractive(false);
        loadGuangxiDistricts();
        currentActiveLayer = layerName;
        return;
    }

    if (layerName === "yield") {
        if (guangxiCityLayer) mapInstance.removeLayer(guangxiCityLayer);
        if (guangxiDistrictLayer) mapInstance.removeLayer(guangxiDistrictLayer);
        if (cityLegendControl) {
            mapInstance.removeControl(cityLegendControl);
            cityLegendControl = null;
        }
        if (mapLegendControl) {
            mapInstance.removeControl(mapLegendControl);
            mapLegendControl = null;
        }
        setGuangxiLayerInteractive(false);
        loadGuangxiDistrictsYield();
        currentActiveLayer = layerName;
        return;
    }

    // 查找图层配置
    const layer = layerConfig.find((l) => l.name === layerName);
    if (!layer) {
        console.error("未找到图层配置:", layerName);
        return;
    }

    if (layer.type === "wms") {
        if (layerWMSOverlays[layerName]) {
            layerWMSOverlays[layerName].addTo(mapInstance);
        } else {
            const wmsLayer = L.tileLayer.wms(layer.url, {
                layers: layer.layers || "0",
                format: layer.format || "image/png",
                transparent: layer.transparent !== false,
                opacity: 0.7,
                attribution: "",
            });
            wmsLayer.addTo(mapInstance);
            layerWMSOverlays[layerName] = wmsLayer;
            console.log("WMS 图层已加载:", layerName, layer.url);
        }
    } else {
        if (!layer.extent || layer.extent.length === 0) {
            console.warn("图层 extent 为空，跳过:", layerName);
            return;
        }
        if (layerImageOverlays[layerName]) {
            layerImageOverlays[layerName].addTo(mapInstance);
        } else {
            const imageUrl = `images/kriging/${layerName}.png`;
            const [minLon, minLat, maxLon, maxLat] = layer.extent;
            const imageOverlay = L.imageOverlay(
                imageUrl,
                [[minLat, minLon], [maxLat, maxLon]],
                { opacity: 0.7, interactive: false }
            );
            imageOverlay.on("error", function () {
                console.error("图层图片加载失败:", imageUrl);
            });
            imageOverlay.addTo(mapInstance);
            layerImageOverlays[layerName] = imageOverlay;
        }
    }

    currentActiveLayer = layerName;

    // 更新图例
    if (layer.legendType === "solid" && layer.legendColor) {
        updateMapLegendSolid(layer.legendTitle || "图例", layer.legendColor, layer.legendMin, layer.legendMax);
    } else if (layer.legendType === "gradient" && layer.legendColors && layer.legendColors.length > 0) {
        updateMapLegendGradient(layer.legendTitle || "图例", layer.legendColors, layer.legendMin, layer.legendMax);
    } else {
        if (mapLegendControl) {
            mapInstance.removeControl(mapLegendControl);
            mapLegendControl = null;
        }
    }

    printMapBounds();
    console.log("显示图层:", layerName);

    // 触发事件通知父组件
    emit('layer-change', layerName);
}

// ==================== 地图加载函数 ====================

// 加载世界国界
function loadWorldBoundaries(adjustView = true) {
    if (!mapInstance) return;

    fetch("data/world.json")
        .then((response) => response.json())
        .then((geojson) => {
            if (worldLayer) mapInstance.removeLayer(worldLayer);
            if (chinaLayer) mapInstance.removeLayer(chinaLayer);
            if (guangxiLayer) mapInstance.removeLayer(guangxiLayer);

            worldLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    const name = feature.properties.NAME || feature.properties.name || "";
                    const nameLower = name.toLowerCase();
                    const isChina = nameLower.includes("china") || nameLower.includes("中国");
                    const isFrance = nameLower.includes("france") || nameLower.includes("法国");
                    const isBrazil = nameLower.includes("brazil") || nameLower.includes("巴西");

                    if (isChina || isFrance || isBrazil) {
                        return { color: "#4fc3f7", weight: 3, fillColor: "#4fc3f7", fillOpacity: 0.3, opacity: 1 };
                    }
                    return { color: "#94a3b8", weight: 1, fillColor: "transparent", fillOpacity: 0, opacity: 0.6 };
                },
                onEachFeature: function (feature, layer) {
                    const name = feature.properties.NAME || feature.properties.name || "";
                    const nameLower = name.toLowerCase();
                    const isChina = nameLower.includes("china") || nameLower.includes("中国");

                    if (isChina) {
                        layer.on("click", function () { loadChinaBoundary(); });
                    }
                },
            });

            worldLayer.addTo(mapInstance);
            currentViewLevel = "world";

            if (adjustView) {
                mapInstance.setView([20, 0], 2);
            }
        })
        .catch((error) => {
            console.error("加载世界国界数据失败:", error);
        });
}

// 加载中国边界
function loadChinaBoundary(adjustView = true, loadGuangxi = true) {
    if (!mapInstance) return;

    fetch("data/china.geojson")
        .then((response) => response.json())
        .then((geojson) => {
            if (worldLayer) mapInstance.removeLayer(worldLayer);
            if (chinaLayer) mapInstance.removeLayer(chinaLayer);

            chinaBoundary = geojson;
            chinaLayer = L.geoJSON(geojson, {
                style: { color: "#4fc3f7", weight: 2, fillColor: "transparent", fillOpacity: 0 },
            });
            chinaLayer.addTo(mapInstance);

            if (loadGuangxi) {
                loadGuangxiBoundary(true, false);
            }

            if (adjustView) {
                const bounds = getChinaBounds(geojson);
                mapInstance.fitBounds(
                    [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
                    { padding: [-50, -50] }
                );
                setTimeout(() => {
                    const center = mapInstance.getCenter();
                    mapInstance.setView(center, 3.5);
                }, 500);
            }

            currentViewLevel = "china";
            emit('view-level-change', 'china');
        })
        .catch((error) => {
            console.error("加载中国边界数据失败:", error);
        });
}

// 加载广西边界
function loadGuangxiBoundary(highlightOnly = false, adjustView = true) {
    if (!mapInstance) return;

    fetch("data/guangxi.geojson")
        .then((response) => response.json())
        .then((geojson) => {
            if (guangxiLayer) mapInstance.removeLayer(guangxiLayer);

            guangxiLayer = L.geoJSON(geojson, {
                style: function () {
                    return { color: "#545454", weight: 1.5, fillColor: "#4fc3f7", fillOpacity: 0.0, opacity: 1 };
                },
                onEachFeature: function (feature, layer) {
                    const cityName = feature.properties ? feature.properties.name : "";

                    function getCityInfoPopup(cityName) {
                        const cityNameClean = cityName.replace(/市$/, "");
                        const cityData = (props.cityDataMap && props.cityDataMap[cityNameClean]) || {};
                        const plantingArea = cityData.种植面积 || "-";
                        const yearOnYear = generateRandomPercentage();
                        const totalProduction = cityData.总产量 || "-";
                        const plantingAreaDisplay = plantingArea !== "-" ? `${plantingArea} 万亩` : "-";
                        const totalProductionDisplay = totalProduction !== "-" ? `${totalProduction} 万吨` : "-";

                        return `
              <div style="font-family: 'Microsoft YaHei'; min-width: 200px; padding: 8px;">
                <div style="font-size: 16px; font-weight: bold; color: #1e293b; margin-bottom: 12px; border-bottom: 2px solid #4fc3f7; padding-bottom: 6px;">${cityName}</div>
                <div style="font-size: 14px; color: #334155; line-height: 1.8;">
                  <div style="margin-bottom: 8px;">
                    <span style="color: #64748b; font-weight: 500;">种植面积：</span>
                    <span style="color: #1e293b; font-weight: 600;">${plantingAreaDisplay}</span>
                  </div>
                  <div style="margin-bottom: 8px;">
                    <span style="color: #64748b; font-weight: 500;">同比：</span>
                    <span style="color: #1e293b; font-weight: 600;">${yearOnYear}</span>
                  </div>
                  <div>
                    <span style="color: #64748b; font-weight: 500;">总产量：</span>
                    <span style="color: #1e293b; font-weight: 600;">${totalProductionDisplay}</span>
                  </div>
                </div>
              </div>
            `;
                    }

                    layer.on("click", function () {
                        focusOnGuangxi(geojson);
                        emit('city-click', cityName);
                    });

                    layer.on("mousemove", function (e) {
                        const zoom = mapInstance ? mapInstance.getZoom() : 0;
                        if (zoom >= 6 && zoom <= 8 && cityName) {
                            if (!layer._infoPopup) {
                                const popupContent = getCityInfoPopup(cityName);
                                layer._infoPopup = L.popup({
                                    className: "city-info-popup",
                                    maxWidth: 300,
                                    closeButton: true,
                                    autoPan: false,
                                    offset: [0, -10]
                                })
                                    .setContent(popupContent)
                                    .setLatLng(e.latlng)
                                    .openOn(mapInstance);
                            } else {
                                layer._infoPopup.setLatLng(e.latlng);
                            }
                            layer.setStyle({ color: "#545454", weight: 3, fillColor: "#4fc3f7", fillOpacity: 0.2 });
                        }
                    });

                    layer.on("mouseout", function () {
                        if (layer._infoPopup) {
                            mapInstance.closePopup(layer._infoPopup);
                            layer._infoPopup = null;
                        }
                        layer.setStyle({ color: "#545454", weight: 1.5, fillColor: "#4fc3f7", fillOpacity: 0.0 });
                    });
                },
            });

            guangxiLayer.addTo(mapInstance);
            setGuangxiLayerInteractive(currentActiveLayer === "plant" || currentActiveLayer === "production");

            // 创建城市名称标注
            function createCityLabels(geojson) {
                cityLabels = [];
                if (geojson.features && geojson.features.length > 0) {
                    geojson.features.forEach((feature) => {
                        if (feature.properties && feature.properties.name) {
                            const cityName = feature.properties.name;
                            const center = feature.properties.centroid || feature.properties.center;
                            if (!center || center.length < 2) return;

                            const label = L.marker([center[1], center[0]], {
                                icon: L.divIcon({
                                    className: "city-label",
                                    html: `<div style="color: #ffffff; font-size: 14px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); white-space: nowrap; pointer-events: none;">${cityName}</div>`,
                                    iconSize: [100, 20],
                                    iconAnchor: [50, 10],
                                }),
                                interactive: false,
                                zIndexOffset: 1000,
                            });
                            cityLabels.push(label);
                        }
                    });
                }
                updateCityLabelsVisibility();
            }

            if (!highlightOnly && adjustView) {
                focusOnGuangxi(geojson);
            } else {
                currentViewLevel = "guangxi";
                chinaBoundary = geojson;
                createCityLabels(geojson);
            }

            emit('view-level-change', 'guangxi');
        })
        .catch((error) => {
            console.error("加载广西边界数据失败:", error);
        });
}

// 加载广西县级行政区划数据
function loadGuangxiDistricts() {
    if (!mapInstance) return;

    fetch("data/gx_dist.geojson")
        .then((response) => response.json())
        .then((geojson) => {
            if (guangxiDistrictLayer) mapInstance.removeLayer(guangxiDistrictLayer);

            const districtValueMap = {};
            if (geojson.features && geojson.features.length > 0) {
                geojson.features.forEach((feature) => {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    if (districtName) {
                        const value = props.districtData[districtName] !== undefined
                            ? props.districtData[districtName]
                            : 0;
                        districtValueMap[districtName] = value;
                    }
                });
            }

            guangxiDistrictLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                    const fillColor = getDistrictColor(value);
                    return { color: "#e3e3e3", weight: 1, fillColor: fillColor, fillOpacity: 0.8, opacity: 1 };
                },
                onEachFeature: function (feature, layer) {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    let value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                    const fillColor = getDistrictColor(value);
                    layer._originalFillColor = fillColor;
                    layer.bindTooltip(`${districtName}: ${value}`, { permanent: false, direction: "top" });

                    layer.on("mouseover", function () {
                        layer.setStyle({ color: "#e3e3e3", weight: 2, fillColor: fillColor, fillOpacity: 1.0 });
                    });
                    layer.on("mouseout", function () {
                        layer.setStyle({ color: "#e3e3e3", weight: 1, fillColor: fillColor, fillOpacity: 0.8 });
                    });
                },
            });

            guangxiDistrictLayer.addTo(mapInstance);
            mapInstance.invalidateSize();
            if (guangxiDistrictLayer) guangxiDistrictLayer.bringToFront();
            if (guangxiLayer) guangxiLayer.bringToFront();

            createDistrictLegend();
        })
        .catch((error) => {
            console.error("加载广西县级行政区划数据失败:", error);
        });
}

// 加载广西县级亩产分布数据
function loadGuangxiDistrictsYield() {
    if (!mapInstance) return;

    fetch("data/gx_dist.geojson")
        .then((response) => response.json())
        .then((geojson) => {
            if (guangxiDistrictYieldLayer) mapInstance.removeLayer(guangxiDistrictYieldLayer);

            const districtValueMap = {};
            if (geojson.features && geojson.features.length > 0) {
                geojson.features.forEach((feature) => {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    if (districtName) {
                        const value = props.yieldData[districtName] !== undefined
                            ? props.yieldData[districtName]
                            : (Math.random() * 4.0).toFixed(2);
                        districtValueMap[districtName] = value;
                    }
                });
            }

            guangxiDistrictYieldLayer = L.geoJSON(geojson, {
                style: function (feature) {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                    const fillColor = getDistrictColor2(value);
                    return { color: "#e3e3e3", weight: 1, fillColor: fillColor, fillOpacity: 0.8, opacity: 1 };
                },
                onEachFeature: function (feature, layer) {
                    const districtName = feature.properties?.name || feature.properties?.NAME || "";
                    const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                    const fillColor = getDistrictColor2(value);
                    layer._originalFillColor = fillColor;
                    layer.bindTooltip(`${districtName}: ${value}`, { permanent: false, direction: "top" });

                    layer.on("mouseover", function () {
                        layer.setStyle({ color: "#e3e3e3", weight: 2, fillColor: fillColor, fillOpacity: 1.0 });
                    });
                    layer.on("mouseout", function () {
                        layer.setStyle({ color: "#e3e3e3", weight: 1, fillColor: fillColor, fillOpacity: 0.8 });
                    });
                },
            });

            guangxiDistrictYieldLayer.addTo(mapInstance);
            mapInstance.invalidateSize();
            if (guangxiDistrictYieldLayer) guangxiDistrictYieldLayer.bringToFront();
            if (guangxiLayer) guangxiLayer.bringToFront();

            createDistrictYieldLegend();
        })
        .catch((error) => {
            console.error("加载广西县级亩产分布数据失败:", error);
        });
}

// 聚焦到广西
function focusOnGuangxi(geojson) {
    if (!mapInstance || !geojson) return;

    chinaBoundary = geojson;
    if (chinaLayer) mapInstance.removeLayer(chinaLayer);

    const bounds = getChinaBounds(geojson);
    mapInstance.fitBounds(
        [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
        { padding: [20, 20] }
    );

    currentViewLevel = "guangxi";
    cityLabels = [];

    if (geojson.features && geojson.features.length > 0) {
        geojson.features.forEach((feature) => {
            if (feature.properties && feature.properties.name) {
                const cityName = feature.properties.name;
                const center = feature.properties.centroid || feature.properties.center;
                if (!center || center.length < 2) return;

                const label = L.marker([center[1], center[0]], {
                    icon: L.divIcon({
                        className: "city-label",
                        html: `<div style="color: #ffffff; font-size: 14px; font-weight: bold; text-shadow: 2px 2px 4px rgba(0,0,0,0.8); white-space: nowrap; pointer-events: none;">${cityName}</div>`,
                        iconSize: [100, 20],
                        iconAnchor: [50, 10],
                    }),
                    interactive: false,
                    zIndexOffset: 1000,
                });
                cityLabels.push(label);
            }
        });
    }

    updateCityLabelsVisibility();
    emit('view-level-change', 'guangxi');
}

// ==================== 视图控制函数 ====================

// 根据缩放级别更新城市名称标注的显示/隐藏
function updateCityLabelsVisibility() {
    if (!mapInstance) return;
    const currentZoom = mapInstance.getZoom();
    const shouldShow = currentZoom >= 6;

    cityLabels.forEach((label) => {
        if (shouldShow) {
            if (!mapInstance.hasLayer(label)) label.addTo(mapInstance);
        } else {
            if (mapInstance.hasLayer(label)) mapInstance.removeLayer(label);
        }
    });
}

// 根据缩放级别更新地级市图层填充色透明度
function updateCityLayerFillOpacity() {
    if (!mapInstance || !guangxiLayer) return;
    const currentZoom = mapInstance.getZoom();
    const fillOpacity = currentZoom > 8 ? 0 : 0.0;

    guangxiLayer.eachLayer(function (layer) {
        const currentStyle = layer.options || {};
        const fillColor = layer._originalFillColor || currentStyle.fillColor || "#4fc3f7";
        layer.setStyle({
            color: "#545454",
            weight: 1.5,
            fillColor: fillColor,
            fillOpacity: fillOpacity,
            opacity: 1,
        });
    });
}

// 重置行政区划图层样式
function resetAdministrativeLayerStyles() {
    if (!mapInstance) return;
    const currentZoom = mapInstance.getZoom();
    if (currentZoom > 8 && guangxiLayer) {
        guangxiLayer.eachLayer(function (layer) {
            layer.setStyle({
                color: "#4fc3f7",
                weight: 2,
                fillColor: "#4fc3f7",
                fillOpacity: 0.0,
                opacity: 1,
            });
        });
    }
}

// 打印当前地图范围
function printMapBounds() {
    if (!mapInstance) {
        console.warn("地图未初始化");
        return;
    }
    const bounds = mapInstance.getBounds();
    const sw = bounds.getSouthWest();
    const ne = bounds.getNorthEast();
    const boundsArray = [sw.lng, sw.lat, ne.lng, ne.lat];
    console.log("当前地图范围:", boundsArray);
    console.log("中心点:", [mapInstance.getCenter().lng, mapInstance.getCenter().lat]);
    console.log("缩放级别:", mapInstance.getZoom());
}

// ==================== 事件定义 ====================
const emit = defineEmits(['layer-change', 'view-level-change', 'city-click', 'map-ready']);

// ==================== 地图初始化 ====================

function initLeafletMap() {
    if (!mapContainer.value) return;

    mapInstance = L.map(mapContainer.value, {
        center: initialMapView.center,
        zoom: initialMapView.zoom,
        zoomControl: true,
        attributionControl: false,
        worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]],
    });

    const tk = "9ca2e0ffb0e586fd627aa716a9149423";
    L.tileLayer(
        `http://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`,
        {
            subdomains: ["0", "1", "2", "3", "4", "5", "6", "7"],
            attribution: "© 国家基础地理信息中心",
            maxZoom: 18,
        },
    ).addTo(mapInstance);

    // 自定义回退按钮控件
    const ResetViewControl = L.Control.extend({
        options: { position: "topleft" },
        onAdd: function (map) {
            const container = L.DomUtil.create("div", "leaflet-bar leaflet-control reset-view-control");
            const link = L.DomUtil.create("a", "", container);
            link.href = "#";
            link.title = "回到初始视图";
            link.innerHTML = "↺";
            L.DomEvent.disableClickPropagation(container);
            L.DomEvent.on(link, "click", function (e) {
                L.DomEvent.preventDefault(e);
                map.setView(initialMapView.center, initialMapView.zoom);
            });
            return container;
        },
    });
    mapInstance.addControl(new ResetViewControl());

    // 监听事件
    mapInstance.on("zoomend", function () {
        updateCityLabelsVisibility();
        resetAdministrativeLayerStyles();
        updateCityLayerFillOpacity();
        printMapBounds();
    });

    mapInstance.on("zoom", function () {
        updateCityLayerFillOpacity();
    });

    mapInstance.on("moveend", function () {
        printMapBounds();
    });

    // 加载广西边界
    loadGuangxiBoundary(true, false);

    setTimeout(() => {
        showLayer('district');
        // 同步更新单选按钮状态
        const districtRadio = document.querySelector('input[name="layer-select"][value="district"]');
        if (districtRadio) {
            districtRadio.checked = true;
        }
    }, 300);

    // 创建降雨图例
    if (props.showRainLegend) {
        createRainLegend();
    }

    // 通知父组件地图已就绪
    setTimeout(() => {
        emit('map-ready', {
            mapInstance,
            loadChinaBoundary,
            loadGuangxiBoundary,
            showLayer,
            focusOnGuangxi
        });
    }, 500);
}

// 窗口大小变化处理
const handleResize = () => {
    if (mapInstance) {
        mapInstance.invalidateSize();
    }
};

// 监听数据变化
watch(() => props.districtData, () => {
    if (currentActiveLayer === 'district') {
        loadGuangxiDistricts();
    }
}, { deep: true });

watch(() => props.yieldData, () => {
    if (currentActiveLayer === 'yield') {
        loadGuangxiDistrictsYield();
    }
}, { deep: true });

onMounted(() => {
    initLeafletMap();
    window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
    if (mapInstance) {
        mapInstance.remove();
        mapInstance = null;
    }
    window.removeEventListener('resize', handleResize);

    // 清理图例
    if (mapLegendControl && mapInstance) {
        mapInstance.removeControl(mapLegendControl);
    }
    if (cityLegendControl && mapInstance) {
        mapInstance.removeControl(cityLegendControl);
    }
});

// 向父组件暴露地图实例方法
defineExpose({
    getMapInstance: () => mapInstance,
    loadChinaBoundary,
    loadGuangxiBoundary,
    showLayer,
    focusOnGuangxi,
    setLayer: (layerName) => {
        currentLayer.value = layerName;
        showLayer(layerName);
    }
});
</script>

<style scoped>
.map-wrapper {
    position: relative;
    width: 100%;
    height: 100%;
}

.map-container {
    width: 100%;
    height: 100%;
    min-height: 700px;
    z-index: 1;
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.5);
}

/* 图层控制 */
.layer-control {
    position: absolute;
    top: 12px;
    right: 524px;
    background: rgba(255, 255, 255, 0.95);
    padding: 12px;
    border-radius: 6px;
    border: 1px solid rgba(203, 213, 225, 0.5);
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
    z-index: 1000;
    min-width: 150px;
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
    gap: 6px;
}

.layer-option {
    display: flex;
    align-items: center;
    cursor: pointer;
    color: #334155;
    font-size: 12px;
}

.layer-option input {
    margin-right: 8px;
}

/* 降雨图例 */
.rain-legend {
    position: absolute;
    bottom: 320px;
    right: 520px;
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

/* 城市标注样式 */
:deep(.city-label) {
    background: transparent;
    border: none;
}

/* 信息框样式 */
:deep(.city-info-popup .leaflet-popup-content-wrapper) {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}

/* 图例样式 */
:deep(.map-legend),
:deep(.legend) {
    background: rgba(255, 255, 255, 0.95);
    padding: 10px;
    border-radius: 6px;
    border: 1px solid rgba(203, 213, 225, 0.5);
    color: #334155;
    font-size: 12px;
    min-width: 120px;
}

/* 回退按钮样式 */
:deep(.reset-view-control) {
    background: #fff;
    border: 1px solid #ccc;
}

:deep(.reset-view-control a) {
    color: #333;
    font-size: 18px;
    line-height: 26px;
    text-align: center;
    text-decoration: none;
}

/* :deep(.map-legend),
:deep(.legend) {
    background: rgba(255, 255, 255, 0.95);
    padding: 10px;
    border-radius: 6px;
    border: 1px solid rgba(203, 213, 225, 0.5);
    color: #334155;
    font-size: 12px;
    min-width: 120px;
} */

:deep(.custom-legend-position) {
    position: absolute !important;
    bottom: 300px !important;
    /* 距离底部 80px */
    right: 524px !important;
    /* 距离右侧 120px */


    z-index: 1000 !important;
}
</style>