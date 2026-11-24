// Google 登入只負責初次確認身分；日常登入狀態由 Media Archive Session 維持。
(function () {
  let idToken = null;
  let sessionToken = null;
  let signedInUser = null;
  let restoringSession = false;

  const SESSION_TOKEN_KEY = "mediaArchiveSessionToken";
  const SESSION_USER_KEY = "mediaArchiveSessionUser";

  const signInContainer = document.getElementById("googleSignInButton");
  const signInModal = document.getElementById("signInModal");
  const closeSignInModalButton = document.getElementById("closeSignInModal");
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
      signInModal.hidden = true;
      accountName.textContent =
        signedInUser.name || signedInUser.email || "已登入";
    } else {
      accountName.textContent = "";
    }

    window.dispatchEvent(new CustomEvent("google-auth-state-changed", {
      detail: { user: signedInUser }
    }));
  }

  function saveSession(token, user) {
    sessionToken = token;
    signedInUser = user;

    try {
      localStorage.setItem(SESSION_TOKEN_KEY, token);
      localStorage.setItem(SESSION_USER_KEY, JSON.stringify(user));
    } catch (error) {
      sessionToken = null;
      signedInUser = null;
      throw new Error("瀏覽器無法保存登入狀態，請檢查儲存空間或瀏覽器設定。");
    }

    updateAccountUI();
  }

  function clearLocalSession(shouldNotify = true) {
    sessionToken = null;
    signedInUser = null;
    idToken = null;

    try {
      localStorage.removeItem(SESSION_TOKEN_KEY);
      localStorage.removeItem(SESSION_USER_KEY);
    } catch (error) {
      console.warn("無法清除本機登入狀態：", error);
    }

    if (shouldNotify) updateAccountUI();
  }

  window.handleGoogleCredential = async function (response) {
    if (!response || !response.credential) {
      alert("Google 登入失敗，請再試一次。");
      return;
    }

    idToken = response.credential;
    const payload = decodeJwtPayload(idToken);

    if (!payload || !payload.exp ||
        Number(payload.exp) <= Math.floor(Date.now() / 1000)) {
      idToken = null;
      alert("Google 登入憑證無效或已過期，請重新登入。");
      return;
    }

    const user = {
      name: payload.name || "",
      email: payload.email || "",
      picture: payload.picture || ""
    };

    try {
      // 只有這一步使用 Google ID Token，後續操作都改用 Session Token。
      const session = await callSessionApi("createSession", {
        id_token: idToken
      });

      if (!session || !session.session_token) {
        throw new Error("伺服器未能建立登入 Session，請再試一次。");
      }

      idToken = null;
      saveSession(session.session_token, user);

    } catch (error) {
      idToken = null;
      console.error("建立登入 Session 失敗：", error);
      alert(error.message || "登入失敗，請稍後再試。");
    }
  };

  async function restoreSession() {
    if (restoringSession) return;
    restoringSession = true;

    let savedToken = "";
    let savedUser = null;

    try {
      savedToken = localStorage.getItem(SESSION_TOKEN_KEY) || "";
      const userText = localStorage.getItem(SESSION_USER_KEY);
      savedUser = userText ? JSON.parse(userText) : null;
    } catch (error) {
      console.warn("讀取已保存的登入狀態失敗：", error);
    }

    if (!savedToken || !savedUser) {
      clearLocalSession(false);
      restoringSession = false;
      updateAccountUI();
      return;
    }

    // 先暫存憑證，再向伺服器確認 Session 仍有效。
    sessionToken = savedToken;

    try {
      await callFavoriteApi("getFavorites");
      signedInUser = savedUser;
      updateAccountUI();
    } catch (error) {
      console.warn("已保存的 Session 無法使用，清除登入狀態：", error);
      clearLocalSession();
    } finally {
      restoringSession = false;
    }
  }

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

  function showSignInModal() {
    if (signedInUser) return;
    signInModal.hidden = false;
  }

  function hideSignInModal() {
    signInModal.hidden = true;
  }

  closeSignInModalButton.addEventListener("click", hideSignInModal);
  signInModal.addEventListener("click", event => {
    if (event.target === signInModal) hideSignInModal();
  });
  document.addEventListener("keydown", event => {
    if (event.key === "Escape") hideSignInModal();
  });

  signOutButton.addEventListener("click", async function () {
    const tokenToRevoke = sessionToken;

    // 先立即清除本機狀態，避免登出期間仍能操作收藏。
    clearLocalSession();

    if (window.google && google.accounts && google.accounts.id) {
      google.accounts.id.disableAutoSelect();
    }

    if (tokenToRevoke) {
      try {
        await callSessionApi("logout", {
          session_token: tokenToRevoke
        });
      } catch (error) {
        // 即使網路暫時失敗，本機仍會登出；伺服器端 Session 最晚在期限後失效。
        console.warn("伺服器撤銷 Session 失敗：", error);
      }
    }
  });

  // 同一瀏覽器的其他分頁登出時，同步清除本分頁狀態。
  window.addEventListener("storage", event => {
    if (event.key === SESSION_TOKEN_KEY && !event.newValue) {
      sessionToken = null;
      signedInUser = null;
      idToken = null;
      updateAccountUI();
    }
  });

  window.MediaArchiveAuth = {
    getSessionToken: () => sessionToken,
    getUser: () => signedInUser,
    isSignedIn: () => Boolean(sessionToken && signedInUser),
    showSignIn: showSignInModal
  };

  // 先註冊 API，再開始恢復；恢復完成後才通知 app.js。
  restoreSession();
  loadGoogleIdentityServices();
})();
