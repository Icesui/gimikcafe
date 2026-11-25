import { 
    ref, 
    onValue,
    update,
    set
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { db, adminReady } from "./admin.js";

const historyDateDisplay = document.getElementById("historyDate");
const statHistoryTotal = document.getElementById("statHistoryTotal");
const statHistoryCompleted = document.getElementById("statHistoryCompleted");
const statHistoryCancelled = document.getElementById("statHistoryCancelled");
const statWeeklyEarnings = document.getElementById("statWeeklyEarnings");
const statMonthlyEarnings = document.getElementById("statMonthlyEarnings");
const statYearlyEarnings = document.getElementById("statYearlyEarnings");
const countWeeklyOrders = document.getElementById("countWeeklyOrders");
const countMonthlyOrders = document.getElementById("countMonthlyOrders");
const countYearlyOrders = document.getElementById("countYearlyOrders");
const analyticsSubtitle = document.getElementById("analyticsSubtitle");
const analyticsTimeframeTabs = document.getElementById("analyticsTimeframeTabs");
const analyticsPeakSlot = document.getElementById("analyticsPeakSlot");
const analyticsTotalDrinks = document.getElementById("analyticsTotalDrinks");
const analyticsTotalRevenue = document.getElementById("analyticsTotalRevenue");
const salesTimeChartCanvas = document.getElementById("salesTimeChart");
const bestSellersList = document.getElementById("bestSellersList");
const topBestSellerLabel = document.getElementById("topBestSellerLabel");

const historySearchInput = document.getElementById("historySearchInput");
const historyStatusFilter = document.getElementById("historyStatusFilter");
const historyDateFilter = document.getElementById("historyDateFilter");
const exportHistoryBtn = document.getElementById("exportHistoryBtn");
const openClearHistoryModalBtn = document.getElementById("openClearHistoryModalBtn");

const exportReportModal = document.getElementById("exportReportModal");
const exportReportOverlay = document.getElementById("exportReportOverlay");
const closeExportModalBtn = document.getElementById("closeExportModalBtn");
const exportRangeSelect = document.getElementById("exportRangeSelect");
const includeGraphDataCheck = document.getElementById("includeGraphDataCheck");
const includeEarningsCheck = document.getElementById("includeEarningsCheck");
const includeInventoryExpensesCheck = document.getElementById("includeInventoryExpensesCheck");
const includeBestSellersCheck = document.getElementById("includeBestSellersCheck");
const includeOrdersListCheck = document.getElementById("includeOrdersListCheck");
const confirmExportPdfBtn = document.getElementById("confirmExportPdfBtn");

const historyTableBody = document.getElementById("historyTableBody");
const historyPaginationInfo = document.getElementById("historyPaginationInfo");
const historyPaginationControls = document.getElementById("historyPaginationControls");

const historyDetailsModal = document.getElementById("historyDetailsModal");
const closeDetailsModalBtn = document.getElementById("closeDetailsModal");
const modalOrderNumber = document.getElementById("modalOrderNumber");
const modalCustomerName = document.getElementById("modalCustomerName");
const modalOrderDate = document.getElementById("modalOrderDate");
const modalPaymentMethod = document.getElementById("modalPaymentMethod");
const modalStatusBadge = document.getElementById("modalStatusBadge");
const modalItemsList = document.getElementById("modalItemsList");
const modalTotalAmount = document.getElementById("modalTotalAmount");

const clearHistoryModal = document.getElementById("clearHistoryModal");
const clearHistoryOverlay = document.getElementById("clearHistoryOverlay");
const cancelClearHistoryBtn = document.getElementById("cancelClearHistoryBtn");
const confirmClearHistoryBtn = document.getElementById("confirmClearHistoryBtn");

let allHistoryOrders = [];
let allInventoryItems = [];
let allInventoryExpenses = [];
let currentPage = 1;
const ITEMS_PER_PAGE = 20;
let activeAnalyticsRange = "Today";
let salesChartInstance = null;

const initHistory = () => {
    updateDateDisplay();
    initModalEvents();
    initClearHistoryModal();
    initFilterEvents();
    initAnalyticsEvents();
    initExportModalEvents();
    listenToOrderHistory();
    listenToInventoryData();
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
        renderEarningsSummary();
        renderSalesAnalytics();
        renderBestSellers();
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

function listenToInventoryData() {
    onValue(ref(db, "inventory"), (snapshot) => {
        allInventoryItems = snapshot.exists()
            ? Object.entries(snapshot.val()).map(([id, item]) => ({ id, ...item }))
            : [];
    }, (err) => {
        console.warn("Inventory listener warning:", err);
    });

    onValue(ref(db, "inventoryExpenses"), (snapshot) => {
        allInventoryExpenses = snapshot.exists()
            ? Object.entries(snapshot.val()).map(([id, item]) => ({ id, ...item }))
            : [];
    }, (err) => {
        console.warn("Inventory expenses listener warning:", err);
    });
}

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

function renderEarningsSummary() {
    if (
        !statWeeklyEarnings &&
        !statMonthlyEarnings &&
        !statYearlyEarnings
    ) {
        return;
    }

    const now = new Date();
    const dayOfWeek = now.getDay();
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    let weeklyTotal = 0;
    let monthlyTotal = 0;
    let yearlyTotal = 0;

    let weeklyCount = 0;
    let monthlyCount = 0;
    let yearlyCount = 0;

    allHistoryOrders.forEach((order) => {
        if ((order.status || "").toLowerCase() !== "completed") return;

        const orderTime = Number(order.createdAt) || 0;
        const amount = Number(order.total) || 0;

        if (orderTime >= startOfWeek) {
            weeklyTotal += amount;
            weeklyCount++;
        }
        if (orderTime >= startOfMonth) {
            monthlyTotal += amount;
            monthlyCount++;
        }
        if (orderTime >= startOfYear) {
            yearlyTotal += amount;
            yearlyCount++;
        }
    });

    if (statWeeklyEarnings) statWeeklyEarnings.textContent = formatPeso(weeklyTotal);
    if (statMonthlyEarnings) statMonthlyEarnings.textContent = formatPeso(monthlyTotal);
    if (statYearlyEarnings) statYearlyEarnings.textContent = formatPeso(yearlyTotal);

    if (countWeeklyOrders) {
        countWeeklyOrders.textContent = `${weeklyCount} ${weeklyCount === 1 ? "completed order" : "completed orders"}`;
    }
    if (countMonthlyOrders) {
        countMonthlyOrders.textContent = `${monthlyCount} ${monthlyCount === 1 ? "completed order" : "completed orders"}`;
    }
    if (countYearlyOrders) {
        countYearlyOrders.textContent = `${yearlyCount} ${yearlyCount === 1 ? "completed order" : "completed orders"}`;
    }
}

function initAnalyticsEvents() {
    if (!analyticsTimeframeTabs) return;

    analyticsTimeframeTabs.querySelectorAll(".analytics-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
            analyticsTimeframeTabs.querySelectorAll(".analytics-tab").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            activeAnalyticsRange = btn.dataset.range || "Today";
            renderSalesAnalytics();
        });
    });
}

