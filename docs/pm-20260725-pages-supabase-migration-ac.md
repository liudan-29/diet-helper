# Meal Compass公开部署迁移AC

## 目标

把饮食小助手的主要公开入口从`chatgpt.site`迁移为GitHub Pages品牌网址，服务端接口迁移到Supabase Edge Functions。保留本地Node入口和现有Sites入口作为开发与回退方式。

目标公开地址：

```text
https://mealcompass-web.github.io/
```

源码仓库继续使用：

```text
https://github.com/liudan-29/diet-helper
```

## B1：实体与生命周期

### 静态站点构建产物

生命周期：

```text
源码 → 构建中 → _site产物就绪 → 推送Pages仓库 → GitHub Pages发布
          ↘ 构建失败
```

牵连关系：

- 构建时读取`DIET_HELPER_API_BASE`，生成只含公开接口地址的`config.js`。
- 构建失败时不得修改源码仓库remote，也不得留下被误认为已发布的成功提示。
- 下一次构建可以完整替换旧`_site`，但清理范围只能位于项目内。

### Supabase Edge Function

生命周期：

```text
未部署 → 部署中 → 可调用 → 新版本覆盖
                  ↘ 调用失败
```

牵连关系：

- 从Supabase Secrets读取`AMAP_MCP_KEY`和可选`ALLOWED_ORIGINS`。
- 推荐和地点解析必须复用项目现有高德客户端与筛选规则。
- Edge Function不可用时，Pages页面仍能打开，本地记录、做饭和个人数据入口不能被服务端故障一起阻断。

### 品牌Pages仓库

生命周期：

```text
组织不存在 → 组织创建 → Pages仓库创建 → 首次发布 → 后续覆盖发布
```

牵连关系：

- 组织目标为`mealcompass-web`，仓库目标为`mealcompass-web.github.io`。
- 组织和仓库创建需要GitHub账号本人完成验证码或登录确认。
- 源码仓库继续归`liudan-29/diet-helper`维护，两者不得混用git历史。

### 密钥

生命周期：

```text
本地.env → Supabase Secret → Edge Function运行时读取
```

牵连关系：

- 高德Key不得进入静态产物、源码提交、GitHub Pages仓库、浏览器响应或日志。
- Supabase登录Token不得写入项目文件或聊天记录。
- 饮食助手必须使用独立Supabase项目，不得与双人打卡或其他产品共用Project Ref。

## B2：五个必问

### Q1：空状态

- 未设置`DIET_HELPER_API_BASE`时，Pages构建直接失败并显示缺少变量，不生成可部署成功提示。
- 未设置`AMAP_MCP_KEY`时，Edge Function返回明确的演示数据模式；不得伪装成真实高德结果。
- GitHub组织或Pages仓库尚未建立时，只完成本地构建，不修改源码仓库remote。

### Q2：失败

- 高德MCP超时：推荐接口返回`502`和可公开的错误文字，不返回Key、请求URL或内部堆栈。
- 地理编码无结果：接口返回`404`和可重试标记，页面保留用户已经填写的地点。
- Supabase函数不可达：页面展示查询失败，其他三个入口和浏览器本地数据继续可用。
- 非允许来源调用：Edge Function返回`403`，不执行高德请求。
- Pages推送失败：部署脚本保留源码仓库状态，不把失败报告为成功。

### Q3：被引用

- `config.js`被所有需要服务端调用的前端模块引用，API地址修改只改构建配置，不在多个模块重复硬编码。
- 本地Node服务和Sites Worker继续使用同源`/api/*`，不得因为Pages配置而失效。
- `lib/amap-mcp.js`和`lib/recommendations.js`是三种服务端入口的唯一业务实现来源。

### Q4：并发

- 多个用户可同时调用推荐和地点解析，每次调用使用独立请求对象、超时控制和MCP客户端。
- 两次Pages发布同时发生时，以最后成功推送的提交为线上版本；部署脚本不修改源码分支。

### Q5：后悔与回滚

- 现有`chatgpt.site`部署暂不删除，作为迁移期回退入口。
- Pages发布失败或微信验收失败时，可以继续使用本地和Sites版本，不删除现有构建脚本。
- 品牌组织、Pages仓库和Supabase函数属于外部资源，删除前必须单独确认；本次迁移不自动删除它们。

## B3：输入输出链

### 输入

- 浏览器位置、餐次、场合、人数、口味和预算 → 格式错误由现有校验器返回`400`。
- 手动地点文字 → 空值或过长返回`400`，高德无结果返回`404`。
- `DIET_HELPER_API_BASE` → 缺失时Pages构建失败，末尾斜杠必须规范化。
- `AMAP_MCP_KEY` → 只从Supabase运行时环境读取。
- `ALLOWED_ORIGINS` → 未设置时至少允许品牌Pages地址和本地开发地址。

### 输出

- GitHub Pages静态文件 → 浏览器直接加载，不包含服务端Key。
- 推荐JSON → 前端餐厅卡片、收藏和用餐记录模块消费。
- 地理编码JSON → 手动地点和常用地点模块消费。
- 构建与部署日志 → 只能输出状态、仓库和公开网址，不输出Secret。

## B4：V1子功能清单

### 必须实现

