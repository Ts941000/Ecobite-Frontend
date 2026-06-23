const { db } = require('../config/firebase');

// @desc    Get all listings
// @route   GET /api/listings
// @access  Public
const getListings = async (req, res) => {
  try {
    const listingsRef = db.collection('listings');
    const snapshot = await listingsRef.get();
    let listings = [];
    snapshot.forEach(doc => {
      listings.push({ id: doc.id, ...doc.data() });
    });
    res.json(listings);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Create a listing
// @route   POST /api/listings
// @access  Private
const createListing = async (req, res) => {
  try {
    const listingData = req.body;
    
    // Add seller info from the logged-in user
    listingData.sellerId = req.user.id;
    listingData.timestamp = Date.now();

    const listingsRef = db.collection('listings');
    const docRef = await listingsRef.add(listingData);

    res.status(201).json({ id: docRef.id, ...listingData });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getListings,
  createListing
};
