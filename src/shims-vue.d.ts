// shims-vue.d.ts
// 通过这个声明让 TypeScript 识别导入 .vue 文件

declare module '*.vue' {
  import { DefineComponent } from 'vue';
  const component: DefineComponent<{}, {}, any>;
  export default component;
}
