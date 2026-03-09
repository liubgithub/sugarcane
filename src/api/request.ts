import axios, { AxiosInstance, AxiosRequestConfig, AxiosResponse } from "axios";

const service: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || "/api", // 环境变量
  timeout: 10000,
});

// 请求拦截器
service.interceptors.request.use(
  (config) => {
    // 可在此添加 Token
    // const token = useToken();
    // if (token) config.headers['Authorization'] = `Bearer ${token}`;
    return config;
  },
  (error) => Promise.reject(error),
);

// 响应拦截器
service.interceptors.response.use(
  (response: AxiosResponse) => {
    // 根据后端数据结构处理，假设成功码为 200
    if (response.status === 200) {
      return response.data;
    }
    return Promise.reject(new Error(response.statusText || "Error"));
  },
  (error) => {
    console.error("API Error:", error);
    return Promise.reject(error);
  },
);

export default service;