function getOrderDrinkCount(order) {
    if (!Array.isArray(order.items)) return 0;
    return order.items.reduce((sum, item) => sum + (Number(item.quantity) || 1), 0);
}

function isWithinRange(timestamp, range) {
    if (range === "All") return true;
    const t = Number(timestamp) || 0;
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const endOfToday = startOfToday + 86400000;
    const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();

    if (range === "Today") return t >= startOfToday && t < endOfToday;
    if (range === "Weekly") return t >= startOfWeek;
    if (range === "Monthly") return t >= startOfMonth;
    if (range === "Yearly") return t >= startOfYear;
    return true;
}

function buildAnalyticsBuckets(range) {
    const now = new Date();
    const completedOrders = allHistoryOrders.filter(o => (o.status || "").toLowerCase() === "completed");

    if (range === "Today") {
        const hours = Array.from({ length: 12 }, (_, idx) => idx + 12);
        const labels = hours.map(h => (h === 12 ? "12 PM" : `${h - 12} PM`));
        const drinks = new Array(12).fill(0);
        const revenue = new Array(12).fill(0);

        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const endOfToday = startOfToday + 86400000;

        completedOrders.forEach((order) => {
            const t = Number(order.createdAt) || 0;
            if (t < startOfToday || t >= endOfToday) return;

            const hour = new Date(t).getHours();
            if (hour >= 12 && hour <= 23) {
                const slotIdx = hour - 12;
                drinks[slotIdx] += getOrderDrinkCount(order);
                revenue[slotIdx] += Number(order.total) || 0;
            }
        });

        return {
            subtitle: "Hourly drinks sold & revenue (12:00 PM – 11:00 PM)",
            labels,
            drinks,
            revenue
        };
    }

    if (range === "Weekly") {
        const labels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
        const drinks = new Array(7).fill(0);
        const revenue = new Array(7).fill(0);

        const startOfWeek = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay()).getTime();
        const endOfWeek = startOfWeek + 7 * 86400000;

        completedOrders.forEach((order) => {
            const t = Number(order.createdAt) || 0;
            if (t < startOfWeek || t >= endOfWeek) return;

            const dayIdx = new Date(t).getDay();
            drinks[dayIdx] += getOrderDrinkCount(order);
            revenue[dayIdx] += Number(order.total) || 0;
        });

        return {
            subtitle: "Daily drinks sold & revenue for this week",
            labels,
            drinks,
            revenue
        };
    }

    if (range === "Monthly") {
        const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        const drinks = new Array(daysInMonth).fill(0);
        const revenue = new Array(daysInMonth).fill(0);

        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).getTime();

        completedOrders.forEach((order) => {
            const t = Number(order.createdAt) || 0;
            if (t < startOfMonth || t >= startOfNextMonth) return;

            const dateIdx = new Date(t).getDate() - 1;
            if (dateIdx >= 0 && dateIdx < daysInMonth) {
                drinks[dateIdx] += getOrderDrinkCount(order);
                revenue[dateIdx] += Number(order.total) || 0;
            }
        });

        return {
            subtitle: `Daily drinks sold & revenue for ${now.toLocaleDateString("en-US", { month: "long", year: "numeric" })}`,
            labels,
            drinks,
            revenue
        };
    }

    const labels = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const drinks = new Array(12).fill(0);
    const revenue = new Array(12).fill(0);

    const startOfYear = new Date(now.getFullYear(), 0, 1).getTime();
    const startOfNextYear = new Date(now.getFullYear() + 1, 0, 1).getTime();

    completedOrders.forEach((order) => {
        const t = Number(order.createdAt) || 0;
        if (t < startOfYear || t >= startOfNextYear) return;

        const monthIdx = new Date(t).getMonth();
        drinks[monthIdx] += getOrderDrinkCount(order);
        revenue[monthIdx] += Number(order.total) || 0;
    });

    return {
        subtitle: `Monthly drinks sold & revenue for ${now.getFullYear()}`,
        labels,
        drinks,
        revenue
    };
}

