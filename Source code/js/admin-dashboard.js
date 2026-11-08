// =========================================================
//            GIMIK CAFE - ADMIN DASHBOARD SYSTEM
// =========================================================

import { db, adminReady } from "./admin.js";
import {
    ref,
    onValue
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// DOM references
const dashboardDate = document.getElementById("dashboardDate");
const todaySalesEl = document.getElementById("todaySales");
const todayOrdersEl = document.getElementById("todayOrders");
const todayStaffOnDutyEl = document.getElementById("todayStaffOnDuty");
const inventoryAlertsContainer = document.getElementById("inventoryAlertsContainer");
const inventoryAlertSubtitle = document.getElementById("inventoryAlertSubtitle");
const liveOrdersContainer = document.getElementById("liveOrdersContainer");

// Runtime caches
let cachedOrders = [];
let cachedInventory = [];
let cachedStaff = [];

// Initialization
const initDashboard = () => {
    updateDashboardDate();
    listenToTodayMetrics();
    listenToInventoryAlerts();
    listenToStaffAttendance();
};

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initDashboard).catch(initDashboard);
} else {
    initDashboard();
}

function updateDashboardDate() {
    if (!dashboardDate) return;
    const now = new Date();
    dashboardDate.textContent = now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// 1. LISTEN TO ORDERS & SALES METRICS
function listenToTodayMetrics() {
    const ordersRef = ref(db, "orders");

    onValue(ordersRef, (snapshot) => {
        if (!snapshot.exists()) {
            cachedOrders = [];
            renderOrdersSummary([]);
            renderLiveOrders([]);
            return;
        }

        const data = snapshot.val();
        const ordersList = Object.entries(data).map(([id, val]) => ({
            id,
            ...val
        }));

        cachedOrders = ordersList;
        renderOrdersSummary(ordersList);
        renderLiveOrders(ordersList);
    }, (error) => {
        console.error("Dashboard orders listener error:", error);
    });
}

function renderOrdersSummary(orders) {
    const today = new Date();
    const todayYear = today.getFullYear();
    const todayMonth = today.getMonth();
    const todayDate = today.getDate();

    let totalRevenue = 0;
    let totalCount = 0;

    orders.forEach((order) => {
        const orderTime = order.createdAt ? new Date(order.createdAt) : null;
        const isToday = orderTime &&
            orderTime.getFullYear() === todayYear &&
            orderTime.getMonth() === todayMonth &&
            orderTime.getDate() === todayDate;

        if (isToday) {
            const status = String(order.status || "").toLowerCase().trim();
            // Don't count cancelled orders in revenue
            if (!status.includes("cancel")) {
                const total = parseFloat(order.totalAmount || order.total || order.grandTotal || 0);
                totalRevenue += isNaN(total) ? 0 : total;
                totalCount++;
            }
        }
    });

    if (todaySalesEl) {
        todaySalesEl.textContent = `₱${totalRevenue.toLocaleString("en-PH", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        })}`;
    }

    if (todayOrdersEl) {
        todayOrdersEl.textContent = totalCount;
    }
}

function renderLiveOrders(orders) {
    if (!liveOrdersContainer) return;

    if (!orders || orders.length === 0) {
        liveOrdersContainer.innerHTML = `
            <div class="live-order-placeholder">
                <i class="fa-solid fa-receipt"></i>
                <span>No recent orders recorded yet today.</span>
            </div>
        `;
        return;
    }

    // Sort newest first
    const sorted = [...orders].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 5);

    let html = "";
    sorted.forEach((order) => {
        const customerName = order.customerName || order.fullName || order.username || "Walk-in Guest";
        const initial = customerName.charAt(0).toUpperCase();
        const total = parseFloat(order.totalAmount || order.total || 0).toFixed(2);
        const orderNum = order.orderNumber || `#${order.id.slice(-5).toUpperCase()}`;
        const status = order.status || "Pending";
        const statusLower = status.toLowerCase();

        let badgeClass = "pending";
        if (statusLower.includes("complete") || statusLower.includes("ready")) badgeClass = "completed";
        else if (statusLower.includes("process")) badgeClass = "preparing";
        else if (statusLower.includes("cancel")) badgeClass = "cancelled";

        html += `
            <div class="live-order-row">
                <div class="live-order-primary">
                    <div class="live-order-avatar">${escapeHTML(initial)}</div>
                    <div class="live-order-info">
                        <strong>${escapeHTML(customerName)}</strong>
                        <span>${escapeHTML(orderNum)} • ${formatOrderTime(order.createdAt)}</span>
                    </div>
                </div>
                <div class="live-order-meta">
                    <span class="live-order-amount">₱${total}</span>
                    <span class="live-order-badge ${badgeClass}">${escapeHTML(status)}</span>
                </div>
            </div>
        `;
    });

    liveOrdersContainer.innerHTML = html;
}

