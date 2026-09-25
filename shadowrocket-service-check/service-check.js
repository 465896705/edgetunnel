/*
 * Shadowrocket 当前节点服务检测 V2
 * 目标：出口 IP/地区 + TikTok/Gemini/ChatGPT/X 可用性分级
 * 无 Cookie、无 MITM。结果分为：OK / WEB / LIMIT / FAIL。
 */

const TIMEOUT = 9000;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

function get(url, headers = {}) {
  return new Promise((resolve) => {
    let finished = false;
    const timer = setTimeout(() => finish({ ok:false, status:0, headers:{}, body:"", error:"Timeout" }), TIMEOUT);
    function finish(v) { if (finished) return; finished = true; clearTimeout(timer); resolve(v); }
    try {
      $httpClient.get({ url, headers:Object.assign({"User-Agent":UA,"Accept":"*/*"}, headers) }, (error,response,data) => {
        finish({ ok:!error, status:response ? Number(response.status || response.statusCode || 0) : 0, headers:response ? (response.headers || {}) : {}, body:data || "", error:error || "" });
      });
    } catch (e) { finish({ok:false,status:0,headers:{},body:"",error:String(e)}); }
  });
}

function lower(s){ return String(s || "").toLowerCase(); }
function icon(s){ return s === "OK" ? "✅" : s === "WEB" ? "🟢" : s === "LIMIT" ? "⚠️" : "❌"; }
function safeJSON(s){ try { return JSON.parse(s); } catch (_) { return null; } }
function countryFlag(cc){ if(!cc || cc.length !== 2) return "🌐"; return String.fromCodePoint(...cc.toUpperCase().split("").map(c=>127397+c.charCodeAt(0))); }

async function checkIP(){
  const providers = [
    async()=>{ const r=await get("https://api.ip.sb/geoip"); const j=safeJSON(r.body); if(r.ok&&r.status===200&&j&&j.ip) return {ip:j.ip,country:j.country_code||"??",city:j.city||"",org:j.isp||j.organization||j.asn_organization||"",asn:j.asn||""}; },
    async()=>{ const r=await get("https://ipwho.is/"); const j=safeJSON(r.body); if(r.ok&&r.status===200&&j&&j.success!==false&&j.ip) return {ip:j.ip,country:j.country_code||"??",city:j.city||"",org:(j.connection&&(j.connection.isp||j.connection.org))||"",asn:(j.connection&&j.connection.asn)||""}; },
    async()=>{ const r=await get("https://ipapi.co/json/"); const j=safeJSON(r.body); if(r.ok&&r.status===200&&j&&j.ip) return {ip:j.ip,country:j.country_code||"??",city:j.city||"",org:j.org||"",asn:j.asn||""}; },
    async()=>{ const r=await get("https://ipinfo.io/json"); const j=safeJSON(r.body); if(r.ok&&r.status===200&&j&&j.ip) return {ip:j.ip,country:j.country||"??",city:j.city||"",org:j.org||"",asn:""}; }
  ];
  for(const p of providers){ try { const v=await p(); if(v) return v; } catch(_){} }
  return {ip:"Unknown",country:"??",city:"",org:"",asn:""};
}

async function checkTikTok(){
  // TikTok web 首页不能证明 App 完整解锁，因此成功只标记 WEB；明确 403/451/地区文案才判限制。
  const urls=["https://www.tiktok.com/","https://www.tiktok.com/foryou"];
  let last=0;
  for(const u of urls){
    const r=await get(u,{"Accept":"text/html,application/xhtml+xml"}); last=r.status;
    const b=lower(r.body);
    if(r.ok && (r.status===403||r.status===451||b.includes("not available in your region")||b.includes("not available in your country"))) return {state:"LIMIT",detail:"地区/IP 限制 · HTTP "+r.status};
    if(r.ok && r.status>=200 && r.status<400 && (b.includes("tiktok")||b.includes("webapp"))) return {state:"WEB",detail:"Web 正常 · App 地区待实测"};
  }
  return {state:"FAIL",detail:"连接失败 · HTTP "+last};
}

