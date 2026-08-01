// Initialize Lucide Icons
lucide.createIcons();

// State Variables
let activeView = 'downloader';
let extractedMedia = null;
let selectedQualityIndex = 0;
let downloadsMap = new Map();
let ws = null;
let clipboardCheckInterval = null;
let lastClipboardText = '';

// DOM Elements
const navItems = document.querySelectorAll('.m3-nav-item');
const viewSections = document.querySelectorAll('.view-section');
const pageTitle = document.getElementById('pageTitle');
const themeToggle = document.getElementById('themeToggle');
const paletteBtns = document.querySelectorAll('.palette-btn');

const urlInput = document.getElementById('urlInput');
const pasteBtn = document.getElementById('pasteBtn');
const fetchBtn = document.getElementById('fetchBtn');
const downloadsList = document.getElementById('downloadsList');
const emptyDownloadsState = document.getElementById('emptyDownloadsState');
const activeCountText = document.getElementById('activeCountText');
const clearCompletedBtn = document.getElementById('clearCompletedBtn');

const batchInput = document.getElementById('batchInput');
const batchQualitySelect = document.getElementById('batchQualitySelect');
const startBatchBtn = document.getElementById('startBatchBtn');

const galleryGrid = document.getElementById('galleryGrid');
const openDownloadsFolderBtn = document.getElementById('openDownloadsFolderBtn');

const storagePathInput = document.getElementById('storagePathInput');
const changeFolderBtn = document.getElementById('changeFolderBtn');
const clipboardToggle = document.getElementById('clipboardToggle');

const qualityDialog = document.getElementById('qualityDialog');
const closeQualityDialogBtn = document.getElementById('closeQualityDialogBtn');
const cancelQualityBtn = document.getElementById('cancelQualityBtn');
const confirmDownloadBtn = document.getElementById('confirmDownloadBtn');
const dialogThumb = document.getElementById('dialogThumb');
const dialogTitle = document.getElementById('dialogTitle');
const dialogAuthor = document.getElementById('dialogAuthor');
const dialogPlatform = document.getElementById('dialogPlatform');
const qualityOptionsList = document.getElementById('qualityOptionsList');

const playerDialog = document.getElementById('playerDialog');
const closePlayerDialogBtn = document.getElementById('closePlayerDialogBtn');
const previewVideoPlayer = document.getElementById('previewVideoPlayer');
const playerModalTitle = document.getElementById('playerModalTitle');

const appSnackbar = document.getElementById('appSnackbar');
const snackbarIcon = document.getElementById('snackbarIcon');
const snackbarMessage = document.getElementById('snackbarMessage');
const snackbarActionBtn = document.getElementById('snackbarActionBtn');

// Initialize App
document.addEventListener('DOMContentLoaded', () => {
    setupNavigation();
    setupThemeAndPalette();
    setupEventListeners();
    connectWebSocket();
    fetchDownloadsHistory();
    setupClipboardListener();
});

// Navigation Handler
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            navItems.forEach(i => i.classList.remove('active'));
            item.classList.add('active');

            viewSections.forEach(sec => sec.classList.remove('active'));
            const activeSec = document.getElementById(`view-${targetView}`);
            if (activeSec) activeSec.classList.add('active');

            activeView = targetView;
            updateHeaderTitle(targetView);

            if (targetView === 'gallery') {
                renderGallery();
            }
        });
    });
}

function updateHeaderTitle(view) {
    const titles = {
        downloader: '<i data-lucide="download-cloud" style="color: var(--m3-color-primary)"></i> Media Downloader v3',
        batch: '<i data-lucide="layers" style="color: var(--m3-color-primary)"></i> Batch Multi-Link Downloader',
        gallery: '<i data-lucide="folder-heart" style="color: var(--m3-color-primary)"></i> Downloaded Media Gallery',
        settings: '<i data-lucide="settings" style="color: var(--m3-color-primary)"></i> Preferences & Engine Settings'
    };
    pageTitle.innerHTML = titles[view] || titles.downloader;
    lucide.createIcons();
}

// Theme & Palette Handler
function setupThemeAndPalette() {
    themeToggle.addEventListener('click', () => {
        document.body.classList.toggle('light-theme');
        const isLight = document.body.classList.contains('light-theme');
        themeToggle.innerHTML = isLight ? '<i data-lucide="sun"></i>' : '<i data-lucide="moon"></i>';
        lucide.createIcons();
    });

    paletteBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            const palette = btn.getAttribute('data-palette');
            document.body.setAttribute('data-palette', palette);
            showSnackbar(`Applied ${palette.toUpperCase()} M3 color palette!`, 'palette');
        });
    });
}