function renderSalesAnalytics() {
    if (!salesTimeChartCanvas) return;

    const { subtitle, labels, drinks, revenue } = buildAnalyticsBuckets(activeAnalyticsRange);

    if (analyticsSubtitle) analyticsSubtitle.textContent = subtitle;

    const totalDrinksSold = drinks.reduce((a, b) => a + b, 0);
    const totalPeriodRevenue = revenue.reduce((a, b) => a + b, 0);

    let maxDrinks = 0;
    let peakLabel = "-";
    drinks.forEach((count, i) => {
        if (count > maxDrinks) {
            maxDrinks = count;
            peakLabel = `${labels[i]} (${count} ${count === 1 ? "drink" : "drinks"})`;
        }
    });

    if (analyticsPeakSlot) analyticsPeakSlot.textContent = maxDrinks > 0 ? peakLabel : "-";
    if (analyticsTotalDrinks) analyticsTotalDrinks.textContent = totalDrinksSold;
    if (analyticsTotalRevenue) analyticsTotalRevenue.textContent = formatPeso(totalPeriodRevenue);

    if (typeof Chart === "undefined") return;

    if (salesChartInstance) {
        salesChartInstance.destroy();
    }

    salesChartInstance = new Chart(salesTimeChartCanvas, {
        type: "bar",
        data: {
            labels,
            datasets: [
                {
                    label: "Drinks / Items Sold",
                    data: drinks,
                    backgroundColor: "rgba(11, 112, 116, 0.85)",
                    hoverBackgroundColor: "#024E52",
                    borderRadius: 7,
                    maxBarThickness: 38
                }
            ]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: "#024E52",
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (ctx) => {
                            const idx = ctx.dataIndex;
                            const count = drinks[idx] || 0;
                            const rev = formatPeso(revenue[idx] || 0);
                            return [
                                `Sold: ${count} ${count === 1 ? "drink" : "drinks"}`,
                                `Sales: ${rev}`
                            ];
                        }
                    }
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    ticks: {
                        color: "#5c7576",
                        font: { family: "Poppins", size: 11, weight: "600" }
                    }
                },
                y: {
                    beginAtZero: true,
                    ticks: {
                        precision: 0,
                        color: "#7d9394",
                        font: { family: "Poppins", size: 11 }
                    },
                    grid: {
                        color: "#edf3f3"
                    }
                }
            }
        }
    });
}

