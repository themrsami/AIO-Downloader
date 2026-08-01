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
    loadLocalHistory();
    setupClipboardListener();
});

// Navigation Handler
function setupNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const targetView = item.getAttribute('data-view');
            switchView(targetView);
        });
    });
}

function switchView(targetView) {
    navItems.forEach(i => {
        if (i.getAttribute('data-view') === targetView) i.classList.add('active');
        else i.classList.remove('active');
    });

    viewSections.forEach(sec => sec.classList.remove('active'));
    const activeSec = document.getElementById(`view-${targetView}`);
    if (activeSec) activeSec.classList.add('active');

    activeView = targetView;
    updateHeaderTitle(targetView);

    if (targetView === 'gallery') {
        renderGallery();
    }
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

// LocalStorage Persistent History Management
function getLocalHistory() {
    try {
        return JSON.parse(localStorage.getItem('m3_downloads_history') || '[]');
    } catch (e) {
        return [];
    }
}

function saveLocalHistory(records) {
    localStorage.setItem('m3_downloads_history', JSON.stringify(records));
}

function saveHistoryRecord(record) {
    const history = getLocalHistory();
    const idx = history.findIndex(h => h.id === record.id);
    if (idx >= 0) {
        history[idx] = { ...history[idx], ...record };
    } else {
        history.unshift(record);
    }
    saveLocalHistory(history);
    renderDownloadsList(history);
    renderGallery(history);
}

function loadLocalHistory() {
    const history = getLocalHistory();
    renderDownloadsList(history);
    renderGallery(history);
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
    clearCompletedBtn.addEventListener('click', () => {
        const history = getLocalHistory().filter(d => d.status === 'downloading');
        saveLocalHistory(history);
        renderDownloadsList(history);
        renderGallery(history);
        showSnackbar('Cleared completed downloads history', 'trash-2');
    });

    // Open Downloads Folder
    openDownloadsFolderBtn.addEventListener('click', () => {
        fetch('/api/open-folder', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
    });

    if (changeFolderBtn) {
        changeFolderBtn.addEventListener('click', () => {
            fetch('/api/open-folder', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });
        });
    }

    // Batch Queue Button
    startBatchBtn.addEventListener('click', handleStartBatch);
}

// Handle Fetch Media
async function handleFetchMedia() {
    const url = urlInput.value.trim();
    if (!url) {
        showSnackbar('Please enter an Instagram, Facebook, TikTok, Twitter/X, or Pinterest URL.', 'alert-circle');
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
    dialogPlatform.className = `m3-chip ${media.platform}`;

    selectedQualityIndex = 0;
    qualityOptionsList.innerHTML = '';

    media.qualities.forEach((q, index) => {
        const item = document.createElement('div');
        item.className = `quality-option-item ${index === 0 ? 'selected' : ''}`;
        item.innerHTML = `
            <div>
                <div style="font-weight: 600; font-size: 14px;">${q.quality}</div>
                <div style="font-size: 12px; color: var(--m3-color-on-surface-variant); margin-top: 2px;">Format: ${(q.format || 'MP4').toUpperCase()} | ${q.label || ''}</div>
            </div>
            <span class="badge-quality">${(q.format || 'MP4').toUpperCase()}</span>
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
    showSnackbar('Starting fast media download...', 'zap');

    const q = extractedMedia.qualities[selectedQualityIndex] || extractedMedia.qualities[0];
    const taskId = `dl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const safeTitle = (extractedMedia.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 35);
    const fileName = `${extractedMedia.platform}_${safeTitle}_${Date.now()}.${q.format || 'mp4'}`;

    const record = {
        id: taskId,
        platform: extractedMedia.platform,
        title: extractedMedia.title,
        thumbnail: extractedMedia.thumbnail,
        quality: q.quality,
        format: q.format || 'mp4',
        status: 'downloading',
        percent: 10,
        speedFormatted: 'Downloading...',
        downloadUrl: q.url,
        fileName: fileName,
        timestamp: Date.now()
    };

    saveHistoryRecord(record);

    try {
        const res = await fetch('/api/download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                media: extractedMedia,
                selectedQualityIndex: selectedQualityIndex
            })
        });

        const contentType = res.headers.get('content-type') || '';
        if (contentType.includes('application/json')) {
            const data = await res.json();
            if (data.success) {
                urlInput.value = '';
                record.status = 'completed';
                record.percent = 100;
                record.speedFormatted = 'Completed';
                saveHistoryRecord(record);
            } else {
                record.status = 'error';
                record.speedFormatted = 'Failed';
                saveHistoryRecord(record);
                showSnackbar(`Download Error: ${data.error || 'Failed'}`, 'alert-triangle');
            }
        } else {
            // Binary stream response (Vercel serverless mode)
            const blob = await res.blob();
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = blobUrl;
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

            urlInput.value = '';
            record.status = 'completed';
            record.percent = 100;
            record.speedFormatted = 'Completed';
            record.blobUrl = blobUrl;
            saveHistoryRecord(record);
            showSnackbar('Download completed!', 'check-circle-2');
        }
    } catch (e) {
        record.status = 'error';
        record.speedFormatted = 'Failed';
        saveHistoryRecord(record);
        showSnackbar(`Download Error: ${e.message}`, 'alert-triangle');
    }
}

// Connect WebSocket for Real-time Progress
function connectWebSocket() {
    try {
        const wsProtocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        ws = new WebSocket(`${wsProtocol}//${window.location.host}`);

        ws.onmessage = (event) => {
            const msg = JSON.parse(event.data);
            if (msg.type === 'download_progress' || msg.type === 'progress') {
                updateDownloadProgress(msg.data);
            } else if (msg.type === 'download_completed') {
                if (msg.data) saveHistoryRecord(msg.data);
                showSnackbar('Download Completed!', 'check-circle-2');
            } else if (msg.type === 'download_error') {
                showSnackbar(`Download Error: ${msg.error || 'Failed'}`, 'alert-triangle');
            }
        };

        ws.onclose = () => {
            setTimeout(connectWebSocket, 5000);
        };
    } catch(e) {
        console.log('WebSocket not active in serverless mode.');
    }
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

    const record = getLocalHistory().find(h => h.id === stats.id);
    if (record) {
        record.percent = stats.percent;
        record.speedFormatted = stats.speedFormatted;
        saveLocalHistory(getLocalHistory().map(h => h.id === stats.id ? { ...h, ...stats } : h));
    }
}

// Render Active Downloads List
function renderDownloadsList(downloads) {
    const activeCount = downloads.filter(d => d.status === 'downloading').length;
    activeCountText.textContent = `${activeCount} Active Downloads`;

    if (!downloads || downloads.length === 0) {
        emptyDownloadsState.style.display = 'block';
        downloadsList.innerHTML = '';
        downloadsList.appendChild(emptyDownloadsState);
        return;
    }

    emptyDownloadsState.style.display = 'none';
    downloadsList.innerHTML = '';

    downloads.forEach(d => {
        const card = document.createElement('div');
        card.className = 'download-card';
        card.id = `card_${d.id}`;

        const isDownloading = d.status === 'downloading' || d.status === 'extracting';
        const isCompleted = d.status === 'completed';

        card.innerHTML = `
            <img src="${d.thumbnail || 'https://images.unsplash.com/photo-1611162617213-7d7a39e9b1d7?w=100'}" class="download-thumb" alt="Thumb">
            <div class="download-info">
                <div class="download-title">${d.title || 'Downloading Media...'}</div>
                <div class="download-meta">
                    <span class="badge-quality">${d.quality || 'HD'}</span>
                    <span class="speed-text" style="font-weight: 700; color: var(--m3-color-primary);">${d.speedFormatted || 'Downloading...'}</span>
                    <span class="eta-text">${isDownloading ? (d.etaFormatted || 'In progress...') : (isCompleted ? 'Completed' : 'Failed')}</span>
                </div>
                <div class="m3-progress-container" style="margin-top: 6px;">
                    <div class="m3-progress-bar" style="width: ${d.percent || (isCompleted ? 100 : 20)}%;"></div>
                </div>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span class="progress-percent" style="font-size: 13px; font-weight: 700; min-width: 40px; text-align: right;">${d.percent || (isCompleted ? 100 : 20)}%</span>
                ${isCompleted && d.downloadUrl ? `
                    <a href="${d.downloadUrl}" target="_blank" download class="m3-btn-icon play-btn" title="Download Media" style="color: var(--m3-color-primary); text-decoration: none; display: inline-flex; align-items: center; justify-content: center;">
                        <i data-lucide="download"></i>
                    </a>
                ` : ''}
            </div>
        `;

        downloadsList.appendChild(card);
    });

    lucide.createIcons();
}

// Render Media Gallery
function renderGallery() {
    const downloads = getLocalHistory();
    const completed = downloads.filter(d => d.status === 'completed' || d.downloadUrl);

    if (completed.length === 0) {
        galleryGrid.innerHTML = `
            <div style="grid-column: 1 / -1; text-align: center; padding: 40px; color: var(--m3-color-on-surface-variant);">
                <i data-lucide="folder-open" style="width: 48px; height: 48px; opacity: 0.5; margin-bottom: 12px;"></i>
                <p style="font-size: 15px; font-weight: 500;">No downloaded files yet</p>
                <p style="font-size: 12px; margin-top: 4px;">Completed downloads will automatically appear in your saved gallery.</p>
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
                <div style="position: absolute; top: 8px; left: 8px;" class="m3-chip ${item.platform}">${(item.platform || 'MEDIA').toUpperCase()}</div>
                <a href="${item.downloadUrl || '#'}" target="_blank" download class="m3-btn-icon play-gallery-btn" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); background: rgba(0,0,0,0.6); color: #fff; width: 48px; height: 48px; text-decoration: none; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="download" style="width: 24px; height: 24px;"></i>
                </a>
            </div>
            <div style="margin-top: 10px;">
                <div style="font-size: 13px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${item.title || 'Media Item'}</div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 6px;">
                    <span class="badge-quality">${item.quality || 'HD'}</span>
                    <span style="font-size: 11px; color: var(--m3-color-on-surface-variant);">${(item.format || 'MP4').toUpperCase()}</span>
                </div>
            </div>
        `;

        galleryGrid.appendChild(card);
    });

    lucide.createIcons();
}

