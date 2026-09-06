"""ShilpVerse Flask backend — full API for the creative marketplace."""

import os
import re
import sqlite3
from functools import wraps
from datetime import datetime, timedelta
from flask import Flask, request, jsonify, send_from_directory, session
from itsdangerous import URLSafeTimedSerializer, BadSignature, SignatureExpired
from flask_cors import CORS
from database import get_db, init_db, hash_password, verify_password, DB_PATH

# --- App setup --------------------------------------------------------------

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
FRONTEND_DIR = os.path.join(os.path.dirname(BASE_DIR), "frontend")

app = Flask(__name__, static_folder=FRONTEND_DIR, static_url_path="")
app.secret_key = os.environ.get("FLASK_SECRET_KEY", "shilpverse-dev-secret-key-change-in-production")
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.permanent_session_lifetime = timedelta(days=30)
app.config["SESSION_COOKIE_SECURE"] = False
app.config["SESSION_COOKIE_PATH"] = "/"

# The frontend can be opened from Flask itself, a local dev server, or file://.
# Keep CORS limited to local origins while still allowing credentialed requests.
CORS(
    app,
    supports_credentials=True,
    origins=[r"https?://(localhost|127\.0\.0\.1)(:\d+)?", "null"],
)

AUTH_SALT = "shilpverse-auth-v1"
auth_serializer = URLSafeTimedSerializer(app.secret_key, salt=AUTH_SALT)
AUTH_TOKEN_MAX_AGE = 30 * 24 * 60 * 60

# Ensure DB exists on import
init_db()

# --- Helpers ----------------------------------------------------------------

def json_error(message, status=400):
    return jsonify({"error": message}), status

@app.errorhandler(Exception)
def handle_unexpected_error(exc):
    """Keep API failures JSON-formatted instead of returning Flask's HTML 500 page."""
    app.logger.exception("Unhandled ShilpVerse error", exc_info=exc)
    if request.path.startswith("/api/"):
        return jsonify({"error": "The server hit an unexpected error. Please try again."}), 500
    return exc


def row_to_dict(row):
    return dict(row) if row else None


def make_auth_token(user_id):
    """Create a signed, expiring token for local/cross-origin frontend use."""
    return auth_serializer.dumps({"user_id": int(user_id)})

def user_id_from_token(token):
    if not token:
        return None
    try:
        payload = auth_serializer.loads(token, max_age=AUTH_TOKEN_MAX_AGE)
        return int(payload.get("user_id"))
    except (BadSignature, SignatureExpired, TypeError, ValueError, AttributeError):
        return None

def get_current_user():
    """Return the current user row from the session or signed auth token."""
    uid = session.get("user_id")
    if not uid:
        auth_header = request.headers.get("Authorization", "")
        if auth_header.lower().startswith("bearer "):
            uid = user_id_from_token(auth_header[7:].strip())
    if not uid:
        return None
    conn = get_db()
    user = conn.execute("SELECT * FROM users WHERE id = ?", (uid,)).fetchone()
    conn.close()
    return user


