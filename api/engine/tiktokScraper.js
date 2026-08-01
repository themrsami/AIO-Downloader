const axios = require('axios');

class TikTokScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
    }

    async extract(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') {
            throw new Error('Please enter a valid TikTok link.');
        }

        let mediaData = null;

        // Strategy 1: TikWM Public API (No-Watermark HD)
        try {
            const res = await axios.post('https://www.tikwm.com/api/', new URLSearchParams({
                url: urlStr,
                count: 12,
                cursor: 0,
                web: 1
            }), { headers: this.headers, timeout: 10000 });

            if (res.data && res.data.code === 0 && res.data.data) {
                const data = res.data.data;
                const qualities = [];

                if (data.play) {
                    qualities.push({
                        quality: 'No-Watermark HD Video (MP4)',
                        format: 'mp4',
                        type: 'video',
                        url: data.play,
                        label: 'No-Watermark HD Stream'
                    });
                }

                if (data.wmplay) {
                    qualities.push({
                        quality: 'Standard Watermarked Video (MP4)',
                        format: 'mp4',
                        type: 'video',
                        url: data.wmplay,
                        label: 'Standard Stream'
                    });
                }

                if (data.music || (data.music_info && data.music_info.play)) {
                    const musicUrl = data.music || data.music_info.play;
                    qualities.push({
                        quality: 'Original Audio Track (MP3)',
                        format: 'mp3',
                        type: 'audio',
                        url: musicUrl,
                        label: 'Original Audio Stream'
                    });
                }

                if (qualities.length > 0) {
                    mediaData = {
                        id: `tt_${data.id || Date.now()}`,
                        platform: 'tiktok',
                        title: data.title || 'TikTok Video',
                        author: data.author ? (data.author.nickname || data.author.unique_id) : 'TikTok Creator',
                        avatar: data.author ? data.author.avatar : '',
                        thumbnail: data.cover || data.origin_cover || (qualities[0] ? qualities[0].url : ''),
                        isVideo: true,
                        qualities: qualities
                    };
                }
            }
        } catch (e) {
            console.log('TikTok Strategy 1 TikWM Error:', e.message);
        }

        // Strategy 2: Page HTML Meta Scrape Fallback
        if (!mediaData) {
            try {
                const pageRes = await axios.get(urlStr, { headers: this.headers, timeout: 10000 });
                const html = pageRes.data;

                const ogVideo = html.match(/meta property="og:video" content="([^"]+)"/);
                const ogTitle = html.match(/meta property="og:title" content="([^"]+)"/);
                const ogImage = html.match(/meta property="og:image" content="([^"]+)"/);

                if (ogVideo && ogVideo[1]) {
                    const videoUrl = ogVideo[1].replace(/&amp;/g, '&');
                    const qualities = [
                        { quality: 'TikTok HD Video (MP4)', format: 'mp4', type: 'video', url: videoUrl, label: 'Direct HD Stream' },
                        { quality: 'Original Audio Track (MP3)', format: 'mp3', type: 'audio', url: videoUrl, label: 'Audio Stream' }
                    ];

                    mediaData = {
                        id: `tt_${Date.now()}`,
                        platform: 'tiktok',
                        title: ogTitle ? ogTitle[1] : 'TikTok Video',
                        author: 'TikTok Creator',
                        avatar: '',
                        thumbnail: ogImage ? ogImage[1] : '',
                        isVideo: true,
                        qualities: qualities
                    };
                }
            } catch (e) {
                console.log('TikTok Strategy 2 HTML Error:', e.message);
            }
        }

        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            throw new Error('Unable to extract video from TikTok URL. Please verify that the video is public.');
        }

        return mediaData;
    }
}

module.exports = new TikTokScraper();
