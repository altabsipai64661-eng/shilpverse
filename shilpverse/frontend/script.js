/* ============================================
   SHILPVERSE — Frontend JavaScript
   Full SPA logic: auth, marketplace, cart,
   checkout, messaging, AI, dashboards
   ============================================ */

// --- Config ---
// Backend URL detection:
// - Flask-served site (port 5000): use same origin.
// - VS Code Live Server / any static server (for example port 5500):
//   send API requests to the Flask backend on port 5000.
// - file:// pages also use the local Flask backend.
const API = (() => {
    const host = window.location.hostname || '127.0.0.1';
    const protocol = window.location.protocol;
    const port = window.location.port;
    if (protocol === 'file:') return 'http://127.0.0.1:5000';
    if (port === '5000') return '';
    return `http://${host}:5000`;
})();
function applyTheme() {
    const dark = localStorage.getItem('shilp_theme') === 'dark';
    document.body.classList.toggle('dark-theme', dark);
}
function toggleTheme() {
    const dark = document.body.classList.toggle('dark-theme');
    localStorage.setItem('shilp_theme', dark ? 'dark' : 'light');
    toast(dark ? 'Dark theme enabled 🌙' : 'Light theme enabled ☀️', 'info');
    renderNav();
}
applyTheme();

const CATEGORIES = ['Art', 'Handmade', 'Clothing', 'Jewelry', 'Home Decor', 'Accessories', 'Digital Art', 'Crafts', 'Gifts', 'Custom Creations', 'Other'];

// --- Global State ---
const state = {
    user: null,
    cart: JSON.parse(localStorage.getItem('shilp_cart') || '[]'),
    currentPage: 'home',
    products: [],
    sellers: [],
    exploreFilters: {
        search: '',
        category: '',
        min_price: '',
        max_price: '',
        availability: '',
        sort: 'newest'
    },
    currentProduct: null,
    currentSeller: null,
    dashboardTab: 'overview',
    currentConversation: null,
    conversations: [],
    checkoutData: {
        items: [],
        delivery: {},
        payment_method: ''
    },
    checkoutStep: 1
};

// --- API helper ---
function getStoredAuthToken() {
    try { return localStorage.getItem('shilp_auth_token') || ''; } catch (_) { return ''; }
}
function setStoredAuthToken(token) {
    try {
        if (token) localStorage.setItem('shilp_auth_token', token);
        else localStorage.removeItem('shilp_auth_token');
    } catch (_) {}
}

async function api(path, options = {}) {
    try {
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        const token = getStoredAuthToken();
        if (token) headers.Authorization = `Bearer ${token}`;
        const opts = { credentials: 'include', ...options, headers };
        if (opts.body && typeof opts.body !== 'string') opts.body = JSON.stringify(opts.body);
        const res = await fetch(API + path, opts);
        if (res.status === 204) return {};
        const contentType = res.headers.get('content-type') || '';
        const data = contentType.includes('application/json') ? await res.json().catch(() => ({})) : {};
        if (!res.ok) {
            if (res.status === 401 && path !== '/api/login' && path !== '/api/register') {
                setStoredAuthToken('');
                state.user = null;
            }
            return { error: data.error || `Request failed (${res.status}). Make sure the Flask server is running.` };
        }
        return data;
    } catch (err) {
        console.error('API error:', err);
        return { error: 'ShilpVerse is temporarily unable to connect to the server. Please try again.' };
    }
}

// --- Utility functions ---
function el(id) { return document.getElementById(id); }
function formatPrice(n) { return '\u20b9' + Number(n).toLocaleString('en-IN'); }
function formatDate(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}
function formatTime(d) {
    if (!d) return '';
    const date = new Date(d);
    return date.toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function escapeHtml(s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function resolveImageUrl(src) {
    if (!src) return '';
    const value = String(src).trim();
    if (!value || value.startsWith('data:') || value.startsWith('blob:') || /^https?:\/\//i.test(value)) return value;
    // Local assets must be requested from Flask when the UI is opened via file://
    // or another local development server.
    if (value.startsWith('/')) return (API || window.location.origin) + value;
    return value;
}

function getInitials(name) {
    if (!name) return '?';
    return name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
}
function starHtml(rating, size = '') {
    let html = '';
    const r = Math.round(rating);
    for (let i = 1; i <= 5; i++) {
        html += `<span class="${i <= r ? 'star' : 'star-empty'}">${size === 'sm' ? '\u2605' : '\u2605'}</span>`;
    }
    return html;
}
function avatarHtml(image, name, cls) {
    if (image) return `<img src="${escapeHtml(resolveImageUrl(image))}" class="${cls}" alt="${escapeHtml(name || '')}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex'"><span class="${cls}-placeholder" style="display:none">${getInitials(name)}</span>`;
    return `<span class="${cls}-placeholder">${getInitials(name)}</span>`;
}

// --- Toast notifications ---
function toast(message, type = 'success', duration = 3000) {
    const container = el('toastContainer');
    const icons = { success: '\u2713', error: '\u2717', warning: '\u26a0', info: '\u2139' };
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.innerHTML = `<span class="toast-icon">${icons[type] || icons.success}</span><span>${escapeHtml(message)}</span>`;
    container.appendChild(t);
    setTimeout(() => {
        t.classList.add('fade-out');
        setTimeout(() => t.remove(), 300);
    }, duration);
}

// --- Image fallback ---
function imgFallbackHtml(src, alt, cls) {
    return `<img src="${escapeHtml(resolveImageUrl(src || ''))}" class="${cls}" alt="${escapeHtml(alt || '')}" loading="lazy" onerror="this.onerror=null; this.parentElement.innerHTML='<div class=&quot;${cls}-placeholder&quot;><span class=&quot;placeholder-icon&quot;>\u{1F5BC}</span><span>Image unavailable</span></div>'">`;
}

// ============================================
// NAVIGATION & ROUTING
// ============================================
function navigate(page, params = {}) {
    // Close mobile menu
    el('navMenu').classList.remove('open');
    // Update active states
    document.querySelectorAll('.nav-link, .mbn-item').forEach(l => l.classList.remove('active'));
    document.querySelectorAll(`[data-page="${page}"]`).forEach(l => l.classList.add('active'));
    state.currentPage = page;
    state.currentParams = params;

    // Route to the right renderer
    const routes = {
        home: renderHome,
        explore: renderExplore,
        categories: renderCategories,
        sellers: renderSellers,
        product: () => renderProductDetail(params.id),
        seller: () => renderSellerProfile(params.id),
        login: renderLogin,
        register: () => renderRegister(params),
        cart: renderCartPage,
        favorites: renderFavoritesPage,
        dashboard: () => renderDashboard(params),
        checkout: renderCheckout,
        messages: renderMessagesPage,
        settings: renderSettings
    };

    const renderer = routes[page] || renderHome;
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
        const result = renderer();
        if (result && typeof result.catch === 'function') {
            result.catch(err => { console.error('Navigation error:', err); renderErrorPage(); });
        }
    } catch (err) {
        console.error('Navigation error:', err);
        renderErrorPage();
    }
}

function renderErrorPage() {
    el('app').innerHTML = `
        <div class="page-container page-fade-in" style="text-align:center; padding: 80px 20px;">
            <h1 style="font-size:32px; margin-bottom:16px;">Something went wrong</h1>
            <p style="color:var(--gray-500); margin-bottom:24px;">We couldn't load this page. Please try again.</p>
            <button class="btn btn-primary" onclick="navigate('home')">Back to Home</button>
        </div>`;
}

// ============================================
// AUTH STATE & NAV RENDERING
// ============================================
async function checkAuth() {
    const data = await api('/api/me');
    if (data.user) {
        state.user = data.user;
        renderNav();
        return true;
    }
    state.user = null;
    renderNav();
    return false;
}

function renderNav() {
    const navRight = el('navRight');
    const mbn = el('mobileBottomNav');

    if (!state.user) {
        navRight.innerHTML = `
            <button class="nav-icon-btn" onclick="navigate('explore')" aria-label="Search" title="Search">\ud83d\udd0d</button>
            <button class="nav-icon-btn" onclick="toggleTheme()" aria-label="Toggle dark theme" title="Toggle dark theme">${document.body.classList.contains('dark-theme') ? '☀️' : '🌙'}</button>
            <button class="nav-icon-btn" onclick="navigate('favorites')" aria-label="Favorites" title="Favorites">\u2661</button>
            <button class="nav-icon-btn" onclick="navigate('cart')" aria-label="Cart" title="Cart" style="position:relative">\ud83d\uded2<span class="nav-badge" id="navCartBadge" style="display:none">0</span></button>
            <button class="nav-btn nav-btn-outline" onclick="navigate('login')">Login</button>
            <button class="nav-btn nav-btn-primary" onclick="navigate('register')">Create Account</button>
        `;
    } else {
        const isSeller = state.user.account_type === 'seller';
        const dashboardLabel = isSeller ? 'Seller Dashboard' : 'Buyer Dashboard';
        const favIcon = isSeller ? '' : '<button class="nav-icon-btn" onclick="navigate(\'favorites\')" aria-label="Favorites" title="Favorites">\u2661</button>';
        navRight.innerHTML = `
            <button class="nav-icon-btn" onclick="navigate('explore')" aria-label="Search" title="Search">\ud83d\udd0d</button>
            <button class="nav-icon-btn" onclick="toggleTheme()" aria-label="Toggle dark theme" title="Toggle dark theme">${document.body.classList.contains('dark-theme') ? '☀️' : '🌙'}</button>
            ${favIcon}
            <button class="nav-icon-btn" onclick="navigate('cart')" aria-label="Cart" title="Cart" style="position:relative">\ud83d\uded2<span class="nav-badge" id="navCartBadge" style="display:none">0</span></button>
            <div class="nav-account">
                <button class="account-trigger" onclick="toggleAccountDropdown()" aria-label="Account menu">
                    ${avatarHtml(state.user.profile_image, state.user.name, 'account-avatar')}
                    <span class="account-name">${escapeHtml(state.user.name)}</span>
                    <span style="font-size:12px; color:var(--gray-400)">\u25BE</span>
                </button>
                <div class="account-dropdown" id="accountDropdown">
                    <div class="account-dropdown-header">
                        <h4>${escapeHtml(state.user.name)}</h4>
                        <p>${escapeHtml(state.user.email)}</p>
                    </div>
                    <button class="account-dropdown-item" onclick="closeAccountDropdown(); navigate('dashboard')"><span class="adi-icon">\ud83d\udcc8</span> ${dashboardLabel}</button>
                    ${!isSeller ? '<button class="account-dropdown-item" onclick="closeAccountDropdown(); navigate(\'favorites\')"><span class="adi-icon">\u2661</span> Favorites</button>' : ''}
                    <button class="account-dropdown-item" onclick="closeAccountDropdown(); navigate('messages')"><span class="adi-icon">\u2709</span> Messages</button>
                    <button class="account-dropdown-item" onclick="closeAccountDropdown(); navigate('settings')"><span class="adi-icon">\u2699</span> Settings</button>
                    <div class="account-dropdown-divider"></div>
                    ${isSeller ? '<button class="account-dropdown-item" onclick="closeAccountDropdown(); navigate(\'dashboard\', {tab:\'products\'})"><span class="adi-icon">\ud83d\udce6</span> My Products</button>' : ''}
                    <button class="account-dropdown-item danger" onclick="closeAccountDropdown(); logout()"><span class="adi-icon">\u2198</span> Logout</button>
                </div>
            </div>
        `;
    }
    updateCartBadge();
}

function toggleAccountDropdown() {
    el('accountDropdown').classList.toggle('open');
}
function closeAccountDropdown() {
    el('accountDropdown')?.classList.remove('open');
}

// Close dropdown when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.nav-account')) {
        closeAccountDropdown();
    }
});

// ============================================
// AUTH PAGES
// ============================================
function renderLogin() {
    el('app').innerHTML = `
        <div class="auth-page page-fade-in">
            <div class="auth-card">
                <h1>Welcome back</h1>
                <p class="auth-subtitle">Log in to your ShilpVerse account</p>
                <div id="loginError"></div>
                <form onsubmit="handleLogin(event)">
                    <div class="form-group">
                        <label for="loginIdentifier">Email or Username</label>
                        <input type="text" id="loginIdentifier" required placeholder="you@example.com">
                    </div>
                    <div class="form-group">
                        <label for="loginPassword">Password</label>
                        <input type="password" id="loginPassword" required placeholder="Enter your password">
                    </div>
                    <div class="form-group">
                        <label class="form-check">
                            <input type="checkbox" id="rememberMe" checked> Remember me on this device
                        </label>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full btn-lg">Login</button>
                </form>
                <div class="auth-footer">
                    New to ShilpVerse? <a href="#" onclick="navigate('register'); return false;">Create Account</a>
                </div>
                <div style="margin-top:20px; padding:16px; background:var(--cream-100); border-radius:12px; font-size:13px; color:var(--gray-500);">
                    <strong>Demo accounts:</strong><br>
                    Buyer: buyer@demo.com / demo123<br>
                    Seller: aarav@demo.com / demo123
                </div>
            </div>
        </div>`;
}

