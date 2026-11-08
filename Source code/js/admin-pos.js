// GIMIK CAFE - POS MANAGEMENT SYSTEM

import { ref, onValue, push, set, update, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { db, adminReady } from "./admin.js";

// DOM References
const posDateDisplay = document.querySelector(".pos-date");
const orderTitle = document.getElementById("posOrderTitle") || document.querySelector(".pos-order-header h2");
const resetOrderCounterBtn = document.getElementById("resetOrderCounterBtn");

// Modals
const posResetCounterModal = document.getElementById("posResetCounterModal");
const resetCounterOverlay = document.getElementById("resetCounterOverlay");
const closeResetCounterModal = document.getElementById("closeResetCounterModal");
const cancelResetCounterBtn = document.getElementById("cancelResetCounterBtn");
const confirmResetCounterBtn = document.getElementById("confirmResetCounterBtn");

const posEmptyCartModal = document.getElementById("posEmptyCartModal");
const emptyCartOverlay = document.getElementById("emptyCartOverlay");
const closeEmptyCartModal = document.getElementById("closeEmptyCartModal");
const ackEmptyCartBtn = document.getElementById("ackEmptyCartBtn");

const posVariantModal = document.getElementById("posVariantModal");
const variantModalTitle = document.getElementById("variantModalTitle");
const variantOptionsContainer = document.getElementById("variantOptionsContainer");
const closeVariantModalBtn = document.getElementById("closeVariantModalBtn") || document.getElementById("closeVariantModal");
const variantModalOverlay = document.querySelector(".pos-variant-overlay");

const posNicknameModal = document.getElementById("posNicknameModal");
const posModalCustomerName = document.getElementById("posModalCustomerName");
const confirmNicknameBtn = document.getElementById("confirmNicknameBtn");
const skipNicknameBtn = document.getElementById("skipNicknameBtn");
const closeNicknameModal = document.getElementById("closeNicknameModal");
const nicknameModalOverlay = document.getElementById("nicknameModalOverlay");

const posSuccessModal = document.getElementById("posSuccessModal");
const receiptOrderNum = document.getElementById("receiptOrderNum");
const receiptCustomer = document.getElementById("receiptCustomer");
const receiptPayment = document.getElementById("receiptPayment");
const receiptTotal = document.getElementById("receiptTotal");
const closeSuccessModalBtn = document.getElementById("closeSuccessModalBtn");

// Inventory Alerts
const outOfStockAlert = document.getElementById("posOutOfStockAlert");
const outOfStockSummary = document.getElementById("outOfStockSummary");
const lowStockAlert = document.getElementById("posLowStockAlert");
const lowStockSummary = document.getElementById("lowStockSummary");

// Filters & Product Grid
const categoryButtons = document.querySelectorAll(".pos-category");
const searchInput = document.querySelector(".pos-search input");
const productGrid = document.querySelector(".pos-product-grid");

// Order Cart Elements
const customerInput = document.getElementById("posCustomer");
const orderItemsContainer = document.querySelector(".pos-order-items");
const clearOrderBtn = document.querySelector(".clear-order-btn");
const summaryContainer = document.querySelector(".pos-summary");
const paymentButtons = document.querySelectorAll(".payment-method");
const completeSaleBtn = document.querySelector(".complete-sale-btn");

// State Management
let allProducts = [];
let allInventory = [];
let cart = [];
let selectedCategory = "All";
let selectedPaymentMethod = "Cash";
let currentOrderCount = 1;

const DEFAULT_IMAGE = "../Asset/Square Logo.jpg";

// Initialization logic
const initPOS = () => {
    updatePOSDate();
    initPaymentMethodToggle();
    initModalHandlers();
    listenToOrderCounter();
    listenToInventory();
    listenToProducts();
};

if (adminReady) {
    adminReady.then(initPOS).catch((err) => {
        console.warn("adminReady fallback, initializing directly:", err);
        initPOS();
    });
} else {
    document.addEventListener("DOMContentLoaded", initPOS);
}

function updatePOSDate() {
    if (!posDateDisplay) return;
    const now = new Date();
    posDateDisplay.innerHTML = `<i class="fa-regular fa-calendar"></i> ${now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
}

function listenToOrderCounter() {
    const counterRef = ref(db, "system/posOrderCounter");
    onValue(counterRef, (snap) => {
        currentOrderCount = snap.exists() ? Number(snap.val()) || 1 : 1;
        if (orderTitle) {
            orderTitle.textContent = `INS #${String(currentOrderCount).padStart(5, "0")}`;
        }
    });
}

function openModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.add("active");
    modalElement.style.display = "flex";
    document.body.classList.add("modal-open");
}

function closeModal(modalElement) {
    if (!modalElement) return;
    modalElement.classList.remove("active");
    modalElement.style.display = "none";
    document.body.classList.remove("modal-open");
}

function initModalHandlers() {
    if (resetOrderCounterBtn) resetOrderCounterBtn.addEventListener("click", () => openModal(posResetCounterModal));
    if (closeResetCounterModal) closeResetCounterModal.addEventListener("click", () => closeModal(posResetCounterModal));
    if (cancelResetCounterBtn) cancelResetCounterBtn.addEventListener("click", () => closeModal(posResetCounterModal));
    if (resetCounterOverlay) resetCounterOverlay.addEventListener("click", () => closeModal(posResetCounterModal));

    if (confirmResetCounterBtn) {
        confirmResetCounterBtn.addEventListener("click", async () => {
            try {
                confirmResetCounterBtn.disabled = true;
                confirmResetCounterBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Resetting...`;

                await set(ref(db, "system/posOrderCounter"), 1);

                const ordersSnapshot = await get(ref(db, "orders"));
                if (ordersSnapshot.exists()) {
                    const data = ordersSnapshot.val();
                    const updates = {};
                    Object.entries(data).forEach(([id, order]) => {
                        const isPending = (order.status || "").toLowerCase() === "pending";
                        const isPosOrder = (order.source || "").toLowerCase() === "pos" || String(order.orderNumber || "").startsWith("INS");
                        if (isPending && isPosOrder) {
                            updates[`orders/${id}`] = null;
                        }
                    });
                    if (Object.keys(updates).length > 0) {
                        await update(ref(db), updates);
                    }
                }

                resetOrder();
                closeModal(posResetCounterModal);
            } catch (err) {
                console.error("Failed to reset order counter:", err);
                alert("Could not reset counter: " + err.message);
            } finally {
                confirmResetCounterBtn.disabled = false;
                confirmResetCounterBtn.innerHTML = `<i class="fa-solid fa-check"></i> Reset to #00001`;
            }
        });
    }

    if (closeEmptyCartModal) closeEmptyCartModal.addEventListener("click", () => closeModal(posEmptyCartModal));
    if (emptyCartOverlay) emptyCartOverlay.addEventListener("click", () => closeModal(posEmptyCartModal));
    if (ackEmptyCartBtn) ackEmptyCartBtn.addEventListener("click", () => closeModal(posEmptyCartModal));

    if (clearOrderBtn) {
        clearOrderBtn.addEventListener("click", () => {
            if (cart.length === 0) return;
            resetOrder();
        });
    }

    if (closeVariantModalBtn) closeVariantModalBtn.addEventListener("click", () => closeModal(posVariantModal));
    if (variantModalOverlay) variantModalOverlay.addEventListener("click", () => closeModal(posVariantModal));

    if (closeNicknameModal) closeNicknameModal.addEventListener("click", () => closeModal(posNicknameModal));
    if (nicknameModalOverlay) nicknameModalOverlay.addEventListener("click", () => closeModal(posNicknameModal));

    if (posModalCustomerName) {
        posModalCustomerName.addEventListener("keydown", (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                confirmNicknameBtn?.click();
            }
        });
    }

    if (skipNicknameBtn) {
        skipNicknameBtn.addEventListener("click", () => {
            closeModal(posNicknameModal);
            processFinalCheckout("Walk-in Customer");
        });
    }

    if (confirmNicknameBtn) {
        confirmNicknameBtn.addEventListener("click", () => {
            const enteredName = posModalCustomerName ? posModalCustomerName.value.trim() : "";
            closeModal(posNicknameModal);
            processFinalCheckout(enteredName || "Walk-in Customer");
        });
    }

    if (closeSuccessModalBtn) {
        closeSuccessModalBtn.addEventListener("click", () => closeModal(posSuccessModal));
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            [posEmptyCartModal, posResetCounterModal, posVariantModal, posNicknameModal, posSuccessModal].forEach(m => closeModal(m));
        }
    });
}

