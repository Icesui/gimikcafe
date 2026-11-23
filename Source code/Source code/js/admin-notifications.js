// GIMIK CAFE - DEDICATED ADMIN REALTIME NOTIFICATIONS (FOR ALL ADMIN PAGES)

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { db } from "./admin.js";

const PAGE_LOAD_TIME = Date.now();
let isInitialLoad = true;
let knownOrderIds = new Set();
let toastTimeout = null;

let audioEl = null;
let isAudioUnlocked = false;

function initAdminAudio() {
    if (!audioEl) {
        audioEl = document.createElement("audio");
        audioEl.id = "globalAdminNotificationAudio";
        audioEl.preload = "auto";
        audioEl.volume = 0.25;
        audioEl.innerHTML = `
            <source src="../Asset/mariocoinsound.mp3" type="audio/mpeg">
            <source src="Asset/mariocoinsound.mp3" type="audio/mpeg">
        `;
        document.body.appendChild(audioEl);
    }

    // Truly silent unlock: mute during initial gesture play, then restore
    const unlock = () => {
        if (!isAudioUnlocked && audioEl) {
            audioEl.muted = true;
            audioEl.play().then(() => {
                audioEl.pause();
                audioEl.currentTime = 0;
                audioEl.muted = false;
                isAudioUnlocked = true;
            }).catch(() => {
                audioEl.muted = false;
            });
        }
    };

    window.addEventListener("click", unlock, { once: true });
    window.addEventListener("keydown", unlock, { once: true });
    window.addEventListener("touchstart", unlock, { once: true });
}

function playSynthesizedCoin() {
    try {
        const ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (ctx.state === "suspended") ctx.resume();
        const now = ctx.currentTime;

        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.frequency.setValueAtTime(987.77, now);
        gain1.gain.setValueAtTime(0.06, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.1);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = "sine";
        osc2.frequency.setValueAtTime(1318.51, now + 0.08);
        gain2.gain.setValueAtTime(0.06, now + 0.08);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.08);
        osc2.stop(now + 0.45);
    } catch (e) {}
}

function playCoinSound() {
    if (audioEl) {
        audioEl.muted = false;
        audioEl.volume = 0.25;
        audioEl.currentTime = 0;
        audioEl.play().catch(() => playSynthesizedCoin());
    } else {
        playSynthesizedCoin();
    }
}

function ensureAdminToast() {
    let toast = document.getElementById("globalAdminOrderToast");
    if (!toast) {
        toast = document.createElement("div");
        toast.id = "globalAdminOrderToast";
        toast.className = "global-admin-toast";
        toast.setAttribute("aria-live", "polite");
        toast.innerHTML = `
            <div class="admin-toast-icon">
                <i class="fa-solid fa-bell"></i>
            </div>
            <div class="admin-toast-content">
                <div class="admin-toast-top">
                    <span class="admin-toast-tag">New Online Order</span>
                    <span class="admin-toast-number" id="globalToastOrderNum">ONL #00000</span>
                </div>
                <strong class="admin-toast-customer" id="globalToastCustomer">Customer Name</strong>
                <p class="admin-toast-details" id="globalToastDetails">1 item • ₱0.00</p>
            </div>
            <div class="admin-toast-actions">
                <a href="orders.html" class="admin-toast-btn view" title="View in Orders">
                    <i class="fa-solid fa-arrow-up-right-from-square"></i>
                </a>
                <button type="button" class="admin-toast-btn dismiss" id="dismissGlobalAdminToast" title="Dismiss">
                    <i class="fa-solid fa-xmark"></i>
                </button>
            </div>
        `;
        document.body.appendChild(toast);

        document.getElementById("dismissGlobalAdminToast")?.addEventListener("click", () => {
            toast.classList.remove("active");
            if (toastTimeout) clearTimeout(toastTimeout);
        });
    }
    return toast;
}

function showAdminToast(order) {
    const toast = ensureAdminToast();

    const orderNum = order.orderNumber || order.orderId || `#${(order.id || "").slice(-5).toUpperCase()}`;
    const customer = order.customerName || order.nickname || "Online Customer";
    const totalAmount = formatPeso(order.grandTotal || order.finalTotal || order.totalAmount || order.total || 0);

    const itemsCount = Array.isArray(order.items)
        ? order.items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0)
        : 1;

    const numEl = document.getElementById("globalToastOrderNum");
    const custEl = document.getElementById("globalToastCustomer");
    const detEl = document.getElementById("globalToastDetails");

    if (numEl) numEl.textContent = orderNum;
    if (custEl) custEl.textContent = customer;
    if (detEl) detEl.textContent = `${itemsCount} ${itemsCount === 1 ? 'item' : 'items'} • ${totalAmount}`;

    playCoinSound();
    toast.classList.add("active");

    if (toastTimeout) clearTimeout(toastTimeout);
    toastTimeout = setTimeout(() => {
        toast.classList.remove("active");
    }, 10000);
}

function listenToGlobalOrders() {
    const ordersRef = ref(db, "orders");

    onValue(ordersRef, (snapshot) => {
        if (!snapshot.exists()) {
            isInitialLoad = false;
            return;
        }

        const data = snapshot.val();
        const currentIds = new Set();
        let incomingOnlineOrder = null;

        Object.entries(data).forEach(([id, item]) => {
            currentIds.add(id);

            // 1. Never ring on page load for historical/existing orders
            // 2. Only detect genuinely newly created orders (created after this page session started)
            if (!isInitialLoad && !knownOrderIds.has(id)) {
                const orderTime = Number(item?.createdAt) || 0;
                const status = (item?.status || "Verifying Payment").toLowerCase().trim();
                const source = (item?.source || "").toLowerCase().trim();
                const orderNum = String(item?.orderNumber || item?.orderId || "").toUpperCase().trim();

                const isOnline = source === "online" || orderNum.startsWith("ONL") || source !== "pos";
                const isRecent = orderTime >= (PAGE_LOAD_TIME - 5000); // Created right around or after page load

                if ((status.includes("verifying") || status.includes("pending")) && isOnline && isRecent) {
                    incomingOnlineOrder = { id, ...(item || {}) };
                }
            }
        });

        knownOrderIds = currentIds;

        if (incomingOnlineOrder) {
            showAdminToast(incomingOnlineOrder);
        }

        isInitialLoad = false;
    });
}

function formatPeso(amount) {
    const num = parseFloat(String(amount).replace(/[^0-9.]/g, "")) || 0;
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(num);
}

initAdminAudio();
listenToGlobalOrders();