async function handleLogin(e) {
    e.preventDefault();
    const identifier = el('loginIdentifier').value.trim();
    const password = el('loginPassword').value;
    const errDiv = el('loginError');

    if (!identifier || !password) {
        errDiv.innerHTML = '<div class="form-error">Please enter your email/username and password.</div>';
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Logging in...';

    const data = await api('/api/login', {
        method: 'POST',
        body: { identifier, password }
    });

    btn.disabled = false;
    btn.textContent = 'Login';

    if (data.error) {
        errDiv.innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`;
        return;
    }

    setStoredAuthToken(data.auth_token || '');
    const authenticated = await checkAuth();
    if (!authenticated) {
        setStoredAuthToken('');
        errDiv.innerHTML = '<div class="form-error">Login succeeded, but the browser could not keep the session. Please try again.</div>';
        return;
    }
    toast('Logged in successfully!');
    navigate('home');
}

function renderRegister(params = {}) {
    const requestedType = params.accountType === 'seller' ? 'seller' : 'buyer';
    el('app').innerHTML = `
        <div class="auth-page page-fade-in">
            <div class="auth-card">
                <h1>Create your ShilpVerse account</h1>
                <p class="auth-subtitle">Join a marketplace of unique creations</p>
                <div class="auth-choice" id="accountTypeChoice">
                    <div class="auth-choice-card ${requestedType === 'buyer' ? 'selected' : ''}" onclick="selectAccountType('buyer')" id="choiceBuyer">
                        <div class="choice-icon">\ud83d\udc6b</div>
                        <h3>Buyer</h3>
                        <p>Discover, save and purchase unique creations.</p>
                    </div>
                    <div class="auth-choice-card ${requestedType === 'seller' ? 'selected' : ''}" onclick="selectAccountType('seller')" id="choiceSeller">
                        <div class="choice-icon">\ud83c\udfa8</div>
                        <h3>Seller</h3>
                        <p>Showcase your creations and sell to customers.</p>
                    </div>
                </div>
                <div id="registerError"></div>
                <form onsubmit="handleRegister(event)">
                    <input type="hidden" id="regAccountType" value="${requestedType}">
                    <div class="form-group">
                        <label for="regName">Full Name</label>
                        <input type="text" id="regName" required placeholder="Your full name">
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="regUsername">Username</label>
                            <input type="text" id="regUsername" required placeholder="username">
                        </div>
                        <div class="form-group">
                            <label for="regEmail">Email</label>
                            <input type="email" id="regEmail" required placeholder="you@example.com">
                        </div>
                    </div>
                    <div class="form-row">
                        <div class="form-group">
                            <label for="regPassword">Password</label>
                            <input type="password" id="regPassword" required placeholder="Min 6 characters">
                        </div>
                        <div class="form-group">
                            <label for="regConfirm">Confirm Password</label>
                            <input type="password" id="regConfirm" required placeholder="Re-enter password">
                        </div>
                    </div>
                    <div id="sellerFields" style="display:none">
                        <div class="form-group">
                            <label for="regShopName">Shop Name</label>
                            <input type="text" id="regShopName" placeholder="Your shop name">
                        </div>
                        <div class="form-group">
                            <label for="regShopDesc">Shop Description</label>
                            <textarea id="regShopDesc" placeholder="Tell buyers about your shop..."></textarea>
                        </div>
                    </div>
                    <button type="submit" class="btn btn-primary btn-full btn-lg">Create Account</button>
                </form>
                <div class="auth-footer">
                    Already have an account? <a href="#" onclick="navigate('login'); return false;">Login</a>
                </div>
            </div>
        </div>`;
}

function selectAccountType(type) {
    document.querySelectorAll('.auth-choice-card').forEach(c => c.classList.remove('selected'));
    el('choice' + type.charAt(0).toUpperCase() + type.slice(1)).classList.add('selected');
    el('regAccountType').value = type;
    el('sellerFields').style.display = type === 'seller' ? 'block' : 'none';
    if (type === 'seller') {
        el('regShopName').required = true;
    } else {
        el('regShopName').required = false;
    }
}

async function handleRegister(e) {
    e.preventDefault();
    const account_type = el('regAccountType').value;
    const name = el('regName').value.trim();
    const username = el('regUsername').value.trim();
    const email = el('regEmail').value.trim().toLowerCase();
    const password = el('regPassword').value;
    const confirm = el('regConfirm').value;
    const shop_name = el('regShopName')?.value.trim() || '';
    const shop_description = el('regShopDesc')?.value.trim() || '';
    const errDiv = el('registerError');

    if (!name || !username || !email || !password) {
        errDiv.innerHTML = '<div class="form-error">All fields are required.</div>';
        return;
    }
    if (password !== confirm) {
        errDiv.innerHTML = '<div class="form-error">Passwords do not match.</div>';
        return;
    }
    if (password.length < 6) {
        errDiv.innerHTML = '<div class="form-error">Password must be at least 6 characters.</div>';
        return;
    }
    if (account_type === 'seller' && !shop_name) {
        errDiv.innerHTML = '<div class="form-error">Shop name is required for seller accounts.</div>';
        return;
    }

    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Creating account...';

    const body = { name, username, email, password, confirm_password: confirm, account_type };
    if (account_type === 'seller') {
        body.shop_name = shop_name;
        body.shop_description = shop_description;
    }

    const data = await api('/api/register', { method: 'POST', body });

    btn.disabled = false;
    btn.textContent = 'Create Account';

    if (data.error) {
        errDiv.innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`;
        return;
    }

    setStoredAuthToken(data.auth_token || '');
    const authenticated = await checkAuth();
    if (!authenticated) {
        setStoredAuthToken('');
        errDiv.innerHTML = '<div class="form-error">Your account was created, but the browser could not keep the login session. Please log in again.</div>';
        return;
    }
    toast('Account created successfully!');
    navigate('home');
}

async function logout() {
    await api('/api/logout', { method: 'POST' });
    setStoredAuthToken('');
    state.user = null;
    toast('Logged out successfully!');
    renderNav();
    navigate('home');
}

// ============================================
// HOMEPAGE
// ============================================
async function renderHome() {
    el('app').innerHTML = `
        <div class="page-fade-in">
            <!-- Hero -->
            <section class="hero">
                <div class="hero-container">
                    <div class="hero-text">
                        <span class="hero-badge">\u2728 Handmade &amp; Unique Marketplace</span>
                        <h1>Discover something <span class="accent">made differently.</span></h1>
                        <p class="hero-subtitle">ShilpVerse connects you with independent creators making handmade, artistic, and one-of-a-kind products. Every piece has a story.</p>
                        <div class="hero-actions">
                            <button class="btn btn-primary btn-lg" onclick="navigate('explore')">Explore Products</button>
                            <button class="btn btn-outline btn-lg" onclick="startSelling()">Start Selling</button>
                        </div>
                        <div class="hero-stats">
                            <div class="hero-stat"><strong>15+</strong><span>Unique creations</span></div>
                            <div class="hero-stat"><strong>5</strong><span>Independent sellers</span></div>
                            <div class="hero-stat"><strong>11</strong><span>Categories</span></div>
                        </div>
                    </div>
                    <div class="hero-collage" id="heroCollage">
                        <div class="skeleton-card" style="aspect-ratio:1; border-radius:20px;"></div>
                        <div class="skeleton-card" style="aspect-ratio:1; border-radius:20px;"></div>
                        <div class="skeleton-card" style="aspect-ratio:1; border-radius:20px;"></div>
                        <div class="skeleton-card" style="aspect-ratio:1; border-radius:20px;"></div>
                    </div>
                </div>
            </section>

            <!-- Trending -->
            <section class="section">
                <div class="page-container">
                    <div class="section-header">
                        <div>
                            <h2>Trending Creations</h2>
                            <p>Handpicked pieces our community loves right now</p>
                        </div>
                        <a href="#" class="section-link" onclick="navigate('explore'); return false;">View all \u2192</a>
                    </div>
                    <div class="product-grid" id="trendingGrid">
                        ${Array(4).fill('<div class="skeleton-card"><div class="skeleton-img"></div><div style="padding:16px"><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line" style="width:50%"></div></div></div>').join('')}
                    </div>
                </div>
            </section>

            <!-- Categories -->
            <section class="section" style="background: var(--cream-100);">
                <div class="page-container">
                    <div class="section-header">
                        <div><h2>Shop by Category</h2><p>Find exactly what you're looking for</p></div>
                    </div>
                    <div class="category-grid" id="homeCategoryGrid"></div>
                </div>
            </section>

            <!-- Featured Sellers -->
            <section class="section">
                <div class="page-container">
                    <div class="section-header">
                        <div><h2>Featured Creators</h2><p>Meet the makers behind the magic</p></div>
                        <a href="#" class="section-link" onclick="navigate('sellers'); return false;">All sellers \u2192</a>
                    </div>
                    <div class="product-grid" id="featuredSellers">
                        ${Array(3).fill('<div class="skeleton-card" style="height:200px; border-radius:20px;"></div>').join('')}
                    </div>
                </div>
            </section>
        </div>`;

    // Load products for hero collage and trending
    const data = await api('/api/products?limit=8');
    if (data.products && data.products.length > 0) {
        // Hero collage — pick 4 diverse images
        const collageImgs = data.products.slice(0, 4);
        el('heroCollage').innerHTML = collageImgs.map(p => `
            <div class="hero-collage-item" onclick="navigate('product', {id: ${p.id}})">
                ${imgFallbackHtml(p.image, p.name, 'hero-img')}
            </div>
        `).join('');

        // Trending — pick 4 products
        el('trendingGrid').innerHTML = data.products.slice(0, 4).map(productCardHtml).join('');
    } else if (data.error) {
        el('trendingGrid').innerHTML = `<div class="error-banner"><p>${escapeHtml(data.error)}</p><button onclick="navigate('home')">Retry</button></div>`;
    } else {
        el('trendingGrid').innerHTML = '<p style="color:var(--gray-500); text-align:center;">No products yet. Check back soon!</p>';
    }

    // Categories
    renderHomeCategories();

    // Featured sellers
    const sellersData = await api('/api/sellers');
    if (sellersData.sellers) {
        el('featuredSellers').innerHTML = sellersData.sellers.slice(0, 3).map(s => `
            <div class="category-card" style="text-align:left; cursor:pointer" onclick="navigate('seller', {id: ${s.id}})">
                ${avatarHtml(s.profile_image, s.shop_name, 'seller-avatar')?.replace('seller-avatar', 'seller-avatar').replace('width: 22px', 'width: 60px').replace('height: 22px', 'height: 60px')}
                <h3 style="margin-top:12px; font-size:18px;">${escapeHtml(s.shop_name)}</h3>
                <p style="font-size:13px; color:var(--gray-500); margin-top:4px;">${escapeHtml(s.description || '').substring(0, 80)}...</p>
                <div style="margin-top:12px; display:flex; gap:16px; font-size:13px; color:var(--gray-500);">
                    <span>\u2605 ${s.rating || 'New'}</span>
                    <span>${s.product_count} products</span>
                </div>
            </div>
        `).join('');
    }
}

async function renderHomeCategories() {
    const data = await api('/api/products?limit=100');
    const products = data.products || [];
    const counts = {};
    CATEGORIES.forEach(c => counts[c] = 0);
    products.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });

    const icons = {
        'Art': '\ud83c\udfa8', 'Handmade': '\ud83d\udc9a', 'Clothing': '\ud83d\udc55', 'Jewelry': '\ud83d\udc8e',
        'Home Decor': '\ud83c\udfe1', 'Accessories': '\ud83d\udc84', 'Digital Art': '\ud83d\udda5', 'Crafts': '\ud83d\udedc',
        'Gifts': '\ud83c\udf81', 'Custom Creations': '\u2728', 'Other': '\ud83d\uddc2'
    };

    el('homeCategoryGrid').innerHTML = CATEGORIES.map(cat => `
        <div class="category-card" onclick="navigate('explore', {category: '${cat}'})">
            <span class="category-icon">${icons[cat] || '\ud83d\uddc2'}</span>
            <div class="category-name">${cat}</div>
            <div class="category-count">${counts[cat]} products</div>
        </div>
    `).join('');
}

// ============================================
// PRODUCT CARD
// ============================================
function productCardHtml(p) {
    const fav = p.favorited ? 'active' : '';
    const favHeart = p.favorited ? '\u2665' : '\u2661';
    const stockBadge = p.stock > 0 ? '' : '<span style="position:absolute;top:12px;left:12px;background:var(--charcoal-900);color:var(--cream-50);padding:4px 12px;border-radius:999px;font-size:11px;font-weight:600;z-index:2">Out of stock</span>';
    return `
        <div class="product-card" onclick="navigate('product', {id: ${p.id}})">
            <div class="product-card-image">
                ${stockBadge}
                ${imgFallbackHtml(p.image, p.name, 'product-img')}
                <button class="product-fav-btn ${fav}" onclick="event.stopPropagation(); toggleFavorite(${p.id})" aria-label="Add to favorites">${favHeart}</button>
                <div class="quick-view-btn" onclick="event.stopPropagation(); quickView(${p.id})">Quick View</div>
            </div>
            <div class="product-card-body">
                <div class="product-card-name">${escapeHtml(p.name)}</div>
                <div class="product-card-seller">
                    ${avatarHtml(p.seller?.profile_image, p.seller?.name, 'seller-avatar')}
                    <span class="product-card-seller-name">${escapeHtml(p.seller?.shop_name || p.seller?.name || '')}</span>
                </div>
                <div class="product-card-footer">
                    <span class="product-card-price">${formatPrice(p.price)}</span>
                    <span class="product-card-rating">${p.rating > 0 ? '\u2605 ' + p.rating : ''}</span>
                </div>
            </div>
        </div>`;
}

// ============================================
// EXPLORE / MARKETPLACE
// ============================================
async function renderExplore(params = {}) {
    if (params.category) {
        state.exploreFilters.category = params.category;
    }

    el('app').innerHTML = `
        <div class="page-fade-in">
            <div class="explore-header">
                <h1>Explore Creations</h1>
                <p>Search across products, creators, and categories</p>
                <div class="search-bar">
                    <span class="search-icon">\ud83d\udd0d</span>
                    <input type="text" id="exploreSearch" placeholder="Search products, creators, categories..." value="${escapeHtml(state.exploreFilters.search)}" oninput="onSearchInput(this.value)">
                </div>
            </div>
            <div class="page-container">
                <button class="filter-toggle-btn" onclick="document.getElementById('filtersSidebar').classList.toggle('mobile-open')">\ud83d\udd0d Filters &amp; Sort</button>
                <div class="explore-layout">
                    <aside class="filters-sidebar" id="filtersSidebar">
                        <h3>Filters</h3>
                        <div class="filter-group">
                            <label>Category</label>
                            <select id="filterCategory" onchange="updateFilter('category', this.value)">
                                <option value="">All categories</option>
                                ${CATEGORIES.map(c => `<option value="${c}" ${state.exploreFilters.category === c ? 'selected' : ''}>${c}</option>`).join('')}
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Price Range</label>
                            <div class="filter-price-row">
                                <input type="number" id="filterMinPrice" placeholder="Min" value="${state.exploreFilters.min_price}" oninput="updateFilter('min_price', this.value)">
                                <input type="number" id="filterMaxPrice" placeholder="Max" value="${state.exploreFilters.max_price}" oninput="updateFilter('max_price', this.value)">
                            </div>
                        </div>
                        <div class="filter-group">
                            <label>Rating</label>
                            <select id="filterRating" onchange="updateFilter('rating', this.value)">
                                <option value="">Any rating</option>
                                <option value="4">4+ stars</option>
                                <option value="3">3+ stars</option>
                            </select>
                        </div>
                        <div class="filter-group">
                            <label>Availability</label>
                            <label class="filter-checkbox">
                                <input type="checkbox" id="filterAvail" ${state.exploreFilters.availability === 'in_stock' ? 'checked' : ''} onchange="updateFilter('availability', this.checked ? 'in_stock' : '')">
                                In stock only
                            </label>
                        </div>
                        <button class="filter-reset" onclick="resetFilters()">Reset filters</button>
                    </aside>
                    <div class="explore-results">
                        <div class="results-header">
                            <span class="results-count" id="resultsCount">Loading creations...</span>
                            <div class="results-sort">
                                <span>Sort:</span>
                                <select id="sortSelect" onchange="updateFilter('sort', this.value)">
                                    <option value="newest">Newest</option>
                                    <option value="popular">Popular</option>
                                    <option value="price_low">Price: Low to High</option>
                                    <option value="price_high">Price: High to Low</option>
                                    <option value="rating">Highest Rated</option>
                                </select>
                            </div>
                        </div>
                        <div class="product-grid" id="exploreGrid">
                            ${Array(6).fill('<div class="skeleton-card"><div class="skeleton-img"></div><div style="padding:16px"><div class="skeleton-line" style="width:80%"></div><div class="skeleton-line" style="width:50%"></div></div></div>').join('')}
                        </div>
                    </div>
                </div>
            </div>
        </div>`;

    // Set sort dropdown
    const sortSel = el('sortSelect');
    if (sortSel) sortSel.value = state.exploreFilters.sort;

    // Fetch products
    await loadExploreProducts();
}

