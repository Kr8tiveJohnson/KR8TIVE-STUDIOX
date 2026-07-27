const express = require('express');
const router = express.Router();
const path = require('path');
const fs = require('fs');
const pool = require('../models/db');
const auth = require('../middleware/auth');
const { upload } = require('../controllers/uploadController');

// ================= DATABASE DEBUGGING APIS =================

router.get('/debug-db', async (req, res) => {
    try {
        const testRes = await pool.query("SELECT NOW()");
        res.json({ success: true, time: testRes.rows[0].now });
    } catch (err) {
        res.status(500).json({
            success: false,
            error: err.message,
            stack: err.stack,
            envKeys: Object.keys(process.env).filter(key => key.includes('POSTGRES') || key.includes('DATABASE') || key.includes('DB_'))
        });
    }
});

// ================= CLIENT MANAGEMENT APIS (ADMIN-ONLY) =================

// GET all clients with photo count
router.get('/admin/clients', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT c.id, c.client_name, c.display_name, c.pin, COUNT(p.id)::int as photo_count
            FROM clients c
            LEFT JOIN photos p ON c.id = p.client_id
            GROUP BY c.id
            ORDER BY c.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Failed to query clients:", err);
        res.status(500).json({ error: "Failed to fetch clients from database" });
    }
});

// POST to create a new client
router.post('/admin/clients', auth, async (req, res) => {
    const { clientName, displayName, pin } = req.body;
    if (!clientName || !displayName || !pin) {
        return res.status(400).json({ error: "Display Name, Code, and PIN are required." });
    }

    // Sanitize client slug to prevent directory traversal
    const slug = clientName.trim().toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (!slug) {
        return res.status(400).json({ error: "Invalid client code. Must contain letters, numbers, or hyphens." });
    }

    try {
        const result = await pool.query(
            "INSERT INTO clients (client_name, display_name, pin) VALUES ($1, $2, $3) RETURNING *",
            [slug, displayName.trim(), pin.trim()]
        );

        // Ensure disk directory exists
        const dir = path.join(__dirname, '../../uploads', slug);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error("Failed to create client:", err);
        if (err.code === '23505') { // unique constraint violation
            return res.status(400).json({ error: "A client with this Code or PIN already exists." });
        }
        res.status(500).json({ error: "Failed to register collection in database" });
    }
});

// DELETE a client and all their photos
router.delete('/admin/clients/:clientName', auth, async (req, res) => {
    const clientName = decodeURIComponent(req.params.clientName);

    try {
        // Retrieve client details
        const clientRes = await pool.query("SELECT id FROM clients WHERE client_name = $1", [clientName]);
        if (clientRes.rowCount === 0) {
            return res.status(404).json({ error: "Client not found in database" });
        }

        // Fetch all client photo filenames/URLs so we can clean up storage
        const photosRes = await pool.query(
            "SELECT filename FROM photos WHERE client_id = $1",
            [clientRes.rows[0].id]
        );

        // Delete from database (cascade deletes rows in photos table automatically)
        await pool.query("DELETE FROM clients WHERE client_name = $1", [clientName]);

        // Clean up cloud or local storage files
        const { del } = require('@vercel/blob');
        for (const row of photosRes.rows) {
            const file = row.filename;
            if (file.startsWith('http://') || file.startsWith('https://')) {
                if (process.env.BLOB_READ_WRITE_TOKEN) {
                    try {
                        await del(file);
                    } catch (blobErr) {
                        console.error("Vercel Blob deletion failed for:", file, blobErr);
                    }
                }
            } else {
                const targetPath = path.join(__dirname, '../../uploads', clientName, file);
                if (fs.existsSync(targetPath)) {
                    fs.unlinkSync(targetPath);
                }
            }
        }

        // Delete physical local folder if exists
        const dir = path.join(__dirname, '../../uploads', clientName);
        if (fs.existsSync(dir)) {
            fs.rmSync(dir, { recursive: true, force: true });
        }

        res.json({ message: "Client collection and associated files deleted successfully" });
    } catch (err) {
        console.error("Failed to delete client:", err);
        res.status(500).json({ error: "Failed to remove collection from database" });
    }
});


// ================= PHOTO MANAGEMENT APIS (ADMIN-ONLY) =================

// GET all photos for a specific client
router.get('/photos/:clientName', auth, async (req, res) => {
    const clientName = decodeURIComponent(req.params.clientName);
    
    try {
        const result = await pool.query(`
            SELECT p.filename
            FROM photos p
            JOIN clients c ON p.client_id = c.id
            WHERE c.client_name = $1
            ORDER BY p.uploaded_at DESC
        `, [clientName]);

        res.json(result.rows.map(row => row.filename));
    } catch (err) {
        console.error("Failed to query photos:", err);
        res.status(500).json({ error: "Unable to scan database files" });
    }
});