def require_auth():
    """Decorator: require a logged-in user."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return json_error("You must be logged in to do that.", 401)
            return fn(user, *args, **kwargs)
        return wrapper
    return decorator


def require_seller():
    """Decorator: require a logged-in seller."""
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = get_current_user()
            if not user:
                return json_error("You must be logged in to do that.", 401)
            if user["account_type"] != "seller":
                return json_error("Seller account required.", 403)
            conn = get_db()
            seller = conn.execute("SELECT * FROM sellers WHERE user_id = ?", (user["id"],)).fetchone()
            # Older databases / imported accounts may contain a seller user without
            # a matching seller profile. Repair that state automatically so selling
            # never gets blocked by a stale database row.
            if not seller:
                shop_name = f"{user['name']}'s Shop".strip() or "My ShilpVerse Shop"
                conn.execute(
                    "INSERT INTO sellers (user_id, shop_name, description, banner, rating) VALUES (?,?,?,?,?)",
                    (user["id"], shop_name, "Welcome to my ShilpVerse shop!", "", 0),
                )
                conn.commit()
                seller = conn.execute("SELECT * FROM sellers WHERE user_id = ?", (user["id"],)).fetchone()
            conn.close()
            return fn(user, seller, *args, **kwargs)
        return wrapper
    return decorator


def seller_to_dict(conn, seller):
    """Build a seller dict with user info."""
    user = conn.execute("SELECT * FROM users WHERE id = ?", (seller["user_id"],)).fetchone()
    product_count = conn.execute("SELECT COUNT(*) FROM products WHERE seller_id = ?", (seller["id"],)).fetchone()[0]
    return {
        "id": seller["id"],
        "user_id": seller["user_id"],
        "shop_name": seller["shop_name"],
        "description": seller["description"],
        "banner": seller["banner"],
        "rating": seller["rating"],
        "name": user["name"] if user else "",
        "username": user["username"] if user else "",
        "profile_image": user["profile_image"] if user else "",
        "created_at": user["created_at"] if user else "",
        "product_count": product_count,
    }


def product_to_dict(conn, product):
    """Build a product dict with seller info and review stats."""
    seller = conn.execute("SELECT * FROM sellers WHERE id = ?", (product["seller_id"],)).fetchone()
    seller_user = None
    if seller:
        seller_user = conn.execute("SELECT * FROM users WHERE id = ?", (seller["user_id"],)).fetchone()

    review_stats = conn.execute(
        "SELECT COUNT(*) as cnt, AVG(rating) as avg FROM reviews WHERE product_id = ?", (product["id"],)
    ).fetchone()
    review_count = review_stats["cnt"] or 0
    avg_rating = round(review_stats["avg"], 1) if review_stats["avg"] else 0

    # Check if current user has favorited
    fav = False
    uid = session.get("user_id")
    if uid:
        f = conn.execute("SELECT id FROM favorites WHERE buyer_id = ? AND product_id = ?", (uid, product["id"])).fetchone()
        fav = f is not None

    return {
        "id": product["id"],
        "seller_id": product["seller_id"],
        "name": product["name"],
        "description": product["description"],
        "price": product["price"],
        "category": product["category"],
        "stock": product["stock"],
        "image": product["image"],
        "image_url": product["image"],
        "tags": product["tags"],
        "materials": product["materials"],
        "shipping_information": product["shipping_information"],
        "created_at": product["created_at"],
        "seller": {
            "id": seller["id"] if seller else None,
            "shop_name": seller["shop_name"] if seller else "",
            "name": seller_user["name"] if seller_user else "",
            "username": seller_user["username"] if seller_user else "",
            "profile_image": seller_user["profile_image"] if seller_user else "",
        } if seller else None,
        "rating": avg_rating,
        "review_count": review_count,
        "favorited": fav,
    }


def validate_email(email):
    return re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", email) is not None


# --- Static file serving (SPA) -----------------------------------------------

@app.route("/")
def index():
    return send_from_directory(FRONTEND_DIR, "index.html")


@app.route("/<path:path>")
def static_files(path):
    full = os.path.join(FRONTEND_DIR, path)
    if os.path.isfile(full):
        return send_from_directory(FRONTEND_DIR, path)
    return send_from_directory(FRONTEND_DIR, "index.html")


# --- Auth endpoints ---------------------------------------------------------

@app.route("/api/health", methods=["GET"])
def health():
    try:
        conn = get_db()
        conn.execute("SELECT 1").fetchone()
        conn.close()
        return jsonify({"ok": True, "service": "ShilpVerse"})
    except Exception:
        return jsonify({"ok": False, "service": "ShilpVerse"}), 500

@app.route("/api/register", methods=["POST", "OPTIONS"])
def register():
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    confirm = data.get("confirm_password") or ""
    account_type = (data.get("account_type") or "buyer").strip()
    shop_name = (data.get("shop_name") or "").strip()
    shop_description = (data.get("shop_description") or "").strip()

    if not name or not username or not email or not password:
        return json_error("All fields are required.")
    if not validate_email(email):
        return json_error("Please enter a valid email address.")
    if password != confirm:
        return json_error("Passwords do not match.")
    if len(password) < 6:
        return json_error("Password must be at least 6 characters.")
    if account_type not in ("buyer", "seller"):
        return json_error("Invalid account type.")
    if account_type == "seller" and not shop_name:
        return json_error("Shop name is required for seller accounts.")

    conn = get_db()
    # Check duplicates
    if conn.execute("SELECT id FROM users WHERE email = ?", (email,)).fetchone():
        conn.close()
        return json_error("An account with this email already exists.")
    if conn.execute("SELECT id FROM users WHERE username = ?", (username,)).fetchone():
        conn.close()
        return json_error("This username is already taken.")

    try:
        conn.execute(
            "INSERT INTO users (name, username, email, password_hash, account_type, profile_image) VALUES (?,?,?,?,?,?)",
            (name, username, email, hash_password(password), account_type, ""),
        )
        uid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        if account_type == "seller":
            conn.execute(
                "INSERT INTO sellers (user_id, shop_name, description, banner, rating) VALUES (?,?,?,?,?)",
                (uid, shop_name, shop_description, "", 0),
            )
        conn.commit()
    except sqlite3.IntegrityError as e:
        conn.close()
        return json_error(f"Registration failed: {e}")
    conn.close()

    # Auto-login
    session.permanent = True
    session["user_id"] = uid
    return jsonify({"message": "Account created successfully.", "user_id": uid, "auth_token": make_auth_token(uid)})


@app.route("/api/login", methods=["POST", "OPTIONS"])
def login():
    if request.method == "OPTIONS":
        return ("", 204)
    data = request.get_json(silent=True) or {}
    raw_identifier = str(data.get("identifier") or "").strip()
    identifier = raw_identifier.lower()
    password = str(data.get("password") or "")

    if not identifier or not password:
        return json_error("Please enter your email/username and password.")

    conn = get_db()
    try:
        # Email is normalized to lowercase; username matching is case-insensitive.
        user = conn.execute(
            "SELECT * FROM users WHERE LOWER(email) = ? OR LOWER(username) = ?",
            (identifier, identifier)
        ).fetchone()
    finally:
        conn.close()

    if not user:
        return json_error("No account found with those details.", 401)
    if not verify_password(password, user["password_hash"]):
        return json_error("Incorrect password. Please try again.", 401)

    session.permanent = True
    session["user_id"] = user["id"]
    return jsonify({"message": "Logged in successfully.", "user_id": user["id"], "auth_token": make_auth_token(user["id"])})

@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "Logged out successfully."})


@app.route("/api/me", methods=["GET"])
def me():
    user = get_current_user()
    if not user:
        return jsonify({"user": None})
    result = {
        "id": user["id"],
        "name": user["name"],
        "username": user["username"],
        "email": user["email"],
        "account_type": user["account_type"],
        "profile_image": user["profile_image"],
        "phone": user["phone"] if "phone" in user.keys() else "",
        "bio": user["bio"] if "bio" in user.keys() else "",
        "location": user["location"] if "location" in user.keys() else "",
        "created_at": user["created_at"],
    }
    if user["account_type"] == "seller":
        conn = get_db()
        seller = conn.execute("SELECT * FROM sellers WHERE user_id = ?", (user["id"],)).fetchone()
        # Keep seller accounts usable even when an older/imported database is
        # missing its seller profile row. The dashboard depends on this object.
        if not seller:
            shop_name = f"{user['name']}'s Shop".strip() or "My ShilpVerse Shop"
            conn.execute(
                "INSERT INTO sellers (user_id, shop_name, description, banner, rating) VALUES (?,?,?,?,?)",
                (user["id"], shop_name, "Welcome to my ShilpVerse shop!", "", 0),
            )
            conn.commit()
            seller = conn.execute("SELECT * FROM sellers WHERE user_id = ?", (user["id"],)).fetchone()
        result["seller"] = seller_to_dict(conn, seller)
        conn.close()
    return jsonify({"user": result})


@app.route("/api/profile", methods=["PUT"])
@require_auth()
def update_profile(user):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    username = (data.get("username") or "").strip()
    email = (data.get("email") or "").strip().lower()
    profile_image = (data.get("profile_image") or "").strip()
    phone = (data.get("phone") or "").strip()
    bio = (data.get("bio") or "").strip()
    location = (data.get("location") or "").strip()
    if len(profile_image) > 2_000_000:
        return json_error("Profile image is too large. Please use an image under 2 MB.")
    conn = get_db()
    if email and email != user["email"]:
        if not validate_email(email):
            conn.close(); return json_error("Please enter a valid email address.")
        if conn.execute("SELECT id FROM users WHERE email = ? AND id != ?", (email, user["id"])).fetchone():
            conn.close(); return json_error("That email is already in use.")
    if username and username.lower() != user["username"].lower():
        if conn.execute("SELECT id FROM users WHERE LOWER(username) = LOWER(?) AND id != ?", (username, user["id"])).fetchone():
            conn.close(); return json_error("That username is already taken.")
    updates = {"name": name or user["name"], "username": username or user["username"], "email": email or user["email"],
               "profile_image": profile_image, "phone": phone, "bio": bio, "location": location}
    conn.execute("UPDATE users SET name=?, username=?, email=?, profile_image=?, phone=?, bio=?, location=? WHERE id=?",
                 (*updates.values(), user["id"]))
    conn.commit(); conn.close()
    return jsonify({"message": "Profile updated successfully."})

@app.route("/api/change-password", methods=["POST"])
@require_auth()
def change_password(user):
    data = request.get_json(silent=True) or {}
    current = data.get("current_password") or ""
    new = data.get("new_password") or ""
    confirm = data.get("confirm_password") or ""

    if not current or not new:
        return json_error("All fields are required.")
    if not verify_password(current, user["password_hash"]):
        return json_error("Current password is incorrect.")
    if new != confirm:
        return json_error("New passwords do not match.")
    if len(new) < 6:
        return json_error("New password must be at least 6 characters.")

    conn = get_db()
    conn.execute("UPDATE users SET password_hash = ? WHERE id = ?", (hash_password(new), user["id"]))
    conn.commit()
    conn.close()
    return jsonify({"message": "Password changed successfully."})


# --- Product endpoints ------------------------------------------------------

@app.route("/api/upgrade-seller", methods=["POST"])
@require_auth()
def upgrade_seller(user):
    if user["account_type"] == "seller":
        return jsonify({"message": "You are already a seller."})
    data = request.get_json(silent=True) or {}
    shop_name = (data.get("shop_name") or "").strip()
    description = (data.get("description") or "").strip()
    if not shop_name:
        return json_error("Shop name is required.")
    conn = get_db()
    conn.execute("UPDATE users SET account_type='seller' WHERE id=?", (user["id"],))
    conn.execute("INSERT INTO sellers (user_id,shop_name,description,banner,rating) VALUES (?,?,?,?,?)",
                 (user["id"], shop_name, description, "", 0))
    conn.commit()
    seller = conn.execute("SELECT * FROM sellers WHERE user_id=?", (user["id"],)).fetchone()
    result = seller_to_dict(conn, seller)
    conn.close()
    return jsonify({"message":"Your seller account is ready!", "seller":result})

@app.route("/api/products", methods=["GET"])
def get_products():
    conn = get_db()
    query = "SELECT * FROM products"
    params = []
    conditions = []

    category = request.args.get("category")
    if category and category.lower() != "all":
        conditions.append("category = ?")
        params.append(category)

    search = request.args.get("search", "").strip()
    if search:
        like = f"%{search}%"
        conditions.append("""(
            name LIKE ? OR description LIKE ? OR tags LIKE ? OR category LIKE ? OR
            seller_id IN (SELECT id FROM sellers WHERE shop_name LIKE ?)
        )""")
        params.extend([like, like, like, like, like])

    min_price = request.args.get("min_price")
    if min_price:
        try:
            conditions.append("price >= ?")
            params.append(float(min_price))
        except ValueError:
            pass

    max_price = request.args.get("max_price")
    if max_price:
        try:
            conditions.append("price <= ?")
            params.append(float(max_price))
        except ValueError:
            pass

    availability = request.args.get("availability")
    if availability == "in_stock":
        conditions.append("stock > 0")

    if conditions:
        query += " WHERE " + " AND ".join(conditions)

    sort = request.args.get("sort", "newest")
    if sort == "price_low":
        query += " ORDER BY price ASC"
    elif sort == "price_high":
        query += " ORDER BY price DESC"
    elif sort == "popular":
        # Popular = most reviewed (subquery)
        query += " ORDER BY (SELECT COUNT(*) FROM reviews WHERE product_id = products.id) DESC"
    elif sort == "rating":
        query += " ORDER BY (SELECT AVG(rating) FROM reviews WHERE product_id = products.id) DESC NULLS LAST"
    else:
        query += " ORDER BY created_at DESC"

    limit = request.args.get("limit", type=int)
    if limit:
        query += f" LIMIT {int(limit)}"

    rows = conn.execute(query, params).fetchall()
    products = [product_to_dict(conn, p) for p in rows]
    conn.close()
    return jsonify({"products": products})


@app.route("/api/products/<int:pid>", methods=["GET"])
def get_product(pid):
    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not product:
        conn.close()
        return json_error("Product not found.", 404)
    result = product_to_dict(conn, product)
    conn.close()
    return jsonify({"product": result})


@app.route("/api/products", methods=["POST"])
@require_seller()
def create_product(user, seller):
    data = request.get_json(silent=True) or {}
    name = (data.get("name") or "").strip()
    description = (data.get("description") or "").strip()
    price = data.get("price")
    category = (data.get("category") or "Other").strip()
    stock = data.get("stock", 1)
    image = (data.get("image") or "").strip()
    # Images may be remote URLs, local frontend paths, or uploaded data URLs.
    if len(image) > 2_000_000:
        return json_error("Image is too large. Please use an image under 2 MB.")
    tags = (data.get("tags") or "").strip()
    materials = (data.get("materials") or "").strip()
    shipping = (data.get("shipping_information") or "").strip()

    if not name:
        return json_error("Product name is required.")
    try:
        price = float(price)
        if price < 0:
            return json_error("Price cannot be negative.")
    except (TypeError, ValueError):
        return json_error("Please enter a valid price.")
    try:
        stock = int(stock)
        if stock < 0:
            return json_error("Stock cannot be negative.")
    except (TypeError, ValueError):
        return json_error("Please enter a valid stock quantity.")

    conn = get_db()
    if not seller or not seller["id"]:
        conn.close()
        return json_error("Seller profile is missing. Please refresh your account and try again.", 409)
    conn.execute(
        """INSERT INTO products (seller_id, name, description, price, category, stock, image, tags, materials, shipping_information)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (seller["id"], name, description, price, category, stock, image, tags, materials, shipping),
    )
    conn.commit()
    pid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    result = product_to_dict(conn, product)
    conn.close()
    return jsonify({"message": "Product published successfully.", "product": result})


