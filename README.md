# 觅食小裁判

一款基于**微信小程序**与**微信云开发**的外卖评价与推荐小程序：同事圈内分享外卖体验、查看榜单与地图、结合偏好做「今天吃啥」推荐，并集成云函数与 AI 能力辅助文案与推荐说明。

> 仓库名 `waimaifuxinglu` 为项目目录标识；产品名以小程序内展示为准：**觅食小裁判**。

## 功能概览

- **广场**：浏览同事圈内的外卖评价与动态  
- **今天吃啥**：按偏好与数据推荐商家，支持 AI 生成推荐理由（依赖云开发 AI 能力）  
- **我的**：个人资料、群组与偏好设置  
- **发布 / 导入**：上传订单截图（OCR）、撰写评价  
- **地图 / 商家详情 / 排行榜**：发现商家与口碑排序  

## 技术栈

| 模块 | 说明 |
|------|------|
| 小程序端 | 原生小程序（JavaScript + WXML/WXSS），自定义 TabBar |
| 后端 | 微信云函数（Node.js + `wx-server-sdk`） |
| 数据与存储 | 云数据库、云存储 |
| 扩展能力 | 内容安全、媒体审核回调、OCR、CloudBase AI（如 DeepSeek 流式文案） |

## 仓库结构

```
├── miniprogram/          # 小程序前端源码
├── cloudfunctions/       # 云函数（需在微信开发者工具中上传部署）
│   ├── login/            # 登录与鉴权流程
│   ├── getUserInfo/      # 用户信息
│   ├── createCompany/    # 创建公司/群组
│   ├── joinCompany/      # 加入群组
│   ├── updateUserInfo/   # 更新用户资料与偏好
│   ├── getMerchants/     # 商家列表
│   ├── getReviews/       # 评价列表
│   ├── createReview/     # 发布评价
│   ├── getRanking/       # 排行榜
│   ├── aiRecommend/      # AI 推荐相关
│   ├── ocr/              # 订单截图识别
│   ├── contentCheck/     # 内容安全
│   ├── mediaCheckCallback/
│   └── quickstartFunctions/  # 云开发模板示例（可按需保留或移除）
├── project.config.json   # 小程序工程配置（AppID、根目录等）
└── LICENSE               # MIT 开源许可证全文
```

## 运行前准备

1. 安装 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)。  
2. 在微信公众平台注册小程序，并开通**云开发**，创建环境，记录**环境 ID**。  
3. 在云开发控制台中创建与代码一致的**数据库集合**、**存储权限**及**云函数**所需配置（若你从零部署，需对照各云函数内对集合名、字段的引用自行建表或调整代码）。  
4. 若使用 **AI 推荐 / 流式文案**，请在云开发控制台开通 **AI/扩展能力**，并按微信文档配置可用模型与额度。  
5. 内容安全、OCR、媒体审核等接口需在对应控制台开通并按云函数内逻辑配置密钥或回调 URL。

## 本地配置步骤

1. 使用微信开发者工具打开本仓库根目录（识别 `project.config.json`）。  
2. 在 **详情 → 本地设置** 中按需勾选「不校验合法域名」等（仅开发调试用）。  
3. 将 `project.config.json` 中的 `appid` 改为你自己的小程序 AppID（勿使用他人线上环境）。  
4. 打开 `miniprogram/app.js`，将 `CLOUD_ENV_ID` 设为你的云开发**环境 ID**（占位为 `YOUR_ENV_ID` 时，启动会提示替换）。  
5. 在开发者工具中右键 `cloudfunctions` 下各函数目录，**上传并部署：云端安装依赖**，确保 `wx-server-sdk` 等依赖安装成功。  
6. 首次运行建议从**登录 / 引导页**走通完整链路，确认数据库与存储规则与业务一致。

## 开源协议

本项目以 **MIT License** 开源，详见仓库根目录 [`LICENSE`](./LICENSE)。

使用本代码即表示你理解：**微信、云开发、AI 与审核类服务受平台条款与计费规则约束**；部署产生的数据与合规责任由部署者自行承担。

## 贡献与致谢

欢迎 Issue / Pull Request。若提交代码，请保持与现有目录结构、命名风格一致，并避免在 PR 中提交个人密钥、环境 ID 截图等敏感信息。

底层能力参考 [微信云开发文档](https://developers.weixin.qq.com/miniprogram/dev/wxcloud/basis/getting-started.html)。

---

**提示：** 将 `LICENSE` 文件首行版权信息中的版权人名称替换为你的姓名或组织名后再发布到 GitHub。
