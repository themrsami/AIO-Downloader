const axios = require('axios');

module.exports = async (req, res) => {
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

    const { url, qualityUrl, fileName, title, platform, media, selectedQualityIndex } = req.body || req.query || {};

    let targetUrl = url || qualityUrl;
    let targetFileName = fileName;

    if (media && media.qualities) {
        const idx = selectedQualityIndex || 0;
        const q = media.qualities[idx] || media.qualities[0];
        targetUrl = q.url;
        const safeTitle = (media.title || 'media').replace(/[^a-zA-Z0-9_\-\s]/g, '').trim().substring(0, 35);
        targetFileName = `${media.platform}_${safeTitle}_${Date.now()}.${q.format || 'mp4'}`;
    }

    if (!targetUrl) {
        return res.status(400).json({ error: 'Download URL is required.' });
    }

    const saveFileName = targetFileName || `media_${Date.now()}.mp4`;

    try {
        // Stream directly to client browser attachment for Vercel Serverless
        const response = await axios({
            method: 'get',
            url: targetUrl,
            responseType: 'stream',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36'
            },
            timeout: 30000
        });

        res.setHeader('Content-Type', response.headers['content-type'] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${saveFileName}"`);

        if (response.headers['content-length']) {
            res.setHeader('Content-Length', response.headers['content-length']);
        }

        response.data.pipe(res);

    } catch (e) {
        return res.status(500).json({ error: e.message || 'Stream download proxy failed.' });
    }
};
