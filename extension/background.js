// Chrome Extension Service Worker Background Script

chrome.runtime.onInstalled.addListener(() => {
    console.log('AIO Media Downloader Extension Installed Successfully!');
    
    // Create Context Menu for 1-click Right-Click Downloads on any Media Link
    chrome.contextMenus.create({
        id: 'aio_download_link',
        title: '⚡ Download with AIO 4K Downloader',
        contexts: ['link', 'video', 'audio']
    });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
    if (info.menuItemId === 'aio_download_link') {
        const targetUrl = info.linkUrl || info.srcUrl || tab.url;
        if (targetUrl) {
            chrome.action.openPopup();
        }
    }
});
