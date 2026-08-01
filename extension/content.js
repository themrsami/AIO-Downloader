// Content Script: Injects a subtle 1-click Floating Download Button on YouTube, IG, TikTok, Twitter, FB pages

(function() {
    if (window.aioInjected) return;
    window.aioInjected = true;

    function injectFloatingButton() {
        if (document.getElementById('aio-floating-dl-btn')) return;

        const btn = document.createElement('button');
        btn.id = 'aio-floating-dl-btn';
        btn.innerHTML = '⚡ AIO Download';
        btn.style.cssText = `
            position: fixed;
            bottom: 24px;
            right: 24px;
            z-index: 999999;
            padding: 10px 16px;
            background: linear-gradient(135deg, #6366f1, #a855f7);
            color: #ffffff;
            border: none;
            border-radius: 30px;
            font-family: 'Segoe UI', system-ui, sans-serif;
            font-size: 13px;
            font-weight: 700;
            cursor: pointer;
            box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
            transition: all 0.2s ease-in-out;
        `;

        btn.onmouseover = () => btn.style.transform = 'scale(1.06)';
        btn.onmouseout = () => btn.style.transform = 'scale(1.0)';

        btn.onclick = () => {
            alert(`AIO Downloader:\nOpen your Chrome Extension popup icon at top-right to extract and download this page's 4K/HD video!`);
        };

        document.body.appendChild(btn);
    }

    setTimeout(injectFloatingButton, 1500);
})();
