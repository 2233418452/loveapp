// ===== 心动伴侣 · Supabase 云端同步模块 =====
// 负责：邮箱登录、情侣绑定、位置/电量上报、Realtime 订阅、共享数据读写、相册 Storage
(function () {
  'use strict';

  const CONFIG_KEY = 'heartbeat-cloud-config';
  const EVENT_NAME = 'heartbeat-cloud';
  const ADDRESS_CACHE_MS = 5 * 60 * 1000;
  const LOCATION_NOTIFY_COOLDOWN = 5 * 60 * 1000;

  const state = {
    initialized: false,
    configured: false,
    config: null,
    client: null,
    user: null,
    profile: null,
    pairing: null,
    partnerId: null,
    partnerProfile: null,
    coupleId: null,
    realtime: 'disconnected',
    reportingTimer: null,
    visibilityBound: false,
    channel: null,
    pairingChannel: null,
    profileChannel: null,
    timers: {},
    refreshing: false,
    refreshAgain: false,
    authBusy: false,
    myStatus: null,
    partnerStatus: null,
    lastAddress: '',
    lastAddressAt: 0,
    lastAddressKey: '',
    lastLocationNotifyAt: 0,
    batteryBound: false
  };

  function emit(type, payload) {
    window.dispatchEvent(new CustomEvent(EVENT_NAME, {
      detail: { type, payload: payload === undefined ? null : payload }
    }));
  }

  function isPlaceholder(value) {
    return !value || /YOUR[_-]|你的|示例|placeholder/i.test(String(value));
  }

  function resolveConfig() {
    const base = window.HEARTBEAT_CONFIG || {};
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(CONFIG_KEY) || '{}');
    } catch (e) {
      saved = {};
    }
    return {
      url: String(saved.SUPABASE_URL || base.SUPABASE_URL || '').trim(),
      anonKey: String(saved.SUPABASE_ANON_KEY || base.SUPABASE_ANON_KEY || '').trim(),
      amapKey: String(saved.AMAP_KEY || base.AMAP_KEY || '').trim(),
      locationIntervalMs: Number(base.LOCATION_INTERVAL_MS) || 30000,
      geocodeCacheMs: Number(base.GEOCODE_CACHE_MS) || ADDRESS_CACHE_MS
    };
  }

  function isConfigured() {
    const cfg = resolveConfig();
    return !!(cfg.url && cfg.anonKey && !isPlaceholder(cfg.url) && !isPlaceholder(cfg.anonKey));
  }

  function saveConfig(patch) {
    const current = resolveConfig();
    const next = {
      SUPABASE_URL: (patch.url !== undefined ? patch.url : current.url).trim(),
      SUPABASE_ANON_KEY: (patch.anonKey !== undefined ? patch.anonKey : current.anonKey).trim(),
      AMAP_KEY: (patch.amapKey !== undefined ? patch.amapKey : current.amapKey).trim()
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(next));
    return next;
  }

  function uid(prefix) {
    return `${prefix || 'id'}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function formatDateTime(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }

  function translateAuthError(message) {
    const msg = String(message || '');
    if (/Invalid login credentials/i.test(msg)) return '邮箱或密码错误';
    if (/Email not confirmed/i.test(msg)) return '邮箱还未验证，请先查收确认邮件';
    if (/User already registered/i.test(msg)) return '该邮箱已注册，请直接登录';
    if (/Password should be at least/i.test(msg)) return '密码至少需要 6 位';
    if (/rate limit/i.test(msg)) return '操作太频繁，请稍后再试';
    return msg || '操作失败';
  }

  function getClient() {
    if (!state.client) throw new Error('云端未配置，请先填写 Supabase URL 与 anon key');
    return state.client;
  }

  function requireLogin() {
    if (!state.user) throw new Error('请先登录邮箱账号');
  }

  function requireBound() {
    if (!state.coupleId) throw new Error('还没有绑定情侣，无法同步');
  }

  // ===== 数据映射 =====
  function mapWish(row) {
    return {
      id: row.id,
      text: row.text,
      done: !!row.done,
      deleted: !!row.deleted,
      author: row.author_id === state.user.id ? 'me' : 'partner',
      authorId: row.author_id,
      createdAt: Number(row.created_at) || 0,
      updatedAt: Number(row.updated_at) || 0
    };
  }

  function mapMessage(row) {
    return {
      id: row.id,
      senderId: row.sender_id,
      text: row.text,
      createdAt: Number(row.created_at) || 0,
      readAt: Number(row.read_at) || 0,
      deleted: !!row.deleted
    };
  }

  function mapAnniversary(row) {
    return {
      id: row.id,
      title: row.title,
      date: row.date,
      emoji: row.emoji || '🎉',
      author: row.author_id === state.user.id ? 'me' : 'partner',
      authorId: row.author_id,
      createdAt: Number(row.created_at) || 0
    };
  }

  function mapDiary(row) {
    return {
      id: row.id,
      title: row.title || '无标题',
      content: row.content,
      mood: row.mood || 'happy',
      author: row.author_id === state.user.id ? 'me' : 'partner',
      authorId: row.author_id,
      date: row.date,
      createdAt: Number(row.created_at) || 0
    };
  }

  function mapWhisper(row) {
    return {
      id: row.id,
      text: row.text,
      author: row.author_id === state.user.id ? 'me' : 'partner',
      authorId: row.author_id,
      createdAt: Number(row.created_at) || 0,
      date: new Date(Number(row.created_at) || Date.now()).toLocaleString('zh-CN')
    };
  }

  function mapStatus(row) {
    if (!row) return null;
    return {
      address: row.address || '',
      lat: typeof row.lat === 'number' ? row.lat : null,
      lng: typeof row.lng === 'number' ? row.lng : null,
      accuracy: typeof row.accuracy === 'number' ? row.accuracy : null,
      battery: typeof row.battery === 'number' ? row.battery : null,
      charging: !!row.charging,
      batterySupported: row.battery_supported !== false,
      updatedAt: Number(row.updated_at) || 0
    };
  }

  function bindingPayload() {
    const p = state.pairing;
    const bound = !!(p && p.status === 'active');
    return {
      bound,
      pairingId: p ? p.id : '',
      myCode: p ? (p.invite_code || '') : '',
      bindDate: p && p.bound_at ? formatDateTime(p.bound_at) : '',
      status: p ? p.status : 'unbound',
      partnerName: state.partnerProfile ? (state.partnerProfile.nickname || 'TA') : 'TA',
      partnerId: state.partnerId || '',
      nickname: state.profile ? (state.profile.nickname || '我') : '我',
      loveStartDate: state.profile ? (state.profile.love_start_date || '') : '',
      email: state.user ? state.user.email : ''
    };
  }

  // ===== 登录态 =====
  async function ensureProfile() {
    const client = getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', state.user.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) {
      const { data: created, error: insertError } = await client
        .from('profiles')
        .insert({ id: state.user.id, nickname: '我', updated_at: Date.now() })
        .select('*')
        .single();
      if (insertError) throw insertError;
      state.profile = created;
    } else {
      state.profile = data;
    }
    emit('profile', { profile: state.profile });
  }

  async function afterAuth(session) {
    if (!session || !session.user) return;
    if (state.authBusy) return;
    state.authBusy = true;
    try {
      state.user = { id: session.user.id, email: session.user.email || '' };
      emit('auth', { status: 'signed-in', email: state.user.email });
      await ensureProfile();
      await refreshAll();
      startReporting();
    } catch (e) {
      emit('error', { message: e.message || '加载云端数据失败' });
    } finally {
      state.authBusy = false;
    }
  }

  function resetAuth() {
    state.user = null;
    state.profile = null;
    state.pairing = null;
    state.partnerId = null;
    state.partnerProfile = null;
    state.coupleId = null;
    state.myStatus = null;
    state.partnerStatus = null;
    disposeChannels();
    stopReporting();
    emit('binding', {
      bound: false, myCode: '', bindDate: '', status: 'signed-out',
      partnerName: 'TA', partnerId: '', nickname: '我', email: ''
    });
    emit('partner-status', null);
  }

  async function signIn(email, password) {
    const client = getClient();
    const { data, error } = await client.auth.signInWithPassword({
      email: String(email || '').trim(),
      password: String(password || '')
    });
    if (error) throw new Error(translateAuthError(error.message));
    if (!data.session) throw new Error('登录失败，请检查邮箱与密码');
    await afterAuth(data.session);
  }

  async function signUp(email, password) {
    const client = getClient();
    const { data, error } = await client.auth.signUp({
      email: String(email || '').trim(),
      password: String(password || '')
    });
    if (error) throw new Error(translateAuthError(error.message));
    if (data.session) {
      await afterAuth(data.session);
      return { signedIn: true };
    }
    return { signedIn: false, needConfirm: true };
  }

  async function signOut() {
    const client = getClient();
    await client.auth.signOut();
    resetAuth();
    emit('auth', { status: 'signed-out' });
  }

  async function init() {
    if (state.initialized) return;
    state.initialized = true;

    const cfg = resolveConfig();
    state.config = cfg;
    if (!isConfigured()) {
      state.configured = false;
      emit('config', { configured: false });
      emit('auth', { status: 'demo' });
      return;
    }

    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
      emit('error', { message: 'Supabase 客户端未加载（vendor/supabase.js）' });
      return;
    }

    state.configured = true;
    state.client = window.supabase.createClient(cfg.url, cfg.anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
      }
    });
    emit('config', { configured: true, url: cfg.url });

    state.client.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        resetAuth();
        emit('auth', { status: 'signed-out' });
        return;
      }
      if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session && !state.user) {
        afterAuth(session);
      }
    });

    try {
      const { data } = await state.client.auth.getSession();
      if (data && data.session) {
        await afterAuth(data.session);
      } else {
        emit('auth', { status: 'signed-out' });
      }
    } catch (e) {
      emit('error', { message: e.message || '读取登录状态失败' });
    }
  }

  // ===== 情侣绑定 =====
  async function refreshPairing() {
    const client = getClient();
    requireLogin();
    const { data, error } = await client
      .from('pairings')
      .select('*')
      .or(`user_a.eq.${state.user.id},user_b.eq.${state.user.id}`)
      .limit(1);
    if (error) throw error;
    state.pairing = (data && data[0]) || null;
    if (state.pairing && state.pairing.status === 'active') {
      state.coupleId = state.pairing.id;
      state.partnerId = state.pairing.user_a === state.user.id
        ? state.pairing.user_b
        : state.pairing.user_a;
    } else {
      state.coupleId = null;
      state.partnerId = null;
      state.partnerStatus = null;
    }
  }

  async function loadPartnerProfile() {
    if (!state.partnerId) {
      state.partnerProfile = null;
      return;
    }
    const client = getClient();
    const { data, error } = await client
      .from('profiles')
      .select('*')
      .eq('id', state.partnerId)
      .maybeSingle();
    if (error) throw error;
    state.partnerProfile = data || null;
    emit('partner-profile', {
      nickname: state.partnerProfile ? (state.partnerProfile.nickname || 'TA') : 'TA'
    });
  }

  async function createInvite() {
    const client = getClient();
    requireLogin();
    const { data, error } = await client.rpc('create_invite');
    if (error) throw new Error(error.message || '生成邀请码失败');
    const info = Array.isArray(data) ? data[0] : data;
    await refreshAll();
    emit('binding', bindingPayload());
    return {
      code: info ? info.code : (state.pairing ? state.pairing.invite_code : ''),
      expiresAt: info ? info.expires_at : ''
    };
  }

  async function joinByCode(code) {
    const client = getClient();
    requireLogin();
    const { error } = await client.rpc('join_pairing', { p_code: String(code || '').trim() });
    if (error) throw new Error(error.message || '绑定失败');
    await refreshAll();
    emit('binding', bindingPayload());
    return bindingPayload();
  }

  async function leavePairing() {
    requireLogin();
    const client = getClient();
    const cid = state.coupleId;
    if (cid) {
      try {
        const { data: files } = await client.storage.from('album').list(cid);
        if (files && files.length) {
          await client.storage.from('album').remove(files.map(f => `${cid}/${f.name}`));
        }
      } catch (e) {
        // 清空相册失败不影响解绑
      }
    }
    const { error } = await client.rpc('leave_pairing');
    if (error) throw new Error(error.message || '解绑失败');
    await refreshAll();
    emit('binding', bindingPayload());
  }

  async function saveProfile(patch) {
    requireLogin();
    const client = getClient();
    const nickname = (patch && patch.nickname ? String(patch.nickname).trim() : '') || '我';
    const loveStartDate = patch && patch.loveStartDate ? patch.loveStartDate : null;
    const { error } = await client
      .from('profiles')
      .update({ nickname, love_start_date: loveStartDate, updated_at: Date.now() })
      .eq('id', state.user.id);
    if (error) throw new Error(error.message || '保存资料失败');
    state.profile = { ...(state.profile || {}), id: state.user.id, nickname, love_start_date: loveStartDate };
    emit('profile', { profile: state.profile });
  }

  // ===== 实时订阅 =====
  function disposeChannels() {
    const client = state.client;
    if (!client) return;
    [state.channel, state.pairingChannel, state.profileChannel].forEach(ch => {
      if (ch) {
        try { client.removeChannel(ch); } catch (e) { /* ignore */ }
      }
    });
    state.channel = null;
    state.pairingChannel = null;
    state.profileChannel = null;
  }

  function subscribePairing() {
    if (!state.pairing || !state.client) return;
    if (state.pairingChannel) {
      try { state.client.removeChannel(state.pairingChannel); } catch (e) { /* ignore */ }
    }
    state.pairingChannel = state.client
      .channel(`pairing-${state.pairing.id}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'pairings',
        filter: `id=eq.${state.pairing.id}`
      }, () => {
        refreshAll().catch(e => emit('error', { message: e.message }));
      })
      .subscribe();
  }

  function subscribeProfile() {
    if (!state.partnerId || !state.client) return;
    if (state.profileChannel) {
      try { state.client.removeChannel(state.profileChannel); } catch (e) { /* ignore */ }
    }
    state.profileChannel = state.client
      .channel(`partner-profile-${state.partnerId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'profiles',
        filter: `id=eq.${state.partnerId}`
      }, () => {
        loadPartnerProfile().then(() => emit('binding', bindingPayload()))
          .catch(e => emit('error', { message: e.message }));
      })
      .subscribe();
  }

  function scheduleReload(key, fn) {
    clearTimeout(state.timers[key]);
    state.timers[key] = setTimeout(() => {
      fn().catch(e => emit('error', { message: e.message || '实时数据刷新失败' }));
    }, 300);
  }

  function subscribeCouple() {
    if (!state.coupleId || !state.client) return;
    if (state.channel) {
      try { state.client.removeChannel(state.channel); } catch (e) { /* ignore */ }
    }
    const cid = state.coupleId;
    const config = (table, column) => ({
      event: '*',
      schema: 'public',
      table,
      filter: `${column}=eq.${cid}`
    });

    const reloadWishes = () => scheduleReload('wishes', async () => {
      const rows = await selectRows('wishes', cid, 'created_at');
      emit('wishes', rows.map(mapWish));
    });
    const reloadMessages = () => scheduleReload('messages', async () => {
      const rows = await selectRows('messages', cid, 'created_at');
      emit('messages', rows.map(mapMessage));
    });
    const reloadAnniversaries = () => scheduleReload('anniversaries', async () => {
      const rows = await selectRows('anniversaries', cid, 'created_at');
      emit('anniversaries', rows.map(mapAnniversary));
    });
    const reloadDiaries = () => scheduleReload('diaries', async () => {
      const rows = await selectRows('diaries', cid, 'created_at');
      emit('diaries', rows.map(mapDiary));
    });
    const reloadWhispers = () => scheduleReload('whispers', async () => {
      const rows = await selectRows('whispers', cid, 'created_at');
      emit('whispers', rows.map(mapWhisper));
    });

    state.channel = state.client
      .channel(`couple-${cid}`)
      .on('postgres_changes', config('device_status', 'couple_id'), () => {
        scheduleReload('device', loadDeviceStatuses);
      })
      .on('postgres_changes', config('wishes', 'couple_id'), reloadWishes)
      .on('postgres_changes', config('messages', 'couple_id'), reloadMessages)
      .on('postgres_changes', config('anniversaries', 'couple_id'), reloadAnniversaries)
      .on('postgres_changes', config('diaries', 'couple_id'), reloadDiaries)
      .on('postgres_changes', config('whispers', 'couple_id'), reloadWhispers)
      .on('postgres_changes', config('album_photos', 'couple_id'), () => {
        scheduleReload('album', loadAlbum);
      })
      .subscribe((status) => {
        state.realtime = status;
        emit('realtime', { status });
      });
  }

  async function selectRows(table, cid, orderColumn) {
    const client = getClient();
    let query = client.from(table).select('*').eq('couple_id', cid);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  }

  async function loadDeviceStatuses() {
    if (!state.coupleId) return;
    const rows = await selectRows('device_status', state.coupleId);
    const mine = rows.find(r => r.user_id === state.user.id);
    const partner = rows.find(r => r.user_id === state.partnerId);
    state.myStatus = mine ? mapStatus(mine) : null;
    state.partnerStatus = partner ? mapStatus(partner) : null;
    emit('partner-status', state.partnerStatus);
    emit('my-status', state.myStatus);
  }

  async function loadAlbum() {
    if (!state.coupleId) {
      emit('album', []);
      return;
    }
    const client = getClient();
    const { data: rows, error } = await client
      .from('album_photos')
      .select('*')
      .eq('couple_id', state.coupleId)
      .eq('deleted', false)
      .order('created_at', { ascending: false });
    if (error) throw new Error(error.message);

    let signed = [];
    if (rows && rows.length) {
      const paths = rows.map(r => r.storage_path);
      const res = await client.storage.from('album').createSignedUrls(paths, 86400);
      signed = (res.data || []).map(x => x.signedUrl);
    }

    const items = (rows || []).map((row, index) => ({
      id: row.id,
      name: row.name || '照片',
      dataUrl: signed[index] || '',
      storagePath: row.storage_path,
      date: new Date(Number(row.created_at) || Date.now()).toISOString(),
      createdAt: Number(row.created_at) || 0,
      author: row.uploader_id === state.user.id ? 'me' : 'partner'
    }));
    emit('album', items);
  }

  // ===== 全量加载 =====
  async function doRefresh() {
    requireLogin();
    await refreshPairing();
    emit('binding', bindingPayload());

    if (!state.pairing) {
      state.coupleId = null;
      emit('partner-status', null);
      return;
    }

    if (state.pairing.status !== 'active') {
      // 等待对方输入邀请码
      state.coupleId = null;
      subscribePairing();
      emit('partner-status', null);
      return;
    }

    await loadPartnerProfile();
    await loadDeviceStatuses();
    await hydrateShared();
    await loadAlbum();
    subscribePairing();
    subscribeCouple();
    subscribeProfile();
    emit('binding', bindingPayload());
  }

  async function refreshAll() {
    if (state.refreshing) {
      state.refreshAgain = true;
      return;
    }
    state.refreshing = true;
    try {
      do {
        state.refreshAgain = false;
        await doRefresh();
      } while (state.refreshAgain);
    } finally {
      state.refreshing = false;
    }
  }

  async function hydrateShared() {
    const cid = state.coupleId;
    const client = getClient();
    const [wishes, messages, anniversaries, diaries, whispers] = await Promise.all([
      selectRows('wishes', cid, 'created_at'),
      selectRows('messages', cid, 'created_at'),
      selectRows('anniversaries', cid, 'created_at'),
      selectRows('diaries', cid, 'created_at'),
      selectRows('whispers', cid, 'created_at')
    ]);
    emit('hydrate', {
      userId: state.user.id,
      wishes: wishes.map(mapWish),
      messages: messages.map(mapMessage),
      anniversaries: anniversaries.map(mapAnniversary),
      diaries: diaries.map(mapDiary),
      whispers: whispers.map(mapWhisper),
      partnerStatus: state.partnerStatus,
      myStatus: state.myStatus,
      partnerId: state.partnerId
    });
  }

  // ===== 位置 / 电量 =====
  async function readBattery() {
    if (!navigator.getBattery) {
      return { supported: false, level: null, charging: null };
    }
    try {
      const battery = await navigator.getBattery();
      return {
        supported: true,
        level: Math.max(0, Math.min(100, Math.round(battery.level * 100))),
        charging: !!battery.charging
      };
    } catch (e) {
      return { supported: false, level: null, charging: null };
    }
  }

  function bindBatteryEvents() {
    if (state.batteryBound || !navigator.getBattery) return;
    state.batteryBound = true;
    try {
      navigator.getBattery().then(battery => {
        const handler = () => { reportOnce().catch(() => {}); };
        battery.addEventListener('levelchange', handler);
        battery.addEventListener('chargingchange', handler);
      });
    } catch (e) {
      // 忽略电量事件绑定失败
    }
  }

  function notifyLocationIssue(code, message) {
    const now = Date.now();
    if (now - state.lastLocationNotifyAt < LOCATION_NOTIFY_COOLDOWN) return;
    state.lastLocationNotifyAt = now;
    emit('location-denied', {
      code,
      message: message || '定位权限被拒绝，无法共享位置'
    });
  }

  function acquirePosition() {
    return new Promise(resolve => {
      if (!navigator.geolocation) {
        notifyLocationIssue('unsupported', '当前设备不支持定位，无法共享位置');
        resolve(null);
        return;
      }
      navigator.geolocation.getCurrentPosition(
        pos => resolve({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: pos.coords.accuracy
        }),
        err => {
          const denied = err && err.code === 1;
          notifyLocationIssue(
            denied ? 'denied' : 'failed',
            denied ? '定位权限被拒绝，无法共享位置' : '定位失败，请检查定位服务是否开启'
          );
          resolve(null);
        },
        { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
      );
    });
  }

  function formatAddress(parts) {
    const city = (parts.city || parts.province || '').trim();
    const district = (parts.district || '').trim();
    if (city && district) return `${city} · ${district}`;
    return city || district || '';
  }

  async function amapReverse(lat, lng) {
    const key = (state.config && state.config.amapKey) || '';
    if (!key || isPlaceholder(key)) return '';
    try {
      const url = `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(key)}&location=${lng},${lat}&extensions=base&radius=1000`;
      const res = await fetch(url);
      if (!res.ok) return '';
      const data = await res.json();
      if (data.status !== '1' || !data.regeocode) return '';
      const comp = data.regeocode.addressComponent || {};
      return formatAddress({
        city: Array.isArray(comp.city) ? '' : comp.city,
        province: Array.isArray(comp.province) ? '' : comp.province,
        district: Array.isArray(comp.district) ? '' : comp.district
      }) || (data.regeocode.formatted_address || '');
    } catch (e) {
      return '';
    }
  }

  async function osmReverse(lat, lng) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}&accept-language=zh-CN`;
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) return '';
      const data = await res.json();
      const a = data.address || {};
      return formatAddress({
        city: a.city || a.town || a.county || a.state,
        province: a.state,
        district: a.city_district || a.suburb || a.district || a.county
      }) || (data.display_name || '');
    } catch (e) {
      return '';
    }
  }

  async function reverseGeocode(lat, lng) {
    const key = `${lat.toFixed(4)},${lng.toFixed(4)}`;
    const now = Date.now();
    if (state.lastAddressKey === key && now - state.lastAddressAt < (state.config.geocodeCacheMs || ADDRESS_CACHE_MS)) {
      return state.lastAddress;
    }
    let address = await amapReverse(lat, lng);
    if (!address) address = await osmReverse(lat, lng);
    if (address) {
      state.lastAddress = address;
      state.lastAddressAt = now;
      state.lastAddressKey = key;
    }
    return address;
  }

  async function reportOnce() {
    if (!state.user) return;
    const position = await acquirePosition();
    const battery = await readBattery();

    let address = state.lastAddress;
    if (position) {
      const addr = await reverseGeocode(position.lat, position.lng);
      if (addr) address = addr;
    }

    if (!state.coupleId) return;

    const prev = state.myStatus || {};
    const row = {
      user_id: state.user.id,
      couple_id: state.coupleId,
      lat: position ? position.lat : (prev.lat !== undefined ? prev.lat : null),
      lng: position ? position.lng : (prev.lng !== undefined ? prev.lng : null),
      accuracy: position ? position.accuracy : (prev.accuracy !== undefined ? prev.accuracy : null),
      address: address || prev.address || null,
      battery: battery.supported ? battery.level : null,
      charging: battery.supported ? battery.charging : null,
      battery_supported: battery.supported,
      updated_at: Date.now()
    };

    try {
      const client = getClient();
      const { error } = await client
        .from('device_status')
        .upsert(row, { onConflict: 'user_id' });
      if (error) throw new Error(error.message);
      state.myStatus = mapStatus(row);
      emit('my-status', state.myStatus);
    } catch (e) {
      emit('error', { message: '状态上报失败：' + (e.message || '网络错误') });
    }
  }

  function startReporting() {
    if (state.reportingTimer) return;
    bindBatteryEvents();
    reportOnce().catch(() => {});
    state.reportingTimer = setInterval(() => {
      reportOnce().catch(() => {});
    }, (state.config && state.config.locationIntervalMs) || 30000);

    if (!state.visibilityBound) {
      state.visibilityBound = true;
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') {
          reportOnce().catch(() => {});
        }
      });
    }
  }

  function stopReporting() {
    if (state.reportingTimer) {
      clearInterval(state.reportingTimer);
      state.reportingTimer = null;
    }
  }

  async function refreshPartnerStatus() {
    requireLogin();
    await refreshPairing();
    if (!state.coupleId) return null;
    await loadDeviceStatuses();
    return state.partnerStatus;
  }

  // ===== 心愿 =====
  async function createWish(wish) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('wishes').insert({
      id: wish.id,
      couple_id: state.coupleId,
      text: wish.text,
      done: !!wish.done,
      deleted: !!wish.deleted,
      author_id: state.user.id,
      created_at: Number(wish.createdAt) || Date.now(),
      updated_at: Number(wish.updatedAt) || Date.now()
    });
    if (error) throw new Error(error.message || '心愿同步失败');
  }

  async function updateWish(wish) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client
      .from('wishes')
      .update({
        text: wish.text,
        done: !!wish.done,
        deleted: !!wish.deleted,
        updated_at: Number(wish.updatedAt) || Date.now()
      })
      .eq('id', wish.id)
      .eq('couple_id', state.coupleId);
    if (error) throw new Error(error.message || '心愿同步失败');
  }

  // ===== 聊天 =====
  async function sendMessage(message) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('messages').insert({
      id: message.id,
      couple_id: state.coupleId,
      sender_id: state.user.id,
      text: message.text,
      created_at: Number(message.createdAt) || Date.now(),
      read_at: 0,
      deleted: false
    });
    if (error) throw new Error(error.message || '消息发送失败');
  }

  async function markMessagesRead(ids) {
    requireLogin();
    if (!state.coupleId || !ids || !ids.length) return;
    const client = getClient();
    const { error } = await client
      .from('messages')
      .update({ read_at: Date.now() })
      .in('id', ids)
      .eq('couple_id', state.coupleId)
      .neq('sender_id', state.user.id);
    if (error) throw new Error(error.message || '已读回执同步失败');
  }

  // ===== 纪念日 / 日记 / 悄悄话 =====
  async function saveAnniversary(item) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('anniversaries').upsert({
      id: item.id,
      couple_id: state.coupleId,
      title: item.title,
      date: item.date,
      emoji: item.emoji || '🎉',
      author_id: item.authorId || state.user.id,
      created_at: Number(item.createdAt) || Date.now()
    }, { onConflict: 'id' });
    if (error) throw new Error(error.message || '纪念日同步失败');
  }

  async function deleteAnniversary(id) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('anniversaries').delete()
      .eq('id', id).eq('couple_id', state.coupleId);
    if (error) throw new Error(error.message || '删除失败');
  }

  async function saveDiary(item) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('diaries').upsert({
      id: item.id,
      couple_id: state.coupleId,
      title: item.title,
      content: item.content,
      mood: item.mood,
      author_id: item.authorId || state.user.id,
      date: item.date,
      created_at: Number(item.createdAt) || Date.now()
    }, { onConflict: 'id' });
    if (error) throw new Error(error.message || '日记同步失败');
  }

  async function deleteDiary(id) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('diaries').delete()
      .eq('id', id).eq('couple_id', state.coupleId);
    if (error) throw new Error(error.message || '删除失败');
  }

  async function sendWhisper(item) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('whispers').insert({
      id: item.id,
      couple_id: state.coupleId,
      text: item.text,
      author_id: state.user.id,
      created_at: Number(item.createdAt) || Date.now()
    });
    if (error) throw new Error(error.message || '悄悄话发送失败');
  }

  async function deleteWhisper(id) {
    requireLogin();
    requireBound();
    const client = getClient();
    const { error } = await client.from('whispers').delete()
      .eq('id', id).eq('couple_id', state.coupleId);
    if (error) throw new Error(error.message || '删除失败');
  }

  // ===== 相册 =====
  function dataUrlToBlob(dataUrl) {
    const [meta, base64] = String(dataUrl || '').split(',');
    const mime = (/data:(.*?);base64/.exec(meta || '') || [])[1] || 'image/jpeg';
    const binary = atob(base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new Blob([bytes], { type: mime });
  }

  async function uploadPhoto(dataUrl, name) {
    requireLogin();
    requireBound();
    const client = getClient();
    const id = uid('p');
    const path = `${state.coupleId}/${id}.jpg`;
    const blob = dataUrlToBlob(dataUrl);
    const { error: storageError } = await client.storage
      .from('album')
      .upload(path, blob, { contentType: 'image/jpeg', cacheControl: '3600', upsert: false });
    if (storageError) throw new Error(storageError.message || '照片上传失败');

    const { error: dbError } = await client.from('album_photos').insert({
      id,
      couple_id: state.coupleId,
      uploader_id: state.user.id,
      name: name || '照片',
      storage_path: path,
      created_at: Date.now(),
      deleted: false
    });
    if (dbError) {
      try { await client.storage.from('album').remove([path]); } catch (e) { /* ignore */ }
      throw new Error(dbError.message || '照片记录保存失败');
    }
    await loadAlbum();
    return id;
  }

  async function deletePhoto(item) {
    requireLogin();
    requireBound();
    const client = getClient();
    if (item.storagePath) {
      try { await client.storage.from('album').remove([item.storagePath]); } catch (e) { /* ignore */ }
    }
    const { error } = await client.from('album_photos').delete()
      .eq('id', item.id).eq('couple_id', state.coupleId);
    if (error) throw new Error(error.message || '删除照片失败');
    await loadAlbum();
  }

  function isBound() {
    return !!(state.pairing && state.pairing.status === 'active' && state.coupleId);
  }

  function getState() {
    return {
      configured: state.configured,
      user: state.user,
      pairing: state.pairing,
      partnerId: state.partnerId,
      partnerProfile: state.partnerProfile,
      partnerStatus: state.partnerStatus,
      myStatus: state.myStatus,
      realtime: state.realtime
    };
  }

  window.HeartbeatCloud = {
    init,
    isConfigured,
    isBound,
    getConfig: resolveConfig,
    saveConfig,
    signIn,
    signUp,
    signOut,
    createInvite,
    joinByCode,
    leavePairing,
    saveProfile,
    refreshAll,
    refreshPartnerStatus,
    createWish,
    updateWish,
    sendMessage,
    markMessagesRead,
    saveAnniversary,
    deleteAnniversary,
    saveDiary,
    deleteDiary,
    sendWhisper,
    deleteWhisper,
    uploadPhoto,
    deletePhoto,
    reportOnce,
    startReporting,
    getState,
    uid
  };
})();