// POST to upload files for a specific client
router.post('/upload', auth, upload.array('photos'), async (req, res) => {
    const clientName = req.body.clientName || 'events';

    try {
        // Fetch client ID
        const clientRes = await pool.query("SELECT id FROM clients WHERE client_name = $1", [clientName]);
        if (clientRes.rowCount === 0) {
            return res.status(400).json({ error: "Target collection does not exist in database" });
        }
        const clientId = clientRes.rows[0].id;

        const files = req.files || [];
        const { put } = require('@vercel/blob');

        for (const file of files) {
            let fileReference = '';

            // Check if Vercel Blob token is set to determine if we run in Cloud environment
            if (process.env.BLOB_READ_WRITE_TOKEN) {
                // Upload directly to Vercel Blob
                const blobPath = `uploads/${clientName}/${Date.now()}-${file.originalname}`;
                const blob = await put(blobPath, file.buffer, { access: 'public' });
                fileReference = blob.url; // URL becomes the filename reference
            } else {
                // Local disk storage fallback
                const uniqueName = `${Date.now()}-${file.originalname}`;
                const dir = path.join(__dirname, '../../uploads', clientName);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                const targetPath = path.join(dir, uniqueName);
                fs.writeFileSync(targetPath, file.buffer);
                fileReference = uniqueName;
            }

            await pool.query(
                "INSERT INTO photos (client_id, filename, original_name) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
                [clientId, fileReference, file.originalname]
            );
        }

        res.status(200).json({ message: "Upload completed successfully", count: files.length });
    } catch (err) {
        console.error("Failed to record uploads in database:", err);
        res.status(500).json({ error: "Database registration failure during file upload" });
    }
});

// DELETE a specific photo for a specific client
router.delete('/photos/:clientName/:filename', auth, async (req, res) => {
    const clientName = decodeURIComponent(req.params.clientName);
    const filename = decodeURIComponent(req.params.filename);

    try {
        // Delete from database first
        const dbDelete = await pool.query(`
            DELETE FROM photos p
            USING clients c
            WHERE p.client_id = c.id AND c.client_name = $1 AND p.filename = $2
            RETURNING p.id
        `, [clientName, filename]);

        if (dbDelete.rowCount === 0) {
            return res.status(404).json({ error: "File record not found" });
        }

        // Clean up cloud storage or local disk
        const { del } = require('@vercel/blob');
        if (filename.startsWith('http://') || filename.startsWith('https://')) {
            if (process.env.BLOB_READ_WRITE_TOKEN) {
                try {
                    await del(filename);
                } catch (blobErr) {
                    console.error("Failed to delete from Vercel Blob:", filename, blobErr);
                }
            }
        } else {
            const targetPath = path.join(__dirname, '../../uploads', clientName, filename);
            if (fs.existsSync(targetPath)) {
                fs.unlinkSync(targetPath);
            }
        }

        res.status(200).json({ message: "Deleted successfully" });
    } catch (err) {
        console.error("Failed to delete photo:", err);
        res.status(500).json({ error: "Deletion operation failed" });
    }
});


// ================= CLIENT ACCESS APIS (PUBLIC/SECURED BY PIN) =================

// POST check access PIN and fetch associated collection info & photos
router.post('/gallery/access', async (req, res) => {
    const { pin } = req.body;
    if (!pin) {
        return res.status(400).json({ error: "Access PIN is required" });
    }

    try {
        const clientRes = await pool.query(
            "SELECT id, client_name, display_name FROM clients WHERE pin = $1",
            [pin.trim()]
        );

        if (clientRes.rowCount === 0) {
            return res.status(401).json({ error: "Invalid Access PIN. Please try again." });
        }

        const client = clientRes.rows[0];

        // Fetch client photos
        const photosRes = await pool.query(
            "SELECT filename FROM photos WHERE client_id = $1 ORDER BY uploaded_at DESC",
            [client.id]
        );

        res.json({
            success: true,
            clientName: client.client_name,
            displayName: client.display_name,
            photos: photosRes.rows.map(row => row.filename)
        });
    } catch (err) {
        console.error("Gallery access verification failed:", err);
        res.status(500).json({ error: "Authentication system error" });
    }
});

// ================= CONTACT FORM APIS =================

// POST to save a new contact form message (Public)
router.post('/contact', async (req, res) => {
    const { name, email, message, clientName } = req.body;
    if (!name || !email || !message) {
        return res.status(400).json({ error: "Name, Email, and Message are required." });
    }

    try {
        let clientId = null;
        if (clientName) {
            const clientRes = await pool.query("SELECT id FROM clients WHERE client_name = $1", [clientName]);
            if (clientRes.rowCount > 0) {
                clientId = clientRes.rows[0].id;
            }
        }

        await pool.query(
            "INSERT INTO messages (client_id, name, email, message) VALUES ($1, $2, $3, $4)",
            [clientId, name.trim(), email.trim(), message.trim()]
        );
        res.json({ success: true, message: "Your message has been sent successfully!" });
    } catch (err) {
        console.error("Error saving contact message:", err);
        res.status(500).json({ error: "Failed to submit message. Please try again." });
    }
});

// GET all contact messages (Admin only)
router.get('/admin/messages', auth, async (req, res) => {
    try {
        const result = await pool.query(`
            SELECT m.id, m.name, m.email, m.message, m.created_at, c.display_name as client_display_name, c.client_name as client_slug
            FROM messages m
            LEFT JOIN clients c ON m.client_id = c.id
            ORDER BY m.created_at DESC
        `);
        res.json(result.rows);
    } catch (err) {
        console.error("Error retrieving contact messages:", err);
        res.status(500).json({ error: "Failed to retrieve messages." });
    }
});

// DELETE a contact message (Admin only)
router.delete('/admin/messages/:id', auth, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    try {
        const result = await pool.query("DELETE FROM messages WHERE id = $1 RETURNING id", [id]);
        if (result.rowCount === 0) {
            return res.status(404).json({ error: "Message not found." });
        }
        res.json({ message: "Message deleted successfully." });
    } catch (err) {
        console.error("Error deleting contact message:", err);
        res.status(500).json({ error: "Failed to delete message." });
    }
});

module.exports = router;