const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const { db } = require('../config/firebase');
const { JWT_SECRET } = require('../config/jwt');

// Generate JWT Token
const generateToken = (id, role) => {
  return jwt.sign({ id, role }, JWT_SECRET, {
    expiresIn: '30d',
  });
};

// @desc    Register new user
// @route   POST /api/auth/register
// @access  Public
const registerUser = async (req, res) => {
  try {
    const { name, email, password, role, phone, fssaiLicense } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();
    const accountRole = ['admin', 'hotel'].includes(role) ? role : 'user';

    if (!name || !normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please add all fields' });
    }

    // Check if user exists in Firestore
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', normalizedEmail).get();

    // Hash password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(password, salt);

    if (!snapshot.empty) {
      let existingUser;
      let docId;
      snapshot.forEach(doc => {
        existingUser = doc.data();
        docId = doc.id;
      });

      if (!existingUser.password) {
        // Legacy account, update with new password
        await usersRef.doc(docId).update({
          password: hashedPassword,
          name: name || existingUser.name,
          phone: phone || existingUser.phone || null,
          fssaiLicense: accountRole === 'admin' ? (fssaiLicense || existingUser.fssaiLicense || null) : existingUser.fssaiLicense || null,
          updatedAt: new Date().toISOString()
        });

        return res.status(200).json({
          uid: existingUser.uid || docId,
          name: name || existingUser.name,
          email: existingUser.email,
          role: existingUser.role || accountRole,
          phone: phone || existingUser.phone || null,
          fssaiLicense: fssaiLicense || existingUser.fssaiLicense || null,
          token: generateToken(existingUser.uid || docId, existingUser.role || accountRole),
        });
      } else {
        return res.status(400).json({ message: 'User already exists' });
      }
    }

    // Create user in Firestore
    const newUserRef = usersRef.doc();
    const newUser = {
      uid: newUserRef.id,
      name,
      email: normalizedEmail,
      password: hashedPassword,
      role: accountRole,
      phone: phone || null,
      fssaiLicense: accountRole === 'admin' ? (fssaiLicense || null) : null,
      createdAt: new Date().toISOString()
    };

    await newUserRef.set(newUser);

    res.status(201).json({
      uid: newUser.uid,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      phone: newUser.phone,
      fssaiLicense: newUser.fssaiLicense,
      token: generateToken(newUser.uid, newUser.role),
    });
  } catch (error) {
    console.error('Register Error:', error);
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
};

// @desc    Authenticate a user
// @route   POST /api/auth/login
// @access  Public
const loginUser = async (req, res) => {
  try {
    const { email, password } = req.body;
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!normalizedEmail || !password) {
      return res.status(400).json({ message: 'Please enter email and password' });
    }

    // Check for user email
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('email', '==', normalizedEmail).get();

    if (snapshot.empty) {
      return res.status(400).json({ message: 'Invalid credentials' });
    }

    let user;
    let docId;
    snapshot.forEach(doc => {
      user = doc.data();
      docId = doc.id;
    });

    // Check if user has a password field (legacy Firebase users might not)
    if (!user.password) {
      return res.status(400).json({ message: 'Legacy account detected without password. Please create a new account with this email.' });
    }

    // Check password
    if (user && (await bcrypt.compare(password, user.password))) {
      const uid = user.uid || docId;
      res.json({
        uid,
        name: user.name,
        email: user.email,
        role: user.role || 'user',
        phone: user.phone || null,
        token: generateToken(uid, user.role || 'user'),
      });
    } else {
      res.status(400).json({ message: 'Invalid credentials' });
    }
  } catch (error) {
    console.error('Login Error:', error);
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
};

// @desc    Get user profile
// @route   GET /api/auth/profile
// @access  Private
const getUserProfile = async (req, res) => {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('uid', '==', req.user.id).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let user;
    snapshot.forEach(doc => { user = doc.data(); });
    delete user.password;
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateUserProfile = async (req, res) => {
  try {
    const usersRef = db.collection('users');
    const snapshot = await usersRef.where('uid', '==', req.user.id).get();
    
    if (snapshot.empty) {
      return res.status(404).json({ message: 'User not found' });
    }
    
    let docId;
    snapshot.forEach(doc => { docId = doc.id; });
    
    await usersRef.doc(docId).update({
      ...req.body,
      updatedAt: new Date().toISOString()
    });
    
    res.json({ message: 'Profile updated successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message || 'Server error', error: error.message });
  }
};

module.exports = {
  registerUser,
  loginUser,
  getUserProfile,
  updateUserProfile
};