@app.route("/api/products/<int:pid>", methods=["PUT"])
@require_seller()
def update_product(user, seller, pid):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not product:
        conn.close()
        return json_error("Product not found.", 404)
    if product["seller_id"] != seller["id"]:
        conn.close()
        return json_error("You can only edit your own products.", 403)

    fields = ["name", "description", "category", "image", "tags", "materials", "shipping_information"]
    updates = {}
    for f in fields:
        if f in data:
            updates[f] = (data[f] or "").strip()
    if "price" in data:
        try:
            updates["price"] = float(data["price"])
        except (TypeError, ValueError):
            conn.close()
            return json_error("Invalid price.")
    if "stock" in data:
        try:
            updates["stock"] = int(data["stock"])
        except (TypeError, ValueError):
            conn.close()
            return json_error("Invalid stock.")

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE products SET {set_clause} WHERE id = ?", (*updates.values(), pid))
        conn.commit()

    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    result = product_to_dict(conn, product)
    conn.close()
    return jsonify({"message": "Product updated successfully.", "product": result})


@app.route("/api/products/<int:pid>", methods=["DELETE"])
@require_seller()
def delete_product(user, seller, pid):
    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not product:
        conn.close()
        return json_error("Product not found.", 404)
    if product["seller_id"] != seller["id"]:
        conn.close()
        return json_error("You can only delete your own products.", 403)
    conn.execute("DELETE FROM products WHERE id = ?", (pid,))
    conn.commit()
    conn.close()
    return jsonify({"message": "Product deleted successfully."})


