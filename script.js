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

const intentInput = document.querySelector("#intentInput");
const recommendButton = document.querySelector("#recommendButton");
const recommendationSummary = document.querySelector("#recommendationSummary");
const recommendations = document.querySelector("#recommendations");
const exampleButtons = document.querySelectorAll("[data-example]");

const composerPanel = document.querySelector("#composerPanel");
const memeCanvas = document.querySelector("#memeCanvas");
const topTextInput = document.querySelector("#topTextInput");
const bottomTextInput = document.querySelector("#bottomTextInput");
const renderMemeButton = document.querySelector("#renderMemeButton");
const downloadMemeButton = document.querySelector("#downloadMemeButton");

const storageKey = "meme-library-v1";
const imagePattern = /\.(png|jpe?g|gif|webp|avif)$/i;

const supabaseUrl = "https://ujvhfuzuxtfzynhgaibx.supabase.co";
const supabaseKey = "sb_publishable_1nYW_q7P4olPQl2gzAJjTA_gGz-_CXH";
const bucketName = "memes";

let memes = [];
let activeId = "";
let selectedTemplateId = "";
let saved = loadSaved();

if (folderInput) {
  folderInput.addEventListener("change", (event) => {
    loadLocalFiles([...event.target.files]);
  });
}

if (searchInput) searchInput.addEventListener("input", render);
if (sortSelect) sortSelect.addEventListener("change", render);
if (favoritesOnly) favoritesOnly.addEventListener("change", render);

if (closeDialog && dialog) {
  closeDialog.addEventListener("click", () => dialog.close());
}

if (uploadStatus) {
  uploadStatus.textContent = "上传组件已加载。";
}

if (cloudUploadButton) {
  cloudUploadButton.onclick = uploadCloudMeme;
}

if (recommendationSummary) {
  recommendationSummary.textContent = "推荐组件已加载。输入需求后点击推荐 Top5。";
}

if (recommendButton) {
  recommendButton.onclick = renderRecommendations;
}

if (renderMemeButton) {
  renderMemeButton.onclick = renderSelectedMeme;
}

if (downloadMemeButton) {
  downloadMemeButton.onclick = downloadGeneratedMeme;
}

exampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    if (!intentInput) return;
    intentInput.value = button.dataset.example || "";
    renderRecommendations();
  });
});

if (intentInput) {
  intentInput.addEventListener("keydown", (event) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      renderRecommendations();
    }
  });
}

if (tagInput) {
  tagInput.addEventListener("change", async () => {
    const meme = memes.find((item) => item.id === activeId);
    if (!meme) return;

    const nextTags = parseTags(tagInput.value);
    meme.tags = nextTags;

    try {
      await updateCloudMeme(meme.id, {
        tags: nextTags,
      });

      if (detailMeta) {
        detailMeta.textContent = `${formatSize(meme.size)} · ${meme.path} · 标签已保存`;
      }
    } catch (error) {
      if (detailMeta) {
        detailMeta.textContent = `${formatSize(meme.size)} · ${meme.path} · 标签保存失败`;
      }
    }

    render();
    renderRecommendations();
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
    renderRecommendations();
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
    renderRecommendations();
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
          description: row.description || "",
          useCases: Array.isArray(row.use_cases) ? row.use_cases : [],
          emotion: row.emotion || "",
        };
      });

    render();
    renderRecommendations();
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
        description: "",
        useCases: [],
        emotion: "",
      };
    });

  render();
  renderRecommendations();
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
      renderRecommendations();
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

function renderRecommendations() {
  if (!recommendations || !recommendationSummary) return;

  const query = intentInput ? intentInput.value.trim() : "";
  recommendations.innerHTML = "";

  if (!query) {
    recommendationSummary.textContent = "输入你的想法，系统会从模板库里推荐最合适的梗图。";
    return;
  }

  if (!memes.length) {
    recommendationSummary.textContent = "模板库还没有图片。";
    return;
  }

  const ranked = rankMemes(query).slice(0, 5);

  if (!ranked.length) {
    recommendationSummary.textContent = "没有找到明显匹配的模板，试试换一种说法或补充标签。";
    return;
  }

  recommendationSummary.textContent = `根据“${query}”推荐 ${ranked.length} 个模板。`;

  ranked.forEach((result, index) => {
    const meme = result.meme;

    const card = document.createElement("article");
    card.className = "recommendation-card";

    const button = document.createElement("button");
    button.type = "button";
    button.addEventListener("click", () => selectTemplateForComposer(meme.id));

    const img = document.createElement("img");
    img.src = meme.url;
    img.alt = meme.name;
    img.loading = "lazy";

    const body = document.createElement("div");
    body.className = "recommendation-body";

    const rank = document.createElement("div");
    rank.className = "recommendation-rank";
    rank.textContent = `Top ${index + 1}`;

    const title = document.createElement("div");
    title.className = "recommendation-title";
    title.textContent = meme.name;

    const reason = document.createElement("div");
    reason.className = "recommendation-reason";
    reason.textContent = result.reason;

    body.append(rank, title, reason);
    button.append(img, body);
    card.append(button);
    recommendations.append(card);
  });
}

