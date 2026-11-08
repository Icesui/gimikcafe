// GIMIK CAFE CUSTOMER DASHBOARD

import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// DOM element references
const welcomeMessage = document.getElementById("welcomeMessage");
const profileUsername = document.getElementById("profileUsername");
const profileFullName = document.getElementById("profileFullName");
const profileEmail = document.getElementById("profileEmail");
const profileContact = document.getElementById("profileContact");
const logoutButton = document.getElementById("logoutButton");
const currentOrdersList = document.getElementById("currentOrdersList");
const historyOrdersList = document.getElementById("historyOrdersList");

// Static empty state templates styled with Noto Serif
const EMPTY_CURRENT_ORDERS_HTML = `
    <div class="empty-orders-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; width: 100%; font-family: 'Noto Serif', serif;">
        <div style="font-size: 40px; color: #007074; margin-bottom: 12px;">
            <i class="fa-solid fa-receipt"></i>
        </div>
        <h3 style="font-size: 20px; font-weight: 700; color: #007074; margin-bottom: 6px; font-family: 'Noto Serif', serif;">No Current Orders</h3>
        <p style="font-size: 14px; color: #6a7f80; margin-bottom: 20px; font-family: 'Noto Serif', serif; font-style: italic;">Your active orders will appear here.</p>
        <a href="menu.html" style="background: #f7c35f; color: #004d4f; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; font-family: 'Noto Serif', serif;">Browse Menu</a>
    </div>
`;

const EMPTY_HISTORY_ORDERS_HTML = `
    <div class="empty-orders-state" style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px 20px; width: 100%; font-family: 'Noto Serif', serif;">
        <div style="font-size: 40px; color: #007074; margin-bottom: 12px;">
            <i class="fa-solid fa-box-open"></i>
        </div>
        <h3 style="font-size: 20px; font-weight: 700; color: #007074; margin-bottom: 6px; font-family: 'Noto Serif', serif;">No Order History</h3>
        <p style="font-size: 14px; color: #6a7f80; margin-bottom: 20px; font-family: 'Noto Serif', serif; font-style: italic;">Your completed orders will appear here.</p>
        <a href="menu.html" style="background: #f7c35f; color: #004d4f; padding: 10px 24px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; display: inline-block; font-family: 'Noto Serif', serif;">Start Shopping</a>
    </div>
`;

