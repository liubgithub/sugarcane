<template>
    <div ref="mapContainer" class="map-container"></div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, markRaw } from 'vue';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// 修复默认图标
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

const props = defineProps({
    center: {
        type: Array,
        default: () => [22.30904671920277, 109.01733398437501]
    },
    zoom: {
        type: Number,
        default: 7
    },
    minZoom: {
        type: Number,
        default: 2
    },
    maxZoom: {
        type: Number,
        default: 18
    }
});

const emit = defineEmits([
    'map-ready',
    'zoom-end',
    'move-end',
    'zoom-change',
    'view-reset'
]);

const mapContainer = ref(null);
const mapInstance = ref(null);

// 初始视图配置
const initialView = {
    center: props.center,
    zoom: props.zoom
};

// 获取地图实例（供父组件调用）
const getMapInstance = () => mapInstance.value;

// 设置视图
const setView = (center, zoom) => {
    if (mapInstance.value) {
        mapInstance.value.setView(center, zoom);
    }
};

// 适应边界
const fitBounds = (bounds, options = {}) => {
    if (mapInstance.value) {
        mapInstance.value.fitBounds(bounds, options);
    }
};

// 获取当前边界
const getBounds = () => {
    return mapInstance.value ? mapInstance.value.getBounds() : null;
};

// 获取当前缩放级别
const getZoom = () => {
    return mapInstance.value ? mapInstance.value.getZoom() : 0;
};

// 获取中心点
const getCenter = () => {
    return mapInstance.value ? mapInstance.value.getCenter() : null;
};

// 重置视图
const resetView = () => {
    setView(initialView.center, initialView.zoom);
    emit('view-reset', initialView);
};

// 添加图层
const addLayer = (layer) => {
    if (mapInstance.value && layer) {
        layer.addTo(mapInstance.value);
    }
};

// 移除图层
const removeLayer = (layer) => {
    if (mapInstance.value && layer) {
        mapInstance.value.removeLayer(layer);
    }
};

// 添加控件
const addControl = (control) => {
    if (mapInstance.value && control) {
        mapInstance.value.addControl(control);
    }
};

// 移除控件
const removeControl = (control) => {
    if (mapInstance.value && control) {
        mapInstance.value.removeControl(control);
    }
};

// 打开弹窗
const openPopup = (content, latlng, options = {}) => {
    if (mapInstance.value) {
        return L.popup(options)
            .setContent(content)
            .setLatLng(latlng)
            .openOn(mapInstance.value);
    }
    return null;
};

// 关闭弹窗
const closePopup = (popup) => {
    if (mapInstance.value && popup) {
        mapInstance.value.closePopup(popup);
    }
};

// 创建重置视图控件
const createResetViewControl = () => {
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
                resetView();
            });
            return container;
        }
    });
    return new ResetViewControl();
};

// 初始化地图
const initMap = () => {
    if (!mapContainer.value) return;

    // 创建地图实例
    mapInstance.value = markRaw(L.map(mapContainer.value, {
        center: props.center,
        zoom: props.zoom,
        zoomControl: true,
        attributionControl: false,
        worldCopyJump: false,
        maxBounds: [[-90, -180], [90, 180]],
        minZoom: props.minZoom,
        maxZoom: props.maxZoom
    }));

    // 添加天地图底图
    const tk = "9ca2e0ffb0e586fd627aa716a9149423";
    const baseLayer = L.tileLayer(
        `http://t{s}.tianditu.gov.cn/vec_w/wmts?SERVICE=WMTS&REQUEST=GetTile&VERSION=1.0.0&LAYER=vec&STYLE=default&TILEMATRIXSET=w&FORMAT=tiles&TILEMATRIX={z}&TILEROW={y}&TILECOL={x}&tk=${tk}`,
        {
            subdomains: ["0", "1", "2", "3", "4", "5", "6", "7"],
            attribution: "© 国家基础地理信息中心",
            maxZoom: props.maxZoom,
        }
    );
    baseLayer.addTo(mapInstance.value);

    // 添加重置视图控件
    mapInstance.value.addControl(createResetViewControl());

    // 绑定事件
    mapInstance.value.on("zoomend", () => {
        emit('zoom-end', {
            zoom: getZoom(),
            center: getCenter(),
            bounds: getBounds()
        });
    });

    mapInstance.value.on("zoom", () => {
        emit('zoom-change', getZoom());
    });

    mapInstance.value.on("moveend", () => {
        emit('move-end', {
            center: getCenter(),
            bounds: getBounds()
        });
    });

    // 通知父组件地图就绪
    emit('map-ready', {
        map: mapInstance.value,
        methods: {
            setView,
            fitBounds,
            getBounds,
            getZoom,
            getCenter,
            resetView,
            addLayer,
            removeLayer,
            addControl,
            removeControl,
            openPopup,
            closePopup
        }
    });
};

// 窗口大小变化处理
const handleResize = () => {
    if (mapInstance.value) {
        mapInstance.value.invalidateSize();
    }
};

onMounted(() => {
    initMap();
    window.addEventListener('resize', handleResize);
});

onBeforeUnmount(() => {
    window.removeEventListener('resize', handleResize);
    if (mapInstance.value) {
        mapInstance.value.remove();
        mapInstance.value = null;
    }
});

// 暴露方法给父组件
defineExpose({
    getMapInstance,
    setView,
    fitBounds,
    getBounds,
    getZoom,
    getCenter,
    resetView,
    addLayer,
    removeLayer,
    addControl,
    removeControl,
    openPopup,
    closePopup
});
</script>

<style scoped>
.map-container {
    width: 100%;
    height: 100%;
    min-height: 700px;
    z-index: 1;
    border-radius: 8px;
    background: rgba(248, 250, 252, 0.5);
}

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
</style>