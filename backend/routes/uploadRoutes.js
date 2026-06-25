const express = require('express');
const router = express.Router();
const upload = require('../middleware/uploadMiddleware');
const { protect } = require('../middleware/authMiddleware');
const { bucket } = require('../config/firebase');

// @desc    Upload an image to Firebase Storage
// @route   POST /api/upload
// @access  Private
router.post('/', protect, upload.single('image'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: 'No image file provided' });
  }

  try {
    const filename = `uploads/${req.file.fieldname}-${Date.now()}-${req.file.originalname}`;
    const file = bucket.file(filename);

    // Save the buffer to Firebase Storage
    await file.save(req.file.buffer, {
      metadata: { contentType: req.file.mimetype },
    });

    // Generate a long-lived Signed URL for public access
    const [url] = await file.getSignedUrl({
      action: 'read',
      expires: '01-01-2099', // Valid until year 2099
    });

    res.json({
      message: 'Image uploaded to Firebase successfully',
      imageUrl: url
    });
  } catch (error) {
    console.error('Firebase Storage Upload Error:', error);
    res.status(500).json({ message: 'Failed to upload image to Firebase Storage', error: error.message });
  }
});

module.exports = router;
