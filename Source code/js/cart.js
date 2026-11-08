// GIMIK CAFE CART

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { database as db } from "./firebase-config.js";

// DOM element references
const cartItems = document.querySelector(".cart-items");
const totalElement = document.getElementById("total");

// Cart storage setup
const CART_STORAGE_KEY = "gimik_cart";
const ACTIVE_ORDER_KEY = "gimik_active_order_id";
let cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
let allProducts = [];
let allInventory = [];

// =========================================================
// CUSTOMER ACTIVE ORDER LISTENER
// =========================================================
let cartHasNotifiedProcessing = false;

function listenToCustomerActiveOrder() {
    const activeOrderId = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!activeOrderId) return;

    const orderRef = ref(db, `orders/${activeOrderId}`);
    onValue(orderRef, (snap) => {
        if (!snap.exists()) return;
        const orderData = snap.val();
        const status = (orderData.status || "").toLowerCase().trim();
        const orderNum = orderData.orderNumber || "Your order";

        // Processing notification chime
        if ((status.includes("processing") || status.includes("process")) && !cartHasNotifiedProcessing) {
            cartHasNotifiedProcessing = true;
            showCustomerToast(orderNum, "Preparing Drink", "Payment Verified! Order in progress.", "We are currently preparing your drinks.");
        }
        // For Pickup notification chime
        else if (status === "for pickup" || status === "ready" || status === "completed") {
            showCustomerToast(orderNum, "For Pickup", "Your order is ready for pick-up!", "Please proceed to the counter. Enjoy your drink!");
            localStorage.removeItem(ACTIVE_ORDER_KEY);
        }
    });
}

function showCustomerToast(orderNum, tagText, titleText, descText) {
    let alertBox = document.getElementById("customerReadyToast");
    if (!alertBox) {
        alertBox = document.createElement("div");
        alertBox.id = "customerReadyToast";
        alertBox.className = "customer-ready-toast";
        document.body.appendChild(alertBox);
    }

    const isProcessing = tagText.toLowerCase().includes("preparing");

    alertBox.innerHTML = `
        <div class="ready-toast-icon">
            <i class="fa-solid ${isProcessing ? 'fa-fire-burner' : 'fa-mug-hot'}"></i>
        </div>
        <div class="ready-toast-text">
            <span style="font-size: 10px; font-weight: 700; text-transform: uppercase; background: ${isProcessing ? '#eaf3fb' : '#eaf6f2'}; color: ${isProcessing ? '#0d6efd' : '#087050'}; padding: 2px 7px; border-radius: 4px; display: inline-block; margin-bottom: 4px;">${tagText}</span>
            <strong style="display: block; font-size: 14.5px;">${titleText}</strong>
            <p style="margin: 2px 0 0; font-size: 12.5px; color: #e5ffff;">${descText}</p>
        </div>
        <button type="button" class="ready-toast-close" onclick="this.parentElement.classList.remove('active')">
            <i class="fa-solid fa-xmark"></i>
        </button>
    `;

    setTimeout(() => alertBox.classList.add("active"), 100);

    // Audio chime
    try {
        const audio = new Audio("Asset/mariocoinsound.mp3");
        audio.play().catch(() => {});
    } catch (e) {}
}

listenToCustomerActiveOrder();

// Sync products & inventory
onValue(ref(db, "inventory"), (snap) => {
    allInventory = snap.exists() ? Object.entries(snap.val()).map(([id, item]) => ({ id, ...item })) : [];
    displayCart();
});

onValue(ref(db, "products"), (snap) => {
    allProducts = snap.exists() ? Object.entries(snap.val()).map(([id, item]) => ({ id, ...item })) : [];
    displayCart();
});

function getMaxAvailable(cartItem) {
    if (allProducts.length === 0 || allInventory.length === 0) return 9999;

    const product = allProducts.find(p => p.id === cartItem.id || (p.name || "").toLowerCase() === (cartItem.name || "").toLowerCase());
    if (!product) return 9999;

    const variant = (product.variants || []).find(v => v.size === cartItem.size) || { ingredients: product.ingredients };
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

function saveCart() {
    localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(cart));
}