@app.route("/api/sellers/<int:sid>/products", methods=["GET"])
def get_seller_products(sid):
    conn = get_db()
    rows = conn.execute("SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC", (sid,)).fetchall()
    products = [product_to_dict(conn, p) for p in rows]
    conn.close()
    return jsonify({"products": products})


# --- Seller endpoints -------------------------------------------------------

@app.route("/api/sellers", methods=["GET"])
def get_sellers():
    conn = get_db()
    rows = conn.execute("SELECT * FROM sellers ORDER BY rating DESC").fetchall()
    sellers = [seller_to_dict(conn, s) for s in rows]
    conn.close()
    return jsonify({"sellers": sellers})


@app.route("/api/sellers/<int:sid>", methods=["GET"])
def get_seller(sid):
    conn = get_db()
    seller = conn.execute("SELECT * FROM sellers WHERE id = ?", (sid,)).fetchone()
    if not seller:
        conn.close()
        return json_error("Seller not found.", 404)
    result = seller_to_dict(conn, seller)
    products = conn.execute("SELECT * FROM products WHERE seller_id = ? ORDER BY created_at DESC", (sid,)).fetchall()
    result["products"] = [product_to_dict(conn, p) for p in products]
    reviews_data = []
    for p in products:
        revs = conn.execute(
            """SELECT r.*, u.name as buyer_name, u.username as buyer_username, u.profile_image as buyer_image
               FROM reviews r JOIN users u ON r.buyer_id = u.id WHERE r.product_id = ? ORDER BY r.created_at DESC""",
            (p["id"],),
        ).fetchall()
        for r in revs:
            reviews_data.append({
                "id": r["id"],
                "product_id": p["id"],
                "product_name": p["name"],
                "rating": r["rating"],
                "review": r["review"],
                "created_at": r["created_at"],
                "buyer_name": r["buyer_name"],
                "buyer_username": r["buyer_username"],
                "buyer_image": r["buyer_image"],
            })
    result["reviews"] = reviews_data
    conn.close()
    return jsonify({"seller": result})


