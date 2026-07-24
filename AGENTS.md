# AGENTS.md

## 项目定位

饮食小助手的网页版。第一版帮助用户按当前位置、餐次、场景和饮食偏好发现合适的附近餐厅；高德 MCP 负责真实地点与导航数据。

## 当前范围

- 先完成网页端“去哪吃”核心流程。
- 高德 MCP 与模型服务的真实凭证只放在环境变量中，禁止写入仓库。
- 暂不做原生 APP、微信小程序、支付、社交和医疗建议。

## 技术约定

- Node.js最低版本为20，使用ES Module。
- `server.js`负责静态资源和API；高德MCP客户端位于`lib/amap-mcp.js`；筛选排序位于`lib/recommendations.js`。
- 前端不得持有或输出高德Key。
- 未配置`AMAP_MCP_KEY`时使用演示数据；配置后自动切换到高德MCP。
- 高德MCP的`maps_around_search`可能只返回基础POI且没有坐标；标准化前必须用`maps_search_detail`补齐详情，不能直接把这些POI丢弃。
- 真实接入验证使用`npm run check:amap`，验证脚本不得输出Key。
- 运行测试使用`npm test`，启动使用`npm start`。

## 产品范围护栏

- MVP 暂缓的功能不等于取消。完整产品功能清单以 `docs/product-roadmap.md` 为准。
- 开始新一轮功能规划前先读产品路线图，不能因为当前 MVP 没有展示某个入口，就把它从长期产品中遗忘。
- MVP 验证通过后，再按路线图逐项决定恢复顺序。

## 文档纪律

- 用户可见功能变化时同步更新 README.md。
- 有产出后立即向 WORKLOG.md 追加记录，不覆盖旧记录。
