# Shadowrocket 节点服务体检

用于检查当前 Shadowrocket 代理出口对以下服务的 Web 层可用性：

- TikTok
- Gemini
- ChatGPT
- X
- 出口 IP / 国家 / ASN

## 文件

- `service-check.js`：检测脚本
- `ServiceCheck.sgmodule`：Shadowrocket 模块

## Raw 地址

### 模块

https://raw.githubusercontent.com/465896705/edgetunnel/main/shadowrocket-service-check/ServiceCheck.sgmodule

### 脚本

https://raw.githubusercontent.com/465896705/edgetunnel/main/shadowrocket-service-check/service-check.js

## 使用说明

1. 在 Shadowrocket 中添加模块，URL 填写上面的模块 Raw 地址。
2. 确认你要测试的节点已经被选中。
3. 模块默认不会自动定时运行（`enable=false`），避免频繁请求多个服务。
4. 若要手动运行，可在 Shadowrocket 的脚本/模块界面找到脚本后执行；不同版本入口名称可能不同。
5. 检测域名必须走当前代理节点，否则出口 IP 与服务状态会失真。

## 说明

本项目不读取 Cookie，不要求登录，也不需要 MITM。因此结果属于“出口 IP + Web 服务层”检测：

- `✅` 表示检测时 Web 层正常返回，并不保证登录后的 App 100% 可用。
- `⚠️` 表示疑似地区/IP限制或无法可靠确认。
- `❌` 表示连接失败。

TikTok、Gemini、ChatGPT、X 都可能结合账号地区、IP信誉、客户端环境等因素做额外判断。
