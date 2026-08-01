const axios = require('axios');

class TwitterScraper {
    constructor() {
        this.headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
            'Accept': 'application/json, text/plain, */*'
        };
    }

    extractTweetId(urlStr) {
        const match = urlStr.match(/(?:twitter\.com|x\.com)\/(?:[A-Za-z0-9_]+)\/status\/([0-9]+)/);
        return match ? match[1] : null;
    }

    async extract(urlStr) {
        const tweetId = this.extractTweetId(urlStr);
        if (!tweetId) {
            throw new Error('Invalid Twitter / X URL. Please enter a valid Tweet link.');
        }

        let mediaData = null;

        // Strategy 1: Twitter Syndication API
        try {
            const synUrl = `https://cdn.syndication.twimg.com/tweet-result?id=${tweetId}&token=x`;
            const res = await axios.get(synUrl, { headers: this.headers, timeout: 10000 });

            if (res.data) {
                const tweet = res.data;
                const qualities = [];
                let isVideo = false;

                // Extract high-res thumbnail image
                let thumbnailUrl = '';
                if (tweet.photos && tweet.photos.length > 0) {
                    thumbnailUrl = tweet.photos[0].url;
                } else if (tweet.mediaDetails && tweet.mediaDetails.length > 0 && tweet.mediaDetails[0].media_url_https) {
                    thumbnailUrl = tweet.mediaDetails[0].media_url_https;
                } else if (tweet.video && tweet.video.poster) {
                    thumbnailUrl = tweet.video.poster;
                }

                if (tweet.video && tweet.video.variants && tweet.video.variants.length > 0) {
                    isVideo = true;

                    // Filter MP4 variants
                    let videoVariants = tweet.video.variants.filter(v => v.type === 'video/mp4' && v.src);

                    // Sort video variants by resolution (width * height) or bitrate descending
                    videoVariants.sort((a, b) => {
                        const matchA = a.src.match(/\/(\d+)x(\d+)\//);
                        const matchB = b.src.match(/\/(\d+)x(\d+)\//);

                        const resA = matchA ? (parseInt(matchA[1], 10) * parseInt(matchA[2], 10)) : (a.bitrate || 0);
                        const resB = matchB ? (parseInt(matchB[1], 10) * parseInt(matchB[2], 10)) : (b.bitrate || 0);

                        return resB - resA;
                    });

                    videoVariants.forEach((v) => {
                        const dimMatch = v.src.match(/\/(\d+)x(\d+)\//);
                        let label = 'HD Video Stream (MP4)';

                        if (dimMatch) {
                            const w = parseInt(dimMatch[1], 10);
                            const h = parseInt(dimMatch[2], 10);
                            const maxDim = Math.max(w, h);

                            if (maxDim >= 1080) label = `1080p Full HD (${w}x${h})`;
                            else if (maxDim >= 720) label = `720p HD (${w}x${h})`;
                            else if (maxDim >= 480) label = `480p SD (${w}x${h})`;
                            else label = `360p Standard (${w}x${h})`;
                        }

                        qualities.push({
                            quality: label,
                            format: 'mp4',
                            type: 'video',
                            url: v.src,
                            label: label
                        });
                    });

                    if (videoVariants.length > 0) {
                        qualities.push({
                            quality: 'MP3 Audio Stream',
                            format: 'mp3',
                            type: 'audio',
                            url: videoVariants[0].src,
                            label: 'Audio Stream'
                        });
                    }
                } else if (tweet.photos && tweet.photos.length > 0) {
                    tweet.photos.forEach((photo, idx) => {
                        qualities.push({
                            quality: `Ultra HD Photo ${idx + 1} (JPG)`,
                            format: 'jpg',
                            type: 'image',
                            url: photo.url,
                            label: `High Res Photo ${idx + 1}`
                        });
                    });
                }

                if (qualities.length > 0) {
                    mediaData = {
                        id: `tw_${tweetId}`,
                        platform: 'twitter',
                        title: tweet.text ? tweet.text.substring(0, 100) : `Tweet (${tweetId})`,
                        author: tweet.user ? (tweet.user.name || tweet.user.screen_name) : 'Twitter User',
                        avatar: tweet.user ? tweet.user.profile_image_url_https : '',
                        thumbnail: thumbnailUrl || (qualities[0] ? qualities[0].url : ''),
                        isVideo: isVideo,
                        qualities: qualities
                    };
                }
            }
        } catch (e) {
            console.log('Twitter Strategy 1 Syndication Error:', e.message);
        }

        // Strategy 2: HTML Page Meta Scrape Fallback
        if (!mediaData) {
            try {
                const pageRes = await axios.get(urlStr, { headers: this.headers, timeout: 10000 });
                const html = pageRes.data;

                const ogVideo = html.match(/meta property="og:video:url" content="([^"]+)"/) || html.match(/meta property="og:video" content="([^"]+)"/);
                const ogImage = html.match(/meta property="og:image" content="([^"]+)"/);
                const ogTitle = html.match(/meta property="og:title" content="([^"]+)"/);

                const qualities = [];
                const isVideo = Boolean(ogVideo);

                if (isVideo) {
                    const videoUrl = ogVideo[1].replace(/&amp;/g, '&');
                    qualities.push({ quality: '1080p HD Video (MP4)', format: 'mp4', type: 'video', url: videoUrl, label: 'HD Stream' });
                    qualities.push({ quality: 'MP3 Audio Stream', format: 'mp3', type: 'audio', url: videoUrl, label: 'Audio Stream' });
                } else if (ogImage) {
                    qualities.push({ quality: 'Ultra HD Photo (JPG)', format: 'jpg', type: 'image', url: ogImage[1].replace(/&amp;/g, '&'), label: 'Original Photo' });
                }

                if (qualities.length > 0) {
                    mediaData = {
                        id: `tw_${tweetId}`,
                        platform: 'twitter',
                        title: ogTitle ? ogTitle[1] : `Tweet (${tweetId})`,
                        author: 'Twitter User',
                        avatar: '',
                        thumbnail: ogImage ? ogImage[1] : '',
                        isVideo: isVideo,
                        qualities: qualities
                    };
                }
            } catch (e) {
                console.log('Twitter Strategy 2 HTML Error:', e.message);
            }
        }

        if (!mediaData || !mediaData.qualities || mediaData.qualities.length === 0) {
            throw new Error('Unable to extract video or media from Twitter / X URL. Please verify the tweet is public.');
        }

        return mediaData;
    }
}

module.exports = new TwitterScraper();
