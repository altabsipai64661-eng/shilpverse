"""SQLite database initialization and seed data for ShilpVerse."""

import sqlite3
import os
import json
import hashlib
import secrets
from datetime import datetime, timedelta

DB_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "shilpverse.db")


def get_db():
    """Return a SQLite connection. Creates the DB file if missing."""
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# --- Password hashing -------------------------------------------------------

def hash_password(password: str) -> str:
    salt = secrets.token_hex(16)
    hashed = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
    return f"{salt}${hashed.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        salt, hashed = stored.split("$")
        check = hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100000)
        return secrets.compare_digest(hashed, check.hex())
    except Exception:
        return False


# --- Schema -----------------------------------------------------------------

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT NOT NULL,
    username      TEXT NOT NULL UNIQUE,
    email         TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    account_type  TEXT NOT NULL CHECK (account_type IN ('buyer','seller')),
    profile_image TEXT,
    phone         TEXT,
    bio           TEXT,
    location      TEXT,
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sellers (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     INTEGER NOT NULL UNIQUE,
    shop_name   TEXT NOT NULL,
    description TEXT,
    banner      TEXT,
    rating      REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS products (
    id                 INTEGER PRIMARY KEY AUTOINCREMENT,
    seller_id          INTEGER NOT NULL,
    name               TEXT NOT NULL,
    description        TEXT,
    price              REAL NOT NULL,
    category           TEXT,
    stock              INTEGER NOT NULL DEFAULT 1,
    image              TEXT,
    tags               TEXT,
    materials          TEXT,
    shipping_information TEXT,
    created_at         TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS orders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id        INTEGER NOT NULL,
    seller_id       INTEGER NOT NULL,
    total           REAL NOT NULL,
    payment_method  TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'Order Placed',
    delivery_address TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (seller_id) REFERENCES sellers(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS order_items (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    order_id   INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    quantity   INTEGER NOT NULL,
    price      REAL NOT NULL,
    FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS favorites (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id   INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    UNIQUE(buyer_id, product_id),
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS messages (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    sender_id   INTEGER NOT NULL,
    receiver_id INTEGER NOT NULL,
    product_id  INTEGER,
    message     TEXT NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    read_status INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (receiver_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS reviews (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    buyer_id   INTEGER NOT NULL,
    product_id INTEGER NOT NULL,
    rating     INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review     TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(buyer_id, product_id),
    FOREIGN KEY (buyer_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);
"""


def _migrate_db(conn):
    """Safely add columns introduced by later versions to older SQLite files."""
    cols = {row[1] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
    for name, definition in (("phone", "TEXT"), ("bio", "TEXT"), ("location", "TEXT")):
        if name not in cols:
            conn.execute(f"ALTER TABLE users ADD COLUMN {name} {definition}")
    conn.commit()


def _seed_photo_catalog(conn):
    """Keep the supplied product-photo catalog names and metadata matched to the actual photos."""
    sellers = [r[0] for r in conn.execute("SELECT id FROM sellers ORDER BY id LIMIT 5").fetchall()]
    if not sellers:
        return

    # The filenames are fixed, so this mapping is also a migration for databases
    # created by earlier versions whose product names did not match the photos.
    catalog = [
        ("Pink Blossom Ceramic Teacup", "Delicate floral ceramic teacup and saucer with a soft handmade finish.", 899, "Handmade", 10, "teacup,ceramic,floral,tea,handmade"),
        ("Floral Ceramic Statement Vase", "Sculpted ceramic vase with a floral form and soft decorative finish.", 1399, "Home Decor", 9, "vase,ceramic,floral,decor,handmade"),
        ("Hand-painted Character Ceramic Mug", "Playful handmade ceramic mug with a hand-painted character design.", 649, "Handmade", 14, "mug,ceramic,handpainted,character,handmade"),
        ("Textured Ceramic Trinket Dish", "Small handcrafted ceramic dish with a unique textured glaze for jewelry and keepsakes.", 599, "Handmade", 15, "dish,ceramic,trinket,handmade,decor"),
        ("Painted Landscape Ceramic Vase", "Hand-painted ceramic vase featuring a scenic landscape and decorative finish.", 1299, "Home Decor", 9, "vase,ceramic,landscape,painting,decor"),
        ("Silver Heart Pendant Necklace", "Elegant silver-toned pendant necklace with a delicate heart-inspired design.", 799, "Jewelry", 15, "necklace,pendant,silver,heart,jewelry,gift"),
        ("Pink Floral Charm Bracelet", "Pastel floral charm bracelet handmade with delicate beads and a pretty finish.", 749, "Jewelry", 18, "bracelet,floral,charm,pink,jewelry"),
        ("Delicate Jewelry Gift Set", "Elegant necklace and matching jewelry pieces presented in a gift-ready box.", 1899, "Jewelry", 7, "jewelry,necklace,gift,set,handmade"),
        ("Cherry Charm Pendant", "Cute red cherry pendant necklace with a playful handmade aesthetic.", 699, "Jewelry", 16, "necklace,cherry,pendant,handmade,gift"),
        ("Blue Crystal Beaded Bracelet", "Handmade blue beaded bracelet with sparkling crystal accents for everyday wear.", 899, "Jewelry", 20, "bracelet,beads,blue,crystal,jewelry,handmade"),
        ("Botanical Floral Wall Art", "Botanical floral artwork featuring soft flowers and leaves for calm interiors.", 1699, "Art", 6, "art,floral,botanical,wall art,painting"),
        ("Lavender Garden Canvas", "Soft lavender garden artwork on canvas with a peaceful handmade look.", 1499, "Art", 7, "painting,lavender,floral,art,canvas"),
        ("Minimal Silver Necklace Collection", "A selection of clean, minimalist silver-toned necklaces for everyday styling.", 1199, "Jewelry", 10, "necklace,silver,minimal,jewelry"),
        ("Floral Forest Fine Art Painting", "Expressive floral-and-forest artwork with rich details and a dreamy mood.", 2499, "Art", 5, "painting,floral,forest,fine art,handmade"),
        ("Sunset Bloom Canvas Painting", "Warm sunset and blooming garden artwork on canvas, ready to display.", 2199, "Art", 5, "painting,art,floral,sunset,handmade"),
        ("Swan Lake Art Painting", "Dreamy swan artwork on a deep blue background, painted for a dramatic display.", 2299, "Art", 5, "painting,swan,lake,art,wall art"),
        ("Botanical Art Print Set", "A set of botanical floral prints in soft tones for a simple gallery wall.", 999, "Digital Art", 20, "prints,botanical,wall art,digital,decor"),
        ("Framed Sunset Landscape Painting", "Framed sunset landscape artwork with warm pink and orange tones.", 1899, "Art", 7, "painting,sunset,framed,landscape,art"),
        ("Daisy Flower Gift Basket", "Charming floral gift basket arranged with daisy-style blooms for a cheerful surprise.", 1699, "Gifts", 8, "flowers,daisy,gift,basket,handmade"),
        ("Woven Picnic Basket", "Handwoven wicker basket with a charming fabric trim, ideal for picnics and gifting.", 1299, "Accessories", 8, "basket,wicker,handmade,picnic,gift"),
        ("Botanical Woven Basket Arrangement", "Decorative woven basket arrangement with greenery for a warm handmade display.", 1599, "Home Decor", 8, "basket,plants,botanical,decor,handmade"),
        ("Elegant Handmade Gift Hamper", "Beautifully arranged handmade gift package for birthdays and special occasions.", 1499, "Gifts", 10, "gift,hamper,handmade,birthday"),
        ("Hanging String Light Decor", "Warm decorative hanging lights arranged to create a cozy room atmosphere.", 1799, "Home Decor", 6, "lights,hanging,decor,room,handmade"),
        ("Floating Botanical Shelf", "Minimal floating shelf display with plants and small decor accents.", 1399, "Home Decor", 9, "shelf,plants,decor,home,handmade"),
        ("Handmade Celebration Gift Box", "Curated handmade gift box with a decorative presentation for celebrations.", 1799, "Gifts", 10, "gift box,handmade,celebration,birthday"),
        ("Botanical Hanging Shelf Decor", "Small hanging shelf arrangement with greenery for cozy corners and rooms.", 1599, "Home Decor", 8, "shelf,plants,botanical,decor,handmade"),
        ("Macrame Hanging Wall Decor", "Textured handmade hanging wall decor with a soft boho-inspired finish.", 999, "Crafts", 12, "macrame,wall hanging,boho,handmade,decor"),
        ("Forest Lantern Landscape Art", "Atmospheric forest and lantern scene artwork for a cozy nature-inspired interior.", 1999, "Art", 6, "painting,forest,lantern,nature,art"),
        ("Memory Photo Wall Hanging", "Handmade hanging display designed for photos, notes and treasured memories.", 1199, "Custom Creations", 12, "photo wall,custom,memory,handmade,decor"),
        ("Floral Hanging Light Decor", "Decorative hanging lights with floral-inspired shades for a warm atmosphere.", 1799, "Home Decor", 6, "lights,floral,decor,handmade,room"),
        ("Forest Path Landscape Artwork", "Dreamy green forest path artwork inspired by a peaceful woodland scene.", 1999, "Art", 6, "painting,forest,nature,landscape,art"),
    ]

    # Update existing photo-catalog rows by filename. This deliberately runs on
    # every startup so old databases are corrected without deleting user listings.
    for idx, (name, desc, price, category, stock, tags) in enumerate(catalog, 1):
        image = f"/assets/products/photo-{idx:02d}.jpeg"
        row = conn.execute("SELECT id FROM products WHERE image = ? LIMIT 1", (image,)).fetchone()
        if row:
            conn.execute(
                """UPDATE products SET name=?, description=?, price=?, category=?, stock=?, tags=?, materials=?, shipping_information=? WHERE id=?""",
                (name, desc, price, category, stock, tags + ",photo-catalog-2026", "Handmade materials", "Ships in 2-5 business days across India.", row[0]),
            )
        else:
            sid = sellers[(idx - 1) % len(sellers)]
            conn.execute(
                """INSERT INTO products (seller_id,name,description,price,category,stock,image,tags,materials,shipping_information)
                   VALUES (?,?,?,?,?,?,?,?,?,?)""",
                (sid, name, desc, price, category, stock, image, tags + ",photo-catalog-2026", "Handmade materials", "Ships in 2-5 business days across India."),
            )
    conn.commit()

def init_db():
    """Create tables and insert seed data if the DB is empty."""
    conn = get_db()
    cur = conn.cursor()
    cur.executescript(SCHEMA)
    _migrate_db(conn)
    conn.commit()

    # Only seed if there are no users yet
    count = cur.execute("SELECT COUNT(*) FROM users").fetchone()[0]
    if count == 0:
        _seed(conn)
    _seed_photo_catalog(conn)
    conn.close()


# --- Seed data --------------------------------------------------------------

def _seed(conn):
    cur = conn.cursor()

    # Demo seller accounts
    sellers = [
        ("Aarav Sharma", "aarav_creates", "aarav@demo.com", "demo123", "Aarav's Art House", "Handmade paintings and wall art inspired by Indian folklore and modern minimalism.", "https://images.pexels.com/photos/3781338/pexels-photo-3781338.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&cs=tinysrgb&w=1600"),
        ("Meera Iyer", "meera_clay", "meera@demo.com", "demo123", "Meera Clay Studio", "Sculpted clay decor, planters, and handmade ceramics crafted in Bangalore.", "https://images.pexels.com/photos/3771089/pexels-photo-3771089.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/4350099/pexels-photo-4350099.jpeg?auto=compress&cs=tinysrgb&w=1600"),
        ("Rohan Kapoor", "rohan_beads", "rohan@demo.com", "demo123", "Rohan Beadworks", "Handmade bracelets, earrings, and beaded jewelry from Jaipur.", "https://images.pexels.com/photos/3781338/pexels-photo-3781338.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/1190922/pexels-photo-1190922.jpeg?auto=compress&cs=tinysrgb&w=1600"),
        ("Priya Nair", "priya_print", "priya@demo.com", "demo123", "Priya Print Studio", "Art prints, custom notebooks, and digital illustrations for modern spaces.", "https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/1666071/pexels-photo-1666071.jpeg?auto=compress&cs=tinysrgb&w=1600"),
        ("Karan Mehta", "karan_craft", "karan@demo.com", "demo123", "Karan Craft Co.", "Handmade keychains, craft items, and custom gifts for every occasion.", "https://images.pexels.com/photos/3781338/pexels-photo-3781338.jpeg?auto=compress&cs=tinysrgb&w=1200", "https://images.pexels.com/photos/1190922/pexels-photo-1190922.jpeg?auto=compress&cs=tinysrgb&w=1600"),
    ]
    seller_ids = []
    for name, username, email, pwd, shop, desc, avatar, banner in sellers:
        cur.execute(
            "INSERT INTO users (name, username, email, password_hash, account_type, profile_image) VALUES (?,?,?,?,?,?)",
            (name, username, email, hash_password(pwd), "seller", avatar),
        )
        uid = cur.lastrowid
        cur.execute(
            "INSERT INTO sellers (user_id, shop_name, description, banner, rating) VALUES (?,?,?,?,?)",
            (uid, shop, desc, banner, round(4.0 + (uid % 5) * 0.15, 1)),
        )
        seller_ids.append(cur.lastrowid)

    # Demo buyer account
    cur.execute(
        "INSERT INTO users (name, username, email, password_hash, account_type, profile_image) VALUES (?,?,?,?,?,?)",
        ("Demo Buyer", "demobuyer", "buyer@demo.com", hash_password("demo123"), "buyer", "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=400"),
    )
    buyer_id = cur.lastrowid

    # Products: (seller_idx, name, desc, price, category, stock, image, tags, materials, shipping)
    products = [
        (0, "Rajasthani Folk Painting", "A vibrant handmade painting depicting traditional Rajasthani folk dancers, crafted with natural pigments on canvas.", 2499, "Art", 5, "https://images.pexels.com/photos/3781338/pexels-photo-3781338.jpeg?auto=compress&cs=tinysrgb&w=800", "painting,folk,indian,handmade,wall art", "Natural pigments, canvas", "Ships in 3-5 days across India. Free shipping over ₹2000."),
        (1, "Handcrafted Clay Planter", "A beautifully sculpted terracotta planter perfect for succulents and small plants. Each piece is unique.", 699, "Handmade", 12, "https://images.pexels.com/photos/4350099/pexels-photo-4350099.jpeg?auto=compress&cs=tinysrgb&w=800", "clay,planter,terracotta,handmade,decor", "Terracotta clay", "Ships in 2-4 days. Fragile packaging included."),
        (2, "Beaded Gemstone Bracelet", "Handmade bracelet with natural gemstone beads. Adjustable fit, perfect for daily wear or gifting.", 899, "Jewelry", 20, "https://images.pexels.com/photos/1190922/pexels-photo-1190922.jpeg?auto=compress&cs=tinysrgb&w=800", "bracelet,beads,gemstone,jewelry,handmade", "Natural gemstones, elastic cord", "Ships in 1-3 days. Gift wrapping available."),
        (3, "Minimalist Art Print - Set of 3", "A set of three modern minimalist art prints, perfect for living room or office walls. Printed on premium matte paper.", 1299, "Digital Art", 15, "https://images.pexels.com/photos/1666071/pexels-photo-1666071.jpeg?auto=compress&cs=tinysrgb&w=800", "print,minimalist,wall art,digital,set", "Premium matte paper 250gsm", "Ships in 2-3 days. Rolled in protective tube."),
        (4, "Custom Engraved Leather Keychain", "Personalized leather keychain with custom name engraving. A perfect small gift.", 349, "Accessories", 50, "https://images.pexels.com/photos/2079246/pexels-photo-2079246.jpeg?auto=compress&cs=tinysrgb&w=800", "keychain,leather,custom,gift,engraved", "Genuine leather, metal ring", "Ships in 1-2 days. Bulk orders welcome."),
        (0, "Abstract Canvas Wall Art", "Large abstract canvas painting with warm earthy tones. Ready to hang, perfect for modern interiors.", 3999, "Home Decor", 3, "https://images.pexels.com/photos/1103970/pexels-photo-1103970.jpeg?auto=compress&cs=tinysrgb&w=800", "abstract,canvas,wall art,large,modern", "Acrylic on stretched canvas", "Ships in 5-7 days. White-glove delivery available."),
        (1, "Ceramic Tea Set - Handmade", "Six-piece handmade ceramic tea set with cups and a teapot. Glazed in warm cream and terracotta tones.", 1899, "Handmade", 8, "https://images.pexels.com/photos/4350099/pexels-photo-4350099.jpeg?auto=compress&cs=tinysrgb&w=800", "ceramic,tea set,handmade,kitchen,decor", "Stoneware ceramic, food-safe glaze", "Ships in 3-5 days. Gift box included."),
        (2, "Gold-Plated Hoop Earrings", "Elegant handmade gold-plated hoop earrings with a delicate filigree design. Lightweight and comfortable.", 1199, "Jewelry", 25, "https://images.pexels.com/photos/1190922/pexels-photo-1190922.jpeg?auto=compress&cs=tinysrgb&w=800", "earrings,gold,hoop,jewelry,handmade", "Gold-plated brass", "Ships in 1-3 days. Hypoallergenic."),
        (3, "Custom Illustrated Notebook", "A personalized notebook with a custom hand-drawn cover illustration. 120 pages of premium paper.", 599, "Custom Creations", 30, "https://images.pexels.com/photos/1666071/pexels-photo-1666071.jpeg?auto=compress&cs=tinysrgb&w=800", "notebook,custom,illustration,stationery", "Recycled paper, hardcover", "Ships in 3-5 days. Custom design takes 2 days."),
        (4, "Handmade Macrame Wall Hanging", "A boho-style macrame wall hanging made with natural cotton rope. Adds warmth to any room.", 799, "Crafts", 18, "https://images.pexels.com/photos/6107981/pexels-photo-6107981.jpeg?auto=compress&cs=tinysrgb&w=800", "macrame,wall hanging,boho,craft,cotton", "Natural cotton rope, wooden dowel", "Ships in 2-4 days. Custom sizes available."),
        (0, "Watercolor Portrait - Custom", "A custom watercolor portrait painted from your photo. Perfect for gifting or personal keepsake.", 1799, "Custom Creations", 10, "https://images.pexels.com/photos/3781338/pexels-photo-3781338.jpeg?auto=compress&cs=tinysrgb&w=800", "watercolor,portrait,custom,art,gift", "Watercolor paints, 300gsm paper", "Ships in 7-10 days. Digital preview before shipping."),
        (1, "Mini Clay Succulent Pot Set", "Set of 4 mini handmade clay pots, perfect for tiny succulents. Painted in pastel colors.", 499, "Handmade", 25, "https://images.pexels.com/photos/4350099/pexels-photo-4350099.jpeg?auto=compress&cs=tinysrgb&w=800", "clay,pots,succulent,set,minis", "Painted terracotta", "Ships in 2-4 days. Set of 4 assorted colors."),
        (2, "Pearl Drop Necklace", "Handmade freshwater pearl drop necklace with a delicate gold chain. Timeless and elegant.", 1499, "Jewelry", 15, "https://images.pexels.com/photos/1190922/pexels-photo-1190922.jpeg?auto=compress&cs=tinysrgb&w=800", "pearl,necklace,gold,elegant,jewelry", "Freshwater pearl, gold-plated chain", "Ships in 1-3 days. Gift box included."),
        (3, "Botanical Art Print Pair", "A pair of botanical illustration prints on archival paper. Perfect for gallery walls.", 999, "Digital Art", 20, "https://images.pexels.com/photos/1666071/pexels-photo-1666071.jpeg?auto=compress&cs=tinysrgb&w=800", "botanical,print,art,plants,illustration", "Archival paper, fade-resistant ink", "Ships in 2-3 days. Frame not included."),
        (4, "Personalized Gift Hamper", "A curated gift hamper with handmade soap, candle, and a personalized note. Perfect for any occasion.", 1299, "Gifts", 40, "https://images.pexels.com/photos/2079246/pexels-photo-2079246.jpeg?auto=compress&cs=tinysrgb&w=800", "gift,hamper,soap,candle,personalized", "Handmade soap, soy candle, gift box", "Ships in 2-3 days. Custom note included."),
    ]

    product_ids = []
    for sidx, name, desc, price, cat, stock, img, tags, mat, ship in products:
        sid = seller_ids[sidx]
        cur.execute(
            """INSERT INTO products (seller_id, name, description, price, category, stock, image, tags, materials, shipping_information)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
            (sid, name, desc, price, cat, stock, img, tags, mat, ship),
        )
        product_ids.append(cur.lastrowid)

    # Seed a few reviews
    reviews = [
        (buyer_id, product_ids[0], 5, "Absolutely stunning painting! The colors are even more beautiful in person."),
        (buyer_id, product_ids[1], 4, "Lovely planter, though slightly smaller than expected. Good quality."),
        (buyer_id, product_ids[2], 5, "The bracelet is gorgeous and fits perfectly. Highly recommend!"),
        (buyer_id, product_ids[4], 5, "Great quality keychain and the engraving was perfect. Fast shipping!"),
    ]
    for bid, pid, rating, text in reviews:
        cur.execute(
            "INSERT INTO reviews (buyer_id, product_id, rating, review) VALUES (?,?,?,?)",
            (bid, pid, rating, text),
        )

    # Recalculate product ratings from reviews
    cur.execute("SELECT product_id, AVG(rating) FROM reviews GROUP BY product_id")
    # (used for display, not stored on product table)

    # Seed a sample order for the demo buyer so the dashboard isn't empty
    now = datetime.now()
    cur.execute(
        "INSERT INTO orders (buyer_id, seller_id, total, payment_method, status, delivery_address, created_at) VALUES (?,?,?,?,?,?,?)",
        (buyer_id, seller_ids[0], 2499, "Online Payment", "Shipped", "123 Demo Street, Bangalore, KA, 560001", (now - timedelta(days=4)).isoformat()),
    )
    oid = cur.lastrowid
    cur.execute(
        "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)",
        (oid, product_ids[0], 1, 2499),
    )

    # Seed a sample message
    cur.execute(
        "INSERT INTO messages (sender_id, receiver_id, product_id, message, created_at) VALUES (?,?,?,?,?)",
        (buyer_id, seller_ids[0], product_ids[0], "Hi! I love this painting. Is it available for immediate shipping?", now.isoformat()),
    )
    cur.execute(
        "INSERT INTO messages (sender_id, receiver_id, product_id, message, created_at) VALUES (?,?,?,?,?)",
        (seller_ids[0], buyer_id, product_ids[0], "Hello! Yes, it is in stock and ready to ship within 2 days.", now.isoformat()),
    )

    conn.commit()


if __name__ == "__main__":
    init_db()
    print(f"Database initialized at {DB_PATH}")
