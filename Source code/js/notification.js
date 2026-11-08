// GIMIK CAFE - CUSTOMER ORDER STATUS NOTIFICATIONS

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { database as db } from "./firebase-config.js";

const ACTIVE_ORDER_KEY = "gimik_active_order_id";
let toastTimeout = null;

let coinAudio = null;
let cancelAudio = null;
let isAudioUnlocked = false;
let activeOrderUnsubscribe = null;
let lastKnownStatus = null;

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

    const activeOrderId = localStorage.getItem(ACTIVE_ORDER_KEY);
    if (!activeOrderId) return;

    // Unsubscribe from any previously attached listener to prevent duplicate triggers
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

        const isFinished = status === "completed" || status === "ready" || status === "for pickup" || status.includes("cancel");

        // 1. Silent Initialization on Page Load:
        // Record existing state without firing audio or showing toasts on fresh navigation/refresh
        if (isInitialFetch) {
            isInitialFetch = false;
            lastKnownStatus = status;

            // If already complete or cancelled prior to page load, clean up localStorage
            if (isFinished) {
                localStorage.removeItem(ACTIVE_ORDER_KEY);
            }
            return;
        }

        // 2. Only notify when there is an actual live transition
        if (status === lastKnownStatus) {
            return;
        }

        if (status.includes("processing") || status.includes("process")) {
            showProcessingToast(orderNum);
        } else if (status === "completed" || status === "ready" || status === "for pickup") {
            showReadyToast(orderNum);
            localStorage.removeItem(ACTIVE_ORDER_KEY);
        } else if (status.includes("cancel")) {
            showCancelledToast(orderNum);
            localStorage.removeItem(ACTIVE_ORDER_KEY);
        }

        lastKnownStatus = status;
    });
}

window.trackCustomerOrder = function(orderId) {
    if (!orderId) return;
    localStorage.setItem(ACTIVE_ORDER_KEY, orderId);
    lastKnownStatus = "verifying payment";
    startOrderTracking();
};

document.addEventListener("DOMContentLoaded", startOrderTracking);