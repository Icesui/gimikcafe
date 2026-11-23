// Firebase Realtime Database imports
import {
    ref,
    onValue,
    push,
    set,
    update,
    remove
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import {
    db,
    adminReady
} from "./admin.js";

// DOM references
const inventoryTableBody = document.getElementById("inventoryTableBody");
const openRemoveModalBtn = document.getElementById("openRemoveModal");
const inventoryEmpty = document.getElementById("inventoryEmpty");
const inventorySearch = document.getElementById("inventorySearch");
const categoryFilter = document.getElementById("categoryFilter");
const statusFilter = document.getElementById("statusFilter");

// Statistics indicators
const statTotalItems = document.getElementById("statTotalItems");
const statInStock = document.getElementById("statInStock");
const statLowStock = document.getElementById("statLowStock");

// Item creation and editing modal
const inventoryModal = document.getElementById("inventoryModal");
const openInventoryModalBtn = document.getElementById("openInventoryModal");
const closeInventoryModalBtn = document.getElementById("closeInventoryModal");
const cancelInventoryModalBtn = document.getElementById("cancelInventoryModal");
const inventoryModalOverlay = document.querySelector(".inventory-modal-overlay");
const inventoryModalTitle = document.getElementById("inventoryModalTitle");

const inventoryForm = document.getElementById("inventoryForm");
const inventoryName = document.getElementById("inventoryName");
const inventoryCategory = document.getElementById("inventoryCategory");
const inventoryUnit = document.getElementById("inventoryUnit");
const inventoryStock = document.getElementById("inventoryStock");
const inventoryMinimum = document.getElementById("inventoryMinimum");

// Packaging configuration and units
const hasPackagingToggle = document.getElementById("hasPackagingToggle");
const packagingFields = document.getElementById("packagingFields");
const packageTypeName = document.getElementById("packageTypeName");
const packageCapacity = document.getElementById("packageCapacity");
const capacityUnitLabel = document.getElementById("capacityUnitLabel");
const stockInputLabel = document.getElementById("stockInputLabel");

// Quick stock adjustment controls
const stockModal = document.getElementById("stockModal");
const stockModalOverlay = document.getElementById("stockModalOverlay");
const closeStockModalBtn = document.getElementById("closeStockModal");
const cancelStockModalBtn = document.getElementById("cancelStockModal");
const stockForm = document.getElementById("stockForm");
const stockModalTitle = document.getElementById("stockModalTitle");
const stockModalActionBadge = document.getElementById("stockModalActionBadge");
const stockModalDescription = document.getElementById("stockModalDescription");
const stockInputQuantity = document.getElementById("stockInputQuantity");
const stockCurrentBalance = document.getElementById("stockCurrentBalance");
const confirmStockBtn = document.getElementById("confirmStockBtn");

const adjustUnitSelectorGroup = document.getElementById("adjustUnitSelectorGroup");
const adjustPackageNameLabel = document.getElementById("adjustPackageNameLabel");
const adjustBaseUnitLabel = document.getElementById("adjustBaseUnitLabel");

// Centered delete confirmation modal
const deleteModal = document.getElementById("deleteModal");
const deleteModalOverlay = document.getElementById("deleteModalOverlay");
const cancelDeleteModalBtn = document.getElementById("cancelDeleteModal");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");
const deleteTargetItemName = document.getElementById("deleteTargetItemName");

// Runtime state variables
let inventoryItems = [];
let editingInventoryId = null;
let selectedInventoryId = null;
let activeStockItem = null;
let activeStockMode = "add";

// System initialization
const initInventory = () => {
    updateInventoryDate();
    initPackagingConversionForm();
    listenToInventory();
};

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initInventory).catch(initInventory);
} else {
    initInventory();
}