// Event Listeners Setup
function setupEventListeners() {
    // Paste Button
    pasteBtn.addEventListener('click', async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (text) {
                urlInput.value = text;
                showSnackbar('Pasted URL from clipboard', 'clipboard-check');
            }
        } catch (e) {
            showSnackbar('Unable to read clipboard. Please paste manually.', 'alert-circle');
        }
    });

    // Fetch Qualities Button
    fetchBtn.addEventListener('click', handleFetchMedia);
    urlInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleFetchMedia();
    });

    // Quality Modal Buttons
    closeQualityDialogBtn.addEventListener('click', closeQualityModal);
    cancelQualityBtn.addEventListener('click', closeQualityModal);
    confirmDownloadBtn.addEventListener('click', handleConfirmDownload);

    // Player Modal Buttons
    closePlayerDialogBtn.addEventListener('click', () => {
        previewVideoPlayer.pause();
        playerDialog.classList.remove('active');
    });

    // Clear Completed Button
    clearCompletedBtn.addEventListener('click', async () => {
        await fetch('/api/clear-history', { method: 'POST' });
        fetchDownloadsHistory();
        showSnackbar('Cleared completed downloads from list', 'trash-2');
    });

    // Open Downloads Folder
    openDownloadsFolderBtn.addEventListener('click', () => {
        fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    });
    changeFolderBtn.addEventListener('click', () => {
        fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    });

    // Batch Queue Button
    startBatchBtn.addEventListener('click', handleStartBatch);
}

// Handle Fetch Media
async function handleFetchMedia() {
    const url = urlInput.value.trim();
    if (!url) {
        showSnackbar('Please enter an Instagram or Facebook URL.', 'alert-circle');
        return;
    }

    fetchBtn.disabled = true;
    fetchBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Extracting...';
    lucide.createIcons();

    try {
        const res = await fetch('/api/extract', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url })
        });
        const data = await res.json();

        if (!data.success) {
            throw new Error(data.error || 'Failed to extract media.');
        }

        extractedMedia = data.media || data.data;
        if (!extractedMedia) {
            throw new Error('Extraction returned invalid media data.');
        }
        openQualityModal(extractedMedia);

    } catch (err) {
        showSnackbar(`Error: ${err.message}`, 'alert-triangle');
    } finally {
        fetchBtn.disabled = false;
        fetchBtn.innerHTML = '<i data-lucide="sparkles"></i> Fetch Qualities';
        lucide.createIcons();
    }
}

// Open Quality Modal
function openQualityModal(media) {
    dialogThumb.src = media.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=150';
    dialogTitle.textContent = media.title || 'Untitled Media';
    dialogAuthor.textContent = `By ${media.author || 'Creator'}`;
    dialogPlatform.textContent = media.platform.toUpperCase();
    dialogPlatform.className = `m3-chip ${media.platform === 'instagram' ? 'ig' : 'fb'}`;

    selectedQualityIndex = 0;
    qualityOptionsList.innerHTML = '';

    media.qualities.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = `quality-option-item ${index === 0 ? 'selected' : ''}`;
        item.innerHTML = `
            <div>
                <div style="font-weight: 600; font-size: 14px;">${q.quality}</div>
                <div style="font-size: 12px; color: var(--m3-color-on-surface-variant); margin-top: 2px;">Format: ${q.format.toUpperCase()} | Type: ${q.type.toUpperCase()}</div>
            </div>
            <span class="badge-quality">${q.format.toUpperCase()}</span>
        `;

        item.addEventListener('click', () => {
            document.querySelectorAll('.quality-option-item').forEach(i => i.classList.remove('selected'));
            item.classList.add('selected');
            selectedQualityIndex = index;
        });

        qualityOptionsList.appendChild(item);
    });

    qualityDialog.classList.add('active');
}

function closeQualityModal() {
    qualityDialog.classList.remove('active');
}

// Handle Confirm Download
async function handleConfirmDownload() {
    if (!extractedMedia || selectedQualityIndex === undefined) return;

    closeQualityModal();
    showSnackbar('Starting ultra-fast multi-chunk download...', 'zap');

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media: extractedMedia,
                selectedQualityIndex: selectedQualityIndex
            })
        });
        const data = await res.json();

        if (data.success) {
            urlInput.value = '';
            fetchDownloadsHistory();
        } else {
            showSnackbar(`Download Error: ${data.error}`, 'alert-triangle');
        }
    } catch (e) {
        showSnackbar(`Error: ${e.message}`, 'alert-triangle');
    }
}

