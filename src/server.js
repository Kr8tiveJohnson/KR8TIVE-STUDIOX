const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

// Simple Basic Auth Middleware
const cors = require('cors');
app.use(cors());
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required.');
    }
    const [user, pass] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    // Change these credentials!
    if (user === 'kr8tiveadmin' && pass === 'studix2026') {
        next();
    } else {
        res.status(401).send('Invalid credentials.');
    }
};

app.use(express.json());
// Protect the admin page
app.get('/admin', auth, (req, res) => { res.sendFile(path.join(__dirname, '../admin.html')); });

// ... rest of your code (keep your routes)
