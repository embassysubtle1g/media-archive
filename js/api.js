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
