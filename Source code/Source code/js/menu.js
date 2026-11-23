// CUSTOMER MENU SCRIPT

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { database as db } from "./firebase-config.js";

const activeDb = db;

// DOM element references
const menuGrid = document.querySelector(".menu-grid");
const categorySelect = document.getElementById("categorySelect");

// Overlay element references
const overlay = document.getElementById("productOverlay");
const overlayName = document.getElementById("overlayName");
const overlayDescription = document.getElementById("overlayDescription");
const overlayPrice = document.getElementById("overlayPrice");
const overlayImage = document.getElementById("overlayImage");
const overlaySizes = document.getElementById("overlaySizes");
const overlaySizesSection = document.getElementById("overlaySizesSection");
const closeBtn = document.querySelector(".close-btn");
const addToCartBtn = document.getElementById("addToCartBtn");

let allProducts = [];
let allInventory = [];
let selectedProduct = null;
let selectedVariant = null;

// Defined display order for categories
const CATEGORY_ORDER = [
    "Coffee",
    "Milk Tea",
    "Ice Blended",
    "Non Coffee",
    "Fruit Soda",
    "Snacks"
];

const categoryMap = {
    "all": "all",
    "iceblended": "Ice Blended",
    "coffee": "Coffee",
    "noncoffee": "Non Coffee",
    "milktea": "Milk Tea",
    "fruitsoda": "Fruit Soda",
    "snacks": "Snacks"
};

// Realtime inventory listener
const inventoryRef = ref(activeDb, "inventory");
onValue(inventoryRef, (snapshot) => {
    allInventory = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, item]) => ({ id, ...item })) : [];
    renderUserMenu();
}, (error) => {
    console.warn("Inventory fetch warning:", error);
});

// Calculate maximum capacity for a product variant based on ingredients
function getVariantMaxStock(product, variant) {
    if (allInventory.length === 0) return 9999;
    const ingredients = (variant && Array.isArray(variant.ingredients) && variant.ingredients.length > 0)
        ? variant.ingredients
        : (Array.isArray(product.ingredients) ? product.ingredients : []);

    if (ingredients.length === 0) return 9999;

    let minPossible = Infinity;
    for (const ing of ingredients) {
        const targetName = (typeof ing === "object" ? (ing.name || ing.inventoryName || "") : String(ing)).trim().toLowerCase();
        const amountPerCup = typeof ing === "object" ? Number(ing.amount ?? 1) : 1;
        if (!targetName) continue;

        const matchedInv = allInventory.find(inv => (inv.name || "").trim().toLowerCase() === targetName);
        if (!matchedInv) return 0;

        const stock = Number(matchedInv.stock ?? matchedInv.quantity ?? 0);
        const possible = Math.floor(stock / amountPerCup);
        if (possible < minPossible) minPossible = possible;
    }

    return minPossible === Infinity ? 9999 : Math.max(0, minPossible);
}

// Check if entire product is depleted across all variants
function isProductOutOfStock(product) {
    const variants = getNormalizedVariants(product);
    if (variants.length === 0) return false;
    return variants.every(v => getVariantMaxStock(product, v) <= 0);
}

// Realtime products listener
const productsRef = ref(activeDb, "products");
onValue(productsRef, (snapshot) => {
    allProducts = snapshot.exists() ? Object.entries(snapshot.val()).map(([id, product]) => ({ id, ...product })) : [];
    renderUserMenu();
}, (error) => {
    console.error("Firebase load error:", error);
    if (menuGrid) {
        menuGrid.innerHTML = "<p style='text-align: center; color: #708687;'>Unable to load menu at this time.</p>";
    }
});

