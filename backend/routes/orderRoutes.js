const express = require('express');
const router = express.Router();
const { db } = require('../config/firebase');
const { protect } = require('../middleware/authMiddleware');

// @desc    Get orders (for user or owner)
// @route   GET /api/orders
// @access  Private
router.get('/', protect, async (req, res) => {
  try {
    const ordersRef = db.collection('orders');
    const snapshot = await ordersRef.orderBy('createdAtMs', 'desc').get();
    
    let orders = [];
    snapshot.forEach(doc => {
      let order = { id: doc.id, ...doc.data() };
      
      // If user is not admin/hotel, only show their orders
      if (req.user.role === 'user') {
        if (order.userId === req.user.id) {
          orders.push(order);
        }
      } else {
        // If hotel owner, only show orders containing their items
        const hasOwnerItems = (order.items || []).some(item => item.ownerId === req.user.id);
        if (hasOwnerItems) {
          orders.push(order);
        }
      }
    });

    res.json(orders);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Create an order
// @route   POST /api/orders
// @access  Private
router.post('/', protect, async (req, res) => {
  try {
    const orderData = req.body;
    orderData.userId = req.user.id;
    orderData.status = 'pending';
    orderData.createdAtMs = Date.now();

    const ordersRef = db.collection('orders');
    const docRef = await ordersRef.add(orderData);

    // Empty the user's cart
    await db.collection('carts').doc(req.user.id).set({ items: [], updatedAt: new Date().toISOString() }, { merge: true });

    res.status(201).json({ id: docRef.id, ...orderData });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

// @desc    Update order status
// @route   PUT /api/orders/:id
// @access  Private
router.put('/:id', protect, async (req, res) => {
  try {
    const { status, ...extraData } = req.body;
    const orderRef = db.collection('orders').doc(req.params.id);
    
    await orderRef.update({
      status,
      ...extraData,
      updatedAt: new Date().toISOString()
    });

    res.json({ message: 'Order updated' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
});

module.exports = router;