1. Supabase Edge Function提供健康检查、推荐和地点解析。
2. 前端API地址可在同源模式和Pages跨域模式间切换。
3. Pages构建生成完整静态产物并注入公开API地址。
4. 高德Key只存在于服务端Secret。
5. CORS、请求体上限、输入校验、超时和错误脱敏完整。
6. 本地Node与Sites入口不回归。
7. Pages部署脚本不修改源码仓库remote。
8. 公开品牌名使用`Meal Compass`，中文名保留`饮食小助手`。

### 应该实现

1. 部署脚本支持通过`PAGES_REPOSITORY`覆盖目标仓库。
2. 迁移期保留Sites回退入口。
3. README写清两种部署方式和账号操作边界。

### 可以延后

1. GitHub Actions自动发布。
2. 自有品牌域名。
3. 服务端持久化限流和用量后台。

## 验收标准

### AC-1：本地入口保持可用

- 前置：未设置Pages专用环境变量，本地`.env`存在或使用演示模式。
- 操作：执行`npm start`并访问`http://localhost:4173`。
- 期望：首页返回`200`；前端请求仍访问同源`/api/recommendations`和`/api/geocode`；四个入口均可打开。

### AC-2：Sites构建保持可用

- 前置：安装项目依赖。
- 操作：执行`npm run build`。
- 期望：继续生成`dist/`；`sites-worker.js`仍包含健康检查、推荐和地点解析；构建不读取Pages专用Secret。

### AC-3：Pages构建拒绝缺失API地址

- 前置：未设置`DIET_HELPER_API_BASE`。
- 操作：执行`npm run build:pages`。
- 期望：进程以非零状态退出，错误信息明确包含`DIET_HELPER_API_BASE`；不得显示部署成功。

### AC-4：Pages构建产物完整

- 前置：设置合法HTTPS`DIET_HELPER_API_BASE`。
- 操作：执行`npm run build:pages`。
- 期望：项目内`_site/`包含`index.html`、`styles.css`、`app.js`、`config.js`、`favicon.svg`、前端依赖模块和`.nojekyll`；`config.js`只包含公开API地址。

### AC-5：统一API地址

- 前置：源码默认`config.js`的`apiBase`为空。
- 操作：分别在本地源码和Pages构建产物中发起地点解析与餐厅推荐。
- 期望：本地使用同源`/api/*`；Pages使用`DIET_HELPER_API_BASE`指向的Edge Function；三个调用点不得重复硬编码完整URL。

### AC-6：Edge Function健康检查

- 前置：函数已部署。
- 操作：从允许来源调用`GET /functions/v1/diet-helper/health`。
- 期望：返回`200`和JSON；包含`ok:true`以及`amap`或`mock`模式，不包含Key。

### AC-7：推荐接口

- 前置：函数已部署，提供通过现有校验器的用餐请求。
- 操作：从允许来源调用`POST /functions/v1/diet-helper/recommendations`。
- 期望：返回`200`；JSON包含`restaurants`数组、`search`对象和`mode`；真实模式调用现有高德MCP与照片详情逻辑。

### AC-8：地点解析接口

- 前置：函数已部署。
- 操作：从允许来源调用`POST /functions/v1/diet-helper/geocode`，正文为有效`address`。
- 期望：成功返回`200`以及有限数值`longitude`、`latitude`和地址文字；无结果返回`404`；空值或超长返回`400`。

### AC-9：CORS允许来源

- 前置：`Origin`为`https://mealcompass-web.github.io`或已配置的本地开发来源。
- 操作：发送`OPTIONS`以及后续`POST`。
- 期望：预检返回成功；响应的`Access-Control-Allow-Origin`等于请求来源，不使用`*`。

### AC-10：CORS拒绝来源

- 前置：`Origin`不在允许列表。
- 操作：调用任一Edge Function路由。
- 期望：返回`403`；高德调用未执行；响应不返回Key或内部错误。

### AC-11：请求边界和错误脱敏

- 前置：函数已部署。
- 操作：分别提交超过100000字符的请求体、无效JSON和导致高德超时的请求。
- 期望：分别返回`413`或明确的`400`、`502`；响应和日志不包含32位高德Key、带`key=`的完整URL或堆栈。

### AC-12：密钥不进入客户端和Git

- 前置：完成Pages构建和函数部署。
- 操作：搜索源码已跟踪文件、`_site/`和浏览器网络响应。
- 期望：均找不到真实`AMAP_MCP_KEY`值；`.env`和Supabase登录Token未被提交。

### AC-13：Pages部署隔离

- 前置：`_site`构建成功，目标仓库存在。
- 操作：运行Pages部署脚本。
- 期望：部署脚本只在`_site`中初始化临时git历史并推送目标仓库；源码仓库`origin`仍为`liudan-29/diet-helper`；推送失败时返回非零状态。

### AC-14：品牌展示

- 前置：Pages已经发布。
- 操作：打开公开首页。
- 期望：浏览器标题包含`Meal Compass`和`饮食小助手`；公开地址不包含`liudan`；页面内原有中文功能名称不被改成英文。

### AC-15：微信真机访问

- 前置：Pages和Edge Function均发布成功。
- 操作：把公开链接发送到微信，在微信内置浏览器中打开并执行一次地点解析和一次餐厅推荐。
- 期望：首页直接显示，不出现Cloudflare封禁页；两个服务端请求成功或展示明确的可重试错误；其他三个本地功能入口可正常打开。
