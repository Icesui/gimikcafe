// GIMIK CAFE - PASSWORD RESET LOGIC

import { sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";
import { auth } from "./firebase-config.js";

const form = document.getElementById("forgotPasswordForm");
const emailInput = document.getElementById("resetEmail");
const sendResetBtn = document.getElementById("sendResetBtn");
const errorAlert = document.getElementById("resetAlertError");
const errorMsg = document.getElementById("resetAlertErrorMsg");
const successAlert = document.getElementById("resetAlertSuccess");

function showError(message) {
    if (errorMsg) errorMsg.textContent = message;
    if (errorAlert) errorAlert.style.display = "flex";
    if (successAlert) successAlert.style.display = "none";
}

function showSuccess() {
    if (successAlert) successAlert.style.display = "flex";
    if (errorAlert) errorAlert.style.display = "none";
}

function clearAlerts() {
    if (errorAlert) errorAlert.style.display = "none";
    if (successAlert) successAlert.style.display = "none";
}

if (form) {
    form.addEventListener("submit", async (e) => {
        e.preventDefault();
        clearAlerts();

        const email = emailInput ? emailInput.value.trim() : "";

        if (!email) {
            showError("Please enter your registered email address.");
            return;
        }

        try {
            sendResetBtn.disabled = true;
            sendResetBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Sending link...`;

            await sendPasswordResetEmail(auth, email);

            showSuccess();
            form.reset();

        } catch (error) {
            console.error("Password reset error:", error);

            switch (error.code) {
                case "auth/user-not-found":
                    showError("No account found with this email address.");
                    break;
                case "auth/invalid-email":
                    showError("Please enter a valid email format.");
                    break;
                case "auth/too-many-requests":
                    showError("Too many attempts. Please try again after a few minutes.");
                    break;
                default:
                    showError("Failed to send reset link. Please try again later.");
                    break;
            }
        } finally {
            sendResetBtn.disabled = false;
            sendResetBtn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Send Reset Link`;
        }
    });
}