// Helper: Build a single product card element without price
function createProductCard(product) {
    const card = document.createElement("div");
    card.className = "menu-card";
    
    let imgSrc = product.image || "Asset/Square Logo.JPG";
    if (imgSrc.startsWith("../")) {
        imgSrc = imgSrc.replace(/^\.\.\//, "");
    }

    card.innerHTML = `
        <div class="menu-card-img-wrap">
            <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(product.name)}" onerror="this.onerror=null;this.src='Asset/Square Logo.jpg';">
        </div>
        <h3>${escapeHTML(product.name || "Item")}</h3>
    `;

    card.addEventListener("click", () => openProductOverlay(product));
    return card;
}

// Helper: Build a scrollable category section with left/right controls
function createHorizontalSection(categoryTitle, products) {
    const section = document.createElement("div");
    section.className = "category-scroll-section";

    const header = document.createElement("div");
    header.className = "category-scroll-header";
    header.innerHTML = `
        <div class="category-heading-left">
            <h2>${escapeHTML(categoryTitle)}</h2>
            <span class="category-count">${products.length} item${products.length === 1 ? "" : "s"}</span>
        </div>
        <div class="category-scroll-arrows">
            <button type="button" class="scroll-arrow prev-arrow" aria-label="Scroll Left">
                <i class="fa-solid fa-chevron-left"></i>
            </button>
            <button type="button" class="scroll-arrow next-arrow" aria-label="Scroll Right">
                <i class="fa-solid fa-chevron-right"></i>
            </button>
        </div>
    `;

    const trackWrapper = document.createElement("div");
    trackWrapper.className = "scroll-track-wrapper";

    const track = document.createElement("div");
    track.className = "horizontal-menu-track";

    products.forEach((product) => {
        track.appendChild(createProductCard(product));
    });

    trackWrapper.appendChild(track);
    section.appendChild(header);
    section.appendChild(trackWrapper);

    // Arrow click scroll handlers
    const prevBtn = header.querySelector(".prev-arrow");
    const nextBtn = header.querySelector(".next-arrow");

    const scrollAmount = 300;
    prevBtn.addEventListener("click", () => {
        track.scrollBy({ left: -scrollAmount, behavior: "smooth" });
    });

    nextBtn.addEventListener("click", () => {
        track.scrollBy({ left: scrollAmount, behavior: "smooth" });
    });

    return section;
}

// Render menu cards for customers
function renderUserMenu() {
    if (!menuGrid) return;
    menuGrid.innerHTML = "";

    const selectedKey = categorySelect ? categorySelect.value : "all";
    const targetCategory = categoryMap[selectedKey] || selectedKey;

    // Filter available (in-stock and active) products
    const availableProducts = allProducts.filter((product) => {
        const status = (product.status || "").toLowerCase();
        const isManuallyUnavailable = status === "unavailable" || status === "inactive";
        const isDepleted = isProductOutOfStock(product);
        return !isManuallyUnavailable && !isDepleted;
    });

    if (availableProducts.length === 0) {
        menuGrid.innerHTML = `<p style="text-align: center; color: #8fa0a1; padding: 40px 0;">No items available right now.</p>`;
        return;
    }

    // CASE 1: All Categories Selected (Shows each category row with 4-8 items)
    if (targetCategory === "all") {
        const groups = {};
        availableProducts.forEach((p) => {
            const cat = (p.category || "Other").trim();
            if (!groups[cat]) groups[cat] = [];
            groups[cat].push(p);
        });

        const presentCategories = Object.keys(groups).sort((a, b) => {
            const idxA = CATEGORY_ORDER.findIndex(c => c.toLowerCase() === a.toLowerCase());
            const idxB = CATEGORY_ORDER.findIndex(c => c.toLowerCase() === b.toLowerCase());
            if (idxA !== -1 && idxB !== -1) return idxA - idxB;
            if (idxA !== -1) return -1;
            if (idxB !== -1) return 1;
            return a.localeCompare(b);
        });

        let renderedAny = false;
        presentCategories.forEach((catName) => {
            const items = groups[catName];
            if (items.length > 0) {
                const previewItems = items.slice(0, 6);
                const sectionEl = createHorizontalSection(catName, previewItems);
                menuGrid.appendChild(sectionEl);
                renderedAny = true;
            }
        });

        if (!renderedAny) {
            menuGrid.innerHTML = `<p style="text-align: center; color: #8fa0a1; padding: 40px 0;">No items available right now.</p>`;
        }
    } 
    // CASE 2: Specific Category Selected (Shows ALL items of that category left-to-right)
    else {
        const categoryItems = availableProducts.filter((product) => 
            (product.category || "").toLowerCase() === targetCategory.toLowerCase()
        );

        if (categoryItems.length === 0) {
            menuGrid.innerHTML = `<p style="text-align: center; color: #8fa0a1; padding: 40px 0;">No items available in ${escapeHTML(targetCategory)} right now.</p>`;
            return;
        }

        const sectionEl = createHorizontalSection(targetCategory, categoryItems);
        menuGrid.appendChild(sectionEl);
    }
}

if (categorySelect) {
    categorySelect.addEventListener("change", renderUserMenu);
}

// Open product detail overlay
function openProductOverlay(product) {
    selectedProduct = product;
    const variants = getNormalizedVariants(product);

    selectedVariant = variants.length > 0 ? variants[0] : { size: "Regular", price: Number(product.price) || 0 };

    let imgSrc = product.image || "Asset/Square Logo.JPG";
    if (imgSrc.startsWith("../")) {
        imgSrc = imgSrc.replace(/^\.\.\//, "");
    }

    if (overlayName) overlayName.textContent = product.name || "";
    if (overlayDescription) overlayDescription.textContent = product.description || "Crafted fresh with our signature ingredients.";
    if (overlayImage) {
        overlayImage.src = imgSrc;
        overlayImage.alt = product.name;
        overlayImage.onerror = () => { overlayImage.src = "Asset/Square Logo.jpg"; };
    }

    // Populate size selection pills
    if (overlaySizes && overlaySizesSection) {
        overlaySizes.innerHTML = "";

        if (variants.length > 0) {
            overlaySizesSection.style.display = "block";

            variants.forEach((v, index) => {
                const pill = document.createElement("button");
                pill.type = "button";
                pill.className = `size-pill ${index === 0 ? "active" : ""}`;
                pill.textContent = v.size ? `${v.size} (${formatPeso(v.price)})` : formatPeso(v.price);

                pill.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();

                    overlaySizes.querySelectorAll(".size-pill").forEach(p => p.classList.remove("active"));
                    pill.classList.add("active");

                    selectedVariant = v;
                    if (overlayPrice) {
                        overlayPrice.textContent = formatPeso(v.price);
                    }
                });

                overlaySizes.appendChild(pill);
            });
        } else {
            overlaySizesSection.style.display = "none";
        }
    }

    if (overlayPrice) {
        overlayPrice.textContent = formatPeso(selectedVariant.price);
    }

    if (overlay) {
        overlay.classList.add("active");
        overlay.style.display = "flex";
        document.body.style.overflow = "hidden";
    }
}

