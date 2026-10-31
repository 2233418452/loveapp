// ===== 心动伴侣 · 云服务配置 =====
// 在 Supabase 控制台 → Project Settings → API 复制下面两项
// 高德 Key 在 https://console.amap.com/dev/key/app 创建「Web服务」类型 Key
// 注意：这里的 anon key 是公开密钥，可以放在前端；千万不要填写 service_role key。
window.HEARTBEAT_CONFIG = {
  SUPABASE_URL: 'https://YOUR-PROJECT.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY',
  AMAP_KEY: 'YOUR_AMAP_KEY',

  // 自己位置与电量的上报间隔（毫秒）
  LOCATION_INTERVAL_MS: 30000,

  // 逆地理地址缓存时长（毫秒）
  GEOCODE_CACHE_MS: 300000
};
