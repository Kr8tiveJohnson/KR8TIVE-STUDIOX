const multer = require('multer');
const fs = require('fs');
const path = require('path');

const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        // Use the client name from the form input
        const clientName = req.body.clientName || 'default';
        const clientFolder = path.join(__dirname, '../../uploads/clients', clientName, 'originals');
        
        if (!fs.existsSync(clientFolder)) {
            fs.mkdirSync(clientFolder, { recursive: true });
        }
        cb(null, clientFolder);
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage });
module.exports = { upload };