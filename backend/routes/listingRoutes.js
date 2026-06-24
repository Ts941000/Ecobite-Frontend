const express = require('express');
const router = express.Router();
const { getListings, createListing, updateListing, deleteListing } = require('../controllers/listingController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', getListings);
router.post('/', protect, createListing);
router.put('/:id', protect, updateListing);
router.delete('/:id', protect, deleteListing);

module.exports = router;