function formatPrice(price) {
    return "₱" + Number(price).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function getPrice(price) {
    return parseFloat(String(price).replace(/[₱,]/g, "")) || 0;
}

function displayCart() {
    if (!cartItems) return;
    cartItems.innerHTML = "";

    if (cart.length === 0) {
        cartItems.innerHTML = `
            <div class="empty-cart">
                <i class="fa-solid fa-cart-shopping"></i>
                <h3>Mabitin ka di'yan?</h3>
                <p>Kuha ka na!</p>
                <a href="menu.html" class="continue-shopping">Browse Menu</a>
            </div>
        `;
        if (totalElement) totalElement.textContent = "₱0.00";
        return;
    }

    cart.forEach((item, index) => {
        const price = getPrice(item.price);
        const maxStock = getMaxAvailable(item);

        if (item.quantity > maxStock && maxStock > 0) {
            item.quantity = maxStock;
            saveCart();
        }

        const currentQty = item.quantity || 1;
        const itemTotal = price * currentQty;
        const isMaxReached = currentQty >= maxStock;

        let imgSrc = item.image || "Asset/Square Logo.jpg";
        if (imgSrc.startsWith("../")) {
            imgSrc = imgSrc.replace(/^\.\.\//, "");
        }

        const sizeLabel = item.size ? `<span class="cart-item-size" style="display: block; font-size: 13px; color: #e5ffff; font-weight: 500; margin-top: 3px;">Size: ${escapeHTML(item.size)}</span>` : "";
        const stockHint = maxStock < 9999 ? `<span style="display: block; font-size: 11px; color: ${isMaxReached ? '#ff8585' : '#88e7e9'}; font-weight: 600; margin-top: 2px;">${isMaxReached ? 'Max stock reached' : `${maxStock} available`}</span>` : "";

        const card = document.createElement("div");
        card.className = "cart-card";

        card.innerHTML = `
            <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(item.name)}" onerror="this.onerror=null;this.src='Asset/Square Logo.jpg';">

            <div class="cart-details">
                <h3>${escapeHTML(item.name)}</h3>
                ${sizeLabel}
                ${stockHint}
                <p>${formatPrice(price)}</p>
            </div>

            <div class="cart-actions">
                <div class="quantity">
                    <button class="quantity-btn decrease-btn" data-index="${index}" type="button">-</button>
                    <input 
                        type="number" 
                        class="quantity-input" 
                        data-index="${index}" 
                        value="${currentQty}" 
                        min="1" 
                        max="${maxStock}" 
                        step="1"
                        aria-label="Quantity"
                    >
                    <button class="quantity-btn increase-btn" data-index="${index}" type="button" ${isMaxReached ? 'disabled style="opacity: 0.4; cursor: not-allowed;"' : ''}>+</button>
                </div>

                <p class="item-total">${formatPrice(itemTotal)}</p>

                <button class="remove-btn" data-index="${index}" type="button">
                    <i class="fa-solid fa-trash"></i> Remove
                </button>
            </div>
        `;

        cartItems.appendChild(card);
    });

    updateTotal();
}

function updateTotal() {
    if (!totalElement) return;
    let total = 0;
    cart.forEach((item) => {
        total += getPrice(item.price) * (item.quantity || 1);
    });
    totalElement.textContent = formatPrice(total);
}

function increase(index) {
    if (!cart[index]) return;
    const maxStock = getMaxAvailable(cart[index]);
    const currentQty = cart[index].quantity || 1;

    if (currentQty >= maxStock) return;

    cart[index].quantity = currentQty + 1;
    saveCart();
    displayCart();
}

function decrease(index) {
    if (!cart[index]) return;
    if (cart[index].quantity > 1) {
        cart[index].quantity--;
    } else {
        cart.splice(index, 1);
    }
    saveCart();
    displayCart();
}

function setCustomQuantity(index, rawValue) {
    if (!cart[index]) return;

    let targetQty = parseInt(rawValue, 10);
    const maxStock = getMaxAvailable(cart[index]);

    if (isNaN(targetQty) || targetQty < 1) {
        targetQty = 1;
    } else if (targetQty > maxStock) {
        targetQty = maxStock;
    }

    cart[index].quantity = targetQty;
    saveCart();
    displayCart();
}

function removeItem(index) {
    if (!cart[index]) return;
    cart.splice(index, 1);
    saveCart();
    displayCart();
}

if (cartItems) {
    cartItems.addEventListener("click", function (event) {
        const button = event.target.closest("button");
        if (!button) return;

        const index = Number(button.dataset.index);

        if (button.classList.contains("increase-btn")) increase(index);
        if (button.classList.contains("decrease-btn")) decrease(index);
        if (button.classList.contains("remove-btn")) removeItem(index);
    });

    cartItems.addEventListener("change", function (event) {
        const input = event.target.closest(".quantity-input");
        if (!input) return;

        const index = Number(input.dataset.index);
        setCustomQuantity(index, input.value);
    });

    cartItems.addEventListener("keydown", function (event) {
        const input = event.target.closest(".quantity-input");
        if (!input) return;

        if (event.key === "Enter") {
            event.preventDefault();
            input.blur();
        }
    });
}

window.goToCheckout = function () {
    if (cart.length === 0) return;
    window.location.href = "checkout.html";
};

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

displayCart();