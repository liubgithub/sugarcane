<template>
    <!-- 图层管理器无模板，纯逻辑组件 -->
</template>

<script setup>
import { ref, watch, onBeforeUnmount } from 'vue';
import L from 'leaflet';

const props = defineProps({
    mapInstance: {
        type: Object,
        required: true
    },
    currentLayer: {
        type: String,
        default: 'district'
    },
    districtData: {
        type: Object,
        default: () => ({})
    },
    yieldData: {
        type: Object,
        default: () => ({})
    },
    cityDataMap: {
        type: Object,
        default: () => ({})
    },
    // 是否禁用地级市图层交互
    disableCityInteraction: {
        type: Boolean,
        default: false
    }
});

const emit = defineEmits([
    'layer-change',
    'city-click',
    'view-level-change',
    'districts-loaded',
    'yield-loaded',
    'boundary-loaded'
]);

// ==================== 图层配置 ====================
const layerConfig = [
    {
        name: "plant",
        type: "wms",
        url: "http://39.170.97.139:6080/arcgis/services/oge/guangxi2/MapServer/WmsServer",
        layers: "0",
        format: "image/png",
        transparent: true,
        extent: [102.82104492187501, 20.447602397594167, 113.69750976562501, 26.82407078047018],
    },
    {
        name: "production",
        type: "wms",
        url: "http://39.170.97.139:6080/arcgis/services/oge/guangxi2/MapServer/WmsServer",
        layers: "1",
        format: "image/png",
        transparent: true,
        extent: [102.82104492187501, 20.447602397594167, 113.69750976562501, 26.82407078047018],
    },
];

// ==================== 颜色分级配置 ====================
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

// ==================== 状态变量 ====================
const layerWMSOverlays = ref({});
const geoJSONLayers = ref({
    world: null,
    china: null,
    guangxi: null,
    guangxiCity: null,
    guangxiDistrict: null,
    guangxiDistrictYield: null
});
const cityLabels = ref([]);
const currentViewLevel = ref('world');
const chinaBoundary = ref(null);

// ==================== 工具函数 ====================
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

function generateRandomPercentage() {
    const num = (Math.random() * 20 - 10).toFixed(2);
    return num > 0 ? `+${num}%` : `${num}%`;
}

// ==================== 图层控制 ====================
function setGuangxiLayerInteractive(enabled) {
    if (!geoJSONLayers.value.guangxi) return;
    geoJSONLayers.value.guangxi.eachLayer((layer) => {
        if (layer._path) {
            layer._path.style.pointerEvents = enabled ? "auto" : "none";
        }
    });
}

function clearAllLayers() {
    const map = props.mapInstance;
    if (!map) return;

    // 清除WMS图层
    Object.values(layerWMSOverlays.value).forEach(layer => {
        if (layer && map.hasLayer(layer)) {
            map.removeLayer(layer);
        }
    });

    // 清除GeoJSON图层（保留边界底图）
    ['guangxiCity', 'guangxiDistrict', 'guangxiDistrictYield'].forEach(key => {
        if (geoJSONLayers.value[key] && map.hasLayer(geoJSONLayers.value[key])) {
            map.removeLayer(geoJSONLayers.value[key]);
        }
    });
}

// ==================== 加载函数 ====================
async function loadWorldBoundaries(adjustView = true) {
    const map = props.mapInstance;
    if (!map) return;

    try {
        const response = await fetch("data/world.json");
        const geojson = await response.json();

        // 清除旧图层
        if (geoJSONLayers.value.world) map.removeLayer(geoJSONLayers.value.world);
        if (geoJSONLayers.value.china) map.removeLayer(geoJSONLayers.value.china);
        if (geoJSONLayers.value.guangxi) map.removeLayer(geoJSONLayers.value.guangxi);

        geoJSONLayers.value.world = L.geoJSON(geojson, {
            style: function (feature) {
                const name = feature.properties.NAME || feature.properties.name || "";
                const nameLower = name.toLowerCase();
                const isChina = nameLower.includes("china") || nameLower.includes("中国");
                const isFrance = nameLower.includes("france") || nameLower.includes("法国");
                const isBrazil = nameLower.includes("brazil") || nameLower.includes("巴西");

                if (isChina || isFrance || isBrazil) {
                    return {
                        color: "#4fc3f7",
                        weight: 3,
                        fillColor: "#4fc3f7",
                        fillOpacity: 0.3,
                        opacity: 1
                    };
                }
                return {
                    color: "#94a3b8",
                    weight: 1,
                    fillColor: "transparent",
                    fillOpacity: 0,
                    opacity: 0.6
                };
            },
            onEachFeature: function (feature, layer) {
                const name = feature.properties.NAME || feature.properties.name || "";
                const nameLower = name.toLowerCase();
                const isChina = nameLower.includes("china") || nameLower.includes("中国");

                if (isChina) {
                    layer.on("click", () => loadChinaBoundary());
                }
            },
        });

        geoJSONLayers.value.world.addTo(map);
        currentViewLevel.value = "world";

        if (adjustView) {
            map.setView([20, 0], 2);
        }

        emit('view-level-change', 'world');
        emit('boundary-loaded', { type: 'world', layer: geoJSONLayers.value.world });
    } catch (error) {
        console.error("加载世界国界数据失败:", error);
    }
}