function updateInventoryDate() {
    const dateDisplay = document.getElementById("inventoryDateDisplay");
    if (!dateDisplay) return;

    const today = new Date();
    dateDisplay.textContent = today.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// Real-time inventory sync from Firebase
function listenToInventory() {
    const inventoryRef = ref(db, "inventory");

    onValue(inventoryRef, (snapshot) => {
        if (!snapshot.exists()) {
            inventoryItems = [];
            renderInventory();
            updateStatistics();
            return;
        }

        const data = snapshot.val();
        inventoryItems = Object.entries(data).map(([id, item]) => ({
            id,
            ...item
        }));

        renderInventory();
        updateStatistics();
    }, (error) => {
        console.error("Inventory loading error:", error);
    });
}

// Table rendering and filtering
function renderInventory() {
    if (!inventoryTableBody) return;

    const searchTerm = inventorySearch ? inventorySearch.value.trim().toLowerCase() : "";
    const selectedCategory = categoryFilter ? categoryFilter.value : "all";
    const selectedStatus = statusFilter ? statusFilter.value : "all";

    const filteredItems = inventoryItems.filter((item) => {
        const name = String(item.name || "").toLowerCase();
        const category = String(item.category || "").toLowerCase();
        const formattedCat = formatCategory(item.category).toLowerCase();
        const status = getInventoryStatus(item);

        const matchesSearch = name.includes(searchTerm) || category.includes(searchTerm) || formattedCat.includes(searchTerm);
        const matchesCategory = selectedCategory === "all" || category === selectedCategory;
        const matchesStatus = selectedStatus === "all" || status === selectedStatus;

        return matchesSearch && matchesCategory && matchesStatus;
    });

    inventoryTableBody.innerHTML = "";

    if (filteredItems.length === 0) {
        if (inventoryEmpty) inventoryEmpty.style.display = "block";
        updateStatistics();
        return;
    }

    if (inventoryEmpty) inventoryEmpty.style.display = "none";

    filteredItems.forEach((item) => {
        const row = createInventoryRow(item);
        if (item.id === selectedInventoryId) {
            row.classList.add("selected");
        }
        inventoryTableBody.appendChild(row);
    });

    updateStatistics();
}

// Helper to format/pluralize unit names cleanly (e.g. slices, scoops, shots, pumps, cc, ml, g, pcs)
function formatUnitName(unit, count) {
    const u = String(unit || "").trim().toLowerCase();
    const isPlural = count !== 1;

    switch (u) {
        case "slice":
            return isPlural ? "slices" : "slice";
        case "scoop":
        case "per scoop":
            return isPlural ? "scoops" : "scoop";
        case "shot":
        case "shots":
            return isPlural ? "shots" : "shot";
        case "pump":
        case "pumps":
            return isPlural ? "pumps" : "pump";
        case "cc":
            return "cc";
        default:
            return unit || "unit"; // ml, g, pcs, cc remain unchanged
    }
}
// Row template builder
function createInventoryRow(item) {
    const row = document.createElement("tr");
    row.dataset.inventoryId = item.id;
    row.title = "Double-click to edit details";

    const status = getInventoryStatus(item);
    const statusText = getStatusText(status);
    const statusClass = getStatusClass(status);
    const icon = getCategoryIcon(item.category);
    const updatedDate = formatDate(item.updatedAt);

    const currentBaseStock = Number(item.stock) || 0;
    const baseUnit = item.unit || "unit";
    const isPackaged = Boolean(item.isPackaged && item.capacityPerPackage > 0);

    let stockDisplayHTML = "";

    if (isPackaged) {
        const capacity = Number(item.capacityPerPackage);
        const fullPackages = Math.floor(currentBaseStock / capacity);
        const looseUnits = Math.round(currentBaseStock % capacity);
        const pkgName = item.packageType || "pkg";

        let breakdown = `${fullPackages} ${pkgName}s`;
        if (looseUnits > 0) {
            breakdown += ` + ${formatNumber(looseUnits)} ${formatUnitName(baseUnit, looseUnits)} left`;
        } else if (fullPackages === 0 && looseUnits === 0) {
            breakdown = `0 ${pkgName}s`;
        }

        stockDisplayHTML = `
            <div class="stock-dual-display">
                <strong>${escapeHTML(breakdown)}</strong>
                <span>(${formatNumber(currentBaseStock)} ${escapeHTML(formatUnitName(baseUnit, currentBaseStock))} total)</span>
            </div>
        `;
    } else {
        stockDisplayHTML = `
            <div class="stock-dual-display">
                <strong>${formatNumber(currentBaseStock)} ${escapeHTML(formatUnitName(baseUnit, currentBaseStock))}</strong>
            </div>
        `;
    }

    let minStockDisplay = `${formatNumber(item.minimumStock || 0)} ${formatUnitName(baseUnit, item.minimumStock || 0)}`;
    if (isPackaged) {
        const minPkgs = (Number(item.minimumStock || 0) / Number(item.capacityPerPackage)).toFixed(1);
        minStockDisplay = `${formatNumber(item.minimumStock)} ${formatUnitName(baseUnit, item.minimumStock || 0)} (~${minPkgs} ${item.packageType}s)`;
    }

    row.innerHTML = `
        <td>
            <div class="inventory-item-name">
                <div class="inventory-item-icon">
                    <i class="${icon}"></i>
                </div>
                <div>
                    <strong>${escapeHTML(item.name || "Unnamed Item")}</strong>
                    <span>${isPackaged ? `${item.capacityPerPackage} ${formatUnitName(baseUnit, item.capacityPerPackage)} per ${item.packageType}` : "Direct Recipe Item"}</span>
                </div>
            </div>
        </td>
        <td>${escapeHTML(formatCategory(item.category))}</td>
        <td>${stockDisplayHTML}</td>
        <td><strong>${escapeHTML(baseUnit)}</strong></td>
        <td>${minStockDisplay}</td>
        <td>
            <span class="inventory-status ${statusClass}">
                <i class="fa-solid fa-circle"></i>
                ${statusText}
            </span>
        </td>
        <td>${updatedDate}</td>
        <td>
            <div class="inventory-actions">
                <button
                    type="button"
                    class="inventory-action plus-stock-action"
                    title="Add Stock (Restock)"
                    data-action="add-stock"
                    data-id="${item.id}">
                    <i class="fa-solid fa-plus"></i>
                </button>
                <button
                    type="button"
                    class="inventory-action minus-stock-action"
                    title="Deduct Stock (Waste / Spoilage)"
                    data-action="minus-stock"
                    data-id="${item.id}">
                    <i class="fa-solid fa-minus"></i>
                </button>
            </div>
        </td>
    `;

    return row;
}

// Threshold status computation
function getInventoryStatus(item) {
    const stock = Number(item.stock) || 0;
    const minimum = Number(item.minimumStock) || 0;

    if (stock <= 0) return "out-of-stock";
    if (stock <= minimum) return "low-stock";
    return "in-stock";
}

function getStatusText(status) {
    switch (status) {
        case "in-stock": return "In Stock";
        case "low-stock": return "Low Stock";
        case "out-of-stock": return "Out of Stock";
        default: return "Unknown";
    }
}

function getStatusClass(status) {
    switch (status) {
        case "in-stock": return "status-in-stock";
        case "low-stock": return "status-low-stock";
        case "out-of-stock": return "status-out-of-stock";
        default: return "";
    }
}

// Summary badges update (3 metrics)
function updateStatistics() {
    let totalItems = 0;
    let inStock = 0;
    let attentionCount = 0;

    inventoryItems.forEach((item) => {
        totalItems++;
        const status = getInventoryStatus(item);

        if (status === "in-stock") inStock++;
        if (status === "low-stock" || status === "out-of-stock") attentionCount++;
    });

    if (statTotalItems) statTotalItems.textContent = totalItems;
    if (statInStock) statInStock.textContent = inStock;
    if (statLowStock) statLowStock.textContent = attentionCount;
}

// Unit packaging form helpers
function initPackagingConversionForm() {
    if (!hasPackagingToggle) return;

    hasPackagingToggle.addEventListener("change", () => {
        const isChecked = hasPackagingToggle.checked;
        if (packagingFields) packagingFields.style.display = isChecked ? "grid" : "none";
        updateConversionLabels();
    });

    inventoryUnit?.addEventListener("change", () => {
        const unit = inventoryUnit.value || "units";
        if (capacityUnitLabel) capacityUnitLabel.textContent = unit;
        updateConversionLabels();
    });

    packageTypeName?.addEventListener("change", updateConversionLabels);
    packageCapacity?.addEventListener("input", updateConversionLabels);
}

function updateConversionLabels() {
    const isPackaged = hasPackagingToggle?.checked;
    const baseUnit = inventoryUnit?.value || "units";
    const pkgName = packageTypeName?.value || "carton";

    if (capacityUnitLabel) {
        capacityUnitLabel.textContent = baseUnit;
    }

    if (isPackaged) {
        if (stockInputLabel) stockInputLabel.textContent = `Current Stock (${capitalize(pkgName)}s)`;
    } else {
        if (stockInputLabel) stockInputLabel.textContent = `Current Stock (${baseUnit})`;
    }
}

// Search and filter event listeners
inventorySearch?.addEventListener("input", renderInventory);
categoryFilter?.addEventListener("change", renderInventory);
statusFilter?.addEventListener("change", renderInventory);

// Modal state handlers
openInventoryModalBtn?.addEventListener("click", openAddInventoryModal);

function openAddInventoryModal() {
    editingInventoryId = null;

    if (inventoryModalTitle) inventoryModalTitle.textContent = "Add Inventory Item";
    if (inventoryForm) inventoryForm.reset();

    if (hasPackagingToggle) hasPackagingToggle.checked = false;
    if (packagingFields) packagingFields.style.display = "none";

    updateConversionLabels();
    openModal();
}

function openEditInventoryModal(inventoryId) {
    const item = inventoryItems.find((i) => i.id === inventoryId);
    if (!item) return;

    editingInventoryId = inventoryId;
    if (inventoryModalTitle) inventoryModalTitle.textContent = `Edit "${item.name}"`;

    inventoryName.value = item.name || "";
    inventoryCategory.value = item.category || "";
    inventoryUnit.value = item.unit || "pcs";

    const isPackaged = Boolean(item.isPackaged && item.capacityPerPackage > 0);
    hasPackagingToggle.checked = isPackaged;
    packagingFields.style.display = isPackaged ? "grid" : "none";

    if (isPackaged) {
        packageTypeName.value = item.packageType || "carton";
        packageCapacity.value = item.capacityPerPackage || 1000;
        inventoryStock.value = (Number(item.stock) / Number(item.capacityPerPackage)).toFixed(2);
        inventoryMinimum.value = (Number(item.minimumStock) / Number(item.capacityPerPackage)).toFixed(2);
    } else {
        inventoryStock.value = item.stock ?? 0;
        inventoryMinimum.value = item.minimumStock ?? 0;
    }

    updateConversionLabels();
    openModal();
}

function openModal() {
    if (!inventoryModal) return;
    inventoryModal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeModal() {
    if (!inventoryModal) return;
    inventoryModal.classList.remove("active");
    document.body.classList.remove("modal-open");
    editingInventoryId = null;
}

closeInventoryModalBtn?.addEventListener("click", closeModal);
cancelInventoryModalBtn?.addEventListener("click", closeModal);
inventoryModalOverlay?.addEventListener("click", closeModal);

// Inventory form submission
inventoryForm?.addEventListener("submit", async (event) => {
    event.preventDefault();

    const name = inventoryName.value.trim();
    const category = inventoryCategory.value;
    const unit = inventoryUnit.value;
    const isPackaged = hasPackagingToggle.checked;

    const rawStock = parseFloat(inventoryStock.value);
    const rawMin = parseFloat(inventoryMinimum.value);

    if (!name || !category || !unit || isNaN(rawStock) || rawStock < 0) {
        return;
    }

    let finalStockInBaseUnits = rawStock;
    let finalMinInBaseUnits = rawMin;
    let capacity = 1;
    let pkgType = "";

    if (isPackaged) {
        capacity = parseFloat(packageCapacity.value);
        pkgType = packageTypeName.value;

        if (isNaN(capacity) || capacity <= 0) {
            return;
        }

        finalStockInBaseUnits = Math.round(rawStock * capacity * 100) / 100;
        finalMinInBaseUnits = Math.round(rawMin * capacity * 100) / 100;
    }

    try {
        const saveButton = inventoryForm.querySelector(".inventory-save-button");
        if (saveButton) saveButton.disabled = true;

        const payload = {
            name,
            category,
            unit,
            stock: finalStockInBaseUnits,
            minimumStock: finalMinInBaseUnits,
            isPackaged: isPackaged,
            packageType: isPackaged ? pkgType : null,
            capacityPerPackage: isPackaged ? capacity : null,
            updatedAt: Date.now()
        };

        if (editingInventoryId) {
            const inventoryRef = ref(db, `inventory/${editingInventoryId}`);
            await update(inventoryRef, payload);
        } else {
            payload.createdAt = Date.now();
            const inventoryRef = ref(db, "inventory");
            const newItemRef = push(inventoryRef);
            await set(newItemRef, payload);
        }

        closeModal();
    } catch (error) {
        console.error("Save inventory error:", error);
    } finally {
        const saveButton = inventoryForm?.querySelector(".inventory-save-button");
        if (saveButton) saveButton.disabled = false;
    }
});

// Quick adjustment modal
function openStockModal(item, mode) {
    activeStockItem = item;
    activeStockMode = mode;

    const currentBaseStock = Number(item.stock) || 0;
    const baseUnit = item.unit || "unit";
    const isPackaged = Boolean(item.isPackaged && item.capacityPerPackage > 0);

    if (stockForm) stockForm.reset();

    const packageRadio = document.querySelector('input[name="adjustUnitType"][value="package"]');
    if (packageRadio) packageRadio.checked = true;

    if (isPackaged && adjustUnitSelectorGroup) {
        adjustUnitSelectorGroup.style.display = "flex";
        if (adjustPackageNameLabel) adjustPackageNameLabel.textContent = `${capitalize(item.packageType)}s`;
        if (adjustBaseUnitLabel) adjustBaseUnitLabel.textContent = `${formatUnitName(baseUnit, 2)} (Exact)`;
    } else if (adjustUnitSelectorGroup) {
        adjustUnitSelectorGroup.style.display = "none";
    }

    if (mode === "add") {
        if (stockModalTitle) stockModalTitle.textContent = `Restock "${item.name}"`;
        if (stockModalDescription) {
            stockModalDescription.innerHTML = `Add quantity to <strong>${escapeHTML(item.name)}</strong>:`;
        }
        if (confirmStockBtn) {
            confirmStockBtn.classList.remove("minus-btn");
            confirmStockBtn.innerHTML = `<i class="fa-solid fa-check"></i> Confirm Adjustment`;
        }
    } else {
        if (stockModalTitle) stockModalTitle.textContent = `Deduct from "${item.name}"`;
        if (stockModalDescription) {
            stockModalDescription.innerHTML = `Enter quantity to deduct:`;
        }
        if (confirmStockBtn) {
            confirmStockBtn.classList.add("minus-btn");
            confirmStockBtn.innerHTML = `<i class="fa-solid fa-minus"></i> Deduct Quantity`;
        }
    }

    if (stockCurrentBalance) {
        if (isPackaged) {
            const pkgs = (currentBaseStock / item.capacityPerPackage).toFixed(2);
            stockCurrentBalance.textContent = `Current Stock: ${formatNumber(currentBaseStock)} ${formatUnitName(baseUnit, currentBaseStock)} (~${pkgs} ${item.packageType}s)`;
        } else {
            stockCurrentBalance.textContent = `Current Stock: ${formatNumber(currentBaseStock)} ${formatUnitName(baseUnit, currentBaseStock)}`;
        }
    }

    if (stockModal) {
        stockModal.classList.add("active");
        document.body.classList.add("modal-open");
    }

    setTimeout(() => stockInputQuantity?.focus(), 50);
}

function closeStockModal() {
    if (!stockModal) return;
    stockModal.classList.remove("active");
    document.body.classList.remove("modal-open");
    activeStockItem = null;
}

closeStockModalBtn?.addEventListener("click", closeStockModal);
cancelStockModalBtn?.addEventListener("click", closeStockModal);
stockModalOverlay?.addEventListener("click", closeStockModal);

stockForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!activeStockItem) return;

    const quantityInput = parseFloat(stockInputQuantity.value);
    if (isNaN(quantityInput) || quantityInput <= 0) return;

    const isPackaged = Boolean(activeStockItem.isPackaged && activeStockItem.capacityPerPackage > 0);
    const adjustType = document.querySelector('input[name="adjustUnitType"]:checked')?.value || "base";

    let quantityInBaseUnits = quantityInput;
    if (isPackaged && adjustType === "package") {
        quantityInBaseUnits = quantityInput * Number(activeStockItem.capacityPerPackage);
    }

    const currentBaseStock = Number(activeStockItem.stock) || 0;
    let newStock = currentBaseStock;

    if (activeStockMode === "add") {
        newStock = currentBaseStock + quantityInBaseUnits;
    } else {
        if (quantityInBaseUnits > currentBaseStock) return;
        newStock = currentBaseStock - quantityInBaseUnits;
    }

    try {
        if (confirmStockBtn) confirmStockBtn.disabled = true;

        const inventoryRef = ref(db, `inventory/${activeStockItem.id}`);
        await update(inventoryRef, {
            stock: Math.round(newStock * 100) / 100,
            updatedAt: Date.now()
        });

        closeStockModal();
    } catch (error) {
        console.error("Stock adjustment error:", error);
    } finally {
        if (confirmStockBtn) confirmStockBtn.disabled = false;
    }
});

