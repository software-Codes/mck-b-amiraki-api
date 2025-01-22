// src/middleware/upload.js
const multer = require('multer');

const upload = multer({
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith('image/')) {
            return cb(new Error('Please upload an image file'));
        }
        cb(null, true);
    }
});

module.exports = upload;