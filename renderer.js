// ===== 心动伴侣 - 渲染进程核心逻辑 =====

// 全局数据
let appData = null;
let currentMood = 'happy';
let currentTestIndex = 0;
let testAnswers = [];
let selectedWishTab = 'whisper';
let currentDiaryAuthor = 'me';
let currentWhisperSender = 'me';
let weatherLoading = false;

// ===== 数据管理 =====
// Electron 下用主进程文件存储；浏览器（Vercel）下用 localStorage
const LOCAL_DATA_KEY = 'heartbeat-data-v1';

function defaultData() {
  const base = window.HeartbeatDefaults ? window.HeartbeatDefaults : {};
  return JSON.parse(JSON.stringify(base));
}

function mergeWithDefaults(data) {
  const base = defaultData();
  if (!data || typeof data !== 'object') return base;
  return {
    ...base,
    ...data,
    profile: { ...base.profile, ...(data.profile || {}) },
    binding: { ...base.binding, ...(data.binding || {}) },
    account: { ...base.account, ...(data.account || {}) },
    chat: { ...base.chat, ...(data.chat || {}) },
    settings: { ...base.settings, ...(data.settings || {}) }
  };
}

function createBrowserStorage() {
  return {
    async getData() {
      try {
        const raw = localStorage.getItem(LOCAL_DATA_KEY);
        return mergeWithDefaults(raw ? JSON.parse(raw) : null);
      } catch (e) {
        return defaultData();
      }
    },
    async saveData(data) {
      try {
        localStorage.setItem(LOCAL_DATA_KEY, JSON.stringify(data));
        return true;
      } catch (e) {
        console.error('本地保存失败:', e);
        return false;
      }
    },
    async exportData() {
      const blob = new Blob([JSON.stringify(appData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `心动伴侣数据_${new Date().toISOString().split('T')[0]}.json`;
      a.click();
      URL.revokeObjectURL(url);
      return { success: true };
    },
    async importData() {
      return new Promise(resolve => {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'application/json,.json';
        input.onchange = () => {
          const file = input.files && input.files[0];
          if (!file) { resolve({ success: false, canceled: true }); return; }
          const reader = new FileReader();
          reader.onload = () => {
            try {
              resolve({ success: true, data: JSON.parse(reader.result) });
            } catch (e) {
              resolve({ success: false, error: '文件格式不正确' });
            }
          };
          reader.readAsText(file);
        };
        input.click();
      });
    }
  };
}

const storageAPI = window.heartbeatAPI || createBrowserStorage();

async function loadAppData() {
  appData = mergeWithDefaults(await storageAPI.getData());
  return appData;
}

async function saveAppData() {
  await storageAPI.saveData(appData);
}

function cloud() {
  return window.HeartbeatCloud || null;
}

function cloudBound() {
  return !!(cloud() && cloud().isBound && cloud().isBound());
}

function cloudSignedIn() {
  const c = cloud();
  const info = c && c.getState ? c.getState() : null;
  return !!(info && info.user);
}

function cloudInfo() {
  const c = cloud();
  return (c && c.getState) ? c.getState() : null;
}

// 云端写失败的统一提示（本地乐观更新已经生效，失败只提示不阻断）
function reportCloudError(prefix) {
  return (e) => showToast(`${prefix}：${e.message || '网络错误'}`, 'error');
}

// ===== 提示框 =====
function showToast(message, type = 'success') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => {
    toast.classList.remove('show');
  }, 2500);
}

// ===== 弹窗 =====
function showModal(title, bodyHTML) {
  document.getElementById('modalTitle').textContent = title;
  document.getElementById('modalBody').innerHTML = bodyHTML;
  document.getElementById('modal').classList.add('active');
}

function closeModal() {
  document.getElementById('modal').classList.remove('active');
}

// ===== 飘浮爱心背景 =====
function createFloatingHearts() {
  const hearts = ['❤️', '💖', '💕', '💗', '💝', '💘', '🩷'];
  const container = document.getElementById('heartsBg');
  for (let i = 0; i < 15; i++) {
    const heart = document.createElement('div');
    heart.className = 'floating-heart';
    heart.textContent = hearts[Math.floor(Math.random() * hearts.length)];
    heart.style.left = Math.random() * 100 + '%';
    heart.style.animationDelay = Math.random() * 8 + 's';
    heart.style.animationDuration = (6 + Math.random() * 6) + 's';
    heart.style.fontSize = (16 + Math.random() * 20) + 'px';
    container.appendChild(heart);
  }
}

// ===== 页面导航 =====
function navigateTo(pageName) {
  // 更新侧边栏
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.toggle('active', item.dataset.page === pageName);
  });
  // 更新页面
  document.querySelectorAll('.page').forEach(page => {
    page.classList.toggle('active', page.id === `page-${pageName}`);
  });

  // 切换到对应页面时刷新数据
  if (pageName === 'home') renderHome();
  if (pageName === 'chat') openChatPage();
  if (pageName === 'bind') renderBind();
  if (pageName === 'anniversary') renderAnniversaries();
  if (pageName === 'diary') renderDiaries();
  if (pageName === 'interact') renderInteract();
  if (pageName === 'settings') renderSettings();
}

// ===== 首页 =====
function renderHome() {
  const profile = appData.profile;
  const startDate = new Date(profile.loveStartDate);
  const today = new Date();
  const diffTime = today - startDate;
  const diffDays = Math.max(0, Math.floor(diffTime / (1000 * 60 * 60 * 24)));

  document.getElementById('loveDays').textContent = diffDays;
  document.getElementById('loveDetail').textContent =
    `从 ${startDate.getFullYear()}年${startDate.getMonth() + 1}月${startDate.getDate()}日 到今天`;

  // 日期
  const dateStr = today.toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long'
  });
  document.getElementById('homeDate').textContent = dateStr;

  // 统计
  document.getElementById('statDiary').textContent = appData.diaries.length;
  document.getElementById('statAnniversary').textContent = appData.anniversaries.length;
  document.getElementById('statWhisper').textContent = appData.whispers.length;
  document.getElementById('statWish').textContent = activeWishes().length;

  // 每日情话
  showDailyQuote();

  // TA 状态
  renderPartnerStatus();

  // 首页扩展模块（心情 / 今日推荐 / 心愿 / 相册 / 同屏）
  renderHomeExtras();
}

// 情话库
const loveQuotes = [
  { text: "遇见你，是我此生最美的意外。", author: "心动语录" },
  { text: "我喜欢你，从眉眼到心底。", author: "心动语录" },
  { text: "世界上最幸福的事，就是喜欢的人也刚好喜欢你。", author: "心动语录" },
  { text: "你的名字，是我见过最短的情诗。", author: "心动语录" },
  { text: "和你在一起的每一天，都是情人节。", author: "心动语录" },
  { text: "我不是在等你，我只是还没遇到比你更好的人。", author: "心动语录" },
  { text: "喜欢你，是我做过最勇敢的事。", author: "心动语录" },
  { text: "你是我枯燥生活里的糖，是我平淡日子里的光。", author: "心动语录" },
  { text: "想把世界上最好的都给你，却发现世界上最好的就是你。", author: "心动语录" },
  { text: "你笑起来真好看，像春天的花一样。", author: "心动语录" },
  { text: "这辈子最疯狂的事，就是爱上了你。", author: "心动语录" },
  { text: "你是我猜不到的不知所措，我是你想不到的无关痛痒。", author: "心动语录" },
  { text: "我愿意用我所有的桃花，换一个对的你。", author: "心动语录" },
  { text: "你是我的今天，以及所有的明天。", author: "心动语录" },
  { text: "喜欢一个人，就是在一起很开心；爱一个人，就是即使不开心，也想在一起。", author: "心动语录" }
];

function showDailyQuote() {
  const quote = loveQuotes[Math.floor(Math.random() * loveQuotes.length)];
  document.getElementById('dailyQuote').textContent = `"${quote.text}"`;
  document.getElementById('dailyQuoteAuthor').textContent = `—— ${quote.author}`;
}

// ===== 首页：心情 / 今日推荐 / 心愿 / 相册 / 同屏 =====
const HOME_MOODS = [
  { key: 'happy', emoji: '😊', label: '开心' },
  { key: 'miss', emoji: '🥰', label: '想你' },
  { key: 'tired', emoji: '😴', label: '疲惫' },
  { key: 'sad', emoji: '😢', label: '难过' },
  { key: 'angry', emoji: '😤', label: '生气' },
  { key: 'hope', emoji: '🌈', label: '期待' }
];

function todayDateKey() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function renderMoodBar() {
  const label = document.getElementById('moodTodayText');
  if (!label) return;
  const today = todayDateKey();
  const saved = appData.profile.moodToday;
  const current = saved && saved.date === today ? saved.mood : null;

  document.querySelectorAll('#moodChips .mood-chip').forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.mood === current);
  });

  const hit = HOME_MOODS.find(m => m.key === current);
  label.textContent = hit ? `今天 ${hit.emoji} ${hit.label}` : '今天还没有记录心情哦';
}

window.setMood = function (mood) {
  appData.profile.moodToday = { date: todayDateKey(), mood };
  saveAppData();
  renderMoodBar();
  showToast('今日心情已记录 💗');
};

// 今日推荐
const DAILY_PICKS = [
  { emoji: '🍲', title: '一起吃顿火锅', desc: '点一份双人套餐，把喜欢的菜都下进锅里。', tag: '美食约会' },
  { emoji: '🎬', title: '在家看一部电影', desc: '关掉灯，准备一桶爆米花，选一部心动电影。', tag: '居家约会' },
  { emoji: '🌳', title: '去公园散散步', desc: '傍晚的风很温柔，牵着手走一圈吧。', tag: '户外约会' },
  { emoji: '🧋', title: '买杯奶茶慢慢逛', desc: '一人一杯，边走边聊今天发生的小事。', tag: '街头约会' },
  { emoji: '🍳', title: '一起做一顿晚饭', desc: '分工洗菜和炒菜，把厨房变成小剧场。', tag: '居家约会' },
  { emoji: '📷', title: '拍一组情侣照片', desc: '挑个好看的光线，把今天的样子留下来。', tag: '记录日常' },
  { emoji: '🎡', title: '去坐一次摩天轮', desc: '在最高点说一句只有你们听得见的话。', tag: '浪漫约会' },
  { emoji: '🛍️', title: '一起逛超市', desc: '买点零食和水果，顺便计划下周的三餐。', tag: '生活日常' }
];
let dailyPickIndex = null;

