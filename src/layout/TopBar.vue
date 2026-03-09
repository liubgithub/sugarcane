<!-- src/layout/TopBar.vue -->
<template>
  <header class="top-bar">
    <div class="header-container">
      <!-- 左侧标题区域 -->
      <div class="title-section">
        <img src="@/assets/logo.png" alt="系统 Logo" class="logo" />
        <h1 class="main-title">全球甘蔗遥感面积与产量预测系统</h1>
      </div>

      <!-- 中间平台名称区域 -->
      <div class="platform-section">
        <img src="@/assets/left-arrow.png" alt="左箭头" class="arrow-icon" />
        <h2 class="platform-name">甘蔗大数据分析平台</h2>
        <img src="@/assets/right-arrow.png" alt="右箭头" class="arrow-icon" />
      </div>

      <!-- 右侧日期天气区域 -->
      <div class="date-weather-section">
        <span class="current-date">{{ currentDate }}</span>
        <img src="@/assets/sunny.png" alt="晴天" class="weather-icon" />
      </div>
    </div>
  </header>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';

// 动态获取当前日期
const currentDate = ref<string>('');

// 格式化日期：YYYY 年 MM 月 DD 日 星期 X
const formatDate = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const weekdays = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  const weekday = weekdays[date.getDay()];

  return `${year}年${month}月${day}日 ${weekday}`;
};

onMounted(() => {
  currentDate.value = formatDate(new Date());
});
</script>

<style scoped>
.top-bar {
  background-color: #568381;
  color: white;
  padding: 10px 0;
  box-shadow: 0 2px 5px rgba(0, 0, 0, 0.1);
}

.header-container {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 auto;
  padding: 0 10px;
  position: relative;
}

/* 左侧标题样式 */
.title-section {
  display: flex;
  align-items: center;
  gap: 10px;
}

.logo {
  height: 32px;
  width: auto;
  vertical-align: middle;
}

.main-title {
  font-size: 20px;
  margin: 0;
  font-weight: bold;
  color: #fff;
  text-shadow: 0 1px 2px rgba(0, 0, 0, 0.1);
}

/* 中间平台名称样式 */
.platform-section {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  text-align: center;
  margin-left: 28%;
}

.arrow-icon {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.platform-name {
  font-size: 20px;
  font-weight: bold;
  margin: 0;
  color: white;
}

/* 右侧日期天气样式 */
.date-weather-section {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  color: white;
}

.current-date {
  margin: 0;
}

.weather-icon {
  height: 36px;
  width: 36px;
}
</style>