async function loadChinaBoundary(adjustView = true, loadGuangxi = true) {
    const map = props.mapInstance;
    if (!map) return;

    try {
        const response = await fetch("data/china.geojson");
        const geojson = await response.json();

        if (geoJSONLayers.value.world) map.removeLayer(geoJSONLayers.value.world);
        if (geoJSONLayers.value.china) map.removeLayer(geoJSONLayers.value.china);

        chinaBoundary.value = geojson;
        geoJSONLayers.value.china = L.geoJSON(geojson, {
            style: {
                color: "#4fc3f7",
                weight: 2,
                fillColor: "transparent",
                fillOpacity: 0
            },
        });
        geoJSONLayers.value.china.addTo(map);

        if (loadGuangxi) {
            await loadGuangxiBoundary(true, false);
        }

        if (adjustView) {
            const bounds = getChinaBounds(geojson);
            map.fitBounds(
                [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
                { padding: [-50, -50] }
            );
            setTimeout(() => {
                const center = map.getCenter();
                map.setView(center, 3.5);
            }, 500);
        }

        currentViewLevel.value = "china";
        emit('view-level-change', 'china');
        emit('boundary-loaded', { type: 'china', layer: geoJSONLayers.value.china });
    } catch (error) {
        console.error("加载中国边界数据失败:", error);
    }
}

async function loadGuangxiBoundary(highlightOnly = false, adjustView = true) {
    const map = props.mapInstance;
    if (!map) return;

    try {
        const response = await fetch("data/guangxi.geojson");
        const geojson = await response.json();

        if (geoJSONLayers.value.guangxi) map.removeLayer(geoJSONLayers.value.guangxi);

        geoJSONLayers.value.guangxi = L.geoJSON(geojson, {
            style: function () {
                return {
                    color: "#545454",
                    weight: 1.5,
                    fillColor: "#4fc3f7",
                    fillOpacity: 0.0,
                    opacity: 1
                };
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
                    const zoom = map.getZoom();
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
                                .openOn(map);
                        } else {
                            layer._infoPopup.setLatLng(e.latlng);
                        }
                        layer.setStyle({
                            color: "#545454",
                            weight: 3,
                            fillColor: "#4fc3f7",
                            fillOpacity: 0.2
                        });
                    }
                });

                layer.on("mouseout", function () {
                    if (layer._infoPopup) {
                        map.closePopup(layer._infoPopup);
                        layer._infoPopup = null;
                    }
                    layer.setStyle({
                        color: "#545454",
                        weight: 1.5,
                        fillColor: "#4fc3f7",
                        fillOpacity: 0.0
                    });
                });
            },
        });

        geoJSONLayers.value.guangxi.addTo(map);
        setGuangxiLayerInteractive(!props.disableCityInteraction);

        // 创建城市名称标注
        createCityLabels(geojson);

        if (!highlightOnly && adjustView) {
            focusOnGuangxi(geojson);
        } else {
            currentViewLevel.value = "guangxi";
            chinaBoundary.value = geojson;
        }

        emit('view-level-change', 'guangxi');
        emit('boundary-loaded', { type: 'guangxi', layer: geoJSONLayers.value.guangxi, geojson });
    } catch (error) {
        console.error("加载广西边界数据失败:", error);
    }
}

function createCityLabels(geojson) {
    const map = props.mapInstance;
    if (!map) return;

    // 清除旧标注
    cityLabels.value.forEach(label => {
        if (map.hasLayer(label)) map.removeLayer(label);
    });
    cityLabels.value = [];

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
                cityLabels.value.push(label);
            }
        });
    }
    updateCityLabelsVisibility();
}