function renderDailyPick(force) {
  const emojiEl = document.getElementById('dailyPickEmoji');
  if (!emojiEl) return;
  if (dailyPickIndex === null || force) {
    if (force) {
      dailyPickIndex = Math.floor(Math.random() * DAILY_PICKS.length);
    } else {
      const d = new Date();
      const seed = d.getFullYear() * 372 + (d.getMonth() + 1) * 31 + d.getDate();
      dailyPickIndex = seed % DAILY_PICKS.length;
    }
  }
  const pick = DAILY_PICKS[dailyPickIndex];
  emojiEl.textContent = pick.emoji;
  document.getElementById('dailyPickTitle').textContent = pick.title;
  document.getElementById('dailyPickDesc').textContent = pick.desc;
  document.getElementById('dailyPickTag').textContent = pick.tag;
}

// 心愿清单（首页模块）
let wishFilter = 'all';
let newWishAuthor = 'me';

// 本地有效心愿（不含删除墓碑）
function activeWishes() {
  return (appData.wishes || []).filter(w => !w.deleted);
}

// 心愿写入云端（未绑定时只保留本地演示数据）
function syncWish(wish, isNew) {
  if (!cloudBound()) return;
  const c = cloud();
  Promise.resolve(isNew ? c.createWish(wish) : c.updateWish(wish))
    .catch(reportCloudError('心愿同步失败'));
}

function renderWishModule() {
  const listEl = document.getElementById('wishModuleList');
  if (!listEl) return;
  const emptyEl = document.getElementById('wishModuleEmpty');

  const active = activeWishes();
  const total = active.length;
  const doneCount = active.filter(w => w.done).length;
  document.getElementById('wishProgressText').textContent = `${doneCount} / ${total} 已完成`;
  document.getElementById('wishProgressFill').style.width = total ? `${(doneCount / total) * 100}%` : '0%';
  document.getElementById('navWishMeta').textContent = `${doneCount} / ${total} 完成`;

  let items = appData.wishes.map((w, i) => ({ ...w, index: i })).filter(w => !w.deleted);
  if (wishFilter === 'active') items = items.filter(w => !w.done);
  if (wishFilter === 'done') items = items.filter(w => w.done);
  items.sort((a, b) => (a.done === b.done ? (b.createdAt || 0) - (a.createdAt || 0) : (a.done ? 1 : -1)));

  if (!items.length) {
    listEl.innerHTML = '';
    emptyEl.style.display = 'block';
    return;
  }
  emptyEl.style.display = 'none';

  listEl.innerHTML = items.map(w => `
    <div class="wish-item ${w.done ? 'done' : ''}">
      <div class="wish-checkbox ${w.done ? 'checked' : ''}" onclick="toggleWishModule(${w.index})">${w.done ? '✓' : ''}</div>
      <span class="wish-text">${escapeHtml(w.text)}</span>
      <span class="author-badge">${escapeHtml(authorName(w.author))}</span>
      <button class="wish-delete" onclick="deleteWishModule(${w.index})">🗑</button>
    </div>
  `).join('');
}

window.toggleWishModule = function (index) {
  const wish = appData.wishes[index];
  if (!wish) return;
  wish.done = !wish.done;
  wish.updatedAt = Date.now();
  saveAppData();
  renderWishModule();
  renderWishes();
  renderScreenShared();
  if (wish.done) showToast('心愿达成！🎉');
  syncWish(wish, false);
};

window.deleteWishModule = function (index) {
  const wish = appData.wishes[index];
  if (!wish) return;
  // 同步场景下不能直接 splice，改成墓碑标记，让另一端也能感知到删除
  wish.deleted = true;
  wish.updatedAt = Date.now();
  saveAppData();
  renderWishModule();
  renderWishes();
  renderScreenShared();
  showToast('心愿已删除');
  syncWish(wish, false);
};

function addWishModule() {
  const input = document.getElementById('wishModuleInput');
  const text = input.value.trim();
  if (!text) { showToast('请输入心愿内容', 'error'); return; }

  const now = Date.now();
  const wish = {
    id: `w-${now}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    done: false,
    deleted: false,
    author: newWishAuthor,
    createdAt: now,
    updatedAt: now
  };
  appData.wishes.push(wish);
  saveAppData();
  input.value = '';
  renderWishModule();
  renderWishes();
  renderScreenShared();
  showToast('心愿已添加 ⭐');
  syncWish(wish, true);
}

// ===== 共享数据补齐 =====
function newLocalId(prefix) {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

// 给历史数据补齐云端需要的 id / 时间字段
function normalizeSharedData() {
  let changed = false;

  if (!Array.isArray(appData.wishes)) { appData.wishes = []; changed = true; }
  appData.wishes.forEach(w => {
    if (!w.id) {
      w.id = `w-${w.createdAt || Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      changed = true;
    }
    if (typeof w.updatedAt !== 'number') {
      w.updatedAt = Number(w.createdAt) || Date.now();
      changed = true;
    }
    if (typeof w.deleted !== 'boolean') {
      w.deleted = false;
      changed = true;
    }
    if (w.author !== 'me' && w.author !== 'partner') {
      w.author = 'me';
      changed = true;
    }
  });

  [['anniversaries', 'a'], ['diaries', 'd'], ['whispers', 's']].forEach(([key, prefix]) => {
    if (!Array.isArray(appData[key])) { appData[key] = []; changed = true; }
    appData[key].forEach(item => {
      if (!item.id) { item.id = newLocalId(prefix); changed = true; }
      if (typeof item.createdAt !== 'number') {
        item.createdAt = item.date ? new Date(item.date).getTime() || Date.now() : Date.now();
        changed = true;
      }
    });
  });

  if (changed) saveAppData();
}

// ===== 心动聊天 =====
function ensureChatData() {
  if (!appData.chat) appData.chat = { clientId: '', messages: [] };
  if (!Array.isArray(appData.chat.messages)) appData.chat.messages = [];
  if (!appData.chat.clientId) {
    const info = cloud() ? cloud().getState() : null;
    appData.chat.clientId = (info && info.user && info.user.id)
      ? info.user.id
      : `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    saveAppData();
  }
  return appData.chat;
}

function chatMessages() {
  return (appData.chat.messages || [])
    .filter(m => !m.deleted)
    .sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
}

function isChatPageActive() {
  const page = document.getElementById('page-chat');
  return !!page && page.classList.contains('active');
}

function chatTimeText(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
  if (d.toDateString() === now.toDateString()) return time;
  return `${d.getMonth() + 1}-${d.getDate()} ${time}`;
}

function renderChatBadge() {
  const badge = document.getElementById('navChatBadge');
  if (!badge) return;
  const chat = appData.chat || { clientId: '', messages: [] };
  const unread = (chat.messages || []).filter(m => m.senderId !== chat.clientId && !m.readAt && !m.deleted).length;
  badge.textContent = String(unread);
  badge.style.display = unread ? 'inline-block' : 'none';
}

function renderChatPeerStatus() {
  const el = document.getElementById('chatPeerStatus');
  if (!el) return;
  const c = cloud();
  const info = c ? c.getState() : null;
  const configured = c && c.isConfigured && c.isConfigured();
  const bound = info && info.pairing && info.pairing.status === 'active';

  if (!configured) {
    el.textContent = '本地演示模式 · 配置 Supabase 后可实时聊天';
  } else if (!info || !info.user) {
    el.textContent = '登录后即可实时聊天';
  } else if (!bound) {
    el.textContent = '绑定后即可实时聊天';
  } else if (info.realtime === 'SUBSCRIBED') {
    el.textContent = '实时同步中 · 对方发消息会立即出现';
  } else if (info.realtime === 'CHANNEL_ERROR' || info.realtime === 'TIMED_OUT') {
    el.textContent = '实时连接异常，正在重连...';
  } else {
    el.textContent = '正在连接实时同步...';
  }

  const nameEl = document.getElementById('chatPeerName');
  if (nameEl) nameEl.textContent = appData.profile.partnerName || 'TA';
}

function renderChat(forceScroll = false) {
  const listEl = document.getElementById('chatMessages');
  if (!listEl) return;
  const chat = ensureChatData();
  const items = chatMessages();
  const nearBottom = forceScroll || listEl.scrollHeight - listEl.scrollTop - listEl.clientHeight <= 60;

  listEl.innerHTML = items.length
    ? items.map(m => {
      const mine = m.senderId === chat.clientId;
      const status = mine
        ? `<span class="msg-status ${m.readAt ? 'read' : 'unread'}">${m.readAt ? '已读' : '未读'}</span>`
        : '';
      return `
        <div class="chat-message ${mine ? 'user-message' : ''}">
          <div class="chat-avatar">${mine ? '💖' : '🧑‍🤝‍🧑'}</div>
          <div class="chat-bubble-wrap">
            <div class="chat-bubble">${escapeHtml(m.text)}</div>
            <div class="chat-time">${chatTimeText(m.createdAt)} ${status}</div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="love-chat-empty">还没有聊天记录，先说声晚安吧 🌙</div>';

  renderChatPeerStatus();
  renderChatBadge();
  if (nearBottom) listEl.scrollTop = listEl.scrollHeight;
}

// 打开聊天页时，把TA发来的未读消息标记为已读，并通过 Realtime 回传给对方
function markPartnerMessagesRead() {
  const chat = ensureChatData();
  const now = Date.now();
  const ids = [];
  chat.messages.forEach(m => {
    if (m.senderId !== chat.clientId && !m.deleted && !m.readAt) {
      m.readAt = now;
      ids.push(m.id);
    }
  });
  return ids;
}

function openChatPage() {
  ensureChatData();
  renderChat();
  const unreadIds = markPartnerMessagesRead();
  if (unreadIds.length) {
    saveAppData();
    renderChat();
    if (cloudBound()) {
      cloud().markMessagesRead(unreadIds).catch(e => {
        showToast('已读回执同步失败：' + e.message, 'error');
      });
    }
  }
}

function sendChatMessage() {
  const input = document.getElementById('chatInput');
  const text = (input.value || '').trim();
  if (!text) { showToast('说点什么吧 💬', 'error'); return; }

  const chat = ensureChatData();
  const message = {
    id: newLocalId('m'),
    senderId: chat.clientId,
    text,
    createdAt: Date.now(),
    readAt: 0,
    deleted: false
  };
  chat.messages.push(message);
  saveAppData();
  input.value = '';
  renderChat(true);

  if (cloudBound()) {
    cloud().sendMessage(message).catch(e => {
      showToast('消息发送失败：' + e.message, 'error');
    });
  }
}

async function refreshChat() {
  const c = cloud();
  if (c && c.isConfigured && c.isConfigured() && c.isBound()) {
    try {
      await c.refreshAll();
      showToast('已刷新云端聊天 💬');
    } catch (e) {
      showToast('刷新失败：' + e.message, 'error');
    }
    return;
  }
  renderChat();
  showToast('当前为本地演示模式', 'error');
}

// 恋爱相册
function compressImage(file, maxSize = 1280, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxSize || height > maxSize) {
          const ratio = Math.min(maxSize / width, maxSize / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    img.src = url;
  });
}