// Check user authentication state and attach realtime listener
onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "login.html";
        return;
    }

    try {
        const userRef = ref(database, `Users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            displayUser(snapshot.val(), user);
        } else {
            showBasicUserInfo(user);
        }

        listenCustomerOrders(user.uid);

    } catch (error) {
        console.error("Dashboard Error:", error);
    }
});

function displayUser(currentUser, firebaseUser) {
    const username = currentUser.username || "Customer";
    const fullName = currentUser.fullName || "-";
    const email = currentUser.email || firebaseUser.email || "-";
    const contactNumber = currentUser.contactNumber || "-";

    welcomeMessage.textContent = `Welcome, ${username}!`;
    profileUsername.textContent = username;
    profileFullName.textContent = fullName;
    profileEmail.textContent = email;
    profileContact.textContent = contactNumber;
}

function showBasicUserInfo(user) {
    welcomeMessage.textContent = "Welcome!";
    profileUsername.textContent = "-";
    profileFullName.textContent = "-";
    profileEmail.textContent = user.email || "-";
    profileContact.textContent = "-";
}

function formatCustomerStatus(rawStatus) {
    const s = String(rawStatus || "Verifying Payment").trim();
    const lower = s.toLowerCase();

    if (lower.includes("verifying") || lower.includes("pending")) {
        return "Verifying Payment";
    }
    if (lower.includes("process")) {
        return "Processing";
    }
    // Completed, For Pickup, and Ready show as Completed in Order History
    if (lower === "completed" || lower === "ready" || lower === "for pickup") {
        return "Completed";
    }
    if (lower.includes("cancel")) {
        return "Cancelled";
    }
    return s;
}

function listenCustomerOrders(uid) {
    const ordersRef = ref(database, "orders");

    onValue(ordersRef, (snapshot) => {
        if (!snapshot.exists()) {
            renderOrdersList([], currentOrdersList, EMPTY_CURRENT_ORDERS_HTML);
            renderOrdersList([], historyOrdersList, EMPTY_HISTORY_ORDERS_HTML);
            return;
        }

        const allOrders = snapshot.val();
        const activeOrders = [];
        const pastOrders = [];

        Object.keys(allOrders).forEach((key) => {
            const order = allOrders[key];
            const orderUid = order.userId || order.customerUid || order.uid;

            if (orderUid === uid) {
                order.key = key;
                const status = (order.status || "Verifying Payment").toLowerCase().trim();

                // COMPLETED, FOR PICKUP, READY, DELIVERED, and CANCELLED go into Order History
                const isFinished = 
                    status === "completed" || 
                    status === "ready" || 
                    status === "for pickup" || 
                    status === "delivered" || 
                    status === "cancelled";

                if (isFinished) {
                    pastOrders.push(order);
                } else {
                    // Only active stages (Verifying Payment & Processing) stay in Current Orders
                    activeOrders.push(order);
                }
            }
        });

        activeOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        pastOrders.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

        renderOrdersList(activeOrders, currentOrdersList, EMPTY_CURRENT_ORDERS_HTML);
        renderOrdersList(pastOrders, historyOrdersList, EMPTY_HISTORY_ORDERS_HTML);
    }, (error) => {
        console.error("Failed to listen to customer orders:", error);
    });
}

function renderOrdersList(orders, container, emptyHtml) {
    if (!container) return;

    if (!orders || orders.length === 0) {
        container.innerHTML = emptyHtml;
        return;
    }

    let html = "";
    orders.forEach((order) => {
        const rawStatus = order.status || "Verifying Payment";
        const displayStatus = formatCustomerStatus(rawStatus);
        const statusLower = displayStatus.toLowerCase();

        let statusClass = "status-pending";
        if (statusLower.includes("process")) {
            statusClass = "status-processing";
        } else if (statusLower === "completed") {
            statusClass = "status-completed";
        } else if (statusLower === "cancelled") {
            statusClass = "status-cancelled";
        }

        const total = order.total || order.totalAmount ? `₱${parseFloat(order.total || order.totalAmount).toFixed(2)}` : "₱0.00";
        const displayOrderNum = order.orderNumber || order.orderId || `#${(order.key || "").slice(-5).toUpperCase()}`;

        let itemsSummary = "";
        if (Array.isArray(order.items)) {
            itemsSummary = order.items.map(i => `${i.name || i.title} (x${i.quantity || 1})`).join(", ");
        } else if (typeof order.items === "object" && order.items !== null) {
            itemsSummary = Object.values(order.items).map(i => `${i.name || i.title} (x${i.quantity || 1})`).join(", ");
        } else {
            itemsSummary = "Assorted Gimik Items";
        }

        // Selected cancellation explanation
        let cancelNoteHTML = "";
        if (statusLower === "cancelled") {
            const explanation = order.cancelReason || "Order has been cancelled. 8 minute payment period has passed.";
            cancelNoteHTML = `
                <div class="order-cancel-note">
                    <i class="fa-solid fa-circle-exclamation"></i>
                    <span><strong>Note:</strong> ${escapeHTML(explanation)}</span>
                </div>
            `;
        }

        html += `
            <div class="order-entry">
                <div class="order-entry-header">
                    <span class="order-id">${escapeHTML(displayOrderNum)}</span>
                    <span class="order-status ${statusClass}">${escapeHTML(displayStatus)}</span>
                </div>
                <div class="order-entry-body">
                    <div class="order-entry-items">${escapeHTML(itemsSummary)}</div>
                    <div class="order-entry-total">${total}</div>
                </div>
                ${cancelNoteHTML}
            </div>
        `;
    });

    container.innerHTML = html;
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

if (logoutButton) {
    logoutButton.addEventListener("click", async () => {
        try {
            logoutButton.disabled = true;
            logoutButton.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
            await signOut(auth);
            window.location.href = "index.html";
        } catch (error) {
            console.error("Logout Error:", error);
            logoutButton.disabled = false;
            logoutButton.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
            alert("Logout failed. Please try again.");
        }
    });
}