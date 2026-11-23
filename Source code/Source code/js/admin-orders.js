// GIMIK CAFE - ADMIN ORDERS MANAGEMENT

import { ref, onValue, update, get, set } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";
import { db, adminReady } from "./admin.js";

// DOM element references
const ordersDateDisplay = document.getElementById("ordersDateDisplay");
const statTotalOrders = document.getElementById("statTotalOrders");
const statPendingOrders = document.getElementById("statPendingOrders");
const statCompletedOrders = document.getElementById("statCompletedOrders");
const orderSearchInput = document.getElementById("orderSearchInput");
const orderStatusFilter = document.getElementById("orderStatusFilter");
const ordersCountSubtitle = document.getElementById("ordersCountSubtitle");

// Details modal references
const orderDetailsModal = document.getElementById("orderDetailsModal");
const closeDetailsModalBtn = document.getElementById("closeDetailsModal");
const modalOrderNumber = document.getElementById("modalOrderNumber");
const modalCustomerName = document.getElementById("modalCustomerName");
const modalOrderDate = document.getElementById("modalOrderDate");
const modalPaymentMethod = document.getElementById("modalPaymentMethod");
const modalStatusBadge = document.getElementById("modalStatusBadge");
const modalItemsList = document.getElementById("modalItemsList");
const modalTotalAmount = document.getElementById("modalTotalAmount");
const modalOrderActionsFooter = document.getElementById("modalOrderActionsFooter");

// Cancel order modal references
const cancelOrderModal = document.getElementById("cancelOrderModal");
const cancelModalPrompt = document.getElementById("cancelModalPrompt");
const dismissCancelModalBtn = document.getElementById("dismissCancelModalBtn");

// Clear all orders modal references
const clearAllOrdersModal = document.getElementById("clearAllOrdersModal");
const openClearOrdersModalBtn = document.getElementById("openClearOrdersModalBtn");
const dismissClearAllOrdersBtn = document.getElementById("dismissClearAllOrdersBtn");
const confirmClearAllOrdersBtn = document.getElementById("confirmClearAllOrdersBtn");

// State
let orders = [];
let currentOpenedOrder = null;
let orderIdToCancel = null;

function initOrders() {
    updateDateDisplay();
    initModalEvents();
    listenToOrders();
}

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initOrders).catch((err) => {
        console.warn("adminReady warning, initializing directly:", err);
        initOrders();
    });
} else {
    document.addEventListener("DOMContentLoaded", initOrders);
}

function updateDateDisplay() {
    if (!ordersDateDisplay) return;
    const now = new Date();
    ordersDateDisplay.textContent = now.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}

function parsePrice(val) {
    if (typeof val === "number") return val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[^0-9.]/g, "");
    const parsed = parseFloat(cleaned);
    return isNaN(parsed) ? 0 : parsed;
}

function getTableBody() {
    let tbody = document.getElementById("ordersTableBody");
    if (tbody) return tbody;

    let panel = document.querySelector(".orders-table-panel");
    if (!panel) return null;

    let wrapper = panel.querySelector(".orders-table-wrapper");
    if (!wrapper) {
        wrapper = document.createElement("div");
        wrapper.className = "orders-table-wrapper";
        panel.appendChild(wrapper);
    }

    let table = wrapper.querySelector(".orders-table");
    if (!table) {
        wrapper.innerHTML = `
            <table class="orders-table">
                <thead>
                    <tr>
                        <th>ORDER #</th>
                        <th>CUSTOMER</th>
                        <th>ITEMS</th>
                        <th>TOTAL</th>
                        <th>STATUS</th>
                        <th>DATE</th>
                    </tr>
                </thead>
                <tbody id="ordersTableBody"></tbody>
            </table>
        `;
        return document.getElementById("ordersTableBody");
    }

    tbody = table.querySelector("tbody");
    if (!tbody) {
        tbody = document.createElement("tbody");
        tbody.id = "ordersTableBody";
        table.appendChild(tbody);
    }
    return tbody;
}

function listenToOrders() {
    const ordersRef = ref(db, "orders");

    onValue(ordersRef, (snapshot) => {
        orders = [];

        if (snapshot.exists()) {
            const data = snapshot.val();
            orders = Object.entries(data).map(([id, item]) => ({
                id,
                ...(item || {})
            })).sort((a, b) => (Number(b.createdAt) || 0) - (Number(a.createdAt) || 0));
        }

        updateStatistics();
        renderOrdersTable();

        if (currentOpenedOrder && orderDetailsModal && orderDetailsModal.style.display !== "none") {
            const updated = orders.find(o => o.id === currentOpenedOrder.id);
            if (updated) {
                openOrderDetails(updated);
            }
        }
    }, (error) => {
        console.error("Orders fetch error:", error);
        const tbody = getTableBody();
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 30px; color: #a45c55;">Failed to load orders: ${escapeHTML(error.message)}</td></tr>`;
        }
    });
}

