const { onRequest } = require('firebase-functions/v2/https');
const { defineSecret } = require('firebase-functions/params');
const { createHash, timingSafeEqual } = require('node:crypto');
const express = require('express');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const calendarPassword = defineSecret('CALENDAR_PASSWORD');
const signingKey = defineSecret('CALENDAR_JWT_KEY');
const digest = value => createHash('sha256').update(value).digest();
const tokenAudience = 'advent-calendar-media';
const tokenIssuer = 'advent-calendar';

const app = express();

app.disable('x-powered-by');
app.use((req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    next();
});
app.use(express.json({ limit: '2kb' }));

// Calendar data handling
const dataDirectory = path.join(__dirname, 'private', 'data');
let calendarStore = Object.create(null);
let availableYears = [];
let latestYear = null;

const loadCalendarStore = () => {
    try {
        const directoryEntries = fs.readdirSync(dataDirectory, { withFileTypes: true });
        availableYears = directoryEntries
            .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));

        calendarStore = Object.create(null);
        availableYears.forEach(year => {
            const calendarPath = path.join(dataDirectory, year, 'calendar.json');
            if (!fs.existsSync(calendarPath)) {
                console.warn(`calendar.json not found for year ${year}`);
                return;
            }

            try {
                const fileContents = fs.readFileSync(calendarPath, 'utf8');
                const normalized = fileContents.replace(/^\uFEFF/, '');
                calendarStore[year] = JSON.parse(normalized);
            } catch (error) {
                console.error(`Failed to parse calendar data for ${year}:`, error);
            }
        });

        latestYear = availableYears[availableYears.length - 1] || null;
    } catch (error) {
        console.error('Error loading calendar directories:', error);
        calendarStore = Object.create(null);
        availableYears = [];
        latestYear = null;
    }
};

const getRequestedYear = (req) => {
    const requestedYear = req.params.year ?? req.query.year;
    if (requestedYear === undefined) return latestYear;
    return typeof requestedYear === 'string' && Object.hasOwn(calendarStore, requestedYear)
        ? requestedYear : null;
};

const getCalendarForRequest = (req) => {
    const year = getRequestedYear(req);
    if (!year || !calendarStore[year]) {
        return null;
    }
    return { year, calendar: calendarStore[year] };
};

loadCalendarStore();

app.post('/auth', (req, res) => {
    const expected = calendarPassword.value();
    const key = signingKey.value();
    if (!expected || !key || Buffer.byteLength(key) < 32) {
        return res.status(503).json({ error: 'Authentication unavailable' });
    }
    const password = req.body?.password;
    if (typeof password !== 'string' || !timingSafeEqual(digest(password), digest(expected))) {
        return res.status(401).json({ error: 'Invalid password' });
    }
    const token = jwt.sign({ authenticated: true }, key, {
        algorithm: 'HS256', expiresIn: '7d', audience: tokenAudience, issuer: tokenIssuer,
    });
    return res.json({ success: true, token });
});

const verifyAuth = (req, res, next) => {
    const raw = req.get('Authorization') || '';
    const match = /^Bearer ([A-Za-z0-9_.-]+)$/i.exec(raw);
    const key = signingKey.value();
    if (!match || !key || Buffer.byteLength(key) < 32) {
        return res.status(401).json({ error: 'Sign in first' });
    }
    try {
        const decoded = jwt.verify(match[1], key, {
            algorithms: ['HS256'], audience: tokenAudience, issuer: tokenIssuer,
        });
        if (decoded.authenticated !== true || typeof decoded.exp !== 'number') {
            return res.status(401).json({ error: 'Invalid token' });
        }
    } catch {
        return res.status(401).json({ error: 'Invalid token' });
    }
    return next();
};

// Verify authentication status
app.get('/verify-auth', verifyAuth, (req, res) => {
    res.json({ authenticated: true });
});

// Protected routes
app.get('/api/available-years', verifyAuth, (req, res) => {
    res.json({ years: availableYears });
});

