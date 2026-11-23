const peopleList = document.getElementById("peopleList");
const personDetail = document.getElementById("personDetail");
const personWorks = document.getElementById("personWorks");
const pageTitle = document.getElementById("pageTitle");
const backButton = document.getElementById("backButton");
const loading = document.getElementById("loading");
const errorMessage = document.getElementById("errorMessage");

let allMedia = [];
let allContentPeople = [];
let allPlaylists = [];
let allPlaylistItems = [];
let people = [];

document.addEventListener("DOMContentLoaded", init);
backButton.addEventListener("click", showPeoplePage);

async function init() {
  loading.style.display = "flex";
  errorMessage.style.display = "none";

  try {
    // 一次讀取人物及其關聯資料，點入人物時即可立即顯示作品。
    const results = await Promise.all([
      callApi("getPeople"),
      callApi("getMedia"),
      callApi("getContentPeople"),
      callApi("getPlaylists"),
      callApi("getPlaylistItems")
    ]);

    people = Array.isArray(results[0]) ? results[0] : [];
    allMedia = Array.isArray(results[1]) ? results[1] : [];
    allContentPeople = Array.isArray(results[2]) ? results[2] : [];
    allPlaylists = Array.isArray(results[3]) ? results[3] : [];
    allPlaylistItems = Array.isArray(results[4]) ? results[4] : [];

    renderPeople(people);
  } catch (error) {
    console.error("資料載入失敗：", error);
    errorMessage.textContent = error.message || "資料載入失敗，請重新整理頁面。";
    errorMessage.style.display = "block";
  } finally {
    loading.style.display = "none";
  }
}

function renderPeople(items) {
  peopleList.innerHTML = "";

  items.forEach(person => {
    const card = document.createElement("div");
    card.className = "person-card";

    let image;
    if (person.image_url) {
      image = document.createElement("img");
      image.src = person.image_url;
      image.alt = person.person_name || "人物圖片";
      image.loading = "lazy";
      image.onerror = function() {
        this.onerror = null;
        const placeholder = createPlaceholder(person.person_name);
        this.replaceWith(placeholder);
      };
    } else {
      image = createPlaceholder(person.person_name);
    }

    const name = document.createElement("div");
    name.className = "person-name";
    name.textContent = person.person_name || "未命名人物";

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

function showPerson(person) {
  const personId = String(person.person_id);

  const links = allContentPeople.filter(
    item => String(item.person_id) === personId
  );

  const relatedMedia = links.map(link => {
    const media = allMedia.find(
      item => String(item.media_id) === String(link.media_id)
    );
    return media ? { ...media, personRole: link.role } : null;
  }).filter(Boolean);

  peopleList.style.display = "none";
  personDetail.style.display = "block";
  backButton.style.display = "block";
  pageTitle.textContent = person.person_name || "人物";

  renderPersonWorks(relatedMedia);
  personDetail.classList.remove("page-enter");
  void personDetail.offsetWidth;
  personDetail.classList.add("page-enter");
}

function renderPersonWorks(items) {
  personWorks.innerHTML = "";

  if (items.length === 0) {
    personWorks.textContent = "目前尚未收錄這個人物的作品。";
    return;
  }

  items.forEach(media => {
    const work = document.createElement("div");
    work.className = "work";
    work.textContent = media.title || "未命名作品";

    const meta = document.createElement("span");
    meta.className = "work-meta";
    const details = [media.media_type, media.personRole].filter(Boolean);
    meta.textContent = details.join("・");
    work.appendChild(meta);

    work.addEventListener("click", () => openMedia(media));
    personWorks.appendChild(work);
  });
}

function openMedia(media) {
  // 有 YouTube 影片 ID 時，直接開啟對應影片。
  if (media.platform_video_id && String(media.platform || "").toLowerCase().includes("youtube")) {
    const url = "https://www.youtube.com/watch?v=" +
      encodeURIComponent(media.platform_video_id);
    openExternal(url);
    return;
  }

  // 其他平台若 source_id 本身是網址，也可直接開啟。
  const source = String(media.source_id || "").trim();
  if (/^https?:\/\//i.test(source)) {
    openExternal(source);
    return;
  }

  // 尚未設定播放來源時，先不導向錯誤網址。
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
  personDetail.style.display = "none";
  peopleList.style.display = "flex";
  backButton.style.display = "none";
  pageTitle.textContent = "人物";

  peopleList.classList.remove("page-enter");
  void peopleList.offsetWidth;
  peopleList.classList.add("page-enter");
}
