// ==========================================
//        GIMIK CAFE FIREBASE REGISTER
//        WITH USERNAME INDEX & EMAIL VERIFICATION
//        TERMS & CONDITIONS
// ==========================================

import { auth, database } from "./firebase-config.js";
import { 
    createUserWithEmailAndPassword, 
    updateProfile,
    sendEmailVerification,
    signOut
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { ref, set, get } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

// DOM References
const termsModal = document.getElementById("termsModal");
const termsContent = document.getElementById("termsContent");
const termsCheckbox = document.getElementById("termsCheckbox");
const acceptTermsButton = document.getElementById("acceptTermsButton");
const termsScrollMessage = document.getElementById("termsScrollMessage");

const registerForm = document.getElementById("registerForm");
const usernameInput = document.getElementById("username");
const fullNameInput = document.getElementById("fullName");
const emailInput = document.getElementById("email");
const contactNumberInput = document.getElementById("contactNumber");
const passwordInput = document.getElementById("password");
const confirmPasswordInput = document.getElementById("confirmPassword");
const messageElement = document.getElementById("registerMessage");
const registerButton = document.getElementById("registerSubmit");

// ==========================================
//        TERMS & CONDITIONS MODAL
// ==========================================
if (termsModal && termsContent) {
    document.body.classList.add("terms-open");

    termsContent.addEventListener("scroll", function() {
        const scrollPosition = termsContent.scrollTop + termsContent.clientHeight;
        const scrollHeight = termsContent.scrollHeight;

        if (scrollPosition >= scrollHeight - 15) {
            if (termsCheckbox) termsCheckbox.disabled = false;
            if (termsScrollMessage) {
                termsScrollMessage.textContent = "You have reached the end. You may now accept the Terms & Conditions.";
                termsScrollMessage.style.color = "#04696D";
            }
        }
    });

    if (termsCheckbox) {
        termsCheckbox.addEventListener("change", function() {
            if (acceptTermsButton) acceptTermsButton.disabled = !termsCheckbox.checked;
        });
    }

    if (acceptTermsButton) {
        acceptTermsButton.addEventListener("click", function() {
            if (!termsCheckbox || !termsCheckbox.checked) return;
            termsModal.style.display = "none";
            document.body.classList.remove("terms-open");
        });
    }
}

// ==========================================
//   LOCK AT .COM BUT REMAIN FULLY EDITABLE
// ==========================================
if (emailInput) {
    emailInput.setAttribute("autocomplete", "new-password");
    emailInput.setAttribute("autocorrect", "off");
    emailInput.setAttribute("autocapitalize", "none");
    emailInput.setAttribute("spellcheck", "false");

    emailInput.addEventListener("keydown", (e) => {
        // Always allow navigation and edit keys
        const allowedKeys = [
            "Backspace", "Delete", "ArrowLeft", "ArrowRight",
            "ArrowUp", "ArrowDown", "Tab", "Enter", "Home", "End"
        ];
        if (allowedKeys.includes(e.key) || e.ctrlKey || e.metaKey) {
            return;
        }

        const val = emailInput.value.toLowerCase();
        const start = emailInput.selectionStart;
        const end = emailInput.selectionEnd;

        // If .com is already present and cursor is at/past the letter 'm', block typing further
        const comIndex = val.indexOf(".com");
        if (comIndex !== -1 && start >= comIndex + 4 && start === end) {
            e.preventDefault();
        }
    });

    // Auto-trim any pasted or auto-completed text that extends beyond .com
    emailInput.addEventListener("input", () => {
        const val = emailInput.value;
        const match = val.match(/^(.+?\.com)/i);
        if (match && val.length > match[1].length) {
            const cursor = emailInput.selectionStart;
            emailInput.value = match[1];
            emailInput.setSelectionRange(
                Math.min(cursor, match[1].length),
                Math.min(cursor, match[1].length)
            );
        }
    });
}

function showMessage(message, type = "error") {
    if (!messageElement) return;
    messageElement.innerHTML = message;
    messageElement.style.display = "block";

    if (type === "success") {
        messageElement.style.color = "#04696D";
        messageElement.style.background = "#e8f7f7";
        messageElement.style.border = "1px solid #bfe3d5";
    } else {
        messageElement.style.color = "#c9302c";
        messageElement.style.background = "#fdf0ef";
        messageElement.style.border = "1px solid #f8d7da";
    }
}

function hideMessage() {
    if (messageElement) {
        messageElement.textContent = "";
        messageElement.style.display = "none";
    }
}

async function usernameExists(username) {
    const usernameRef = ref(database, "Usernames/" + username);
    const snapshot = await get(usernameRef);
    if (snapshot.exists()) return true;

    const allUsernamesSnap = await get(ref(database, "Usernames"));
    if (allUsernamesSnap.exists()) {
        const existingKeys = Object.keys(allUsernamesSnap.val());
        return existingKeys.some(key => key.toLowerCase() === username.toLowerCase());
    }

    return false;
}

// =========================================================
//                  SUBMIT REGISTRATION
// =========================================================
if (registerForm) {
    registerForm.addEventListener("submit", async function(event) {
        event.preventDefault();
        hideMessage();

        const username = usernameInput.value.trim();
        const fullName = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        const contactNumber = contactNumberInput.value.trim();
        const password = passwordInput.value;
        const confirmPassword = confirmPasswordInput.value;

        if (username.length < 3) {
            showMessage("Username must be at least 3 characters.");
            return;
        }

        if (!/^[a-zA-Z0-9._-]+$/.test(username)) {
            showMessage("Username can only contain letters, numbers, periods, underscores, and hyphens.");
            return;
        }

        if (!email.toLowerCase().endsWith(".com")) {
            showMessage("Email must end with .com");
            return;
        }

        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            showMessage("Please enter a valid email address (e.g. username@domain.com).");
            return;
        }

        if (password.length < 8) {
            showMessage("Password must be at least 8 characters.");
            return;
        }

        if (password !== confirmPassword) {
            showMessage("Passwords do not match.");
            return;
        }

        if (!/^09[0-9]{9}$/.test(contactNumber)) {
            showMessage("Please enter a valid Philippine contact number (09XXXXXXXXX).");
            return;
        }

        registerButton.disabled = true;
        registerButton.textContent = "Creating Account...";

        try {
            const exists = await usernameExists(username);
            if (exists) {
                showMessage("This username is already taken.");
                registerButton.disabled = false;
                registerButton.textContent = "Create Account";
                return;
            }

            // 1. Create Firebase Auth user
            const userCredential = await createUserWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // 2. Set profile displayName
            await updateProfile(user, { displayName: fullName });

            // 3. Save profile in Users/{uid}
            await set(ref(database, "Users/" + user.uid), {
                uid: user.uid,
                username: username,
                fullName: fullName,
                email: email,
                contactNumber: contactNumber,
                role: "customer",
                createdAt: new Date().toISOString()
            });

            // 4. Save index in Usernames/{username}
            await set(ref(database, "Usernames/" + username), {
                uid: user.uid,
                email: email,
                exactUsername: username
            });

            // 5. Send Verification Email & Sign Out
            await sendEmailVerification(user);
            await signOut(auth);

            showMessage(`Account created! A verification link has been sent to <strong>${email}</strong>. Please check your inbox and verify your email before logging in.`, "success");
            registerForm.reset();

            setTimeout(() => {
                window.location.href = "login.html";
            }, 4000);

        } catch (error) {
            console.error("Registration Error:", error);

            if (error.code === "auth/email-already-in-use") {
                showMessage("An account with this email already exists.");
            } else if (error.code === "auth/invalid-email") {
                showMessage("Please enter a valid email address.");
            } else if (error.code === "auth/weak-password") {
                showMessage("Your password is too weak.");
            } else if (error.code === "auth/network-request-failed") {
                showMessage("Network error. Please check your internet connection.");
            } else if (error.code === "PERMISSION_DENIED") {
                showMessage("Unable to save your account. Database rules denied write access.");
            } else {
                showMessage("Registration failed. Please try again.");
            }

            registerButton.disabled = false;
            registerButton.textContent = "Create Account";
        }
    });
}