async function handleAlbumFiles(files) {
  const list = Array.from(files || []).filter(f => f.type && f.type.startsWith('image/'));
  if (!list.length) return;

  showToast('正在保存照片...');
  let added = 0;
  const bound = cloudBound();

  for (const file of list.slice(0, 12)) {
    try {
      const dataUrl = await compressImage(file);
      if (bound) {
        await cloud().uploadPhoto(dataUrl, file.name);
      } else {
        appData.album.unshift({
          id: newLocalId('a'),
          name: file.name,
          dataUrl,
          date: new Date().toISOString(),
          author: 'me'
        });
      }
      added++;
    } catch (e) {
      showToast(`${file.name} 保存失败：${e.message || '未知错误'}`, 'error');
    }
  }

  const input = document.getElementById('albumFileInput');
  if (input) input.value = '';
  if (!bound) {
    saveAppData();
    renderAlbum();
  }
  showToast(added ? `已添加 ${added} 张照片 📷` : '没有可用的图片', added ? 'success' : 'error');
}

// 绑定后相册来自 Supabase Storage 签名链接，未绑定则使用本地演示照片
let cloudAlbum = null;

function albumItems() {
  if (cloudBound() && Array.isArray(cloudAlbum)) return cloudAlbum;
  return appData.album || [];
}

function renderAlbum() {
  const groupsEl = document.getElementById('albumGroups');
  if (!groupsEl) return;

  const items = albumItems();
  document.getElementById('albumCount').textContent = `${items.length} 张照片`;
  document.getElementById('navAlbumMeta').textContent = `${items.length} 张照片`;

  if (!items.length) {
    groupsEl.innerHTML = '';
    document.getElementById('albumEmpty').style.display = 'block';
    renderScreenShared();
    return;
  }
  document.getElementById('albumEmpty').style.display = 'none';

  const groups = {};
  items.forEach(item => {
    const key = (item.date || '').slice(0, 10) || '未知日期';
    (groups[key] = groups[key] || []).push(item);
  });

  const keys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  groupsEl.innerHTML = keys.map(key => `
    <div class="album-day">
      <div class="album-day-title">📅 ${key}（${groups[key].length} 张）</div>
      <div class="album-grid">
        ${groups[key].map(item => `
          <div class="album-thumb" onclick="openAlbumLightbox('${item.id}')">
            <img src="${item.dataUrl}" alt="${escapeHtml(item.name || '照片')}" loading="lazy">
          </div>
        `).join('')}
      </div>
    </div>
  `).join('');

  renderScreenShared();
}

let lightboxId = null;

window.openAlbumLightbox = function (id) {
  const item = albumItems().find(x => x.id === id);
  if (!item) return;
  lightboxId = id;
  document.getElementById('lightboxImg').src = item.dataUrl;
  const timeText = item.date ? new Date(item.date).toLocaleString('zh-CN') : '';
  document.getElementById('lightboxMeta').textContent = `${item.name || '照片'} · ${timeText}`;
  document.getElementById('albumLightbox').style.display = 'flex';
};

window.closeAlbumLightbox = function () {
  document.getElementById('albumLightbox').style.display = 'none';
  document.getElementById('lightboxImg').src = '';
  lightboxId = null;
};

async function deleteLightboxImage() {
  if (!lightboxId) return;
  if (!confirm('确定删除这张照片吗？')) return;

  const targetId = lightboxId;
  const item = albumItems().find(x => x.id === targetId);
  closeAlbumLightbox();

  if (cloudBound() && item && item.storagePath) {
    try {
      await cloud().deletePhoto(item);
      showToast('照片已删除');
    } catch (e) {
      showToast('删除失败：' + (e.message || '网络错误'), 'error');
    }
    return;
  }

  appData.album = appData.album.filter(x => x.id !== targetId);
  saveAppData();
  renderAlbum();
  showToast('照片已删除');
}

// 实时同屏（本地演示版）
const screenState = { status: 'idle', code: '' };

function genRoomCode() {
  let s = '';
  for (let i = 0; i < 6; i++) s += Math.floor(Math.random() * 10);
  return s;
}

function renderScreen() {
  const idle = document.getElementById('screenIdle');
  const room = document.getElementById('screenRoom');
  if (!idle || !room) return;

  const connected = screenState.status !== 'idle';
  idle.style.display = connected ? 'none' : 'block';
  room.style.display = connected ? 'block' : 'none';
  document.getElementById('screenStateText').textContent = connected ? '已连接' : '未连接';
  document.getElementById('navScreenMeta').textContent = connected ? `房间 ${screenState.code}` : '未连接';

  if (connected) {
    document.getElementById('screenCodeDisplay').textContent = screenState.code;
    document.getElementById('screenStatusText').textContent =
      screenState.status === 'host' ? '等待TA加入...（本地演示）' : '已加入TA的同屏（本地演示）';
    renderScreenShared();
  }
}

function renderScreenShared() {
  const albumGrid = document.getElementById('screenAlbumGrid');
  const wishList = document.getElementById('screenWishList');
  if (!albumGrid || !wishList) return;

  const recent = albumItems().slice(0, 6);
  albumGrid.innerHTML = recent.length
    ? recent.map(i => `<img src="${i.dataUrl}" alt="">`).join('')
    : '<p style="font-size:12px;color:var(--text-secondary);">相册暂无照片</p>';

  const wishes = activeWishes().slice(0, 6);
  wishList.innerHTML = wishes.length
    ? wishes.map(w => `<div class="screen-wish-item ${w.done ? 'done' : ''}"><span>${escapeHtml(w.text)}</span><span>${w.done ? '✓' : '待完成'}</span></div>`).join('')
    : '<p style="font-size:12px;color:var(--text-secondary);">心愿清单暂无内容</p>';
}

function hostScreen() {
  screenState.status = 'host';
  screenState.code = genRoomCode();
  renderScreen();
  showToast('同屏已创建，把房间号发给TA 📡');
}

function joinScreen() {
  const input = document.getElementById('screenCodeInput');
  const code = (input.value || '').replace(/\D/g, '');
  if (code.length !== 6) {
    showToast('请输入 6 位房间号', 'error');
    return;
  }
  screenState.status = 'joined';
  screenState.code = code;
  input.value = '';
  renderScreen();
  showToast('已加入同屏 📡');
}

function leaveScreen() {
  screenState.status = 'idle';
  screenState.code = '';
  renderScreen();
  showToast('已断开同屏');
}

let currentHomeModule = 'wish';

function switchHomeModule(name) {
  const modules = document.getElementById('homeModules');
  if (!modules) return;
  currentHomeModule = name;

  document.querySelectorAll('.feature-tab').forEach(tab => {
    tab.classList.toggle('active', tab.dataset.module === name);
  });

  if (name === 'wheel') {
    modules.style.display = 'none';
    document.getElementById('homeWheelSection').scrollIntoView({ behavior: 'smooth', block: 'start' });
    return;
  }

  modules.style.display = 'block';
  document.querySelectorAll('.home-module-panel').forEach(panel => {
    panel.classList.toggle('active', panel.id === `home-panel-${name}`);
  });
  modules.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderHomeExtras() {
  renderMoodBar();
  renderDailyPick(false);
  renderWishModule();
  renderAlbum();
  renderScreen();

  const modules = document.getElementById('homeModules');
  if (modules) modules.style.display = currentHomeModule === 'wheel' ? 'none' : 'block';
}

// ===== 情侣绑定 =====
function genInviteCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 4; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return 'LOVE-' + s;
}

function nowStr(date) {
  const d = date instanceof Date ? date : new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function daysSince(dateStr) {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return 1;
  return Math.max(1, Math.floor((new Date() - d) / 86400000) + 1);
}

function authorName(a) {
  const p = appData.profile;
  return a === 'partner' ? (p.partnerName || 'TA') : (p.nickname || '我');
}

function authorBadge(a) {
  if (!a) return '';
  return `<span class="author-badge">${escapeHtml(authorName(a))}</span>`;
}

function whisperDir(item) {
  const from = authorName(item.author);
  const to = authorName(item.author === 'partner' ? 'me' : 'partner');
  return `${from} → ${to}`;
}

function renderBind() {
  const b = appData.binding;
  const bound = !!b.bound;
  const unboundEl = document.getElementById('bindUnbound');
  const boundEl = document.getElementById('bindBound');
  if (!unboundEl || !boundEl) return;

  unboundEl.style.display = bound ? 'none' : 'block';
  boundEl.style.display = bound ? 'block' : 'none';
  document.getElementById('myInviteCode').textContent = b.myCode || '尚未生成';

  if (bound) {
    document.getElementById('boundMeName').textContent = appData.profile.nickname || '我';
    document.getElementById('boundTaName').textContent = appData.profile.partnerName || 'TA';
    document.getElementById('boundDate').textContent = b.bindDate ? `绑定时间：${b.bindDate}` : '';
    document.getElementById('boundStats').textContent = b.bindDate ? `已牵手 ${daysSince(b.bindDate)} 天` : '';
    document.getElementById('boundCodes').textContent =
      `我的邀请码 ${b.myCode || '—'}　　已与TA实时共享位置、电量与全部记录`;
  }
}

function renderPartnerStatus() {
  const b = appData.binding;
  const p = appData.profile;
  const nameEl = document.getElementById('partnerNameHome');
  if (!nameEl) return;

  const badge = document.getElementById('bindBadge');
  const atEl = document.getElementById('partnerStatusAt');
  const locEl = document.getElementById('partnerLocation');
  const batEl = document.getElementById('partnerBatteryText');
  const fill = document.getElementById('batteryFill');
  const goBtn = document.getElementById('goBindBtn');
  const refreshBtn = document.getElementById('refreshPartnerBtn');
  const foot = document.getElementById('partnerSyncFoot');

  nameEl.textContent = p.partnerName || 'TA';

  if (!b.bound) {
    badge.textContent = '未绑定 · 演示数据';
    badge.className = 'bind-badge';
    goBtn.textContent = '去绑定';
    refreshBtn.disabled = true;
    locEl.textContent = '演示数据';
    batEl.textContent = '演示数据';
    fill.style.width = '0%';
    atEl.textContent = '绑定后实时同步TA的位置与电量';
    if (foot) foot.textContent = '💡 未绑定时展示演示数据；绑定后每 30 秒自动上报位置与电量';
    renderWeather();
    return;
  }

  badge.textContent = '已绑定';
  badge.className = 'bind-badge bound';
  goBtn.textContent = '绑定管理';
  refreshBtn.disabled = false;

  locEl.textContent = b.partnerLocation || 'TA暂未上报位置';

  if (b.partnerBatterySupported === false) {
    batEl.textContent = '苹果设备不支持读取电量';
    fill.style.width = '0%';
  } else if (typeof b.partnerBattery === 'number') {
    const v = Math.max(0, Math.min(100, Math.round(b.partnerBattery)));
    batEl.textContent = `${v}%${b.partnerCharging ? ' · 充电中' : ''}`;
    fill.style.width = v + '%';
    fill.style.background = v < 20 ? '#ff4757' : (v < 50 ? '#ffa502' : 'linear-gradient(90deg, #2ed573, #7bed9f)');
  } else {
    batEl.textContent = 'TA暂未上报电量';
    fill.style.width = '0%';
  }

  atEl.textContent = b.partnerStatusAt ? `最后同步：${b.partnerStatusAt}` : '尚未同步TA的状态';
  if (foot) foot.textContent = '💡 每 30 秒自动上报位置与电量，TA的数据会自动实时刷新';

  renderWeather();
  if (b.partnerLocation) fetchPartnerWeather(false);
}

async function generateInviteCode() {
  const c = cloud();
  if (c && c.isConfigured && c.isConfigured() && cloudSignedIn()) {
    try {
      await c.createInvite();
      renderBind();
      showToast('邀请码已生成，发给TA吧 💌');
    } catch (e) {
      showToast('生成失败：' + (e.message || '网络错误'), 'error');
    }
    return;
  }

  appData.binding.myCode = genInviteCode();
  saveAppData();
  renderBind();
  showToast('邀请码已生成，发给TA吧 💌');
}

function fallbackCopy(text, cb) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.select();
  try {
    document.execCommand('copy');
    cb();
  } catch (e) {
    showToast('复制失败，请手动复制', 'error');
  }
  document.body.removeChild(ta);
}