// Close product overlay
function closeProductOverlay() {
    selectedProduct = null;
    selectedVariant = null;
    if (overlay) {
        overlay.classList.remove("active");
        overlay.style.display = "none";
        document.body.style.overflow = "";
    }
}

if (closeBtn) closeBtn.addEventListener("click", closeProductOverlay);

window.addEventListener("click", (e) => {
    if (e.target === overlay) {
        closeProductOverlay();
    }
});

// Show feedback toast notification
let toastTimeout;
function showToast(message, isWarning = false) {
    const toast = document.getElementById("toastNotification");
    const toastMsg = document.getElementById("toastMessage");
    const toastTitle = document.getElementById("toastTitle");
    if (!toast || !toastMsg) return;

    if (toastTitle) toastTitle.textContent = isWarning ? "Max Stock Reached" : "Added to Cart!";
    toastMsg.textContent = message;

    clearTimeout(toastTimeout);
    toast.classList.add("show");

    toastTimeout = setTimeout(() => {
        toast.classList.remove("show");
    }, 3000);
}

// Add item to cart with inventory limit stop
if (addToCartBtn) {
    addToCartBtn.addEventListener("click", () => {
        if (!selectedProduct) return;

        const price = selectedVariant ? Number(selectedVariant.price) : Number(selectedProduct.price) || 0;
        const size = selectedVariant && selectedVariant.size ? selectedVariant.size : (selectedProduct.size || "Regular");
        const cartItemKey = `${selectedProduct.id}_${size}`;

        const maxAvailable = getVariantMaxStock(selectedProduct, selectedVariant);

        let cart = JSON.parse(localStorage.getItem("gimik_cart")) || [];
        const existing = cart.find((item) => item.cartItemKey === cartItemKey || (item.id === selectedProduct.id && item.size === size));

        if (existing) {
            if (existing.quantity >= maxAvailable) {
                showToast(`Only ${maxAvailable} available in stock.`, true);
                return;
            }
            existing.quantity = (existing.quantity || 1) + 1;
        } else {
            if (maxAvailable <= 0) {
                showToast(`This item is currently out of stock.`, true);
                return;
            }
            let imgSrc = selectedProduct.image || "Asset/Square Logo.JPG";
            if (imgSrc.startsWith("../")) imgSrc = imgSrc.replace(/^\.\.\//, "");

            cart.push({
                cartItemKey,
                id: selectedProduct.id,
                name: selectedProduct.name,
                price: price,
                image: imgSrc,
                size: size,
                quantity: 1
            });
        }

        localStorage.setItem("gimik_cart", JSON.stringify(cart));
        showToast(`${selectedProduct.name} ${size} added to your cart.`);
        closeProductOverlay();
    });
}

// Extract normalized variants list
function getNormalizedVariants(product) {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants;
    }
    if (product.price !== undefined && product.price !== null) {
        return [{ size: product.size || "Regular", price: Number(product.price) || 0 }];
    }
    return [];
}

// Currency format helper
function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(amount);
}

// Sanitize string HTML output
function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}