let searchDebounce;
function onSearchInput(val) {
    state.exploreFilters.search = val;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => loadExploreProducts(), 350);
}

function updateFilter(key, val) {
    state.exploreFilters[key] = val;
    loadExploreProducts();
}

function resetFilters() {
    state.exploreFilters = { search: '', category: '', min_price: '', max_price: '', availability: '', sort: 'newest' };
    navigate('explore');
}

async function loadExploreProducts() {
    const f = state.exploreFilters;
    let qs = '?limit=60';
    if (f.search) qs += `&search=${encodeURIComponent(f.search)}`;
    if (f.category) qs += `&category=${encodeURIComponent(f.category)}`;
    if (f.min_price) qs += `&min_price=${f.min_price}`;
    if (f.max_price) qs += `&max_price=${f.max_price}`;
    if (f.availability) qs += `&availability=${f.availability}`;
    if (f.sort) qs += `&sort=${f.sort}`;

    const data = await api('/api/products' + qs);
    const grid = el('exploreGrid');
    const count = el('resultsCount');

    if (data.error) {
        grid.innerHTML = '';
        count.textContent = '';
        el('app').querySelector('.explore-results').innerHTML = `<div class="error-banner"><p>${escapeHtml(data.error)}</p><button onclick="loadExploreProducts()">Retry</button></div>`;
        return;
    }

    const products = data.products || [];
    // Client-side rating filter
    let filtered = products;
    if (f.rating) {
        filtered = filtered.filter(p => p.rating >= parseFloat(f.rating));
    }

    if (filtered.length === 0) {
        grid.innerHTML = '';
        count.textContent = '0 creations found';
        el('exploreGrid').innerHTML = `
            <div class="no-results" style="grid-column:1/-1">
                <h3>We couldn't find anything matching that.</h3>
                <p>Try adjusting your filters or search for something different.</p>
                <div class="no-results-suggestions">
                    ${CATEGORIES.slice(0, 5).map(c => `<button onclick="resetFilters(); updateFilter('category', '${c}')">${c}</button>`).join('')}
                </div>
            </div>`;
        return;
    }

    count.textContent = `${filtered.length} creation${filtered.length !== 1 ? 's' : ''} found`;
    el('exploreGrid').innerHTML = filtered.map(productCardHtml).join('');
}

// ============================================
// CATEGORIES PAGE
// ============================================
async function renderCategories() {
    el('app').innerHTML = `
        <div class="page-fade-in">
            <div class="explore-header">
                <h1>Browse Categories</h1>
                <p>Explore creations by category</p>
            </div>
            <div class="page-container">
                <div class="category-grid" id="categoriesGrid">
                    ${Array(6).fill('<div class="skeleton-card" style="height:140px; border-radius:20px;"></div>').join('')}
                </div>
            </div>
        </div>`;

    const data = await api('/api/products?limit=100');
    const products = data.products || [];
    const counts = {};
    CATEGORIES.forEach(c => counts[c] = 0);
    products.forEach(p => { if (counts[p.category] !== undefined) counts[p.category]++; });

    const icons = {
        'Art': '\ud83c\udfa8', 'Handmade': '\ud83d\udc9a', 'Clothing': '\ud83d\udc55', 'Jewelry': '\ud83d\udc8e',
        'Home Decor': '\ud83c\udfe1', 'Accessories': '\ud83d\udc84', 'Digital Art': '\ud83d\udda5', 'Crafts': '\ud83d\udedc',
        'Gifts': '\ud83c\udf81', 'Custom Creations': '\u2728', 'Other': '\ud83d\uddc2'
    };

    el('categoriesGrid').innerHTML = CATEGORIES.map(cat => `
        <div class="category-card" onclick="navigate('explore', {category: '${cat}'})">
            <span class="category-icon">${icons[cat] || '\ud83d\uddc2'}</span>
            <div class="category-name">${cat}</div>
            <div class="category-count">${counts[cat]} product${counts[cat] !== 1 ? 's' : ''}</div>
        </div>
    `).join('');
}

