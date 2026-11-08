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
const menuDateDisplay = document.getElementById("menuDateDisplay");
const openAddProductBtn = document.getElementById("openAddProductBtn");
const openDeleteProductBtn = document.getElementById("openDeleteProductBtn");
const searchInput = document.querySelector(".menu-search input");
const categoryFilter = document.querySelector(".menu-filter select");
const productTableBody = document.querySelector(".menu-table tbody");
const productCount = document.getElementById("menuCountSubtitle");

// Edit / Add modal elements
const productModal = document.querySelector(".product-modal:not(#deleteProductModal)");
const modalOverlay = productModal?.querySelector(".product-modal-overlay");
const modalCloseBtn = productModal?.querySelector(".modal-close");
const cancelProductBtn = productModal?.querySelector(".cancel-product-btn");
const saveProductBtn = productModal?.querySelector(".save-product-btn");
const modalTitle = document.getElementById("modalTitle") || productModal?.querySelector(".product-modal-header h2");

const productName = document.getElementById("productName");
const productCategory = document.getElementById("productCategory");
const productTemperature = document.getElementById("productTemperature");
const productDescription = document.getElementById("productDescription");
const productStatus = document.getElementById("productStatus");

const pricesList = document.querySelector(".prices-list");
const addPriceBtn = document.querySelector(".add-price-btn");

// Per-variant recipe elements
const variantRecipeTabs = document.getElementById("variantRecipeTabs");
const variantIngredientsList = document.getElementById("variantIngredientsList");
const addVariantIngredientBtn = document.getElementById("addVariantIngredientBtn");

const largeProductImage = document.querySelector(".large-product-image img");
const changeImageBtn = document.querySelector(".change-image-btn");

// Delete confirmation modal elements
const deleteProductModal = document.getElementById("deleteProductModal");
const deleteModalPrompt = document.getElementById("deleteModalPrompt");
const cancelDeleteBtn = document.getElementById("cancelDeleteBtn");
const confirmDeleteBtn = document.getElementById("confirmDeleteBtn");

// Runtime state
let products = [];
let allInventoryItems = [];
let currentProductId = null;
let currentImage = "../Asset/Square Logo.jpg";
let selectedProductId = null;

// Tracks working variant recipes inside the modal: { [sizeName]: [ {name, amount, unit} ] }
let variantRecipesState = {};
let activeVariantSize = "";

// System initialization
const initMenu = () => {
    updateDateDisplay();
    initModalEvents();
    listenToProducts();
    listenToInventory();
};

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then(initMenu).catch(initMenu);
} else {
    initMenu();
}

function updateDateDisplay() {
    if (!menuDateDisplay) return;
    const now = new Date();
    menuDateDisplay.textContent = now.toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric"
    });
}