function copyInviteCode() {
  const code = appData.binding.myCode;
  if (!code) { showToast('请先生成邀请码', 'error'); return; }
  const done = () => showToast('邀请码已复制 📋');
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(code).then(done).catch(() => fallbackCopy(code, done));
  } else {
    fallbackCopy(code, done);
  }
}

async function bindPartner() {
  const input = document.getElementById('partnerCodeInput');
  let code = (input.value || '').trim().toUpperCase().replace(/\s/g, '');
  if (!code) { showToast('请输入TA的邀请码', 'error'); return; }
  if (/^[A-Z0-9]{4}$/.test(code)) code = 'LOVE-' + code;
  if (!/^LOVE-[A-Z0-9]{4}$/.test(code)) { showToast('邀请码格式不正确，应为 LOVE-XXXX', 'error'); return; }
  if (appData.binding.myCode && code === appData.binding.myCode) {
    showToast('不能绑定自己的邀请码哦', 'error'); return;
  }

  const c = cloud();
  if (c && c.isConfigured && c.isConfigured() && cloudSignedIn()) {
    input.disabled = true;
    try {
      await c.joinByCode(code);
      input.value = '';
      renderBind();
      renderHome();
      renderSettings();
      showToast('绑定成功！你们已成为心动伴侣 💞');
    } catch (e) {
      showToast('绑定失败：' + (e.message || '邀请码无效或已过期'), 'error');
    } finally {
      input.disabled = false;
    }
    return;
  }

  // 本地演示模式
  appData.binding.bound = true;
  appData.binding.partnerCode = code;
  appData.binding.bindDate = nowStr();
  if (!appData.binding.partnerStatusAt) {
    appData.binding.partnerLocation = '未上报';
    appData.binding.partnerBattery = null;
  }
  saveAppData();

  input.value = '';
  renderBind();
  renderHome();
  renderSettings();
  showToast('绑定成功！你们已成为心动伴侣 💞');
}

async function unbindPartner() {
  const c = cloud();
  if (c && c.isConfigured && c.isConfigured() && cloudSignedIn()) {
    if (!confirm('确定要解除绑定吗？解除后双方的共享位置、电量与记录都会被清空。')) return;
    try {
      await c.leavePairing();
      cloudAlbum = [];
      renderBind();
      renderHome();
      renderSettings();
      showToast('已解除绑定');
    } catch (e) {
      showToast('解绑失败：' + (e.message || '网络错误'), 'error');
    }
    return;
  }

  if (!confirm('确定要解除与TA的绑定吗？已记录的共享内容不会被删除。')) return;
  appData.binding.bound = false;
  appData.binding.partnerCode = '';
  appData.binding.bindDate = '';
  appData.binding.partnerLocation = '';
  appData.binding.partnerBattery = null;
  appData.binding.partnerStatusAt = '';
  appData.binding.partnerWeather = null;
  saveAppData();
  renderBind();
  renderHome();
  renderSettings();
  showToast('已解除绑定');
}

async function refreshPartnerStatus() {
  const c = cloud();
  if (c && c.isConfigured && c.isConfigured() && c.isBound()) {
    try {
      await c.refreshAll();
      showToast('已刷新TA的最新状态 📡');
    } catch (e) {
      showToast('刷新失败：' + (e.message || '网络错误'), 'error');
    }
    return;
  }
  navigateTo('bind');
}

// ===== 天气（基于TA的位置）=====
const WMO_MAP = [
  { codes: [0], icon: '☀️', text: '晴' },
  { codes: [1], icon: '🌤️', text: '晴间多云' },
  { codes: [2], icon: '⛅', text: '多云' },
  { codes: [3], icon: '☁️', text: '阴' },
  { codes: [45, 48], icon: '🌫️', text: '雾' },
  { codes: [51, 53, 55, 56, 57], icon: '🌦️', text: '毛毛雨' },
  { codes: [61, 63, 65, 66, 67], icon: '🌧️', text: '雨' },
  { codes: [71, 73, 75, 77], icon: '❄️', text: '雪' },
  { codes: [80, 81, 82], icon: '🌦️', text: '阵雨' },
  { codes: [85, 86], icon: '🌨️', text: '阵雪' },
  { codes: [95], icon: '⛈️', text: '雷阵雨' },
  { codes: [96, 99], icon: '⛈️', text: '雷暴冰雹' }
];

function weatherInfo(code) {
  const hit = WMO_MAP.find(m => m.codes.includes(code));
  return hit || { icon: '🌡️', text: '未知天气' };
}