// 2. LISTEN TO INVENTORY ALERTS
function listenToInventoryAlerts() {
    const inventoryRef = ref(db, "inventory");

    onValue(inventoryRef, (snapshot) => {
        if (!snapshot.exists()) {
            cachedInventory = [];
            renderInventoryAlerts([]);
            return;
        }

        const data = snapshot.val();
        const items = Object.entries(data).map(([id, val]) => ({
            id,
            ...val
        }));

        cachedInventory = items;
        renderInventoryAlerts(items);
    }, (error) => {
        console.error("Dashboard inventory error:", error);
    });
}

function renderInventoryAlerts(items) {
    if (!inventoryAlertsContainer) return;

    const alertItems = [];

    items.forEach((item) => {
        const stock = Number(item.stock) || 0;
        const min = Number(item.minimumStock) || 0;

        if (stock <= 0) {
            alertItems.push({ ...item, alertType: "out", stock });
        } else if (stock <= min) {
            alertItems.push({ ...item, alertType: "low", stock });
        }
    });

    if (alertItems.length === 0) {
        if (inventoryAlertSubtitle) inventoryAlertSubtitle.textContent = "All stock levels are optimal";
        inventoryAlertsContainer.innerHTML = `
            <div class="inventory-good-state">
                <i class="fa-solid fa-circle-check"></i>
                <div>
                    <strong>Stock levels optimal</strong>
                    <span>No items are currently low or depleted.</span>
                </div>
            </div>
        `;
        return;
    }

    if (inventoryAlertSubtitle) {
        inventoryAlertSubtitle.textContent = `${alertItems.length} item(s) need immediate restocking`;
    }

    let html = "";
    alertItems.slice(0, 5).forEach((item) => {
        const isOut = item.alertType === "out";
        const unit = item.unit || "unit";
        const alertClass = isOut ? "" : "is-low";
        const icon = isOut ? "fa-solid fa-circle-exclamation" : "fa-solid fa-triangle-exclamation";
        const message = isOut 
            ? "Out of stock (0 remaining)" 
            : `Low stock (${item.stock} ${unit} left)`;

        html += `
            <div class="inventory-alert-item ${alertClass}">
                <div class="inventory-alert-icon">
                    <i class="${icon}"></i>
                </div>
                <div class="inventory-alert-info">
                    <strong>${escapeHTML(item.name || "Item")}</strong>
                    <span>${message}</span>
                </div>
            </div>
        `;
    });

    inventoryAlertsContainer.innerHTML = html;
}

// 3. LISTEN TO STAFF ATTENDANCE
function listenToStaffAttendance() {
    const attendanceRef = ref(db, "attendance");

    onValue(attendanceRef, (snapshot) => {
        if (!snapshot.exists()) {
            if (todayStaffOnDutyEl) todayStaffOnDutyEl.textContent = "0 Active";
            return;
        }

        const data = snapshot.val();
        const records = Object.values(data);

        // Count how many staff members are on-duty or working
        let activeCount = 0;
        records.forEach((staff) => {
            const status = String(staff.status || "").toLowerCase();
            if (status === "working" || status === "on-duty" || status === "on duty") {
                activeCount++;
            }
        });

        if (todayStaffOnDutyEl) {
            todayStaffOnDutyEl.textContent = `${activeCount} Active`;
        }
    }, (error) => {
        console.error("Dashboard attendance error:", error);
    });
}

// Helpers
function formatOrderTime(timestamp) {
    if (!timestamp) return "Just now";
    const d = new Date(timestamp);
    if (isNaN(d.getTime())) return "Just now";
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}