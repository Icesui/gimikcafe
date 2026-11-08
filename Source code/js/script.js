// GIMIK CAFE GLOBAL SCRIPT
// DYNAMIC NAVBAR AUTH ROUTING

import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

const navUserLink = document.getElementById("navUserLink");

if (navUserLink) {
    onAuthStateChanged(auth, (user) => {
        if (user) {
            navUserLink.setAttribute("href", "customer-dashboard.html");
        } else {
            navUserLink.setAttribute("href", "login.html");
        }
    });
}