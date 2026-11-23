// GIMIK CAFE AUTHENTICATION

import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// CURRENT FIREBASE USER
let currentUser = null;

// AUTH STATE LISTENER
onAuthStateChanged(auth, async (user) => {
    currentUser = user || null;
    await updateAccountLink();
});

// GET CURRENT USER
function getCurrentUser() {
    return currentUser;
}

// CHECK LOGIN STATUS
function isLoggedIn() {
    return currentUser !== null;
}

// LOGOUT
async function logout() {
    try {
        await signOut(auth);
        window.location.href = "login.html";
    } catch (error) {
        console.error("Logout Error:", error);
        alert("Logout failed. Please try again.");
    }
}

// CHECK IF LOGGED IN USER HAS ADMIN PRIVILEGES
async function checkIsAdmin(uid) {
    if (!uid) return false;
    try {
        const userSnap = await get(ref(database, `Users/${uid}`));
        if (userSnap.exists()) {
            const data = userSnap.val();
            const role = (data.role || "").toLowerCase();
            const username = (data.username || "").toLowerCase();
            return role === "admin" || role === "superadmin" || role === "super admin" || username === "admin";
        }
    } catch (err) {
        console.warn("Could not verify admin role:", err);
    }
    return false;
}

// PROTECT CUSTOMER PAGE
function requireLogin() {
    if (!currentUser) {
        window.location.href = "login.html";
        return false;
    }
    return true;
}

// PROTECT ADMIN PAGE
async function requireAdmin() {
    if (!currentUser) {
        window.location.href = "login.html";
        return false;
    }
    const isAdmin = await checkIsAdmin(currentUser.uid);
    if (!isAdmin) {
        window.location.href = "customer-dashboard.html";
        return false;
    }
    return true;
}

// PROTECT SUPER ADMIN PAGE
async function requireSuperAdmin() {
    if (!currentUser) {
        window.location.href = "login.html";
        return false;
    }
    const isAdmin = await checkIsAdmin(currentUser.uid);
    if (!isAdmin) {
        window.location.href = "customer-dashboard.html";
        return false;
    }
    return true;
}

// UPDATE ACCOUNT & FOOTER LINKS DYNAMICALLY
async function updateAccountLink() {
    const accountLink = document.getElementById("accountLink");
    const footerAccountLink = document.getElementById("footerAccountLink");

    // If logged out, link to login
    if (!currentUser) {
        if (accountLink) {
            accountLink.href = "login.html";
            accountLink.setAttribute("aria-label", "Login");
            accountLink.innerHTML = `<i class="fa-regular fa-user"></i>`;
        }
        if (footerAccountLink) {
            footerAccountLink.href = "login.html";
            footerAccountLink.textContent = "Login";
        }
        return;
    }

    // Check if the current user is an admin
    const isAdmin = await checkIsAdmin(currentUser.uid);

    if (isAdmin) {
        if (accountLink) {
            accountLink.href = "admin/index.html";
            accountLink.setAttribute("aria-label", "Admin Panel");
            accountLink.setAttribute("title", "Back to Admin Panel");
            accountLink.innerHTML = `<i class="fa-solid fa-shield-halved"></i>`;
        }
        if (footerAccountLink) {
            footerAccountLink.href = "admin/index.html";
            footerAccountLink.textContent = "Admin Panel";
        }
    } else {
        if (accountLink) {
            accountLink.href = "customer-dashboard.html";
            accountLink.setAttribute("aria-label", "Customer Dashboard");
            accountLink.innerHTML = `<i class="fa-regular fa-user"></i>`;
        }
        if (footerAccountLink) {
            footerAccountLink.href = "customer-dashboard.html";
            footerAccountLink.textContent = "Account";
        }
    }
}

// Run update on DOM load
document.addEventListener("DOMContentLoaded", () => {
    updateAccountLink();
});

// EXPORT
export {
    getCurrentUser,
    isLoggedIn,
    logout,
    requireLogin,
    requireAdmin,
    requireSuperAdmin
};