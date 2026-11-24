// GIMIK CAFE LOGIN SCRIPT

import { auth, database } from "./firebase-config.js";
import { 
    signInWithEmailAndPassword, 
    onAuthStateChanged,
    sendEmailVerification,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// DOM element references
const loginForm = document.getElementById("loginForm");
const usernameInput = document.getElementById("username");
const passwordInput = document.getElementById("password");
const loginMessage = document.getElementById("loginMessage");
const loginSubmit = document.getElementById("loginSubmit");

let isSubmitting = false;

// Check user role in database and redirect to matching dashboard
async function routeUserByRole(user) {
    if (!user) return;

    try {
        const userRef = ref(database, `Users/${user.uid}`);
        const snapshot = await get(userRef);

        if (snapshot.exists()) {
            const userData = snapshot.val();
            const role = (userData.role || "").toLowerCase();
            const username = (userData.username || "").toLowerCase();

            // Redirect admin accounts directly to admin/index.html
            if (role === "admin" || role === "superadmin" || role === "super admin" || username === "admin") {
                window.location.replace("admin/index.html");
                return;
            }
        }
    } catch (err) {
        console.error("Role lookup error:", err);
    }

    // Default route for regular customers
    window.location.replace("customer-dashboard.html");
}

// Redirect if already logged in and email is verified
onAuthStateChanged(auth, async (user) => {
    if (user && !isSubmitting) {
        if (user.emailVerified) {
            await routeUserByRole(user);
        }
    }
});

// Handle login submit
if (loginForm) {
    loginForm.addEventListener("submit", async (e) => {
        e.preventDefault();

        const inputIdentifier = usernameInput.value.trim();
        const password = passwordInput.value.trim();

        if (!inputIdentifier || !password) {
            showMessage("Please fill in all fields.", "error");
            return;
        }

        if (password.length < 8) {
            showMessage("Password must be at least 8 characters.", "error");
            return;
        }

        isSubmitting = true;
        loginSubmit.disabled = true;
        loginSubmit.textContent = "Logging in...";

        try {
            let emailToUse = inputIdentifier;

            // Direct O(1) email resolution via Usernames/ index (Case-Sensitive)
            if (!inputIdentifier.includes("@")) {
                const usernameRef = ref(database, `Usernames/${inputIdentifier}`);
                const snapshot = await get(usernameRef);

                if (!snapshot.exists()) {
                    throw new Error("Invalid username or password.");
                }

                const usernameData = snapshot.val();

                const registeredUsername = usernameData.exactUsername || snapshot.key;
                if (inputIdentifier !== registeredUsername) {
                    throw new Error("Invalid username or password.");
                }

                if (!usernameData || !usernameData.email) {
                    throw new Error("Invalid username or password.");
                }

                emailToUse = usernameData.email;
            }

            // Firebase authentication
            const userCredential = await signInWithEmailAndPassword(auth, emailToUse, password);
            const user = userCredential.user;

            // Enforce email verification for standard credentials
            if (!user.emailVerified) {
                await signOut(auth);

                showMessage(`
                    Your email is not verified yet. Please check your inbox or 
                    <a href="#" id="resendVerificationLink" style="color: #04696D; font-weight: 700; text-decoration: underline;">click here to resend the verification email</a>.
                `, "error");

                document.getElementById("resendVerificationLink")?.addEventListener("click", async (ev) => {
                    ev.preventDefault();
                    try {
                        const tempCred = await signInWithEmailAndPassword(auth, emailToUse, password);
                        await sendEmailVerification(tempCred.user);
                        await signOut(auth);
                        showMessage(`A new verification email was sent to <strong>${emailToUse}</strong>!`, "success");
                    } catch (resendErr) {
                        showMessage("Failed to resend verification. Please wait a minute and try again.", "error");
                    }
                });

                isSubmitting = false;
                loginSubmit.disabled = false;
                loginSubmit.textContent = "Login";
                return;
            }

            showMessage("Login successful! Redirecting...", "success");
            await routeUserByRole(user);

        } catch (error) {
            console.error("Login Error:", error);
            isSubmitting = false;

            let displayError = "Invalid login credentials. Please try again.";
            if (
                error.code === "auth/invalid-credential" ||
                error.code === "auth/wrong-password" ||
                error.code === "auth/user-not-found"
            ) {
                displayError = "Invalid username/email or password.";
            } else if (error.code === "auth/too-many-requests") {
                displayError = "Too many failed attempts. Please try again later or reset your password.";
            } else if (error.message) {
                displayError = error.message;
            }

            showMessage(displayError, "error");
            loginSubmit.disabled = false;
            loginSubmit.textContent = "Login";
        }
    });
}

// Display alert feedback on login form
function showMessage(htmlContent, type) {
    if (!loginMessage) return;
    loginMessage.innerHTML = htmlContent;
    loginMessage.style.display = "block";

    if (type === "success") {
        loginMessage.style.background = "#e3f8ec";
        loginMessage.style.color = "#1b874c";
        loginMessage.style.border = "1px solid #bfe3d5";
    } else {
        loginMessage.style.background = "#fdf0ef";
        loginMessage.style.color = "#c9302c";
        loginMessage.style.border = "1px solid #f8d7da";
    }
}