function listenToInventory() {
    const inventoryRef = ref(db, "inventory");

    onValue(inventoryRef, (snapshot) => {
        allInventory = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            allInventory = Object.entries(data).map(([id, item]) => ({
                id,
                ...item
            }));
        }

        checkInventoryAlerts();
        renderProductsGrid();
        renderCart();
    }, (error) => {
        console.warn("Inventory listener warning:", error);
    });
}

function checkInventoryAlerts() {
    const outOfStockItems = [];
    const lowStockItems = [];

    allInventory.forEach(item => {
        const qty = Number(item.stock ?? item.quantity ?? 0);
        const minStock = Number(item.minimumStock ?? item.minStock ?? 5);

        if (qty <= 0) {
            outOfStockItems.push(item.name || "Item");
        } else if (qty <= minStock) {
            lowStockItems.push(item.name || "Item");
        }
    });

    if (outOfStockAlert && outOfStockSummary) {
        if (outOfStockItems.length > 0) {
            const emptyNames = outOfStockItems.slice(0, 3).join(", ");
            const extraEmpty = outOfStockItems.length > 3 ? ` +${outOfStockItems.length - 3} more` : "";
            outOfStockSummary.textContent = `${emptyNames}${extraEmpty} completely depleted!`;
            outOfStockAlert.style.display = "flex";
        } else {
            outOfStockAlert.style.display = "none";
        }
    }

    if (lowStockAlert && lowStockSummary) {
        if (lowStockItems.length > 0) {
            const lowNames = lowStockItems.slice(0, 3).join(", ");
            const extraLow = lowStockItems.length > 3 ? ` +${lowStockItems.length - 3} more` : "";
            lowStockSummary.textContent = `${lowNames}${extraLow} running low on stock!`;
            lowStockAlert.style.display = "flex";
        } else {
            lowStockAlert.style.display = "none";
        }
    }
}

function getIngredientsForVariant(product, variant) {
    if (variant && Array.isArray(variant.ingredients) && variant.ingredients.length > 0) {
        return variant.ingredients;
    }
    if (Array.isArray(product.ingredients) && product.ingredients.length > 0) {
        return product.ingredients;
    }
    return [];
}

function calculateVariantCapacity(product, variant) {
    const ingredients = getIngredientsForVariant(product, variant);
    if (ingredients.length === 0) {
        return { maxCups: 9999, bottleneckIngredient: null, isDepleted: false };
    }

    let minPossible = Infinity;
    let limitingIngredient = null;

    for (const ing of ingredients) {
        const ingName = typeof ing === "object" ? (ing.name || ing.inventoryName || "") : String(ing);
        const requiredAmount = typeof ing === "object" ? (Number(ing.amount) || 1) : 1;
        if (!ingName) continue;

        const matchedInv = allInventory.find(inv => 
            (inv.name || "").trim().toLowerCase() === ingName.trim().toLowerCase()
        );

        if (!matchedInv) {
            return { maxCups: 0, bottleneckIngredient: ingName, isDepleted: true };
        }

        const currentStock = Number(matchedInv.stock ?? matchedInv.quantity ?? 0);
        const possibleWithThis = Math.floor(currentStock / requiredAmount);

        if (possibleWithThis < minPossible) {
            minPossible = possibleWithThis;
            limitingIngredient = matchedInv.name;
        }
    }

    const finalCapacity = minPossible === Infinity ? 9999 : Math.max(0, minPossible);

    return {
        maxCups: finalCapacity,
        bottleneckIngredient: limitingIngredient,
        isDepleted: finalCapacity <= 0
    };
}