function updateStatistics() {
    let total = orders.length;
    let pending = 0;
    let completed = 0;

    orders.forEach((o) => {
        const s = (o.status || "").toLowerCase().trim();
        if (s.includes("pending") || s.includes("verifying") || s.includes("processing") || s.includes("process")) {
            pending++;
        } else if (s === "completed" || s === "ready" || s === "for pickup") {
            completed++;
        }
    });

    if (statTotalOrders) statTotalOrders.textContent = total;
    if (statPendingOrders) statPendingOrders.textContent = pending;
    if (statCompletedOrders) statCompletedOrders.textContent = completed;
    if (ordersCountSubtitle) ordersCountSubtitle.textContent = `${total} ${total === 1 ? "order" : "orders"} recorded.`;
}

function formatStatusDisplay(rawStatus) {
    const s = String(rawStatus || "Verifying Payment").trim();
    const lower = s.toLowerCase();

    if (lower.includes("verifying") || lower.includes("pending")) {
        return "Verifying Payment";
    }
    if (lower.includes("process")) {
        return "Processing";
    }
    if (lower === "completed" || lower === "ready" || lower === "for pickup") {
        return "Completed";
    }
    if (lower.includes("cancel")) {
        return "Cancelled";
    }
    return s;
}

function normalizeStatusClass(rawStatus) {
    const s = String(rawStatus || "verifying").toLowerCase().trim();
    if (s.includes("verifying") || s.includes("pending")) return "pending";
    if (s.includes("process")) return "processing";
    if (s.includes("complete") || s.includes("ready") || s.includes("pickup")) return "completed";
    if (s.includes("cancel")) return "cancelled";
    return "pending";
}

function renderOrdersTable() {
    const tbody = getTableBody();
    if (!tbody) return;
    tbody.innerHTML = "";

    const rawSearch = orderSearchInput ? orderSearchInput.value : "";
    const searchTerm = rawSearch.trim().toLowerCase();
    const filterVal = (orderStatusFilter ? orderStatusFilter.value : "All").toLowerCase().trim();

    const filtered = orders.filter((order) => {
        const orderNum = String(order.orderNumber || order.orderId || `#${order.id.slice(-5)}`).toLowerCase();
        const customer = String(order.customerName || order.nickname || "").toLowerCase();
        
        let itemsString = "";
        if (Array.isArray(order.items)) {
            itemsString = order.items.map(i => (i && i.name ? String(i.name) : "")).join(" ").toLowerCase();
        }

        const matchesSearch = !searchTerm || orderNum.includes(searchTerm) || customer.includes(searchTerm) || itemsString.includes(searchTerm);
        
        const rawStatus = (order.status || "Verifying Payment").toLowerCase().trim();
        let matchesFilter = false;

        if (filterVal === "all" || filterVal === "all orders") {
            matchesFilter = true;
        } else if (filterVal === "pending") {
            matchesFilter = rawStatus.includes("pending") || rawStatus.includes("verifying") || rawStatus.includes("processing");
        } else if (filterVal === "completed") {
            matchesFilter = rawStatus.includes("completed") || rawStatus.includes("ready") || rawStatus.includes("pickup");
        } else if (filterVal === "cancelled") {
            matchesFilter = rawStatus.includes("cancelled") || rawStatus.includes("cancel");
        } else {
            matchesFilter = rawStatus === filterVal;
        }

        return matchesSearch && matchesFilter;
    });

    if (filtered.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; padding: 40px; color: #8a999a;">No orders found matching this view.</td></tr>`;
        return;
    }

    filtered.forEach((order) => {
        const row = document.createElement("tr");
        row.className = "clickable-order-row";

        const orderNum = order.orderNumber || order.orderId || `#${order.id.slice(-5).toUpperCase()}`;
        const customer = order.customerName || order.nickname || "Walk-in Customer";
        const initial = customer.trim().charAt(0).toUpperCase() || "W";
        
        const totalItems = Array.isArray(order.items) 
            ? order.items.reduce((sum, item) => sum + (Number(item?.quantity) || 1), 0) 
            : 0;

        const totalAmount = parsePrice(order.grandTotal || order.finalTotal || order.totalAmount || order.total);
        const displayStatus = formatStatusDisplay(order.status);
        const statusClass = normalizeStatusClass(order.status);

        const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
        const dateString = isNaN(dateObj.getTime()) ? "-" : dateObj.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
        const timeString = isNaN(dateObj.getTime()) ? "" : dateObj.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });

        row.innerHTML = `
            <td><strong class="order-number">${escapeHTML(orderNum)}</strong></td>
            <td>
                <div class="customer-info">
                    <div class="customer-avatar">${escapeHTML(initial)}</div>
                    <div>
                        <strong>${escapeHTML(customer)}</strong>
                        <span>${escapeHTML(order.paymentMethod || "Cash")}</span>
                    </div>
                </div>
            </td>
            <td><span class="items-count">${totalItems} ${totalItems === 1 ? "item" : "items"}</span></td>
            <td><strong class="order-price">${formatPeso(totalAmount)}</strong></td>
            <td><span class="order-status ${statusClass}">${escapeHTML(displayStatus)}</span></td>
            <td><span class="order-date">${escapeHTML(dateString)}</span><small>${escapeHTML(timeString)}</small></td>
        `;

        row.addEventListener("click", () => openOrderDetails(order));
        tbody.appendChild(row);
    });
}

