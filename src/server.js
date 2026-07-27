const express = require('express');
const cors = require('cors');
const path = require('path');
const dotenv = require('dotenv');
const initDb = require('./db/init');
const photoRoutes = require('./routes/photoRoutes');
const auth = require('./middleware/auth');

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Initialize Database automatically on startup
initDb()
    .then(() => {
        console.log("Database initialized and synced.");
    })
    .catch(err => {
        console.error("Critical database initialization error:", err);
    });

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve Static Frontends
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../gallery.html'));
});

// Admin panel protected by Basic Auth
app.get('/admin', auth, (req, res) => {
    res.sendFile(path.join(__dirname, '../admin.html'));
});

// Serve uploaded images/files statically
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));
app.use('/public', express.static(path.join(__dirname, '../public')));

// Serve favicon explicitly at root so browsers find it automatically
app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/favicon.ico'));
});
app.get('/favicon.png', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/favicon.png'));
});

// Register API Routes
app.use('/api', photoRoutes);

// Catch-all 404 handler
app.use((req, res) => {
    res.status(404).send('Page not found.');
});

// Start Server
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
    console.log(`Admin Portal: http://localhost:${PORT}/admin`);
    console.log(`Client Portal: http://localhost:${PORT}/`);
});