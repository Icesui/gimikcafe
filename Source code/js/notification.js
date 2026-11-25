// GIMIK CAFE - CUSTOMER ORDER STATUS NOTIFICATIONS

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { database as db, auth } from "./firebase-config.js";

const ACTIVE_ORDER_KEY = "gimik_active_order_id";
const READY_PICKUP_KEY = "gimik_ready_pickup_order_id";
const SEEN_READY_ORDERS_KEY = "gimik_seen_ready_orders";

let toastTimeout = null;
let coinAudio = null;
let cancelAudio = null;
let isAudioUnlocked = false;
let activeOrderUnsubscribe = null;
let userOrdersUnsubscribe = null;
let lastKnownStatus = null;
const knownUserOrderStatuses = new Map();

function initAudio() {
    if (!coinAudio) {
        coinAudio = document.createElement("audio");
        coinAudio.id = "customerNotificationAudio";
        coinAudio.preload = "auto";
        coinAudio.volume = 0.25;
        coinAudio.innerHTML = `
            <source src="Asset/mariocoinsound.mp3" type="audio/mpeg">
            <source src="../Asset/mariocoinsound.mp3" type="audio/mpeg">
        `;
        document.body.appendChild(coinAudio);
    }

    if (!cancelAudio) {
        cancelAudio = document.createElement("audio");
        cancelAudio.id = "customerCancelAudio";
        cancelAudio.preload = "auto";
        cancelAudio.volume = 0.2;
        cancelAudio.innerHTML = `
            <source src="Asset/mariocancel.mp3" type="audio/mpeg">
            <source src="../Asset/mariocancel.mp3" type="audio/mpeg">
        `;
        document.body.appendChild(cancelAudio);
    }

    // Truly silent unlock: mute during initial gesture play, then restore
    const unlock = () => {
        if (!isAudioUnlocked) {
            [coinAudio, cancelAudio].forEach((audio) => {
                if (audio) {
                    audio.muted = true;
                    audio.play().then(() => {
                        audio.pause();
                        audio.currentTime = 0;
                        audio.muted = false;
                    }).catch(() => {
                        audio.muted = false;
                    });
                }
            });
            isAudioUnlocked = true;
        }
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
}

function playCoinSound() {
    if (coinAudio) {
        coinAudio.muted = false;
        coinAudio.volume = 0.25;
        coinAudio.currentTime = 0;
        coinAudio.play().catch(() => {});
    }
}

function playCancelSound() {
    if (cancelAudio) {
        cancelAudio.muted = false;
        cancelAudio.volume = 0.2;
        cancelAudio.currentTime = 0;
        cancelAudio.play().catch(() => {});
    }
}

function getSeenReadyOrders() {
    try {
        const raw = localStorage.getItem(SEEN_READY_ORDERS_KEY);
        const parsed = raw ? JSON.parse(raw) : [];
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

function markOrderAsSeen(orderId) {
    if (!orderId) return;
    const seen = getSeenReadyOrders();
    if (!seen.includes(orderId)) {
        seen.push(orderId);
        localStorage.setItem(SEEN_READY_ORDERS_KEY, JSON.stringify(seen.slice(-50)));
    }
}

function isReadyStatus(status) {
    const s = (status || "").toLowerCase().trim();
    return s === "completed" || s === "ready" || s === "for pickup";
}

function ensureBadgeElement() {
    const accountAnchor = document.getElementById("accountLink") || document.getElementById("navUserLink");
    if (!accountAnchor) return null;

    accountAnchor.classList.add("account-link");

    let badge = document.getElementById("accountReadyBadge");
    if (!badge || !accountAnchor.contains(badge)) {
        if (badge) badge.remove();
        badge = document.createElement("span");
        badge.className = "account-badge";
        badge.id = "accountReadyBadge";
        badge.hidden = true;
        accountAnchor.appendChild(badge);
    }

    return badge;
}

function setAccountReadyBadge(isReady, count = 1) {
    const badge = ensureBadgeElement();
    if (!badge) return;

    if (isReady) {
        badge.textContent = count > 1 ? String(count) : "!";
        badge.hidden = false;
        badge.style.display = "inline-block";
    } else {
        badge.textContent = "";
        badge.hidden = true;
        badge.style.display = "none";
    }
}

function syncBadgeFromStorage() {
    const readyOrderId = localStorage.getItem(READY_PICKUP_KEY);
    setAccountReadyBadge(Boolean(readyOrderId), 1);
}

function clearAccountReadyBadge() {
    const currentReadyId = localStorage.getItem(READY_PICKUP_KEY);
    if (currentReadyId) {
        markOrderAsSeen(currentReadyId);
    }
    knownUserOrderStatuses.forEach((status, orderId) => {
        if (isReadyStatus(status)) {
            markOrderAsSeen(orderId);
        }
    });
    localStorage.removeItem(READY_PICKUP_KEY);
    setAccountReadyBadge(false);
}

function ensureToastElement() {
    document.querySelectorAll(".customer-ready-toast").forEach(el => el.remove());

    let toast = document.getElementById("customerOrderToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "customerOrderToast";
        toast.className = "customer-order-toast";
        toast.setAttribute("aria-live", "polite");
        toast.innerHTML = `
            <div class="customer-toast-icon" id="customerToastIcon">
                <i class="fa-solid fa-mug-hot"></i>
            </div>
            <div class="customer-toast-content">
                <div class="customer-toast-top">
                    <span class="customer-toast-tag" id="customerToastTag">Processing</span>
                    <span class="customer-toast-number" id="customerToastOrderNum">ONL #00000</span>
                </div>
                <strong class="customer-toast-heading" id="customerToastHeading">Payment Verified! Drink in process.</strong>
                <p class="customer-toast-details" id="customerToastDetails">Our barista is now preparing your drinks.</p>
            </div>
            <div class="customer-toast-actions">
                <button type="button" class="customer-toast-close" id="dismissCustomerToastBtn" title="Dismiss">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
        document.body.appendChild(toast);

        document.getElementById("dismissCustomerToastBtn")?.addEventListener("click", () => {
            toast.classList.remove("active");
            if (toastTimeout) clearTimeout(toastTimeout);
        });
    }
    return toast;
}

function showProcessingToast(orderNumber) {
    const toast = ensureToastElement();
    toast.className = "customer-order-toast is-processing active";

    const icon = document.getElementById("customerToastIcon");
    const tag = document.getElementById("customerToastTag");
    const num = document.getElementById("customerToastOrderNum");
    const heading = document.getElementById("customerToastHeading");
    const details = document.getElementById("customerToastDetails");

    if (icon) icon.innerHTML = `<i class="fa-solid fa-fire-burner"></i>`;
    if (tag) tag.textContent = "Processing";
    if (num) num.textContent = orderNumber || "Your order";
    if (heading) heading.textContent = "Payment Verified! Drink in process.";
    if (details) details.textContent = "Our barista is now preparing your drinks.";

    playCoinSound();
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("active"), 8000);
}

function showReadyToast(orderNumber) {
    const toast = ensureToastElement();
    toast.className = "customer-order-toast active";

    const icon = document.getElementById("customerToastIcon");
    const tag = document.getElementById("customerToastTag");
    const num = document.getElementById("customerToastOrderNum");
    const heading = document.getElementById("customerToastHeading");
    const details = document.getElementById("customerToastDetails");

    if (icon) icon.innerHTML = `<i class="fa-solid fa-mug-hot"></i>`;
    if (tag) tag.textContent = "For Pickup";
    if (num) num.textContent = orderNumber || "Your order";
    if (heading) heading.textContent = "Your order is ready for pick-up!";
    if (details) details.textContent = "Please proceed to the counter. Enjoy your drink!";

    playCoinSound();
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("active"), 10000);
}

function showCancelledToast(orderNumber) {
    const toast = ensureToastElement();
    toast.className = "customer-order-toast is-cancelled active";

    const icon = document.getElementById("customerToastIcon");
    const tag = document.getElementById("customerToastTag");
    const num = document.getElementById("customerToastOrderNum");
    const heading = document.getElementById("customerToastHeading");
    const details = document.getElementById("customerToastDetails");

    if (icon) icon.innerHTML = `<i class="fa-solid fa-circle-xmark"></i>`;
    if (tag) tag.textContent = "Cancelled";
    if (num) num.textContent = orderNumber || "Your order";
    if (heading) heading.textContent = "Your order has been cancelled.";
    if (details) details.textContent = "Please check with our counter staff.";

    playCancelSound();
    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => toast.classList.remove("active"), 10000);
}

function startOrderTracking() {
    initAudio();
    syncBadgeFromStorage();

    const activeOrderId = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!activeOrderId) return;

    if (typeof activeOrderUnsubscribe === "function") {
        activeOrderUnsubscribe();
        activeOrderUnsubscribe = null;
    }

    const orderRef = ref(db, `orders/${activeOrderId}`);
    let isInitialFetch = true;

    activeOrderUnsubscribe = onValue(orderRef, (snapshot) => {
        if (!snapshot.exists()) {
            localStorage.removeItem(ACTIVE_ORDER_KEY);
            return;
        }

        const data = snapshot.val();
        const status = (data.status || "").toLowerCase().trim();
        const orderNum = data.orderNumber || data.orderId || "ONL Order";
        const isFinished = isReadyStatus(status) || status.includes("cancel");

        if (isInitialFetch) {
            isInitialFetch = false;
            lastKnownStatus = status;

            if (isReadyStatus(status) && !getSeenReadyOrders().includes(activeOrderId)) {
                localStorage.setItem(READY_PICKUP_KEY, activeOrderId);
                setAccountReadyBadge(true, 1);
            } else if (status.includes("cancel") && localStorage.getItem(READY_PICKUP_KEY) === activeOrderId) {
                clearAccountReadyBadge();
            }

            if (isFinished) {
                localStorage.removeItem(ACTIVE_ORDER_KEY);
            }
            return;
        }

        if (status === lastKnownStatus) {
            return;
        }

        if (status.includes("processing") || status.includes("process")) {
            showProcessingToast(orderNum);
        } else if (isReadyStatus(status)) {
            localStorage.setItem(READY_PICKUP_KEY, activeOrderId);
            setAccountReadyBadge(true, 1);
            showReadyToast(orderNum);
            localStorage.removeItem(ACTIVE_ORDER_KEY);
        } else if (status.includes("cancel")) {
            if (localStorage.getItem(READY_PICKUP_KEY) === activeOrderId) {
                clearAccountReadyBadge();
            }
            showCancelledToast(orderNum);
            localStorage.removeItem(ACTIVE_ORDER_KEY);
        }

        lastKnownStatus = status;
    });
}

function startLoggedInUserOrderTracking(user) {
    if (typeof userOrdersUnsubscribe === "function") {
        userOrdersUnsubscribe();
        userOrdersUnsubscribe = null;
    }
    knownUserOrderStatuses.clear();

    if (!user) return;

    const ordersRef = ref(db, "orders");
    let isInitialBatch = true;

    userOrdersUnsubscribe = onValue(ordersRef, (snapshot) => {
        if (!snapshot.exists()) return;

        const seenReadyIds = getSeenReadyOrders();
        const userEmail = (user.email || "").toLowerCase().trim();
        let unseenReadyCount = 0;
        let latestUnseenReadyId = null;

        Object.entries(snapshot.val()).forEach(([orderId, order]) => {
            if (!order) return;
            const matchesUser =
                order.userId === user.uid ||
                order.uid === user.uid ||
                order.customerId === user.uid ||
                (userEmail && (order.customerEmail || order.email || "").toLowerCase().trim() === userEmail);

            if (!matchesUser) return;

            const status = (order.status || "").toLowerCase().trim();
            const prevStatus = knownUserOrderStatuses.get(orderId);
            const orderNum = order.orderNumber || order.orderId || "ONL Order";

            if (isReadyStatus(status) && !seenReadyIds.includes(orderId)) {
                unseenReadyCount++;
                latestUnseenReadyId = orderId;
            }

            if (!isInitialBatch && prevStatus !== undefined && prevStatus !== status) {
                if (status.includes("processing") || status.includes("process")) {
                    showProcessingToast(orderNum);
                } else if (isReadyStatus(status)) {
                    localStorage.setItem(READY_PICKUP_KEY, orderId);
                    showReadyToast(orderNum);
                } else if (status.includes("cancel")) {
                    showCancelledToast(orderNum);
                }
            }

            knownUserOrderStatuses.set(orderId, status);
        });

        isInitialBatch = false;

        if (window.location.pathname.endsWith("customer-dashboard.html")) {
            clearAccountReadyBadge();
        } else if (unseenReadyCount > 0) {
            if (latestUnseenReadyId) {
                localStorage.setItem(READY_PICKUP_KEY, latestUnseenReadyId);
            }
            setAccountReadyBadge(true, unseenReadyCount);
        }
    });
}

window.trackCustomerOrder = function(orderId) {
    if (!orderId) return;
    localStorage.setItem(ACTIVE_ORDER_KEY, orderId);
    lastKnownStatus = "verifying payment";
    startOrderTracking();
};

document.addEventListener("DOMContentLoaded", () => {
    ensureBadgeElement();
    syncBadgeFromStorage();

    if (window.location.pathname.endsWith("customer-dashboard.html")) {
        clearAccountReadyBadge();
    }

    document.addEventListener("click", (e) => {
        if (e.target.closest("#accountLink") || e.target.closest("#navUserLink")) {
            clearAccountReadyBadge();
        }
    });

    onAuthStateChanged(auth, (user) => {
        setTimeout(() => {
            ensureBadgeElement();
            syncBadgeFromStorage();
        }, 50);
        startLoggedInUserOrderTracking(user);
    });

    startOrderTracking();
});