// ============================================
// SELLERS PAGE
// ============================================
async function renderSellers() {
    el('app').innerHTML = `
        <div class="page-fade-in">
            <div class="explore-header">
                <h1>Meet Our Creators</h1>
                <p>Independent makers and artists behind ShilpVerse</p>
            </div>
            <div class="page-container">
                <div class="product-grid" id="sellersGrid">
                    ${Array(3).fill('<div class="skeleton-card" style="height:200px; border-radius:20px;"></div>').join('')}
                </div>
            </div>
        </div>`;

    const data = await api('/api/sellers');
    if (data.error) {
        el('sellersGrid').innerHTML = `<div class="error-banner" style="grid-column:1/-1"><p>${escapeHtml(data.error)}</p></div>`;
        return;
    }
    const sellers = data.sellers || [];
    if (sellers.length === 0) {
        el('sellersGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">\ud83c\udfa8</div><h3>No sellers yet</h3><p>Be the first to start selling!</p><button class="btn btn-accent" onclick="navigate(\'register\')">Start Selling</button></div>';
        return;
    }
    el('sellersGrid').innerHTML = sellers.map(s => sellerCardHtml(s)).join('');
}

function sellerCardHtml(s) {
    return `
        <div class="category-card" style="text-align:left; cursor:pointer" onclick="navigate('seller', {id: ${s.id}})">
            ${s.banner ? `<div style="width:100%; height:80px; border-radius:12px; overflow:hidden; margin-bottom:12px; background:var(--cream-200)">${imgFallbackHtml(s.banner, s.shop_name, '')}</div>` : '<div style="width:100%; height:80px; border-radius:12px; background:linear-gradient(135deg,var(--terra-300),var(--terra-500)); margin-bottom:12px;"></div>'}
            <h3 style="font-size:18px;">${escapeHtml(s.shop_name)}</h3>
            <p style="font-size:13px; color:var(--gray-500); margin-top:4px; min-height:40px;">${escapeHtml(s.description || '').substring(0, 80)}...</p>
            <div style="margin-top:12px; display:flex; gap:16px; font-size:13px; color:var(--gray-500); align-items:center;">
                <span>\u2605 ${s.rating || 'New'}</span>
                <span>${s.product_count} products</span>
            </div>
            <div style="margin-top:8px; font-size:12px; color:var(--gray-400)">by ${escapeHtml(s.name)}</div>
        </div>`;
}

// ============================================
// PRODUCT DETAIL
// ============================================
async function renderProductDetail(id) {
    el('app').innerHTML = `<div class="page-container" style="padding-top:40px;"><div class="skeleton-card" style="height:500px; border-radius:28px;"></div></div>`;

    const data = await api(`/api/products/${id}`);
    if (data.error || !data.product) {
        el('app').innerHTML = `<div class="page-container page-fade-in" style="text-align:center; padding:80px 20px;"><h1 style="font-size:28px;">Product not found</h1><p style="color:var(--gray-500); margin:16px 0 24px;">${escapeHtml(data.error || 'This product may have been removed.')}</p><button class="btn btn-primary" onclick="navigate('explore')">Back to Explore</button></div>`;
        return;
    }

    const p = data.product;
    state.currentProduct = p;

    const reviewsData = await api(`/api/products/${id}/reviews`);
    const reviews = reviewsData.reviews || [];

    const stockStatus = p.stock > 0 ? `<span class="in-stock">In stock (${p.stock} available)</span>` : '<span class="out-stock">Out of stock</span>';

    el('app').innerHTML = `
        <div class="page-container page-fade-in product-detail">
            <div style="margin-bottom:16px;">
                <button class="btn btn-ghost btn-sm" onclick="navigate('explore')">\u2190 Back to Explore</button>
            </div>
            <div class="product-detail-grid">
                <div class="product-detail-gallery">
                    <div class="product-detail-main-image">
                        ${imgFallbackHtml(p.image, p.name, 'product-img')}
                    </div>
                </div>
                <div class="product-detail-info">
                    <h1>${escapeHtml(p.name)}</h1>
                    <div class="product-detail-seller-row">
                        ${avatarHtml(p.seller?.profile_image, p.seller?.name, 'seller-avatar')}
                        <div class="product-detail-seller-info">
                            <div class="shop-name" style="cursor:pointer; color:var(--terra-600)" onclick="navigate('seller', {id: ${p.seller?.id}})">${escapeHtml(p.seller?.shop_name || '')}</div>
                            <div class="seller-name">by ${escapeHtml(p.seller?.name || '')}</div>
                        </div>
                    </div>
                    <div class="product-detail-rating">
                        ${starHtml(p.rating)} <span style="margin-left:4px">${p.rating > 0 ? p.rating.toFixed(1) : 'No reviews yet'} (${p.review_count} review${p.review_count !== 1 ? 's' : ''})</span>
                    </div>
                    <div class="product-detail-price">${formatPrice(p.price)}</div>
                    <p class="product-detail-description">${escapeHtml(p.description || '')}</p>
                    <div class="product-detail-meta">
                        <div class="meta-item"><label>Category</label><span>${escapeHtml(p.category || '')}</span></div>
                        <div class="meta-item"><label>Materials</label><span>${escapeHtml(p.materials || 'Not specified')}</span></div>
                        <div class="meta-item"><label>Availability</label>${stockStatus}</div>
                        <div class="meta-item"><label>Shipping</label><span>${escapeHtml(p.shipping_information || 'Standard shipping')}</span></div>
                    </div>
                    ${p.tags ? `<div style="margin-bottom:20px;"><strong style="font-size:13px; color:var(--gray-500)">Tags: </strong>${p.tags.split(',').map(t => `<span style="display:inline-block; padding:4px 12px; background:var(--cream-100); border-radius:999px; font-size:12px; margin:4px 4px 4px 0;">${escapeHtml(t.trim())}</span>`).join('')}</div>` : ''}
                    <div class="product-detail-actions">
                        <button class="btn btn-accent btn-lg" onclick="buyNow(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>Buy Now</button>
                        <button class="btn btn-outline btn-lg" onclick="addToCart(${p.id})" ${p.stock <= 0 ? 'disabled' : ''}>Add to Cart</button>
                        <button class="btn btn-ghost btn-lg" onclick="toggleFavorite(${p.id})">${p.favorited ? '\u2665 Saved' : '\u2661 Save'}</button>
                        <button class="btn btn-ghost btn-lg" onclick="contactSeller(${p.seller?.id}, ${p.id})">\u2709 Contact Seller</button>
                    </div>
                </div>
            </div>

            <!-- Reviews section -->
            <div class="product-detail-section">
                <h3>Reviews (${reviews.length})</h3>
                <div id="reviewsContainer">
                    ${reviews.length > 0 ? reviews.map(r => `
                        <div class="review-card" style="margin-bottom:16px;">
                            <div class="review-header">
                                ${avatarHtml(r.buyer_image, r.buyer_name, 'review-avatar')}
                                <div class="review-author">
                                    <strong>${escapeHtml(r.buyer_name)}</strong>
                                    <div class="review-date">${formatDate(r.created_at)}</div>
                                </div>
                                <div style="margin-left:auto">${starHtml(r.rating)}</div>
                            </div>
                            <p class="review-text">${escapeHtml(r.review || '')}</p>
                        </div>
                    `).join('') : '<p style="color:var(--gray-500)">No reviews yet. Buy this product and be the first to review it!</p>'}
                </div>
                <div id="reviewFormContainer" style="margin-top:24px;">
                    ${state.user && state.user.account_type === 'buyer' ? `
                        <h4 style="margin-bottom:12px;">Write a Review</h4>
                        <div class="star-input" id="starInput">
                            <span onclick="setRating(1)" data-rating="1">\u2605</span>
                            <span onclick="setRating(2)" data-rating="2">\u2605</span>
                            <span onclick="setRating(3)" data-rating="3">\u2605</span>
                            <span onclick="setRating(4)" data-rating="4">\u2605</span>
                            <span onclick="setRating(5)" data-rating="5">\u2605</span>
                        </div>
                        <div class="form-group">
                            <textarea id="reviewText" placeholder="Share your thoughts about this product..." style="min-height:80px;"></textarea>
                        </div>
                        <button class="btn btn-primary" onclick="submitReview(${p.id})">Submit Review</button>
                    ` : state.user ? '' : '<p style="color:var(--gray-500)"><a href="#" onclick="navigate(\'login\'); return false;" style="color:var(--terra-600); font-weight:600;">Login</a> to write a review.</p>'}
                </div>
            </div>

            <!-- More from seller -->
            <div class="product-detail-section" id="moreFromSeller">
                <h3>More from ${escapeHtml(p.seller?.shop_name || 'this creator')}</h3>
                <div class="product-grid" id="moreProductsGrid"><div class="skeleton-card" style="height:200px; border-radius:20px;"></div></div>
            </div>
        </div>`;

    // Load more from seller
    if (p.seller?.id) {
        const moreData = await api(`/api/sellers/${p.seller.id}/products`);
        if (moreData.products) {
            const others = moreData.products.filter(x => x.id !== p.id).slice(0, 4);
            el('moreProductsGrid').innerHTML = others.length > 0 ? others.map(productCardHtml).join('') : '<p style="color:var(--gray-500)">No other products from this seller yet.</p>';
        }
    }
}

let currentRating = 0;
function setRating(n) {
    currentRating = n;
    document.querySelectorAll('#starInput span').forEach((s, i) => {
        s.classList.toggle('active', i < n);
    });
}

async function submitReview(productId) {
    if (currentRating < 1) { toast('Please select a star rating.', 'warning'); return; }
    const text = el('reviewText').value.trim();
    const data = await api('/api/reviews', {
        method: 'POST',
        body: { product_id: productId, rating: currentRating, review: text }
    });
    if (data.error) { toast(data.error, 'error'); return; }
    toast('Review added successfully!');
    renderProductDetail(productId);
}

// ============================================
// SELLER PROFILE
// ============================================
async function renderSellerProfile(id) {
    el('app').innerHTML = `<div class="page-container"><div class="skeleton-card" style="height:300px; border-radius:28px; margin:20px 0;"></div></div>`;

    const data = await api(`/api/sellers/${id}`);
    if (data.error || !data.seller) {
        el('app').innerHTML = `<div class="page-container page-fade-in" style="text-align:center; padding:80px 20px;"><h1>Seller not found</h1><button class="btn btn-primary" onclick="navigate('sellers')" style="margin-top:16px">Back to Sellers</button></div>`;
        return;
    }

    const s = data.seller;
    state.currentSeller = s;
    const products = s.products || [];
    const reviews = s.reviews || [];
    const avgRating = reviews.length > 0 ? (reviews.reduce((a, r) => a + r.rating, 0) / reviews.length).toFixed(1) : s.rating || 'New';

    el('app').innerHTML = `
        <div class="page-container page-fade-in seller-profile">
            <div style="margin-bottom:16px;">
                <button class="btn btn-ghost btn-sm" onclick="navigate('sellers')">\u2190 All Sellers</button>
            </div>
            <div class="seller-banner">
                ${s.banner ? imgFallbackHtml(s.banner, s.shop_name, '') : ''}
            </div>
            <div class="seller-profile-header">
                ${avatarHtml(s.profile_image, s.shop_name, 'seller-profile-avatar')}
                <div class="seller-profile-info">
                    <h1>${escapeHtml(s.shop_name)}</h1>
                    <p class="seller-tagline">by ${escapeHtml(s.name)} \u00b7 Joined ${formatDate(s.created_at)}</p>
                    <p style="color:var(--charcoal-600); margin:12px 0; line-height:1.6;">${escapeHtml(s.description || '')}</p>
                    <div class="seller-profile-stats">
                        <div class="stat"><strong>${avgRating}</strong><span>Rating</span></div>
                        <div class="stat"><strong>${products.length}</strong><span>Products</span></div>
                        <div class="stat"><strong>${reviews.length}</strong><span>Reviews</span></div>
                    </div>
                </div>
                <button class="btn btn-outline" onclick="contactSeller(${s.id})">\u2709 Contact Seller</button>
            </div>

            <div class="section-header" style="margin-top:32px;">
                <h2>Products</h2>
            </div>
            ${products.length > 0 ? `<div class="product-grid">${products.map(productCardHtml).join('')}</div>` : '<p style="color:var(--gray-500)">This seller hasn\'t added any products yet.</p>'}

            ${reviews.length > 0 ? `
                <div class="product-detail-section">
                    <h3>Reviews</h3>
                    <div class="reviews-list">
                        ${reviews.map(r => `
                            <div class="review-card">
                                <div class="review-header">
                                    ${avatarHtml(r.buyer_image, r.buyer_name, 'review-avatar')}
                                    <div class="review-author"><strong>${escapeHtml(r.buyer_name)}</strong><div class="review-date">${formatDate(r.created_at)}</div></div>
                                    <div style="margin-left:auto">${starHtml(r.rating)}</div>
                                </div>
                                <p class="review-text">${escapeHtml(r.review || '')}</p>
                                <p style="font-size:12px; color:var(--gray-400); margin-top:8px;">on ${escapeHtml(r.product_name)}</p>
                            </div>
                        `).join('')}
                    </div>
                </div>
            ` : ''}
        </div>`;
}

// ============================================
// FAVORITES
// ============================================
async function toggleFavorite(productId) {
    if (!state.user) {
        toast('Please login to save favorites.', 'info');
        navigate('login');
        return;
    }
    if (state.user.account_type !== 'buyer') {
        toast('Only buyer accounts can save favorites.', 'info');
        return;
    }
    // Check current state from DOM
    const btn = event?.target?.closest('.product-fav-btn');
    const isFav = btn?.classList.contains('active');

    if (isFav) {
        const data = await api(`/api/favorites/${productId}`, { method: 'DELETE' });
        if (data.error) { toast(data.error, 'error'); return; }
        toast('Removed from favorites.');
        if (btn) { btn.classList.remove('active'); btn.innerHTML = '\u2661'; }
    } else {
        const data = await api('/api/favorites', { method: 'POST', body: { product_id: productId } });
        if (data.error) { toast(data.error, 'error'); return; }
        toast('Added to favorites \u2665');
        if (btn) { btn.classList.add('active'); btn.innerHTML = '\u2665'; btn.querySelector('.heart-icon')?.classList.add('heart-icon'); }
    }

    // If on favorites page, re-render
    if (state.currentPage === 'favorites') renderFavoritesPage();
}

async function renderFavoritesPage() {
    if (!state.user) { navigate('login'); return; }
    el('app').innerHTML = `<div class="page-container page-fade-in"><div class="section-header"><h2>Your Favorites</h2></div><div class="product-grid" id="favGrid">${Array(3).fill('<div class="skeleton-card"><div class="skeleton-img"></div><div style="padding:16px"><div class="skeleton-line"></div></div></div>').join('')}</div></div>`;
    const data = await api('/api/favorites');
    if (data.error) { el('favGrid').innerHTML = `<div class="error-banner" style="grid-column:1/-1"><p>${escapeHtml(data.error)}</p></div>`; return; }
    const products = data.products || [];
    if (products.length === 0) {
        el('favGrid').innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="empty-icon">\u2661</div><h3>No favorites yet</h3><p>Tap the heart icon on any product to save it here.</p><button class="btn btn-accent" onclick="navigate(\'explore\')">Explore Products</button></div>';
        return;
    }
    el('favGrid').innerHTML = products.map(productCardHtml).join('');
}

// ============================================
// CART
// ============================================
function saveCart() { localStorage.setItem('shilp_cart', JSON.stringify(state.cart)); updateCartBadge(); }
function updateCartBadge() {
    const count = state.cart.reduce((a, c) => a + c.quantity, 0);
    const badge = el('navCartBadge');
    const mbnBadge = el('mbnCartBadge');
    if (badge) { badge.style.display = count > 0 ? 'flex' : 'none'; badge.textContent = count; }
    if (mbnBadge) { mbnBadge.style.display = count > 0 ? 'flex' : 'none'; mbnBadge.textContent = count; }
}

async function addToCart(productId) {
    if (!state.user) { toast('Please login to add items to cart.', 'info'); navigate('login'); return; }
    if (state.user.account_type !== 'buyer') { toast('Only buyer accounts can shop.', 'info'); return; }
    // Fetch product to get details
    const data = await api(`/api/products/${productId}`);
    if (data.error || !data.product) { toast('Could not add to cart.', 'error'); return; }
    const p = data.product;
    const existing = state.cart.find(c => c.product_id === productId);
    if (existing) {
        if (existing.quantity >= p.stock) { toast('Cannot add more than available stock.', 'warning'); return; }
        existing.quantity++;
    } else {
        state.cart.push({ product_id: p.id, name: p.name, price: p.price, image: p.image, seller_id: p.seller_id, stock: p.stock, quantity: 1 });
    }
    saveCart();
    toast('Added to cart \u2713');
    openCart();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(c => c.product_id !== productId);
    saveCart();
    renderCartDrawer();
    if (state.currentPage === 'cart') renderCartPage();
}

function changeQty(productId, delta) {
    const item = state.cart.find(c => c.product_id === productId);
    if (!item) return;
    item.quantity += delta;
    if (item.quantity <= 0) { removeFromCart(productId); return; }
    if (item.stock && item.quantity > item.stock) { item.quantity = item.stock; toast('Maximum stock reached.', 'warning'); return; }
    saveCart();
    renderCartDrawer();
    if (state.currentPage === 'cart') renderCartPage();
}

function clearCart() {
    state.cart = [];
    saveCart();
    renderCartDrawer();
    if (state.currentPage === 'cart') renderCartPage();
    toast('Cart cleared.');
}

function openCart() {
    el('cartOverlay').classList.add('open');
    el('cartDrawer').classList.add('open');
    el('cartDrawer').setAttribute('aria-hidden', 'false');
    renderCartDrawer();
}
function closeCart() {
    el('cartOverlay').classList.remove('open');
    el('cartDrawer').classList.remove('open');
    el('cartDrawer').setAttribute('aria-hidden', 'true');
}

function renderCartDrawer() {
    const body = el('cartBody');
    const footer = el('cartFooter');
    if (state.cart.length === 0) {
        body.innerHTML = '<p class="drawer-empty">Your cart is empty.<br><br><button class="btn btn-outline" onclick="closeCart(); navigate(\'explore\')">Explore Products</button></p>';
        footer.style.display = 'none';
        return;
    }
    const subtotal = state.cart.reduce((a, c) => a + c.price * c.quantity, 0);
    const shipping = subtotal >= 2000 ? 0 : 99;
    const total = subtotal + shipping;

    body.innerHTML = state.cart.map(item => `
        <div class="cart-item">
            <div style="width:64px; height:64px; border-radius:8px; overflow:hidden; background:var(--cream-200); flex-shrink:0">
                ${imgFallbackHtml(item.image, item.name, '')}
            </div>
            <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.name)}</div>
                <div class="cart-item-price">${formatPrice(item.price)}</div>
                <div class="cart-item-controls">
                    <button class="qty-btn" onclick="changeQty(${item.product_id}, -1)">\u2212</button>
                    <span class="qty-display">${item.quantity}</span>
                    <button class="qty-btn" onclick="changeQty(${item.product_id}, 1)">+</button>
                    <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})" aria-label="Remove">\u2717</button>
                </div>
            </div>
        </div>
    `).join('');

    el('cartSubtotal').textContent = formatPrice(subtotal);
    el('cartShipping').textContent = shipping === 0 ? 'Free' : formatPrice(shipping);
    el('cartTotal').textContent = formatPrice(total);
    footer.style.display = 'block';
}

function renderCartPage() {
    if (!state.user) { navigate('login'); return; }
    el('app').innerHTML = `
        <div class="page-container page-fade-in" style="padding-top:40px;">
            <div class="section-header"><h2>Your Shopping Cart</h2></div>
            <div id="cartPageContent"></div>
        </div>`;
    if (state.cart.length === 0) {
        el('cartPageContent').innerHTML = '<div class="empty-state"><div class="empty-icon">\ud83d\uded2</div><h3>Your cart is empty</h3><p>Browse the marketplace and add some creations!</p><button class="btn btn-accent" onclick="navigate(\'explore\')">Explore Products</button></div>';
        return;
    }
    const subtotal = state.cart.reduce((a, c) => a + c.price * c.quantity, 0);
    const shipping = subtotal >= 2000 ? 0 : 99;
    const total = subtotal + shipping;
    el('cartPageContent').innerHTML = `
        <div style="display:grid; grid-template-columns:1fr 320px; gap:24px; align-items:start;" class="cart-page-layout">
            <div>
                ${state.cart.map(item => `
                    <div class="cart-item" style="margin-bottom:12px;">
                        <div style="width:80px; height:80px; border-radius:12px; overflow:hidden; background:var(--cream-200); flex-shrink:0">
                            ${imgFallbackHtml(item.image, item.name, '')}
                        </div>
                        <div class="cart-item-info">
                            <div class="cart-item-name" style="font-size:16px">${escapeHtml(item.name)}</div>
                            <div class="cart-item-price" style="font-size:15px">${formatPrice(item.price)}</div>
                            <div class="cart-item-controls">
                                <button class="qty-btn" onclick="changeQty(${item.product_id}, -1)">\u2212</button>
                                <span class="qty-display">${item.quantity}</span>
                                <button class="qty-btn" onclick="changeQty(${item.product_id}, 1)">+</button>
                                <button class="cart-item-remove" onclick="removeFromCart(${item.product_id})" aria-label="Remove">\u2717</button>
                            </div>
                        </div>
                        <div style="text-align:right; font-weight:700; font-size:16px;">${formatPrice(item.price * item.quantity)}</div>
                    </div>
                `).join('')}
                <button class="btn btn-ghost" onclick="clearCart()" style="margin-top:12px; color:var(--error)">Clear cart</button>
            </div>
            <div class="checkout-summary-box" style="position:sticky; top:80px;">
                <h3>Order Summary</h3>
                <div class="cart-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
                <div class="cart-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
                <div class="cart-row cart-total"><span>Total</span><span>${formatPrice(total)}</span></div>
                <button class="btn btn-primary btn-full btn-lg" style="margin-top:16px;" onclick="proceedToCheckout()">Proceed to Checkout</button>
            </div>
        </div>
        <style>@media(max-width:768px){.cart-page-layout{grid-template-columns:1fr !important}}</style>
    `;
}

function proceedToCheckout() {
    if (!state.user) { navigate('login'); return; }
    if (state.cart.length === 0) { toast('Your cart is empty.', 'warning'); return; }
    closeCart();
    state.checkoutData.items = [...state.cart];
    state.checkoutStep = 1;
    navigate('checkout');
}

// ============================================
// BUY NOW
// ============================================
async function buyNow(productId) {
    if (!state.user) { toast('Please login to buy.', 'info'); navigate('login'); return; }
    if (state.user.account_type !== 'buyer') { toast('Only buyer accounts can purchase.', 'info'); return; }
    const data = await api(`/api/products/${productId}`);
    if (data.error || !data.product) { toast('Could not load product.', 'error'); return; }
    const p = data.product;
    state.checkoutData.items = [{ product_id: p.id, name: p.name, price: p.price, image: p.image, seller_id: p.seller_id, stock: p.stock, quantity: 1 }];
    state.checkoutStep = 1;
    closeCart();
    navigate('checkout');
}

// ============================================
// CHECKOUT
// ============================================
function renderCheckout() {
    if (!state.user) { navigate('login'); return; }
    if (state.checkoutData.items.length === 0) { navigate('cart'); return; }

    const steps = ['Product', 'Delivery', 'Payment', 'Confirmation'];
    el('app').innerHTML = `
        <div class="checkout-page page-fade-in">
            <h1 style="text-align:center; margin-bottom:24px;">Checkout</h1>
            <div class="checkout-steps">
                ${steps.map((s, i) => `
                    <div class="checkout-step ${i + 1 === state.checkoutStep ? 'active' : ''} ${i + 1 < state.checkoutStep ? 'done' : ''}">
                        <span class="step-num">${i + 1 < state.checkoutStep ? '\u2713' : i + 1}</span>
                        <span>${s}</span>
                    </div>
                    ${i < steps.length - 1 ? `<div class="checkout-step-divider ${i + 1 < state.checkoutStep ? 'done' : ''}"></div>` : ''}
                `).join('')}
            </div>
            <div id="checkoutContent"></div>
        </div>`;

    renderCheckoutStep();
}

function renderCheckoutStep() {
    const content = el('checkoutContent');
    const step = state.checkoutStep;

    if (step === 1) {
        const subtotal = state.checkoutData.items.reduce((a, c) => a + c.price * c.quantity, 0);
        content.innerHTML = `
            <div class="checkout-section active">
                <div class="checkout-summary-box">
                    <h3>Review Your Items</h3>
                    ${state.checkoutData.items.map(item => `
                        <div class="checkout-product-row">
                            <div style="width:56px; height:56px; border-radius:8px; overflow:hidden; background:var(--cream-200)">${imgFallbackHtml(item.image, item.name, '')}</div>
                            <div style="flex:1"><div style="font-weight:600">${escapeHtml(item.name)}</div><div style="font-size:13px; color:var(--gray-500)">Qty: ${item.quantity}</div></div>
                            <div style="font-weight:700">${formatPrice(item.price * item.quantity)}</div>
                        </div>
                    `).join('')}
                    <div class="cart-row cart-total" style="margin-top:12px;"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
                </div>
                <div class="checkout-nav">
                    <button class="btn btn-ghost" onclick="navigate('cart')">Back to Cart</button>
                    <button class="btn btn-primary" onclick="nextCheckoutStep()">Continue to Delivery \u2192</button>
                </div>
            </div>`;
    } else if (step === 2) {
        content.innerHTML = `
            <div class="checkout-section active">
                <div class="checkout-summary-box">
                    <h3>Delivery Details</h3>
                    <div class="form-group"><label>Full Name</label><input type="text" id="delName" value="${escapeHtml(state.checkoutData.delivery.full_name || state.user.name)}" placeholder="Recipient name"></div>
                    <div class="form-group"><label>Phone Number</label><input type="tel" id="delPhone" value="${escapeHtml(state.checkoutData.delivery.phone || '')}" placeholder="10-digit mobile number"></div>
                    <div class="form-group"><label>Address</label><textarea id="delAddress" placeholder="House number, street, area" style="min-height:70px">${escapeHtml(state.checkoutData.delivery.address || '')}</textarea></div>
                    <div class="form-row">
                        <div class="form-group"><label>City</label><input type="text" id="delCity" value="${escapeHtml(state.checkoutData.delivery.city || '')}" placeholder="City"></div>
                        <div class="form-group"><label>State</label><input type="text" id="delState" value="${escapeHtml(state.checkoutData.delivery.state || '')}" placeholder="State"></div>
                    </div>
                    <div class="form-group"><label>Postal Code</label><input type="text" id="delPostal" value="${escapeHtml(state.checkoutData.delivery.postal_code || '')}" placeholder="6-digit PIN code"></div>
                </div>
                <div class="checkout-nav">
                    <button class="btn btn-ghost" onclick="prevCheckoutStep()">\u2190 Back</button>
                    <button class="btn btn-primary" onclick="nextCheckoutStep()">Continue to Payment \u2192</button>
                </div>
            </div>`;
    } else if (step === 3) {
        content.innerHTML = `
            <div class="checkout-section active">
                <div class="checkout-summary-box">
                    <h3>Payment Method</h3>
                    <div class="payment-option ${state.checkoutData.payment_method === 'Online Payment' ? 'selected' : ''}" onclick="selectPayment('Online Payment')">
                        <input type="radio" name="payment" ${state.checkoutData.payment_method === 'Online Payment' ? 'checked' : ''}>
                        <div class="payment-option-info">
                            <h4>Online Payment</h4>
                            <p>Pay securely with card, UPI, or net banking (simulated demo)</p>
                        </div>
                        <span style="font-size:24px">\ud83d\udcb3</span>
                    </div>
                    <div class="payment-option ${state.checkoutData.payment_method === 'Cash on Delivery' ? 'selected' : ''}" onclick="selectPayment('Cash on Delivery')">
                        <input type="radio" name="payment" ${state.checkoutData.payment_method === 'Cash on Delivery' ? 'checked' : ''}>
                        <div class="payment-option-info">
                            <h4>Cash on Delivery</h4>
                            <p>Pay in cash when your order arrives</p>
                        </div>
                        <span style="font-size:24px">\ud83d\udcb5</span>
                    </div>
                    <div class="demo-payment-notice">\u26a0 This is a demo marketplace. No real payment will be processed. For online payment, the checkout is simulated.</div>
                </div>
                <div class="checkout-nav">
                    <button class="btn btn-ghost" onclick="prevCheckoutStep()">\u2190 Back</button>
                    <button class="btn btn-primary" onclick="nextCheckoutStep()">Review Order \u2192</button>
                </div>
            </div>`;
    } else if (step === 4) {
        const subtotal = state.checkoutData.items.reduce((a, c) => a + c.price * c.quantity, 0);
        const shipping = subtotal >= 2000 ? 0 : 99;
        const total = subtotal + shipping;
        const d = state.checkoutData.delivery;
        content.innerHTML = `
            <div class="checkout-section active">
                <div class="checkout-summary-box">
                    <h3>Order Confirmation</h3>
                    <h4 style="margin-bottom:12px;">Items</h4>
                    ${state.checkoutData.items.map(item => `
                        <div class="checkout-product-row">
                            <div style="width:48px; height:48px; border-radius:8px; overflow:hidden; background:var(--cream-200)">${imgFallbackHtml(item.image, item.name, '')}</div>
                            <div style="flex:1"><div style="font-weight:500; font-size:14px">${escapeHtml(item.name)}</div><div style="font-size:12px; color:var(--gray-500)">Qty: ${item.quantity} \u00d7 ${formatPrice(item.price)}</div></div>
                            <div style="font-weight:700">${formatPrice(item.price * item.quantity)}</div>
                        </div>
                    `).join('')}
                    <div style="margin-top:16px; padding-top:12px; border-top:1px solid var(--cream-200);">
                        <div class="cart-row"><span>Subtotal</span><span>${formatPrice(subtotal)}</span></div>
                        <div class="cart-row"><span>Shipping</span><span>${shipping === 0 ? 'Free' : formatPrice(shipping)}</span></div>
                        <div class="cart-row cart-total"><span>Total</span><span>${formatPrice(total)}</span></div>
                    </div>
                    <h4 style="margin:20px 0 8px;">Delivery To</h4>
                    <p style="font-size:14px; color:var(--charcoal-600); line-height:1.6;">
                        ${escapeHtml(d.full_name || '')}<br>${escapeHtml(d.address || '')}<br>${escapeHtml(d.city || '')}, ${escapeHtml(d.state || '')} ${escapeHtml(d.postal_code || '')}<br>Phone: ${escapeHtml(d.phone || '')}
                    </p>
                    <h4 style="margin:20px 0 8px;">Payment Method</h4>
                    <p style="font-size:14px; color:var(--charcoal-600);">${escapeHtml(state.checkoutData.payment_method || '')}</p>
                </div>
                <div class="checkout-nav">
                    <button class="btn btn-ghost" onclick="prevCheckoutStep()">\u2190 Back</button>
                    <button class="btn btn-accent btn-lg" onclick="placeOrder()">Place Order</button>
                </div>
            </div>`;
    }
}

function selectPayment(method) {
    state.checkoutData.payment_method = method;
    renderCheckoutStep();
}

function nextCheckoutStep() {
    if (state.checkoutStep === 2) {
        // Validate delivery
        const d = {
            full_name: el('delName').value.trim(),
            phone: el('delPhone').value.trim(),
            address: el('delAddress').value.trim(),
            city: el('delCity').value.trim(),
            state: el('delState').value.trim(),
            postal_code: el('delPostal').value.trim()
        };
        if (!d.full_name || !d.phone || !d.address || !d.city || !d.state || !d.postal_code) {
            toast('Please fill in all delivery details.', 'warning');
            return;
        }
        state.checkoutData.delivery = d;
    }
    if (state.checkoutStep === 3 && !state.checkoutData.payment_method) {
        toast('Please select a payment method.', 'warning');
        return;
    }
    state.checkoutStep++;
    renderCheckoutStep();
}

function prevCheckoutStep() {
    state.checkoutStep--;
    renderCheckoutStep();
}

async function placeOrder() {
    const btn = event.target;
    btn.disabled = true;
    btn.textContent = 'Placing order...';

    const data = await api('/api/orders', {
        method: 'POST',
        body: {
            items: state.checkoutData.items,
            delivery_address: state.checkoutData.delivery,
            payment_method: state.checkoutData.payment_method
        }
    });

    btn.disabled = false;
    btn.textContent = 'Place Order';

    if (data.error) { toast(data.error, 'error'); return; }

    // Clear cart items that were in this order
    const orderProductIds = state.checkoutData.items.map(i => i.product_id);
    state.cart = state.cart.filter(c => !orderProductIds.includes(c.product_id));
    saveCart();

    // Show success
    el('checkoutContent').innerHTML = `
        <div style="text-align:center; padding:40px 20px;">
            <div style="font-size:64px; margin-bottom:16px;">\u2705</div>
            <h2 style="font-size:28px; margin-bottom:12px;">Order placed successfully!</h2>
            <p style="color:var(--gray-500); margin-bottom:8px;">Your order reference: <strong style="color:var(--terra-600)">${escapeHtml(data.order_ref || '')}</strong></p>
            <p style="color:var(--gray-500); margin-bottom:24px;">Total: ${formatPrice(data.total)}</p>
            <div style="display:flex; gap:12px; justify-content:center; flex-wrap:wrap;">
                <button class="btn btn-primary" onclick="navigate('dashboard', {tab:'orders'})">View My Orders</button>
                <button class="btn btn-outline" onclick="navigate('explore')">Continue Shopping</button>
            </div>
        </div>`;
    toast('Order placed successfully! \u2713', 'success', 4000);
}

// ============================================
// START SELLING / SELLER ONBOARDING
// ============================================
function startSelling() {
    if (!state.user) { navigate('register', {accountType:'seller'}); return; }
    if (state.user.account_type === 'seller') { navigate('dashboard', {tab:'products'}); return; }
    openModal(`
        <h2>Start selling on ShilpVerse 🎨</h2>
        <p style="color:var(--gray-500);margin:8px 0 20px;">Keep your existing account and turn it into a seller shop.</p>
        <div id="sellerUpgradeError"></div>
        <div class="form-group"><label>Shop Name</label><input id="upgradeShopName" required placeholder="My Creative Shop"></div>
        <div class="form-group"><label>Shop Description</label><textarea id="upgradeShopDesc" placeholder="Tell buyers what you create..."></textarea></div>
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:18px;">
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-accent" onclick="upgradeToSeller()">Start Selling</button>
        </div>`);
}
async function upgradeToSeller() {
    const shop_name = el('upgradeShopName')?.value.trim();
    const description = el('upgradeShopDesc')?.value.trim();
    if (!shop_name) { el('sellerUpgradeError').innerHTML='<div class="form-error">Please enter a shop name.</div>'; return; }
    const data = await api('/api/upgrade-seller',{method:'POST',body:{shop_name,description}});
    if (data.error) { el('sellerUpgradeError').innerHTML=`<div class="form-error">${escapeHtml(data.error)}</div>`; return; }
    closeModal(); await checkAuth(); toast('Seller account created! 🎉'); navigate('dashboard',{tab:'products'});
}

// ============================================
// DASHBOARD
// ============================================
async function renderDashboard(params = {}) {
    // Dashboard can be opened immediately after login from a file:// page or
    // another local server. Re-check the persisted auth token before redirecting.
    if (!state.user) {
        const authenticated = await checkAuth();
        if (!authenticated) { navigate('login'); return; }
    }

    const isSeller = state.user.account_type === 'seller';
    const allowedTabs = isSeller
        ? ['overview', 'products', 'orders', 'messages', 'shop', 'profile']
        : ['overview', 'orders', 'favorites', 'messages', 'profile'];
    const requestedTab = params.tab || state.dashboardTab || 'overview';
    const tab = allowedTabs.includes(requestedTab) ? requestedTab : 'overview';
    state.dashboardTab = tab;

    const buyerTabs = [
        { id: 'overview', label: 'Overview', icon: '\ud83d\udcc8' },
        { id: 'orders', label: 'Orders', icon: '\ud83d\udcc4' },
        { id: 'favorites', label: 'Favorites', icon: '\u2661' },
        { id: 'messages', label: 'Messages', icon: '\u2709' },
        { id: 'profile', label: 'Profile', icon: '\ud83d\udc64' }
    ];
    const sellerTabs = [
        { id: 'overview', label: 'Overview', icon: '\ud83d\udcc8' },
        { id: 'products', label: 'My Products', icon: '\ud83d\udce6' },
        { id: 'orders', label: 'Orders', icon: '\ud83d\udcc4' },
        { id: 'messages', label: 'Messages', icon: '\u2709' },
        { id: 'shop', label: 'Shop Settings', icon: '\ud83c\udfe1' },
        { id: 'profile', label: 'Profile', icon: '\ud83d\udc64' }
    ];
    const tabs = isSeller ? sellerTabs : buyerTabs;

    el('app').innerHTML = `
        <div class="page-container page-fade-in dashboard">
            <div class="dashboard-header">
                <h1>${isSeller ? 'Seller Dashboard' : 'Buyer Dashboard'}</h1>
                <p>Welcome back, ${escapeHtml(state.user.name)}!</p>
            </div>
            <div class="dashboard-layout">
                <aside class="dashboard-sidebar">
                    <h3>Menu</h3>
                    ${tabs.map(t => `<button class="dashboard-nav-item ${tab === t.id ? 'active' : ''}" onclick="navigate('dashboard', {tab: '${t.id}'})"><span class="dni-icon">${t.icon}</span> ${t.label}</button>`).join('')}
                </aside>
                <div class="dashboard-content" id="dashboardContent">
                    <div class="page-loader"><div class="loader-spinner"></div><p>Loading...</p></div>
                </div>
            </div>
        </div>`;

    if (isSeller) {
        await renderSellerDashboardTab(tab);
    } else {
        await renderBuyerDashboardTab(tab);
    }
}

// --- Buyer Dashboard ---
async function renderBuyerDashboardTab(tab) {
    const content = el('dashboardContent');
    if (!content) return;

    try {
        if (tab === 'overview') {
        const [ordersData, favData] = await Promise.all([api('/api/orders'), api('/api/favorites')]);
        if (ordersData.error && favData.error) {
            content.innerHTML = dashboardLoadErrorHtml(ordersData.error);
            return;
        }
        const orders = ordersData.orders || [];
        const favs = favData.products || [];
        const recentOrders = orders.slice(0, 3);

        content.innerHTML = `
            <div class="dashboard-section active">
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-icon terra">\ud83d\udcc4</div><div class="stat-card-value">${orders.length}</div><div class="stat-card-label">Total Orders</div></div>
                    <div class="stat-card"><div class="stat-card-icon gold">\u2661</div><div class="stat-card-value">${favs.length}</div><div class="stat-card-label">Saved Products</div></div>
                    <div class="stat-card"><div class="stat-card-icon green">\u2705</div><div class="stat-card-value">${orders.filter(o => o.status === 'Delivered').length}</div><div class="stat-card-label">Delivered</div></div>
                </div>
                <div class="section-header"><h3>Recent Orders</h3><a href="#" class="section-link" onclick="navigate('dashboard', {tab:'orders'}); return false;">View all \u2192</a></div>
                ${recentOrders.length > 0 ? renderOrdersTable(recentOrders) : '<p style="color:var(--gray-500)">No orders yet. <a href="#" onclick="navigate(\'explore\'); return false;" style="color:var(--terra-600)">Start exploring!</a></p>'}
                <div class="section-header" style="margin-top:32px;"><h3>Saved Products</h3><a href="#" class="section-link" onclick="navigate('dashboard', {tab:'favorites'}); return false;">View all \u2192</a></div>
                ${favs.length > 0 ? `<div class="product-grid">${favs.slice(0, 4).map(productCardHtml).join('')}</div>` : '<p style="color:var(--gray-500)">No saved products yet.</p>'}
            </div>`;
    } else if (tab === 'orders') {
        const data = await api('/api/orders');
        const orders = data.orders || [];
        content.innerHTML = `<div class="dashboard-section active"><div class="section-header"><h3>Your Orders</h3></div>${orders.length > 0 ? renderOrdersTable(orders, true) : '<div class="empty-state"><div class="empty-icon">\ud83d\udcc4</div><h3>No orders yet</h3><p>When you place orders, they\'ll appear here.</p><button class="btn btn-accent" onclick="navigate(\'explore\')">Explore Products</button></div>'}</div>`;
    } else if (tab === 'favorites') {
        const data = await api('/api/favorites');
        const products = data.products || [];
        content.innerHTML = `<div class="dashboard-section active"><div class="section-header"><h3>Your Favorites</h3></div>${products.length > 0 ? `<div class="product-grid">${products.map(productCardHtml).join('')}</div>` : '<div class="empty-state"><div class="empty-icon">\u2661</div><h3>No favorites yet</h3><p>Tap the heart on any product to save it.</p><button class="btn btn-accent" onclick="navigate(\'explore\')">Explore Products</button></div>'}</div>`;
    } else if (tab === 'messages') {
        await renderMessagesTab(content);
        } else if (tab === 'profile') {
            renderProfileTab(content);
        }
    } catch (err) {
        console.error('Buyer dashboard error:', err);
        content.innerHTML = dashboardLoadErrorHtml('We could not load your buyer dashboard. Please try again.');
    }
}

function dashboardLoadErrorHtml(message) {
    return `<div class="error-banner"><p>${escapeHtml(message)}</p><button class="btn btn-ghost btn-sm" onclick="renderDashboard({tab: state.dashboardTab})">Try again</button></div>`;
}

// --- Seller Dashboard ---
async function renderSellerDashboardTab(tab) {
    const content = el('dashboardContent');
    if (!content) return;
    try {
        // Recover seller profile if an older session/database did not include it.
        if (!state.user?.seller) {
            const me = await api('/api/me');
            if (me.user) state.user = me.user;
        }
        if (!state.user?.seller?.id) {
            content.innerHTML = dashboardLoadErrorHtml('Your seller profile could not be loaded. Please refresh and try again.');
            return;
        }

        if (tab === 'overview') {
        const [statsData, productsData] = await Promise.all([api('/api/seller/stats'), api('/api/sellers/' + (state.user.seller?.id) + '/products')]);
        const stats = statsData.error ? {} : statsData;
        const products = productsData.products || [];
        content.innerHTML = `
            <div class="dashboard-section active">
                <div class="stats-grid">
                    <div class="stat-card"><div class="stat-card-icon terra">\ud83d\udce6</div><div class="stat-card-value">${stats.total_products || 0}</div><div class="stat-card-label">Total Products</div></div>
                    <div class="stat-card"><div class="stat-card-icon gold">\ud83d\udcc4</div><div class="stat-card-value">${stats.total_orders || 0}</div><div class="stat-card-label">Total Orders</div></div>
                    <div class="stat-card"><div class="stat-card-icon green">\u20b9</div><div class="stat-card-value">${formatPrice(stats.total_revenue || 0)}</div><div class="stat-card-label">Revenue</div></div>
                    <div class="stat-card"><div class="stat-card-icon blue">\ud83d\udc65</div><div class="stat-card-value">${stats.customers || 0}</div><div class="stat-card-label">Customers</div></div>
                </div>
                <div class="section-header"><h3>Recent Orders</h3></div>
                ${stats.recent_orders && stats.recent_orders.length > 0 ? `
                    <table class="dashboard-table">
                        <thead><tr><th>Order</th><th>Buyer</th><th>Amount</th><th>Status</th><th>Date</th></tr></thead>
                        <tbody>${stats.recent_orders.map(o => `<tr><td>#${o.id}</td><td>${escapeHtml(o.buyer_name)}</td><td>${formatPrice(o.total)}</td><td><span class="status-badge ${o.status.toLowerCase().replace(/\s/g,'')}">${escapeHtml(o.status)}</span></td><td>${formatDate(o.created_at)}</td></tr>`).join('')}</tbody>
                    </table>
                ` : '<p style="color:var(--gray-500)">No orders yet.</p>'}
                <div class="section-header" style="margin-top:32px;"><h3>Quick Actions</h3></div>
                <div style="display:flex; gap:12px; flex-wrap:wrap;">
                    <button class="btn btn-accent" onclick="navigate('dashboard', {tab:'products'}); setTimeout(showAddProductForm, 150)">\ud83d\udce6 Publish an Artwork</button>
                    <button class="btn btn-outline" onclick="navigate('dashboard', {tab:'orders'})">View Orders</button>
                    <button class="btn btn-outline" onclick="navigate('dashboard', {tab:'shop'})">Shop Settings</button>
                </div>
            </div>`;
    } else if (tab === 'products') {
        const sid = state.user.seller?.id;
        const data = await api(`/api/sellers/${sid}/products`);
        const products = data.products || [];
        content.innerHTML = `
            <div class="dashboard-section active">
                <div class="section-header">
                    <div>
                        <h3>My Products</h3>
                        <p style="margin:4px 0 0;color:var(--gray-500);font-size:13px;">Published products appear automatically in the ShilpVerse marketplace.</p>
                    </div>
                    <button class="btn btn-accent" onclick="showAddProductForm()">+ Publish to Marketplace</button>
                </div>
                <div id="productFormContainer"></div>
                ${products.length > 0 ? `
                    <table class="dashboard-table">
                        <thead><tr><th>Product</th><th>Price</th><th>Stock</th><th>Category</th><th>Listing</th><th>Actions</th></tr></thead>
                        <tbody>
                            ${products.map(p => `
                                <tr>
                                    <td><div class="table-product">${imgFallbackHtml(p.image, p.name, '')}<div class="table-product-name">${escapeHtml(p.name)}</div></div></td>
                                    <td>${formatPrice(p.price)}</td>
                                    <td>${p.stock}</td>
                                    <td>${escapeHtml(p.category)}</td>
                                    <td><span class="status-badge in-stock">Published</span></td>
                                    <td>
                                        <button class="btn btn-ghost btn-sm" onclick="showEditProductForm(${p.id})">Edit</button>
                                        <button class="btn btn-ghost btn-sm" onclick="navigate('product', {id: ${p.id}})">View</button>
                                        <button class="btn btn-ghost btn-sm" style="color:var(--error)" onclick="deleteProduct(${p.id}, '${escapeHtml(p.name)}')">Delete</button>
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                ` : '<div class="empty-state"><div class="empty-icon">\ud83d\udce6</div><h3>No products yet</h3><p>Add your first product to start selling!</p><button class="btn btn-accent" onclick="showAddProductForm()">+ Publish to Marketplace</button></div>'}
            </div>`;
    } else if (tab === 'orders') {
        const data = await api('/api/orders');
        const orders = data.orders || [];
        content.innerHTML = `<div class="dashboard-section active">
            <div class="section-header"><h3>Incoming Orders</h3></div>
            ${orders.length > 0 ? orders.map(o => renderSellerOrderCard(o)).join('') : '<div class="empty-state"><div class="empty-icon">\ud83d\udcc4</div><h3>No orders yet</h3><p>When buyers order your products, they\'ll appear here.</p></div>'}
        </div>`;
    } else if (tab === 'messages') {
        await renderMessagesTab(content);
    } else if (tab === 'shop') {
        renderShopSettingsTab(content);
        } else if (tab === 'profile') {
            renderProfileTab(content);
        }
    } catch (err) {
        console.error('Seller dashboard error:', err);
        content.innerHTML = dashboardLoadErrorHtml('We could not load your seller dashboard. Please try again.');
    }
}

function renderOrdersTable(orders, withTracking = false) {
    return `
        <table class="dashboard-table">
            <thead><tr><th>Order</th><th>Product</th><th>Seller</th><th>Total</th><th>Payment</th><th>Status</th><th>Date</th>${withTracking ? '<th>Track</th>' : ''}</tr></thead>
            <tbody>
                ${orders.map(o => `
                    <tr>
                        <td>#${o.id}</td>
                        <td>${o.items.map(i => escapeHtml(i.product_name)).join(', ')}</td>
                        <td>${escapeHtml(o.seller?.shop_name || '')}</td>
                        <td>${formatPrice(o.total)}</td>
                        <td>${escapeHtml(o.payment_method)}</td>
                        <td><span class="status-badge ${o.status.toLowerCase().replace(/\s/g, '')}">${escapeHtml(o.status)}</span></td>
                        <td>${formatDate(o.created_at)}</td>
                        ${withTracking ? `<td><button class="btn btn-ghost btn-sm" onclick="showOrderTracking(${o.id})">Track</button></td>` : ''}
                    </tr>
                `).join('')}
            </tbody>
        </table>`;
}

function renderSellerOrderCard(o) {
    const statuses = ['Order Placed', 'Confirmed', 'Preparing', 'Shipped', 'Delivered'];
    const currentIdx = statuses.indexOf(o.status);
    return `
        <div style="background:var(--white); border:1px solid var(--cream-200); border-radius:16px; padding:20px; margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:start; flex-wrap:wrap; gap:12px; margin-bottom:12px;">
                <div>
                    <strong>Order #${o.id}</strong>
                    <div style="font-size:13px; color:var(--gray-500)">Buyer: ${escapeHtml(o.buyer?.name || '')} \u00b7 ${formatDate(o.created_at)}</div>
                </div>
                <div style="text-align:right;">
                    <div style="font-weight:700; font-size:18px;">${formatPrice(o.total)}</div>
                    <div style="font-size:12px; color:var(--gray-500)">${escapeHtml(o.payment_method)}</div>
                </div>
            </div>
            <div style="margin-bottom:12px;">
                ${o.items.map(i => `<div style="display:flex; align-items:center; gap:8px; padding:4px 0; font-size:14px;">${imgFallbackHtml(i.product_image, i.product_name, '')?.replace('class=""', 'style="width:32px;height:32px;border-radius:4px;object-fit:cover"')}<span>${escapeHtml(i.product_name)} \u00d7 ${i.quantity}</span></div>`).join('')}
            </div>
            <div style="font-size:13px; color:var(--gray-500); margin-bottom:12px;">Deliver to: ${escapeHtml(o.delivery_address || '')}</div>
            <div style="display:flex; gap:8px; flex-wrap:wrap;">
                <span style="font-size:13px; font-weight:600; color:var(--charcoal-600); margin-right:8px; line-height:32px;">Update status:</span>
                ${statuses.map((s, i) => `<button class="btn ${i === currentIdx ? 'btn-primary' : 'btn-outline'} btn-sm" onclick="updateOrderStatus(${o.id}, '${s}')">${s}</button>`).join('')}
            </div>
        </div>`;
}

async function updateOrderStatus(orderId, status) {
    const data = await api(`/api/orders/${orderId}/status`, { method: 'PUT', body: { status } });
    if (data.error) { toast(data.error, 'error'); return; }
    toast(`Order status updated to: ${status}`);
    renderSellerDashboardTab('orders');
}

function showOrderTracking(orderId) {
    const orders = state.dashboardOrders || [];
    // Fetch orders if not cached
    api('/api/orders').then(data => {
        const order = (data.orders || []).find(o => o.id === orderId);
        if (!order) { toast('Order not found.', 'error'); return; }
        const statuses = ['Order Placed', 'Confirmed', 'Preparing', 'Shipped', 'Delivered'];
        const currentIdx = statuses.indexOf(order.status);
        openModal(`
            <h2>Track Order #${order.id}</h2>
            <p style="color:var(--gray-500); margin-bottom:20px;">Placed on ${formatDate(order.created_at)}</p>
            <div class="order-timeline">
                ${statuses.map((s, i) => `
                    <div class="timeline-step ${i < currentIdx ? 'done' : ''} ${i === currentIdx ? 'active' : ''}">
                        <div class="timeline-dot">${i < currentIdx ? '\u2713' : i + 1}</div>
                        <div class="timeline-label">${s}</div>
                    </div>
                `).join('')}
            </div>
            <div style="margin-top:24px;">
                <h4>Items</h4>
                ${order.items.map(i => `<div style="display:flex; align-items:center; gap:12px; padding:8px 0;"><span>${escapeHtml(i.product_name)} \u00d7 ${i.quantity}</span><span style="margin-left:auto; font-weight:600">${formatPrice(i.price * i.quantity)}</span></div>`).join('')}
            </div>
            <div style="margin-top:16px; padding-top:16px; border-top:1px solid var(--cream-200);">
                <div class="cart-row cart-total"><span>Total</span><span>${formatPrice(order.total)}</span></div>
                <p style="margin-top:12px; font-size:14px; color:var(--gray-500)"><strong>Delivery address:</strong> ${escapeHtml(order.delivery_address || '')}</p>
                <p style="margin-top:4px; font-size:14px; color:var(--gray-500)"><strong>Payment:</strong> ${escapeHtml(order.payment_method)}</p>
            </div>
        `);
    });
}

// --- Add/Edit Product ---
function showAddProductForm() {
    const container = el('productFormContainer');
    container.innerHTML = `
        <div class="checkout-summary-box" style="margin-bottom:20px;">
            <h3>Publish to ShilpVerse Marketplace</h3>
            <div id="productFormError"></div>
            <p style="color:var(--gray-500);margin:0 0 18px;font-size:13px;">Add the artwork photo, title, price, stock, category and delivery details. Publishing makes the listing visible in Explore immediately.</p>
            <form onsubmit="handleAddProduct(event)">
                <div class="form-group"><label>Product Name</label><input type="text" id="pName" required placeholder="Product name"></div>
                <div class="form-group"><label>Description</label><textarea id="pDesc" required placeholder="Describe your product..."></textarea></div>
                <div class="form-row">
                    <div class="form-group"><label>Price (\u20b9)</label><input type="number" id="pPrice" required min="0" step="1" placeholder="999"></div>
                    <div class="form-group"><label>Stock</label><input type="number" id="pStock" required min="0" placeholder="10"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Category</label><select id="pCategory">${CATEGORIES.map(c => `<option value="${c}">${c}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Image URL</label><input type="url" id="pImage" placeholder="https://..."></div>
                </div>
                <div class="form-group"><label>Or upload product photo</label><input type="file" id="pImageFile" accept="image/*" onchange="previewProductImage(this)"><small style="display:block;margin-top:6px;color:var(--gray-500)">Your photo can be used directly; no separate assets folder is required.</small><div id="pImagePreview" style="margin-top:10px"></div></div>
                <div class="form-group"><label>Tags (comma-separated)</label><input type="text" id="pTags" placeholder="handmade, gift, art"></div>
                <div class="form-group"><label>Materials</label><input type="text" id="pMaterials" placeholder="Wood, paint, fabric"></div>
                <div class="form-group"><label>Shipping Information</label><input type="text" id="pShipping" placeholder="Ships in 2-3 days"></div>
                <div style="display:flex; gap:12px; margin-top:16px;">
                    <button type="submit" class="btn btn-accent">Publish to Marketplace</button>
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('productFormContainer').innerHTML=''">Cancel</button>
                </div>
            </form>
        </div>`;
    container.scrollIntoView({ behavior: 'smooth' });
}

function previewProductImage(input) {
    const file = input?.files?.[0];
    const preview = el('pImagePreview');
    if (!file || !preview) return;
    if (file.size > 2 * 1024 * 1024) {
        preview.innerHTML = '<div class="form-error">Please choose an image under 2 MB.</div>';
        input.value = '';
        return;
    }
    const reader = new FileReader();
    reader.onload = () => {
        preview.innerHTML = `<img src="${reader.result}" alt="Product preview" style="width:90px;height:90px;object-fit:cover;border-radius:12px;border:1px solid var(--cream-300)">`;
        input.dataset.imageData = reader.result;
    };
    reader.readAsDataURL(file);
}

async function handleAddProduct(e) {
    e.preventDefault();
    const body = {
        name: el('pName').value.trim(),
        description: el('pDesc').value.trim(),
        price: el('pPrice').value,
        stock: el('pStock').value,
        category: el('pCategory').value,
        image: el('pImageFile')?.dataset.imageData || el('pImage').value.trim(),
        tags: el('pTags').value.trim(),
        materials: el('pMaterials').value.trim(),
        shipping_information: el('pShipping').value.trim()
    };
    const data = await api('/api/products', { method: 'POST', body });
    if (data.error) { el('productFormError').innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`; return; }
    toast('Product published successfully! \u2713');
    renderSellerDashboardTab('products');
}

async function showEditProductForm(pid) {
    const data = await api(`/api/products/${pid}`);
    if (data.error || !data.product) { toast(data.error || 'Product not found.', 'error'); return; }
    const p = data.product;
    const container = el('productFormContainer');
    container.innerHTML = `
        <div class="checkout-summary-box" style="margin-bottom:20px;">
            <h3>Edit Product</h3>
            <div id="productFormError"></div>
            <form onsubmit="handleEditProduct(event, ${pid})">
                <div class="form-group"><label>Product Name</label><input type="text" id="pName" required value="${escapeHtml(p.name)}"></div>
                <div class="form-group"><label>Description</label><textarea id="pDesc" required>${escapeHtml(p.description || '')}</textarea></div>
                <div class="form-row">
                    <div class="form-group"><label>Price (\u20b9)</label><input type="number" id="pPrice" required min="0" step="1" value="${p.price}"></div>
                    <div class="form-group"><label>Stock</label><input type="number" id="pStock" required min="0" value="${p.stock}"></div>
                </div>
                <div class="form-row">
                    <div class="form-group"><label>Category</label><select id="pCategory">${CATEGORIES.map(c => `<option value="${c}" ${p.category === c ? 'selected' : ''}>${c}</option>`).join('')}</select></div>
                    <div class="form-group"><label>Image URL</label><input type="url" id="pImage" value="${escapeHtml(p.image || '')}"></div>
                </div>
                <div class="form-group"><label>Replace with product photo</label><input type="file" id="pImageFile" accept="image/*" onchange="previewProductImage(this)"><div id="pImagePreview" style="margin-top:10px"></div></div>
                <div class="form-group"><label>Tags (comma-separated)</label><input type="text" id="pTags" value="${escapeHtml(p.tags || '')}"></div>
                <div class="form-group"><label>Materials</label><input type="text" id="pMaterials" value="${escapeHtml(p.materials || '')}"></div>
                <div class="form-group"><label>Shipping Information</label><input type="text" id="pShipping" value="${escapeHtml(p.shipping_information || '')}"></div>
                <div style="display:flex; gap:12px; margin-top:16px;">
                    <button type="submit" class="btn btn-accent">Save Changes</button>
                    <button type="button" class="btn btn-ghost" onclick="document.getElementById('productFormContainer').innerHTML=''">Cancel</button>
                </div>
            </form>
        </div>`;
    container.scrollIntoView({ behavior: 'smooth' });
}

async function handleEditProduct(e, pid) {
    e.preventDefault();
    const body = {
        name: el('pName').value.trim(),
        description: el('pDesc').value.trim(),
        price: el('pPrice').value,
        stock: el('pStock').value,
        category: el('pCategory').value,
        image: el('pImageFile')?.dataset.imageData || el('pImage').value.trim(),
        tags: el('pTags').value.trim(),
        materials: el('pMaterials').value.trim(),
        shipping_information: el('pShipping').value.trim()
    };
    const data = await api(`/api/products/${pid}`, { method: 'PUT', body });
    if (data.error) { el('productFormError').innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`; return; }
    toast('Product updated successfully! \u2713');
    renderSellerDashboardTab('products');
}

async function deleteProduct(pid, name) {
    openModal(`
        <h2>Delete Product?</h2>
        <p style="margin:16px 0;">Are you sure you want to delete "<strong>${escapeHtml(name)}</strong>"? This cannot be undone.</p>
        <div style="display:flex; gap:12px; justify-content:flex-end;">
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-danger" onclick="confirmDeleteProduct(${pid})">Delete</button>
        </div>
    `);
}

async function confirmDeleteProduct(pid) {
    const data = await api(`/api/products/${pid}`, { method: 'DELETE' });
    if (data.error) { toast(data.error, 'error'); return; }
    closeModal();
    toast('Product deleted.');
    renderSellerDashboardTab('products');
}

// --- Shop Settings ---
function renderShopSettingsTab(content) {
    const s = state.user.seller;
    content.innerHTML = `
        <div class="dashboard-section active">
            <div class="section-header"><h3>Shop Settings</h3></div>
            <div class="checkout-summary-box" style="max-width:500px;">
                <div id="shopFormError"></div>
                <div class="form-group"><label>Shop Name</label><input type="text" id="shopName" value="${escapeHtml(s?.shop_name || '')}"></div>
                <div class="form-group"><label>Shop Description</label><textarea id="shopDesc">${escapeHtml(s?.description || '')}</textarea></div>
                <div class="form-group"><label>Banner Image URL</label><input type="url" id="shopBanner" value="${escapeHtml(s?.banner || '')}"></div>
                <button class="btn btn-primary" onclick="saveShopSettings()">Save Settings</button>
            </div>
        </div>`;
}

async function saveShopSettings() {
    const body = {
        shop_name: el('shopName').value.trim(),
        description: el('shopDesc').value.trim(),
        banner: el('shopBanner').value.trim()
    };
    const data = await api('/api/shop', { method: 'PUT', body });
    if (data.error) { el('shopFormError').innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`; return; }
    toast('Shop settings updated!');
    await checkAuth();
    renderShopSettingsTab(el('dashboardContent'));
}

// --- Profile Tab ---
function renderProfileTab(content) {
    const u = state.user;
    content.innerHTML = `
        <div class="dashboard-section active">
            <div class="section-header"><h3>Edit Profile</h3></div>
            <div class="profile-editor-grid">
                <div class="checkout-summary-box profile-card-main">
                    <div class="profile-editor-avatar">${avatarHtml(u.profile_image, u.name, 'profile-large-avatar')}</div>
                    <div id="profileFormError"></div>
                    <div class="form-group"><label>Profile Photo</label><input type="file" id="profImageFile" accept="image/*" onchange="previewProfileImage(this)"><input type="hidden" id="profImage" value="${escapeHtml(u.profile_image || '')}"><div id="profImagePreview" style="margin-top:10px"></div></div>
                    <div class="form-row"><div class="form-group"><label>Full Name</label><input type="text" id="profName" value="${escapeHtml(u.name)}"></div><div class="form-group"><label>Username</label><input type="text" id="profUsername" value="${escapeHtml(u.username)}"></div></div>
                    <div class="form-group"><label>Email</label><input type="email" id="profEmail" value="${escapeHtml(u.email)}"></div>
                    <div class="form-row"><div class="form-group"><label>Phone</label><input type="tel" id="profPhone" value="${escapeHtml(u.phone || '')}" placeholder="Optional"></div><div class="form-group"><label>Location</label><input type="text" id="profLocation" value="${escapeHtml(u.location || '')}" placeholder="City, India"></div></div>
                    <div class="form-group"><label>Bio</label><textarea id="profBio" maxlength="300" placeholder="Tell people a little about yourself...">${escapeHtml(u.bio || '')}</textarea></div>
                    <button class="btn btn-primary" onclick="saveProfile()">Save Profile</button>
                </div>
                <div class="checkout-summary-box">
                    <h3>Account Overview</h3>
                    <p style="color:var(--gray-500);margin:8px 0 18px;">${u.account_type === 'seller' ? 'Seller account' : 'Buyer account'}</p>
                    <div class="profile-info-row"><span>Member since</span><strong>${formatDate(u.created_at)}</strong></div>
                    <div class="profile-info-row"><span>Account type</span><strong>${u.account_type === 'seller' ? 'Seller' : 'Buyer'}</strong></div>
                    ${u.account_type === 'seller' ? `<div class="profile-info-row"><span>Shop</span><strong>${escapeHtml(u.seller?.shop_name || 'My Shop')}</strong></div>` : '<button class="btn btn-outline btn-full" onclick="startSelling()">Start Selling</button>'}
                </div>
            </div>
            <div class="section-header" style="margin-top:32px;"><h3>Change Password</h3></div>
            <div class="checkout-summary-box" style="max-width:650px;">
                <div id="passwordFormError"></div>
                <div class="form-row"><div class="form-group"><label>Current Password</label><input type="password" id="curPwd" placeholder="Current password"></div><div class="form-group"><label>New Password</label><input type="password" id="newPwd" placeholder="New password"></div></div>
                <div class="form-group"><label>Confirm New Password</label><input type="password" id="confPwd" placeholder="Re-enter new password"></div>
                <button class="btn btn-primary" onclick="changePassword()">Change Password</button>
            </div>
        </div>`;
}
function previewProfileImage(input) {
    const file=input?.files?.[0]; if(!file) return;
    if(file.size>2*1024*1024){ toast('Please choose an image under 2 MB.','error'); input.value=''; return; }
    const reader=new FileReader(); reader.onload=()=>{ el('profImage').value=reader.result; el('profImagePreview').innerHTML=`<img src="${reader.result}" style="width:90px;height:90px;border-radius:50%;object-fit:cover;border:2px solid var(--terra-300)">`; }; reader.readAsDataURL(file);
}
async function saveProfile() {
    const body={name:el('profName').value.trim(),username:el('profUsername').value.trim(),email:el('profEmail').value.trim().toLowerCase(),profile_image:el('profImage').value.trim(),phone:el('profPhone').value.trim(),bio:el('profBio').value.trim(),location:el('profLocation').value.trim()};
    const data=await api('/api/profile',{method:'PUT',body});
    if(data.error){el('profileFormError').innerHTML=`<div class="form-error">${escapeHtml(data.error)}</div>`;return;}
    toast('Profile updated successfully! ✓'); await checkAuth(); renderProfileTab(el('dashboardContent'));
}

async function changePassword() {
    const body = {
        current_password: el('curPwd').value,
        new_password: el('newPwd').value,
        confirm_password: el('confPwd').value
    };
    const data = await api('/api/change-password', { method: 'POST', body });
    if (data.error) { el('passwordFormError').innerHTML = `<div class="form-error">${escapeHtml(data.error)}</div>`; return; }
    toast('Password changed successfully!');
    el('curPwd').value = ''; el('newPwd').value = ''; el('confPwd').value = '';
}

// ============================================
// MESSAGING
// ============================================
async function renderMessagesPage() {
    if (!state.user) { navigate('login'); return; }
    el('app').innerHTML = `<div class="page-container page-fade-in" style="padding-top:40px;"><div class="section-header"><h2>Messages</h2></div><div id="messagesContainer" style="height:600px;"><div class="page-loader"><div class="loader-spinner"></div><p>Loading messages...</p></div></div></div>`;
    await renderMessagesTab(el('messagesContainer'));
}

async function renderMessagesTab(container) {
    const data = await api('/api/messages');
    if (data.error) { container.innerHTML = `<div class="error-banner"><p>${escapeHtml(data.error)}</p></div>`; return; }
    state.conversations = data.conversations || [];

    if (state.conversations.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">\u2709</div><h3>No messages yet</h3><p>Start a conversation from any product page by clicking "Contact Seller".</p><button class="btn btn-accent" onclick="navigate(\'explore\')">Explore Products</button></div>';
        return;
    }

    container.innerHTML = `
        <div class="messages-layout">
            <div class="convo-list">
                <div class="convo-list-header">Conversations</div>
                <div id="convoList">
                    ${state.conversations.map((c, i) => `
                        <div class="convo-item ${i === 0 ? 'active' : ''}" onclick="selectConversation(${i})">
                            ${avatarHtml(c.other_user?.profile_image, c.other_user?.name, 'convo-item-avatar')}
                            <div class="convo-item-info">
                                <div class="convo-item-name">${escapeHtml(c.other_user?.name || '')}</div>
                                <div class="convo-item-preview">${escapeHtml(c.messages[c.messages.length - 1]?.message || '')}</div>
                                ${c.product ? `<div style="font-size:11px; color:var(--terra-600); margin-top:2px;">on ${escapeHtml(c.product.name)}</div>` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
            <div class="chat-panel" id="chatPanel">
                <div class="chat-empty">Select a conversation to start chatting</div>
            </div>
        </div>`;

    if (state.conversations.length > 0) {
        selectConversation(0);
    }
}

function selectConversation(idx) {
    state.currentConversation = idx;
    document.querySelectorAll('.convo-item').forEach((el, i) => el.classList.toggle('active', i === idx));
    const convo = state.conversations[idx];
    if (!convo) return;
    const panel = el('chatPanel');
    panel.innerHTML = `
        <div class="chat-header">
            ${avatarHtml(convo.other_user?.profile_image, convo.other_user?.name, 'convo-item-avatar')}
            <div>
                <div style="font-weight:600">${escapeHtml(convo.other_user?.name || '')}</div>
                ${convo.product ? `<div style="font-size:12px; color:var(--gray-500)">Re: ${escapeHtml(convo.product.name)}</div>` : ''}
            </div>
        </div>
        <div class="chat-messages" id="chatMessages">
            ${convo.messages.map(m => `
                <div class="chat-bubble ${m.sender_id === state.user.id ? 'sent' : 'received'}">
                    ${escapeHtml(m.message)}
                    <div class="chat-bubble-time">${formatTime(m.created_at)}</div>
                </div>
            `).join('')}
        </div>
        <div class="chat-input-area">
            <input type="text" id="chatInput" placeholder="Type a message..." onkeypress="if(event.key==='Enter')sendChatMessage()">
            <button onclick="sendChatMessage()">Send</button>
        </div>`;
    el('chatMessages').scrollTop = el('chatMessages').scrollHeight;
}

async function sendChatMessage() {
    const input = el('chatInput');
    const msg = input.value.trim();
    if (!msg || state.currentConversation === null) return;
    const convo = state.conversations[state.currentConversation];
    input.value = '';

    // Optimistically add message
    el('chatMessages').innerHTML += `<div class="chat-bubble sent">${escapeHtml(msg)}<div class="chat-bubble-time">Just now</div></div>`;
    el('chatMessages').scrollTop = el('chatMessages').scrollHeight;

    const data = await api('/api/messages', {
        method: 'POST',
        body: { receiver_id: convo.other_user.id, product_id: convo.product?.id, message: msg }
    });
    if (data.error) { toast(data.error, 'error'); return; }
    toast('Message sent \u2713');
}

async function contactSeller(sellerId, productId) {
    if (!state.user) { toast('Please login to message sellers.', 'info'); navigate('login'); return; }
    if (state.user.account_type === 'seller' && !productId) { toast('Sellers can\'t message other sellers directly.', 'info'); return; }

    // Find the user_id of the seller
    const sdata = await api(`/api/sellers/${sellerId}`);
    if (sdata.error || !sdata.seller) { toast('Seller not found.', 'error'); return; }
    const receiverId = sdata.seller.user_id;

    openModal(`
        <h2>Contact Seller</h2>
        <p style="color:var(--gray-500); margin-bottom:16px;">Send a message to ${escapeHtml(sdata.seller.shop_name)}</p>
        <div class="form-group">
            <label>Your Message</label>
            <textarea id="contactMsg" style="min-height:100px;" placeholder="Hi, I am interested in this product...">${productId && state.currentProduct ? `Hi, I am interested in "${state.currentProduct.name}". ` : ''}</textarea>
        </div>
        <div style="display:flex; gap:12px; justify-content:flex-end;">
            <button class="btn btn-ghost" onclick="closeModal()">Cancel</button>
            <button class="btn btn-primary" onclick="sendContactMessage(${receiverId}, ${productId || 'null'})">Send Message</button>
        </div>
    `);
}

async function sendContactMessage(receiverId, productId) {
    const msg = el('contactMsg').value.trim();
    if (!msg) { toast('Please enter a message.', 'warning'); return; }
    const data = await api('/api/messages', {
        method: 'POST',
        body: { receiver_id: receiverId, product_id: productId, message: msg }
    });
    if (data.error) { toast(data.error, 'error'); return; }
    closeModal();
    toast('Message sent \u2713');
}

// ============================================
// SETTINGS PAGE
// ============================================
function renderSettings() {
    if (!state.user) { navigate('login'); return; }
    el('app').innerHTML = `
        <div class="page-container page-fade-in" style="padding-top:40px; max-width:600px;">
            <div class="section-header"><h2>Settings</h2></div>
            <div class="checkout-summary-box" style="margin-bottom:20px;">
                <h3>Account</h3>
                <p style="color:var(--gray-500); margin-bottom:16px;">Manage your account information</p>
                <button class="btn btn-outline" onclick="navigate('dashboard', {tab:'profile'})">Edit Profile</button>
            </div>
            <div class="checkout-summary-box" style="margin-bottom:20px;">
                <h3>Security</h3>
                <p style="color:var(--gray-500); margin-bottom:16px;">Change your password</p>
                <button class="btn btn-outline" onclick="navigate('dashboard', {tab:'profile'})">Change Password</button>
            </div>
            <div class="checkout-summary-box" style="margin-bottom:20px;">
                <h3>Notifications</h3>
                <p style="color:var(--gray-500); margin-bottom:12px;">Notification preferences (demo)</p>
                <label class="form-check" style="display:block; margin-bottom:8px;"><input type="checkbox" checked> Order updates</label>
                <label class="form-check" style="display:block; margin-bottom:8px;"><input type="checkbox" checked> Message notifications</label>
                <label class="form-check" style="display:block;"><input type="checkbox"> Promotional emails</label>
            </div>
            <div class="checkout-summary-box" style="margin-bottom:20px;">
                <h3>Appearance</h3>
                <p style="color:var(--gray-500); margin-bottom:12px;">Theme preference (demo)</p>
                <div class="theme-switch-row"><span>Use dark theme</span><button class="theme-toggle-switch ${document.body.classList.contains('dark-theme') ? 'on' : ''}" onclick="toggleTheme()"><span></span></button></div>
            </div>
            <div class="checkout-summary-box">
                <h3 style="color:var(--error)">Danger Zone</h3>
                <button class="btn btn-danger" onclick="logout()">Logout</button>
            </div>
        </div>`;
}

// ============================================
// QUICK VIEW MODAL
// ============================================
async function quickView(productId) {
    const data = await api(`/api/products/${productId}`);
    if (data.error || !data.product) { toast(data.error || 'Product not found.', 'error'); return; }
    const p = data.product;
    openModal(`
        <div class="quick-view-content">
            <div class="quick-view-image">${imgFallbackHtml(p.image, p.name, '')}</div>
            <div class="quick-view-info">
                <h2>${escapeHtml(p.name)}</h2>
                <div style="margin-bottom:8px;">${starHtml(p.rating)} <span style="font-size:13px; color:var(--gray-500)">${p.rating > 0 ? p.rating.toFixed(1) : 'No reviews'}</span></div>
                <div class="qv-price">${formatPrice(p.price)}</div>
                <p style="color:var(--gray-500); margin-bottom:16px; font-size:14px;">${escapeHtml(p.description || '').substring(0, 150)}...</p>
                <div style="margin-bottom:12px; font-size:14px;">by <strong>${escapeHtml(p.seller?.shop_name || '')}</strong></div>
                ${p.stock > 0 ? '<span class="status-badge in-stock">In stock</span>' : '<span class="status-badge out-stock">Out of stock</span>'}
                <div style="display:flex; gap:8px; margin-top:20px; flex-wrap:wrap;">
                    <button class="btn btn-accent" onclick="closeModal(); navigate('product', {id: ${p.id}})">View Details</button>
                    <button class="btn btn-outline" onclick="closeModal(); addToCart(${p.id})">Add to Cart</button>
                </div>
            </div>
        </div>
    `);
}

// ============================================
// MODAL
// ============================================
function openModal(html) {
    el('modalBody').innerHTML = html;
    el('modalOverlay').classList.add('open');
    el('modalOverlay').setAttribute('aria-hidden', 'false');
}
function closeModal() {
    el('modalOverlay').classList.remove('open');
    el('modalOverlay').setAttribute('aria-hidden', 'true');
}
el('modalOverlay')?.addEventListener('click', (e) => {
    if (e.target === el('modalOverlay')) closeModal();
});

// ============================================
// FOOTER MODALS
// ============================================
function showFAQ() {
    openModal(`
        <h2>Frequently Asked Questions</h2>
        <div style="margin-top:16px;">
            <h4 style="margin-bottom:8px;">How do I create an account?</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">Click "Create Account" and choose whether you want to be a buyer or seller. Fill in your details and you're ready to go.</p>
            <h4 style="margin-bottom:8px;">How does shipping work?</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">Each seller sets their own shipping timeline. You'll see shipping info on every product page. Free shipping is available on orders over \u20b92000.</p>
            <h4 style="margin-bottom:8px;">Can I track my order?</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">Yes! Go to your dashboard and click on Orders, then click "Track" on any order to see its progress.</p>
            <h4 style="margin-bottom:8px;">How do I contact a seller?</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">On any product page, click "Contact Seller" to start a conversation about that product.</p>
            <h4 style="margin-bottom:8px;">Is this a real marketplace?</h4>
            <p style="color:var(--gray-500);">ShilpVerse is a demo marketplace. No real payments are processed. It's designed to showcase a full marketplace experience.</p>
        </div>
    `);
}

function showPaymentInfo() {
    openModal(`
        <h2>Payment Information</h2>
        <div style="margin-top:16px;">
            <h4 style="margin-bottom:8px;">Online Payment (Demo)</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">Our online payment option is a simulated demo flow. No real payment is processed. Your order is confirmed immediately after placing it.</p>
            <h4 style="margin-bottom:8px;">Cash on Delivery</h4>
            <p style="color:var(--gray-500); margin-bottom:16px;">Pay in cash when your order arrives at your doorstep. Your order starts as "Order Placed" and the seller will confirm it.</p>
            <div class="demo-payment-notice" style="margin-top:16px;">\u26a0 This is a demo marketplace. No real money is processed or exchanged.</div>
        </div>
    `);
}

function showShippingInfo() {
    openModal(`
        <h2>Shipping Information</h2>
        <div style="margin-top:16px;">
            <p style="color:var(--gray-500); margin-bottom:16px;">Each seller on ShilpVerse manages their own shipping. You'll find specific shipping details on every product page.</p>
            <h4 style="margin-bottom:8px;">General Guidelines</h4>
            <ul style="color:var(--gray-500); margin-left:20px; line-height:2;">
                <li>Most products ship within 2-5 business days</li>
                <li>Custom creations may take 7-10 days</li>
                <li>Free shipping on orders over \u20b92000</li>
                <li>Standard shipping fee: \u20b999</li>
                <li>Fragile items come with protective packaging</li>
            </ul>
        </div>
    `);
}

function showContactInfo() {
    openModal(`
        <h2>Contact Us</h2>
        <div style="margin-top:16px;">
            <p style="color:var(--gray-500); margin-bottom:16px;">We'd love to hear from you! ShilpVerse is a demo marketplace built to showcase a creative shopping experience.</p>
            <div style="background:var(--cream-100); border-radius:12px; padding:16px; margin-bottom:16px;">
                <p style="margin-bottom:8px;"><strong>Email:</strong> hello@shilpverse.demo</p>
                <p style="margin-bottom:8px;"><strong>Support:</strong> support@shilpverse.demo</p>
                <p><strong>Hours:</strong> Mon-Fri, 9 AM - 6 PM IST</p>
            </div>
            <p style="color:var(--gray-500); font-size:13px;">Note: This is a demo project. These contact details are for illustration only.</p>
        </div>
    `);
}

// ============================================
// NAV SCROLL & MOBILE MENU
// ============================================
window.addEventListener('scroll', () => {
    const nav = el('navbar');
    if (window.scrollY > 10) nav.classList.add('scrolled');
    else nav.classList.remove('scrolled');
});

el('navToggle')?.addEventListener('click', () => {
    const menu = el('navMenu');
    menu.classList.toggle('open');
    const toggle = el('navToggle');
    toggle.setAttribute('aria-expanded', menu.classList.contains('open'));
});

// Close mobile menu on navigation
document.addEventListener('click', (e) => {
    if (e.target.closest('.nav-link') || e.target.closest('.nav-btn')) {
        el('navMenu')?.classList.remove('open');
    }
});

// Escape key closes overlays
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        closeModal();
        closeCart();
        closeAccountDropdown();
    }
});

// ============================================
// INIT
// ============================================
async function init() {
    applyTheme();
    // Show the app shell immediately
    el('app').innerHTML = '<div class="page-loader"><div class="loader-spinner"></div><p>Loading ShilpVerse...</p></div>';

    // Check auth state
    await checkAuth();

    // Navigate to home
    navigate('home');
}

// Start the app
init();
