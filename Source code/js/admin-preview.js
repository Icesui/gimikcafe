import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

onAuthStateChanged(auth, async (user) => {
    if (!user) return;

    try {
        const userRef = ref(database, `Users/${user.uid}`);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) return;

        const userData = snapshot.val();
        const role = (userData.role || "").toLowerCase().replace(/[\s_]/g, "");

        if (role === "admin" || role === "superadmin" || role === "owner") {
            enableAdminReadOnlyMode();
        }
    } catch (err) {
        console.warn("Admin preview check error:", err);
    }
});

function enableAdminReadOnlyMode() {
    if (window.location.pathname.includes("cart.html")) {
        window.location.replace("menu.html");
        return;
    }

    document.body.classList.add("admin-preview-mode");

    disableAdminRestrictedElements();

    const observer = new MutationObserver(disableAdminRestrictedElements);
    observer.observe(document.body, { childList: true, subtree: true });
}

function disableAdminRestrictedElements() {
    // 1. Cart Icons and Navbar Links: keep visible, completely disable clicks
    const cartElements = document.querySelectorAll(
        'a[href*="cart.html"], ' +
        '#cartBtn, ' +
        '#cartIcon, ' +
        '.cart-icon, ' +
        '.cart-link, ' +
        '.fa-cart-shopping, ' +
        '.fa-shopping-cart'
    );

    cartElements.forEach((el) => {
        const target = el.closest('a') || el;
        target.removeAttribute("title");
        target.style.removeProperty("display");
        target.style.setProperty("cursor", "default", "important");
        target.style.setProperty("pointer-events", "none", "important");

        if (!target.dataset.previewDisabled) {
            target.dataset.previewDisabled = "true";
            target.addEventListener("click", (e) => {
                e.preventDefault();
                e.stopPropagation();
                e.stopImmediatePropagation();
            }, true);
        }
    });

    // 2. Add to Cart / Order Now / Buy Now buttons: keep visible, completely disable clicks
    document.querySelectorAll("button, a").forEach((el) => {
        const text = el.textContent.toLowerCase().trim();
        if (
            text.includes("add to cart") ||
            text.includes("buy now") ||
            text === "order now" ||
            el.id === "addToCartBtn"
        ) {
            el.removeAttribute("title");
            el.style.removeProperty("display");
            el.style.setProperty("cursor", "default", "important");
            el.style.setProperty("pointer-events", "none", "important");

            if (!el.dataset.previewDisabled) {
                el.dataset.previewDisabled = "true";
                el.addEventListener("click", (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    e.stopImmediatePropagation();
                }, true);
            }
        }
    });
}