async function fetchJson(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

function cityFromLocation(loc) {
  return loc.split(/[·・,，\s]/)[0].replace(/[省市县区]$/, '');
}

async function fetchPartnerWeather(force) {
  const b = appData.binding;
  if (!b.bound) return;
  const loc = b.partnerLocation;
  if (!loc) { renderWeather(); return; }
  if (weatherLoading) return;
  // 同一位置已获取过则直接展示缓存（失败时需手动刷新）
  if (!force && b.partnerWeather && b.partnerWeather.location === loc) {
    renderWeather();
    return;
  }

  weatherLoading = true;
  renderWeather();
  try {
    const city = cityFromLocation(loc) || loc;
    const geo = await fetchJson(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(city)}&count=1&language=zh&format=json`);
    if (!geo.results || !geo.results.length) throw new Error('未找到该城市');
    const place = geo.results[0];
    const weather = await fetchJson(`https://api.open-meteo.com/v1/forecast?latitude=${place.latitude}&longitude=${place.longitude}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=auto`);
    const cur = weather.current;
    const info = weatherInfo(cur.weather_code);
    b.partnerWeather = {
      location: loc,
      city: place.name || city,
      temp: Math.round(cur.temperature_2m),
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      desc: info.text,
      icon: info.icon,
      fetchedAt: nowStr(),
      error: false
    };
    saveAppData();
  } catch (e) {
    b.partnerWeather = { location: loc, error: true, fetchedAt: nowStr() };
    saveAppData();
  } finally {
    weatherLoading = false;
  }
  renderWeather();
}

function renderWeather() {
  const box = document.getElementById('weatherBox');
  if (!box) return;
  const b = appData.binding;

  if (!b.bound) { box.style.display = 'none'; return; }
  box.style.display = 'flex';

  const iconEl = document.getElementById('weatherIcon');
  const textEl = document.getElementById('weatherText');
  const locEl = document.getElementById('weatherLocation');

  if (!b.partnerLocation) {
    iconEl.textContent = '🌍';
    textEl.textContent = 'TA的位置还未上报，暂时无法获取天气';
    locEl.textContent = '等待TA开启定位并完成上报';
    return;
  }

  if (weatherLoading) {
    iconEl.textContent = '⏳';
    textEl.textContent = '正在获取TA所在地的天气...';
    locEl.textContent = `📍 ${b.partnerLocation}`;
    return;
  }

  const w = b.partnerWeather;

  if (!w || w.location !== b.partnerLocation) {
    iconEl.textContent = '🌤️';
    textEl.textContent = '天气待获取';
    locEl.textContent = `📍 ${b.partnerLocation}`;
    return;
  }
  if (w.error) {
    iconEl.textContent = '⚠️';
    textEl.textContent = '天气获取失败，请检查网络后点「刷新状态」';
    locEl.textContent = `📍 ${b.partnerLocation}`;
    return;
  }

  iconEl.textContent = w.icon;
  textEl.textContent = `${w.desc} ${w.temp}°C · 湿度 ${w.humidity}% · 风速 ${w.wind}km/h`;
  locEl.textContent = `📍 ${w.city} · 更新于 ${w.fetchedAt}`;
}

// ===== 纪念日 =====
function renderAnniversaries() {
  const list = document.getElementById('anniversaryList');
  const empty = document.getElementById('anniversaryEmpty');

  if (appData.anniversaries.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = appData.anniversaries.map((item, index) => {
    const date = new Date(item.date);
    const today = new Date();
    let diff = Math.ceil((date - today) / (1000 * 60 * 60 * 24));
    let countdown = '';
    if (diff > 0) {
      countdown = `还有 ${diff} 天`;
    } else if (diff === 0) {
      countdown = '就是今天！🎉';
    } else {
      countdown = `已过 ${Math.abs(diff)} 天`;
    }

    return `
      <div class="anniversary-card">
        <div class="anniversary-emoji">${item.emoji || '🎉'}</div>
        <div class="anniversary-title">${escapeHtml(item.title)}</div>
        <div class="anniversary-date">${item.date}</div>
        <div class="anniversary-countdown">${countdown}</div>
        <div class="anniversary-actions">
          <button onclick="editAnniversary(${index})">编辑</button>
          <button class="delete-btn" onclick="deleteAnniversary(${index})">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

function showAnniversaryModal(index = null) {
  const isEdit = index !== null;
  const item = isEdit ? appData.anniversaries[index] : { title: '', date: '', emoji: '🎉' };

  const emojis = ['🎉', '💕', '💍', '🌹', '🎂', '✈️', '🎁', '🌟', '🍜', '🎬'];
  const emojiOptions = emojis.map(e =>
    `<span class="mood-item emoji-pick ${e === item.emoji ? 'selected' : ''}" data-emoji="${e}">${e}</span>`
  ).join('');

  showModal(isEdit ? '编辑纪念日' : '添加纪念日', `
    <div class="form-row">
      <label>选择图标</label>
      <div class="mood-options">${emojiOptions}</div>
    </div>
    <div class="form-row">
      <label>纪念日名称</label>
      <input type="text" class="form-input" id="annivTitle" value="${escapeHtml(item.title)}" placeholder="比如：在一起的日子">
    </div>
    <div class="form-row">
      <label>日期</label>
      <input type="date" class="form-input" id="annivDate" value="${item.date}">
    </div>
    <div style="text-align:right; margin-top:20px;">
      <button class="btn btn-primary" onclick="saveAnniversary(${index})">${isEdit ? '保存' : '添加'}</button>
    </div>
  `);

  // 绑定图标选择
  setTimeout(() => {
    document.querySelectorAll('.emoji-pick').forEach(el => {
      el.addEventListener('click', () => {
        document.querySelectorAll('.emoji-pick').forEach(e => e.classList.remove('selected'));
        el.classList.add('selected');
      });
    });
  }, 50);
}

window.saveAnniversary = function(index) {
  const title = document.getElementById('annivTitle').value.trim();
  const date = document.getElementById('annivDate').value;
  const emojiEl = document.querySelector('.emoji-pick.selected');
  const emoji = emojiEl ? emojiEl.dataset.emoji : '🎉';

  if (!title) { showToast('请填写纪念日名称', 'error'); return; }
  if (!date) { showToast('请选择日期', 'error'); return; }

  const now = Date.now();
  let item;
  if (index !== null && index >= 0) {
    const prev = appData.anniversaries[index] || {};
    item = {
      ...prev,
      id: prev.id || newLocalId('a'),
      title,
      date,
      emoji,
      createdAt: Number(prev.createdAt) || now,
      updatedAt: now
    };
    appData.anniversaries[index] = item;
  } else {
    item = {
      id: newLocalId('a'),
      title,
      date,
      emoji,
      author: 'me',
      createdAt: now,
      updatedAt: now
    };
    appData.anniversaries.push(item);
  }
  saveAppData();
  renderAnniversaries();
  closeModal();
  showToast('纪念日已保存 💕');

  if (cloudBound()) {
    cloud().saveAnniversary(item).catch(reportCloudError('纪念日同步失败'));
  }
};

window.editAnniversary = function(index) {
  showAnniversaryModal(index);
};

window.deleteAnniversary = function(index) {
  if (confirm('确定要删除这个纪念日吗？')) {
    const item = appData.anniversaries[index];
    appData.anniversaries.splice(index, 1);
    saveAppData();
    renderAnniversaries();
    showToast('已删除');
    if (cloudBound() && item && item.id) {
      cloud().deleteAnniversary(item.id).catch(reportCloudError('纪念日删除失败'));
    }
  }
};

// ===== 日记 =====
function renderDiaries() {
  renderMoodChart();
  renderDiaryList();

  // 绑定后显示「记录人」选择，并同步双方昵称
  const picker = document.getElementById('diaryAuthorPicker');
  if (picker) {
    picker.style.display = appData.binding.bound ? 'flex' : 'none';
    document.getElementById('diaryAuthorMe').textContent = appData.profile.nickname || '我';
    document.getElementById('diaryAuthorTa').textContent = appData.profile.partnerName || 'TA';
  }
}

function renderMoodChart() {
  const moodMap = {
    happy: { icon: '😊', label: '开心' },
    love: { icon: '🥰', label: '甜蜜' },
    calm: { icon: '😌', label: '平静' },
    sad: { icon: '😢', label: '难过' },
    angry: { icon: '😠', label: '生气' },
    miss: { icon: '🥺', label: '想念' }
  };

  const counts = {};
  appData.diaries.forEach(d => {
    counts[d.mood] = (counts[d.mood] || 0) + 1;
  });

  const chart = document.getElementById('moodChart');
  chart.innerHTML = Object.entries(moodMap).map(([key, val]) => `
    <div class="mood-stat">
      <div class="mood-stat-icon">${val.icon}</div>
      <div class="mood-stat-count">${counts[key] || 0}</div>
    </div>
  `).join('');
}

function renderDiaryList() {
  const list = document.getElementById('diaryList');
  if (appData.diaries.length === 0) {
    list.innerHTML = '<div class="empty-state" style="padding:30px;"><div class="empty-icon">📖</div><p class="empty-text">还没有日记，写下第一篇吧～</p></div>';
    return;
  }

  const moodIcons = {
    happy: '😊', love: '🥰', calm: '😌', sad: '😢', angry: '😠', miss: '🥺'
  };

  const sorted = [...appData.diaries].sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = sorted.map(item => {
    const idx = appData.diaries.indexOf(item);
    return `
      <div class="diary-item" onclick="viewDiary(${idx})">
        <div class="diary-item-header">
          <span class="diary-item-title">${escapeHtml(item.title || '无标题')}${authorBadge(item.author)}</span>
          <span class="diary-item-mood">${moodIcons[item.mood] || '😊'}</span>
        </div>
        <div class="diary-item-date">${item.date}</div>
        <div class="diary-item-preview">${escapeHtml(item.content)}</div>
        <div class="diary-item-actions" onclick="event.stopPropagation()">
          <button onclick="viewDiary(${idx})">查看</button>
          <button onclick="deleteDiary(${idx})" style="color:#ff4757;">删除</button>
        </div>
      </div>
    `;
  }).join('');
}

window.viewDiary = function(index) {
  const item = appData.diaries[index];
  const moodIcons = {
    happy: '😊 开心', love: '🥰 甜蜜', calm: '😌 平静',
    sad: '😢 难过', angry: '😠 生气', miss: '🥺 想念'
  };
  showModal(item.title || '无标题', `
    <p style="color:var(--text-secondary); font-size:13px; margin-bottom:12px;">${item.date} · ${moodIcons[item.mood] || ''}${item.author ? ' · ' + escapeHtml(authorName(item.author)) : ''}</p>
    <div style="white-space:pre-wrap; line-height:1.8; color:var(--text-primary);">${escapeHtml(item.content)}</div>
  `);
};

window.deleteDiary = function(index) {
  if (confirm('确定要删除这篇日记吗？')) {
    const item = appData.diaries[index];
    appData.diaries.splice(index, 1);
    saveAppData();
    renderDiaries();
    showToast('日记已删除');
    if (cloudBound() && item && item.id) {
      cloud().deleteDiary(item.id).catch(reportCloudError('日记删除失败'));
    }
  }
};

function saveDiary() {
  const title = document.getElementById('diaryTitle').value.trim();
  const content = document.getElementById('diaryContent').value.trim();
  if (!content) { showToast('日记内容不能为空', 'error'); return; }

  const now = Date.now();
  const diary = {
    id: newLocalId('d'),
    title: title || '无标题',
    content,
    mood: currentMood,
    author: cloudBound() ? 'me' : (appData.binding.bound ? currentDiaryAuthor : 'me'),
    date: new Date().toISOString().split('T')[0],
    createdAt: now
  };
  appData.diaries.push(diary);
  saveAppData();

  // 清空
  document.getElementById('diaryTitle').value = '';
  document.getElementById('diaryContent').value = '';
  currentMood = 'happy';
  document.querySelectorAll('.mood-item').forEach(el => el.classList.remove('selected'));
  document.querySelector('.mood-item[data-mood="happy"]').classList.add('selected');

  renderDiaries();
  showToast('日记已保存 📖');

  if (cloudBound()) {
    cloud().saveDiary(diary).catch(reportCloudError('日记同步失败'));
  }
}

// ===== 情侣互动 =====
function renderInteract() {
  renderWhispers();
  renderWishes();

  // 发送人按钮显示双方昵称
  document.getElementById('whisperSenderMe').textContent = appData.profile.nickname || '我';
  document.getElementById('whisperSenderTa').textContent = appData.profile.partnerName || 'TA';
}

function switchTab(tabName) {
  document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tabName));
  document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === `tab-${tabName}`));
}

// 悄悄话
function renderWhispers() {
  const list = document.getElementById('whisperList');
  const empty = document.getElementById('whisperEmpty');

  if (appData.whispers.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  const sorted = [...appData.whispers].sort((a, b) => new Date(b.date) - new Date(a.date));
  list.innerHTML = sorted.map(item => {
    const idx = appData.whispers.indexOf(item);
    return `
      <div class="whisper-card">
        <button class="whisper-delete" onclick="deleteWhisper(${idx})">✕</button>
        <div class="whisper-from">💌 ${escapeHtml(whisperDir(item))}</div>
        <div class="whisper-text">${escapeHtml(item.text)}</div>
        <div class="whisper-date">${item.date}</div>
      </div>
    `;
  }).join('');
}

window.deleteWhisper = function(index) {
  const item = appData.whispers[index];
  appData.whispers.splice(index, 1);
  saveAppData();
  renderWhispers();
  showToast('悄悄话已删除');
  if (cloudBound() && item && item.id) {
    cloud().deleteWhisper(item.id).catch(reportCloudError('悄悄话删除失败'));
  }
};

function sendWhisper() {
  const input = document.getElementById('whisperInput');
  const text = input.value.trim();
  if (!text) { showToast('请输入悄悄话内容', 'error'); return; }

  const now = Date.now();
  const whisper = {
    id: newLocalId('s'),
    text,
    author: cloudBound() ? 'me' : currentWhisperSender,
    createdAt: now,
    date: new Date().toLocaleString('zh-CN')
  };
  appData.whispers.push(whisper);
  saveAppData();
  input.value = '';
  renderWhispers();
  showToast('悄悄话已送达 💕');

  if (cloudBound()) {
    cloud().sendWhisper(whisper).catch(reportCloudError('悄悄话同步失败'));
  }
}

// 心愿清单（情侣互动页）
function renderWishes() {
  const list = document.getElementById('wishList');
  const empty = document.getElementById('wishEmpty');

  const items = appData.wishes
    .map((item, index) => ({ item, index }))
    .filter(entry => !entry.item.deleted);

  if (items.length === 0) {
    list.innerHTML = '';
    empty.style.display = 'block';
    return;
  }
  empty.style.display = 'none';

  list.innerHTML = items.map(({ item, index }) => `
    <div class="wish-item ${item.done ? 'done' : ''}">
      <div class="wish-checkbox ${item.done ? 'checked' : ''}" onclick="toggleWish(${index})">${item.done ? '✓' : ''}</div>
      <span class="wish-text">${escapeHtml(item.text)}</span>
      <button class="wish-delete" onclick="deleteWish(${index})">🗑</button>
    </div>
  `).join('');
}

window.toggleWish = function(index) {
  const wish = appData.wishes[index];
  if (!wish) return;
  wish.done = !wish.done;
  wish.updatedAt = Date.now();
  saveAppData();
  renderWishes();
  renderWishModule();
  renderScreenShared();
  if (wish.done) showToast('心愿达成！🎉');
  syncWish(wish, false);
};

window.deleteWish = function(index) {
  const wish = appData.wishes[index];
  if (!wish) return;
  wish.deleted = true;
  wish.updatedAt = Date.now();
  saveAppData();
  renderWishes();
  renderWishModule();
  renderScreenShared();
  syncWish(wish, false);
};

function addWish() {
  const input = document.getElementById('wishInput');
  const text = input.value.trim();
  if (!text) { showToast('请输入心愿内容', 'error'); return; }

  const now = Date.now();
  const wish = {
    id: `w-${now}-${Math.random().toString(36).slice(2, 7)}`,
    text,
    done: false,
    deleted: false,
    author: 'me',
    createdAt: now,
    updatedAt: now
  };
  appData.wishes.push(wish);
  saveAppData();
  input.value = '';
  renderWishes();
  renderWishModule();
  renderScreenShared();
  showToast('心愿已添加 ⭐');
  syncWish(wish, true);
}

// 默契测试
const testQuestions = [
  {
    question: "TA最喜欢的颜色是？",
    options: ["红色", "蓝色", "粉色", "黑色"]
  },
  {
    question: "你们第一次约会去了哪里？",
    options: ["电影院", "餐厅", "公园", "咖啡馆"]
  },
  {
    question: "TA心情不好时，最想做什么？",
    options: ["一个人静静", "找你倾诉", "吃好吃的", "出去走走"]
  },
  {
    question: "TA最想和你一起做的事是？",
    options: ["旅行", "看电影", "做饭", "宅家追剧"]
  },
  {
    question: "你们在一起多久了？",
    options: ["不到半年", "半年到一年", "一到三年", "三年以上"]
  },
  {
    question: "TA最不能忍受的是？",
    options: ["迟到", "撒谎", "冷战", "忽略TA"]
  },
  {
    question: "送给TA什么礼物最开心？",
    options: ["鲜花", "手写情书", "实用物品", "惊喜旅行"]
  },
  {
    question: "你们吵架后通常谁先低头？",
    options: ["我", "TA", "轮流", "不吵架"]
  }
];

function startTest() {
  currentTestIndex = 0;
  testAnswers = [];
  document.querySelector('.test-intro').style.display = 'none';
  document.getElementById('testArea').style.display = 'block';
  document.getElementById('testResult').style.display = 'none';
  showTestQuestion();
}

function showTestQuestion() {
  const q = testQuestions[currentTestIndex];
  document.getElementById('testQuestion').textContent = `${currentTestIndex + 1}. ${q.question}`;
  document.getElementById('progressBar').style.width = ((currentTestIndex) / testQuestions.length * 100) + '%';

  document.getElementById('testOptions').innerHTML = q.options.map((opt, i) => `
    <div class="test-option" onclick="selectAnswer(${i})">${opt}</div>
  `).join('');
}

window.selectAnswer = function(optionIndex) {
  testAnswers.push(optionIndex);
  document.querySelectorAll('.test-option').forEach((el, i) => {
    el.classList.toggle('selected', i === optionIndex);
  });

  setTimeout(() => {
    currentTestIndex++;
    if (currentTestIndex < testQuestions.length) {
      showTestQuestion();
    } else {
      showTestResult();
    }
  }, 400);
};

function showTestResult() {
  document.getElementById('progressBar').style.width = '100%';
  document.getElementById('testQuestion').style.display = 'none';
  document.getElementById('testOptions').style.display = 'none';
  document.getElementById('testResult').style.display = 'block';

  // 模拟默契度（随机但偏高）
  const score = Math.floor(70 + Math.random() * 30);
  document.getElementById('resultScore').textContent = score + ' 分';

  let msg, icon;
  if (score >= 90) {
    icon = '💖';
    msg = '你们的默契度爆表！简直是天造地设的一对，继续保持这份甜蜜吧～';
  } else if (score >= 80) {
    icon = '💕';
    msg = '你们非常有默契！彼此了解很深，感情一定很稳定甜蜜。';
  } else if (score >= 70) {
    icon = '💗';
    msg = '你们的默契还不错，多交流多陪伴，感情会越来越好的！';
  } else {
    icon = '💝';
    msg = '默契度还有提升空间，多花时间了解对方，会越来越合拍的～';
  }

  document.getElementById('resultIcon').textContent = icon;
  document.getElementById('resultMsg').textContent = msg;
}

function restartTest() {
  document.querySelector('.test-intro').style.display = 'block';
  document.getElementById('testArea').style.display = 'none';
  document.getElementById('testQuestion').style.display = 'block';
  document.getElementById('testOptions').style.display = 'block';
}

// ===== 设置 =====
function isPlaceholderValue(v) {
  return !v || /YOUR[_-]|你的|示例|placeholder/i.test(String(v));
}

function fillCloudConfigFields() {
  const c = cloud();
  const cfg = (c && c.getConfig) ? c.getConfig() : {};
  const urlEl = document.getElementById('settingSupabaseUrl');
  const keyEl = document.getElementById('settingSupabaseKey');
  const amapEl = document.getElementById('settingAmapKey');
  if (!urlEl || !keyEl) return;
  urlEl.value = isPlaceholderValue(cfg.url) ? '' : cfg.url;
  keyEl.value = isPlaceholderValue(cfg.anonKey) ? '' : cfg.anonKey;
  if (amapEl) amapEl.value = isPlaceholderValue(cfg.amapKey) ? '' : cfg.amapKey;
}

function renderCloudStatus() {
  const textEl = document.getElementById('cloudStatusText');
  if (!textEl) return;

  const dot = document.getElementById('cloudStatusDot');
  const hint = document.getElementById('cloudAccountHint');
  const signOut = document.getElementById('signOutBtn');

  const c = cloud();
  const info = cloudInfo();
  let text = '云端模块未加载';
  let state = 'off';

  if (!c) {
    text = '云端模块未加载';
  } else if (!(c.isConfigured && c.isConfigured())) {
    text = '未配置 Supabase，当前为本地演示模式';
  } else if (!info || !info.user) {
    text = '已配置 Supabase，请先登录邮箱账号';
    state = 'wait';
  } else if (info.pairing && info.pairing.status === 'active') {
    const rt = info.realtime;
    if (rt === 'SUBSCRIBED') {
      text = '已绑定 · 实时同步中';
      state = 'on';
    } else if (rt === 'CHANNEL_ERROR' || rt === 'TIMED_OUT') {
      text = '已绑定 · 实时连接异常，正在重连';
      state = 'wait';
    } else {
      text = '已绑定 · 正在连接实时通道';
      state = 'wait';
    }
  } else if (info.pairing && info.pairing.status === 'pending') {
    text = '已登录 · 邀请码已生成，等待TA绑定';
    state = 'wait';
  } else {
    text = '已登录 · 尚未绑定，当前展示演示数据';
    state = 'wait';
  }

  textEl.textContent = text;
  if (dot) dot.className = `cloud-dot ${state}`;
  if (signOut) signOut.style.display = (info && info.user) ? 'inline-block' : 'none';
  if (hint) {
    hint.textContent = (info && info.user)
      ? `当前账号：${info.user.email || ''} · 共享数据受 Supabase RLS 保护`
      : '保存后自动刷新页面生效。anon key 可以公开，切勿填写 service_role 密钥。';
  }
}

function renderSettings() {
  const profile = appData.profile;
  document.getElementById('settingNickname').value = profile.nickname || '';
  document.getElementById('settingPartner').value = profile.partnerName || '';
  document.getElementById('settingStartDate').value = profile.loveStartDate || '';
  fillCloudConfigFields();

  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === (appData.settings.theme || 'romantic'));
  });

  renderCloudStatus();
}

function saveProfile() {
  appData.profile.nickname = document.getElementById('settingNickname').value.trim() || '我';
  appData.profile.partnerName = document.getElementById('settingPartner').value.trim() || 'TA';
  appData.profile.loveStartDate = document.getElementById('settingStartDate').value;
  saveAppData();
  showToast('信息已保存 💕');
  renderHome();
  renderBind();
  renderCloudStatus();

  if (cloudSignedIn()) {
    cloud().saveProfile({
      nickname: appData.profile.nickname,
      loveStartDate: appData.profile.loveStartDate
    }).catch(reportCloudError('资料同步失败'));
  }
}

function changeTheme(theme) {
  document.body.classList.remove('theme-romantic', 'theme-warm', 'theme-dream', 'theme-ocean');
  if (theme !== 'romantic') {
    document.body.classList.add(`theme-${theme}`);
  }
  appData.settings.theme = theme;
  saveAppData();
  document.querySelectorAll('.theme-card').forEach(card => {
    card.classList.toggle('active', card.dataset.theme === theme);
  });
  showToast('主题已切换 🎨');
}

// ===== 工具函数 =====
function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}

// 恋爱小贴士
const loveTips = [
  "每天一句晚安，胜过千言万语 💕",
  "别忘了给TA一个拥抱 🤗",
  "记得TA喜欢吃什么，那是爱的细节 🍰",
  "吵架不过夜，沟通是最好的解药 💬",
  "偶尔的小惊喜，能让感情升温 🎁",
  "倾听比说教更重要 👂",
  "记住每一个重要的日子 📅",
  "爱要大声说出来！📢"
];

function showLoveTip() {
  const tip = loveTips[Math.floor(Math.random() * loveTips.length)];
  document.getElementById('loveTip').textContent = tip;
}

// ===== 云端登录 / 配置 =====
let authMode = 'login';
let authDemoSkip = false;

function showAuthGate(show) {
  const gate = document.getElementById('authGate');
  if (!gate) return;
  gate.style.display = show ? 'flex' : 'none';
  if (show) renderAuthGateState();
}

// 未配置 Supabase 时，登录页内直接展开配置区并禁用提交
function renderAuthGateState() {
  const c = cloud();
  const configured = !!(c && c.isConfigured && c.isConfigured());
  const box = document.getElementById('authConfig');
  const submit = document.getElementById('authSubmitBtn');
  const sub = document.querySelector('.auth-sub');

  if (box) box.style.display = configured ? 'none' : 'flex';
  if (submit) submit.disabled = !configured;
  if (sub) {
    sub.textContent = configured
      ? '登录后生成绑定码，与TA实时共享位置、电量和每一天'
      : '先连接 Supabase，再注册账号与TA绑定';
  }
  if (!configured) {
    const cfg = (c && c.getConfig) ? c.getConfig() : {};
    const urlEl = document.getElementById('authSupabaseUrl');
    const keyEl = document.getElementById('authSupabaseKey');
    const amapEl = document.getElementById('authAmapKey');
    if (urlEl) urlEl.value = isPlaceholderValue(cfg.url) ? '' : cfg.url;
    if (keyEl) keyEl.value = isPlaceholderValue(cfg.anonKey) ? '' : cfg.anonKey;
    if (amapEl) amapEl.value = isPlaceholderValue(cfg.amapKey) ? '' : cfg.amapKey;
  }
}

function saveAuthConfig() {
  const c = cloud();
  if (!c) { setAuthHint('云端模块未加载'); return; }
  const urlEl = document.getElementById('authSupabaseUrl');
  const keyEl = document.getElementById('authSupabaseKey');
  const amapEl = document.getElementById('authAmapKey');
  const url = (urlEl ? urlEl.value : '').trim();
  const anonKey = (keyEl ? keyEl.value : '').trim();
  const amapKey = (amapEl ? amapEl.value : '').trim();

  if (!url || !anonKey) { setAuthHint('请填写 Supabase URL 与 anon key'); return; }
  if (!/^https?:\/\/[^\s]+$/i.test(url)) { setAuthHint('URL 格式应为 https://xxxx.supabase.co'); return; }
  if (/YOUR[_-]|service_role/i.test(anonKey)) { setAuthHint('请填写 anon public key，不要使用 service_role 密钥'); return; }

  c.saveConfig({ url, anonKey, amapKey });
  setAuthHint('配置已保存，正在重新连接...');
  setTimeout(() => location.reload(), 600);
}

function setAuthHint(text) {
  const hint = document.getElementById('authHint');
  if (hint) hint.textContent = text || '';
}

async function submitAuth() {
  const c = cloud();
  if (!c || !c.isConfigured || !c.isConfigured()) {
    showToast('请先在设置页填写 Supabase 配置', 'error');
    return;
  }
  const emailEl = document.getElementById('authEmail');
  const passEl = document.getElementById('authPassword');
  const btn = document.getElementById('authSubmitBtn');
  const email = (emailEl.value || '').trim();
  const password = passEl.value || '';

  if (!email) { setAuthHint('请输入邮箱'); return; }
  if (password.length < 6) { setAuthHint('密码至少需要 6 位'); return; }

  btn.disabled = true;
  setAuthHint(authMode === 'login' ? '正在登录...' : '正在注册...');
  try {
    if (authMode === 'login') {
      await c.signIn(email, password);
      setAuthHint('');
    } else {
      const res = await c.signUp(email, password);
      setAuthHint(res && res.needConfirm
        ? '注册成功！请到邮箱点击确认链接，然后再回来登录。'
        : '');
    }
  } catch (e) {
    setAuthHint(e.message || '操作失败');
  } finally {
    btn.disabled = false;
  }
}

function bindAuthGate() {
  document.querySelectorAll('.auth-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      authMode = tab.dataset.authTab || 'login';
      document.querySelectorAll('.auth-tab').forEach(t => t.classList.toggle('active', t === tab));
      const btn = document.getElementById('authSubmitBtn');
      if (btn) btn.textContent = authMode === 'login' ? '登录' : '注册';
      setAuthHint('');
    });
  });

  const submit = document.getElementById('authSubmitBtn');
  if (submit) submit.addEventListener('click', submitAuth);
  ['authEmail', 'authPassword'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('keydown', e => { if (e.key === 'Enter') submitAuth(); });
  });

  const cfgSave = document.getElementById('authConfigSaveBtn');
  if (cfgSave) cfgSave.addEventListener('click', saveAuthConfig);

  const demoBtn = document.getElementById('authDemoBtn');
  if (demoBtn) {
    demoBtn.addEventListener('click', () => {
      authDemoSkip = true;
      showAuthGate(false);
      showToast('已进入演示模式，数据只保存在本机');
    });
  }
}

function saveCloudConfig() {
  const c = cloud();
  if (!c) { showToast('云端模块未加载', 'error'); return; }
  const url = document.getElementById('settingSupabaseUrl').value.trim();
  const anonKey = document.getElementById('settingSupabaseKey').value.trim();
  const amapKey = document.getElementById('settingAmapKey').value.trim();
  if (!url || !anonKey) { showToast('请填写 Supabase URL 与 anon key', 'error'); return; }
  c.saveConfig({ url, anonKey, amapKey });
  showToast('云配置已保存，正在重新连接...');
  setTimeout(() => location.reload(), 600);
}

async function refreshCloudData() {
  const c = cloud();
  if (!c || !c.isConfigured || !c.isConfigured()) { showToast('请先在设置页配置 Supabase', 'error'); return; }
  if (!cloudSignedIn()) { showAuthGate(true); return; }
  try {
    await c.refreshAll();
    renderCloudStatus();
    showToast('已重新同步云端数据');
  } catch (e) {
    showToast('同步失败：' + (e.message || '网络错误'), 'error');
  }
}

async function signOutCloud() {
  const c = cloud();
  if (!c) return;
  if (!confirm('确定退出登录吗？退出后本地保留演示数据。')) return;
  try {
    await c.signOut();
    showAuthGate(true);
    renderCloudStatus();
    renderHome();
    showToast('已退出登录');
  } catch (e) {
    showToast('退出失败：' + (e.message || '网络错误'), 'error');
  }
}

// ===== 云端事件回流 =====
function applyCloudBinding(payload) {
  if (!payload) return;
  const b = appData.binding;
  const wasBound = !!b.bound;

  b.bound = !!payload.bound;
  b.status = payload.status || 'unbound';
  if (payload.status === 'signed-out') {
    b.myCode = '';
  } else if (payload.myCode) {
    b.myCode = payload.myCode;
  }
  b.bindDate = payload.bindDate || '';
  b.partnerName = payload.partnerName || 'TA';

  // 云端默认昵称『我 / TA』不覆盖本地已填写的内容，避免首次登录被清空
  if (payload.nickname && payload.nickname !== '我') appData.profile.nickname = payload.nickname;
  if (payload.partnerName && payload.partnerName !== 'TA') appData.profile.partnerName = payload.partnerName;
  if (payload.loveStartDate) appData.profile.loveStartDate = payload.loveStartDate;

  if (!b.bound) {
    b.partnerLocation = '';
    b.partnerBattery = null;
    b.partnerBatterySupported = true;
    b.partnerCharging = false;
    b.partnerStatusAt = '';
    b.partnerWeather = null;
    cloudAlbum = [];
  } else if (!wasBound) {
    cloudAlbum = [];
  }

  saveAppData();
  renderBind();
  renderPartnerStatus();
  renderSettings();
  renderChatPeerStatus();
  renderHomeExtras();
}

function applyPartnerStatus(status) {
  const b = appData.binding;
  if (!status) {
    b.partnerLocation = '';
    b.partnerBattery = null;
    b.partnerBatterySupported = true;
    b.partnerCharging = false;
    b.partnerStatusAt = '';
    b.partnerLat = null;
    b.partnerLng = null;
    return;
  }

  b.partnerLocation = status.address
    || (status.lat != null && status.lng != null
      ? `${Number(status.lat).toFixed(3)}, ${Number(status.lng).toFixed(3)}`
      : '');
  b.partnerBattery = typeof status.battery === 'number' ? status.battery : null;
  b.partnerBatterySupported = status.batterySupported !== false;
  b.partnerCharging = !!status.charging;
  b.partnerLat = status.lat;
  b.partnerLng = status.lng;
  b.partnerStatusAt = status.updatedAt ? nowStr(new Date(status.updatedAt)) : '';
}

function replaceChatMessages(messages, userId) {
  const chat = ensureChatData();
  if (userId) chat.clientId = userId;
  chat.messages = Array.isArray(messages) ? messages : [];
  saveAppData();
}

function handleCloudEvent(event) {
  const detail = event && event.detail ? event.detail : {};
  const type = detail.type;
  const payload = detail.payload;

  switch (type) {
    case 'config':
      renderCloudStatus();
      break;

    case 'auth':
      if (payload && payload.status === 'signed-in') {
        authDemoSkip = false;
        showAuthGate(false);
        setAuthHint('');
      } else if (payload && payload.status === 'signed-out') {
        showAuthGate(true);
      } else if (payload && payload.status === 'demo') {
        // 未配置 Supabase：显示登录页并展开配置区，允许临时进入演示模式
        showAuthGate(!authDemoSkip);
      } else {
        showAuthGate(false);
      }
      renderCloudStatus();
      renderChatPeerStatus();
      break;

    case 'profile': {
      const profile = payload && payload.profile;
      if (!profile) break;
      const localNick = appData.profile.nickname;
      const localStart = appData.profile.loveStartDate;

      if (profile.nickname && profile.nickname !== '我') {
        appData.profile.nickname = profile.nickname;
      } else if (localNick && localNick !== '我' && cloudSignedIn()) {
        // 首次登录：把本地已填写的昵称推送到云端资料
        cloud().saveProfile({ nickname: localNick, loveStartDate: localStart || profile.love_start_date })
          .catch(() => {});
      }

      if (profile.love_start_date) {
        appData.profile.loveStartDate = profile.love_start_date;
      } else if (localStart && cloudSignedIn()) {
        cloud().saveProfile({ nickname: profile.nickname || localNick, loveStartDate: localStart })
          .catch(() => {});
      }

      saveAppData();
      renderBind();
      renderDiaries();
      renderInteract();
      break;
    }

    case 'partner-profile':
      if (payload && payload.nickname) {
        appData.profile.partnerName = payload.nickname;
        appData.binding.partnerName = payload.nickname;
        saveAppData();
        renderPartnerStatus();
        renderBind();
        renderChatPeerStatus();
        renderDiaries();
        renderInteract();
      }
      break;

    case 'binding':
      applyCloudBinding(payload);
      break;

    case 'partner-status':
      applyPartnerStatus(payload);
      saveAppData();
      renderPartnerStatus();
      break;

    case 'my-status':
      break;

    case 'hydrate':
      if (payload) {
        appData.wishes = payload.wishes || [];
        appData.anniversaries = payload.anniversaries || [];
        appData.diaries = payload.diaries || [];
        appData.whispers = payload.whispers || [];
        replaceChatMessages(payload.messages, payload.userId);
        if (payload.partnerStatus) applyPartnerStatus(payload.partnerStatus);
        saveAppData();
        renderHome();
        renderWishModule();
        renderWishes();
        renderAnniversaries();
        renderDiaries();
        renderWhispers();
        renderChat();
      }
      break;

    case 'wishes':
      appData.wishes = Array.isArray(payload) ? payload : [];
      saveAppData();
      renderWishModule();
      renderWishes();
      renderScreenShared();
      break;

    case 'messages':
      replaceChatMessages(payload, cloudInfo() && cloudInfo().user ? cloudInfo().user.id : appData.chat.clientId);
      renderChat();
      if (isChatPageActive()) {
        const unreadIds = markPartnerMessagesRead();
        if (unreadIds.length && cloudBound()) {
          cloud().markMessagesRead(unreadIds).catch(() => {});
          renderChat();
        }
      }
      break;

    case 'anniversaries':
      appData.anniversaries = Array.isArray(payload) ? payload : [];
      saveAppData();
      renderAnniversaries();
      renderHome();
      break;

    case 'diaries':
      appData.diaries = Array.isArray(payload) ? payload : [];
      saveAppData();
      renderDiaries();
      renderHome();
      break;

    case 'whispers':
      appData.whispers = Array.isArray(payload) ? payload : [];
      saveAppData();
      renderWhispers();
      renderHome();
      break;

    case 'album':
      cloudAlbum = Array.isArray(payload) ? payload : [];
      renderAlbum();
      break;

    case 'realtime':
      renderCloudStatus();
      renderChatPeerStatus();
      break;

    case 'location-denied':
      showModal('无法共享位置', `
        <div style="text-align:center; padding:6px 0 14px;">
          <div style="font-size:40px; margin-bottom:10px;">📍</div>
          <p style="line-height:1.7; color:var(--text-primary);">${escapeHtml((payload && payload.message) || '定位权限被拒绝，无法共享位置')}</p>
          <p style="font-size:12px; color:var(--text-secondary); margin-top:8px; line-height:1.7;">
            请在浏览器/系统设置的「位置权限」中允许本页面访问定位，然后重新打开页面。<br>
            未获得定位时，电量仍会正常上报，TA可以看到你的电量。
          </p>
        </div>
      `);
      break;

    case 'error':
      if (payload && payload.message) showToast(payload.message, 'error');
      break;

    default:
      break;
  }
}

// ===== 事件绑定 =====
function bindEvents() {
  // 侧边栏导航
  document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => navigateTo(item.dataset.page));
  });

  // 首页快捷功能
  document.querySelectorAll('.action-card').forEach(card => {
    card.addEventListener('click', () => navigateTo(card.dataset.page));
  });

  // 首页情话刷新
  document.getElementById('refreshQuote').addEventListener('click', showDailyQuote);

  // 纪念日
  document.getElementById('addAnniversaryBtn').addEventListener('click', () => showAnniversaryModal(null));

  // 日记心情选择
  document.querySelectorAll('.mood-item[data-mood]').forEach(item => {
    item.addEventListener('click', () => {
      document.querySelectorAll('.mood-item[data-mood]').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      currentMood = item.dataset.mood;
    });
  });

  // 日记保存/清空
  document.getElementById('saveDiaryBtn').addEventListener('click', saveDiary);
  document.getElementById('clearDiaryBtn').addEventListener('click', () => {
    document.getElementById('diaryTitle').value = '';
    document.getElementById('diaryContent').value = '';
  });

  // 互动标签页
  document.querySelectorAll('.tab').forEach(tab => {
    tab.addEventListener('click', () => switchTab(tab.dataset.tab));
  });

  // 悄悄话
  document.getElementById('sendWhisperBtn').addEventListener('click', sendWhisper);
  document.getElementById('whisperInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendWhisper(); }
  });

  // 心愿
  document.getElementById('addWishBtn').addEventListener('click', addWish);
  document.getElementById('wishInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWish();
  });

  // 默契测试
  document.getElementById('startTestBtn').addEventListener('click', startTest);
  document.getElementById('restartTestBtn').addEventListener('click', restartTest);

  // 设置
  document.getElementById('saveProfileBtn').addEventListener('click', saveProfile);
  document.querySelectorAll('.theme-card').forEach(card => {
    card.addEventListener('click', () => changeTheme(card.dataset.theme));
  });

  // 数据导出导入
  document.getElementById('exportBtn').addEventListener('click', async () => {
    const result = await storageAPI.exportData();
    if (result.success) {
      showToast('数据已导出 📤');
    } else if (result.error) {
      showToast('导出失败：' + result.error, 'error');
    }
  });
  document.getElementById('importBtn').addEventListener('click', async () => {
    const result = await storageAPI.importData();
    if (result.success) {
      appData = mergeWithDefaults(result.data);
      normalizeSharedData();
      await saveAppData();
      showToast('数据已导入 📥');
      renderHome();
      renderSettings();
    } else if (result.error) {
      showToast('导入失败：' + result.error, 'error');
    }
  });

  // ===== 首页模块导航与心愿/相册/同屏 =====
  document.querySelectorAll('.feature-tab').forEach(tab => {
    tab.addEventListener('click', () => switchHomeModule(tab.dataset.module));
  });
  document.getElementById('refreshPickBtn').addEventListener('click', () => renderDailyPick(true));

  // 心愿清单（首页模块）
  document.getElementById('addWishModuleBtn').addEventListener('click', addWishModule);
  document.getElementById('wishModuleInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') addWishModule();
  });
  document.querySelectorAll('#wishAuthorOptions .author-item').forEach(item => {
    item.addEventListener('click', () => {
      newWishAuthor = item.dataset.author;
      document.querySelectorAll('#wishAuthorOptions .author-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
  });
  document.querySelectorAll('#wishFilters .wish-filter').forEach(item => {
    item.addEventListener('click', () => {
      wishFilter = item.dataset.filter;
      document.querySelectorAll('#wishFilters .wish-filter').forEach(el => el.classList.remove('active'));
      item.classList.add('active');
      renderWishModule();
    });
  });

  // 心动聊天
  document.getElementById('chatSendBtn').addEventListener('click', sendChatMessage);
  document.getElementById('chatInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') sendChatMessage();
  });
  document.getElementById('chatSyncBtn').addEventListener('click', refreshChat);

  // 云服务配置与账号
  document.getElementById('saveCloudConfigBtn').addEventListener('click', saveCloudConfig);
  document.getElementById('cloudRefreshBtn').addEventListener('click', refreshCloudData);
  document.getElementById('signOutBtn').addEventListener('click', signOutCloud);
  bindAuthGate();

  // 恋爱相册
  document.getElementById('albumUploadBtn').addEventListener('click', () => {
    document.getElementById('albumFileInput').click();
  });
  document.getElementById('albumFileInput').addEventListener('change', (e) => {
    handleAlbumFiles(e.target.files);
    e.target.value = '';
  });
  document.getElementById('lightboxDeleteBtn').addEventListener('click', deleteLightboxImage);

  // 实时同屏
  document.getElementById('hostScreenBtn').addEventListener('click', hostScreen);
  document.getElementById('joinScreenBtn').addEventListener('click', joinScreen);
  document.getElementById('leaveScreenBtn').addEventListener('click', leaveScreen);
  document.getElementById('copyScreenCodeBtn').addEventListener('click', () => {
    if (screenState.code) fallbackCopy(screenState.code, () => showToast('房间号已复制 📋'));
  });
  document.getElementById('screenCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') joinScreen();
  });

  // 情侣绑定
  document.getElementById('genCodeBtn').addEventListener('click', generateInviteCode);
  document.getElementById('copyCodeBtn').addEventListener('click', copyInviteCode);
  document.getElementById('bindBtn').addEventListener('click', bindPartner);
  document.getElementById('partnerCodeInput').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') bindPartner();
  });
  document.getElementById('unbindBtn').addEventListener('click', unbindPartner);
  document.getElementById('refreshPartnerBtn').addEventListener('click', refreshPartnerStatus);
  document.getElementById('goBindBtn').addEventListener('click', () => navigateTo('bind'));

  // 日记记录人切换
  document.querySelectorAll('#diaryAuthorPicker .author-item').forEach(item => {
    item.addEventListener('click', () => {
      currentDiaryAuthor = item.dataset.author;
      document.querySelectorAll('#diaryAuthorPicker .author-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
  });

  // 悄悄话发送人切换
  document.querySelectorAll('#whisperSenderOptions .author-item').forEach(item => {
    item.addEventListener('click', () => {
      currentWhisperSender = item.dataset.author;
      document.querySelectorAll('#whisperSenderOptions .author-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
    });
  });

  // 弹窗关闭
  document.getElementById('modalClose').addEventListener('click', closeModal);
  document.querySelector('.modal-overlay').addEventListener('click', closeModal);

  // 默认选中第一个心情
  document.querySelector('.mood-item[data-mood="happy"]').classList.add('selected');
}

// ===== 初始化 =====
async function init() {
  createFloatingHearts();
  await loadAppData();

  // 云端模式下不信任本地缓存的绑定态，等 Supabase 返回真实结果
  const c = cloud();
  if (c && c.isConfigured && c.isConfigured()) {
    appData.binding.bound = false;
  }

  normalizeSharedData();
  ensureChatData();
  bindEvents();

  // 应用主题
  const theme = appData.settings.theme || 'romantic';
  if (theme !== 'romantic') {
    document.body.classList.add(`theme-${theme}`);
  }

  renderHome();
  renderChat();
  renderCloudStatus();
  showLoveTip();

  // 挂载 Vue3 恋爱转盘组件
  if (window.mountLoveWheel) {
    window.mountLoveWheel(document.getElementById('vue-wheel-app'), (item) => {
      const hint = document.getElementById('wheelResultHint');
      if (hint) hint.textContent = `今天就决定啦：${item.emoji} ${item.label} 💗`;
      showToast(`抽中：${item.label} ${item.emoji}`);
    });
  }

  // 云端事件监听必须在 init 之前注册，避免漏掉首帧事件
  window.addEventListener('heartbeat-cloud', handleCloudEvent);
  const cloudModule = cloud();
  if (cloudModule && cloudModule.init) {
    cloudModule.init().catch(e => showToast('云端初始化失败：' + (e.message || '未知错误'), 'error'));
  }

  // 定期更新小贴士
  setInterval(showLoveTip, 15000);
}

init();