function getRemainingAvailableUnits(product, variant, excludeCartItemId = null) {
    const ingredients = getIngredientsForVariant(product, variant);
    if (ingredients.length === 0) return 9999;

    const reservedInventory = {};
    cart.forEach(cartItem => {
        if (excludeCartItemId && cartItem.cartItemId === excludeCartItemId) return;

        const p = allProducts.find(prod => prod.id === cartItem.id);
        if (!p) return;

        const v = (p.variants || []).find(vr => vr.size === cartItem.size) || { ingredients: p.ingredients };
        const ings = getIngredientsForVariant(p, v);

        ings.forEach(ing => {
            const ingName = typeof ing === "object" ? (ing.name || ing.inventoryName || "") : String(ing);
            const reqAmount = typeof ing === "object" ? (Number(ing.amount) || 1) : 1;
            if (!ingName) return;

            const matched = allInventory.find(inv => (inv.name || "").trim().toLowerCase() === ingName.trim().toLowerCase());
            if (matched) {
                reservedInventory[matched.id] = (reservedInventory[matched.id] || 0) + (reqAmount * cartItem.quantity);
            }
        });
    });

    let maxCanMake = Infinity;
    for (const ing of ingredients) {
        const ingName = typeof ing === "object" ? (ing.name || ing.inventoryName || "") : String(ing);
        const reqAmount = typeof ing === "object" ? (Number(ing.amount) || 1) : 1;
        if (!ingName) continue;

        const matched = allInventory.find(inv => (inv.name || "").trim().toLowerCase() === ingName.trim().toLowerCase());
        if (!matched) return 0;

        const currentStock = Number(matched.stock ?? matched.quantity ?? 0);
        const alreadyUsed = reservedInventory[matched.id] || 0;
        const availableStock = Math.max(0, currentStock - alreadyUsed);

        const possible = Math.floor(availableStock / reqAmount);
        if (possible < maxCanMake) {
            maxCanMake = possible;
        }
    }

    return maxCanMake === Infinity ? 9999 : Math.max(0, maxCanMake);
}

function listenToProducts() {
    const productsRef = ref(db, "products");

    onValue(productsRef, (snapshot) => {
        allProducts = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            allProducts = Object.entries(data).map(([id, item]) => ({
                id,
                ...item
            }));
        }
        renderProductsGrid();
    }, (error) => {
        console.error("POS Product fetch error:", error);
        if (productGrid) {
            productGrid.innerHTML = `<p style="padding: 20px; opacity: 0.7;">Error loading products: ${error.message}</p>`;
        }
    });
}