// Real-time Firebase sync
function listenToProducts() {
    const productsRef = ref(db, "products");

    onValue(productsRef, (snapshot) => {
        if (!snapshot.exists()) {
            products = [];
            renderProducts();
            return;
        }

        const data = snapshot.val();
        products = Object.entries(data).map(([id, product]) => ({
            id,
            ...product
        }));

        renderProducts();
    }, (error) => {
        console.error("Error listening to products:", error);
        if (productTableBody) {
            productTableBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; padding: 40px; color: #a45c55;">
                        Failed to load products: ${escapeHTML(error.message)}
                    </td>
                </tr>
            `;
        }
    });
}

function listenToInventory() {
    const inventoryRef = ref(db, "inventory");
    onValue(inventoryRef, (snapshot) => {
        allInventoryItems = [];
        if (snapshot.exists()) {
            const data = snapshot.val();
            allInventoryItems = Object.entries(data).map(([id, item]) => ({
                id,
                name: item.name || "Unnamed Item",
                unit: item.unit || "",
                category: item.category || ""
            }));
        }
    }, (error) => {
        console.warn("Could not load inventory suggestions:", error);
    });
}

// Render products table
function renderProducts() {
    if (!productTableBody) return;

    const searchTerm = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const selectedCategory = categoryFilter ? categoryFilter.value.trim() : "All Categories";

    const filteredProducts = products.filter((product) => {
        const name = String(product.name || "").toLowerCase();
        const cat = String(product.category || "").trim();

        const matchesSearch = name.includes(searchTerm);
        const matchesCategory = 
            selectedCategory === "All Categories" || 
            selectedCategory === "" ||
            cat.toLowerCase() === selectedCategory.toLowerCase();

        return matchesSearch && matchesCategory;
    });

    productTableBody.innerHTML = "";

    if (filteredProducts.length === 0) {
        productTableBody.innerHTML = `
            <tr>
                <td colspan="4" class="no-products" style="text-align: center; padding: 40px; color: #8a999a;">
                    No products found.
                </td>
            </tr>
        `;
        updateCountDisplay(0);
        return;
    }

    filteredProducts.forEach((product) => {
        const row = document.createElement("tr");
        row.dataset.productId = product.id;
        row.title = "Double-click to edit product details";

        if (product.id === selectedProductId) {
            row.classList.add("selected");
        }

        const isAvailable = normalizeStatus(product.status, product.isAvailable) === "Available";
        if (!isAvailable) {
            row.classList.add("is-unavailable");
        }

        const imageSrc = product.image || "../Asset/Square Logo.jpg";
        const variants = getNormalizedVariants(product);
        let pricesHtml = "";

        if (variants.length > 0) {
            pricesHtml = `
                <div class="product-prices-display">
                    ${variants.map(v => `
                        <span class="price-badge">
                            ${v.size ? `<span>${escapeHTML(v.size)}:</span>` : ""}
                            <strong>${formatPeso(v.price)}</strong>
                        </span>
                    `).join("")}
                </div>
            `;
        } else {
            pricesHtml = `<span class="product-price">${formatPeso(0)}</span>`;
        }

        row.innerHTML = `
            <td>
                <div class="product-info">
                    <div class="product-image">
                        <img src="${escapeHTML(imageSrc)}" alt="${escapeHTML(product.name)}">
                    </div>
                    <div>
                        <strong>${escapeHTML(product.name || "Unnamed")}</strong>
                    </div>
                </div>
            </td>
            <td><span class="product-category">${escapeHTML(product.category || "Uncategorized")}</span></td>
            <td>${pricesHtml}</td>
            <td>
                <button type="button" 
                    class="product-status-btn ${isAvailable ? 'available' : 'unavailable'}" 
                    data-action="toggle-status" 
                    data-product-id="${product.id}"
                    title="Click to toggle availability">
                    <i class="fa-solid ${isAvailable ? 'fa-check' : 'fa-xmark'}"></i>
                    <span>${isAvailable ? 'Available' : 'Unavailable'}</span>
                </button>
            </td>
        `;

        productTableBody.appendChild(row);
    });

    updateCountDisplay(filteredProducts.length);
}

function updateCountDisplay(count) {
    if (productCount) {
        productCount.textContent = `${count} ${count === 1 ? "product" : "products"}`;
    }
}

if (searchInput) searchInput.addEventListener("input", renderProducts);
if (categoryFilter) categoryFilter.addEventListener("change", renderProducts);

// Single click to select, double click to edit
if (productTableBody) {
    productTableBody.addEventListener("dblclick", (event) => {
        const row = event.target.closest("tr");
        if (!row) return;

        const productId = row.dataset.productId;
        if (productId) {
            openEditProductModal(productId);
        }
    });

    productTableBody.addEventListener("click", async (event) => {
        const toggleBtn = event.target.closest('[data-action="toggle-status"]');
        const clickedRow = event.target.closest("tr");

        if (toggleBtn) {
            const productId = toggleBtn.dataset.productId;
            const product = products.find(p => p.id === productId);
            if (!product) return;

            const isCurrentlyAvailable = normalizeStatus(product.status, product.isAvailable) === "Available";
            const newStatus = isCurrentlyAvailable ? "Unavailable" : "Available";

            try {
                toggleBtn.disabled = true;
                await update(ref(db, `products/${productId}`), {
                    status: newStatus,
                    isAvailable: newStatus === "Available",
                    updatedAt: Date.now()
                });
            } catch (err) {
                console.error("Failed to toggle availability:", err);
            } finally {
                toggleBtn.disabled = false;
            }
            return;
        }

        if (clickedRow) {
            const clickedId = clickedRow.dataset.productId;
            if (selectedProductId === clickedId) {
                selectedProductId = null;
                clickedRow.classList.remove("selected");
            } else {
                document.querySelectorAll(".menu-table tbody tr.selected").forEach((r) => r.classList.remove("selected"));
                selectedProductId = clickedId;
                clickedRow.classList.add("selected");
            }
        }
    });
}

// Delete confirmation modal
function openDeleteProductModal() {
    if (!selectedProductId) return;

    const product = products.find((item) => item.id === selectedProductId);
    if (!product || !deleteProductModal) return;

    if (deleteModalPrompt) {
        deleteModalPrompt.innerHTML = `Are you sure you want to delete <strong>"${escapeHTML(product.name)}"</strong>?`;
    }

    deleteProductModal.style.display = "flex";
    deleteProductModal.classList.add("active");
    document.body.classList.add("modal-open");
}

function closeDeleteModal() {
    if (!deleteProductModal) return;
    deleteProductModal.style.display = "none";
    deleteProductModal.classList.remove("active");
    document.body.classList.remove("modal-open");
}

// Modal controls and form population
function openAddProductModal() {
    currentProductId = null;
    currentImage = "../Asset/Square Logo.jpg";
    variantRecipesState = {};
    activeVariantSize = "";

    if (modalTitle) modalTitle.textContent = "Add Product";
    if (saveProductBtn) {
        saveProductBtn.innerHTML = `<i class="fa-solid fa-check"></i> Save Product`;
    }

    resetProductForm();
    showProductModal();
}

function openEditProductModal(productId) {
    const product = products.find((item) => item.id === productId);
    if (!product) return;

    currentProductId = productId;
    currentImage = product.image || "../Asset/Square Logo.jpg";
    variantRecipesState = {};
    activeVariantSize = "";

    if (modalTitle) modalTitle.textContent = "Edit Product";
    if (saveProductBtn) {
        saveProductBtn.innerHTML = `<i class="fa-solid fa-check"></i> Save Changes`;
    }

    productName.value = product.name || "";
    productCategory.value = product.category || "Coffee";
    if (productTemperature) {
        productTemperature.value = product.temperatureOption || (isFoodCategory(product.category) ? "none" : "both");
    }
    productDescription.value = product.description || "";
    productStatus.value = normalizeStatus(product.status, product.isAvailable);

    if (largeProductImage) largeProductImage.src = currentImage;

    const variants = getNormalizedVariants(product);

    variants.forEach(v => {
        const size = v.size || "Hot (16oz)";
        variantRecipesState[size] = Array.isArray(v.ingredients) && v.ingredients.length > 0
            ? [...v.ingredients]
            : (Array.isArray(product.ingredients) ? [...product.ingredients] : []);
    });

    renderPrices(variants);
    syncVariantTabs();

    showProductModal();
}

function resetProductForm() {
    if (productName) productName.value = "";
    if (productCategory) productCategory.value = "Coffee";
    if (productTemperature) productTemperature.value = "both";
    if (productDescription) productDescription.value = "";
    if (productStatus) productStatus.value = "Available";
    if (largeProductImage) largeProductImage.src = "../Asset/Square Logo.jpg";

    variantRecipesState = {};
    activeVariantSize = "";

    renderPrices([]);
    syncVariantTabs();
}

function showProductModal() {
    if (productModal) {
        productModal.style.display = "flex";
        productModal.classList.add("active");
    }
    document.body.classList.add("modal-open");
}

function closeProductModal() {
    if (productModal) {
        productModal.style.display = "none";
        productModal.classList.remove("active");
    }
    document.body.classList.remove("modal-open");
    currentProductId = null;
}

if (productCategory) {
    productCategory.addEventListener("change", () => {
        const cat = productCategory.value;
        if (isFoodCategory(cat)) {
            if (productTemperature) productTemperature.value = "none";
        } else {
            if (productTemperature && productTemperature.value === "none") {
                productTemperature.value = "both";
            }
        }
        syncVariantTabs();
    });
}

if (productTemperature) {
    productTemperature.addEventListener("change", () => {
        syncVariantTabs();
    });
}

function isFoodCategory(cat) {
    const c = String(cat || "").toLowerCase();
    return c.includes("snack") || c.includes("food");
}

// Sizes & prices builder
function renderPrices(variants) {
    if (!pricesList) return;
    pricesList.innerHTML = "";

    if (!variants || variants.length === 0) {
        updatePriceEmptyState();
        return;
    }

    variants.forEach((v) => addPriceRow(v.size, v.price));
    updatePriceNumbers();
}

function updatePriceEmptyState() {
    if (!pricesList) return;
    const rows = pricesList.querySelectorAll(".price-row");
    if (rows.length === 0) {
        pricesList.innerHTML = `
            <div class="empty-price-hint">
                <i class="fa-solid fa-circle-info"></i>
                No sizes added yet. Click <strong>"+ Add Size &amp; Price"</strong> below to create your first variant.
            </div>
        `;
    }
}

function addPriceRow(size = "", price = "") {
    if (!pricesList) return;

    const emptyHint = pricesList.querySelector(".empty-price-hint");
    if (emptyHint) emptyHint.remove();

    const isSnack = isFoodCategory(productCategory ? productCategory.value : "");
    const temp = productTemperature ? productTemperature.value : "both";

    let defaultSize = size;
    if (!defaultSize) {
        if (isSnack) defaultSize = "Solo";
        else if (temp === "iced-only") defaultSize = "Iced (16oz)";
        else defaultSize = "Hot (16oz)";
    }

    const row = document.createElement("div");
    row.className = "price-row";
    row.innerHTML = `
        <div class="price-number">1</div>
        <select class="variant-size">
            <optgroup label="Drinks (Hot)">
                <option value="Hot (16oz)" ${defaultSize === "Hot (16oz)" ? "selected" : ""}>Hot (16oz)</option>
            </optgroup>
            <optgroup label="Drinks (Iced)">
                <option value="Iced (16oz)" ${defaultSize === "Iced (16oz)" ? "selected" : ""}>Iced (16oz)</option>
                <option value="Iced (22oz)" ${defaultSize === "Iced (22oz)" ? "selected" : ""}>Iced (22oz)</option>
            </optgroup>
            <optgroup label="Food / Snacks">
                <option value="Solo" ${defaultSize === "Solo" ? "selected" : ""}>Solo</option>
                <option value="Barkada" ${defaultSize === "Barkada" ? "selected" : ""}>Barkada</option>
            </optgroup>
        </select>
        <div class="price-input">
            <span>₱</span>
            <input type="number" class="variant-price" value="${price !== "" && price !== null ? price : ""}" min="0" step="0.01" placeholder="0.00">
        </div>
        <button type="button" class="remove-price" aria-label="Remove">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    pricesList.appendChild(row);

    row.querySelector(".variant-size").addEventListener("change", () => {
        syncVariantTabs();
    });

    updatePriceNumbers();
}

if (addPriceBtn) {
    addPriceBtn.addEventListener("click", () => {
        addPriceRow();
        syncVariantTabs();
    });
}

if (pricesList) {
    pricesList.addEventListener("click", (event) => {
        const removeBtn = event.target.closest(".remove-price");
        if (removeBtn) {
            const row = removeBtn.closest(".price-row");
            if (row) {
                row.remove();
                updatePriceNumbers();
                updatePriceEmptyState();
                syncVariantTabs();
            }
        }
    });
}

function updatePriceNumbers() {
    if (!pricesList) return;
    const rows = pricesList.querySelectorAll(".price-row");
    rows.forEach((row, index) => {
        const num = row.querySelector(".price-number");
        if (num) num.textContent = index + 1;
    });
}

function getNormalizedVariants(product) {
    if (Array.isArray(product.variants) && product.variants.length > 0) {
        return product.variants;
    }
    if (product.price !== undefined && product.price !== null && product.price !== "") {
        return [{
            size: product.size || "Hot (16oz)",
            price: Number(product.price) || 0,
            ingredients: Array.isArray(product.ingredients) ? product.ingredients : []
        }];
    }
    return [];
}

// Variant-specific recipes
function syncVariantTabs() {
    if (!variantRecipeTabs) return;

    saveActiveVariantIngredients();

    const currentSizes = [];
    const sizeSelects = pricesList ? pricesList.querySelectorAll(".variant-size") : [];
    sizeSelects.forEach(sel => {
        const val = sel.value.trim();
        if (val && !currentSizes.includes(val)) {
            currentSizes.push(val);
        }
    });

    if (currentSizes.length === 0) {
        variantRecipeTabs.innerHTML = "";
        activeVariantSize = "";
        renderActiveVariantIngredients();
        return;
    }

    currentSizes.forEach(size => {
        if (!variantRecipesState[size]) {
            variantRecipesState[size] = [];
        }
    });

    if (!currentSizes.includes(activeVariantSize)) {
        activeVariantSize = currentSizes[0];
    }

    variantRecipeTabs.innerHTML = "";
    currentSizes.forEach(size => {
        const tabBtn = document.createElement("button");
        tabBtn.type = "button";
        tabBtn.className = `variant-recipe-tab ${size === activeVariantSize ? 'active' : ''}`;
        tabBtn.textContent = size;

        tabBtn.addEventListener("click", () => {
            saveActiveVariantIngredients();
            activeVariantSize = size;
            document.querySelectorAll(".variant-recipe-tab").forEach(t => t.classList.remove("active"));
            tabBtn.classList.add("active");
            renderActiveVariantIngredients();
        });

        variantRecipeTabs.appendChild(tabBtn);
    });

    renderActiveVariantIngredients();
}

function saveActiveVariantIngredients() {
    if (!variantIngredientsList || !activeVariantSize) return;
    const rows = variantIngredientsList.querySelectorAll(".ingredient-row");
    const list = [];

    rows.forEach(row => {
        const nameInput = row.querySelector("input.ingredient-input");
        const amountInput = row.querySelector("input.ingredient-amount");
        const unitBadge = row.querySelector(".ingredient-unit-badge");

        const name = nameInput ? nameInput.value.trim() : "";
        const amount = amountInput ? parseFloat(amountInput.value) : 1;
        const unit = unitBadge ? unitBadge.textContent.trim() : "unit";

        if (name) {
            list.push({
                name,
                amount: !isNaN(amount) && amount > 0 ? amount : 1,
                unit: (unit === "-" || !unit) ? "unit" : unit
            });
        }
    });

    variantRecipesState[activeVariantSize] = list;
}

function renderActiveVariantIngredients() {
    if (!variantIngredientsList) return;
    variantIngredientsList.innerHTML = "";

    if (!activeVariantSize) {
        variantIngredientsList.innerHTML = `
            <div class="empty-ingredient-hint">
                <i class="fa-solid fa-arrow-up"></i>
                Please add at least one <strong>Size &amp; Price</strong> first to configure its recipe.
            </div>
        `;
        return;
    }

    const activeList = variantRecipesState[activeVariantSize] || [];

    if (activeList.length === 0) {
        variantIngredientsList.innerHTML = `
            <div class="empty-ingredient-hint">
                <i class="fa-solid fa-mortar-pestle"></i>
                No ingredients added for <strong>"${escapeHTML(activeVariantSize)}"</strong>. Click <strong>"+ Add Ingredient to this Size"</strong> below.
            </div>
        `;
        return;
    }

    activeList.forEach(ing => {
        if (typeof ing === "string") {
            addIngredientRow(ing, 1, "");
        } else {
            addIngredientRow(ing.name || "", ing.amount || 1, ing.unit || "");
        }
    });

    updateIngredientNumbers();
}

function addIngredientRow(selectedName = "", amount = "", unit = "") {
    if (!variantIngredientsList || !activeVariantSize) return;

    const emptyHint = variantIngredientsList.querySelector(".empty-ingredient-hint");
    if (emptyHint) emptyHint.remove();

    let matchedUnit = unit;
    if (!matchedUnit && selectedName) {
        const inv = allInventoryItems.find(i => (i.name || "").toLowerCase() === selectedName.toLowerCase());
        if (inv && inv.unit) matchedUnit = inv.unit;
    }

    const row = document.createElement("div");
    row.className = "ingredient-row";
    row.innerHTML = `
        <div class="ingredient-number">1</div>
        <div class="custom-ingredient-select">
            <input 
                type="text" 
                class="ingredient-input" 
                placeholder="Select recipe ingredient..." 
                value="${escapeHTML(selectedName)}"
                autocomplete="off">
            <i class="fa-solid fa-chevron-down dropdown-arrow-icon"></i>
            <div class="ingredient-dropdown-menu"></div>
        </div>
        <div class="ingredient-amount-wrap">
            <input 
                type="number" 
                class="ingredient-amount" 
                placeholder="Qty" 
                min="0.01" 
                step="any" 
                value="${amount !== "" && amount !== null ? amount : "1"}">
            <span class="ingredient-unit-badge">${escapeHTML(matchedUnit || "-")}</span>
        </div>
        <button type="button" class="remove-ingredient" aria-label="Remove">
            <i class="fa-solid fa-trash"></i>
        </button>
    `;

    variantIngredientsList.appendChild(row);
    initCustomDropdown(row);
    updateIngredientNumbers();
}

function initCustomDropdown(row) {
    const selectWrapper = row.querySelector(".custom-ingredient-select");
    const nameInput = selectWrapper.querySelector("input.ingredient-input");
    const menu = selectWrapper.querySelector(".ingredient-dropdown-menu");
    const unitBadge = row.querySelector(".ingredient-unit-badge");

    function renderOptions(filterText = "") {
        const search = filterText.toLowerCase().trim();
        const matches = allInventoryItems.filter(item => 
            (item.name || "").toLowerCase().includes(search)
        );

        if (matches.length === 0) {
            menu.innerHTML = `<div class="ingredient-dropdown-empty">No matching ingredients</div>`;
            return;
        }

        menu.innerHTML = matches.map(item => `
            <div class="ingredient-dropdown-item" data-value="${escapeHTML(item.name)}" data-unit="${escapeHTML(item.unit || "-")}">
                <span>${escapeHTML(item.name)}</span>
                ${item.unit ? `<span class="ingredient-item-unit">${escapeHTML(item.unit)}</span>` : ""}
            </div>
        `).join("");
    }

    nameInput.addEventListener("focus", () => {
        document.querySelectorAll(".custom-ingredient-select.is-open").forEach(w => {
            if (w !== selectWrapper) w.classList.remove("is-open");
        });
        renderOptions(nameInput.value);
        selectWrapper.classList.add("is-open");
    });

    nameInput.addEventListener("input", () => {
        renderOptions(nameInput.value);
        selectWrapper.classList.add("is-open");
    });

    menu.addEventListener("mousedown", (e) => {
        const item = e.target.closest(".ingredient-dropdown-item");
        if (item) {
            nameInput.value = item.dataset.value;
            if (unitBadge) {
                unitBadge.textContent = item.dataset.unit || "-";
            }
            selectWrapper.classList.remove("is-open");
        }
    });

    document.addEventListener("mousedown", (e) => {
        if (!selectWrapper.contains(e.target)) {
            selectWrapper.classList.remove("is-open");
        }
    });
}

if (addVariantIngredientBtn) {
    addVariantIngredientBtn.addEventListener("click", () => {
        if (!activeVariantSize) return;
        addIngredientRow();
    });
}

if (variantIngredientsList) {
    variantIngredientsList.addEventListener("click", (event) => {
        const removeBtn = event.target.closest(".remove-ingredient");
        if (removeBtn) {
            const row = removeBtn.closest(".ingredient-row");
            if (row) {
                row.remove();
                updateIngredientNumbers();
                const remaining = variantIngredientsList.querySelectorAll(".ingredient-row");
                if (remaining.length === 0) {
                    renderActiveVariantIngredients();
                }
            }
        }
    });
}

function updateIngredientNumbers() {
    if (!variantIngredientsList) return;
    const rows = variantIngredientsList.querySelectorAll(".ingredient-row");
    rows.forEach((row, index) => {
        const num = row.querySelector(".ingredient-number");
        if (num) num.textContent = index + 1;
    });
}

// Save / update to Firebase
async function saveProduct() {
    saveActiveVariantIngredients();

    const name = productName.value.trim();
    const category = productCategory.value;
    const temperatureOption = productTemperature ? productTemperature.value : "both";
    const description = productDescription ? productDescription.value.trim() : "";
    const status = productStatus.value;

    if (!name || !category || category === "All Categories") return;

    const rows = pricesList ? pricesList.querySelectorAll(".price-row") : [];
    const variants = [];

    rows.forEach((row) => {
        const sizeSelect = row.querySelector(".variant-size");
        const priceInput = row.querySelector(".variant-price");

        const size = sizeSelect ? sizeSelect.value : "Hot (16oz)";
        const priceVal = priceInput ? parseFloat(priceInput.value) : NaN;

        if (!isNaN(priceVal)) {
            variants.push({
                size: size,
                price: priceVal,
                ingredients: variantRecipesState[size] || []
            });
        }
    });

    if (variants.length === 0) return;

    const combinedIngredients = [];
    Object.values(variantRecipesState).flat().forEach(item => {
        if (!combinedIngredients.some(c => c.name.toLowerCase() === item.name.toLowerCase())) {
            combinedIngredients.push(item);
        }
    });

    const productData = {
        name,
        category,
        temperatureOption,
        variants,
        price: variants[0].price,
        size: variants[0].size,
        description,
        ingredients: combinedIngredients,
        status,
        isAvailable: status === "Available",
        image: currentImage || "../Asset/Square Logo.jpg",
        updatedAt: Date.now()
    };

    try {
        saveProductBtn.disabled = true;

        if (!currentProductId) {
            productData.createdAt = Date.now();
            const newRef = push(ref(db, "products"));
            await set(newRef, productData);
        } else {
            await update(ref(db, `products/${currentProductId}`), productData);
        }

        closeProductModal();
    } catch (error) {
        console.error("Save error:", error);
    } finally {
        saveProductBtn.disabled = false;
    }
}

// Image picker
function openImagePicker() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/png,image/jpeg,image/webp";

    input.addEventListener("change", () => {
        const file = input.files[0];
        if (!file || file.size > 2 * 1024 * 1024) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            currentImage = event.target.result;
            if (largeProductImage) {
                largeProductImage.src = currentImage;
            }
        };
        reader.readAsDataURL(file);
    });

    input.click();
}

// Modal event bindings
function initModalEvents() {
    if (openAddProductBtn) openAddProductBtn.addEventListener("click", openAddProductModal);
    if (openDeleteProductBtn) openDeleteProductBtn.addEventListener("click", openDeleteProductModal);
    if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeProductModal);
    if (cancelProductBtn) cancelProductBtn.addEventListener("click", closeProductModal);
    if (modalOverlay) modalOverlay.addEventListener("click", closeProductModal);
    if (saveProductBtn) saveProductBtn.addEventListener("click", saveProduct);

    if (changeImageBtn) changeImageBtn.addEventListener("click", openImagePicker);

    if (cancelDeleteBtn) cancelDeleteBtn.addEventListener("click", closeDeleteModal);

    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener("click", async () => {
            if (!selectedProductId) return;
            try {
                confirmDeleteBtn.disabled = true;
                confirmDeleteBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Deleting...`;
                await remove(ref(db, `products/${selectedProductId}`));
                selectedProductId = null;
                closeDeleteModal();
            } catch (error) {
                console.error("Delete product error:", error);
            } finally {
                confirmDeleteBtn.disabled = false;
                confirmDeleteBtn.innerHTML = `<i class="fa-solid fa-trash"></i> Yes, Delete`;
            }
        });
    }

    if (deleteProductModal) {
        const overlay = deleteProductModal.querySelector(".product-modal-overlay");
        if (overlay) overlay.addEventListener("click", closeDeleteModal);
    }

    document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") {
            closeProductModal();
            closeDeleteModal();
        }
    });
}

// Helpers
function normalizeStatus(status, isAvailable) {
    if (isAvailable === false) return "Unavailable";
    if (status === "Unavailable" || status === "unavailable" || status === "inactive") {
        return "Unavailable";
    }
    return "Available";
}

function formatPeso(amount) {
    return new Intl.NumberFormat("en-PH", {
        style: "currency",
        currency: "PHP",
        minimumFractionDigits: 2
    }).format(amount);
}

function escapeHTML(value) {
    const div = document.createElement("div");
    div.textContent = value ?? "";
    return div.innerHTML;
}