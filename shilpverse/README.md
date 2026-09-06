# ShilpVerse

**A creative marketplace where people can discover, buy, sell, and communicate about handmade, artistic, and unique products.**

ShilpVerse is a full-stack web application built with HTML/CSS/JavaScript on the frontend and Python Flask with SQLite on the backend. It includes buyer and seller accounts, a full marketplace with search and filters, shopping cart, checkout, favorites, messaging, reviews, order tracking.

---

## Tech Stack

| Layer    | Technology                  |
|----------|-----------------------------|
| Frontend | HTML5, CSS3, Vanilla JS     |
| Backend  | Python, Flask               |
| Database | SQLite                      |

No build tools or bundlers required. Just Python and a browser.

---

## Project Structure

```
shilpverse/
├── frontend/
│   ├── index.html      # Main HTML page (SPA shell)
│   ├── style.css       # All styling (premium design system)
│   └── script.js       # All frontend logic and API calls
├── backend/
│   ├── app.py          # Flask application with all API endpoints
│   ├── database.py     # SQLite schema initialization and seed data
│   ├── requirements.txt # Python dependencies
│   └── shilpverse.db   # SQLite database (auto-created on first run)
└── README.md
```

---

## Setup Instructions (Windows + VS Code)

### 1. Open the project

1. Open VS Code.
2. Go to **File > Open Folder** and select the `shilpverse` folder.

### 2. Open the terminal