// Open Video Player Modal
function openVideoPlayer(filePath, title) {
    playerModalTitle.textContent = title || 'Video Preview';
    playerDialog.classList.add('active');
}

// Handle Batch Multi-Link Download
async function handleStartBatch() {
    const text = batchInput.value.trim();
    if (!text) {
        showSnackbar('Please enter one or more media links.', 'alert-circle');
        return;
    }

    const urls = text.split('\n').map(u => u.trim()).filter(u => u.length > 0);
    showSnackbar(`Batch downloading ${urls.length} URLs...`, 'layers');

    startBatchBtn.disabled = true;
    startBatchBtn.innerHTML = '<i data-lucide="loader-2" class="spin"></i> Batch Processing...';
    lucide.createIcons();

    // Switch view to Downloader section so user sees active progress cards
    switchView('downloader');

    for (let i = 0; i < urls.length; i++) {
        const url = urls[i];
        const taskId = `batch_${Date.now()}_${i}`;

        const initialRecord = {
            id: taskId,
            platform: url.includes('instagram') ? 'instagram' : (url.includes('facebook') ? 'facebook' : (url.includes('tiktok') ? 'tiktok' : (url.includes('twitter') || url.includes('x.com') ? 'twitter' : 'pinterest'))),
            title: `Batch Item ${i + 1}: ${url.substring(0, 30)}...`,
            thumbnail: '',
            quality: 'Auto HD',
            format: 'mp4',
            status: 'extracting',
            percent: 15,
            speedFormatted: 'Extracting metadata...',
            timestamp: Date.now()
        };

        saveHistoryRecord(initialRecord);

        try {
            const extractRes = await fetch('/api/extract', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url })
            });

            const extractData = await extractRes.json();
            if (extractData.success && extractData.media && extractData.media.qualities.length > 0) {
                const media = extractData.media;
                const q = media.qualities[0];

                initialRecord.title = media.title;
                initialRecord.thumbnail = media.thumbnail;
                initialRecord.quality = q.quality;
                initialRecord.status = 'downloading';
                initialRecord.percent = 50;
                initialRecord.speedFormatted = 'Downloading stream...';
                saveHistoryRecord(initialRecord);

                const dlRes = await fetch('/api/download', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ media: media, selectedQualityIndex: 0 })
                });

                const contentType = dlRes.headers.get('content-type') || '';
                if (contentType.includes('application/json')) {
                    const dlData = await dlRes.json();
                    if (dlData.success) {
                        initialRecord.status = 'completed';
                        initialRecord.percent = 100;
                        initialRecord.speedFormatted = 'Completed';
                        initialRecord.downloadUrl = q.url;
                        saveHistoryRecord(initialRecord);
                    }
                } else {
                    const blob = await dlRes.blob();
                    const safeTitle = (media.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 30);
                    const fileName = `${media.platform}_${safeTitle}_${Date.now()}.${q.format || 'mp4'}`;

                    const blobUrl = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = blobUrl;
                    a.download = fileName;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);

                    initialRecord.status = 'completed';
                    initialRecord.percent = 100;
                    initialRecord.speedFormatted = 'Completed';
                    initialRecord.downloadUrl = q.url;
                    saveHistoryRecord(initialRecord);
                }
            } else {
                initialRecord.status = 'error';
                initialRecord.speedFormatted = 'Extraction Failed';
                saveHistoryRecord(initialRecord);
            }
        } catch (e) {
            initialRecord.status = 'error';
            initialRecord.speedFormatted = 'Failed';
            saveHistoryRecord(initialRecord);
        }
    }

    startBatchBtn.disabled = false;
    startBatchBtn.innerHTML = '<i data-lucide="play-circle"></i> Start Batch Download Queue';
    lucide.createIcons();
    showSnackbar('Batch Queue Completed!', 'check-circle-2');
}

