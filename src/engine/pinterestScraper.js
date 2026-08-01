const axios = require('axios');
const cheerio = require('cheerio');

class PinterestScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        };
    }

    async extract(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') {
            throw new Error('Please enter a valid Pinterest link.');
        }

        let finalUrl = urlStr;
        // Resolve short pin.it links
        if (urlStr.includes('pin.it')) {
            try {
                const res = await axios.get(urlStr, { headers: this.headers, maxRedirects: 5 });
                finalUrl = res.request.res.responseUrl || urlStr;
            } catch (e) {
                console.log('Pinterest redirect resolve error:', e.message);
            }
        }

        let mediaData = null;

        try {
            const pageRes = await axios.get(finalUrl, { headers: this.headers, timeout: 10000 });
            const html = pageRes.data;
            const $ = cheerio.load(html);

            const ogVideo = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
            const ogImage = $('meta[property="og:image"]').attr('content');
            const ogTitle = $('meta[property="og:title"]').attr('content') || 'Pinterest Pin';

            // Check for v.pinimg.com video URLs inside script tags
            let mp4VideoUrl = ogVideo;
            if (!mp4VideoUrl) {
                const videoMatch = html.match(/(https:\/\/[^\"]*v\.pinimg\.com\/videos\/[^\"]*\.mp4)/);
                if (videoMatch) {
                    mp4VideoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
                }
            }

            const qualities = [];
            const isVideo = Boolean(mp4VideoUrl);

            if (isVideo) {
                qualities.push({ quality: '1080p HD Video (MP4)', format: 'mp4', type: 'video', url: mp4VideoUrl, label: 'HD Pin Video' });
                qualities.push({ quality: '720p Video (MP4)', format: 'mp4', type: 'video', url: mp4VideoUrl, label: 'Standard Video' });
                qualities.push({ quality: 'MP3 Audio Stream', format: 'mp3', type: 'audio', url: mp4VideoUrl, label: 'Audio Stream' });
            } else if (ogImage) {
                // High-res image fallback
                const highResImg = ogImage.replace('/236x/', '/originals/').replace('/474x/', '/originals/').replace('/736x/', '/originals/');
                qualities.push({ quality: 'Original Ultra HD Pin (JPG)', format: 'jpg', type: 'image', url: highResImg, label: 'Original Resolution' });
            }

            if (qualities.length > 0) {
                mediaData = {
                    id: `pin_${Date.now()}`,
                    platform: 'pinterest',
                    title: ogTitle.substring(0, 100),
                    author: 'Pinterest Creator',
                    avatar: '',
                    thumbnail: ogImage || (qualities[0] ? qualities[0].url : ''),
                    isVideo: isVideo,
                    qualities: qualities
                };
            }
        } catch (e) {
            console.log('Pinterest Scrape Error:', e.message);
        }

        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            throw new Error('Unable to extract video or media from Pinterest URL. Please verify the pin is public.');
        }

        return mediaData;
    }
}

module.exports = new PinterestScraper();
