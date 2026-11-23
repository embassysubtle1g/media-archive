const peopleList = document.getElementById("peopleList");
const personDetail = document.getElementById("personDetail");
const personWorks = document.getElementById("personWorks");
const pageTitle = document.getElementById("pageTitle");
const backButton = document.getElementById("backButton");
const favoritesPageButton = document.getElementById("favoritesPageButton");
const favoritesAccountArea = document.getElementById("favoritesAccountArea");
const loading = document.getElementById("loading");
const errorMessage = document.getElementById("errorMessage");

let allMedia = [];
let allContentPeople = [];
let allPlaylists = [];
let allPlaylistItems = [];
let people = [];
let relatedDataPromise = null;
let currentCategory = "all";
let favorites = [];
let favoritesBusy = new Set();
let favoritesPromise = Promise.resolve();
let favoritesLoaded = false;
let favoritesLoadStarted = false;
let activePage = "people";
let currentPersonMedia = [];
let currentPersonPlaylists = [];

function updateFavoritesAccountVisibility() {
  favoritesAccountArea.hidden = !(activePage === "favorites" && window.MediaArchiveAuth && window.MediaArchiveAuth.isSignedIn());
}

window.addEventListener("google-auth-state-changed", event => {
  updateFavoritesAccountVisibility();
  if (event.detail && event.detail.user) {
    favoritesLoadStarted = true;
    favoritesLoaded = false;
    favoritesPromise = refreshFavorites().then(() => {
      renderCurrentFavoriteView();
    });
  } else {
    favorites = [];
    favoritesLoaded = false;
    favoritesLoadStarted = false;
    updateFavoriteButtons();
    renderCurrentFavoriteView();
  }
});

function favoriteKey(type, id) {
  return String(id);
}

function findFavorite(type, id) {
  return favorites.find(item => String(type === "media" ? item.media_id : item.playlist_id) === String(id));
}

function createFavoriteButton(type, id) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "favorite-button";
  button.setAttribute("aria-label", "收藏");
  button.addEventListener("click", async event => {
    event.stopPropagation();
    if (!window.MediaArchiveAuth || !window.MediaArchiveAuth.isSignedIn()) {
      if (window.MediaArchiveAuth && window.MediaArchiveAuth.showSignIn) {
        window.MediaArchiveAuth.showSignIn();
      }
      return;
    }
    const key = type + ":" + String(id);
    if (favoritesBusy.has(key)) return;
    favoritesBusy.add(key);
    button.disabled = true;

    // 先更新畫面，避免使用者等待伺服器回應才看到星星變化。
    const previousFavorites = favorites.slice();
    const existing = findFavorite(type, id);

    if (existing) {
      favorites = favorites.filter(item => item !== existing);
    } else {
      const field = type === "media" ? "media_id" : "playlist_id";
      favorites.push({
        favorite_id: "__pending__",
        [field]: id
      });
    }
    updateFavoriteButtons();

    try {
      if (existing) {
        await callFavoriteApi("removeFavorite", { favorite_id: existing.favorite_id });
      } else {
        const field = type === "media" ? "media_id" : "playlist_id";
        await callFavoriteApi("addFavorite", { [field]: id });

        // 新增成功後重新取得正式 favorite_id，供日後取消收藏使用。
        await refreshFavorites();
      }
    } catch (error) {
      favorites = previousFavorites;
      updateFavoriteButtons();
      console.error("收藏操作失敗：", error);
      alert(error.message || "收藏操作失敗，請稍後再試。");
    } finally {
      favoritesBusy.delete(key);
      button.disabled = false;
      updateFavoriteButtons();
      renderCurrentFavoriteView();
    }
  });
  button.dataset.favoriteType = type;
  button.dataset.favoriteId = String(id);
  updateFavoriteButton(button);
  return button;
}

