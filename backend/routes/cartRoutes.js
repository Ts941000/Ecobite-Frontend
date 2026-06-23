const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { protect } = require('../middleware/authMiddleware');

// @desc    Get user cart
// @route   GET /api/cart
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const docRef = db.collection('carts').doc(req.user.id);
    const doc = await docRef.get();
    if (!doc.exists) {
      return res.json([]);
    }
    res.json(doc.data().items || []);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Save user cart
// @route   POST /api/cart
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const { items } = req.body;
    const docRef = db.collection('carts').doc(req.user.id);
    await docRef.set({ items, userId: req.user.id, updatedAt: new Date().toISOString() }, { merge: true });
    res.json({ message: 'Cart saved' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
