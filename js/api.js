function callApi(action) {
  return new Promise((resolve, reject) => {
    const apiUrl = window.APP_CONFIG && window.APP_CONFIG.API_URL;

    if (!apiUrl || apiUrl.startsWith("請在這裡")) {
      reject(new Error("尚未設定新版 Apps Script API 網址。"));
      return;
    }

    const callbackName = "mediaArchiveCallback_" + Date.now() + "_" +
      Math.random().toString(36).slice(2);

    const script = document.createElement("script");
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("API 連線逾時，請稍後再試。"));
    }, 15000);

    function cleanup() {
      window.clearTimeout(timeout);
      delete window[callbackName];
      script.remove();
    }

    window[callbackName] = (response) => {
      cleanup();
      if (!response || response.success !== true) {
        reject(new Error(response?.error || "API 回傳資料格式錯誤。"));
        return;
      }
      resolve(response.data);
    };

    script.onerror = () => {
      cleanup();
      reject(new Error("無法連線至資料來源，請檢查 API 網址或部署設定。"));
    };

    script.src = apiUrl + "?action=" + encodeURIComponent(action) +
      "&callback=" + encodeURIComponent(callbackName);
    document.head.appendChild(script);
  });
}


// 透過隱藏 iframe 提交 POST，避免瀏覽器跨網域 CORS 限制。
function callFavoriteApi(action, fields = {}) {
  return new Promise((resolve, reject) => {
    const apiUrl = window.APP_CONFIG && window.APP_CONFIG.API_URL;
    const auth = window.MediaArchiveAuth;
    const idToken = auth && auth.getIdToken ? auth.getIdToken() : "";

    if (!apiUrl) {
      reject(new Error("尚未設定 Apps Script API 網址。"));
      return;
    }
    if (!idToken) {
      reject(new Error("請先使用 Google 帳戶登入。"));
      return;
    }

    const nonce = (window.crypto && crypto.randomUUID)
      ? crypto.randomUUID()
      : Date.now() + "_" + Math.random().toString(36).slice(2);
    const frame = document.createElement("iframe");
    const form = document.createElement("form");
    const frameName = "favoriteApiFrame_" + nonce.replace(/[^a-zA-Z0-9_]/g, "");
    frame.name = frameName;
    frame.style.display = "none";
    frame.setAttribute("aria-hidden", "true");
    form.method = "POST";
    form.action = apiUrl;
    form.target = frameName;
    form.enctype = "application/x-www-form-urlencoded";
    form.style.display = "none";

    const values = { action, id_token: idToken, nonce, ...fields };
    Object.entries(values).forEach(([name, value]) => {
      if (value === undefined || value === null) return;
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = String(value);
      form.appendChild(input);
    });

    let finished = false;
    const cleanup = () => {
      window.removeEventListener("message", onMessage);
      window.clearTimeout(timeout);
      form.remove();
      frame.remove();
    };
    const finish = (callback, value) => {
      if (finished) return;
      finished = true;
      cleanup();
      callback(value);
    };
    const onMessage = event => {
      // Apps Script 的 HtmlService 回應可能經過內部 iframe，
      // 因此不能只用 frame.contentWindow 判斷訊息來源。
      // 每次請求都有獨立 nonce，只接受符合本次 nonce 的回應。
      const payload = event.data;
      if (!payload || typeof payload !== "object" || payload.nonce !== nonce) return;
      if (payload.success !== true) {
        finish(reject, new Error(payload.error || "收藏操作失敗。"));
        return;
      }
      finish(resolve, payload.data);
    };
    const timeout = window.setTimeout(() => {
      finish(reject, new Error("收藏 API 連線逾時，請稍後再試。"));
    }, 20000);

    window.addEventListener("message", onMessage);
    document.body.append(frame, form);
    form.submit();
  });
}