// Centered delete modal handlers
function openDeleteModal() {
    if (!selectedInventoryId) return;

    const item = inventoryItems.find((i) => i.id === selectedInventoryId);
    if (!item) return;

    if (deleteTargetItemName) {
        deleteTargetItemName.textContent = `"${item.name}"`;
    }

    if (deleteModal) {
        deleteModal.style.display = "flex";
        deleteModal.classList.add("active");
        document.body.classList.add("modal-open");
    }
}

function closeDeleteModal() {
    if (!deleteModal) return;
    deleteModal.style.display = "none";
    deleteModal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

openRemoveModalBtn?.addEventListener("click", openDeleteModal);
cancelDeleteModalBtn?.addEventListener("click", closeDeleteModal);
deleteModalOverlay?.addEventListener("click", closeDeleteModal);

confirmDeleteBtn?.addEventListener("click", async () => {
    if (!selectedInventoryId) return;

    try {
        confirmDeleteBtn.disabled = true;
        confirmDeleteBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Deleting...`;

        const inventoryRef = ref(db, `inventory/${selectedInventoryId}`);
        await remove(inventoryRef);

        selectedInventoryId = null;
        closeDeleteModal();
    } catch (error) {
        console.error("Delete inventory error:", error);
    } finally {
        confirmDeleteBtn.disabled = false;
        confirmDeleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Yes, Delete`;
    }
});

// Table selection and adjustment interactions
inventoryTableBody?.addEventListener("dblclick", (event) => {
    const row = event.target.closest("tr");
    if (!row) return;

    const inventoryId = row.dataset.inventoryId;
    if (inventoryId) {
        openEditInventoryModal(inventoryId);
    }
});

inventoryTableBody?.addEventListener("click", (event) => {
    const clickedRow = event.target.closest("tr");
    const actionBtn = event.target.closest(".inventory-action");

    if (clickedRow && !actionBtn) {
        const clickedId = clickedRow.dataset.inventoryId;

        if (selectedInventoryId === clickedId) {
            selectedInventoryId = null;
            clickedRow.classList.remove("selected");
        } else {
            document.querySelectorAll("#inventoryTableBody tr.selected").forEach((r) => r.classList.remove("selected"));
            selectedInventoryId = clickedId;
            clickedRow.classList.add("selected");
        }
        return;
    }

    if (!actionBtn) return;

    const action = actionBtn.dataset.action;
    const inventoryId = actionBtn.dataset.id;
    const item = inventoryItems.find((i) => i.id === inventoryId);
    if (!item) return;

    if (action === "add-stock") {
        openStockModal(item, "add");
    } else if (action === "minus-stock") {
        if ((Number(item.stock) || 0) <= 0) return;
        openStockModal(item, "minus");
    }
});

// ESC key keyboard listener
document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
        if (deleteModal?.classList.contains("active")) closeDeleteModal();
        else if (stockModal?.classList.contains("active")) closeStockModal();
        else if (inventoryModal?.classList.contains("active")) closeModal();
    }
});

