// 后端配置（§14.4：密钥走环境变量，不进代码、不进版本库）。
// 未配置密钥时进入 mock 模式：返回内置演示数据，保证 Demo 离线可跑。

export const config = {
  port: Number(process.env.PORT || 8787),
  // OpenAI 兼容接口（GLM / DeepSeek 均提供）
  llmBaseUrl: process.env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4',
  llmApiKey: process.env.LLM_API_KEY || '',
  llmModel: process.env.LLM_MODEL || 'glm-4.5-flash',
  // 知乎站内搜索（§13 / §22-2 已确认）：开放平台 zhihu_search 接口，
  // Bearer Access Secret + X-Request-Timestamp 鉴权。未配置时走 mock 降级。
  zhihuAccessSecret: process.env.ZHIHU_ACCESS_SECRET || '',
  zhihuSearchUrl: 'https://developer.zhihu.com/api/v1/content/zhihu_search',
  // 应用层限流（§14.3 第二道：单 IP 每分钟上限，内存计数，仅辅助）
  rateLimitPerMinute: Number(process.env.RATE_LIMIT_PER_MINUTE || 20),
  // 云函数超时需调至 30–60 秒（§8.3 约束 3），模型侧超时略小于它
  llmTimeoutMs: Number(process.env.LLM_TIMEOUT_MS || 25000),
};

export const isMockMode = !config.llmApiKey;
