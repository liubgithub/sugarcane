<template>
  <div id="app-container" ref="appContainer">
    <!-- 顶部导航栏 -->
    <TopBar />

    <!-- 主体内容 -->
    <!-- 路由视图 -->
    <router-view v-slot="{ Component, route }">
      <!-- 使用 transition 实现页面切换动画  -->
      <transition name="fade" mode="out-in">
        <keep-alive :include="cachedViews" v-if="route.meta.keepAlive">
          <component :is="Component" :key="route.fullPath" />
        </keep-alive>
        <component v-else :is="Component" :key="route.fullPath" />
      </transition>
    </router-view>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { useRoute } from 'vue-router';
import TopBar from '@/layout/TopBar.vue';

const route = useRoute();
const appContainer = ref<HTMLElement | null>(null);

// 初始化缩放 (设计稿 1920x1080)
// useScreenAdapter(1920, 1080);

// 计算需要缓存的视图名称列表
const cachedViews = computed(() => {
  // 这里可以动态获取所有 meta.keepAlive === true 的组件名
  // 简单写法：如果当前路由需要缓存，就返回组件名，否则返回空数组
  // 注意：component.name 需要在组件 script 中显式定义 name 选项才有效
  if (route.meta.keepAlive && route.name) {
    return [route.name as string];
  }
  return [];
});
</script>

<style>
/* 全局重置 */
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body {
  height: 100%;
  margin: 0;
  padding: 0;
  overflow-y: hidden;
}

body {
  font-family: 'Microsoft YaHei', 'PingFang SC', Arial, sans-serif;
  background: #ebf2fd;
  color: #334155;
  overflow-x: hidden;
  display: flex;
  flex-direction: column;
}

#app-container {
  flex: 1;
  display: flex;
  flex-direction: column;
  transform-origin: left top;
  position: relative;
  width: 100%;
  min-height: 100vh;
}

/* 简单的淡入淡出动画 */
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.3s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>