if (orderSearchInput) orderSearchInput.addEventListener("input", renderOrdersTable);
if (orderStatusFilter) orderStatusFilter.addEventListener("change", renderOrdersTable);

function openOrderDetails(order) {
    if (!orderDetailsModal) return;
    currentOpenedOrder = order;

    if (modalOrderNumber) modalOrderNumber.textContent = order.orderNumber || order.orderId || `#${order.id.slice(-5).toUpperCase()}`;
    if (modalCustomerName) modalCustomerName.textContent = order.customerName || order.nickname || "Walk-in Customer";
    
    // Display GCash along with 4-digit reference number if present
    if (modalPaymentMethod) {
        if (order.referenceNumber) {
            modalPaymentMethod.textContent = `${order.paymentMethod || "GCash"} (Ref: ...${order.referenceNumber})`;
        } else {
            modalPaymentMethod.textContent = order.paymentMethod || "Cash";
        }
    }

    const dateObj = order.createdAt ? new Date(order.createdAt) : new Date();
    if (modalOrderDate) {
        modalOrderDate.textContent = isNaN(dateObj.getTime()) ? "-" : dateObj.toLocaleString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
    }

    const rawStatus = (order.status || "Verifying Payment").trim();
    const displayStatus = formatStatusDisplay(rawStatus);

    if (modalStatusBadge) {
        modalStatusBadge.textContent = displayStatus;
        modalStatusBadge.className = `order-status ${normalizeStatusClass(rawStatus)}`;
    }

    if (modalItemsList) {
        modalItemsList.innerHTML = "";
        if (Array.isArray(order.items) && order.items.length > 0) {
            order.items.forEach((item) => {
                const itemRow = document.createElement("div");
                itemRow.className = "modal-item-row";
                const sizeLabel = item?.size ? ` • ${item.size}` : "";
                const qty = Number(item?.quantity) || 1;
                const singlePrice = parsePrice(item?.price);
                const itemTotal = parsePrice(item?.total) || singlePrice * qty;

                itemRow.innerHTML = `
                    <div class="modal-item-info">
                        <strong>${escapeHTML(item?.name || "Item")}${escapeHTML(sizeLabel)}</strong>
                        <span>${qty} × ${formatPeso(singlePrice)}</span>
                    </div>
                    <span class="modal-item-total">${formatPeso(itemTotal)}</span>
                `;
                modalItemsList.appendChild(itemRow);
            });
        } else {
            modalItemsList.innerHTML = `<p style="font-size: 11px; color: #8fa0a1;">No items recorded.</p>`;
        }
    }

    if (modalTotalAmount) {
        const fullTotal = parsePrice(order.grandTotal || order.finalTotal || order.totalAmount || order.total);
        modalTotalAmount.textContent = formatPeso(fullTotal);
    }

    renderModalFooterActions(rawStatus);

    orderDetailsModal.style.display = "flex";
    document.body.classList.add("modal-open");
}

