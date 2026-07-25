# Meal Compass · 饮食小助手

## 这是干嘛的

一个免登录的网页版饮食助手，当前正式初版包含四个入口：

- `去哪吃`：按位置、餐次、场合、人数、口味和预算推荐附近餐厅，支持真实照片、详情、导航、收藏和快速记录。
- `自己做`：根据现有食材、人数、可用时间、厨具和口味，从本地规则库生成做饭方案。
- `记一笔`：新建、编辑、筛选和删除饮食记录，可保存一张本地照片。
- `我的`：管理默认偏好、常用地点、收藏、最近历史和本地数据。

餐厅与地点数据来自高德，做饭方案不调用大模型。个人资料、收藏、历史和记录保存在当前浏览器中，不需要注册账号，也不会自动同步到其他设备。

目标公开地址：<https://mealcompass-web.github.io/>（首次Pages发布后生效）

迁移期回退地址：<https://liudan-diet-helper.dan351379.chatgpt.site>。这个地址在部分微信内置浏览器中会被Cloudflare拦截，不再作为主要分享入口。

## 怎么跑

需要Node.js 20或更高版本。首次运行安装依赖：

```powershell
npm install
npm start
```

访问 `http://localhost:4173`。

复制 `.env.example` 为 `.env`，填入高德开放平台中“Web服务”类型的Key：

```text
AMAP_MCP_KEY=你的Key
```

没有配置Key时，项目自动使用演示餐厅数据；配置后，服务端通过高德MCP周边搜索查询真实餐厅，手动填写的地点也由服务端调用高德地理编码解析。首次筛选不足5家时，会自动更换关键词并将范围逐步扩大到2公里、3公里，合并去重后最多返回8家；餐次、场合和预算等硬性条件不会为了凑数量而放宽。

推荐先检查餐厅营业时间是否覆盖用户选择的餐次。午餐默认按11:00至14:30判断，早餐专营店或只在早餐时段营业的餐厅不会进入午餐排序。营业时间缺失时，才使用餐厅名称、类别和当前营业状态兜底。

可以单独验证高德 MCP 是否连通：

```powershell
npm run check:amap
```

这个命令只输出连接结果和餐厅摘要，不会输出Key。

## 公开部署

主要公开入口采用GitHub Pages静态页面加Supabase Edge Functions服务端：

- GitHub Pages负责页面，对外品牌网址不包含个人姓名。
- Supabase Edge Functions负责高德MCP推荐、POI图片和地点解析。
- 高德Key只保存在Supabase Secrets，不进入Pages产物。

饮食助手必须使用单独的Supabase项目，不能复用双人打卡或其他产品的项目。先在Supabase控制台新建项目，例如`meal-compass-diet-helper`，再复制这个新项目自己的Project Ref。首次部署时执行：

```powershell
npx.cmd --yes supabase@latest login
$env:DIET_HELPER_SUPABASE_REF="<饮食助手的新Project Ref>"
npx.cmd --yes supabase@latest secrets set --env-file .env --project-ref $env:DIET_HELPER_SUPABASE_REF
npx.cmd --yes supabase@latest functions deploy diet-helper --project-ref $env:DIET_HELPER_SUPABASE_REF --use-api
```

这个Supabase项目只归饮食助手使用。当前版本的个人资料、收藏和饮食记录仍保存在用户自己的浏览器中；单独建项目主要隔离Edge Function、Key、日志、配额，并给后续独立数据库留出边界。

GitHub组织`mealcompass-web`和公开仓库`mealcompass-web.github.io`建立后，执行：

```powershell
$env:DIET_HELPER_API_BASE="https://$($env:DIET_HELPER_SUPABASE_REF).supabase.co/functions/v1/diet-helper"
powershell -ExecutionPolicy Bypass -File scripts/deploy-pages.ps1
```

`npm run build:pages`只生成项目内`_site/`静态产物。`scripts/deploy-pages.ps1`在`_site/`中建立独立git历史并推送Pages仓库，不修改源码仓库的`origin`。

原Sites版本继续保留为回退入口：

```powershell
npm run build
```

这个命令生成`dist/`静态资源和边缘函数包，`sites-worker.js`继续处理同源接口。三种服务端入口共用`lib/amap-mcp.js`和`lib/recommendations.js`。

## 备注

- 当前已包含Node服务端、四入口网页端、本地数据仓库、照片仓库、做饭规则库、餐厅筛选排序与高德MCP客户端。
- 前端通过`lib/api.js`统一确定接口地址：本地和Sites使用同源`/api/*`，Pages使用构建时写入`config.js`的Supabase函数地址。
- 周边搜索后会继续查询餐厅详情，以补齐坐标、评分、人均价格和营业时间；同店照片先使用MCP首图作为头图候选，再接高德Web服务POI详情图集并去重，详情接口失败时使用MCP照片兜底。
- 一家餐厅有多张照片时，页面会同时预加载这些高德实景图，可以点击左右箭头、分页条或在手机上左右滑动切换；高德自有图片地址会统一使用HTTPS。只有一张时不显示轮播控件，照片缺失或加载失败时使用不计入图集的渐变占位图。
- 高德照片接口没有可靠的门头、环境、菜品类型字段，页面只展示真实返回的照片，不强行补齐或标注照片类别。
- 场合使用预设加自定义输入；同行人数直接填写；口味支持多选。其他要求可以识别面馆、火锅、烤肉等餐厅类型，菜品级忌口、过敏和医疗要求仍需向餐厅确认。
- 人均预算使用数字输入框，可以直接填写0元至10000元之间的金额；默认值为80元。
- 做饭方案来自项目内置的规则库，只提供日常决策参考；遇到过敏、疾病、特殊营养需求或食材安全问题，应以专业意见和实际食材情况为准。
- 浏览器结构化数据保存在`localStorage`，饮食记录照片保存在`IndexedDB`。清理浏览器数据会删除这些内容，当前版本不提供跨设备同步。
- 高德和模型服务密钥仅配置在本地 `.env` 文件或部署平台环境变量中，不能提交到仓库。
- GitHub Pages与Supabase迁移验收标准见`docs/pm-20260725-pages-supabase-migration-ac.md`。
- 当前公开接口依靠CORS、输入校验和请求上限减少误用，但CORS不是身份验证。持久化限流和用量后台仍在后续路线图中，发布后需要关注Supabase与高德配额。
- 第一版不做原生 APP、微信小程序、支付、社交和医疗建议。
- 正式初版的产品结构见`docs/pm-20260724-diet-helper-v1-structure.md`，逐项验收标准见`docs/pm-20260724-diet-helper-v1-ac.md`；更长期的功能与暂缓原因见`docs/product-roadmap.md`。
