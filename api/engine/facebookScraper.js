const axios = require('axios');
const cheerio = require('cheerio');

class FacebookScraper {
    constructor() {
        this.desktopHeaders = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate'
        };
        this.mobileHeaders = {
            'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        };
    }

    /**
     * Get all quality formats for a Facebook Video or Reel URL
     */
    async extract(urlStr) {
        if (!urlStr || typeof urlStr !== 'string') {
            throw new Error('Please enter a valid Facebook URL.');
        }

        const cleanUrl = urlStr.trim();
        let mediaData = null;

        // Try Desktop Graph & Direct Parsing
        try {
            mediaData = await this.fetchDesktop(cleanUrl);
        } catch (e) {
            console.log('FB Strategy 1 Desktop error:', e.message);
        }

        // Try Mobile Scrape
        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            try {
                mediaData = await this.fetchMobile(cleanUrl);
            } catch (e) {
                console.log('FB Strategy 2 Mobile error:', e.message);
            }
        }

        // Try Public Web Gateway API
        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            try {
                mediaData = await this.fetchPublicGateway(cleanUrl);
            } catch (e) {
                console.log('FB Strategy 3 Gateway error:', e.message);
            }
        }

        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            throw new Error('Unable to extract video from Facebook URL. Please check that the post or video is public.');
        }

        return mediaData;
    }

    async fetchDesktop(urlStr) {
        const res = await axios.get(urlStr, {
            headers: this.desktopHeaders,
            timeout: 8000,
            maxRedirects: 5
        });
        const html = res.data;
        const cleanHtml = html.replace(/\\u0026/g, '&').replace(/\\/g, '');

        // Extract HD and SD links using multiple regex patterns
        const hdMatches = cleanHtml.match(/"playable_url_quality_hd":"([^"]+)"/) ||
                          cleanHtml.match(/"browser_native_hd_url":"([^"]+)"/) ||
                          cleanHtml.match(/"hd_src":"([^"]+)"/) ||
                          cleanHtml.match(/"hd_src_no_ratelimit":"([^"]+)"/);

        const sdMatches = cleanHtml.match(/"playable_url":"([^"]+)"/) ||
                          cleanHtml.match(/"browser_native_sd_url":"([^"]+)"/) ||
                          cleanHtml.match(/"sd_src":"([^"]+)"/) ||
                          cleanHtml.match(/"sd_src_no_ratelimit":"([^"]+)"/);

        const ogVideo = html.match(/<meta property="og:video" content="([^"]+)"\/>/) ||
                        html.match(/<meta property="og:video:url" content="([^"]+)"\/>/) ||
                        html.match(/<meta property="og:video:secure_url" content="([^"]+)"\/>/);

        const $ = cheerio.load(html);
        const title = $('meta[property="og:title"]').attr('content') ||
                      $('title').text().replace(' | Facebook', '').trim() ||
                      'Facebook Video';
        const thumbnail = $('meta[property="og:image"]').attr('content') || '';

        const qualities = [];

        if (hdMatches && hdMatches[1]) {
            qualities.push({
                quality: '1080p / 720p Full HD (MP4)',
                format: 'mp4',
                type: 'video',
                url: hdMatches[1].replace(/&amp;/g, '&'),
                label: 'High Definition (1080p/720p)'
            });
        }

        if (sdMatches && sdMatches[1]) {
            qualities.push({
                quality: '480p / 360p Standard (MP4)',
                format: 'mp4',
                type: 'video',
                url: sdMatches[1].replace(/&amp;/g, '&'),
                label: 'Standard Definition (480p/360p)'
            });
        } else if (!hdMatches && ogVideo && ogVideo[1]) {
            qualities.push({
                quality: 'HD / SD Video (MP4)',
                format: 'mp4',
                type: 'video',
                url: ogVideo[1].replace(/&amp;/g, '&'),
                label: 'Facebook Video Stream'
            });
        }

        if (qualities.length > 0) {
            qualities.push({
                quality: 'MP3 Audio Stream',
                format: 'mp3',
                type: 'audio',
                url: qualities[0].url,
                label: 'Audio Stream (MP3)'
            });
        }

        if (qualities.length === 0) return null;

        return {
            id: `fb_${Date.now()}`,
            platform: 'facebook',
            title: title.substring(0, 100),
            author: 'Facebook Creator',
            avatar: '',
            thumbnail: thumbnail,
            duration: 'Video',
            isVideo: true,
            originalUrl: urlStr,
            qualities: qualities
        };
    }

    async fetchMobile(urlStr) {
        let mobileUrl = urlStr;
        if (urlStr.includes('facebook.com')) {
            mobileUrl = urlStr.replace('www.facebook.com', 'm.facebook.com');
        }

        const res = await axios.get(mobileUrl, {
            headers: this.mobileHeaders,
            timeout: 8000,
            maxRedirects: 5
        });

        const html = res.data;
        const cleanHtml = html.replace(/\\u0026/g, '&').replace(/\\/g, '');

        const vidMatch = cleanHtml.match(/"playable_url":"([^"]+)"/) || cleanHtml.match(/src="([^"]+\.mp4[^"]*)"/);
        if (!vidMatch) return null;

        const videoUrl = vidMatch[1].replace(/&amp;/g, '&');
        const $ = cheerio.load(html);
        const title = $('title').text().replace(' | Facebook', '').trim() || 'Facebook Video';
        const thumbnail = $('meta[property="og:image"]').attr('content') || '';

        const qualities = [
            {
                quality: 'HD / SD Video (MP4)',
                format: 'mp4',
                type: 'video',
                url: videoUrl,
                label: 'Mobile Video Stream'
            },
            {
                quality: 'MP3 Audio Stream',
                format: 'mp3',
                type: 'audio',
                url: videoUrl,
                label: 'Audio Track'
            }
        ];

        return {
            id: `fb_${Date.now()}`,
            platform: 'facebook',
            title: title.substring(0, 100),
            author: 'Facebook User',
            avatar: '',
            thumbnail: thumbnail,
            duration: 'Video',
            isVideo: true,
            originalUrl: urlStr,
            qualities: qualities
        };
    }

    async fetchPublicGateway(urlStr) {
        // Fast public api fallback gateway
        try {
            const apiRes = await axios.get(`https://api.vkrdown.com/v2/download?url=${encodeURIComponent(urlStr)}`, {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/125.0.0.0' },
                timeout: 6000
            });
            if (apiRes.data && apiRes.data.data && apiRes.data.data.downloads) {
                const downloads = apiRes.data.data.downloads;
                const qualities = [];
                downloads.forEach(d => {
                    if (d.url) {
                        qualities.push({
                            quality: d.quality || 'HD Video (MP4)',
                            format: 'mp4',
                            type: 'video',
                            url: d.url,
                            label: d.quality || 'High Definition'
                        });
                    }
                });
                if (qualities.length > 0) {
                    qualities.push({
                        quality: 'MP3 Audio Stream',
                        format: 'mp3',
                        type: 'audio',
                        url: qualities[0].url,
                        label: 'Audio Stream (MP3)'
                    });
                    return {
                        id: `fb_${Date.now()}`,
                        platform: 'facebook',
                        title: apiRes.data.data.title || 'Facebook Video',
                        author: apiRes.data.data.author || 'Facebook Creator',
                        avatar: '',
                        thumbnail: apiRes.data.data.thumbnail || '',
                        duration: 'Video',
                        isVideo: true,
                        qualities: qualities
                    };
                }
            }
        } catch (e) {
            // Ignore gateway timeout/error
        }
        return null;
    }
}

module.exports = new FacebookScraper();
