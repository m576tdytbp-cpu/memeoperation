const folderInput = document.querySelector("#folderInput");
const searchInput = document.querySelector("#searchInput");
const sortSelect = document.querySelector("#sortSelect");
const favoritesOnly = document.querySelector("#favoritesOnly");
const gallery = document.querySelector("#gallery");
const emptyState = document.querySelector("#emptyState");
const summary = document.querySelector("#summary");

const dialog = document.querySelector("#dialog");
const closeDialog = document.querySelector("#closeDialog");
const previewImage = document.querySelector("#previewImage");
const detailName = document.querySelector("#detailName");
const detailMeta = document.querySelector("#detailMeta");
const tagInput = document.querySelector("#tagInput");
const favoriteButton = document.querySelector("#favoriteButton");
const copyButton = document.querySelector("#copyButton");

const storageKey = "meme-library-v1";
const imagePattern = /\.(png|jpe?g|gif|webp|avif)$/i;

let memes = [];
let activeId = "";
let saved = loadSaved();

folderInput.addEventListener("change", (event) => {
  loadFiles([...event.target.files]);
});

searchInput.addEventListener("input", render);
sortSelect.addEventListener("change", render);
favoritesOnly.addEventListener("change", render);
closeDialog.addEventListener("click", () => dialog.close());

tagInput.addEventListener("change", () => {
  const meme = memes.find((item) => item.id === activeId);
  if (!meme) return;

  meme.tags = parseTags(tagInput.value);
  saveMeme(meme);
  render();
});

favoriteButton.addEventListener("click", () => {
  const meme = memes.find((item) => item.id === activeId);
  if (!meme) return;

  meme.favorite = !meme.favorite;
  saveMeme(meme);
  openPreview(meme.id);
  render();
});

copyButton.addEventListener("click", async () => {
  const meme = memes.find((item) => item.id === activeId);
  if (!meme) return;

  await navigator.clipboard.writeText(meme.name);
  copyButton.textContent = "已复制";
  setTimeout(() => {
    copyButton.textContent = "复制文件名";
  }, 1200);
});

function loadFiles(files) {
  memes.forEach((meme) => URL.revokeObjectURL(meme.url));

  memes = files
    .filter((file) => file.type.startsWith("image/") || imagePattern.test(file.name))
    .map((file) => {
      const id = file.webkitRelativePath || file.name;
      const item = saved[id] || {};

      return {
        id,
        name: file.name,
        path: id,
        size: file.size,
        modified: file.lastModified,
        url: URL.createObjectURL(file),
        favorite: Boolean(item.favorite),
        tags: Array.isArray(item.tags) ? item.tags : [],
      };
    });

  render();
}

function render() {
  const visible = getVisibleMemes();
  gallery.innerHTML = "";

  visible.forEach((meme) => {
    const card = document.createElement("article");
    card.className = "card";

    const thumb = document.createElement("button");
    thumb.className = "thumb";
    thumb.type = "button";
    thumb.addEventListener("click", () => openPreview(meme.id));

    const img = document.createElement("img");
    img.src = meme.url;
    img.alt = meme.name;
    img.loading = "lazy";
    thumb.append(img);

    const body = document.createElement("div");
    body.className = "body";

    const name = document.createElement("div");
    name.className = "name";
    name.textContent = meme.name;

    const tags = document.createElement("div");
    tags.className = "tags";
    meme.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "tag";
      chip.textContent = tag;
      tags.append(chip);
    });

    const row = document.createElement("div");
    row.className = "row";

    const date = document.createElement("span");
    date.textContent = formatDate(meme.modified);

    const star = document.createElement("button");
    star.className = meme.favorite ? "star active" : "star";
    star.type = "button";
    star.textContent = "★";
    star.title = meme.favorite ? "取消收藏" : "收藏";
    star.addEventListener("click", () => {
      meme.favorite = !meme.favorite;
      saveMeme(meme);
      render();
    });

    row.append(date, star);
    body.append(name, tags, row);
    card.append(thumb, body);
    gallery.append(card);
  });

  summary.textContent = memes.length
    ? `${memes.length} 张图片，当前显示 ${visible.length} 张。`
    : "选择图片文件夹后开始整理。";

  emptyState.hidden = memes.length > 0;
}

function getVisibleMemes() {
  const query = searchInput.value.trim().toLowerCase();

  return memes
    .filter((meme) => {
      if (favoritesOnly.checked && !meme.favorite) return false;
      if (!query) return true;

      return `${meme.name} ${meme.path} ${meme.tags.join(" ")}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      if (sortSelect.value === "oldest") return a.modified - b.modified;
      if (sortSelect.value === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sortSelect.value === "favorite") {
        return Number(b.favorite) - Number(a.favorite) || b.modified - a.modified;
      }
      return b.modified - a.modified;
    });
}

function openPreview(id) {
  const meme = memes.find((item) => item.id === id);
  if (!meme) return;

  activeId = id;
  previewImage.src = meme.url;
  previewImage.alt = meme.name;
  detailName.textContent = meme.name;
  detailMeta.textContent = `${formatSize(meme.size)} · ${new Date(meme.modified).toLocaleString("zh-CN")}`;
  tagInput.value = meme.tags.join(", ");
  favoriteButton.textContent = meme.favorite ? "取消收藏" : "收藏";

  if (!dialog.open) dialog.showModal();
}

function saveMeme(meme) {
  saved[meme.id] = {
    favorite: meme.favorite,
    tags: meme.tags,
  };
  localStorage.setItem(storageKey, JSON.stringify(saved));
}

function loadSaved() {
  try {
    return JSON.parse(localStorage.getItem(storageKey)) || {};
  } catch {
    return {};
  }
}

function parseTags(value) {
  return value
    .split(/[,，\s]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .slice(0, 12);
}

function formatDate(timestamp) {
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

render();