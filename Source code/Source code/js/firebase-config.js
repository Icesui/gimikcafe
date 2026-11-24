import { initializeApp } from
    "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";

import { getAuth } from
    "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { getDatabase } from
    "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

//CONFIG//

const firebaseConfig = {
    apiKey: "AIzaSyBGswMNWJb4fz8IvpVa-Yf7yc5tKzRBbes",
    authDomain: "gimik-coffee-be6ce.firebaseapp.com",
    databaseURL: "https://gimik-coffee-be6ce-default-rtdb.asia-southeast1.firebasedatabase.app",
    projectId: "gimik-coffee-be6ce",
    storageBucket: "gimik-coffee-be6ce.firebasestorage.app",
    messagingSenderId: "632582099989",
    appId: "1:632582099989:web:ede3cae26a7fe7277b6a1c",
    measurementId: "G-BE5KEHZ4PS"
};

const app = initializeApp(firebaseConfig);

const auth = getAuth(app);
const database = getDatabase(app);

//TEST//

console.log("==========================================");
console.log("GIMIK CAFE FIREBASE");
console.log("==========================================");
console.log("Firebase App:", app);
console.log("Firebase Authentication:", auth);
console.log("Firebase Realtime Database:", database);
console.log("Firebase connected successfully!");
console.log("==========================================");

export {
    app,
    auth,
    database
};