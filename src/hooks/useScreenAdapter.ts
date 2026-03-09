// import { onMounted, onUnmounted } from "vue";

// export function useScreenAdapter(width = 1920, height = 1080) {
//   const resize = () => {
//     const dom = document.documentElement;
//     const clientWidth = dom.clientWidth;
//     const clientHeight = dom.clientHeight;

//     // 计算缩放比例，取宽高比中较小的一个，保证内容完全显示
//     const scaleX = clientWidth / width;
//     const scaleY = clientHeight / height;
//     const scale = Math.min(scaleX, scaleY);

//     dom.style.setProperty("--scale", `${scale}`);
//     // 或者直接在 body 上应用 transform (更常用)
//     const app = document.getElementById("app");
//     if (app) {
//       app.style.transform = `scale(${scale})`;
//       app.style.transformOrigin = `left top`;
//       // 防止出现滚动条
//       app.style.width = `${width}px`;
//       app.style.height = `${height}px`;
//     }
//   };

//   onMounted(() => {
//     resize();
//     window.addEventListener("resize", resize);
//   });

//   onUnmounted(() => {
//     window.removeEventListener("resize", resize);
//   });
// }
