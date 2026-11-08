// GIMIK CAFE - ADMIN CUSTOMER DIRECTORY SYSTEM

import { ref, onValue } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { db, adminReady } from "./admin.js";

// DOM references
const customersDateDisplay = document.getElementById("customersDate");
const statTotalCustomers = document.getElementById("totalCustomers");
const statRegisteredOnline = document.getElementById("registeredOnline");
const statMonthlyTotalSpend = document.getElementById("monthlyTotalSpend");
const statTodayTotalSpend = document.getElementById("todayTotalSpend");
const customerCountSubtitle = document.getElementById("customerCountSubtitle");

const customerSearch = document.getElementById("customerSearch");
const customerTableBody = document.getElementById("customerTableBody");
const customerEmpty = document.getElementById("customerEmpty");

// Modal references
const customerViewModal = document.getElementById("customerViewModal");
const closeCustomerModalBtn = document.getElementById("closeCustomerModal");
const closeCustomerDetailsBtn = document.getElementById("closeCustomerDetails");
const modalCustomerInitials = document.getElementById("modalCustomerInitials");
const modalCustomerName = document.getElementById("modalCustomerName");
const modalCustomerUsername = document.getElementById("modalCustomerUsername");
const modalCustomerType = document.getElementById("modalCustomerType");
const modalCustomerEmail = document.getElementById("modalCustomerEmail");
const modalCustomerContact = document.getElementById("modalCustomerContact");
const modalCustomerOrders = document.getElementById("modalCustomerOrders");
const modalCustomerJoined = document.getElementById("modalCustomerJoined");
const modalCustomerId = document.getElementById("modalCustomerId");

// State caches
let usersData = {};
let ordersData = [];
let customerList = [];

function initCustomers() {
    updateDateDisplay();
    initModalEvents();
    listenToCustomerData();
}

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initCustomers).catch((err) => {
        console.warn("adminReady warning, initializing directly:", err);
        initCustomers();
    });
} else {
    document.addEventListener("DOMContentLoaded", initCustomers);
}

function updateDateDisplay() {
    if (!customersDateDisplay) return;
    const now = new Date();
    customersDateDisplay.textContent = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

function listenToCustomerData() {
    const usersRef = ref(db, "Users");
    const ordersRef = ref(db, "orders");

    // Listen to registered users
    onValue(usersRef, (snapshot) => {
        usersData = snapshot.exists() ? snapshot.val() : {};
        rebuildCustomerList();
    }, (error) => {
        console.error("Users listener error:", error);
    });

    // Listen to orders to count purchases & capture POS walk-ins
    onValue(ordersRef, (snapshot) => {
        ordersData = [];
        if (snapshot.exists()) {
            ordersData = Object.entries(snapshot.val()).map(([id, order]) => ({
                id,
                ...(order || {})
            }));
        }
        rebuildCustomerList();
    }, (error) => {
        console.error("Orders listener error:", error);
    });
}

function rebuildCustomerList() {
    const customersMap = new Map();

    // 1. Ingest registered users from Firebase /Users
    Object.entries(usersData).forEach(([uid, u]) => {
        // Skip administrative staff from appearing in customer list
        const role = String(u.role || "").toLowerCase().replace(/[\s_]/g, "");
        if (role === "admin" || role === "superadmin" || role === "owner" || role === "barista") {
            return;
        }

        const name = u.fullName || u.fullname || u.name || u.username || "Registered Customer";
        const email = u.email || "-";
        const contact = u.contactNumber || u.contact || "-";
        const username = u.username || "";
        const createdAt = u.createdAt || null;

        customersMap.set(uid, {
            id: uid,
            name,
            username,
            email,
            contact,
            type: "Online Account",
            totalOrders: 0,
            totalSpend: 0,
            createdAt: createdAt,
            isOnline: true
        });
    });

    // 2. Map orders to registered users or record walk-in customers
    ordersData.forEach((order) => {
        const orderUid = order.userId || order.customerUid || order.uid;
        const total = parseFloat(order.totalAmount || order.total || 0) || 0;
        const isCancelled = String(order.status || "").toLowerCase().includes("cancel");

        if (orderUid && customersMap.has(orderUid)) {
            const cust = customersMap.get(orderUid);
            cust.totalOrders++;
            if (!isCancelled) cust.totalSpend += total;
        } else {
            // Group walk-in or guest orders by phone or customer name
            const guestName = order.customerName || order.nickname || "Walk-in Guest";
            const guestContact = order.contactNumber || order.contact || "-";
            const guestKey = `guest_${guestName}_${guestContact}`;

            if (!customersMap.has(guestKey)) {
                customersMap.set(guestKey, {
                    id: guestKey,
                    name: guestName,
                    username: "Walk-in",
                    email: order.email || "—",
                    contact: guestContact,
                    type: "POS Walk-in",
                    totalOrders: 1,
                    totalSpend: isCancelled ? 0 : total,
                    createdAt: order.createdAt || null,
                    isOnline: false
                });
            } else {
                const guest = customersMap.get(guestKey);
                guest.totalOrders++;
                if (!isCancelled) guest.totalSpend += total;
            }
        }
    });

    customerList = Array.from(customersMap.values());
    updateStatistics();
    renderCustomerTable();
}

function updateStatistics() {
    const total = customerList.length;
    const registered = customerList.filter(c => c.isOnline).length;

    // Calculate revenue totals
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth();
    const currentDate = now.getDate();

    let todaySpend = 0;
    let monthlySpend = 0;

    ordersData.forEach((order) => {
        const isCancelled = String(order.status || "").toLowerCase().includes("cancel");
        if (isCancelled) return;

        const total = parseFloat(order.totalAmount || order.total || 0) || 0;
        const d = order.createdAt ? new Date(order.createdAt) : null;

        if (d && !isNaN(d.getTime())) {
            if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
                monthlySpend += total;
                if (d.getDate() === currentDate) {
                    todaySpend += total;
                }
            }
        }
    });

    if (statTotalCustomers) statTotalCustomers.textContent = total;
    if (statRegisteredOnline) statRegisteredOnline.textContent = registered;
    if (statMonthlyTotalSpend) statMonthlyTotalSpend.textContent = formatPeso(monthlySpend);
    if (statTodayTotalSpend) statTodayTotalSpend.textContent = formatPeso(todaySpend);

    if (customerCountSubtitle) {
        customerCountSubtitle.textContent = `${total} registered contacts & POS buyers`;
    }
}

