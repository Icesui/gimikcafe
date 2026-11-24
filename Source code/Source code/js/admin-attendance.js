// =========================================================
//         GIMIK CAFE - ATTENDANCE & SHIFT TRACKER
// =========================================================

import { 
    ref, 
    update, 
    onValue 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { db, adminReady, authenticatedAdmin } from "./admin.js";

// Dynamic staff profile (populated from logged-in admin)
let currentStaff = {
    id: null,
    name: "Staff Member",
    role: "Barista"
};

// Current cached shift record
let currentShiftRecord = null;

// =========================================================
// 1. AUTO-INJECT MODAL HTML (IF NOT ALREADY IN THE PAGE)
// =========================================================
function ensureAttendanceModalHTML() {
    if (document.getElementById("attendanceModal")) return;

    const modalHTML = `
    <div class="profile-modal" id="attendanceModal">
        <div class="profile-modal-overlay" id="attendanceModalOverlay"></div>
        <div class="profile-modal-card">
            <button type="button" class="profile-modal-close" id="closeAttendanceModal">
                <i class="fa-solid fa-xmark"></i>
            </button>

            <div class="attendance-avatar-wrap">
                <i class="fa-solid fa-user-shield"></i>
            </div>
            <h2 id="staffGreeting">Welcome, Staff</h2>
            <p class="staff-subtext">Shift &amp; Attendance Management</p>

            <div class="attendance-clock-card">
                <span class="clock-label" id="attendanceCurrentDate">Today</span>
                <div class="clock-time" id="attendanceLiveClock">00:00:00 AM</div>
                <div class="shift-status-pill on-duty" id="currentShiftStatus">
                    <i class="fa-solid fa-circle"></i>
                    <span>Status: Clocked Out</span>
                </div>
            </div>

            <div class="attendance-info-rows">
                <div class="info-row-box">
                    <div class="info-icon"><i class="fa-solid fa-user"></i></div>
                    <div>
                        <label>NAME</label>
                        <strong id="attendanceStaffName">${currentStaff.name}</strong>
                    </div>
                </div>
                <div class="info-row-box">
                    <div class="info-icon"><i class="fa-solid fa-id-badge"></i></div>
                    <div>
                        <label>ROLE</label>
                        <strong id="attendanceStaffRole">${currentStaff.role}</strong>
                    </div>
                </div>
            </div>

            <div class="attendance-punch-grid">
                <button type="button" class="punch-btn btn-time-in" id="btnTimeIn">
                    <i class="fa-solid fa-right-to-bracket"></i>
                    <div>
                        <strong>Time In</strong>
                        <small id="timeInDisplay">--:--</small>
                    </div>
                </button>

                <button type="button" class="punch-btn btn-meal-break" id="btnMealBreak" disabled>
                    <i class="fa-solid fa-mug-hot" id="mealBreakIcon"></i>
                    <div>
                        <strong id="mealBreakLabel">Meal Break</strong>
                        <small id="mealBreakDisplay">--:--</small>
                    </div>
                </button>

                <button type="button" class="punch-btn btn-time-out" id="btnTimeOut" disabled>
                    <i class="fa-solid fa-right-from-bracket"></i>
                    <div>
                        <strong>Time Out</strong>
                        <small id="timeOutDisplay">--:--</small>
                    </div>
                </button>
            </div>

            <button type="button" class="attendance-continue-btn" id="attendanceContinueBtn">
                Continue to POS <i class="fa-solid fa-arrow-right"></i>
            </button>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML("beforeend", modalHTML);
}

// =========================================================
// 2. MODAL CONTROLS
// =========================================================
function openAttendanceModal() {
    const modal = document.getElementById("attendanceModal");
    if (modal) {
        modal.classList.add("active");
        document.body.classList.add("modal-open");
    }
}

function closeAttendanceModal() {
    const modal = document.getElementById("attendanceModal");
    if (modal) {
        modal.classList.remove("active");
        document.body.classList.remove("modal-open");
    }
}

// =========================================================
// 3. INITIALIZATION
// =========================================================
function syncStaffProfile(admin) {
    if (!admin) return;
    currentStaff.id = admin.uid;
    currentStaff.name = admin.firstname || admin.firstName || admin.fullName || admin.username || "Staff Member";
    currentStaff.role = (admin.role === "super_admin" || admin.role === "superadmin") ? "Super Admin" : "Barista";

    const greeting = document.getElementById("staffGreeting");
    const staffNameEl = document.getElementById("attendanceStaffName");
    const staffRoleEl = document.getElementById("attendanceStaffRole");

    if (greeting) greeting.textContent = `Welcome, ${admin.firstname || admin.username || "Admin"}`;
    if (staffNameEl) staffNameEl.textContent = currentStaff.name;
    if (staffRoleEl) staffRoleEl.textContent = currentStaff.role;
}

function initAttendance(admin) {
    syncStaffProfile(admin || authenticatedAdmin);
    ensureAttendanceModalHTML();
    syncStaffProfile(admin || authenticatedAdmin);
    startClock();
    attachModalTriggers();
    attachPunchEvents();
    listenToTodayAttendance();
}

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then((admin) => initAttendance(admin)).catch(() => initAttendance(null));
} else {
    document.addEventListener("DOMContentLoaded", () => initAttendance(null));
}

// =========================================================
// 4. DIGITAL CLOCK
// =========================================================
function startClock() {
    function tick() {
        const now = new Date();
        const liveClock = document.getElementById("attendanceLiveClock");
        const currentDate = document.getElementById("attendanceCurrentDate");

        if (liveClock) {
            liveClock.textContent = now.toLocaleTimeString("en-US", { hour12: true });
        }
        if (currentDate) {
            currentDate.textContent = now.toLocaleDateString("en-US", { 
                weekday: "long", 
                year: "numeric", 
                month: "long", 
                day: "numeric" 
            });
        }
    }
    tick();
    setInterval(tick, 1000);
}

function getTodayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// =========================================================
// 5. FIREBASE LISTENER & UI SYNC
// =========================================================
function listenToTodayAttendance() {
    if (!currentStaff.id) return;
    const todayKey = getTodayDateKey();
    const attendanceRef = ref(db, `attendance/${todayKey}/${currentStaff.id}`);

    onValue(attendanceRef, (snapshot) => {
        if (!snapshot.exists()) {
            currentShiftRecord = null;
            resetPunchUI();
            return;
        }

        const data = snapshot.val();
        currentShiftRecord = data;
        updateShiftUI(data);
    }, (err) => {
        console.error("Attendance listener error:", err);
    });
}

function updateShiftUI(record) {
    const timeInDisplay = document.getElementById("timeInDisplay");
    const mealBreakDisplay = document.getElementById("mealBreakDisplay");
    const mealBreakLabel = document.getElementById("mealBreakLabel");
    const mealBreakIcon = document.getElementById("mealBreakIcon");
    const btnMealBreak = document.getElementById("btnMealBreak");
    const timeOutDisplay = document.getElementById("timeOutDisplay");

    if (timeInDisplay) timeInDisplay.textContent = record.timeIn ? formatTime(record.timeIn) : "--:--";
    if (timeOutDisplay) timeOutDisplay.textContent = record.timeOut ? formatTime(record.timeOut) : "--:--";

    const isOnBreak = !!(record.breakOut && !record.breakIn);

    if (isOnBreak) {
        if (btnMealBreak) btnMealBreak.classList.add("active-break");
        if (mealBreakLabel) mealBreakLabel.textContent = "End Break";
        if (mealBreakIcon) mealBreakIcon.className = "fa-solid fa-mug-saucer";
        if (mealBreakDisplay) mealBreakDisplay.textContent = `Since ${formatTime(record.breakOut)}`;
    } else {
        if (btnMealBreak) btnMealBreak.classList.remove("active-break");
        if (mealBreakLabel) mealBreakLabel.textContent = "Meal Break";
        if (mealBreakIcon) mealBreakIcon.className = "fa-solid fa-mug-hot";

        if (record.breakOut && record.breakIn) {
            const durationMin = Math.round((record.breakIn - record.breakOut) / (1000 * 60));
            if (mealBreakDisplay) mealBreakDisplay.textContent = `${durationMin}m taken`;
        } else {
            if (mealBreakDisplay) mealBreakDisplay.textContent = "--:--";
        }
    }

    if (!record.timeIn) {
        setButtonStates({ timeIn: true, mealBreak: false, timeOut: false });
        setStatusBadge("Clocked Out", "on-duty");
    } else if (record.timeIn && !record.timeOut) {
        if (isOnBreak) {
            setButtonStates({ timeIn: false, mealBreak: true, timeOut: false });
            setStatusBadge("On Break", "break");
        } else if (record.breakOut && record.breakIn) {
            setButtonStates({ timeIn: false, mealBreak: false, timeOut: true });
            setStatusBadge("On Duty (Post-Break)", "working");
        } else {
            setButtonStates({ timeIn: false, mealBreak: true, timeOut: true });
            setStatusBadge("On Duty / Working", "working");
        }
    } else if (record.timeOut) {
        setButtonStates({ timeIn: true, mealBreak: false, timeOut: false });
        setStatusBadge("Shift Completed", "on-duty");
    }
}

function resetPunchUI() {
    const timeInDisplay = document.getElementById("timeInDisplay");
    const mealBreakDisplay = document.getElementById("mealBreakDisplay");
    const mealBreakLabel = document.getElementById("mealBreakLabel");
    const mealBreakIcon = document.getElementById("mealBreakIcon");
    const btnMealBreak = document.getElementById("btnMealBreak");
    const timeOutDisplay = document.getElementById("timeOutDisplay");

    if (timeInDisplay) timeInDisplay.textContent = "--:--";
    if (mealBreakDisplay) mealBreakDisplay.textContent = "--:--";
    if (timeOutDisplay) timeOutDisplay.textContent = "--:--";

    if (mealBreakLabel) mealBreakLabel.textContent = "Meal Break";
    if (mealBreakIcon) mealBreakIcon.className = "fa-solid fa-mug-hot";
    if (btnMealBreak) btnMealBreak.classList.remove("active-break");

    setButtonStates({ timeIn: true, mealBreak: false, timeOut: false });
    setStatusBadge("Clocked Out", "on-duty");
}

function setButtonStates({ timeIn, mealBreak, timeOut }) {
    const btnTimeIn = document.getElementById("btnTimeIn");
    const btnMealBreak = document.getElementById("btnMealBreak");
    const btnTimeOut = document.getElementById("btnTimeOut");

    if (btnTimeIn) btnTimeIn.disabled = !timeIn;
    if (btnMealBreak) btnMealBreak.disabled = !mealBreak;
    if (btnTimeOut) btnTimeOut.disabled = !timeOut;
}

function setStatusBadge(text, className) {
    const currentShiftStatus = document.getElementById("currentShiftStatus");
    if (!currentShiftStatus) return;
    currentShiftStatus.className = `shift-status-pill ${className}`;
    const span = currentShiftStatus.querySelector("span");
    if (span) span.textContent = `Status: ${text}`;
}

// =========================================================
// 6. EVENT ATTACHMENTS
// =========================================================
function attachModalTriggers() {
    const adminProfileButton = document.getElementById("adminProfileButton");
    const closeBtn = document.getElementById("closeAttendanceModal");
    const overlay = document.getElementById("attendanceModalOverlay");
    const continueBtn = document.getElementById("attendanceContinueBtn");

    if (adminProfileButton) adminProfileButton.onclick = openAttendanceModal;
    if (closeBtn) closeBtn.onclick = closeAttendanceModal;
    if (overlay) overlay.onclick = closeAttendanceModal;

    if (continueBtn) {
        continueBtn.onclick = () => {
            closeAttendanceModal();
            if (!window.location.pathname.includes("pos.html")) {
                window.location.href = "pos.html";
            }
        };
    }

    document.addEventListener("keydown", (e) => {
        const modal = document.getElementById("attendanceModal");
        if (e.key === "Escape" && modal && modal.classList.contains("active")) {
            closeAttendanceModal();
        }
    });
}

function attachPunchEvents() {
    document.getElementById("btnTimeIn")?.addEventListener("click", () => punchAction("timeIn"));
    document.getElementById("btnMealBreak")?.addEventListener("click", toggleMealBreak);
    document.getElementById("btnTimeOut")?.addEventListener("click", () => punchAction("timeOut"));
}

async function toggleMealBreak() {
    if (!currentShiftRecord || !currentShiftRecord.timeIn) return;

    const isOnBreak = !!(currentShiftRecord.breakOut && !currentShiftRecord.breakIn);
    if (!isOnBreak) {
        await punchAction("breakOut");
    } else {
        await punchAction("breakIn");
    }
}

// =========================================================
// 7. FIREBASE WRITE
// =========================================================
async function punchAction(actionType) {
    if (!currentStaff.id) {
        alert("User identity not verified. Please refresh.");
        return;
    }

    const todayKey = getTodayDateKey();
    const attendanceRef = ref(db, `attendance/${todayKey}/${currentStaff.id}`);
    const timestamp = Date.now();

    try {
        let updatePayload;

        if (actionType === "timeIn") {
            updatePayload = {
                timeIn: timestamp,
                breakOut: null,
                breakIn: null,
                breakDurationMinutes: null,
                timeOut: null,
                staffName: currentStaff.name,
                role: currentStaff.role,
                lastUpdated: timestamp
            };
        } else if (actionType === "breakIn") {
            const start = currentShiftRecord?.breakOut || timestamp;
            const durationMin = Math.max(1, Math.round((timestamp - start) / (1000 * 60)));
            updatePayload = {
                breakIn: timestamp,
                breakDurationMinutes: durationMin,
                staffName: currentStaff.name,
                role: currentStaff.role,
                lastUpdated: timestamp
            };
        } else {
            updatePayload = {
                [actionType]: timestamp,
                staffName: currentStaff.name,
                role: currentStaff.role,
                lastUpdated: timestamp
            };
        }

        await update(attendanceRef, updatePayload);
    } catch (err) {
        console.error("Attendance punch error:", err);
    }
}

function formatTime(timestamp) {
    if (!timestamp) return "--:--";
    return new Date(timestamp).toLocaleTimeString("en-US", { 
        hour: "2-digit", 
        minute: "2-digit" 
    });
}