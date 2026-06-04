const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

// 1. Initialize the app first
const app = express();

// 2. Now you can use middleware
app.use(cors()); 
app.use(express.json());

// 3. Define your authentication middleware
const auth = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        res.setHeader('WWW-Authenticate', 'Basic');
        return res.status(401).send('Authentication required.');
    }
    const [user, pass] = Buffer.from(authHeader.split(' ')[1], 'base64').toString().split(':');
    
    if (user === 'kr8tiveadmin' && pass === 'studix2026') {
        next();
    } else {
        res.status(401).send('Invalid credentials.');
    }
};

// 4. Define your routes
app.get('/admin', auth, (req, res) => { 
    res.sendFile(path.join(__dirname, '../admin.html')); 
});

// ... rest of your code