function renderProductsGrid() {
    if (!productGrid) return;
    productGrid.innerHTML = "";

    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = allProducts.filter((product) => {
        const matchesCategory = selectedCategory === "All" || (product.category || "").toLowerCase() === selectedCategory.toLowerCase();
        const matchesSearch = (product.name || "").toLowerCase().includes(searchTerm);
        return matchesCategory && matchesSearch;
    });

    if (filtered.length === 0) {
        productGrid.innerHTML = `<p style="padding: 30px; text-align: center; width: 100%; opacity: 0.7;">No items found.</p>`;
        return;
    }

    filtered.forEach((product) => {
        const variants = getProductVariants(product);
        const card = document.createElement("div");

        let maxOverallCups = 0;
        variants.forEach(v => {
            const cap = calculateVariantCapacity(product, v);
            if (cap.maxCups > maxOverallCups) maxOverallCups = cap.maxCups;
        });

        const isDepleted = variants.length > 0 && maxOverallCups <= 0;
        const isUnavailable = product.status === "Unavailable" || 
                              product.status === "unavailable" || 
                              product.isAvailable === false ||
                              isDepleted;

        card.className = `pos-product-card ${isUnavailable ? "is-unavailable" : ""}`;
        card.dataset.productId = product.id;

        const imageSrc = product.image || DEFAULT_IMAGE;

        let priceDisplay = "";
        if (variants.length === 1) {
            priceDisplay = formatPeso(variants[0].price);
        } else if (variants.length > 1) {
            const prices = variants.map(v => v.price);
            const min = Math.min(...prices);
            const max = Math.max(...prices);
            priceDisplay = min === max ? formatPeso(min) : `${formatPeso(min)} - ${formatPeso(max)}`;
        } else {
            priceDisplay = formatPeso(0);
        }

        const variantCountPill = variants.length > 1 ? `<span class="card-variant-pill">${variants.length} sizes</span>` : "";

        let capacityBadgeHTML = "";
        if (isDepleted) {
            capacityBadgeHTML = `<span class="pos-stock-capacity-badge out-of-stock"><i class="fa-solid fa-ban"></i> Out of Stock</span>`;
        } else if (maxOverallCups < 9999) {
            const badgeClass = maxOverallCups <= 10 ? "low" : "optimal";
            capacityBadgeHTML = `<span class="pos-stock-capacity-badge ${badgeClass}"><i class="fa-solid fa-mug-hot"></i> Up to ${maxOverallCups} left</span>`;
        }

        card.innerHTML = `
            <div class="pos-product-image">
                <img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(product.name)}">
                ${capacityBadgeHTML}
            </div>
            <div class="pos-product-info">
                <h3>${escapeHTML(product.name)}</h3>
                <div class="pos-product-sub">
                    <span>${escapeHTML(product.category || "General")}</span>
                    ${variantCountPill}
                </div>
                <strong>${priceDisplay}</strong>
            </div>
            <div class="pos-product-actions-bar">
                <button type="button" 
                    class="pos-status-toggle ${isUnavailable ? 'unavailable' : 'available'}" 
                    title="Click to toggle availability" 
                    data-product-id="${product.id}">
                    <i class="fa-solid ${isUnavailable ? 'fa-xmark' : 'fa-check'}"></i> 
                    ${isUnavailable ? 'Unavailable' : 'Available'}
                </button>
                <button type="button" 
                    class="add-pos-product" 
                    aria-label="Add ${escapeHTML(product.name)}"
                    ${isUnavailable ? 'disabled' : ''}>
                    <i class="fa-solid fa-plus"></i>
                </button>
            </div>
        `;

        card.addEventListener("click", (e) => {
            if (e.target.closest(".pos-status-toggle")) return;
            if (isUnavailable) return;
            handleProductSelection(product);
        });

        const toggleBtn = card.querySelector(".pos-status-toggle");
        if (toggleBtn) {
            toggleBtn.addEventListener("click", async (e) => {
                e.stopPropagation();
                try {
                    toggleBtn.disabled = true;
                    const newStatus = isUnavailable ? "Available" : "Unavailable";
                    await update(ref(db, `products/${product.id}`), {
                        status: newStatus,
                        isAvailable: newStatus === "Available",
                        updatedAt: Date.now()
                    });
                } catch (err) {
                    console.error("Failed to toggle status:", err);
                } finally {
                    toggleBtn.disabled = false;
                }
            });
        }

        productGrid.appendChild(card);
    });
}

function getProductVariants(product) {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants;
    }
    if (product.price !== undefined && product.price !== null && product.price !== "") {
        return [{ size: product.size || "Hot (16oz)", price: Number(product.price) || 0, ingredients: product.ingredients || [] }];
    }
    return [];
}