// Clipboard Listener
function setupClipboardListener() {
    if (!clipboardToggle || !clipboardToggle.checked) return;

    clipboardCheckInterval = setInterval(async () => {
        try {
            if (document.hasFocus()) {
                const text = await navigator.clipboard.readText();
                if (text && text !== lastClipboardText && isMediaUrl(text)) {
                    lastClipboardText = text;
                    if (urlInput && !urlInput.value) {
                        urlInput.value = text;
                        showSnackbar('Detected media URL in clipboard! Tap Fetch to download.', 'clipboard');
                    }
                }
            }
        } catch (e) {
            // Ignore clipboard permission errors
        }
    }, 3000);
}

function isMediaUrl(text) {
    return text.includes('instagram.com') || text.includes('facebook.com') || text.includes('fb.watch') || text.includes('tiktok.com') || text.includes('twitter.com') || text.includes('x.com') || text.includes('pinterest.com') || text.includes('pin.it');
}

// Toast Snackbar Notification
function showSnackbar(message, iconName = 'info') {
    snackbarMessage.textContent = message;
    snackbarIcon.setAttribute('data-lucide', iconName);
    lucide.createIcons();

    appSnackbar.classList.add('active');
    setTimeout(() => {
        appSnackbar.classList.remove('active');
    }, 4000);
}
