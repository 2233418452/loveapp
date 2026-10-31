// Electron 主进程 - 心动伴侣桌面应用
const { app, BrowserWindow, ipcMain, dialog, session } = require('electron');
const path = require('path');
const fs = require('fs');
const DEFAULT_DATA = require('./default-data');

// 禁用硬件加速，避免部分显卡驱动兼容性问题
app.disableHardwareAcceleration();

// 应用数据存储路径
const userDataPath = app.getPath('userData');
const dataFilePath = path.join(userDataPath, 'heartbeat-data.json');

function freshDefaultData() {
  return JSON.parse(JSON.stringify(DEFAULT_DATA));
}

// 读取数据
function loadData() {
  const defaults = freshDefaultData();
  try {
    if (fs.existsSync(dataFilePath)) {
      const raw = fs.readFileSync(dataFilePath, 'utf-8');
      const data = JSON.parse(raw);
      // 合并默认数据，确保新字段存在
      return {
        ...defaults,
        ...data,
        profile: { ...defaults.profile, ...data.profile },
        binding: { ...defaults.binding, ...data.binding },
        account: { ...defaults.account, ...data.account },
        chat: { ...defaults.chat, ...data.chat },
        settings: { ...defaults.settings, ...data.settings }
      };
    }
  } catch (e) {
    console.error('加载数据失败:', e);
  }
  return defaults;
}

// 保存数据
function saveData(data) {
  try {
    fs.writeFileSync(dataFilePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (e) {
    console.error('保存数据失败:', e);
    return false;
  }
}

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 650,
    title: '心动伴侣',
    backgroundColor: '#fff0f3',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile('index.html');

  // 开发环境下打开 DevTools
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }
}

// IPC 通信 - 获取数据
ipcMain.handle('get-data', () => {
  return loadData();
});

// IPC 通信 - 保存数据
ipcMain.handle('save-data', (event, data) => {
  return saveData(data);
});

// IPC 通信 - 导出数据
ipcMain.handle('export-data', async () => {
  const data = loadData();
  const result = await dialog.showSaveDialog(mainWindow, {
    title: '导出心动数据',
    defaultPath: `心动伴侣数据_${new Date().toISOString().split('T')[0]}.json`,
    filters: [{ name: 'JSON 文件', extensions: ['json'] }]
  });

  if (!result.canceled && result.filePath) {
    try {
      fs.writeFileSync(result.filePath, JSON.stringify(data, null, 2), 'utf-8');
      return { success: true, path: result.filePath };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, canceled: true };
});

// IPC 通信 - 导入数据
ipcMain.handle('import-data', async () => {
  const result = await dialog.showOpenDialog(mainWindow, {
    title: '导入心动数据',
    filters: [{ name: 'JSON 文件', extensions: ['json'] }],
    properties: ['openFile']
  });

  if (!result.canceled && result.filePaths.length > 0) {
    try {
      const raw = fs.readFileSync(result.filePaths[0], 'utf-8');
      const data = JSON.parse(raw);
      saveData(data);
      return { success: true, data };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
  return { success: false, canceled: true };
});

app.whenReady().then(() => {
  // Electron 默认会拦截定位请求，这里明确放行定位权限
  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation');
  });

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
