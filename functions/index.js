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

// Load calendar data at startup
let calendarData;
try {
    calendarData = require('./private/data/calendar.json');
    console.log('Calendar data loaded successfully');
} catch (error) {
    console.error('Error loading calendar data:', error);
    calendarData = {
        doors: Array(24).fill({
            text: "Default message",
            image: "default.jpg"
        })
    };
}

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

    // Create JWT token with 24-hour expiration
    try {
        const token = jwt.sign({ authenticated: true }, 'your-secret-key', { expiresIn: '24h' });
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
app.get('/api/calendar-data', verifyAuth, (req, res) => {
    res.json(calendarData);
});

app.get('/api/door/:day', verifyAuth, (req, res) => {
    const day = parseInt(req.params.day);
    console.log('Fetching data for door:', day);
    
    if (!calendarData[day.toString()]) {
        console.log('Door not found:', day);
        return res.status(404).json({ error: 'Door not found' });
    }
    
    const doorData = calendarData[day.toString()];
    console.log('Found door data:', doorData);
    
    res.json({
        day: day,
        legend: doorData.legend
    });
});

app.get('/api/door/:day/image', verifyAuth, (req, res) => {
    const day = parseInt(req.params.day);
    console.log('Fetching image for door:', day);
    
    if (!calendarData[day.toString()]) {
        console.log('Door not found:', day);
        return res.status(404).json({ error: 'Door not found' });
    }

    // Look for image file with different extensions
    const possiblePaths = [
        path.join(__dirname, './private/data')
    ];
    const possibleExtensions = ['.jpg', '.JPG', '.jpeg', '.JPEG', '.png', '.PNG'];
    let imagePath = null;

    for (const basePath of possiblePaths) {
        for (const ext of possibleExtensions) {
            const testPath = path.join(basePath, `${day}${ext}`);
            console.log('Checking path:', testPath);
            if (fs.existsSync(testPath)) {
                imagePath = testPath;
                break;
            }
        }
        if (imagePath) break;
    }

    if (!imagePath) {
        console.log('Image not found for door:', day);
        return res.status(404).json({ error: 'Image not found' });
    }

    console.log('Serving image:', imagePath);
    res.sendFile(imagePath);
});

// Export the Express app as a Firebase Cloud Function
exports.app = functions.https.onRequest(app);