function getBestSellers(orders, limit = 5) {
    const productCounts = new Map();

    orders.forEach((order) => {
        if ((order.status || "").toLowerCase() !== "completed") return;
        if (!Array.isArray(order.items)) return;

        order.items.forEach((item) => {
            const rawName = (item.name || "").trim();
            if (!rawName) return;

            const cleanSize = (item.size || "")
                .trim()
                .replace(/^\(+|\)+$/g, "")
                .replace(/\s*\(\s*/g, " ")
                .replace(/\s*\)\s*/g, "")
                .trim();

            const key = cleanSize ? `${rawName} (${cleanSize})` : rawName;
            const qty = Number(item.quantity) || 1;
            const revenue = Number(item.total) || ((Number(item.price) || 0) * qty);

            const current = productCounts.get(key) || { label: key, unitsSold: 0, revenue: 0 };
            current.unitsSold += qty;
            current.revenue += revenue;
            productCounts.set(key, current);
        });
    });

    return Array.from(productCounts.values())
        .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
        .slice(0, limit);
}

function renderBestSellers() {
    if (!bestSellersList) return;

    const topItems = getBestSellers(allHistoryOrders, 5);

    if (topItems.length === 0) {
        if (topBestSellerLabel) topBestSellerLabel.textContent = "Top Seller: -";
        bestSellersList.innerHTML = `<p class="best-sellers-empty">No completed order items yet.</p>`;
        return;
    }

    if (topBestSellerLabel) {
        topBestSellerLabel.textContent = `Top Seller: ${topItems[0].label} (${topItems[0].unitsSold} sold)`;
    }

    bestSellersList.innerHTML = topItems
        .map((item, idx) => `
            <div class="best-seller-card ${idx === 0 ? "is-top" : ""}">
                <div class="best-seller-rank">#${idx + 1}</div>
                <div class="best-seller-info">
                    <strong title="${escapeHTML(item.label)}">${escapeHTML(item.label)}</strong>
                    <span>${item.unitsSold} ${item.unitsSold === 1 ? "unit" : "units"} sold • ${formatPeso(item.revenue)}</span>
                </div>
            </div>
        `)
        .join("");
}

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