// UI formatting utilities
function getCategoryIcon(category) {
    switch (String(category || "").toLowerCase()) {
        case "coffee-tea": return "fa-solid fa-mug-hot";
        case "dairy": return "fa-solid fa-cow";
        case "powders": return "fa-solid fa-mortar-pestle";
        case "syrups": return "fa-solid fa-bottle-droplet";
        case "toppings": return "fa-solid fa-stroopwafel";
        case "snacks": return "fa-solid fa-cookie-bite";
        case "produce": return "fa-solid fa-carrot";
        case "packaging": return "fa-solid fa-box-open";
        default: return "fa-solid fa-layer-group";
    }
}

function formatCategory(category) {
    switch (String(category || "").toLowerCase()) {
        case "coffee-tea": return "Coffee & Tea Base";
        case "dairy": return "Dairy & Milks";
        case "powders": return "Powders & Bases";
        case "syrups": return "Syrups & Sweeteners";
        case "toppings": return "Toppings, Sinkers & Mix-ins";
        case "snacks": return "Food & Snacks";
        case "produce": return "Fresh Produce & Kitchen Essentials";
        case "packaging": return "Cups & Packaging";
        default: return "Others";
    }
}

function formatNumber(number) {
    const value = Number(number);
    if (isNaN(value)) return "0";
    return value.toLocaleString("en-PH", {
        maximumFractionDigits: 2
    });
}

function formatDate(timestamp) {
    if (!timestamp) return "-";
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric"
    });
}

function capitalize(str) {
    if (!str) return "";
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}