async function checkGemini(){
  const r=await get("https://gemini.google.com/app",{"Accept":"text/html,application/xhtml+xml"});
  if(!r.ok) return {state:"FAIL",detail:"连接失败"};
  const b=lower(r.body);
  const blocked=["not available in your country","not available in your region","isn't currently supported in your country","is not currently supported in your country","gemini isn't available"];
  if(r.status===451 || blocked.some(x=>b.includes(x))) return {state:"LIMIT",detail:"明确地区限制"};
  if(r.status===403) return {state:"LIMIT",detail:"HTTP 403 · IP/访问受限"};
  if(r.status>=200&&r.status<400&&(b.includes("gemini")||b.includes("google"))) return {state:"OK",detail:"Gemini Web 可用"};
  return {state:"WEB",detail:"可连接但无法确认 · HTTP "+r.status};
}

async function checkChatGPT(){
  const urls=["https://chatgpt.com/","https://api.openai.com/v1/models"];
  const home=await get(urls[0],{"Accept":"text/html,application/xhtml+xml"});
  if(home.ok){
    const b=lower(home.body);
    if(home.status===451||b.includes("unsupported country")||b.includes("not available in your country")||b.includes("region is not supported")) return {state:"LIMIT",detail:"明确地区限制"};
    if(home.status>=200&&home.status<400&&(b.includes("chatgpt")||b.includes("openai"))) return {state:"OK",detail:"ChatGPT Web 可用"};
  }
  // API 未带 key 时 401/403 的 OpenAI JSON 也能证明服务端可达，但不把它当账号级解锁。
  const api=await get(urls[1],{"Accept":"application/json"});
  const b=lower(api.body);
  if(api.ok && (b.includes("openai")||b.includes("api key")||b.includes("authentication"))) return {state:"WEB",detail:"OpenAI 服务可达 · HTTP "+api.status};
  return {state:"FAIL",detail:"连接失败 · HTTP "+(home.status||api.status)};
}

async function checkX(){
  // x.com 首页对脚本请求可能失败；增加 Twitter 静态资源和 robots.txt 作为无登录连通性备用。
  const urls=["https://x.com/robots.txt","https://twitter.com/robots.txt","https://abs.twimg.com/robots.txt"];
  let statuses=[];
  for(const u of urls){
    const r=await get(u,{"Accept":"text/plain,*/*"}); statuses.push(r.status||0);
    if(r.ok && r.status>=200 && r.status<400) return {state:"OK",detail:"X/Twitter 服务可达 · HTTP "+r.status};
    if(r.ok && r.status===451) return {state:"LIMIT",detail:"HTTP 451 · 地区限制"};
  }
  return {state:"FAIL",detail:"连接失败 · "+statuses.join("/")};
}

(async()=>{
  const ip=await checkIP();
  const results=await Promise.all([checkTikTok(),checkGemini(),checkChatGPT(),checkX()]);
  const [tiktok,gemini,chatgpt,x]=results;
  const confirmed=results.filter(v=>v.state==="OK").length;
  const reachable=results.filter(v=>v.state==="OK"||v.state==="WEB").length;
  const loc=[ip.country,ip.city].filter(Boolean).join(" / ");
  const org=[ip.asn,ip.org].filter(Boolean).join(" ");
  const message=`${countryFlag(ip.country)} ${ip.ip}\n📍 ${loc||"Unknown"}\n🏢 ${org||"Unknown"}\n\n${icon(tiktok.state)} TikTok\n   ${tiktok.detail}\n\n${icon(gemini.state)} Gemini\n   ${gemini.detail}\n\n${icon(chatgpt.state)} ChatGPT\n   ${chatgpt.detail}\n\n${icon(x.state)} X\n   ${x.detail}\n\n────────────\n确认可用：${confirmed}/4\n可连接：${reachable}/4\n\n🟢 = Web可用但不能证明App完整解锁`;
  $notification.post("🚀 节点服务体检 V2",`${ip.country||"??"} · ${confirmed}/4 确认可用`,message);
  $done();
})();