// Connect WebSocket for Real-time Progress
function connectWebSocket() {
    const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        if (msg.type === 'download_progress' || msg.type === 'progress') {
            updateDownloadProgress(msg.data);
        } else if (msg.type === 'download_completed') {
            fetchDownloadsHistory();
            showSnackbar('Download Completed!', 'check-circle-2');
        } else if (msg.type === 'download_error') {
            fetchDownloadsHistory();
            showSnackbar(`Download Error: ${msg.error || 'Failed'}`, 'alert-triangle');
        }
    };

    ws.onclose = () => {
        setTimeout(connectWebSocket, 3000);
    };
}

// Update Download Progress UI
function updateDownloadProgress(stats) {
    const card = document.getElementById(`card_${stats.id}`);
    if (card) {
        const progressBar = card.querySelector('.m3-progress-bar');
        const percentText = card.querySelector('.progress-percent');
        const speedText = card.querySelector('.speed-text');
        const etaText = card.querySelector('.eta-text');

        if (progressBar) progressBar.style.width = `${stats.percent}%`;
        if (percentText) percentText.textContent = `${stats.percent}%`;
        if (speedText) speedText.textContent = stats.speedFormatted;
        if (etaText) etaText.textContent = `ETA: ${stats.etaFormatted}`;
    }
}

// Fetch Downloads History
async function fetchDownloadsHistory() {
    try {
        const res = await fetch('/api/downloads');
        const data = await res.json();

        storagePathInput.value = data.defaultDownloadDir || '';

        const downloads = data.downloads || [];
        downloadsMap.clear();
        downloads.forEach(d => downloadsMap.set(d.id, d));

        renderDownloadsList(downloads);
        renderGallery(downloads);
    } catch (e) {
        console.error('Failed to fetch downloads history:', e.message);
    }
}

// Render Active Downloads List
function renderDownloadsList(downloads) {
    const activeDownloads = downloads.filter(d => d.status === 'downloading' || d.status === 'completed' || d.status === 'error');

    activeCountText.textContent = `${downloads.filter(d => d.status === 'downloading').length} Active Downloads`;

    if (activeDownloads.length === 0) {
        emptyDownloadsState.style.display = 'block';
        downloadsList.innerHTML = '';
        downloadsList.appendChild(emptyDownloadsState);
        return;
    }

    emptyDownloadsState.style.display = 'none';
    downloadsList.innerHTML = '';

    activeDownloads.forEach(d => {
        const card = document.createElement('div');
        card.className = 'download-card';
        card.id = `card_${d.id}`;

        const isDownloading = d.status === 'downloading';
        const isCompleted = d.status === 'completed';

        card.innerHTML = `
            <img src="${d.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=100'}" class="download-thumb" alt="Thumb">
            <div class="download-info">
                <div class="download-title">${d.title}</div>
                <div class="download-meta">
                    <span class="badge-quality">${d.quality}</span>
                    <span class="speed-text" style="font-weight: 700; color: var(--m3-color-primary);">${d.speedFormatted || '0 KB/s'}</span>
                    <span class="eta-text">${isDownloading ? 'ETA: ' + (d.etaFormatted || 'Calculating...') : (isCompleted ? 'Completed' : 'Failed')}</span>
                </div>
                <div class="m3-progress-container" style="margin-top: 6px;">
                    <div class="m3-progress-bar" style="width: ${d.percent || 0}%;"></div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span class="progress-percent" style="font-size: 13px; font-weight: 700; min-width: 40px; text-align: right;">${d.percent || 0}%</span>
                ${isCompleted ? `
                    <button class="m3-btn-icon play-btn" title="Play Video" style="color: var(--m3-color-primary);">
                        <i data-lucide="play-circle"></i>
                    </button>
                    <button class="m3-btn-icon folder-btn" title="Show in Folder">
                        <i data-lucide="folder"></i>
                    </button>
                ` : `
                    <button class="m3-btn-icon cancel-btn" title="Cancel Download" style="color: var(--m3-color-error);">
                        <i data-lucide="x-circle"></i>
                    </button>
                `}
            </div>
        `;

        if (isCompleted) {
            const playBtn = card.querySelector('.play-btn');
            const folderBtn = card.querySelector('.folder-btn');
            playBtn.addEventListener('click', () => openVideoPlayer(d.destPath, d.title));
            folderBtn.addEventListener('click', () => {
                fetch('/api/open-folder', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filePath: d.destPath })
                });
            });
        } else {
            const cancelBtn = card.querySelector('.cancel-btn');
            if (cancelBtn) {
                cancelBtn.addEventListener('click', () => {
                    fetch('/api/cancel', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ id: d.id })
                    });
                });
            }
        }

        downloadsList.appendChild(card);
    });

    lucide.createIcons();
}

