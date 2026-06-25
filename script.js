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

const cloudFileInput = document.querySelector("#cloudFileInput");
const cloudTitleInput = document.querySelector("#cloudTitleInput");
const cloudTagsInput = document.querySelector("#cloudTagsInput");
const cloudUploadButton = document.querySelector("#cloudUploadButton");
const uploadStatus = document.querySelector("#uploadStatus");

const storageKey = "meme-library-v1";
const imagePattern = /\.(png|jpe?g|gif|webp|avif)$/i;

const supabaseUrl = "https://ujvhfuzuxtfzynhgaibx.supabase.co";
const supabaseKey = "sb_publishable_1nYW_q7P4olPQl2gzAJjTA_gGz-_CXH";
const bucketName = "memes";

let memes = [];
let activeId = "";
let saved = loadSaved();

if (folderInput) {
  folderInput.addEventListener("change", (event) => {
    loadLocalFiles([...event.target.files]);
  });
}

if (searchInput) searchInput.addEventListener("input", render);
if (sortSelect) sortSelect.addEventListener("change", render);
if (favoritesOnly) favoritesOnly.addEventListener("change", render);
if (closeDialog) closeDialog.addEventListener("click", () => dialog.close());

if (cloudUploadButton) {
  cloudUploadButton.addEventListener("click", uploadCloudMeme);
}

if (tagInput) {
  tagInput.addEventListener("change", () => {
    const meme = memes.find((item) => item.id === activeId);
    if (!meme) return;

    meme.tags = parseTags(tagInput.value);
    saveMeme(meme);
    render();
  });
}

if (favoriteButton) {
  favoriteButton.addEventListener("click", () => {
    const meme = memes.find((item) => item.id === activeId);
    if (!meme) return;

    meme.favorite = !meme.favorite;
    saveMeme(meme);
    openPreview(meme.id);
    render();
  });
}

if (copyButton) {
  copyButton.addEventListener("click", async () => {
    const meme = memes.find((item) => item.id === activeId);
    if (!meme) return;

    try {
      await navigator.clipboard.writeText(meme.name);
      copyButton.textContent = "已复制";
    } catch {
      copyButton.textContent = "复制失败";
    }

    setTimeout(() => {
      copyButton.textContent = "复制文件名";
    }, 1200);
  });
}

async function uploadCloudMeme() {
  if (!cloudFileInput || !cloudTitleInput || !cloudTagsInput || !uploadStatus || !cloudUploadButton) {
    alert("上传区域没有加载完整，请检查 index.html 里的上传表单。");
    return;
  }

  const file = cloudFileInput.files[0];

  if (!file) {
    uploadStatus.textContent = "先选择一张图片。";
    return;
  }

  if (!file.type.startsWith("image/") && !imagePattern.test(file.name)) {
    uploadStatus.textContent = "请选择图片文件。";
    return;
  }

  const title = cloudTitleInput.value.trim() || file.name.replace(/\.[^.]+$/, "");
  const tags = parseTags(cloudTagsInput.value);
  const safeName = makeSafeFileName(file.name);

  cloudUploadButton.disabled = true;
  uploadStatus.textContent = "正在上传图片...";

  try {
    const uploadResponse = await fetch(
      `${supabaseUrl}/storage/v1/object/${bucketName}/${safeName}`,
      {
        method: "POST",
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
          "Content-Type": file.type || "application/octet-stream",
          "x-upsert": "false",
        },
        body: file,
      }
    );

    if (!uploadResponse.ok) {
      const errorText = await uploadResponse.text();
      throw new Error(`图片上传失败：${errorText}`);
    }

    uploadStatus.textContent = "图片已上传，正在写入资料...";

    const rowResponse = await fetch(`${supabaseUrl}/rest/v1/memes`, {
      method: "POST",
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        title,
        file_path: safeName,
        tags,
      }),
    });

    if (!rowResponse.ok) {
      const errorText = await rowResponse.text();
      throw new Error(`资料写入失败：${errorText}`);
    }

    cloudFileInput.value = "";
    cloudTitleInput.value = "";
    cloudTagsInput.value = "";
    uploadStatus.textContent = "上传成功。";

    await loadCloudMemes();
  } catch (error) {
    uploadStatus.textContent = error.message || "上传失败，请检查 Supabase 权限。";
  } finally {
    cloudUploadButton.disabled = false;
  }
}

