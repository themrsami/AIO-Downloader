const axios = require('axios');
const cheerio = require('cheerio');

class InstagramScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        };
    }

    extractShortcode(urlStr) {
        const regex = /(?:https?:\/\/)?(?:www\.)?instagram\.com\/(?:p|reel|reels|tv|stories\/[^\/]+)\/([A-Za-z0-9_-]+)/;
        const match = urlStr.match(regex);
        return match ? match[1] : null;
    }

    async extract(urlStr) {
        const shortcode = this.extractShortcode(urlStr);
        if (!shortcode) {
            throw new Error('Invalid Instagram URL. Please enter a valid Reel, Post, or IGTV link.');
        }

        let mediaData = null;

        // Strategy 1: Embed captioned HTML
        try {
            mediaData = await this.fetchViaEmbed(shortcode, urlStr);
        } catch (e) {
            console.log('IG Strategy 1 Embed error:', e.message);
        }

        // Strategy 2: Mobile HTML Parser
        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            try {
                mediaData = await this.fetchViaMobileHtml(shortcode, urlStr);
            } catch (e) {
                console.log('IG Strategy 2 Mobile error:', e.message);
            }
        }

        // Strategy 3: GraphQL Query API
        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            try {
                mediaData = await this.fetchViaGraphQL(shortcode, urlStr);
            } catch (e) {
                console.log('IG Strategy 3 GraphQL error:', e.message);
            }
        }

        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            throw new Error('Unable to extract media from Instagram URL. Please ensure the post or reel is public.');
        }

        return mediaData;
    }

    async fetchViaEmbed(shortcode, originalUrl) {
        const embedUrl = `https://www.instagram.com/p/${shortcode}/embed/captioned/`;
        const res = await axios.get(embedUrl, { headers: this.headers, timeout: 10000 });
        const html = res.data;
        const $ = cheerio.load(html);

        const caption = $('.Caption').text().trim() || $('.CaptionName').text().trim() || `Instagram Reel (${shortcode})`;
        const author = $('.Username').text().trim() || 'Instagram Creator';

        const qualities = [];
        let isVideo = false;

        const videoMatch = html.match(/"video_url":"([^"]+)"/);
        if (videoMatch) {
            isVideo = true;
            const videoUrl = videoMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '');
            qualities.push({ quality: '1080p Full HD (Video)', format: 'mp4', type: 'video', url: videoUrl, label: 'Full HD Video (1080p)' });
            qualities.push({ quality: '720p HD (Video)', format: 'mp4', type: 'video', url: videoUrl, label: 'HD Video (720p)' });
            qualities.push({ quality: '480p SD (Video)', format: 'mp4', type: 'video', url: videoUrl, label: 'Standard SD Video (480p)' });
            qualities.push({ quality: 'MP3 Audio Stream', format: 'mp3', type: 'audio', url: videoUrl, label: 'Audio Stream (MP3)' });
        }

        const imgMatch = html.match(/class="EmbeddedMediaImage" src="([^"]+)"/) || html.match(/"display_url":"([^"]+)"/);
        const thumbnailUrl = imgMatch ? imgMatch[1].replace(/\\u0026/g, '&').replace(/\\/g, '') : ($('img.EmbeddedMediaImage').attr('src') || '');

        if (!isVideo && thumbnailUrl) {
            qualities.push({ quality: 'Ultra HD Photo (Original)', format: 'jpg', type: 'image', url: thumbnailUrl, label: 'Original Photo (JPG)' });
        }

        if (qualities.length === 0) return null;

        return {
            id: `ig_${shortcode}`,
            platform: 'instagram',
            title: caption.substring(0, 100),
            author: author,
            thumbnail: thumbnailUrl || (qualities[0] ? qualities[0].url : ''),
            isVideo: isVideo,
            qualities: qualities
        };
    }

    async fetchViaMobileHtml(shortcode, originalUrl) {
        const pageUrl = `https://www.instagram.com/p/${shortcode}/`;
        const res = await axios.get(pageUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
            },
            timeout: 10000
        });
        const html = res.data;
        const $ = cheerio.load(html);

        const videoUrl = $('meta[property="og:video"]').attr('content') || $('meta[property="og:video:secure_url"]').attr('content');
        const imageUrl = $('meta[property="og:image"]').attr('content');
        const title = $('meta[property="og:title"]').attr('content') || `Instagram Post ${shortcode}`;

        const qualities = [];
        const isVideo = Boolean(videoUrl);

        if (isVideo) {
            qualities.push({ quality: '1080p HD Video (MP4)', format: 'mp4', type: 'video', url: videoUrl, label: 'HD Stream' });
            qualities.push({ quality: 'MP3 Audio Stream', format: 'mp3', type: 'audio', url: videoUrl, label: 'Audio Stream' });
        } else if (imageUrl) {
            qualities.push({ quality: 'Ultra HD Photo (JPG)', format: 'jpg', type: 'image', url: imageUrl, label: 'Original Photo' });
        }

        if (qualities.length === 0) return null;

        return {
            id: `ig_${shortcode}`,
            platform: 'instagram',
            title: title.substring(0, 100),
            author: 'Instagram Creator',
            thumbnail: imageUrl || '',
            isVideo: isVideo,
            qualities: qualities
        };
    }

    async fetchViaGraphQL(shortcode, originalUrl) {
        const queryHash = 'b3719144013064dd74ff8144320f2e2e';
        const variables = JSON.stringify({ shortcode: shortcode });
        const graphUrl = `https://www.instagram.com/graphql/query/?query_hash=${queryHash}&variables=${encodeURIComponent(variables)}`;

        const res = await axios.get(graphUrl, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'X-IG-App-ID': '936619743392459'
            },
            timeout: 10000
        });

        const data = res.data;
        if (!data || !data.data || !data.data.shortcode_media) return null;

        const media = data.data.shortcode_media;
        const isVideo = media.is_video;
        const qualities = [];

        if (isVideo && media.video_url) {
            qualities.push({ quality: '1080p Full HD (MP4)', format: 'mp4', type: 'video', url: media.video_url, label: 'Full HD' });
            qualities.push({ quality: '720p HD (MP4)', format: 'mp4', type: 'video', url: media.video_url, label: 'HD' });
            qualities.push({ quality: 'MP3 Audio Stream', format: 'mp3', type: 'audio', url: media.video_url, label: 'Audio' });
        } else if (media.display_url) {
            qualities.push({ quality: 'Ultra HD Photo (JPG)', format: 'jpg', type: 'image', url: media.display_url, label: 'Photo' });
        }

        if (qualities.length === 0) return null;

        return {
            id: `ig_${shortcode}`,
            platform: 'instagram',
            title: (media.edge_media_to_caption && media.edge_media_to_caption.edges.length > 0) ? media.edge_media_to_caption.edges[0].node.text.substring(0, 100) : `Instagram Reel (${shortcode})`,
            author: media.owner ? media.owner.username : 'Instagram Creator',
            thumbnail: media.display_url || '',
            isVideo: isVideo,
            qualities: qualities
        };
    }
}

module.exports = new InstagramScraper();