// Render Media Gallery
function renderGallery(downloadsListParam) {
    const downloads = downloadsListParam || Array.from(downloadsMap.values());
    const completed = downloads.filter(d => d.status === 'completed');

    if (completed.length === 0) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--m3-color-on-surface-variant);">
                <i data-lucide="folder-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px;"></i>
                <p style="font-size: 15px; font-weight: 500;">No downloaded files yet</p>
            </div>
        `;
        lucide.createIcons();
        return;
    }

    galleryGrid.innerHTML = '';
    completed.forEach(item => {
        const card = document.createElement('div');
        card.className = 'm3-card';
        card.style.padding = '12px';

        card.innerHTML = `
            <div style="position: relative; border-radius: var(--m3-shape-m); overflow: hidden; height: 160px; background: #000;">
                <img src="${item.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=300'}" style="width: 100%; height: 100%; object-fit: cover;">
                <div style="position: absolute; top: 8px; left: 8px;" class="m3-chip ${item.platform}">${item.platform.toUpperCase()}</div>
                <button class="m3-btn-icon play-gallery-btn" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.6); color: #fff; width: 48px; height: 48px;">
                    <i data-lucide="play" style="width: 24px; height: 24px;"></i>
                </button>
            </div>
            <div style="margin-top: 10px;">
                <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                    <span class="badge-quality">${item.quality}</span>
                    <button class="m3-btn-icon open-folder-gallery" title="Show Folder"><i data-lucide="folder"></i></button>
                </div>
            </div>
        `;

        const playBtn = card.querySelector('.play-gallery-btn');
        const folderBtn = card.querySelector('.open-folder-gallery');

        playBtn.addEventListener('click', () => openVideoPlayer(item.destPath, item.title));
        folderBtn.addEventListener('click', () => {
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ filePath: item.destPath })
            });
        });

        galleryGrid.appendChild(card);
    });

    lucide.createIcons();
}

// Open Video Player Modal
function openVideoPlayer(filePath, title) {
    const encodedPath = encodeURIComponent(filePath.replace(/\\/g, '/'));
    previewVideoPlayer.src = `/media/${pathBasename(filePath)}`;
    playerModalTitle.textContent = title || 'Video Preview';
    playerDialog.classList.add('active');
    previewVideoPlayer.play();
}

function pathBasename(str) {
    return str.split(/[\\/]/).pop();
}

// Handle Batch Multi-Link Download
async function handleStartBatch() {
    const text = batchInput.value.trim();
    if (!text) {
        showSnackbar('Please enter one or more Instagram or Facebook links.', 'alert-circle');
        return;
    }

    const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    showSnackbar(`Processing ${urls.length} URLs in batch queue...`, 'layers');

    startBatchBtn.disabled = true;
    for (const url of urls) {
        try {
            const res = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });
            const data = await res.json();
            if (data.success && data.media && data.media.qualities.length > 0) {
                await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ media: data.media, selectedQualityIndex: 0 })
                });
            }
        } catch (e) {
            console.error('Batch extraction error:', e);
        }
    }

    startBatchBtn.disabled = false;
    batchInput.value = '';
    showSnackbar('Batch download queue initialized!', 'check-circle-2');
    fetchDownloadsHistory();
}

// Auto Clipboard Watcher
function setupClipboardListener() {
    if (!clipboardToggle.checked) return;

    clipboardCheckInterval = setInterval(async () => {
        try {
            if (!clipboardToggle.checked) return;
            const text = await navigator.clipboard.readText();
            if (text && text !== lastClipboardText && (text.includes('instagram.com') || text.includes('facebook.com'))) {
                lastClipboardText = text;
                showSnackbar('Detected Instagram/Facebook link in clipboard!', 'clipboard-check', 'DOWNLOAD', () => {
                    urlInput.value = text;
                    handleFetchMedia();
                });
            }
        } catch (e) {
            // Ignore clipboard permission errors silently
        }
    }, 2500);
}

// Show Snackbar Notification
function showSnackbar(msg, iconName = 'info', actionText = null, onAction = null) {
    snackbarMessage.textContent = msg;
    snackbarIcon.setAttribute('data-lucide', iconName);

    if (actionText && onAction) {
        snackbarActionBtn.textContent = actionText;
        snackbarActionBtn.style.display = 'inline-block';
        snackbarActionBtn.onclick = () => {
            onAction();
            appSnackbar.classList.remove('active');
        };
    } else {
        snackbarActionBtn.style.display = 'none';
    }

    lucide.createIcons();
    appSnackbar.classList.add('active');

    setTimeout(() => {
        appSnackbar.classList.remove('active');
    }, 4500);
}