function handleProductSelection(product) {
    const variants = getProductVariants(product);

    if (variants.length <= 1) {
        const v = variants[0] || { size: "Hot (16oz)", price: Number(product.price) || 0 };
        const availableUnits = getRemainingAvailableUnits(product, v);
        if (availableUnits <= 0) return;
        addToCart(product, v);
        return;
    }

    if (!posVariantModal || !variantOptionsContainer) return;
    variantModalTitle.textContent = product.name;
    variantOptionsContainer.innerHTML = "";

    variants.forEach((v) => {
        const { maxCups } = calculateVariantCapacity(product, v);
        const remainingUnits = getRemainingAvailableUnits(product, v);
        const isDepleted = remainingUnits <= 0;

        let statusHint = "";
        if (isDepleted) {
            statusHint = `<span style="font-size: 11px; color: #cf3d28; font-weight: 600;">(Out of Stock)</span>`;
        } else if (maxCups < 9999) {
            statusHint = `<span style="font-size: 11px; color: #087050; font-weight: 600;">(${remainingUnits} left)</span>`;
        }

        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `variant-choice-btn ${isDepleted ? 'is-disabled' : ''}`;
        if (isDepleted) btn.disabled = true;

        btn.innerHTML = `
            <div>
                <span class="variant-name">${escapeHTML(v.size || "Hot (16oz)")}</span>
                ${statusHint}
            </div>
            <span class="variant-price">${formatPeso(v.price)}</span>
        `;

        btn.addEventListener("click", () => {
            if (isDepleted) return;
            addToCart(product, v);
            closeModal(posVariantModal);
        });

        variantOptionsContainer.appendChild(btn);
    });

    openModal(posVariantModal);
}

categoryButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
        categoryButtons.forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        selectedCategory = btn.textContent.trim();
        renderProductsGrid();
    });
});

if (searchInput) {
    searchInput.addEventListener("input", renderProductsGrid);
}

function addToCart(product, variant) {
    const sizeLabel = variant.size ? variant.size.trim() : "Hot (16oz)";
    const cartItemId = `${product.id}_${sizeLabel}`;
    const existing = cart.find((item) => item.cartItemId === cartItemId);

    const remainingUnits = getRemainingAvailableUnits(product, variant);
    if (remainingUnits <= 0) return;

    if (existing) {
        existing.quantity += 1;
    } else {
        cart.push({
            id: product.id,
            cartItemId,
            name: product.name,
            size: sizeLabel,
            price: Number(variant.price) || 0,
            image: product.image || DEFAULT_IMAGE,
            category: product.category || "General",
            quantity: 1
        });
    }

    renderCart();
}

function updateQuantity(cartItemId, delta) {
    const item = cart.find((i) => i.cartItemId === cartItemId);
    if (!item) return;

    if (delta > 0) {
        const product = allProducts.find(p => p.id === item.id);
        const variant = (product?.variants || []).find(v => v.size === item.size) || { size: item.size, ingredients: product?.ingredients };

        if (product) {
            const remaining = getRemainingAvailableUnits(product, variant);
            if (remaining <= 0) return;
        }
    }

    item.quantity += delta;
    if (item.quantity <= 0) {
        cart = cart.filter((i) => i.cartItemId !== cartItemId);
    }

    renderCart();
}

function setExactQuantity(cartItemId, rawValue) {
    const item = cart.find((i) => i.cartItemId === cartItemId);
    if (!item) return;

    let targetQty = parseInt(rawValue, 10);
    if (isNaN(targetQty) || targetQty < 1) targetQty = 1;

    const product = allProducts.find(p => p.id === item.id);
    const variant = (product?.variants || []).find(v => v.size === item.size) || { size: item.size, ingredients: product?.ingredients };

    if (product) {
        const availableHeadroom = getRemainingAvailableUnits(product, variant, cartItemId);
        if (targetQty > availableHeadroom) targetQty = Math.max(1, availableHeadroom);
    }

    item.quantity = targetQty;
    renderCart();
}

