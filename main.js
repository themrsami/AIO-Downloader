const { app, BrowserWindow, shell } = require('electron');
const path = require('path');

let mainWindow;

// Initialize the Express & WebSocket server directly inside Electron's Node runtime
// This ensures the packaged .exe works on any PC without requiring Node.js to be installed!
function initServer() {
    try {
        require(path.join(__dirname, 'src', 'server', 'appServer.js'));
    } catch (e) {
        console.error('Server init error:', e);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1240,
        height: 840,
        minWidth: 960,
        minHeight: 650,
        title: 'AIO YouTube Downloader - Desktop Edition',
        backgroundColor: '#0f0f12',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load server URL with auto-retry if server is initializing
    mainWindow.webContents.on('did-fail-load', () => {
        setTimeout(() => {
            if (mainWindow) mainWindow.loadURL('http://localhost:38920');
        }, 500);
    });

    mainWindow.loadURL('http://localhost:38920');

    // Handle external links
    mainWindow.webContents.setWindowOpenHandler(({ url }) => {
        shell.openExternal(url);
        return { action: 'deny' };
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.whenReady().then(() => {
    initServer();
    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
});
