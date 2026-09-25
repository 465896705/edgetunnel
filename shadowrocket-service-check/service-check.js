/*
 * Shadowrocket 当前节点服务检测 V1
 * 检测：出口 IP / 国家、TikTok、Gemini、ChatGPT、X
 * 不读取 Cookie，不需要 MITM。
 */

const TIMEOUT = 8000;

function get(url, headers = {}) {
  return new Promise((resolve) => {
    let finished = false;

    const timer = setTimeout(() => {
      if (!finished) {
        finished = true;
        resolve({ ok: false, status: 0, body: "", error: "Timeout" });
      }
    }, TIMEOUT);

    $httpClient.get(
      {
        url,
        headers: Object.assign(
          {
            "User-Agent":
              "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15",
          },
          headers
        ),
      },
      (error, response, data) => {
        if (finished) return;
        finished = true;
        clearTimeout(timer);
        resolve({
          ok: !error,
          status: response ? response.status : 0,
          headers: response ? response.headers : {},
          body: data || "",
          error: error || "",
        });
      }
    );
  });
}

function icon(result) {
  if (result === "OK") return "✅";
  if (result === "LIMIT") return "⚠️";
  return "❌";
}

async function checkIP() {
  try {
    const r = await get("https://ipinfo.io/json");
    if (!r.ok || r.status !== 200) {
      return { ip: "Unknown", country: "??", city: "", org: "" };
    }
    const j = JSON.parse(r.body);
    return {
      ip: j.ip || "Unknown",
      country: j.country || "??",
      city: j.city || "",
      org: j.org || "",
    };
  } catch (_) {
    return { ip: "Unknown", country: "??", city: "", org: "" };
  }
}

async function checkTikTok() {
  const r = await get("https://www.tiktok.com/");
  if (!r.ok) return { state: "FAIL", detail: "连接失败" };

  const body = (r.body || "").toLowerCase();
  if (
    r.status >= 200 &&
    r.status < 400 &&
    (body.includes("tiktok") || body.includes("webapp"))
  ) {
    return { state: "OK", detail: "Web 可访问" };
  }

  if (
    r.status === 403 ||
    r.status === 451 ||
    body.includes("unavailable") ||
    body.includes("region")
  ) {
    return { state: "LIMIT", detail: "疑似地区/IP限制" };
  }

  return { state: "LIMIT", detail: "响应异常 " + r.status };
}

async function checkGemini() {
  const r = await get("https://gemini.google.com/");
  if (!r.ok) return { state: "FAIL", detail: "连接失败" };

  const body = (r.body || "").toLowerCase();
  const blockedWords = [
    "not available in your country",
    "isn't currently supported in your country",
    "not supported in your country",
    "not available in your region",
  ];

  if (blockedWords.some((x) => body.includes(x))) {
    return { state: "LIMIT", detail: "地区限制" };
  }

  if (
    r.status >= 200 &&
    r.status < 400 &&
    (body.includes("gemini") || body.includes("google"))
  ) {
    return { state: "OK", detail: "Web 可访问" };
  }

  return { state: "LIMIT", detail: "无法确认 " + r.status };
}

async function checkChatGPT() {
  const r = await get("https://chatgpt.com/");
  if (!r.ok) return { state: "FAIL", detail: "连接失败" };

  const body = (r.body || "").toLowerCase();
  if (
    body.includes("unsupported country") ||
    body.includes("not available in your country") ||
    body.includes("region is not supported")
  ) {
    return { state: "LIMIT", detail: "地区限制" };
  }

  if (
    r.status >= 200 &&
    r.status < 400 &&
    (body.includes("chatgpt") || body.includes("openai"))
  ) {
    return { state: "OK", detail: "Web 可访问" };
  }

  if (r.status === 403) {
    return { state: "LIMIT", detail: "403 / IP可能受限" };
  }

  return { state: "LIMIT", detail: "无法确认 " + r.status };
}

async function checkX() {
  const r = await get("https://x.com/");
  if (!r.ok) return { state: "FAIL", detail: "连接失败" };

  const body = (r.body || "").toLowerCase();
  if (
    r.status >= 200 &&
    r.status < 400 &&
    (body.includes("twitter") || body.includes("x.com"))
  ) {
    return { state: "OK", detail: "Web 可访问" };
  }

  if (r.status === 403 || r.status === 451) {
    return { state: "LIMIT", detail: "地区/IP限制 " + r.status };
  }

  return { state: "LIMIT", detail: "响应异常 " + r.status };
}

(async () => {
  const ip = await checkIP();
  const results = await Promise.all([
    checkTikTok(),
    checkGemini(),
    checkChatGPT(),
    checkX(),
  ]);

  const [tiktok, gemini, chatgpt, x] = results;
  const passed = results.filter((item) => item.state === "OK").length;
  const location = [ip.country, ip.city].filter(Boolean).join(" / ");

  const message = `🌐 ${ip.ip}\n📍 ${location || "Unknown"}\n🏢 ${
    ip.org || "Unknown"
  }\n\n${icon(tiktok.state)} TikTok\n   ${tiktok.detail}\n\n${icon(
    gemini.state
  )} Gemini\n   ${gemini.detail}\n\n${icon(chatgpt.state)} ChatGPT\n   ${
    chatgpt.detail
  }\n\n${icon(x.state)} X\n   ${x.detail}\n\n────────────\n综合：${passed}/4`;

  $notification.post(
    "🚀 节点服务体检",
    `${ip.country || "??"} · ${passed}/4`,
    message
  );
  $done();
})();