function updateFavoriteButton(button) {
  if (button.id === "favoritesPageButton") {
    button.textContent = "★";
    button.classList.add("is-favorite");
    return;
  }

  const type = button.dataset.favoriteType;
  const id = button.dataset.favoriteId;
  const active = Boolean(findFavorite(type, id));
  button.textContent = active ? "★" : "☆";
  button.classList.toggle("is-favorite", active);
  button.setAttribute("aria-label", active ? "取消收藏" : "加入收藏");
  button.title = active ? "取消收藏" : "加入收藏";
}

function updateFavoriteButtons() {
  document.querySelectorAll(".favorite-button").forEach(updateFavoriteButton);
}

async function refreshFavorites() {
  if (!window.MediaArchiveAuth || !window.MediaArchiveAuth.isSignedIn()) {
    favorites = [];
    updateFavoriteButtons();
    return;
  }
  try {
    const data = await callFavoriteApi("getFavorites");
    favorites = Array.isArray(data) ? data : [];
    favoritesLoaded = true;
    updateFavoriteButtons();
  } catch (error) {
    favoritesLoaded = false;
    favoritesLoadStarted = false;
    console.error("讀取收藏清單失敗：", error);
    alert(error.message || "讀取收藏清單失敗。");
  }
}

const personCategoryNav = document.getElementById("personCategoryNav");

document.addEventListener("DOMContentLoaded", init);
backButton.addEventListener("click", showPeoplePage);
favoritesPageButton.addEventListener("click", () => {
  if (!window.MediaArchiveAuth || !window.MediaArchiveAuth.isSignedIn()) {
    if (window.MediaArchiveAuth && window.MediaArchiveAuth.showSignIn) {
      window.MediaArchiveAuth.showSignIn();
    }
    return;
  }
  showFavoritesPage();
});

async function init() {
  // 保險：若登入狀態已恢復，但登入事件未觸發，主動補載收藏清單。
  if (window.MediaArchiveAuth && window.MediaArchiveAuth.isSignedIn() && !favoritesLoadStarted) {
    favoritesLoadStarted = true;
    favoritesPromise = refreshFavorites();
  }

  loading.style.display = "flex";
  errorMessage.style.display = "none";

  // 首頁只等待 People，避免其他資料表拖住人物列表。
  try {
    people = await callApi("getPeople");
    people = Array.isArray(people) ? people : [];
    renderPeople(people);
  } catch (error) {
    console.error("人物資料載入失敗：", error);
    errorMessage.textContent = error.message || "人物資料載入失敗，請重新整理頁面。";
    errorMessage.style.display = "block";
    loading.style.display = "none";
    return;
  }

  loading.style.display = "none";

  // 其他資料在背景載入，不影響首頁顯示及人物點擊。
  relatedDataPromise = loadRelatedData();
}

async function loadRelatedData() {
  const tasks = [
    ["getMedia", data => { allMedia = Array.isArray(data) ? data : []; }],
    ["getContentPeople", data => { allContentPeople = Array.isArray(data) ? data : []; }],
    ["getPlaylists", data => { allPlaylists = Array.isArray(data) ? data : []; }],
    ["getPlaylistItems", data => { allPlaylistItems = Array.isArray(data) ? data : []; }]
  ];

  await Promise.allSettled(tasks.map(async ([action, save]) => {
    const data = await callApi(action);
    save(data);
  }));
}