function renderPagination(start, end, total, totalPages) {
    if (historyPaginationInfo) {
        historyPaginationInfo.textContent = total > 0 
            ? `Showing ${start}–${end} of ${total} orders`
            : `Showing 0 orders`;
    }

    if (!historyPaginationControls) return;
    historyPaginationControls.innerHTML = "";

    if (total === 0) return;

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
            closeExportModal();
        }
    });
}

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
        exportHistoryBtn.addEventListener("click", openExportModal);
    }
}

function openExportModal() {
    if (!exportReportModal) return;
    if (exportRangeSelect) {
        exportRangeSelect.value = activeAnalyticsRange || "Today";
    }
    exportReportModal.style.display = "flex";
    document.body.classList.add("modal-open");
}

function closeExportModal() {
    if (!exportReportModal) return;
    exportReportModal.style.display = "none";
    document.body.classList.remove("modal-open");
}

function initExportModalEvents() {
    closeExportModalBtn?.addEventListener("click", closeExportModal);
    exportReportOverlay?.addEventListener("click", closeExportModal);

    exportRangeSelect?.addEventListener("change", () => {
        const val = exportRangeSelect.value;
        if (["Today", "Weekly", "Monthly", "Yearly"].includes(val)) {
            activeAnalyticsRange = val;
            analyticsTimeframeTabs?.querySelectorAll(".analytics-tab").forEach((b) => {
                b.classList.toggle("active", b.dataset.range === val);
            });
            renderSalesAnalytics();
        }
    });

    confirmExportPdfBtn?.addEventListener("click", () => {
        exportCustomReportPDF();
        closeExportModal();
    });
}

function getInventoryExpensesForRange(range) {
    const entries = [];
    let totalExpenses = 0;

    allInventoryExpenses.forEach((exp) => {
        const ts = Number(exp.createdAt || exp.updatedAt || exp.timestamp) || 0;
        if (!isWithinRange(ts, range)) return;
        const cost = Number(exp.amount ?? exp.cost ?? exp.total) || 0;
        totalExpenses += cost;
        const orderRefText = exp.orderNumber ? ` (${exp.orderNumber})` : "";
        entries.push({
            name: `${exp.itemName || exp.name || "Inventory Expense"}${orderRefText}`,
            category: exp.category || "Inventory",
            stockInfo: exp.quantity ? `${formatNumber(exp.quantity)} ${exp.unit || ""}`.trim() : "-",
            cost
        });
    });

    if (entries.length === 0) {
        allInventoryItems.forEach((item) => {
            const ts = Number(item.updatedAt || item.createdAt) || 0;
            const rawCost = item.expense ?? item.totalCost ?? item.cost ?? item.unitCost ?? item.price;
            if (rawCost === undefined || rawCost === null || rawCost === "") return;
            if (!isWithinRange(ts, range)) return;

            const numCost = Number(rawCost) || 0;
            const qty = Number(item.stock) || 1;
            const lineTotal = item.totalCost !== undefined || item.expense !== undefined ? numCost : numCost * qty;
            totalExpenses += lineTotal;

            entries.push({
                name: item.name || "Inventory Item",
                category: item.category || "Inventory",
                stockInfo: `${formatNumber(qty)} ${item.unit || "unit"}`,
                cost: lineTotal
            });
        });
    }

    return { entries, totalExpenses };
}

function formatPdfPeso(amount) {
    return "PHP " + Number(amount || 0).toLocaleString("en-PH", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    });
}

