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
  loadRelatedData();
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
      image.src = person.image_url;
      image.alt = person.person_name || "人物圖片";
      image.loading = "lazy";
      image.onerror = function() {
        this.onerror = null;
        this.replaceWith(createPlaceholder(person.person_name));
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

function showPerson(person) {
  if (allContentPeople.length === 0 && allMedia.length === 0) {
    alert("人物作品資料仍在載入，請稍後再試。");
    return;
  }

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
    meta.textContent = [media.media_type, media.personRole].filter(Boolean).join("・");
    work.appendChild(meta);

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
  personDetail.style.display = "none";
  peopleList.style.display = "flex";
  backButton.style.display = "none";
  pageTitle.textContent = "人物";

  peopleList.classList.remove("page-enter");
  void peopleList.offsetWidth;
  peopleList.classList.add("page-enter");
}