function renderCustomerTable() {
    if (!customerTableBody) return;
    customerTableBody.innerHTML = "";

    const searchTerm = (customerSearch?.value || "").trim().toLowerCase();

    const filtered = customerList.filter((c) => {
        if (!searchTerm) return true;
        const name = (c.name || "").toLowerCase();
        const username = (c.username || "").toLowerCase();
        const email = (c.email || "").toLowerCase();
        const contact = (c.contact || "").toLowerCase();

        return name.includes(searchTerm) || username.includes(searchTerm) || email.includes(searchTerm) || contact.includes(searchTerm);
    });

    if (filtered.length === 0) {
        if (customerEmpty) customerEmpty.style.display = "block";
        return;
    }

    if (customerEmpty) customerEmpty.style.display = "none";

    filtered.forEach((cust) => {
        const row = document.createElement("tr");
        row.className = "clickable-customer-row";

        const initial = (cust.name || "C").trim().charAt(0).toUpperCase();
        const typeBadgeClass = cust.isOnline ? "online" : "pos";

        row.innerHTML = `
            <td>
                <div class="customer-cell">
                    <div class="customer-avatar">${escapeHTML(initial)}</div>
                    <div class="customer-name-group">
                        <strong>${escapeHTML(cust.name)}</strong>
                        <span>${escapeHTML(cust.username ? `@${cust.username}` : cust.type)}</span>
                    </div>
                </div>
            </td>
            <td>
                <span class="customer-type-badge ${typeBadgeClass}">
                    ${escapeHTML(cust.type)}
                </span>
            </td>
            <td>${escapeHTML(cust.email)}</td>
            <td>${escapeHTML(cust.contact)}</td>
            <td><strong>${cust.totalOrders} ${cust.totalOrders === 1 ? 'order' : 'orders'}</strong></td>
        `;

        row.addEventListener("click", () => openCustomerModal(cust));
        customerTableBody.appendChild(row);
    });
}

function openCustomerModal(cust) {
    if (!customerViewModal) return;

    if (modalCustomerInitials) modalCustomerInitials.textContent = (cust.name || "C").trim().charAt(0).toUpperCase();
    if (modalCustomerName) modalCustomerName.textContent = cust.name;
    if (modalCustomerUsername) modalCustomerUsername.textContent = cust.username ? `@${cust.username}` : cust.type;

    if (modalCustomerType) {
        modalCustomerType.textContent = cust.type;
        modalCustomerType.className = `customer-type-badge ${cust.isOnline ? 'online' : 'pos'}`;
    }

    if (modalCustomerEmail) modalCustomerEmail.textContent = cust.email || "—";
    if (modalCustomerContact) modalCustomerContact.textContent = cust.contact || "—";
    if (modalCustomerOrders) modalCustomerOrders.textContent = `${cust.totalOrders} completed (${formatPeso(cust.totalSpend)})`;

    if (modalCustomerJoined) {
        if (cust.createdAt) {
            const d = new Date(cust.createdAt);
            modalCustomerJoined.textContent = !isNaN(d.getTime()) ? d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
        } else {
            modalCustomerJoined.textContent = "—";
        }
    }

    if (modalCustomerId) {
        modalCustomerId.textContent = cust.id.startsWith("guest_") ? "Walk-in Guest" : cust.id;
    }

    customerViewModal.style.display = "flex";
    document.body.classList.add("modal-open");
}

function closeCustomerModal() {
    if (customerViewModal) customerViewModal.style.display = "none";
    document.body.classList.remove("modal-open");
}

function initModalEvents() {
    if (closeCustomerModalBtn) closeCustomerModalBtn.addEventListener("click", closeCustomerModal);
    if (closeCustomerDetailsBtn) closeCustomerDetailsBtn.addEventListener("click", closeCustomerModal);

    const overlay = customerViewModal?.querySelector(".customer-modal-overlay");
    if (overlay) overlay.addEventListener("click", closeCustomerModal);

    if (customerSearch) {
        customerSearch.addEventListener("input", renderCustomerTable);
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") closeCustomerModal();
    });
}

function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(amount || 0);
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}