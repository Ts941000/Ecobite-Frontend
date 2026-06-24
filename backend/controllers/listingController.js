const { db } = require('../config/firebase');

function normalizeListingPayload(body, user, existing = {}) {
  const { id, ownerId, sellerId, ...listingData } = body;
  const now = new Date().toISOString();

  return {
    id,
    data: {
      ...listingData,
      ownerId: existing.ownerId || ownerId || user.id,
      sellerId: existing.sellerId || sellerId || user.id,
      updatedAt: now,
    },
  };
}

function ownsListing(listing, userId) {
  const ownerIds = [listing.ownerId, listing.sellerId].filter(Boolean);
  return ownerIds.length === 0 || ownerIds.includes(userId);
}

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
    const listingsRef = db.collection('listings');
    const { id, data } = normalizeListingPayload(req.body, req.user);

    if (id) {
      req.params.id = id;
      return updateListing(req, res);
    }

    const listingData = {
      ...data,
      createdAt: new Date().toISOString(),
      timestamp: Date.now(),
    };

    const docRef = await listingsRef.add(listingData);

    res.status(201).json({ id: docRef.id, ...listingData });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Update a listing
// @route   PUT /api/listings/:id
// @access  Private
const updateListing = async (req, res) => {
  try {
    const listingRef = db.collection('listings').doc(req.params.id);
    const doc = await listingRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const listing = doc.data();
    if (!ownsListing(listing, req.user.id)) {
      return res.status(403).json({ message: 'Not allowed to update this listing' });
    }

    const { data } = normalizeListingPayload(req.body, req.user, listing);
    await listingRef.set(data, { merge: true });

    res.json({ id: req.params.id, ...listing, ...data });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// @desc    Delete a listing
// @route   DELETE /api/listings/:id
// @access  Private
const deleteListing = async (req, res) => {
  try {
    const listingRef = db.collection('listings').doc(req.params.id);
    const doc = await listingRef.get();

    if (!doc.exists) {
      return res.status(404).json({ message: 'Listing not found' });
    }

    const listing = doc.data();
    if (!ownsListing(listing, req.user.id)) {
      return res.status(403).json({ message: 'Not allowed to delete this listing' });
    }

    await listingRef.delete();
    res.json({ message: 'Listing deleted' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

module.exports = {
  getListings,
  createListing,
  updateListing,
  deleteListing
};