@app.route("/api/shop", methods=["PUT"])
@require_seller()
def update_shop(user, seller):
    data = request.get_json(silent=True) or {}
    conn = get_db()
    updates = {}
    if "shop_name" in data:
        updates["shop_name"] = (data["shop_name"] or "").strip() or seller["shop_name"]
    if "description" in data:
        updates["description"] = (data["description"] or "").strip()
    if "banner" in data:
        updates["banner"] = (data["banner"] or "").strip()

    if updates:
        set_clause = ", ".join(f"{k} = ?" for k in updates)
        conn.execute(f"UPDATE sellers SET {set_clause} WHERE id = ?", (*updates.values(), seller["id"]))
        conn.commit()
    conn.close()
    return jsonify({"message": "Shop settings updated successfully."})


# --- Favorites endpoints ----------------------------------------------------

@app.route("/api/favorites", methods=["GET"])
@require_auth()
def get_favorites(user):
    conn = get_db()
    rows = conn.execute(
        """SELECT p.* FROM products p
           JOIN favorites f ON p.id = f.product_id
           WHERE f.buyer_id = ? ORDER BY f.id DESC""",
        (user["id"],),
    ).fetchall()
    products = [product_to_dict(conn, p) for p in rows]
    conn.close()
    return jsonify({"products": products})


