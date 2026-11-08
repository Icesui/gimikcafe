// Firebase Realtime Database imports
import { 
    ref, 
    onValue,
    update,
    set
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { db, adminReady } from "./admin.js";

// DOM references
const historyDateDisplay = document.getElementById("historyDate");
const statHistoryTotal = document.getElementById("statHistoryTotal");
const statHistoryCompleted = document.getElementById("statHistoryCompleted");
const statHistoryCancelled = document.getElementById("statHistoryCancelled");

const historySearchInput = document.getElementById("historySearchInput");
const historyStatusFilter = document.getElementById("historyStatusFilter");
const historyDateFilter = document.getElementById("historyDateFilter");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const openClearHistoryModalBtn = document.getElementById("openClearHistoryModalBtn");

const historyTableBody = document.getElementById("historyTableBody");
const historyPaginationInfo = document.getElementById("historyPaginationInfo");
const historyPaginationControls = document.getElementById("historyPaginationControls");

// Order details modal references
const historyDetailsModal = document.getElementById("historyDetailsModal");
const closeDetailsModalBtn = document.getElementById("closeDetailsModal");
const modalOrderNumber = document.getElementById("modalOrderNumber");
const modalCustomerName = document.getElementById("modalCustomerName");
const modalOrderDate = document.getElementById("modalOrderDate");
const modalPaymentMethod = document.getElementById("modalPaymentMethod");
const modalStatusBadge = document.getElementById("modalStatusBadge");
const modalItemsList = document.getElementById("modalItemsList");
const modalTotalAmount = document.getElementById("modalTotalAmount");

// Clear history confirmation modal references
const clearHistoryModal = document.getElementById("clearHistoryModal");
const clearHistoryOverlay = document.getElementById("clearHistoryOverlay");
const cancelClearHistoryBtn = document.getElementById("cancelClearHistoryBtn");
const confirmClearHistoryBtn = document.getElementById("confirmClearHistoryBtn");

// State cache
let allHistoryOrders = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 20;

// System initialization
const initHistory = () => {
    updateDateDisplay();
    initModalEvents();
    initClearHistoryModal();
    initFilterEvents();
    listenToOrderHistory();
};

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initHistory).catch((err) => {
        console.warn("adminReady warning, initializing directly:", err);
        initHistory();
    });
} else {
    initHistory();
}