function renderCart() {
    if (!orderItemsContainer) return;
    orderItemsContainer.innerHTML = "";

    if (cart.length === 0) {
        orderItemsContainer.innerHTML = `<p style="text-align: center; padding: 40px 10px; opacity: 0.5;">No items added yet.</p>`;
        updateSummary(0);
        return;
    }

    let subtotal = 0;
    cart.forEach((item) => {
        const itemTotal = item.price * item.quantity;
        subtotal += itemTotal;
        const sizeDisplay = item.size ? ` (${escapeHTML(item.size)})` : "";

        const row = document.createElement("div");
        row.className = "pos-order-item";
        row.innerHTML = `
            <div class="pos-order-item-image">
                <img src="${escapeHTML(item.image)}" alt="${escapeHTML(item.name)}">
            </div>
            <div class="pos-order-item-info">
                <h4>${escapeHTML(item.name)}${sizeDisplay}</h4>
                <span>${formatPeso(item.price)}</span>
                <div class="quantity-controls">
                    <button type="button" class="qty-btn minus" data-id="${item.cartItemId}" aria-label="Decrease quantity">
                        <i class="fa-solid fa-minus"></i>
                    </button>
                    <input 
                        type="number" 
                        class="qty-input" 
                        data-id="${item.cartItemId}" 
                        value="${item.quantity}" 
                        min="1" 
                        step="1"
                        aria-label="Quantity">
                    <button type="button" class="qty-btn plus" data-id="${item.cartItemId}" aria-label="Increase quantity">
                        <i class="fa-solid fa-plus"></i>
                    </button>
                </div>
            </div>
            <div class="pos-item-total">
                ${formatPeso(itemTotal)}
            </div>
        `;
        orderItemsContainer.appendChild(row);
    });

    orderItemsContainer.querySelectorAll(".qty-btn.minus").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); updateQuantity(btn.dataset.id, -1); });
    });

    orderItemsContainer.querySelectorAll(".qty-btn.plus").forEach(btn => {
        btn.addEventListener("click", e => { e.stopPropagation(); updateQuantity(btn.dataset.id, 1); });
    });

    orderItemsContainer.querySelectorAll("input.qty-input").forEach(input => {
        input.addEventListener("click", e => e.stopPropagation());
        input.addEventListener("change", () => setExactQuantity(input.dataset.id, input.value));
        input.addEventListener("keydown", e => { if (e.key === "Enter") { e.preventDefault(); input.blur(); } });
    });

    updateSummary(subtotal);
}

function updateSummary(subtotal) {
    if (!summaryContainer) return;
    summaryContainer.innerHTML = `
        <div>
            <span>Subtotal</span>
            <strong>${formatPeso(subtotal)}</strong>
        </div>
        <div>
            <span>Discount</span>
            <strong>₱0.00</strong>
        </div>
        <div class="pos-total">
            <span>TOTAL</span>
            <strong>${formatPeso(subtotal)}</strong>
        </div>
    `;
}

function resetOrder() {
    cart = [];
    if (customerInput) customerInput.value = "";
    renderCart();
}

function initPaymentMethodToggle() {
    paymentButtons.forEach((btn) => {
        btn.addEventListener("click", () => {
            paymentButtons.forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            selectedPaymentMethod = btn.textContent.trim();
        });
    });
}