@app.route("/api/favorites", methods=["POST"])
@require_auth()
def add_favorite(user):
    data = request.get_json(silent=True) or {}
    pid = data.get("product_id")
    if not pid:
        return json_error("Product ID is required.")
    conn = get_db()
    product = conn.execute("SELECT id FROM products WHERE id = ?", (pid,)).fetchone()
    if not product:
        conn.close()
        return json_error("Product not found.", 404)
    try:
        conn.execute("INSERT INTO favorites (buyer_id, product_id) VALUES (?, ?)", (user["id"], pid))
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return jsonify({"message": "Already in favorites."})
    conn.close()
    return jsonify({"message": "Added to favorites."})


@app.route("/api/favorites/<int:pid>", methods=["DELETE"])
@require_auth()
def remove_favorite(user, pid):
    conn = get_db()
    conn.execute("DELETE FROM favorites WHERE buyer_id = ? AND product_id = ?", (user["id"], pid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Removed from favorites."})


# --- Order endpoints --------------------------------------------------------

@app.route("/api/orders", methods=["POST"])
@require_auth()
def create_order(user):
    data = request.get_json(silent=True) or {}
    items = data.get("items") or []
    delivery = data.get("delivery_address") or {}
    payment_method = (data.get("payment_method") or "").strip()

    if not items:
        return json_error("Your cart is empty.")
    if payment_method not in ("Online Payment", "Cash on Delivery"):
        return json_error("Please select a valid payment method.")

    full_name = (delivery.get("full_name") or "").strip()
    phone = (delivery.get("phone") or "").strip()
    address = (delivery.get("address") or "").strip()
    city = (delivery.get("city") or "").strip()
    state = (delivery.get("state") or "").strip()
    postal = (delivery.get("postal_code") or "").strip()

    if not all([full_name, phone, address, city, state, postal]):
        return json_error("Please fill in all delivery details.")

    conn = get_db()
    # Group items by seller
    seller_items = {}
    total = 0
    for item in items:
        pid = item.get("product_id")
        qty = item.get("quantity", 1)
        product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
        if not product:
            conn.close()
            return json_error(f"Product {pid} not found.")
        if product["stock"] < qty:
            conn.close()
            return json_error(f"Not enough stock for {product['name']}.")
        sid = product["seller_id"]
        if sid not in seller_items:
            seller_items[sid] = []
        seller_items[sid].append((product, qty))
        total += product["price"] * qty

    address_str = f"{full_name}, {phone}, {address}, {city}, {state}, {postal}"
    order_ids = []
    order_ref = datetime.now().strftime("%Y%m%d%H%M%S")

    for sid, prod_list in seller_items.items():
        seller_total = sum(p["price"] * q for p, q in prod_list)
        shipping = 99 if seller_total < 2000 else 0
        grand = seller_total + shipping
        status = "Order Placed"
        if payment_method == "Online Payment":
            status = "Confirmed"

        conn.execute(
            "INSERT INTO orders (buyer_id, seller_id, total, payment_method, status, delivery_address, created_at) VALUES (?,?,?,?,?,?,?)",
            (user["id"], sid, grand, payment_method, status, address_str, datetime.now().isoformat()),
        )
        oid = conn.execute("SELECT last_insert_rowid()").fetchone()[0]
        order_ids.append(oid)

        for product, qty in prod_list:
            conn.execute(
                "INSERT INTO order_items (order_id, product_id, quantity, price) VALUES (?,?,?,?)",
                (oid, product["id"], qty, product["price"]),
            )
            conn.execute("UPDATE products SET stock = stock - ? WHERE id = ?", (qty, product["id"]))

    conn.commit()
    conn.close()
    return jsonify({
        "message": "Order placed successfully!",
        "order_ids": order_ids,
        "order_ref": f"SV-{order_ref}",
        "total": total,
    })


@app.route("/api/orders", methods=["GET"])
@require_auth()
def get_orders(user):
    conn = get_db()
    if user["account_type"] == "seller":
        seller = conn.execute("SELECT * FROM sellers WHERE user_id = ?", (user["id"],)).fetchone()
        if not seller:
            conn.close()
            return jsonify({"orders": []})
        rows = conn.execute("SELECT * FROM orders WHERE seller_id = ? ORDER BY created_at DESC", (seller["id"],)).fetchall()
    else:
        rows = conn.execute("SELECT * FROM orders WHERE buyer_id = ? ORDER BY created_at DESC", (user["id"],)).fetchall()

    orders = []
    for o in rows:
        items_rows = conn.execute(
            """SELECT oi.*, p.name as product_name, p.image as product_image, p.price as product_price
               FROM order_items oi JOIN products p ON oi.product_id = p.id WHERE oi.order_id = ?""",
            (o["id"],),
        ).fetchall()
        buyer = conn.execute("SELECT name, username, profile_image FROM users WHERE id = ?", (o["buyer_id"],)).fetchone()
        seller = conn.execute("SELECT id, shop_name FROM sellers WHERE id = ?", (o["seller_id"],)).fetchone()
        items = []
        for it in items_rows:
            items.append({
                "id": it["id"],
                "product_id": it["product_id"],
                "product_name": it["product_name"],
                "product_image": it["product_image"],
                "quantity": it["quantity"],
                "price": it["price"],
            })
        orders.append({
            "id": o["id"],
            "buyer_id": o["buyer_id"],
            "seller_id": o["seller_id"],
            "total": o["total"],
            "payment_method": o["payment_method"],
            "status": o["status"],
            "delivery_address": o["delivery_address"],
            "created_at": o["created_at"],
            "items": items,
            "buyer": dict(buyer) if buyer else None,
            "seller": dict(seller) if seller else None,
        })
    conn.close()
    return jsonify({"orders": orders})


@app.route("/api/orders/<int:oid>", methods=["GET"])
@require_auth()
def get_order(user, oid):
    conn = get_db()
    o = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    if not o:
        conn.close()
        return json_error("Order not found.", 404)
    if o["buyer_id"] != user["id"] and (
        user["account_type"] != "seller" or
        conn.execute("SELECT seller_id FROM sellers WHERE user_id = ?", (user["id"],)).fetchone() is None
    ):
        conn.close()
        return json_error("You don't have access to this order.", 403)
    conn.close()
    return jsonify({"order": dict(o)})


@app.route("/api/orders/<int:oid>/status", methods=["PUT"])
@require_seller()
def update_order_status(user, seller, oid):
    data = request.get_json(silent=True) or {}
    new_status = (data.get("status") or "").strip()
    valid_statuses = ["Order Placed", "Confirmed", "Preparing", "Shipped", "Delivered"]
    if new_status not in valid_statuses:
        return json_error("Invalid order status.")

    conn = get_db()
    o = conn.execute("SELECT * FROM orders WHERE id = ?", (oid,)).fetchone()
    if not o:
        conn.close()
        return json_error("Order not found.", 404)
    if o["seller_id"] != seller["id"]:
        conn.close()
        return json_error("You can only update your own orders.", 403)
    conn.execute("UPDATE orders SET status = ? WHERE id = ?", (new_status, oid))
    conn.commit()
    conn.close()
    return jsonify({"message": "Order status updated.", "status": new_status})


# --- Messaging endpoints ----------------------------------------------------

@app.route("/api/messages", methods=["GET"])
@require_auth()
def get_messages(user):
    conn = get_db()
    # Get all conversations for this user
    rows = conn.execute(
        """SELECT * FROM messages
           WHERE sender_id = ? OR receiver_id = ?
           ORDER BY created_at ASC""",
        (user["id"], user["id"]),
    ).fetchall()

    conversations = {}
    for m in rows:
        other_id = m["receiver_id"] if m["sender_id"] == user["id"] else m["sender_id"]
        key = (min(user["id"], other_id), max(user["id"], other_id), m["product_id"] or 0)
        if key not in conversations:
            other_user = conn.execute("SELECT id, name, username, profile_image, account_type FROM users WHERE id = ?", (other_id,)).fetchone()
            product = None
            if m["product_id"]:
                p = conn.execute("SELECT id, name, image FROM products WHERE id = ?", (m["product_id"],)).fetchone()
                if p:
                    product = dict(p)
            conversations[key] = {
                "other_user": dict(other_user) if other_user else None,
                "product": product,
                "messages": [],
                "last_message_at": m["created_at"],
            }
        conversations[key]["messages"].append({
            "id": m["id"],
            "sender_id": m["sender_id"],
            "receiver_id": m["receiver_id"],
            "message": m["message"],
            "created_at": m["created_at"],
            "read_status": m["read_status"],
        })
        if m["created_at"] > conversations[key]["last_message_at"]:
            conversations[key]["last_message_at"] = m["created_at"]

    # Mark messages from others as read
    conn.execute("UPDATE messages SET read_status = 1 WHERE receiver_id = ? AND read_status = 0", (user["id"],))
    conn.commit()

    result = sorted(conversations.values(), key=lambda c: c["last_message_at"], reverse=True)
    conn.close()
    return jsonify({"conversations": result})


@app.route("/api/messages", methods=["POST"])
@require_auth()
def send_message(user):
    data = request.get_json(silent=True) or {}
    receiver_id = data.get("receiver_id")
    product_id = data.get("product_id")
    message = (data.get("message") or "").strip()

    if not receiver_id:
        return json_error("Receiver is required.")
    if not message:
        return json_error("Message cannot be empty.")
    if receiver_id == user["id"]:
        return json_error("You cannot message yourself.")

    conn = get_db()
    conn.execute(
        "INSERT INTO messages (sender_id, receiver_id, product_id, message, created_at) VALUES (?,?,?,?,?)",
        (user["id"], receiver_id, product_id, message, datetime.now().isoformat()),
    )
    conn.commit()
    conn.close()
    return jsonify({"message": "Message sent."})


# --- Review endpoints -------------------------------------------------------

@app.route("/api/products/<int:pid>/reviews", methods=["GET"])
def get_reviews(pid):
    conn = get_db()
    rows = conn.execute(
        """SELECT r.*, u.name as buyer_name, u.username as buyer_username, u.profile_image as buyer_image
           FROM reviews r JOIN users u ON r.buyer_id = u.id
           WHERE r.product_id = ? ORDER BY r.created_at DESC""",
        (pid,),
    ).fetchall()
    reviews = [dict(r) for r in rows]
    conn.close()
    return jsonify({"reviews": reviews})


@app.route("/api/reviews", methods=["POST"])
@require_auth()
def add_review(user):
    data = request.get_json(silent=True) or {}
    pid = data.get("product_id")
    rating = data.get("rating")
    review_text = (data.get("review") or "").strip()

    if not pid:
        return json_error("Product ID is required.")
    try:
        rating = int(rating)
        if rating < 1 or rating > 5:
            return json_error("Rating must be between 1 and 5.")
    except (TypeError, ValueError):
        return json_error("Invalid rating.")

    conn = get_db()
    product = conn.execute("SELECT * FROM products WHERE id = ?", (pid,)).fetchone()
    if not product:
        conn.close()
        return json_error("Product not found.", 404)

    # Check buyer has an order with this product
    has_order = conn.execute(
        """SELECT 1 FROM orders o JOIN order_items oi ON o.id = oi.order_id
           WHERE o.buyer_id = ? AND oi.product_id = ? LIMIT 1""",
        (user["id"], pid),
    ).fetchone()
    if not has_order:
        conn.close()
        return json_error("You can only review products you have purchased.")

    try:
        conn.execute(
            "INSERT INTO reviews (buyer_id, product_id, rating, review) VALUES (?,?,?,?)",
            (user["id"], pid, rating, review_text),
        )
        conn.commit()
    except sqlite3.IntegrityError:
        conn.close()
        return json_error("You have already reviewed this product.")

    conn.close()
    return jsonify({"message": "Review added successfully."})


# --- Seller dashboard stats -------------------------------------------------

@app.route("/api/seller/stats", methods=["GET"])
@require_seller()
def seller_stats(user, seller):
    conn = get_db()
    total_products = conn.execute("SELECT COUNT(*) FROM products WHERE seller_id = ?", (seller["id"],)).fetchone()[0]
    total_orders = conn.execute("SELECT COUNT(*) FROM orders WHERE seller_id = ?", (seller["id"],)).fetchone()[0]
    total_revenue = conn.execute("SELECT COALESCE(SUM(total), 0) FROM orders WHERE seller_id = ? AND status != 'Order Placed'", (seller["id"],)).fetchone()[0]
    total_sales = conn.execute(
        """SELECT COUNT(DISTINCT o.buyer_id) FROM orders o
           WHERE o.seller_id = ?""", (seller["id"],)
    ).fetchone()[0]
    # Distinct customers
    customers = conn.execute("SELECT COUNT(DISTINCT buyer_id) FROM orders WHERE seller_id = ?", (seller["id"],)).fetchone()[0]
    recent_orders = conn.execute(
        """SELECT o.*, u.name as buyer_name FROM orders o JOIN users u ON o.buyer_id = u.id
           WHERE o.seller_id = ? ORDER BY o.created_at DESC LIMIT 5""",
        (seller["id"],),
    ).fetchall()
    conn.close()
    return jsonify({
        "total_products": total_products,
        "total_orders": total_orders,
        "total_revenue": total_revenue,
        "total_sales": total_sales,
        "customers": customers,
        "recent_orders": [dict(o) for o in recent_orders],
    })


# Direct execution is supported for both the launcher and manual testing.
if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)
