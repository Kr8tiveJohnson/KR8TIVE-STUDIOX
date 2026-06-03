const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { upload } = require('../controllers/uploadController');

// 1. Upload Route
router.post('/upload', upload.array('photos', 50), (req, res) => {
    res.status(200).json({ message: "Photos uploaded successfully!" });
});

// 2. GET all photos
router.get('/photos', (req, res) => {
    const directoryPath = path.join(__dirname, '../../uploads/events');
    fs.readdir(directoryPath, (err, files) => {
        if (err) {
            return res.status(500).send("Unable to scan files");
        }
        res.json(files);
    });
});

// 3. DELETE Route (Use 'router', not 'app')
router.delete('/photos/:filename', (req, res) => {
    const filename = decodeURIComponent(req.params.filename);
    // Path: from src/routes/ up to root, then into uploads/events/
    const targetPath = path.join(__dirname, '../../uploads/events', filename);
    
    console.log("Attempting to delete:", targetPath);

    fs.unlink(targetPath, (err) => {
        if (err) {
            console.error("Unlink Error:", err);
            return res.status(404).json({ error: "File not found", path: targetPath });
        }
        res.status(200).json({ message: "Deleted" });
    });
});

module.exports = router;