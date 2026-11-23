// Google 登入：前端只負責取得 Google ID Token。
// 真正的身分驗證與收藏權限，仍必須由 Apps Script 伺服器端執行。
(function () {
  let idToken = null;
  let signedInUser = null;
  const SESSION_TOKEN_KEY = "mediaArchiveGoogleIdToken";
  let restoredSession = false;

  const signInContainer = document.getElementById("googleSignInButton");
  const signedInArea = document.getElementById("signedInArea");
  const accountName = document.getElementById("accountName");
  const signOutButton = document.getElementById("signOutButton");

  function decodeJwtPayload(token) {
    try {
      const payload = token.split(".")[1]
        .replace(/-/g, "+")
        .replace(/_/g, "/");
      const padded = payload + "=".repeat((4 - payload.length % 4) % 4);
      return JSON.parse(atob(padded));
    } catch (error) {
      console.error("無法讀取 Google 登入資訊：", error);
      return null;
    }
  }

  function updateAccountUI() {
    if (signedInUser) {
      signInContainer.hidden = true;
      signedInArea.hidden = false;
      accountName.textContent = signedInUser.name || signedInUser.email || "已登入";
    } else {
      signInContainer.hidden = false;
      signedInArea.hidden = true;
      accountName.textContent = "";
    }

    window.dispatchEvent(new CustomEvent("google-auth-state-changed", {
      detail: { user: signedInUser }
    }));
  }

  window.handleGoogleCredential = function (response) {
    if (!response || !response.credential) {
      alert("Google 登入失敗，請再試一次。");
      return;
    }

    idToken = response.credential;
    const payload = decodeJwtPayload(idToken);

    if (!payload || !payload.exp || Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
      idToken = null;
      alert("Google 登入憑證無效或已過期，請重新登入。");
      return;
    }

    // 僅保存在目前分頁的工作階段；關閉分頁後會清除。
    try {
      sessionStorage.setItem(SESSION_TOKEN_KEY, idToken);
    } catch (error) {
      console.warn("無法保存本分頁登入狀態：", error);
    }

    // 這裡的資料只用來顯示帳號；不可拿來作為收藏 API 的授權依據。
    signedInUser = {
      name: payload.name || "",
      email: payload.email || "",
      picture: payload.picture || ""
    };

    updateAccountUI();
  };

  function initializeGoogleSignIn() {
    const clientId = window.APP_CONFIG && window.APP_CONFIG.GOOGLE_CLIENT_ID;

    if (!clientId) {
      signInContainer.textContent = "尚未設定 Google 登入";
      return;
    }

    if (!window.google || !google.accounts || !google.accounts.id) {
      signInContainer.textContent = "Google 登入服務載入失敗";
      return;
    }

    google.accounts.id.initialize({
      client_id: clientId,
      callback: window.handleGoogleCredential,
      auto_select: true
    });

    google.accounts.id.renderButton(signInContainer, {
      type: "standard",
      theme: "outline",
      size: "medium",
      text: "signin_with",
      shape: "pill",
      locale: "zh-TW"
    });

    // 若本分頁已恢復有效工作階段，就不再額外彈出 Google 登入提示。
    if (!restoredSession) {
      google.accounts.id.prompt();
    }
  }

  function loadGoogleIdentityServices() {
    const script = document.createElement("script");
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.defer = true;
    script.onload = initializeGoogleSignIn;
    script.onerror = function () {
      signInContainer.textContent = "無法載入 Google 登入";
    };
    document.head.appendChild(script);
  }

  signOutButton.addEventListener("click", function () {
    idToken = null;
    signedInUser = null;
    restoredSession = false;
    try {
      sessionStorage.removeItem(SESSION_TOKEN_KEY);
    } catch (error) {
      console.warn("無法清除本分頁登入狀態：", error);
    }

    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }

    updateAccountUI();
  });

  // 嘗試恢復目前分頁的登入狀態。Token 有效期限由 Google 的 exp 欄位判斷，
  // 真正的 Token 驗證仍由 Apps Script 伺服器端負責。
  try {
    const savedToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
    if (savedToken) {
      const payload = decodeJwtPayload(savedToken);
      if (payload && Number(payload.exp) > Math.floor(Date.now() / 1000)) {
        idToken = savedToken;
        signedInUser = {
          name: payload.name || "",
          email: payload.email || "",
          picture: payload.picture || ""
        };
        restoredSession = true;
      } else {
        sessionStorage.removeItem(SESSION_TOKEN_KEY);
      }
    }
  } catch (error) {
    console.warn("無法恢復本分頁登入狀態：", error);
  }

  // defer 載入的 app.js 會先註冊事件監聽，再於 DOMContentLoaded 時收到恢復結果。
  if (restoredSession) {
    document.addEventListener("DOMContentLoaded", updateAccountUI, { once: true });
  }

  window.MediaArchiveAuth = {
    getIdToken: () => idToken,
    getUser: () => signedInUser,
    isSignedIn: () => Boolean(idToken)
  };

  loadGoogleIdentityServices();
})();
