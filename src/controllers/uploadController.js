const multer = require('multer');

// Store files in memory buffer (allows dynamic upload to local disk or Vercel Blob)
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

module.exports = { upload };