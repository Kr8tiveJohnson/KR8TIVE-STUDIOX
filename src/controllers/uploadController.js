const multer = require('multer');
const path = require('path');
const fs = require('fs');

const storage = multer.diskStorage({
// Inside your multer storage destination function:
destination: (req, file, cb) => {
    const clientName = req.body.clientName || 'events'; // Fallback to 'events'
    const dir = path.join(__dirname, '../../uploads', clientName);
    
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
    cb(null, dir);
}
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });

module.exports = { upload };