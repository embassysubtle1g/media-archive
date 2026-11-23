const peopleGrid = document.getElementById("people-grid");
const statusElement = document.getElementById("status");
const peopleCount = document.getElementById("people-count");

function renderPeople(people) {
  peopleGrid.innerHTML = "";

  people.forEach((person) => {
    const card = document.createElement("article");
    card.className = "person-card";

    if (person.image_url) {
      const image = document.createElement("img");
      image.className = "person-image";
      image.src = person.image_url;
      image.alt = person.person_name || "人物圖片";
      image.loading = "lazy";
      image.onerror = () => {
        const placeholder = document.createElement("div");
        placeholder.className = "person-placeholder";
        placeholder.textContent = (person.person_name || "?").slice(0, 1);
        image.replaceWith(placeholder);
      };
      card.appendChild(image);
    } else {
      const placeholder = document.createElement("div");
      placeholder.className = "person-placeholder";
      placeholder.textContent = (person.person_name || "?").slice(0, 1);
      card.appendChild(placeholder);
    }

    const name = document.createElement("h3");
    name.className = "person-name";
    name.textContent = person.person_name || "未命名人物";
    card.appendChild(name);
    peopleGrid.appendChild(card);
  });

  peopleCount.textContent = people.length + " 位";
  statusElement.textContent = people.length ? "" : "目前尚無人物資料。";
}

async function init() {
  try {
    const people = await callApi("getPeople");
    renderPeople(Array.isArray(people) ? people : []);
  } catch (error) {
    statusElement.textContent = error.message;
  }
}

init();