- Go to **Terminal > New Terminal** (or press `` Ctrl+` ``).

### 3. Create a Python virtual environment

```bash
cd backend
python -m venv venv
```

### 4. Activate the virtual environment

**On Windows (Command Prompt):**
```bash
venv\Scripts\activate
```

**On Windows (PowerShell):**
```powershell
venv\Scripts\Activate.ps1
```

If PowerShell blocks the script, run this once:
```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned
```

### 5. Install dependencies

```bash
pip install -r requirements.txt
```

### 6. Start Flask

**Easiest option:** double-click `START_SHILPVERSE.bat` in the `shilpverse` folder.

Or use the terminal:

```bash
python app.py
```

You should see:
```
* Running on http://127.0.0.1:5000
```

### 7. Open ShilpVerse in the browser

Open **http://127.0.0.1:5000**. Do not use a `file://` URL for normal use. (The frontend also contains a fallback to `http://127.0.0.1:5000` if you accidentally open `index.html` directly.)

Go to **http://127.0.0.1:5000** in your browser. The homepage should load with trending products, categories, and featured sellers.

---

## Demo Accounts

The database comes pre-seeded with demo accounts so you can start immediately:

| Role   | Email            | Password  |
|--------|------------------|-----------|
| Buyer  | buyer@demo.com   | demo123   |
| Seller | aarav@demo.com   | demo123   |
| Seller | meera@demo.com   | demo123   |
| Seller | rohan@demo.com   | demo123   |
| Seller | priya@demo.com   | demo123   |
| Seller | karan@demo.com   | demo123   |

You can also create your own buyer or seller account from the website.

---

## Testing Guide

### Create a buyer account

1. Click **Create Account** in the navigation bar.
2. Select **Buyer**.
3. Fill in your name, username, email, password, and confirm password.
4. Click **Create Account**. You'll be automatically logged in.

### Create a seller account

1. Click **Create Account**.
2. Select **Seller**.
3. Fill in all fields including **Shop Name** and **Shop Description**.
4. Click **Create Account**. You'll be automatically logged in and can access the Seller Dashboard.

### Test product creation (seller)

1. Login as a seller (e.g., `aarav@demo.com` / `demo123`).
2. Go to **Seller Dashboard > My Products**.
3. Click **+ Add Product**.
4. Fill in the product details (name, description, price, category, stock, image URL, tags, materials, shipping info).
5. Click **Publish Product**. The product appears in your inventory and the marketplace immediately.

### Test buying (buyer)

1. Login as a buyer (e.g., `buyer@demo.com` / `demo123`).
2. Browse products from the **Explore** page.
3. Click a product to view details.
4. Click **Buy Now** or **Add to Cart**.
5. Go through checkout: Product review > Delivery details > Payment method > Confirmation.
6. Choose **Online Payment** (demo) or **Cash on Delivery**.
7. Click **Place Order**. You'll get a confirmation with an order reference.
8. View your order in **Buyer Dashboard > Orders** and click **Track** to see the order timeline.

### Test messaging

1. Login as a buyer.
2. Open any product page.
3. Click **Contact Seller**.
4. Type a message and click **Send Message**.
5. The seller receives it in their **Messages** section.
6. Login as the seller to view and reply.


### Buyer Features
- Browse, search, and filter products
- View product details with images, reviews, and seller info
- Add to cart and favorites
- Full checkout flow (Buy Now and Cart checkout)
- Online Payment (demo) and Cash on Delivery
- Order tracking with timeline
- Leave reviews on purchased products
- Message sellers about specific products
- Buyer dashboard with overview, orders, favorites, and messages

### Seller Features
- Separate seller dashboard (not visible to buyers)
- Add, edit, and delete products
- View incoming orders and update order status
- Sales statistics (products, orders, revenue, customers)
- Shop settings (name, description, banner)
- Message buyers
- Seller profile page visible to all users

### General Features
- Persistent login (stays logged in across page refreshes)
- Responsive design (mobile, tablet, desktop)
- Toast notifications for all actions
- Loading skeletons and error handling
- Image fallbacks (no broken image icons)
- Shilp AI assistant with real product search
- Mobile bottom navigation bar

---

## API Endpoints

| Method | Endpoint                        | Description                     |
|--------|---------------------------------|---------------------------------|
| POST   | /api/register                   | Create a buyer or seller account|
| POST   | /api/login                      | Login with email or username    |
| POST   | /api/logout                     | Logout                          |
| GET    | /api/me                         | Get current user                |
| PUT    | /api/profile                    | Update profile                  |
| POST   | /api/change-password            | Change password                 |
| GET    | /api/products                   | List products (filter/sort/search)|
| GET    | /api/products/:id               | Get single product              |
| POST   | /api/products                   | Create product (seller only)    |
| PUT    | /api/products/:id               | Update product (seller only)    |
| DELETE | /api/products/:id               | Delete product (seller only)    |
| GET    | /api/sellers                    | List all sellers                |
| GET    | /api/sellers/:id                | Get seller profile + products   |
| GET    | /api/sellers/:id/products       | Get seller's products           |
| PUT    | /api/shop                       | Update shop settings            |
| GET    | /api/favorites                  | List favorites                  |
| POST   | /api/favorites                  | Add favorite                    |
| DELETE | /api/favorites/:id              | Remove favorite                 |
| POST   | /api/orders                     | Place order                     |
| GET    | /api/orders                     | List orders                     |
| PUT    | /api/orders/:id/status          | Update order status (seller)    |
| GET    | /api/messages                   | List conversations              |
| POST   | /api/messages                   | Send message                    |
| GET    | /api/products/:id/reviews       | List product reviews            |
| POST   | /api/reviews                    | Add review (buyers who ordered) |
| GET    | /api/seller/stats               | Seller dashboard statistics     |
| POST   | /api/ai                         | Shilp AI assistant query        |

---

## Security

- Passwords are hashed with PBKDF2 + salt (never stored in plain text)
- Session-based authentication with HTTP-only cookies
- Sellers can only edit/delete their own products
- Buyers can only review products they've purchased
- Input validation on all API endpoints
- Account type checks prevent buyers from accessing seller APIs

---

## Troubleshooting

**"ModuleNotFoundError: No module named 'flask'"**
Make sure you activated the virtual environment and ran `pip install -r requirements.txt`.

**"Address already in use"**
Another process is using port 5000. Either close it or change the port in `app.py` (last line: `app.run(port=5001)`).

**Database not creating**
Delete `shilpverse.db` and restart the app. The database is auto-created with seed data on first run.

**Page is blank**
Make sure you're visiting `http://127.0.0.1:5000` (not opening the HTML file directly). Flask serves the frontend.

---

&copy; 2026 ShilpVerse. Made with care for creators.


## Quick start (Windows)
1. Double-click `START_SHILPVERSE.bat` in the outer project folder.
2. Keep the black server window open.
3. The site opens at `http://127.0.0.1:5000`.
4. Do not use VS Code Live Server for the main site; the frontend automatically supports it for API calls, but Flask is still required for login, accounts and marketplace data.

Demo buyer: `buyer@demo.com` / `demo123`
Demo seller: `aarav@demo.com` / `demo123`


## Seller product photos
Seller Dashboard → My Products → Add Product now supports both an Image URL and direct image upload. Uploaded images are stored with the product record, so no separate asset path is required. The bundled `frontend/assets/products/` folder is reserved for the user's final product photos if they want them packaged with the project.

## Seller recovery
If a seller user exists without a seller profile in an older database, the backend automatically creates the missing seller profile instead of blocking product creation.


## v4 additions
- 31 supplied product photos bundled in frontend/assets/products.
- Seller onboarding and Sell an Item workflow.
- Buyer-to-seller upgrade without creating a second account.
- Dark blue/teal theme toggle with local persistence.
- Expanded editable profile fields and profile photo upload.

## AI Assistant

The previous built-in Shilp AI assistant has been removed from this version. The marketplace UI is intentionally left ready for a new AI assistant to be integrated later through a secure backend API.