function getPersonImagePath(imageURL) {
  const fallbackImage = "./images/暫無圖片.jpg";
  const imageValue = String(imageURL || "").trim();

  if (!imageValue) return fallbackImage;

  try {
    const imagePath = /^https?:\/\//i.test(imageValue)
      ? new URL(imageValue).pathname
      : imageValue.split(/[?#]/, 1)[0];

    const fileName = decodeURIComponent(
      imagePath.split("/").pop().trim()
    );

    return fileName
      ? "./images/" + encodeURIComponent(fileName)
      : fallbackImage;
  } catch (error) {
    console.error("人物圖片網址格式錯誤：", imageURL, error);
    return fallbackImage;
  }
}

function renderPeople(items) {
  peopleList.innerHTML = "";

  if (items.length === 0) {
    peopleList.textContent = "目前沒有人物資料。";
    return;
  }

  items.forEach(person => {
    const card = document.createElement("div");
    card.className = "person-card";

    let image;
    if (person.image_url) {
      image = document.createElement("img");
      image.src = getPersonImagePath(person.image_url);
      image.alt = person.person_name || "人物圖片";
      image.loading = "lazy";
      image.onerror = function() {
        this.onerror = null;
        this.src = "./images/暫無圖片.jpg";
      };
    } else {
      image = createPlaceholder(person.person_name);
    }

    const name = document.createElement("div");
    name.className = "person-name";
    name.textContent = person.person_name || "";

    card.appendChild(image);
    card.appendChild(name);
    card.addEventListener("click", () => showPerson(person));
    peopleList.appendChild(card);
  });
}

function createPlaceholder(name) {
  const placeholder = document.createElement("div");
  placeholder.className = "person-placeholder";
  placeholder.textContent = (name || "?").slice(0, 1);
  return placeholder;
}

async function showPerson(person) {
  activePage = "person";
  updateFavoritesAccountVisibility();
  favoritesPageButton.style.display = "none";
  currentPersonMedia = [];
  currentPersonPlaylists = [];
  currentCategory = "favorites";

  // 若初次讀取收藏失敗，進入人物頁時再補讀一次，不必手動點收藏觸發同步。
  if (window.MediaArchiveAuth && window.MediaArchiveAuth.isSignedIn() && !favoritesLoaded && !favoritesLoadStarted) {
    favoritesLoadStarted = true;
    favoritesPromise = refreshFavorites();
  }

  // 先等作品資料與登入者的收藏清單都載入完成，
  // 再建立星星，避免已收藏內容先顯示空心星星再延遲變實心。
  await Promise.all([
    relatedDataPromise || Promise.resolve(),
    favoritesPromise
  ]);

  const personId = String(person.person_id);
  const links = allContentPeople.filter(item => String(item.person_id) === personId);
  const relatedMedia = links.map(link => {
    const media = allMedia.find(item => String(item.media_id) === String(link.media_id));
    return media ? { ...media, personRole: link.role } : null;
  }).filter(Boolean);

  const mediaIds = new Set(relatedMedia.map(item => String(item.media_id)));
  const playlistIds = new Set(allPlaylistItems
    .filter(item => mediaIds.has(String(item.media_id)))
    .map(item => String(item.playlist_id)));
  const relatedPlaylists = allPlaylists.filter(p => playlistIds.has(String(p.playlist_id)));

  currentPersonMedia = relatedMedia;
  currentPersonPlaylists = relatedPlaylists;

  const favoriteCount =
    relatedMedia.filter(item => Boolean(findFavorite("media", item.media_id))).length +
    relatedPlaylists.filter(item => Boolean(findFavorite("playlist", item.playlist_id))).length;

  const categories = [
    { id: "favorites", label: "已收藏", count: favoriteCount },
    { id: "all", label: "全部作品", count: relatedMedia.length },
    { id: "albums", label: "專輯", count: relatedPlaylists.filter(isAlbum).length },
    { id: "playlists", label: "播放清單", count: relatedPlaylists.filter(isPlaylist).length },
    { id: "music", label: "歌曲／MV", count: relatedMedia.filter(isMusic).length },
    { id: "video", label: "影視作品", count: relatedMedia.filter(isVideo).length }
  ];

  peopleList.style.display = "none";
  personDetail.style.display = "block";
  backButton.style.display = "block";
  pageTitle.textContent = person.person_name || "人物";
  renderPersonCategories(categories, relatedMedia, relatedPlaylists);
  personDetail.classList.remove("page-enter");
  void personDetail.offsetWidth;
  personDetail.classList.add("page-enter");
}

function isAlbum(p) {
  const t = String(p.playlist_type || "").toLowerCase();
  return t.includes("專輯") || t.includes("album");
}
function isPlaylist(p) {
  const t = String(p.playlist_type || "").toLowerCase();
  return t.includes("播放清單") || t.includes("歌單") || t.includes("playlist") || t.includes("list");
}
function isMusic(m) {
  const t = String(m.media_type || "").toLowerCase();
  return ["歌曲","音樂","music","song","mv"].some(v => t.includes(v));
}
function isVideo(m) {
  const t = String(m.media_type || "").toLowerCase();
  return ["影集","戲劇","電影","節目","影片","tv","movie","episode","video"].some(v => t.includes(v));
}

function renderPersonCategories(categories, media, playlists) {
  personCategoryNav.innerHTML = "";
  categories.forEach(category => {
    const button = document.createElement("button");
    button.className = "category-button" + (category.id === currentCategory ? " active" : "");
    button.textContent = category.label + " " + category.count;
    button.addEventListener("click", () => {
      currentCategory = category.id;
      renderPersonCategories(categories, media, playlists);
    });
    personCategoryNav.appendChild(button);
  });
  renderPersonCategoryContent(media, playlists);
}

function renderPersonCategoryContent(media, playlists) {
  personWorks.innerHTML = "";
  personWorks.className = "";
  if (currentCategory === "favorites") {
    renderFavoriteCollection(media, playlists);
    return;
  }
  if (currentCategory === "albums" || currentCategory === "playlists") {
    renderPlaylists(playlists.filter(currentCategory === "albums" ? isAlbum : isPlaylist), media);
    return;
  }
  let selected = media;
  if (currentCategory === "music") selected = media.filter(isMusic);
  if (currentCategory === "video") selected = media.filter(isVideo);
  renderPersonWorks(selected);
}

function renderFavoriteCollection(media, playlists) {
  personWorks.innerHTML = "";
  personWorks.className = "";

  if (!window.MediaArchiveAuth || !window.MediaArchiveAuth.isSignedIn()) {
    personWorks.textContent = "請先使用 Google 帳戶登入，查看你的收藏。";
    personWorks.className = "empty-message";
    return;
  }

  const favoriteMedia = media.filter(item =>
    Boolean(findFavorite("media", item.media_id))
  );
  const favoritePlaylists = playlists.filter(item =>
    Boolean(findFavorite("playlist", item.playlist_id))
  );

  if (!favoriteMedia.length && !favoritePlaylists.length) {
    personWorks.textContent = "目前還沒有收藏內容。";
    personWorks.className = "empty-message";
    return;
  }

  if (favoriteMedia.length) renderPersonWorks(favoriteMedia);
  if (favoritePlaylists.length) renderPlaylists(favoritePlaylists, media);
}

function renderCurrentFavoriteView() {
  if (activePage === "favorites") {
    renderFavoriteCollection(allMedia, allPlaylists);
  } else if (activePage === "person" && currentCategory === "favorites") {
    renderFavoriteCollection(currentPersonMedia, currentPersonPlaylists);
  }
}

async function showFavoritesPage() {
  activePage = "favorites";
  updateFavoritesAccountVisibility();
  favoritesPageButton.style.display = "none";
  peopleList.style.display = "none";
  personDetail.style.display = "block";
  backButton.style.display = "block";
  pageTitle.textContent = "收藏";
  personCategoryNav.innerHTML = "";
  personWorks.innerHTML = '<div class="empty-message">載入收藏中...</div>';

  await Promise.all([
    relatedDataPromise || Promise.resolve(),
    favoritesPromise
  ]);
  renderFavoriteCollection(allMedia, allPlaylists);
}

function renderPlaylists(playlists, personMedia) {
  if (!playlists.length) {
    personWorks.textContent = "目前沒有收錄相關內容。";
    personWorks.className = "empty-message";
    return;
  }
  playlists.forEach(playlist => {
    const card = document.createElement("div");
    card.className = "playlist-card";
    const heading = document.createElement("div");
    heading.className = "playlist-heading";
    const headingContent = document.createElement("div");
    headingContent.className = "playlist-heading-content";
    const title = document.createElement("div");
    title.className = "playlist-title";
    title.textContent = playlist.playlist_name || "未命名專輯／播放清單";
    const meta = document.createElement("span");
    meta.className = "playlist-meta";
    meta.textContent = [playlist.playlist_type, playlist.release_date].filter(Boolean).join("・");
    headingContent.append(title, meta);
    heading.append(headingContent, createFavoriteButton("playlist", playlist.playlist_id));
    const tracks = document.createElement("div");
    tracks.className = "playlist-tracks";
    tracks.hidden = true;

    card.addEventListener("click", () => {
      tracks.hidden = !tracks.hidden;
      if (tracks.hidden || tracks.childElementCount) return;
      const personIds = new Set(personMedia.map(m => String(m.media_id)));
      const items = allPlaylistItems
        .filter(i => String(i.playlist_id) === String(playlist.playlist_id) && personIds.has(String(i.media_id)))
        .sort((a,b) => Number(a.disc_number || 1)-Number(b.disc_number || 1) ||
          Number(a.item_number || 0)-Number(b.item_number || 0));
      items.forEach(item => {
        const media = allMedia.find(m => String(m.media_id) === String(item.media_id));
        if (!media) return;
        const track = document.createElement("div");
        track.className = "playlist-track";
        const trackTitle = document.createElement("span");
        trackTitle.className = "playlist-track-title";
        trackTitle.textContent = (item.item_number ? item.item_number + ". " : "") + (media.title || "未命名作品");
        track.append(trackTitle, createFavoriteButton("media", media.media_id));
        track.addEventListener("click", event => { event.stopPropagation(); openMedia(media); });
        tracks.appendChild(track);
      });
      if (!tracks.childElementCount) tracks.textContent = "目前沒有可顯示的曲目。";
    });
    card.append(heading, tracks);
    personWorks.appendChild(card);
  });
}

function renderPersonWorks(items) {
  personWorks.innerHTML = "";
  personWorks.className = "";
  if (!items.length) {
    personWorks.textContent = "目前尚未收錄這個分類的作品。";
    personWorks.className = "empty-message";
    return;
  }
  items.forEach(media => {
    const work = document.createElement("div");
    work.className = "work";
    const content = document.createElement("div");
    content.className = "work-content";
    const title = document.createElement("div");
    title.className = "work-title";
    title.textContent = media.title || "未命名作品";
    const meta = document.createElement("span");
    meta.className = "work-meta";
    meta.textContent = [media.media_type, media.personRole].filter(Boolean).join("・");
    content.append(title, meta);
    work.append(content, createFavoriteButton("media", media.media_id));
    work.addEventListener("click", () => openMedia(media));
    personWorks.appendChild(work);
  });
}

function openMedia(media) {
  if (media.platform_video_id &&
      String(media.platform || "").toLowerCase().includes("youtube")) {
    openExternal("https://www.youtube.com/watch?v=" +
      encodeURIComponent(media.platform_video_id));
    return;
  }

  const source = String(media.source_id || "").trim();
  if (/^https?:\/\//i.test(source)) {
    openExternal(source);
    return;
  }

  alert("這項作品目前尚未設定播放連結。");
}

function openExternal(url) {
  const isAndroidApp =
    new URLSearchParams(window.location.search).get("app") === "android";

  if (isAndroidApp) {
    window.location.href = url;
  } else {
    window.open(url, "_blank");
  }
}

function showPeoplePage() {
  activePage = "people";
  updateFavoritesAccountVisibility();
  favoritesPageButton.style.display = "inline-flex";
  currentPersonMedia = [];
  currentPersonPlaylists = [];
  personDetail.style.display = "none";
  peopleList.style.display = "flex";
  backButton.style.display = "none";
  pageTitle.textContent = "人物";
  personCategoryNav.innerHTML = "";

  peopleList.classList.remove("page-enter");
  void peopleList.offsetWidth;
  peopleList.classList.add("page-enter");
}