app.get('/api/calendar-data', verifyAuth, (req, res) => {
    const result = getCalendarForRequest(req);
    if (!result) {
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    res.json({
        year: result.year,
        doors: result.calendar
    });
});

const doorRoutes = ['/api/door/:day', '/api/year/:year/door/:day'];
const doorImageRoutes = ['/api/door/:day/image', '/api/year/:year/door/:day/image'];
app.get(doorRoutes, verifyAuth, (req, res) => {
    const day = /^(?:[1-9]|1\d|2[0-4])$/.test(req.params.day) ? Number(req.params.day) : 0;

    const result = getCalendarForRequest(req);
    if (!result) {
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorData = result.calendar[day?.toString()];
    if (!doorData) {
        return res.status(404).json({ error: 'Door not found' });
    }

    res.json({
        year: result.year,
        day,
        legend: doorData.legend,
        hasVideo: Boolean(doorData.video),
        videoAspect: doorData.videoAspect,
        videoLegend: doorData.videoLegend
    });
});

app.get(doorImageRoutes, verifyAuth, (req, res) => {
    const day = /^(?:[1-9]|1\d|2[0-4])$/.test(req.params.day) ? Number(req.params.day) : 0;

    const result = getCalendarForRequest(req);
    if (!result) {
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorDataExists = result.calendar[day?.toString()];
    if (!doorDataExists) {
        return res.status(404).json({ error: 'Door not found' });
    }

    const basePath = path.join(dataDirectory, result.year);
    const possibleExtensions = [
        '.jpg', '.JPG',
        '.jpeg', '.JPEG',
        '.png', '.PNG',
        '.heic', '.HEIC',
        '.heif', '.HEIF'
    ];
    const requestedSize = req.query.size;
    const sizeSuffixes = [];
    if (requestedSize === 'mobile') {
        sizeSuffixes.push('-mobile');
    }
    sizeSuffixes.push('');

    let imagePath = null;
    outer:
    for (const suffix of sizeSuffixes) {
        for (const ext of possibleExtensions) {
            const testPath = path.join(basePath, `${day}${suffix}${ext}`);
            if (fs.existsSync(testPath)) {
                imagePath = testPath;
                break outer;
            }
        }
    }

    if (!imagePath) {
        return res.status(404).json({ error: 'Image not found' });
    }

    const detectedExtension = path.extname(imagePath).toLowerCase();
    if (detectedExtension === '.heic' || detectedExtension === '.heif') {
        res.type('image/heic');
    }

    res.sendFile(imagePath);
});

const doorVideoRoutes = ['/api/door/:day/video', '/api/year/:year/door/:day/video'];
app.get(doorVideoRoutes, verifyAuth, (req, res) => {
    const day = /^(?:[1-9]|1\d|2[0-4])$/.test(req.params.day) ? Number(req.params.day) : 0;

    const result = getCalendarForRequest(req);
    if (!result) {
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorData = result.calendar[day?.toString()];
    if (!doorData) {
        return res.status(404).json({ error: 'Door not found' });
    }

    if (!doorData.video) {
        return res.status(404).json({ error: 'Video not available' });
    }

    const basePath = path.join(dataDirectory, result.year);
    const possibleVideoExtensions = ['.mp4', '.MP4'];
    let videoPath = null;

    for (const ext of possibleVideoExtensions) {
        const testPath = path.join(basePath, `${day}${ext}`);
        if (fs.existsSync(testPath)) {
            videoPath = testPath;
            break;
        }
    }

    if (!videoPath) {
        return res.status(404).json({ error: 'Video not found' });
    }

    res.type('video/mp4');
    if (req.query.chunk === undefined) return res.sendFile(videoPath);

    const chunkSize = 8 * 1024 * 1024;
    const totalBytes = fs.statSync(videoPath).size;
    const totalChunks = Math.ceil(totalBytes / chunkSize);
    const requested = req.query.chunk;
    const chunk = typeof requested === 'string' && /^(0|[1-9]\d{0,5})$/.test(requested)
        ? Number(requested) : -1;
    if (chunk < 0 || chunk >= totalChunks) {
        return res.status(416).json({ error: 'Video chunk unavailable' });
    }
    const start = chunk * chunkSize;
    const end = Math.min(totalBytes, start + chunkSize) - 1;
    res.set({ 'X-Video-Chunks': String(totalChunks), 'X-Video-Bytes': String(totalBytes),
        'Content-Length': String(end - start + 1) });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(videoPath, { start, end });
    res.on('close', () => stream.destroy());
    stream.on('error', () => res.destroy());
    return stream.pipe(res);
});

// Export the Express app as a Firebase Cloud Function
exports.app = onRequest({ secrets: [calendarPassword, signingKey] }, app);