function focusOnGuangxi(geojson) {
    const map = props.mapInstance;
    if (!map || !geojson) return;

    chinaBoundary.value = geojson;
    if (geoJSONLayers.value.china) map.removeLayer(geoJSONLayers.value.china);

    const bounds = getChinaBounds(geojson);
    map.fitBounds(
        [[bounds.minLat, bounds.minLon], [bounds.maxLat, bounds.maxLon]],
        { padding: [20, 20] }
    );

    currentViewLevel.value = "guangxi";
    createCityLabels(geojson);

    emit('view-level-change', 'guangxi');
}

async function loadGuangxiDistricts() {
    const map = props.mapInstance;
    if (!map) return;

    try {
        const response = await fetch("data/gx_dist.geojson");
        const geojson = await response.json();

        if (geoJSONLayers.value.guangxiDistrict) {
            map.removeLayer(geoJSONLayers.value.guangxiDistrict);
        }

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

        geoJSONLayers.value.guangxiDistrict = L.geoJSON(geojson, {
            style: function (feature) {
                const districtName = feature.properties?.name || feature.properties?.NAME || "";
                const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                const fillColor = getDistrictColor(value);
                return {
                    color: "#e3e3e3",
                    weight: 1,
                    fillColor: fillColor,
                    fillOpacity: 0.8,
                    opacity: 1
                };
            },
            onEachFeature: function (feature, layer) {
                const districtName = feature.properties?.name || feature.properties?.NAME || "";
                let value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                const fillColor = getDistrictColor(value);
                layer._originalFillColor = fillColor;
                layer.bindTooltip(`${districtName}: ${value}`, {
                    permanent: false,
                    direction: "top"
                });

                layer.on("mouseover", function () {
                    layer.setStyle({
                        color: "#e3e3e3",
                        weight: 2,
                        fillColor: fillColor,
                        fillOpacity: 1.0
                    });
                });
                layer.on("mouseout", function () {
                    layer.setStyle({
                        color: "#e3e3e3",
                        weight: 1,
                        fillColor: fillColor,
                        fillOpacity: 0.8
                    });
                });
            },
        });

        geoJSONLayers.value.guangxiDistrict.addTo(map);
        map.invalidateSize();

        // 调整图层顺序
        if (geoJSONLayers.value.guangxiDistrict) {
            geoJSONLayers.value.guangxiDistrict.bringToFront();
        }
        if (geoJSONLayers.value.guangxi) {
            geoJSONLayers.value.guangxi.bringToFront();
        }

        emit('districts-loaded', {
            layer: geoJSONLayers.value.guangxiDistrict,
            data: districtValueMap
        });
    } catch (error) {
        console.error("加载广西县级行政区划数据失败:", error);
    }
}

async function loadGuangxiDistrictsYield() {
    const map = props.mapInstance;
    if (!map) return;

    try {
        const response = await fetch("data/gx_dist.geojson");
        const geojson = await response.json();

        if (geoJSONLayers.value.guangxiDistrictYield) {
            map.removeLayer(geoJSONLayers.value.guangxiDistrictYield);
        }

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

        geoJSONLayers.value.guangxiDistrictYield = L.geoJSON(geojson, {
            style: function (feature) {
                const districtName = feature.properties?.name || feature.properties?.NAME || "";
                const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                const fillColor = getDistrictColor2(value);
                return {
                    color: "#e3e3e3",
                    weight: 1,
                    fillColor: fillColor,
                    fillOpacity: 0.8,
                    opacity: 1
                };
            },
            onEachFeature: function (feature, layer) {
                const districtName = feature.properties?.name || feature.properties?.NAME || "";
                const value = districtValueMap[districtName] !== undefined ? districtValueMap[districtName] : 0;
                const fillColor = getDistrictColor2(value);
                layer._originalFillColor = fillColor;
                layer.bindTooltip(`${districtName}: ${value}`, {
                    permanent: false,
                    direction: "top"
                });

                layer.on("mouseover", function () {
                    layer.setStyle({
                        color: "#e3e3e3",
                        weight: 2,
                        fillColor: fillColor,
                        fillOpacity: 1.0
                    });
                });
                layer.on("mouseout", function () {
                    layer.setStyle({
                        color: "#e3e3e3",
                        weight: 1,
                        fillColor: fillColor,
                        fillOpacity: 0.8
                    });
                });
            },
        });

        geoJSONLayers.value.guangxiDistrictYield.addTo(map);
        map.invalidateSize();

        if (geoJSONLayers.value.guangxiDistrictYield) {
            geoJSONLayers.value.guangxiDistrictYield.bringToFront();
        }
        if (geoJSONLayers.value.guangxi) {
            geoJSONLayers.value.guangxi.bringToFront();
        }

        emit('yield-loaded', {
            layer: geoJSONLayers.value.guangxiDistrictYield,
            data: districtValueMap
        });
    } catch (error) {
        console.error("加载广西县级亩产分布数据失败:", error);
    }
}

