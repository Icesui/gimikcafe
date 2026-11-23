import { auth, database } from "./firebase-config.js";
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

const db = database;
let authenticatedAdmin = null;
let resolveAdmin;

const adminReady = new Promise((resolve) => {
    resolveAdmin = resolve;
});

onAuthStateChanged(auth, async (user) => {
    if (!user) {
        window.location.href = "../login.html";
        return;
    }

    try {
        const userRef = ref(db, "Users/" + user.uid);
        const snapshot = await get(userRef);

        if (!snapshot.exists()) {
            alert("Your account information could not be found.");
            await signOut(auth);
            window.location.href = "../login.html";
            return;
        }

        const userData = snapshot.val();
        const role = userData.role || "";
        const normalizedRole = role.toLowerCase().replace(/[\s_]/g, "");

        if (
            normalizedRole !== "admin" &&
            normalizedRole !== "superadmin" &&
            normalizedRole !== "owner"
        ) {
            alert("Access denied. Admin privileges are required.");
            window.location.href = "../index.html";
            return;
        }

        authenticatedAdmin = {
            uid: user.uid,
            email: user.email,
            ...userData
        };

        displayAdminInformation(authenticatedAdmin);
        setupAdminProfilePopup(authenticatedAdmin);
        resolveAdmin(authenticatedAdmin);

        document.dispatchEvent(
            new CustomEvent("adminAuthenticated", {
                detail: authenticatedAdmin
            })
        );
    } catch (error) {
        alert("Unable to verify your admin account.");
        window.location.href = "../login.html";
    }
});

function displayAdminInformation(admin) {
    const adminName = document.getElementById("adminName");
    const adminRole = document.getElementById("adminRole");

    if (adminName) {
        adminName.textContent =
            admin.firstname ||
            admin.firstName ||
            admin.fullName ||
            admin.username ||
            "Admin";
    }

    if (adminRole) {
        const roleClean = (admin.role || "").toLowerCase().replace(/[\s_]/g, "");
        if (roleClean === "superadmin" || roleClean === "owner") {
            adminRole.textContent = "Super Admin";
        } else {
            adminRole.textContent = "Admin";
        }
    }
}

function setupAdminProfilePopup(admin) {
    const profileButton = document.getElementById("adminProfileButton");
    const profileOverlay = document.getElementById("adminProfileOverlay");
    const closeButton = document.getElementById("closeAdminProfile");
    const continueButton = document.getElementById("adminProfileContinue");
    const profileName = document.getElementById("adminProfileName");
    const profileContact = document.getElementById("adminProfileContact");
    const profileRole = document.getElementById("adminProfileRole");

    if (profileName) {
        profileName.textContent =
            admin.firstname ||
            admin.firstName ||
            admin.fullName ||
            admin.username ||
            "Admin";
    }

    if (profileContact) {
        profileContact.textContent =
            admin.contactNumber ||
            admin.contact ||
            "Not provided";
    }

    if (profileRole) {
        const roleClean = (admin.role || "").toLowerCase().replace(/[\s_]/g, "");
        profileRole.textContent =
            (roleClean === "superadmin" || roleClean === "owner")
                ? "Super Admin"
                : "Admin";
    }

    if (profileButton && profileOverlay) {
        profileButton.addEventListener("click", () => {
            profileOverlay.classList.add("show");
        });
    }

    if (closeButton && profileOverlay) {
        closeButton.addEventListener("click", () => {
            profileOverlay.classList.remove("show");
        });
    }

    if (profileOverlay) {
        profileOverlay.addEventListener("click", (event) => {
            if (event.target === profileOverlay) {
                profileOverlay.classList.remove("show");
            }
        });
    }

    if (continueButton && profileOverlay) {
        continueButton.addEventListener("click", () => {
            profileOverlay.classList.remove("show");
        });
    }
}

function setupSidebarToggle() {
    const toggleBtns = document.querySelectorAll(".sidebar-toggle-btn, #sidebarToggleBtn");
    const toggleIcons = document.querySelectorAll(".sidebar-toggle-btn i, #sidebarToggleIcon");
    const adminPage = document.querySelector(".admin-page");
    const sidebar = document.querySelector(".admin-sidebar");
    const STORAGE_KEY = "gimik_admin_sidebar_collapsed";

    if (!adminPage) return;

    const savedState = localStorage.getItem(STORAGE_KEY);
    if (savedState === "true") {
        adminPage.classList.add("sidebar-collapsed");
    }

    toggleBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            const isTablet = window.innerWidth <= 992 && window.innerWidth > 600;

            if (isTablet && sidebar) {
                const isManualExpanded = sidebar.classList.toggle("manual-expanded");
                toggleIcons.forEach((icon) => {
                    icon.style.transform = isManualExpanded ? "rotate(0deg)" : "rotate(180deg)";
                });
            } else {
                const isCollapsed = adminPage.classList.toggle("sidebar-collapsed");
                localStorage.setItem(STORAGE_KEY, isCollapsed);
            }
        });
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupSidebarToggle);
} else {
    setupSidebarToggle();
}

const logoutBtn = document.getElementById("logoutBtn");
if (logoutBtn) {
    logoutBtn.addEventListener("click", async (e) => {
        e.preventDefault();
        try {
            logoutBtn.disabled = true;
            logoutBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Logging out...';
            await signOut(auth);
            window.location.href = "../login.html";
        } catch (error) {
            logoutBtn.disabled = false;
            logoutBtn.innerHTML = '<i class="fa-solid fa-right-from-bracket"></i> Logout';
            alert("Unable to logout. Please try again.");
        }
    });
}

export {
    auth,
    db,
    authenticatedAdmin,
    adminReady
};