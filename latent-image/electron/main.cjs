// Desktop shell for Latent Image. Loads the Vite build (or the dev server
// when LATENT_DEV_URL is set) in a plain window with no menu bar.
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('node:path');
const { startPhoneServer } = require('./phoneServer.cjs');

let mainWindow = null;

function createWindow() {
  const win = new BrowserWindow({
    width: 1600,
    height: 900,
    minWidth: 1100,
    minHeight: 640,
    backgroundColor: '#14110d',
    title: 'Latent Image',
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
  });
  win.removeMenu();
  mainWindow = win;
  win.on('closed', () => {
    if (mainWindow === win) mainWindow = null;
  });

  // F11 fullscreen, Ctrl+Shift+I devtools (menu is removed so wire them here).
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    if (input.key === 'F11') {
      win.setFullScreen(!win.isFullScreen());
      event.preventDefault();
    } else if (input.control && input.shift && input.key.toLowerCase() === 'i') {
      win.webContents.toggleDevTools();
      event.preventDefault();
    }
  });

  // Verification hook: LATENT_SNAPSHOT=out.png saves a screenshot after a delay and quits.
  const snap = process.env.LATENT_SNAPSHOT;
  if (snap) {
    win.webContents.on('console-message', (e) => console.log('[page]', e.message));
    setTimeout(async () => {
      const img = await win.webContents.capturePage();
      require('node:fs').writeFileSync(snap, img.toPNG());
      app.quit();
    }, Number(process.env.LATENT_SNAPSHOT_DELAY || 30000));
  }

  const devUrl = process.env.LATENT_DEV_URL;
  if (devUrl) win.loadURL(devUrl);
  else win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'), snap ? { query: { debug: '1' } } : undefined);
  if (snap && process.env.LATENT_EVAL) {
    win.webContents.on('did-finish-load', () => {
      const js = `(async () => { while (!(window.__game && window.__game.current)) await new Promise(r => setTimeout(r, 200)); await new Promise(r => setTimeout(r, 1500)); ${process.env.LATENT_EVAL} })().catch(e => console.log('eval error ' + e))`;
      win.webContents.executeJavaScript(js).catch(() => undefined);
    });
  }
}

app.whenReady().then(() => {
  startPhoneServer({ userDataDir: app.getPath('userData'), getWindow: () => mainWindow, ipcMain });
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => app.quit());
