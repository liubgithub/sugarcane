// src/router/routes.ts
import type { RouteRecordRaw } from "vue-router";

// 懒加载组件，提升首屏速度
const Dashboard = () => import("@/views/Dashboard/Index.vue");
const DeviceDetail = () => import("@/views/Detail/DeviceDetail.vue");
const SystemConfig = () => import("@/views/Config/SystemConfig.vue");

// 基础布局组件 (可选，如果大屏不需要Header/Footer，可以直接在视图里写死)
// const MainLayout = () => import('@/layout/MainLayout.vue');

export const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Dashboard",
    component: Dashboard,
    meta: {
      title: "甘蔗大数据分析平台",
      keepAlive: true, // 重要：大屏通常希望保持状态，切出去再回来不重新加载
    },
  },
  {
    path: "/detail/:id",
    name: "DeviceDetail",
    component: DeviceDetail,
    meta: {
      title: "设备详情",
      keepAlive: false,
    },
    props: true, // 允许将 route.params 作为 props 传递给组件
  },
  {
    path: "/config",
    name: "SystemConfig",
    component: SystemConfig,
    meta: {
      title: "系统配置",
      requiresAuth: true, // 标记需要登录
    },
  },
  // 404 页面
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    redirect: "/", // 找不到路径直接回首页
  },
];