function rankMemes(query) {
  const normalizedQuery = normalizeText(query);
  const tokens = tokenize(query);

  return memes
    .map((meme) => {
      const tags = meme.tags || [];
      const useCases = meme.useCases || [];

      const fields = [
        meme.name,
        meme.path,
        meme.description,
        meme.emotion,
        ...tags,
        ...useCases,
      ];

      const haystack = normalizeText(fields.join(" "));
      let score = 0;
      const matched = [];

      for (const tag of tags) {
        const normalizedTag = normalizeText(tag);

        if (normalizedTag && normalizedQuery.includes(normalizedTag)) {
          score += 12;
          matched.push(tag);
        }
      }

      for (const useCase of useCases) {
        const normalizedUseCase = normalizeText(useCase);

        if (normalizedUseCase && normalizedQuery.includes(normalizedUseCase)) {
          score += 8;
          matched.push(useCase);
        }
      }

      for (const token of tokens) {
        if (!token) continue;

        if (haystack.includes(token)) {
          score += token.length >= 2 ? 3 : 1;
          matched.push(token);
        }

        if (meme.name && normalizeText(meme.name).includes(token)) {
          score += 2;
        }

        for (const tag of tags) {
          const normalizedTag = normalizeText(tag);

          if (normalizedTag === token) {
            score += 8;
            matched.push(tag);
          }

          if (normalizedTag && (normalizedTag.includes(token) || token.includes(normalizedTag))) {
            score += 4;
            matched.push(tag);
          }
        }
      }

      score += semanticBoost(query, meme);

      if (meme.favorite) score += 0.5;

      return {
        meme,
        score,
        reason: makeReason(matched, meme, score),
      };
    })
    .filter((result) => result.score > 0)
    .sort((a, b) => b.score - a.score || b.meme.modified - a.meme.modified);
}

function semanticBoost(query, meme) {
  const text = normalizeText(query);
  const memeText = normalizeText([
    meme.name,
    meme.description,
    meme.emotion,
    ...(meme.tags || []),
    ...(meme.useCases || []),
  ].join(" "));

  const groups = [
    {
      query: ["ai", "人工智能", "自动", "效率", "偷懒", "手动"],
      meme: ["ai", "人工智能", "效率", "拒绝", "工作流"],
      boost: 5,
    },
    {
      query: ["震惊", "惊讶", "破防", "被吓到", "反应"],
      meme: ["震惊", "惊讶", "反应", "猫", "破防"],
      boost: 5,
    },
    {
      query: ["上班", "老板", "需求", "工作", "加班"],
      meme: ["上班", "老板", "需求", "工作", "加班", "职场"],
      boost: 4,
    },
    {
      query: ["崩溃", "无语", "累", "不想", "受不了"],
      meme: ["崩溃", "无语", "累", "破防", "不想"],
      boost: 4,
    },
  ];

  return groups.reduce((total, group) => {
    const queryHit = group.query.some((word) => text.includes(normalizeText(word)));
    const memeHit = group.meme.some((word) => memeText.includes(normalizeText(word)));
    return total + (queryHit && memeHit ? group.boost : 0);
  }, 0);
}

function makeReason(matched, meme, score) {
  const tags = meme.tags && meme.tags.length ? `标签：${meme.tags.slice(0, 3).join("、")}` : "";
  const uniqueMatched = [...new Set(matched)].slice(0, 3);

  if (uniqueMatched.length) {
    return `匹配关键词：${uniqueMatched.join("、")}${tags ? `；${tags}` : ""}`;
  }

  if (tags) return tags;
  return `综合相似度：${score.toFixed(1)}`;
}