function updateDateDisplay() {
    if (!historyDateDisplay) return;
    const now = new Date();
    historyDateDisplay.textContent = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// Real-time Firebase listener
function listenToOrderHistory() {
    const ordersRef = ref(db, "orders");

    onValue(ordersRef, (snapshot) => {
        allHistoryOrders = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            allHistoryOrders = Object.entries(data)
                .map(([id, item]) => ({ id, ...item }))
                .filter(order => {
                    const s = (order.status || "").toLowerCase();
                    return s === "completed" || s === "cancelled";
                })
                .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        }

        updateSummaryCards();
        currentPage = 1;
        renderHistoryTable();
    }, (error) => {
        console.error("History fetch error:", error);
        if (historyTableBody) {
            historyTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align:center; padding:30px; color:#a45c55;">
                        Failed to load order history: ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    });
}

// Summary cards update
function updateSummaryCards() {
    let total = allHistoryOrders.length;
    let completed = 0;
    let cancelled = 0;

    allHistoryOrders.forEach((o) => {
        const s = (o.status || "").toLowerCase();
        if (s === "completed") completed++;
        else if (s === "cancelled") cancelled++;
    });

    if (statHistoryTotal) statHistoryTotal.textContent = total;
    if (statHistoryCompleted) statHistoryCompleted.textContent = completed;
    if (statHistoryCancelled) statHistoryCancelled.textContent = cancelled;
}

// Order filtering
function getFilteredOrders() {
    const searchTerm = historySearchInput ? historySearchInput.value.trim().toLowerCase() : "";
    const filterStatus = historyStatusFilter ? historyStatusFilter.value : "All";
    const filterDate = historyDateFilter ? historyDateFilter.value : "All";

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    return allHistoryOrders.filter((order) => {
        const orderNum = (order.orderNumber || "").toLowerCase();
        const customer = (order.customerName || "").toLowerCase();
        const items = Array.isArray(order.items) 
            ? order.items.map(i => (i.name || "").toLowerCase()).join(" ") 
            : "";

        const matchesSearch = orderNum.includes(searchTerm) || customer.includes(searchTerm) || items.includes(searchTerm);
        const matchesStatus = filterStatus === "All" || (order.status || "").toLowerCase() === filterStatus.toLowerCase();

        let matchesDate = true;
        const orderTime = Number(order.createdAt) || 0;

        if (filterDate === "Today") {
            matchesDate = orderTime >= startOfToday;
        } else if (filterDate === "Weekly" || filterDate === "This Week") {
            matchesDate = orderTime >= startOfWeek;
        } else if (filterDate === "Monthly" || filterDate === "This Month") {
            matchesDate = orderTime >= startOfMonth;
        } else if (filterDate === "Yearly") {
            matchesDate = orderTime >= startOfYear;
        }

        return matchesSearch && matchesStatus && matchesDate;
    });
}

// Table rendering
function renderHistoryTable() {
    if (!historyTableBody) return;
    historyTableBody.innerHTML = "";

    const filtered = getFilteredOrders();
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / ITEMS_PER_PAGE) || 1;

    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = Math.min(startIndex + ITEMS_PER_PAGE, totalItems);
    const paginatedOrders = filtered.slice(startIndex, endIndex);

    if (totalItems === 0) {
        historyTableBody.innerHTML = `
            <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: #8a999a;">
                    No order history records found.
                </td>
            </tr>
        `;
        renderPagination(0, 0, 0, 1);
        return;
    }

    paginatedOrders.forEach((order) => {
        const row = document.createElement("tr");
        row.className = "clickable-history-row";

        const orderNum = order.orderNumber || `#${order.id.slice(-5).toUpperCase()}`;
        const customer = order.customerName || "Walk-in Customer";
        const initial = customer.charAt(0).toUpperCase();

        const count = Array.isArray(order.items)
            ? order.items.reduce((sum, item) => sum + (item.quantity || 1), 0)
            : 0;

        const totalAmount = Number(order.total) || 0;
        const status = order.status || "Completed";
        const statusClass = status.toLowerCase();

        const badgeIcon = statusClass === "completed" 
            ? '<i class="fa-solid fa-circle-check"></i>' 
            : '<i class="fa-solid fa-ban"></i>';

        const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
        const dateStr = dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const timeStr = dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

        row.innerHTML = `
            <td>
                <strong class="order-number">${escapeHTML(orderNum)}</strong>
            </td>
            <td>
                <div class="customer-cell">
                    <div class="customer-avatar">${initial}</div>
                    <div>
                        <strong>${escapeHTML(customer)}</strong>
                        <span>${escapeHTML(order.paymentMethod || "Cash")}</span>
                    </div>
                </div>
            </td>
            <td>
                <div class="date-cell">
                    <strong>${escapeHTML(dateStr)}</strong>
                    <span>${escapeHTML(timeStr)}</span>
                </div>
            </td>
            <td>${count} ${count === 1 ? "item" : "items"}</td>
            <td>
                <strong class="order-total">${formatPeso(totalAmount)}</strong>
            </td>
            <td>
                <span class="status-badge ${statusClass}">
                    ${badgeIcon}
                    ${escapeHTML(status)}
                </span>
            </td>
        `;

        row.addEventListener("click", () => {
            openOrderDetails(order);
        });

        historyTableBody.appendChild(row);
    });

    renderPagination(startIndex + 1, endIndex, totalItems, totalPages);
}