async function loadCloudMemes() {
  if (summary) summary.textContent = "正在加载 Supabase meme 库...";

  try {
    const response = await fetch(
      `${supabaseUrl}/rest/v1/memes?select=*&order=created_at.desc`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      }
    );

    if (!response.ok) {
      throw new Error(`Supabase request failed: ${response.status}`);
    }

    const rows = await response.json();

    memes = rows
      .filter((row) => row.file_path && imagePattern.test(row.file_path))
      .map((row) => {
        const id = String(row.id);
        const item = saved[id] || {};
        const publicUrl = `${supabaseUrl}/storage/v1/object/public/${bucketName}/${row.file_path}`;

        return {
          id,
          name: row.title || row.file_path,
          path: row.file_path,
          size: 0,
          modified: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
          url: publicUrl,
          favorite: Boolean(item.favorite),
          tags: Array.isArray(row.tags) ? row.tags : [],
        };
      });

    render();
  } catch (error) {
    memes = [];
    if (summary) {
      summary.textContent = "Supabase 读取失败。请检查 Project URL、Publishable key、RLS 读取规则和表数据。";
    }
    render();
  }
}

function loadLocalFiles(files) {
  memes
    .filter((meme) => meme.url.startsWith("blob:"))
    .forEach((meme) => URL.revokeObjectURL(meme.url));

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

  if (gallery) gallery.innerHTML = "";

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
    date.textContent = meme.modified ? formatDate(meme.modified) : "云端";

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

    if (gallery) gallery.append(card);
  });

  if (summary) {
    summary.textContent = memes.length
      ? `${memes.length} 张 Supabase 图片，当前显示 ${visible.length} 张。`
      : "Supabase meme 表里还没有可显示的图片。";
  }

  if (emptyState) emptyState.hidden = memes.length > 0;
}

function getVisibleMemes() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  return memes
    .filter((meme) => {
      if (favoritesOnly && favoritesOnly.checked && !meme.favorite) return false;
      if (!query) return true;

      return `${meme.name} ${meme.path} ${meme.tags.join(" ")}`
        .toLowerCase()
        .includes(query);
    })
    .sort((a, b) => {
      const sortValue = sortSelect ? sortSelect.value : "newest";

      if (sortValue === "oldest") return a.modified - b.modified;
      if (sortValue === "name") return a.name.localeCompare(b.name, "zh-CN");
      if (sortValue === "favorite") {
        return Number(b.favorite) - Number(a.favorite) || b.modified - a.modified;
      }
      return b.modified - a.modified;
    });
}

function openPreview(id) {
  const meme = memes.find((item) => item.id === id);
  if (!meme || !dialog) return;

  activeId = id;

  if (previewImage) {
    previewImage.src = meme.url;
    previewImage.alt = meme.name;
  }

  if (detailName) detailName.textContent = meme.name;
  if (detailMeta) detailMeta.textContent = `${formatSize(meme.size)} · ${meme.path}`;
  if (tagInput) tagInput.value = meme.tags.join(", ");
  if (favoriteButton) favoriteButton.textContent = meme.favorite ? "取消收藏" : "收藏";

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

function makeSafeFileName(originalName) {
  const extension = originalName.includes(".")
    ? originalName.split(".").pop().toLowerCase()
    : "png";

  const allowedExtensions = ["png", "jpg", "jpeg", "gif", "webp", "avif"];
  const safeExtension = allowedExtensions.includes(extension) ? extension : "png";

  return `${Date.now()}-${crypto.randomUUID()}.${safeExtension}`;
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
  if (!bytes) return "未知大小";
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

loadCloudMemes();
