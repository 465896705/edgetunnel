# 手机真实节点检测（iPhone + Shadowrocket）

本分支为 edgetunnel 增加一套“手机端真实链路结果”存储与订阅筛选能力。它与现有 `/admin/node-check` 不同：`node-check` 只做 Cloudflare 侧的 TCP/TLS/HTTP 可达性探测；这里保存的是 iPhone/Shadowrocket 实际使用节点后得到的出口、速度和服务可用性结果。

## 入口

登录管理后台后访问：

```
/admin/mobile-check
```

页面可以查看结果、清空结果和筛选 TikTok + Gemini 双可用节点。

## API 鉴权

手机快捷指令可以使用现有订阅 TOKEN：

- Query: `?token=TOKEN`
- 或 Header: `x-mobile-check-token: TOKEN`

管理后台 Cookie 同样有效。

## API

### 获取待测节点

```
GET /admin/mobile-check/api/tasks?token=TOKEN
```

返回的每个任务包含稳定 `id`、原始 `node` 和 `label`。任务来源优先读取 KV 中的 `ADD.txt`，否则使用 `PROXYIP`。

### 上报真实检测结果

```
POST /admin/mobile-check/api/report?token=TOKEN
Content-Type: application/json
```

示例：

```json
{
  "nodeId": "tasks 接口返回的 id",
  "node": "原始节点文本",
  "label": "US-01",
  "ip": "203.0.113.10",
  "loc": "US",
  "asn": "AS12345",
  "isp": "Example ISP",
  "latencyMs": 82,
  "downloadMbps": 136.5,
  "tiktok": "ok",
  "gemini": "ok",
  "note": ""
}
```

`tiktok` / `gemini` 支持：

- `ok`: 实测可用
- `blocked`: 实测不可用
- `unknown`: 未确认

结果写入 KV：`mobile-check-results.json`，最多保留 200 条。

### 查看全部结果

```
GET /admin/mobile-check/api/results?token=TOKEN
```

### 查看合格节点

默认要求 TikTok 与 Gemini 均为 `ok`，结果不超过 7 天：

```
GET /admin/mobile-check/api/best?token=TOKEN&minMbps=50
```

可调参数：

- `minMbps=50`
- `maxAgeHours=168`
- `tiktok=0`：不要求 TikTok
- `gemini=0`：不要求 Gemini

### 输出合格 ADD 列表

```
GET /admin/mobile-check/api/best-add.txt?token=TOKEN&minMbps=50
```

### 清空

```
POST /admin/mobile-check/api/clear?token=TOKEN
```

## 直接生成手机实测优选订阅

现有订阅 URL 增加：

```
&mobilebest=1&minMbps=50
```

例如：

```
/sub?token=TOKEN&mobilebest=1&minMbps=50
```

默认只保留：

- 最近 168 小时有手机实测结果
- 下载速度 >= `minMbps`
- TikTok = `ok`
- Gemini = `ok`

也可以：

```
/sub?token=TOKEN&mobilebest=1&minMbps=30&tiktok=0&maxAgeHours=24
```

表示只要求 Gemini 可用、速度至少 30 Mbps、结果在 24 小时内。

> `mobilebest=1` 只作用于“本地生成订阅”路径（`优选订阅生成.local`）。它不会改变外部优选订阅生成器的内容。

## iOS 快捷指令建议流程

1. 请求 `/tasks`。
2. 遍历任务。
3. 让 Shadowrocket 切到对应节点。
4. 等待连接稳定。
5. 通过当前代理获取出口 IP / 国家 / ASN。
6. 做固定文件下载测速，计算 Mbps。
7. 实际检查 TikTok、Gemini，并将结果归一化为 `ok / blocked / unknown`。
8. POST 到 `/report`。
9. 全部完成后更新带 `mobilebest=1` 的 Shadowrocket 订阅。

注意：Shadowrocket 的 CONNECT 延迟不等于真实下载速度；TikTok/Gemini 的简单网页 HTTP 200 也不应直接视为“实际可用”。
