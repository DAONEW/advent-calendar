const functions = require('firebase-functions');
const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
const path = require('path');
const fs = require('fs');
const secrets = require('./secrets');

const app = express();

// Middleware
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());

// Logging middleware
app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
});

// Calendar data handling
const dataDirectory = path.join(__dirname, 'private', 'data');
let calendarStore = {};
let availableYears = [];
let latestYear = null;

const loadCalendarStore = () => {
    try {
        const directoryEntries = fs.readdirSync(dataDirectory, { withFileTypes: true });
        availableYears = directoryEntries
            .filter(entry => entry.isDirectory() && /^\d{4}$/.test(entry.name))
            .map(entry => entry.name)
            .sort((a, b) => a.localeCompare(b));

        calendarStore = {};
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
        console.log(`Loaded calendar data for years: ${availableYears.join(', ')}`);
    } catch (error) {
        console.error('Error loading calendar directories:', error);
        calendarStore = {};
        availableYears = [];
        latestYear = null;
    }
};

const getRequestedYear = (req) => {
    const requestedYear = req.params.year || req.query.year;
    if (requestedYear && calendarStore[requestedYear]) {
        return requestedYear;
    }
    return latestYear;
};

const getCalendarForRequest = (req) => {
    const year = getRequestedYear(req);
    if (!year || !calendarStore[year]) {
        return null;
    }
    return { year, calendar: calendarStore[year] };
};

loadCalendarStore();

// Authentication endpoint
app.post('/auth', (req, res) => {
    console.log('Auth request received:', req.body);
    const { password } = req.body;

    if (!password) {
        console.log('No password provided');
        return res.status(401).json({ error: 'Password is required' });
    }

    if (password !== secrets.PASSWORD) {
        console.log('Password validation failed');
        return res.status(401).json({ error: 'Invalid password' });
    }

    try {
        const token = jwt.sign({ authenticated: true }, 'your-secret-key', { expiresIn: '30d' });
        console.log('JWT token generated successfully');
        res.json({ success: true, token });
    } catch (error) {
        console.error('Error generating token:', error);
        res.status(500).json({ error: 'Authentication failed' });
    }
});

// Verify authentication middleware
const verifyAuth = (req, res, next) => {
    console.log('Verifying authentication');

    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        console.log('Missing or invalid authorization header');
        return res.status(401).json({ error: 'No token provided' });
    }

    const token = authHeader.split(' ')[1];
    console.log('Token received for verification');

    try {
        const decoded = jwt.verify(token, 'your-secret-key');
        console.log('Token verified successfully');
        req.user = decoded;
        next();
    } catch (error) {
        console.error('Token verification failed:', error);
        res.status(401).json({ error: 'Invalid token' });
    }
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
    const day = parseInt(req.params.day, 10);
    console.log('Fetching data for door:', day);

    const result = getCalendarForRequest(req);
    if (!result) {
        console.log('No calendar data for request');
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorData = result.calendar[day?.toString()];
    if (!doorData) {
        console.log(`Door not found for year ${result.year}:`, day);
        return res.status(404).json({ error: 'Door not found' });
    }

    console.log('Found door data:', doorData);
    res.json({
        year: result.year,
        day,
        legend: doorData.legend,
        hasVideo: Boolean(doorData.video)
    });
});

app.get(doorImageRoutes, verifyAuth, (req, res) => {
    const day = parseInt(req.params.day, 10);
    console.log('Fetching image for door:', day);

    const result = getCalendarForRequest(req);
    if (!result) {
        console.log('No calendar data for request');
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorDataExists = result.calendar[day?.toString()];
    if (!doorDataExists) {
        console.log(`Door not found for year ${result.year}:`, day);
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
            console.log('Checking path:', testPath);
            if (fs.existsSync(testPath)) {
                imagePath = testPath;
                break outer;
            }
        }
    }

    if (!imagePath) {
        console.log(`Image not found for year ${result.year}, door:`, day);
        return res.status(404).json({ error: 'Image not found' });
    }

    const detectedExtension = path.extname(imagePath).toLowerCase();
    if (detectedExtension === '.heic' || detectedExtension === '.heif') {
        res.type('image/heic');
    }

    console.log('Serving image:', imagePath);
    res.sendFile(imagePath);
});

const doorVideoRoutes = ['/api/door/:day/video', '/api/year/:year/door/:day/video'];
app.get(doorVideoRoutes, verifyAuth, (req, res) => {
    const day = parseInt(req.params.day, 10);
    console.log('Fetching video for door:', day);

    const result = getCalendarForRequest(req);
    if (!result) {
        console.log('No calendar data for request');
        return res.status(404).json({ error: 'Calendar data unavailable' });
    }

    const doorData = result.calendar[day?.toString()];
    if (!doorData) {
        console.log(`Door not found for year ${result.year}:`, day);
        return res.status(404).json({ error: 'Door not found' });
    }

    if (!doorData.video) {
        console.log(`Video not flagged for year ${result.year}, door:`, day);
        return res.status(404).json({ error: 'Video not available' });
    }

    const basePath = path.join(dataDirectory, result.year);
    const possibleVideoExtensions = ['.mp4', '.MP4'];
    let videoPath = null;

    for (const ext of possibleVideoExtensions) {
        const testPath = path.join(basePath, `${day}${ext}`);
        console.log('Checking video path:', testPath);
        if (fs.existsSync(testPath)) {
            videoPath = testPath;
            break;
        }
    }

    if (!videoPath) {
        console.log(`Video not found for year ${result.year}, door:`, day);
        return res.status(404).json({ error: 'Video not found' });
    }

    console.log('Serving video:', videoPath);
    res.type('video/mp4');
    res.sendFile(videoPath);
});

// Export the Express app as a Firebase Cloud Function
exports.app = functions.https.onRequest(app);
