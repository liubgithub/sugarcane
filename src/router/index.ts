// src/router/index.ts
import { createRouter, createWebHistory } from "vue-router";
import type { Router } from "vue-router";
import { routes } from "./routes";
// import { setupGuard } from './guards'; // 如果有守卫逻辑

const router: Router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  // 滚动行为：切换路由时回到顶部，或者保持位置
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition;
    } else {
      return { top: 0 };
    }
  },
});

// 简单的全局标题设置
router.beforeEach((to, from, next) => {
  document.title = (to.meta.title as string) || "大屏展示系统";

  // 模拟权限校验 (实际项目中请结合 Pinia 中的 userStore)
  const requiresAuth = to.matched.some((record) => record.meta.requiresAuth);
  const isLoggedIn = localStorage.getItem("token"); // 简单判断

  if (requiresAuth && !isLoggedIn) {
    // 如果没登录且需要权限，重定向到登录页或首页
    // next('/login');
    console.warn("未授权访问，重定向中...");
    next("/");
  } else {
    next();
  }
});

export default router;