function exportCustomReportPDF() {
    if (!window.jspdf || !window.jspdf.jsPDF) {
        alert("PDF library is still loading. Please try again in a moment.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });

    const range = exportRangeSelect ? exportRangeSelect.value : "Today";
    const includeGraph = includeGraphDataCheck ? includeGraphDataCheck.checked : true;
    const includeEarnings = includeEarningsCheck ? includeEarningsCheck.checked : true;
    const includeExpenses = includeInventoryExpensesCheck ? includeInventoryExpensesCheck.checked : true;
    const includeBest = includeBestSellersCheck ? includeBestSellersCheck.checked : false;
    const includeOrders = includeOrdersListCheck ? includeOrdersListCheck.checked : false;

    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 40;
    let cursorY = 44;

    const ensureSpace = (neededHeight) => {
        if (cursorY + neededHeight > pageHeight - 40) {
            doc.addPage();
            cursorY = 44;
        }
    };

    const addSectionHeading = (title) => {
        ensureSpace(34);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(13);
        doc.setTextColor(2, 78, 82);
        doc.text(title, margin, cursorY);
        cursorY += 8;
        doc.setDrawColor(220, 234, 234);
        doc.setLineWidth(1);
        doc.line(margin, cursorY, pageWidth - margin, cursorY);
        cursorY += 14;
    };

    doc.setFillColor(2, 78, 82);
    doc.roundedRect(margin, cursorY, pageWidth - margin * 2, 58, 8, 8, "F");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.setTextColor(255, 255, 255);
    doc.text("Gimik Cafe — Sales & Operations Report", margin + 16, cursorY + 24);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(214, 240, 240);
    doc.text(
        `Timeframe: ${range}   |   Generated: ${new Date().toLocaleString("en-US")}`,
        margin + 16,
        cursorY + 42
    );
    cursorY += 78;

    const completedInRange = allHistoryOrders.filter(
        (o) => (o.status || "").toLowerCase() === "completed" && isWithinRange(o.createdAt, range)
    );
    const totalEarned = completedInRange.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
    const { entries: expenseEntries, totalExpenses } = getInventoryExpensesForRange(range);

    if (includeEarnings) {
        addSectionHeading("Earnings Summary");
        const summaryRows = [
            ["Timeframe", range],
            ["Completed Orders", String(completedInRange.length)],
            ["Total Earnings", formatPdfPeso(totalEarned)]
        ];
        if (includeExpenses) {
            summaryRows.push(["Inventory Expenses", formatPdfPeso(totalExpenses)]);
            summaryRows.push(["Net Earnings (After Inventory Expenses)", formatPdfPeso(totalEarned - totalExpenses)]);
        }

        doc.autoTable({
            startY: cursorY,
            margin: { left: margin, right: margin },
            head: [["Metric", "Value"]],
            body: summaryRows,
            theme: "grid",
            headStyles: { fillColor: [11, 112, 116], textColor: 255, fontStyle: "bold", fontSize: 10 },
            bodyStyles: { fontSize: 10, textColor: [38, 60, 61] },
            alternateRowStyles: { fillColor: [248, 251, 251] }
        });
        cursorY = doc.lastAutoTable.finalY + 22;
    }

    if (includeGraph) {
        const chartRange = range === "All" ? "Today" : range;
        if (activeAnalyticsRange !== chartRange) {
            activeAnalyticsRange = chartRange;
            renderSalesAnalytics();
        }

        addSectionHeading(`Sales & Drinks Graph (${chartRange})`);

        if (salesTimeChartCanvas) {
            ensureSpace(210);
            const chartImg = salesTimeChartCanvas.toDataURL("image/png", 1.0);
            const chartWidth = pageWidth - margin * 2;
            const chartHeight = 185;
            doc.addImage(chartImg, "PNG", margin, cursorY, chartWidth, chartHeight);
            cursorY += chartHeight + 14;
        }

        const { labels, drinks, revenue } = buildAnalyticsBuckets(chartRange);
        const timeRows = labels.map((lbl, idx) => [
            lbl,
            String(drinks[idx] || 0),
            formatPdfPeso(revenue[idx] || 0)
        ]);

        doc.autoTable({
            startY: cursorY,
            margin: { left: margin, right: margin },
            head: [["Time / Period", "Drinks / Items Sold", "Sales Revenue"]],
            body: timeRows,
            theme: "grid",
            headStyles: { fillColor: [11, 112, 116], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
            bodyStyles: { fontSize: 9.5, textColor: [38, 60, 61] },
            alternateRowStyles: { fillColor: [248, 251, 251] }
        });
        cursorY = doc.lastAutoTable.finalY + 22;
    }

    if (includeExpenses) {
        addSectionHeading("Inventory Expenses");
        const expenseBody = expenseEntries.length === 0
            ? [["No inventory expenses recorded for this period", "-", "-", formatPdfPeso(0)]]
            : expenseEntries.map((e) => [e.name, e.category, e.stockInfo, formatPdfPeso(e.cost)]);

        expenseBody.push(["Total Inventory Expenses", "", "", formatPdfPeso(totalExpenses)]);

        doc.autoTable({
            startY: cursorY,
            margin: { left: margin, right: margin },
            head: [["Item", "Category", "Stock / Qty", "Expense"]],
            body: expenseBody,
            theme: "grid",
            headStyles: { fillColor: [11, 112, 116], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
            bodyStyles: { fontSize: 9.5, textColor: [38, 60, 61] },
            alternateRowStyles: { fillColor: [248, 251, 251] }
        });
        cursorY = doc.lastAutoTable.finalY + 22;
    }

    if (includeBest) {
        addSectionHeading("Best Sellers");
        const rangeOrders = allHistoryOrders.filter((o) => isWithinRange(o.createdAt, range));
        const top = getBestSellers(rangeOrders, 10);
        const bestRows = top.length === 0
            ? [["-", "No completed items in this period", "0", formatPdfPeso(0)]]
            : top.map((item, idx) => [`#${idx + 1}`, item.label, String(item.unitsSold), formatPdfPeso(item.revenue)]);

        doc.autoTable({
            startY: cursorY,
            margin: { left: margin, right: margin },
            head: [["Rank", "Product", "Units Sold", "Revenue"]],
            body: bestRows,
            theme: "grid",
            headStyles: { fillColor: [11, 112, 116], textColor: 255, fontStyle: "bold", fontSize: 9.5 },
            bodyStyles: { fontSize: 9.5, textColor: [38, 60, 61] },
            alternateRowStyles: { fillColor: [248, 251, 251] }
        });
        cursorY = doc.lastAutoTable.finalY + 22;
    }

    if (includeOrders) {
        addSectionHeading("Previous Orders");
        const ordersForExport = allHistoryOrders.filter((o) => isWithinRange(o.createdAt, range));
        const orderRows = ordersForExport.length === 0
            ? [["-", "No orders in this period", "-", "0", "-", formatPdfPeso(0), "-"]]
            : ordersForExport.map((o) => {
                const orderNum = o.orderNumber || `#${o.id.slice(-5).toUpperCase()}`;
                const customer = o.customerName || "Walk-in Customer";
                const date = o.createdAt ? new Date(o.createdAt).toLocaleString("en-US") : "N/A";
                const count = Array.isArray(o.items) ? o.items.reduce((s, i) => s + (i.quantity || 1), 0) : 0;
                const method = o.paymentMethod || "Cash";
                const total = Number(o.total) || 0;
                const status = o.status || "Completed";
                return [orderNum, customer, date, String(count), method, formatPdfPeso(total), status];
            });

        doc.autoTable({
            startY: cursorY,
            margin: { left: margin, right: margin },
            head: [["Order #", "Customer", "Date & Time", "Items", "Payment", "Total", "Status"]],
            body: orderRows,
            theme: "grid",
            headStyles: { fillColor: [11, 112, 116], textColor: 255, fontStyle: "bold", fontSize: 8.5 },
            bodyStyles: { fontSize: 8.5, textColor: [38, 60, 61] },
            alternateRowStyles: { fillColor: [248, 251, 251] }
        });
    }

    doc.save(`GimikCafe_Report_${range}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(amount);
}

function formatNumber(number) {
    const value = Number(number);
    if (isNaN(value)) return "0";
    return value.toLocaleString("en-PH", { maximumFractionDigits: 2 });
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}