// Pagination controls
function renderPagination(start, end, total, totalPages) {
    if (historyPaginationInfo) {
        historyPaginationInfo.textContent = total > 0 
            ? `Showing ${start}–${end} of ${total} orders`
            : `Showing 0 orders`;
    }

    if (!historyPaginationControls) return;
    historyPaginationControls.innerHTML = "";

    if (total === 0) return;

    // Previous page button
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.innerHTML = `<i class="fa-solid fa-chevron-left"></i>`;
    prevBtn.disabled = currentPage === 1;
    prevBtn.addEventListener("click", () => {
        if (currentPage > 1) {
            currentPage--;
            renderHistoryTable();
        }
    });
    historyPaginationControls.appendChild(prevBtn);

    // Numbered page buttons
    for (let i = 1; i <= totalPages; i++) {
        if (i === 1 || i === totalPages || (i >= currentPage - 1 && i <= currentPage + 1)) {
            const pageBtn = document.createElement("button");
            pageBtn.type = "button";
            pageBtn.textContent = i;
            if (i === currentPage) pageBtn.classList.add("active");

            pageBtn.addEventListener("click", () => {
                currentPage = i;
                renderHistoryTable();
            });
            historyPaginationControls.appendChild(pageBtn);
        } else if (
            (i === currentPage - 2 && i > 1) ||
            (i === currentPage + 2 && i < totalPages)
        ) {
            const ellipsis = document.createElement("span");
            ellipsis.textContent = "...";
            historyPaginationControls.appendChild(ellipsis);
        }
    }

    // Next page button
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.innerHTML = `<i class="fa-solid fa-chevron-right"></i>`;
    nextBtn.disabled = currentPage === totalPages;
    nextBtn.addEventListener("click", () => {
        if (currentPage < totalPages) {
            currentPage++;
            renderHistoryTable();
        }
    });
    historyPaginationControls.appendChild(nextBtn);
}

// Order details modal dialog
function openOrderDetails(order) {
    if (!historyDetailsModal) return;

    modalOrderNumber.textContent = order.orderNumber || `#${order.id.slice(-5).toUpperCase()}`;
    modalCustomerName.textContent = order.customerName || "Walk-in Customer";
    modalPaymentMethod.textContent = order.paymentMethod || "Cash";

    const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
    modalOrderDate.textContent = dateObj.toLocaleString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit"
    });

    const status = order.status || "Completed";
    const statusClass = status.toLowerCase();
    modalStatusBadge.className = `status-badge ${statusClass}`;
    modalStatusBadge.innerHTML = statusClass === "completed" 
        ? `<i class="fa-solid fa-circle-check"></i> ${escapeHTML(status)}`
        : `<i class="fa-solid fa-ban"></i> ${escapeHTML(status)}`;

    modalItemsList.innerHTML = "";
    if (Array.isArray(order.items) && order.items.length > 0) {
        order.items.forEach((item) => {
            const itemRow = document.createElement("div");
            itemRow.className = "modal-item-row";

            const sizeLabel = item.size ? ` • ${item.size}` : "";
            const qty = item.quantity || 1;
            const singlePrice = Number(item.price) || 0;
            const itemTotal = Number(item.total) || singlePrice * qty;

            itemRow.innerHTML = `
                <div class="modal-item-info">
                    <strong>${escapeHTML(item.name || "Item")}${escapeHTML(sizeLabel)}</strong>
                    <span>${qty} × ${formatPeso(singlePrice)}</span>
                </div>
                <span class="modal-item-total">${formatPeso(itemTotal)}</span>
            `;
            modalItemsList.appendChild(itemRow);
        });
    } else {
        modalItemsList.innerHTML = `<p style="font-size:12px; color:#8fa0a1;">No items details recorded.</p>`;
    }

    modalTotalAmount.textContent = formatPeso(Number(order.total) || 0);

    historyDetailsModal.style.display = "flex";
    document.body.classList.add("modal-open");
}