function renderModalFooterActions(status) {
    if (!modalOrderActionsFooter) return;
    modalOrderActionsFooter.innerHTML = "";

    const s = status.toLowerCase().trim();

    // Stage 1: Verifying Payment
    if (s.includes("verifying") || s.includes("pending")) {
        modalOrderActionsFooter.innerHTML = `
            <button type="button" class="modal-btn-action modal-cancel-order" id="actionCancelOrderBtn">
                <i class="fa-solid fa-ban"></i> Cancel Order
            </button>
            <button type="button" class="modal-btn-action modal-process-order" id="actionProcessOrderBtn">
                <i class="fa-solid fa-receipt"></i> Payment Received (Start Preparing)
            </button>
        `;

        document.getElementById("actionCancelOrderBtn")?.addEventListener("click", () => {
            const orderToCancel = currentOpenedOrder;
            closeDetailsModal();
            openCancelModal(orderToCancel);
        });

        document.getElementById("actionProcessOrderBtn")?.addEventListener("click", async () => {
            if (!currentOpenedOrder) return;
            const btn = document.getElementById("actionProcessOrderBtn");
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Updating...`;
            await updateOrderStatus(currentOpenedOrder.id, "Processing");
        });
        return;
    }

    // Stage 2: Processing -> Complete order
    if (s.includes("process")) {
        modalOrderActionsFooter.innerHTML = `
            <button type="button" class="modal-btn-action modal-cancel-order" id="actionCancelOrderBtn">
                <i class="fa-solid fa-ban"></i> Cancel Order
            </button>
            <button type="button" class="modal-btn-action modal-ready-order" id="actionReadyOrderBtn">
                <i class="fa-solid fa-circle-check"></i> Complete Order (Notify Customer)
            </button>
        `;

        document.getElementById("actionCancelOrderBtn")?.addEventListener("click", () => {
            const orderToCancel = currentOpenedOrder;
            closeDetailsModal();
            openCancelModal(orderToCancel);
        });

        document.getElementById("actionReadyOrderBtn")?.addEventListener("click", async () => {
            if (!currentOpenedOrder) return;
            const btn = document.getElementById("actionReadyOrderBtn");
            btn.disabled = true;
            btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Completing...`;
            await updateOrderStatus(currentOpenedOrder.id, "Completed");
        });
        return;
    }

    // Stage 3: Completed
    if (s.includes("complete") || s.includes("ready") || s.includes("pickup")) {
        modalOrderActionsFooter.innerHTML = `
            <span class="order-finalized-badge success">
                <i class="fa-solid fa-circle-check"></i> Order Completed & Customer Notified
            </span>
        `;
        return;
    }

    // Stage 4: Cancelled
    if (s.includes("cancel")) {
        modalOrderActionsFooter.innerHTML = `
            <span class="order-finalized-badge cancelled">
                <i class="fa-solid fa-ban"></i> Order Cancelled (Stock Restored)
            </span>
        `;
    }
}

function closeDetailsModal() {
    if (orderDetailsModal) orderDetailsModal.style.display = "none";
    document.body.classList.remove("modal-open");
    currentOpenedOrder = null;
}

async function refundOrderInventory(order) {
    if (!order || !Array.isArray(order.items) || order.items.length === 0) return;

    try {
        const [productsSnap, inventorySnap] = await Promise.all([
            get(ref(db, "products")),
            get(ref(db, "inventory"))
        ]);

        if (!productsSnap.exists() || !inventorySnap.exists()) return;

        const productsData = productsSnap.val();
        const inventoryData = inventorySnap.val();
        const refundMap = {};

        for (const item of order.items) {
            if (!item) continue;
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
                    refundMap[invId] = (refundMap[invId] || 0) + (amountPerCup * qtySold);
                }
            });
        }

        const updatePromises = Object.entries(refundMap).map(async ([invId, amountToRefund]) => {
            const currentStock = Number(inventoryData[invId]?.stock ?? inventoryData[invId]?.quantity ?? 0);
            const newStock = currentStock + amountToRefund;
            await update(ref(db, `inventory/${invId}`), {
                stock: Math.round(newStock * 100) / 100,
                updatedAt: Date.now()
            });
        });

        await Promise.all(updatePromises);
    } catch (err) {
        console.error("Inventory stock refund error:", err);
    }
}

