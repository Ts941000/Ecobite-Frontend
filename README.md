# EcoBite

EcoBite is a frontend food-rescue and home-delivery web app inspired by modern food delivery platforms. It helps users browse surplus meals from partner hotels, add discounted dishes to cart, and complete a delivery-style checkout flow.

## Screenshots

### Desktop
![EcoBite desktop homepage](screenshots/home-desktop.png)

### Mobile
![EcoBite mobile homepage](screenshots/home-mobile.png)

## Features

- Responsive landing page for desktop, tablet, and mobile screens
- Food listings written directly in HTML for easy editing
- Dish images loaded from the local `FOOD IMAGES` folder
- City, category, and search filtering with JavaScript
- Add-to-cart flow using browser localStorage
- Cart page with quantity controls, coupon support, delivery form, payment options, and order success modal
- Hotel partner dashboard with listings, orders, and settings UI
- Login/signup page with user and hotel partner modes
- Mappls MapmyIndia SDK integration with Leaflet fallback for local/demo safety

## Tech Stack

- HTML5
- CSS3
- JavaScript
- Mappls MapmyIndia Web JS SDK
- Leaflet fallback map
- Google Fonts and Material Symbols

## How To Run

1. Download or clone this repository.
2. Keep the folder structure unchanged:
   - `EcoBite.html`
   - `cart.html`
   - `login.html`
   - `dashboard.html`
   - `CSS/`
   - `JS/`
   - `FOOD IMAGES/`
3. Open `EcoBite.html` directly in a browser.

For the best local preview, run a simple server from the project folder:

```bash
python -m http.server 8080
```

Then open:

```text
http://127.0.0.1:8080/EcoBite.html
```

## Firebase Backend Setup

The app now includes Firebase-ready backend support with a local demo fallback. Until you add your Firebase keys, login, cart, listings, and orders continue to work in browser storage.

1. Create a Firebase project at <https://console.firebase.google.com/>.
2. Enable Authentication providers:
   - Email/Password
   - Google
3. Create a Cloud Firestore database.
4. Enable Firebase Storage.
5. In Firebase project settings, create a Web App and copy its config into `JS/firebase-config.js`.
6. Install the Firebase CLI and deploy rules/hosting when ready:

```bash
npm install -g firebase-tools
firebase login
firebase init
firebase deploy --only firestore:rules,storage,hosting
```

If you already initialized Firebase elsewhere, copy `.firebaserc.example` to `.firebaserc` and replace `your-firebase-project-id`.

To seed the starter menu into Firestore, log in as a hotel partner, open the browser console on `dashboard.html`, and run:

```js
import("./JS/firebase-seed.js").then((seed) => seed.seedDefaultListings())
```

### Backend Features

- Firebase Authentication for email/password signup, login, logout, and Google sign-in
- Role-aware user profiles for customers and hotel partners
- Firestore cart sync per signed-in user
- Firestore order creation from checkout
- Firestore hotel listing create, edit, delete, and live dashboard refresh
- Public listing reads on the customer homepage
- Firebase Storage rules and helper function for listing image uploads
- Firestore and Storage security rules included in the repository

## Project Structure

```text
EcoBite/
  EcoBite.html
  cart.html
  login.html
  dashboard.html
  CSS/
    EcoBite.css
    cart.css
    login.css
    dashboard.css
  JS/
    ECOBITE.js
    cart.js
    firebase-config.js
    firebase-seed.js
    firebase-service.js
    login.js
    dashboard.js
  firestore.rules
  storage.rules
  firebase.json
  FOOD IMAGES/
    butterchickhen.jpg.jpeg
    chickenbiryani.jpg.jpeg
    dm.jpg.jpeg
    pbm.jpg.jpeg
    rajma.jpg.jpeg
  screenshots/
    home-desktop.png
    home-mobile.png
```

## Notes

Payments are still simulated in the UI. For real money movement, connect a payment gateway such as Razorpay or Stripe through a trusted server or Firebase Cloud Functions.