function closeDetailsModal() {
    if (historyDetailsModal) historyDetailsModal.style.display = "none";
    document.body.classList.remove("modal-open");
}

function initModalEvents() {
    if (closeDetailsModalBtn) closeDetailsModalBtn.addEventListener("click", closeDetailsModal);

    const overlay = historyDetailsModal ? historyDetailsModal.querySelector(".order-modal-overlay") : null;
    if (overlay) overlay.addEventListener("click", closeDetailsModal);
}

// Clear order history modal handlers
function openClearHistoryModal() {
    if (!clearHistoryModal) return;
    clearHistoryModal.style.display = "flex";
    clearHistoryModal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeClearHistoryModal() {
    if (!clearHistoryModal) return;
    clearHistoryModal.style.display = "none";
    clearHistoryModal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

function initClearHistoryModal() {
    if (openClearHistoryModalBtn) openClearHistoryModalBtn.addEventListener("click", openClearHistoryModal);
    if (cancelClearHistoryBtn) cancelClearHistoryBtn.addEventListener("click", closeClearHistoryModal);
    if (clearHistoryOverlay) clearHistoryOverlay.addEventListener("click", closeClearHistoryModal);

if (confirmClearHistoryBtn) {
        confirmClearHistoryBtn.addEventListener("click", async () => {
            try {
                confirmClearHistoryBtn.disabled = true;
                confirmClearHistoryBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Clearing...`;

                const orderUpdates = {};
                allHistoryOrders.forEach((order) => {
                    orderUpdates[order.id] = null;
                });

                if (Object.keys(orderUpdates).length > 0) {
                    await update(ref(db, "orders"), orderUpdates);
                }

                await set(ref(db, "onlineOrderCounter"), 0);

                closeClearHistoryModal();
            } catch (err) {
                console.error("Failed to clear order history:", err);
                alert("Could not clear order history: " + err.message);
            } finally {
                confirmClearHistoryBtn.disabled = false;
                confirmClearHistoryBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Yes, Clear All`;
            }
        });
    }

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDetailsModal();
            closeClearHistoryModal();
        }
    });
}

// Filter events and CSV export
function initFilterEvents() {
    if (historySearchInput) {
        historySearchInput.addEventListener("input", () => {
            currentPage = 1;
            renderHistoryTable();
        });
    }

    if (historyStatusFilter) {
        historyStatusFilter.addEventListener("change", () => {
            currentPage = 1;
            renderHistoryTable();
        });
    }

    if (historyDateFilter) {
        historyDateFilter.addEventListener("change", () => {
            currentPage = 1;
            renderHistoryTable();
        });
    }

    if (exportHistoryBtn) {
        exportHistoryBtn.addEventListener("click", exportToCSV);
    }
}

function exportToCSV() {
    const dataToExport = getFilteredOrders();
    if (dataToExport.length === 0) {
        alert("No order records found to export.");
        return;
    }

    const headers = ["Order No.", "Customer", "Date", "Items Count", "Payment Method", "Total", "Status"];
    const rows = dataToExport.map(o => {
        const orderNum = (o.orderNumber || `#${o.id.slice(-5).toUpperCase()}`).replace(/"/g, '""');
        const customer = (o.customerName || "Walk-in Customer").replace(/"/g, '""');
        const date = o.createdAt ? new Date(o.createdAt).toLocaleString("en-US").replace(/"/g, '""') : "N/A";
        const count = Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
        const method = (o.paymentMethod || "Cash").replace(/"/g, '""');
        const total = Number(o.total) || 0;
        const status = (o.status || "Completed").replace(/"/g, '""');

        return [
            `"${orderNum}"`,
            `"${customer}"`,
            `"${date}"`,
            count,
            `"${method}"`,
            total.toFixed(2),
            `"${status}"`
        ].join(",");
    });

    const csvContent = "\uFEFF" + [headers.join(","), ...rows].join("\r\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `GimikCafe_Order_History_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

// Formatting helpers
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