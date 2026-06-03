const express = require('express');
const path = require('path');
const fs = require('fs');
const app = express();

app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// 1. DELETE ROUTE (Place it before your routes/photoRoutes if you want to override)
app.delete('/api/photos/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    const filePath = path.join(__dirname, '..', 'uploads', 'events', filename);

    console.log("Server deleting:", filePath);

    fs.unlink(filePath, (err) => {
        if (err) {
            console.error("Delete Error:", err);
            return res.status(404).json({ message: "File not found" });
        }
        res.status(200).json({ message: "Deleted successfully" });
    });
});

// 2. OTHER ROUTES
const photoRoutes = require('./routes/photoRoutes'); 
app.use('/api', photoRoutes);

app.get('/admin', (req, res) => { res.sendFile(path.join(__dirname, '../admin.html')); });
app.get('/gallery', (req, res) => { res.sendFile(path.join(__dirname, '../gallery.html')); });

app.listen(3000, () => console.log('Server running on port 3000'));

app.get('/gallery/:clientName', (req, res) => {
    const client = req.params.clientName;
    // Serve the gallery.html but inject the client name so the JS knows which folder to fetch
    res.sendFile(path.join(__dirname, '../gallery.html'));
});