// GET all photos for a specific client
router.get('/photos/:clientName', (req, res) => {
    const clientName = decodeURIComponent(req.params.clientName);
    const directoryPath = path.join(__dirname, '../../uploads', clientName);

    if (!fs.existsSync(directoryPath)) {
        // Return an empty array instead of 404 to avoid frontend crashes
        return res.json([]); 
    }

    fs.readdir(directoryPath, (err, files) => {
        if (err) return res.status(500).json({ error: "Unable to scan files" });
        res.json(files);
    });
});

// DELETE a specific photo for a specific client
router.delete('/photos/:clientName/:filename', (req, res) => {
    const clientName = decodeURIComponent(req.params.clientName);
    const filename = decodeURIComponent(req.params.filename);
    const targetPath = path.join(__dirname, '../../uploads', clientName, filename);

    fs.unlink(targetPath, (err) => {
        if (err) return res.status(404).json({ error: "File not found" });
        res.status(200).json({ message: "Deleted" });
    });
});