function getVisibleMemes() {
  const query = searchInput ? searchInput.value.trim().toLowerCase() : "";

  return memes
    .filter((meme) => {
      if (favoritesOnly && favoritesOnly.checked && !meme.favorite) return false;
      if (!query) return true;

      return `${meme.name} ${meme.path} ${meme.tags.join(" ")} ${meme.description} ${meme.useCases.join(" ")} ${meme.emotion}`
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

function selectTemplateForComposer(id) {
  const meme = memes.find((item) => item.id === id);
  if (!meme || !composerPanel) return;

  selectedTemplateId = id;
  composerPanel.hidden = false;

  if (topTextInput && !topTextInput.value.trim()) {
    topTextInput.value = "";
  }

  if (bottomTextInput) {
    bottomTextInput.value = intentInput ? intentInput.value.trim() : "";
  }

  renderSelectedMeme();

  composerPanel.scrollIntoView({
    behavior: "smooth",
    block: "start",
  });
}

async function renderSelectedMeme() {
  if (!memeCanvas || !selectedTemplateId) return;

  const meme = memes.find((item) => item.id === selectedTemplateId);
  if (!meme) return;

  const context = memeCanvas.getContext("2d");
  const image = await loadImage(meme.url);

  const canvasSize = 900;
  memeCanvas.width = canvasSize;
  memeCanvas.height = canvasSize;

  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, canvasSize, canvasSize);

  const imageBox = fitImage(image.width, image.height, canvasSize, canvasSize);
  context.drawImage(image, imageBox.x, imageBox.y, imageBox.width, imageBox.height);

  const topText = topTextInput ? topTextInput.value.trim() : "";
  const bottomText = bottomTextInput ? bottomTextInput.value.trim() : "";

  drawMemeText(context, topText, canvasSize / 2, 58, canvasSize - 80, "top");
  drawMemeText(context, bottomText, canvasSize / 2, canvasSize - 70, canvasSize - 80, "bottom");
}

function downloadGeneratedMeme() {
  if (!memeCanvas) return;

  const link = document.createElement("a");
  link.download = `meme-${Date.now()}.png`;
  link.href = memeCanvas.toDataURL("image/png");
  link.click();
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function fitImage(imageWidth, imageHeight, boxWidth, boxHeight) {
  const imageRatio = imageWidth / imageHeight;
  const boxRatio = boxWidth / boxHeight;

  let width = boxWidth;
  let height = boxHeight;

  if (imageRatio > boxRatio) {
    height = boxWidth / imageRatio;
  } else {
    width = boxHeight * imageRatio;
  }

  return {
    width,
    height,
    x: (boxWidth - width) / 2,
    y: (boxHeight - height) / 2,
  };
}

function drawMemeText(context, text, x, y, maxWidth, position) {
  if (!text) return;

  const lines = wrapText(context, text, maxWidth, 52);
  const lineHeight = 62;
  const totalHeight = lines.length * lineHeight;
  const startY = position === "bottom" ? y - totalHeight + lineHeight : y;

  context.textAlign = "center";
  context.textBaseline = "middle";
  context.lineJoin = "round";
  context.font = "700 52px Arial, sans-serif";
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#000000";
  context.lineWidth = 10;

  lines.forEach((line, index) => {
    const lineY = startY + index * lineHeight;
    context.strokeText(line, x, lineY);
    context.fillText(line, x, lineY);
  });
}

function wrapText(context, text, maxWidth, fontSize) {
  context.font = `700 ${fontSize}px Arial, sans-serif`;

  const chunks = String(text)
    .replace(/\s+/g, " ")
    .split(/(?=[\u4e00-\u9fff])|(?<=[\u4e00-\u9fff])|\s+/)
    .filter(Boolean);

  const lines = [];
  let currentLine = "";

  chunks.forEach((chunk) => {
    const testLine = currentLine ? `${currentLine}${chunk}` : chunk;
    const metrics = context.measureText(testLine);

    if (metrics.width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = chunk;
    } else {
      currentLine = testLine;
    }
  });

  if (currentLine) lines.push(currentLine);

  return lines.slice(0, 5);
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

async function updateCloudMeme(id, payload) {
  const response = await fetch(`${supabaseUrl}/rest/v1/memes?id=eq.${id}`, {
    method: "PATCH",
    headers: {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "return=representation",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Supabase update failed: ${errorText}`);
  }

  return response.json();
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

function tokenize(value) {
  const normalized = normalizeText(value);
  const latinTokens = normalized.match(/[a-z0-9]+/g) || [];
  const cjkSequences = normalized.match(/[\u3400-\u9fff]+/g) || [];
  const cjkTokens = [];

  cjkSequences.forEach((sequence) => {
    for (let start = 0; start < sequence.length; start += 1) {
      for (let length = 1; length <= 4; length += 1) {
        const token = sequence.slice(start, start + length);
        if (token.length > 0) {
          cjkTokens.push(token);
        }
      }
    }
  });

  return [...new Set([...latinTokens, ...cjkTokens])].filter((token) => token.length > 0);
}

function normalizeText(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[，。！？、,.!?;；:：()[\]{}"'“”‘’_-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
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