async function deductInventoryForOrder(orderItems) {
    const deductionsMap = {};

    for (const item of orderItems) {
        const product = allProducts.find(p => p.id === item.id);
        if (!product) continue;

        const variant = (product.variants || []).find(v => v.size === item.size) || { ingredients: product.ingredients };
        const ingredients = getIngredientsForVariant(product, variant);
        const qtySold = Number(item.quantity) || 1;

        ingredients.forEach((ing) => {
            let targetName = "";
            let amountPerCup = 1;

            if (typeof ing === "object") {
                targetName = (ing.name || ing.inventoryName || "")?.trim().toLowerCase();
                amountPerCup = Number(ing.amount ?? 1);
            } else {
                targetName = String(ing).trim().toLowerCase();
                amountPerCup = 1;
            }

            if (!targetName) return;

            const matchedInv = allInventory.find(inv => 
                (inv.name || "").trim().toLowerCase() === targetName
            );

            if (matchedInv) {
                deductionsMap[matchedInv.id] = (deductionsMap[matchedInv.id] || 0) + (amountPerCup * qtySold);
            }
        });
    }

    const updatePromises = Object.entries(deductionsMap).map(async ([invId, amountToDeduct]) => {
        try {
            const invRef = ref(db, `inventory/${invId}`);
            const snapshot = await get(invRef);
            if (!snapshot.exists()) return;

            const currentStock = Number(snapshot.val().stock ?? snapshot.val().quantity ?? 0);
            const newStock = Math.max(0, currentStock - amountToDeduct);

            await update(invRef, {
                stock: Math.round(newStock * 100) / 100,
                updatedAt: Date.now()
            });
        } catch (err) {
            console.error(`Failed to deduct inventory for ${invId}:`, err);
        }
    });

    await Promise.all(updatePromises);
}

if (completeSaleBtn) {
    completeSaleBtn.addEventListener("click", () => {
        if (cart.length === 0) {
            openModal(posEmptyCartModal);
            return;
        }

        const currentVal = customerInput ? customerInput.value.trim() : "";
        if (currentVal && currentVal.toLowerCase() !== "walk-in customer") {
            processFinalCheckout(currentVal);
        } else {
            if (posModalCustomerName) {
                posModalCustomerName.value = currentVal;
                setTimeout(() => posModalCustomerName.focus(), 80);
            }
            openModal(posNicknameModal);
        }
    });
}

async function processFinalCheckout(customerName) {
    if (customerInput) customerInput.value = customerName;

    const currentOrderNumber = `INS #${String(currentOrderCount).padStart(5, "0")}`;
    const subtotal = cart.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const total = subtotal;
    const cartItemsSnapshot = [...cart];

    const orderData = {
        orderNumber: currentOrderNumber,
        customerName: customerName,
        nickname: customerName,
        items: cartItemsSnapshot.map(item => ({
            id: item.id,
            name: item.name,
            size: item.size || "",
            price: item.price,
            quantity: item.quantity,
            total: item.price * item.quantity
        })),
        subtotal,
        total,
        paymentMethod: selectedPaymentMethod,
        status: "Pending",
        source: "POS",
        createdAt: Date.now(),
        dateString: new Date().toLocaleDateString("en-US", { 
            year: "numeric", 
            month: "short", 
            day: "numeric", 
            hour: "2-digit", 
            minute: "2-digit" 
        })
    };

    try {
        completeSaleBtn.disabled = true;
        completeSaleBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Processing...`;

        const ordersRef = ref(db, "orders");
        await set(push(ordersRef), orderData);

        try {
            await set(ref(db, "system/posOrderCounter"), currentOrderCount + 1);
        } catch (counterErr) {
            console.warn("Could not increment POS order counter:", counterErr);
        }

        await deductInventoryForOrder(cartItemsSnapshot);

        if (receiptOrderNum) receiptOrderNum.textContent = currentOrderNumber;
        if (receiptCustomer) receiptCustomer.textContent = customerName;
        if (receiptPayment) receiptPayment.textContent = selectedPaymentMethod;
        if (receiptTotal) receiptTotal.textContent = formatPeso(total);

        openModal(posSuccessModal);
        resetOrder();
    } catch (error) {
        console.error("Complete sale error:", error);
    } finally {
        completeSaleBtn.disabled = false;
        completeSaleBtn.innerHTML = `<i class="fa-solid fa-check"></i> Complete Sale`;
    }
}

function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(amount);
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}