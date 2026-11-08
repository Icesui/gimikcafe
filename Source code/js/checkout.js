// GIMIK CAFE CHECKOUT LOGIC

import { ref, push, set, get, update, runTransaction } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { database as db, auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

// Cache DOM element references
const checkoutItems = document.getElementById("checkoutItems");
const totalItems = document.getElementById("totalItems");
const checkoutTotal = document.getElementById("checkoutTotal");
const placeOrderBtn = document.getElementById("placeOrderBtn");

// Confirm Modal References
const orderConfirmModal = document.getElementById("orderConfirmModal");
const modalCancelBtn = document.getElementById("modalCancelBtn");
const modalConfirmBtn = document.getElementById("modalConfirmBtn");
const modalPayment = document.getElementById("modalPayment");
const modalItemsCount = document.getElementById("modalItemsCount");
const modalTotalAmount = document.getElementById("modalTotalAmount");

// QR Payment Modal References
const paymentQrModal = document.getElementById("paymentQrModal");
const qrTotalDisplay = document.getElementById("qrTotalDisplay");
const qrCancelBtn = document.getElementById("qrCancelBtn");
const qrPaidConfirmBtn = document.getElementById("qrPaidConfirmBtn");
const gcashRefInput = document.getElementById("gcashRefInput");

// Success and Warning Modals
const orderSuccessModal = document.getElementById("orderSuccessModal");
const modalOrderId = document.getElementById("modalOrderId");
const modalSuccessDoneBtn = document.getElementById("modalSuccessDoneBtn");
const authWarningModal = document.getElementById("authWarningModal");
const modalLoginRedirectBtn = document.getElementById("modalLoginRedirectBtn");

// Initialize cart storage and user session
const CART_STORAGE_KEY = "gimik_cart";
const ACTIVE_ORDER_KEY = "gimik_active_order_id";
let cart = JSON.parse(localStorage.getItem(CART_STORAGE_KEY)) || [];
let currentAuthUser = null;

// Track Firebase authentication state changes
onAuthStateChanged(auth, (user) => {
    currentAuthUser = user || null;
});

// Render checkout items and calculate totals
function displayCheckout() {
    if (!checkoutItems) return;
    checkoutItems.innerHTML = "";

    let total = 0;
    let itemCount = 0;

    if (cart.length === 0) {
        checkoutItems.innerHTML = `
            <div class="empty-checkout">
                <p>Your cart is empty.</p>
                <a href="menu.html" class="back-cart" style="margin-top: 10px; display: inline-block; color: #ffd27a;">Browse Menu</a>
            </div>
        `;
        if (totalItems) totalItems.textContent = "0";
        if (checkoutTotal) checkoutTotal.textContent = "₱0.00";
        return;
    }

    cart.forEach((item) => {
        const price = parseFloat(String(item.price).replace(/[₱,]/g, "")) || 0;
        const quantity = parseInt(item.quantity, 10) || 1;
        const itemTotal = price * quantity;

        total += itemTotal;
        itemCount += quantity;

        let imgSrc = item.image || "Asset/Square Logo.jpg";
        if (imgSrc.startsWith("../")) {
            imgSrc = imgSrc.replace(/^\.\.\//, "");
        }

        const sizeText = item.size ? ` • Size: ${escapeHTML(item.size)}` : "";
        const itemElement = document.createElement("div");
        itemElement.className = "checkout-item";

        itemElement.innerHTML = `
            <img src="${escapeHTML(imgSrc)}" alt="${escapeHTML(item.name)}" onerror="this.onerror=null;this.src='Asset/Square Logo.jpg';">
            <div class="checkout-item-details">
                <h3>${escapeHTML(item.name)}</h3>
                <p>₱${price.toFixed(2)} × ${quantity}${sizeText}</p>
            </div>
            <div class="checkout-item-price">₱${itemTotal.toFixed(2)}</div>
        `;

        checkoutItems.appendChild(itemElement);
    });

    if (totalItems) totalItems.textContent = itemCount;
    if (checkoutTotal) checkoutTotal.textContent = `₱${total.toFixed(2)}`;
}

// Open confirmation modal or prompt login if unauthenticated
function openConfirmModal() {
    if (!currentAuthUser) {
        if (authWarningModal) authWarningModal.classList.add("active");
        return;
    }

    if (modalPayment) modalPayment.textContent = "GCash";
    if (modalItemsCount) modalItemsCount.textContent = totalItems.textContent;
    if (modalTotalAmount) modalTotalAmount.textContent = checkoutTotal.textContent;

    if (orderConfirmModal) orderConfirmModal.classList.add("active");
}

// Close all active modals
function closeConfirmModal() {
    if (orderConfirmModal) orderConfirmModal.classList.remove("active");
    if (paymentQrModal) paymentQrModal.classList.remove("active");
    if (authWarningModal) authWarningModal.classList.remove("active");
}

// Trigger initial review modal
if (placeOrderBtn) {
    placeOrderBtn.addEventListener("click", () => {
        if (cart.length === 0) return;
        openConfirmModal();
    });
}

if (modalCancelBtn) modalCancelBtn.addEventListener("click", closeConfirmModal);

// Transition from confirmation modal to QR Payment Modal
if (modalConfirmBtn) {
    modalConfirmBtn.addEventListener("click", () => {
        if (orderConfirmModal) orderConfirmModal.classList.remove("active");

        const currentTotal = checkoutTotal ? checkoutTotal.textContent : "₱0.00";
        if (qrTotalDisplay) qrTotalDisplay.textContent = currentTotal;

        // Reset reference input and disable "I Have Paid" button
        if (gcashRefInput) {
            gcashRefInput.value = "";
            gcashRefInput.classList.remove("valid");
        }
        if (qrPaidConfirmBtn) {
            qrPaidConfirmBtn.disabled = true;
        }

        if (paymentQrModal) paymentQrModal.classList.add("active");
        setTimeout(() => gcashRefInput?.focus(), 100);
    });
}

// Restrict reference number to exactly 15 digits and toggle confirm button
if (gcashRefInput) {
    gcashRefInput.addEventListener("input", () => {
        // Only allow numbers
        let val = gcashRefInput.value.replace(/\D/g, "");
        if (val.length > 15) val = val.slice(0, 15);
        gcashRefInput.value = val;

        const isValid = val.length === 15;
        if (qrPaidConfirmBtn) {
            qrPaidConfirmBtn.disabled = !isValid;
        }
        gcashRefInput.classList.toggle("valid", isValid);
    });
}

// Cancel from QR modal
if (qrCancelBtn) {
    qrCancelBtn.addEventListener("click", () => {
        if (paymentQrModal) paymentQrModal.classList.remove("active");
    });
}

if (modalLoginRedirectBtn) {
    modalLoginRedirectBtn.addEventListener("click", () => {
        window.location.href = "login.html";
    });
}

// Atomically get next ONL #
async function getNextOnlineOrderNumber() {
    const counterRef = ref(db, "system/onlineOrderCounter");
    const result = await runTransaction(counterRef, (currentValue) => {
        return (currentValue || 0) + 1;
    });

    const nextCount = result.snapshot.val() || 1;
    return `ONL #${String(nextCount).padStart(5, "0")}`;
}

// Recipe ingredient deduction
async function deductInventoryForOnlineOrder(orderItems) {
    try {
        const [productsSnap, inventorySnap] = await Promise.all([
            get(ref(db, "products")),
            get(ref(db, "inventory"))
        ]);

        if (!productsSnap.exists() || !inventorySnap.exists()) return;

        const productsData = productsSnap.val();
        const inventoryData = inventorySnap.val();
        const deductionsMap = {};

        for (const item of orderItems) {
            const product = Object.entries(productsData).find(([pId, p]) => pId === item.id || (p.name || "").toLowerCase() === (item.name || "").toLowerCase())?.[1];
            if (!product) continue;

            const variant = (product.variants || []).find(v => v.size === item.size) || { ingredients: product.ingredients };
            const ingredients = (variant && Array.isArray(variant.ingredients) && variant.ingredients.length > 0)
                ? variant.ingredients
                : (Array.isArray(product.ingredients) ? product.ingredients : []);

            const qtySold = Number(item.quantity) || 1;

            ingredients.forEach((ing) => {
                const targetName = (typeof ing === "object" ? (ing.name || ing.inventoryName || "") : String(ing)).trim().toLowerCase();
                const amountPerCup = typeof ing === "object" ? Number(ing.amount ?? 1) : 1;
                if (!targetName) return;

                const matchedInvEntry = Object.entries(inventoryData).find(([_, inv]) => 
                    (inv.name || "").trim().toLowerCase() === targetName
                );

                if (matchedInvEntry) {
                    const invId = matchedInvEntry[0];
                    deductionsMap[invId] = (deductionsMap[invId] || 0) + (amountPerCup * qtySold);
                }
            });
        }

        const updatePromises = Object.entries(deductionsMap).map(async ([invId, amountToDeduct]) => {
            const currentStock = Number(inventoryData[invId]?.stock ?? inventoryData[invId]?.quantity ?? 0);
            const newStock = Math.max(0, currentStock - amountToDeduct);
            await update(ref(db, `inventory/${invId}`), {
                stock: Math.round(newStock * 100) / 100,
                updatedAt: Date.now()
            });
        });

        await Promise.all(updatePromises);
    } catch (err) {
        console.error("Online order inventory deduction error:", err);
    }
}

// Final order placement after QR confirmation
if (qrPaidConfirmBtn) {
    qrPaidConfirmBtn.addEventListener("click", async () => {
        if (!currentAuthUser) {
            closeConfirmModal();
            if (authWarningModal) authWarningModal.classList.add("active");
            return;
        }

        const refDigits = (gcashRefInput?.value || "").trim();
        if (refDigits.length !== 15) {
            alert("Please input the 15 digits of your GCash reference number.");
            return;
        }

        const totalAmountText = checkoutTotal ? checkoutTotal.textContent : "₱0.00";
        const numericTotal = parseFloat(totalAmountText.replace(/[₱,]/g, "")) || 0;

        try {
            qrPaidConfirmBtn.disabled = true;
            qrPaidConfirmBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Submitting...`;

            // Atomically retrieve synchronized ONL number
            const orderNum = await getNextOnlineOrderNumber();

            // Fetch customer name
            let customerName = currentAuthUser.displayName || currentAuthUser.email || "Online Customer";
            try {
                const userRef = ref(db, `Users/${currentAuthUser.uid}`);
                const userSnap = await get(userRef);
                if (userSnap.exists()) {
                    const userData = userSnap.val();
                    customerName = userData.fullName || userData.username || customerName;
                }
            } catch (e) {
                console.error("Could not fetch customer name:", e);
            }

            const cartSnapshot = [...cart];

            const orderData = {
                orderNumber: orderNum,
                orderId: orderNum,
                userId: currentAuthUser.uid,
                customerUid: currentAuthUser.uid,
                uid: currentAuthUser.uid,
                customerName: customerName,
                orderType: "Online Pickup",
                source: "Online",
                email: currentAuthUser.email || "",
                items: cartSnapshot.map(item => ({
                    id: item.id || null,
                    name: item.name || "Item",
                    size: item.size || "Regular",
                    price: parseFloat(String(item.price).replace(/[₱,]/g, "")) || 0,
                    quantity: parseInt(item.quantity, 10) || 1,
                    total: (parseFloat(String(item.price).replace(/[₱,]/g, "")) || 0) * (parseInt(item.quantity, 10) || 1),
                    image: item.image || "Asset/Square Logo.jpg"
                })),
                totalItems: parseInt(totalItems.textContent, 10) || 1,
                total: numericTotal,
                totalAmount: numericTotal,
                paymentMethod: "GCash",
                referenceNumber: refDigits, // Saved for barista verification
                status: "Verifying Payment",
                createdAt: Date.now(),
                dateString: new Date().toLocaleString("en-PH", { timeZone: "Asia/Manila" })
            };

            const ordersRef = ref(db, "orders");
            const newOrderRef = push(ordersRef);
            await set(newOrderRef, orderData);

            // SAVE ORDER ID FOR REAL-TIME READY NOTIFICATION
            localStorage.setItem(ACTIVE_ORDER_KEY, newOrderRef.key);
            if (typeof window.trackCustomerOrder === "function") {
                window.trackCustomerOrder(newOrderRef.key);
            }

            // Deduct recipe ingredients
            await deductInventoryForOnlineOrder(cartSnapshot);

            localStorage.removeItem(CART_STORAGE_KEY);
            cart = [];
            closeConfirmModal();

            if (modalOrderId) modalOrderId.textContent = orderNum;
            if (orderSuccessModal) orderSuccessModal.classList.add("active");

        } catch (error) {
            console.error("Order submission failed:", error);
            alert("Error sending order. Please check your network connection.");
        } finally {
            qrPaidConfirmBtn.disabled = false;
            qrPaidConfirmBtn.innerHTML = `<i class="fa-solid fa-check"></i> I Have Paid`;
        }
    });
}

// Return to menu
if (modalSuccessDoneBtn) {
    modalSuccessDoneBtn.addEventListener("click", () => {
        window.location.href = "menu.html";
    });
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}

displayCheckout();