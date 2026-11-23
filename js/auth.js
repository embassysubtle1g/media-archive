// Google 登入：前端只負責取得 Google ID Token。
// 真正的身分驗證與收藏權限，仍必須由 Apps Script 伺服器端執行。
(function () {
  let idToken = null;
  let signedInUser = null;

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

    if (!payload) {
      idToken = null;
      alert("無法讀取 Google 帳號資訊，請重新登入。");
      return;
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
      callback: window.handleGoogleCredential
    });

    google.accounts.id.renderButton(signInContainer, {
      type: "standard",
      theme: "outline",
      size: "large",
      text: "signin_with",
      shape: "pill",
      locale: "zh-TW"
    });
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

    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }

    updateAccountUI();
  });

  // 提供給後續收藏功能使用；Token 不存入 localStorage。
  window.MediaArchiveAuth = {
    getIdToken: () => idToken,
    getUser: () => signedInUser,
    isSignedIn: () => Boolean(idToken)
  };

  loadGoogleIdentityServices();
})();