async function updateOrderStatus(orderId, status, cancelReason = null) {
    try {
        const orderRef = ref(db, `orders/${orderId}`);
        const orderSnap = await get(orderRef);

        if (orderSnap.exists()) {
            const currentData = orderSnap.val();
            const prevStatus = (currentData.status || "Verifying Payment").toLowerCase().trim();

            if (status.toLowerCase().trim() === "cancelled" && prevStatus !== "cancelled") {
                await refundOrderInventory(currentData);
            }
        }

        const updateData = { status, updatedAt: Date.now() };
        if (cancelReason) {
            updateData.cancelReason = cancelReason;
        }

        await update(orderRef, updateData);
    } catch (error) {
        console.error("Update status error:", error);
        alert("Failed to update status: " + error.message);
    }
}

function openCancelModal(order) {
    if (!cancelOrderModal) return;
    orderIdToCancel = order.id;
    const orderNum = order.orderNumber || order.orderId || `#${order.id.slice(-5).toUpperCase()}`;
    const customer = order.customerName || order.nickname || "Walk-in Customer";

    if (cancelModalPrompt) {
        cancelModalPrompt.innerHTML = `Please select a reason for cancelling <strong>${escapeHTML(orderNum)}</strong> (${escapeHTML(customer)}):`;
    }
    cancelOrderModal.style.display = "flex";
    document.body.classList.add("modal-open");
}

function closeCancelModal() {
    if (cancelOrderModal) cancelOrderModal.style.display = "none";
    orderIdToCancel = null;
    document.body.classList.remove("modal-open");
}

function openClearAllOrdersModal() {
    if (orders.length === 0) return;
    if (clearAllOrdersModal) {
        clearAllOrdersModal.style.display = "flex";
        document.body.classList.add("modal-open");
    }
}

function closeClearAllOrdersModal() {
    if (clearAllOrdersModal) {
        clearAllOrdersModal.style.display = "none";
        document.body.classList.remove("modal-open");
    }
}

function initModalEvents() {
    if (closeDetailsModalBtn) closeDetailsModalBtn.addEventListener("click", closeDetailsModal);
    if (dismissCancelModalBtn) dismissCancelModalBtn.addEventListener("click", closeCancelModal);

    // Cancel Reason Button Click Handlers
    document.querySelectorAll(".cancel-reason-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!orderIdToCancel) return;
            const chosenReason = btn.dataset.reason;
            
            try {
                btn.disabled = true;
                const originalHtml = btn.innerHTML;
                btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Cancelling order...`;
                
                await updateOrderStatus(orderIdToCancel, "Cancelled", chosenReason);
                
                btn.innerHTML = originalHtml;
                btn.disabled = false;
                closeCancelModal();
            } catch (err) {
                console.error("Cancellation error:", err);
                btn.disabled = false;
            }
        });
    });

    if (openClearOrdersModalBtn) openClearOrdersModalBtn.addEventListener("click", openClearAllOrdersModal);
    if (dismissClearAllOrdersBtn) dismissClearAllOrdersBtn.addEventListener("click", closeClearAllOrdersModal);

    if (confirmClearAllOrdersBtn) {
        confirmClearAllOrdersBtn.addEventListener("click", async () => {
            try {
                confirmClearAllOrdersBtn.disabled = true;
                confirmClearAllOrdersBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Restoring stocks...`;

                const activeOrders = orders.filter(o => {
                    const s = (o.status || "").toLowerCase().trim();
                    return s.includes("pending") || s.includes("verifying") || s.includes("processing");
                });

                for (const order of activeOrders) {
                    await refundOrderInventory(order);
                }

                const updates = {};
                activeOrders.forEach(o => { updates[`orders/${o.id}`] = null; });

                if (Object.keys(updates).length > 0) {
                    await update(ref(db), updates);
                }

                // Reset POS counter AND Online order counters back to 1
                await Promise.all([
                    set(ref(db, "system/posOrderCounter"), 1),
                    set(ref(db, "system/onlineOrderCounter"), 1),
                    set(ref(db, "system/orderCounter"), 1)
                ]);

                closeClearAllOrdersModal();
            } catch (err) {
                console.error("Error clearing orders:", err);
                alert("Failed to clear active orders: " + err.message);
            } finally {
                confirmClearAllOrdersBtn.disabled = false;
                confirmClearAllOrdersBtn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Yes, Clear All`;
            }
        });
    }

    document.querySelectorAll(".order-modal-overlay").forEach((overlay) => {
        overlay.addEventListener("click", () => {
            closeDetailsModal();
            closeCancelModal();
            closeClearAllOrdersModal();
        });
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
            closeDetailsModal();
            closeCancelModal();
            closeClearAllOrdersModal();
        }
    });
}

function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", { style: "currency", currency: "PHP", minimumFractionDigits: 2 }).format(amount);
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}