// ==================== WMS图层 ====================
function showWMSLayer(layerName) {
    const map = props.mapInstance;
    if (!map) return;

    const config = layerConfig.find(l => l.name === layerName);
    if (!config || config.type !== "wms") return;

    if (layerWMSOverlays.value[layerName]) {
        layerWMSOverlays.value[layerName].addTo(map);
    } else {
        const wmsLayer = L.tileLayer.wms(config.url, {
            layers: config.layers || "0",
            format: config.format || "image/png",
            transparent: config.transparent !== false,
            opacity: 0.7,
            attribution: "",
        });
        wmsLayer.addTo(map);
        layerWMSOverlays.value[layerName] = wmsLayer;
    }
}

// ==================== 主控制函数 ====================
function showLayer(layerName) {
    const map = props.mapInstance;
    if (!map) return;

    clearAllLayers();

    // 根据图层类型处理
    switch (layerName) {
        case 'plant':
        case 'production':
            // 显示WMS图层，启用地级市交互
            showWMSLayer(layerName);
            setGuangxiLayerInteractive(true);
            break;

        case 'district':
            // 显示种植面积分布，禁用地级市交互
            setGuangxiLayerInteractive(false);
            loadGuangxiDistricts();
            break;

        case 'yield':
            // 显示亩产分布，禁用地级市交互
            setGuangxiLayerInteractive(false);
            loadGuangxiDistrictsYield();
            break;

        default:
            console.warn("未知图层类型:", layerName);
            return;
    }

    emit('layer-change', layerName);
}

// 更新城市标注可见性
function updateCityLabelsVisibility() {
    const map = props.mapInstance;
    if (!map) return;

    const currentZoom = map.getZoom();
    const shouldShow = currentZoom >= 6;

    cityLabels.value.forEach((label) => {
        if (shouldShow) {
            if (!map.hasLayer(label)) label.addTo(map);
        } else {
            if (map.hasLayer(label)) map.removeLayer(label);
        }
    });
}

// 更新地级市填充透明度
function updateCityLayerFillOpacity() {
    const map = props.mapInstance;
    if (!map || !geoJSONLayers.value.guangxi) return;

    const currentZoom = map.getZoom();
    const fillOpacity = currentZoom > 8 ? 0 : 0.0;

    geoJSONLayers.value.guangxi.eachLayer(function (layer) {
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

// 重置行政区划样式
function resetAdministrativeLayerStyles() {
    const map = props.mapInstance;
    if (!map) return;

    const currentZoom = map.getZoom();
    if (currentZoom > 8 && geoJSONLayers.value.guangxi) {
        geoJSONLayers.value.guangxi.eachLayer(function (layer) {
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

// ==================== 监听 ====================
watch(() => props.currentLayer, (newVal) => {
    if (newVal) {
        showLayer(newVal);
    }
}, { immediate: false });

watch(() => props.districtData, () => {
    if (props.currentLayer === 'district') {
        loadGuangxiDistricts();
    }
}, { deep: true });

watch(() => props.yieldData, () => {
    if (props.currentLayer === 'yield') {
        loadGuangxiDistrictsYield();
    }
}, { deep: true });

watch(() => props.disableCityInteraction, (val) => {
    setGuangxiLayerInteractive(!val);
});

// ==================== 生命周期 ====================
onBeforeUnmount(() => {
    clearAllLayers();
    const map = props.mapInstance;
    if (map) {
        Object.values(geoJSONLayers.value).forEach(layer => {
            if (layer && map.hasLayer(layer)) {
                map.removeLayer(layer);
            }
        });
        cityLabels.value.forEach(label => {
            if (map.hasLayer(label)) map.removeLayer(label);
        });
    }
});

// 暴露方法
defineExpose({
    loadWorldBoundaries,
    loadChinaBoundary,
    loadGuangxiBoundary,
    loadGuangxiDistricts,
    loadGuangxiDistrictsYield,
    showLayer,
    focusOnGuangxi,
    updateCityLabelsVisibility,
    updateCityLayerFillOpacity,
    resetAdministrativeLayerStyles,
    clearAllLayers,
    getCurrentViewLevel: () => currentViewLevel.value,
    getLayers: () => geoJSONLayers.value
});
</script>

<style>
/* 城市标注样式 */
.city-label {
    background: transparent;
    border: none;
}

/* 信息框样式 */
.city-info-popup .leaflet-popup-content-wrapper {
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
}
</style>