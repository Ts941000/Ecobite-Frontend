const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const path = require('path');

// Load environment variables
dotenv.config({ path: path.join(__dirname, '.env') });

const app = express();
const frontendDir = path.join(__dirname, '..');
const publicPages = new Set([
    'EcoBite.html',
    'index.html',
    'login.html',
    'dashboard.html',
    'cart.html',
    'my-orders.html',
    'my-address.html',
    'list-your-hotel.html',
    'about.html',
    'blog.html',
    'career.html',
    'contact.html',
    'help.html',
    'press.html',
    'privacy.html',
]);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Make uploads folder static so frontend can access images
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/CSS', express.static(path.join(frontendDir, 'CSS')));
app.use('/JS', express.static(path.join(frontendDir, 'JS')));
app.use(['/FOOD IMAGES', '/FOOD%20IMAGES'], express.static(path.join(frontendDir, 'FOOD IMAGES')));

// Routes
app.use('/api/auth', require('./routes/authRoutes'));
app.use('/api/upload', require('./routes/uploadRoutes'));
app.use('/api/listings', require('./routes/listingRoutes'));
app.use('/api/cart', require('./routes/cartRoutes'));
app.use('/api/orders', require('./routes/orderRoutes'));
app.use('/api/ai', require('./routes/aiRoutes'));

// API Test route
app.get('/api/test', (req, res) => {
    res.json({ status: 'ok', message: 'Express is running successfully on Vercel!' });
});

// Health check route for Render
app.get('/health', (req, res) => res.status(200).send('OK'));

// Serve frontend pages in local full-stack mode without exposing backend files.
app.get('/', (req, res) => {
    res.sendFile(path.join(frontendDir, 'EcoBite.html'));
});

app.get('/:page', (req, res, next) => {
    const page = req.params.page;
    if (!publicPages.has(page)) return next();
    return res.sendFile(path.join(frontendDir, page));
});

const PORT = parseInt(process.env.PORT, 10) || 5000;

if (require.main === module) {
    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Server is running on port ${PORT}`);
    });
}

module.exports = app;
