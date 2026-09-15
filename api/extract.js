const instagramScraper = require('./engine/instagramScraper.js');
const facebookScraper = require('./engine/facebookScraper.js');
const tiktokScraper = require('./engine/tiktokScraper.js');
const twitterScraper = require('./engine/twitterScraper.js');
const pinterestScraper = require('./engine/pinterestScraper.js');
const youtubeScraper = require('./engine/youtubeScraper.js');

module.exports = async (req, res) => {
    // Enable CORS
    res.setHeader('Access-Control-Allow-Credentials', true);
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
    res.setHeader(
        'Access-Control-Allow-Headers',
        'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version'
    );

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    const { url } = req.body || req.query || {};
    if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'Please enter a valid media URL.' });
    }

    const cleanUrl = url.trim();

    try {
        let mediaData = null;

        if (cleanUrl.includes('youtube.com') || cleanUrl.includes('youtu.be') || cleanUrl.includes('youtube-nocookie.com') || youtubeScraper.extractVideoId(cleanUrl)) {
            mediaData = await youtubeScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('instagram.com')) {
            mediaData = await instagramScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('facebook.com') || cleanUrl.includes('fb.watch') || cleanUrl.includes('fb.gg')) {
            mediaData = await facebookScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('tiktok.com') || cleanUrl.includes('vt.tiktok.com')) {
            mediaData = await tiktokScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('twitter.com') || cleanUrl.includes('x.com')) {
            mediaData = await twitterScraper.extract(cleanUrl);
        } else if (cleanUrl.includes('pinterest.com') || cleanUrl.includes('pin.it')) {
            mediaData = await pinterestScraper.extract(cleanUrl);
        } else {
            return res.status(400).json({ error: 'Unsupported URL. Supported platforms: YouTube, Instagram, Facebook, TikTok, Twitter/X, and Pinterest.' });
        }

        return res.status(200).json({ success: true, media: mediaData, data: mediaData });
    } catch (e) {
        return res.status(500).json({ error: e.message || 'Media extraction failed.' });
    }
};
