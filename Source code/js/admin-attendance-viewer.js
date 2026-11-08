// =========================================================
//       GIMIK CAFE - ATTENDANCE MONITOR (MULTI-DAY VIEWER)
// =========================================================

import { 
    ref, 
    onValue,
    set,
    remove,
    get,
    update
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-database.js";

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.1.0/firebase-app.js";
import { 
    getAuth, 
    createUserWithEmailAndPassword, 
    sendEmailVerification, 
    signOut as secondarySignOut 
} from "https://www.gstatic.com/firebasejs/12.1.0/firebase-auth.js";

import { 
    db, 
    adminReady, 
    authenticatedAdmin 
} from "./admin.js";

// DOM References
const rangeFilter = document.getElementById("attendanceRangeFilter");
const staffFilterGroup = document.getElementById("staffFilterGroup");
const staffMemberFilter = document.getElementById("staffMemberFilter");
const customRangeWrap = document.getElementById("customRangeWrap");
const startDateInput = document.getElementById("attendanceStartDate");
const endDateInput = document.getElementById("attendanceEndDate");
const dateDisplay = document.getElementById("attendanceDateDisplay");
const exportBtn = document.getElementById("exportAttendanceBtn");
const openAddStaffModalBtn = document.getElementById("openAddStaffModalBtn");
const openManageStaffModalBtn = document.getElementById("openManageStaffModalBtn");
const tableBody = document.getElementById("attendanceTableBody");
const countOnDuty = document.getElementById("countOnDuty");
const countOnBreak = document.getElementById("countOnBreak");
const loggedInStaffName = document.getElementById("loggedInStaffName");
const loggedInStaffRole = document.getElementById("loggedInStaffRole");
const tableSubtitle = document.getElementById("attendanceTableSubtitle");

// Global attendance raw state
let allAttendanceData = {};
let filteredRecords = [];
let currentUserAdmin = null;
let isSuperAdmin = false;

function initViewer(admin) {
    currentUserAdmin = admin || authenticatedAdmin;
    checkSuperAdminRole();
    setupDateDisplay();
    displayLoggedInUser(currentUserAdmin);
    initFilterEvents();
    setupEmployeeCreator();
    setupEmployeeManager();
    listenToAllAttendance();
}

if (adminReady && typeof adminReady.then === "function") {
    adminReady.then((admin) => initViewer(admin)).catch(() => initViewer(null));
} else {
    document.addEventListener("DOMContentLoaded", () => initViewer(null));
}

// Check role: super_admin / superadmin / Owner vs barista / admin
function checkSuperAdminRole() {
    if (!currentUserAdmin) {
        isSuperAdmin = false;
        return;
    }
    const roleClean = (currentUserAdmin.role || "").toLowerCase().replace(/[\s_]/g, "");
    isSuperAdmin = roleClean === "superadmin" || roleClean === "owner";

    // Show employee selector dropdown only for Super Admin (Owner)
    if (staffFilterGroup) {
        staffFilterGroup.style.display = isSuperAdmin ? "flex" : "none";
    }

    // Show Add Employee & Manage Staff buttons only for Super Admin (Owner)
    if (openAddStaffModalBtn) {
        openAddStaffModalBtn.style.display = isSuperAdmin ? "inline-flex" : "none";
    }
    if (openManageStaffModalBtn) {
        openManageStaffModalBtn.style.display = isSuperAdmin ? "inline-flex" : "none";
    }
}

function displayLoggedInUser(admin) {
    if (!loggedInStaffName) return;

    if (admin) {
        const name = admin.firstname || admin.firstName || admin.fullName || admin.username || "Admin";
        const role = isSuperAdmin ? "Owner" : "Barista";
        loggedInStaffName.textContent = name;
        if (loggedInStaffRole) loggedInStaffRole.textContent = role;
    } else {
        loggedInStaffName.textContent = "Admin";
        if (loggedInStaffRole) loggedInStaffRole.textContent = "Staff Member";
    }
}

function setupDateDisplay() {
    if (!dateDisplay) return;
    const now = new Date();
    dateDisplay.textContent = now.toLocaleDateString("en-US", { 
        year: "numeric", 
        month: "long", 
        day: "numeric" 
    });
}

function initFilterEvents() {
    if (rangeFilter) {
        rangeFilter.addEventListener("change", () => {
            const isCustom = rangeFilter.value === "custom";
            if (customRangeWrap) {
                customRangeWrap.style.display = isCustom ? "flex" : "none";
            }
            applyFiltersAndRender();
        });
    }

    if (staffMemberFilter) {
        staffMemberFilter.addEventListener("change", applyFiltersAndRender);
    }

    if (startDateInput) startDateInput.addEventListener("change", applyFiltersAndRender);
    if (endDateInput) endDateInput.addEventListener("change", applyFiltersAndRender);

    if (exportBtn) {
        exportBtn.addEventListener("click", downloadAttendanceCSV);
    }
}

// Populate the staff selector for Super Admin based on records
function populateStaffOptions(flatList) {
    if (!isSuperAdmin || !staffMemberFilter) return;

    const previousSelection = staffMemberFilter.value || "all";
    const staffMap = new Map();

    flatList.forEach((entry) => {
        if (entry.staffId && !staffMap.has(entry.staffId)) {
            staffMap.set(entry.staffId, entry.staffName || "Staff Member");
        }
    });

    let html = `<option value="all">All Employees</option>`;
    staffMap.forEach((name, id) => {
        html += `<option value="${escapeHTML(id)}">${escapeHTML(name)}</option>`;
    });

    staffMemberFilter.innerHTML = html;
    staffMemberFilter.value = staffMap.has(previousSelection) ? previousSelection : "all";
}

// =========================================================
// 1. LISTEN TO ENTIRE ATTENDANCE ARCHIVE
// =========================================================
function listenToAllAttendance() {
    const attendanceRef = ref(db, "attendance");

    onValue(attendanceRef, (snapshot) => {
        if (!snapshot.exists()) {
            allAttendanceData = {};
            filteredRecords = [];
            renderEmptyTable();
            updateCounts(0, 0);
            if (tableSubtitle) tableSubtitle.textContent = "0 shift records found.";
            return;
        }

        allAttendanceData = snapshot.val();
        applyFiltersAndRender();
    }, (err) => {
        console.error("Attendance viewer listener error:", err);
        if (tableBody) {
            tableBody.innerHTML = `<tr><td colspan="8" style="text-align: center; color: #cf3d28; padding: 30px;">Error loading attendance: ${escapeHTML(err.message)}</td></tr>`;
        }
    });
}

// =========================================================
// 2. FILTER & PROCESS RECORDS
// =========================================================
function applyFiltersAndRender() {
    const range = rangeFilter ? rangeFilter.value : "today";
    const selectedStaff = staffMemberFilter ? staffMemberFilter.value : "all";

    const todayStr = getTodayDateKey();
    const weekAgoStr = getRelativeDateKey(-7);

    const allFlatList = [];

    // Flatten all attendance data
    Object.entries(allAttendanceData).forEach(([dateKey, staffEntries]) => {
        if (!staffEntries || typeof staffEntries !== "object") return;

        Object.entries(staffEntries).forEach(([staffId, entry]) => {
            if (!entry) return;
            allFlatList.push({
                dateKey,
                staffId,
                ...entry
            });
        });
    });

    // Populate Super Admin staff filter dropdown options once data arrives
    if (isSuperAdmin && staffMemberFilter) {
        populateStaffOptions(allFlatList);
    }

    // Role-based filtering:
    // If not Super Admin, strictly filter to current user's UID
    const currentUid = currentUserAdmin?.uid;

    const flatList = allFlatList.filter((entry) => {
        // 1. Role Scope Check
        if (!isSuperAdmin) {
            if (!currentUid || entry.staffId !== currentUid) {
                return false;
            }
        } else if (selectedStaff !== "all" && entry.staffId !== selectedStaff) {
            return false;
        }

        // 2. Date Range Filter
        if (range === "today" && entry.dateKey !== todayStr) return false;
        if (range === "week" && (entry.dateKey < weekAgoStr || entry.dateKey > todayStr)) return false;
        if (range === "custom") {
            const start = startDateInput?.value;
            const end = endDateInput?.value;
            if (start && entry.dateKey < start) return false;
            if (end && entry.dateKey > end) return false;
        }

        return true;
    });

    // Sort chronologically: newest date and shift first
    flatList.sort((a, b) => {
        if (a.dateKey !== b.dateKey) {
            return b.dateKey.localeCompare(a.dateKey);
        }
        return (b.timeIn || 0) - (a.timeIn || 0);
    });

    filteredRecords = flatList;

    if (tableSubtitle) {
        const scopeText = isSuperAdmin ? "recorded" : "personal";
        tableSubtitle.textContent = `Showing ${filteredRecords.length} ${scopeText} shift record${filteredRecords.length === 1 ? '' : 's'}`;
    }

    renderAttendanceTable(filteredRecords);
}

// =========================================================
// 3. TABLE RENDERING & METRICS
// =========================================================
function renderAttendanceTable(records) {
    if (!tableBody) return;
    tableBody.innerHTML = "";

    if (records.length === 0) {
        renderEmptyTable();
        updateCounts(0, 0);
        return;
    }

    let onDuty = 0;
    let onBreak = 0;
    const todayKey = getTodayDateKey();

    records.forEach((staff) => {
        const status = determineStatus(staff);

        // Count active statuses for shifts occurring TODAY
        if (staff.dateKey === todayKey) {
            if (status.type === "working") onDuty++;
            else if (status.type === "break") onBreak++;
        }

        const totalHours = calculateTotalTime(staff);
        const breakSpan = formatMealBreakSpan(staff);
        const row = document.createElement("tr");

        row.innerHTML = `
            <td><strong>${formatReadableDate(staff.dateKey)}</strong></td>
            <td>
                <div class="staff-cell">
                    <div class="staff-avatar"><i class="fa-solid fa-user"></i></div>
                    <strong>${escapeHTML(staff.staffName || "Staff Member")}</strong>
                </div>
            </td>
            <td><span class="role-badge">${escapeHTML(staff.role || "Barista")}</span></td>
            <td>
                <span class="attendance-pill ${status.type}">
                    <i class="fa-solid fa-circle"></i>
                    ${status.label}
                </span>
            </td>
            <td><strong>${formatTime(staff.timeIn)}</strong></td>
            <td>${breakSpan}</td>
            <td><strong>${formatTime(staff.timeOut)}</strong></td>
            <td><strong class="total-hours">${totalHours}</strong></td>
        `;

        tableBody.appendChild(row);
    });

    updateCounts(onDuty, onBreak);
}

function renderEmptyTable() {
    if (!tableBody) return;
    const msg = isSuperAdmin 
        ? "No shift or attendance records found matching your filters." 
        : "No personal shift records found for this period.";

    tableBody.innerHTML = `
        <tr>
            <td colspan="8" class="table-loading-cell">
                ${msg}
            </td>
        </tr>
    `;
}

function updateCounts(duty, brk) {
    if (countOnDuty) countOnDuty.textContent = duty;
    if (countOnBreak) countOnBreak.textContent = brk;
}

function determineStatus(staff) {
    if (!staff.timeIn) {
        return { label: "Not Clocked In", type: "out" };
    }
    if (staff.timeOut) {
        return { label: "Shift Completed", type: "out" };
    }
    if (staff.breakOut && !staff.breakIn) {
        return { label: "On Break", type: "break" };
    }
    return { label: "On Duty", type: "working" };
}

function formatMealBreakSpan(staff) {
    if (!staff.breakOut) return "-";

    const start = formatTime(staff.breakOut);
    if (!staff.breakIn) {
        return `<span style="color: #d98216; font-weight: 600;"><i class="fa-solid fa-mug-hot"></i> Since ${start}</span>`;
    }

    const end = formatTime(staff.breakIn);
    const duration = staff.breakDurationMinutes || Math.round((staff.breakIn - staff.breakOut) / (1000 * 60));
    return `<span>${start} – ${end}</span> <small style="display: block; color: #8fa0a1; font-size: 11px;">(${duration}m break)</small>`;
}

function calculateTotalTime(staff) {
    if (!staff.timeIn) return "--";

    let endTime = staff.timeOut;
    if (!endTime) {
        if (staff.dateKey === getTodayDateKey()) {
            endTime = staff.breakOut && !staff.breakIn ? staff.breakOut : Date.now();
        } else {
            return "Incomplete";
        }
    }

    let durationMs = endTime - staff.timeIn;

    if (staff.breakOut && staff.breakIn && staff.breakIn > staff.breakOut) {
        const breakDuration = staff.breakIn - staff.breakOut;
        durationMs = Math.max(0, durationMs - breakDuration);
    }

    const totalMinutes = Math.floor(durationMs / (1000 * 60));
    const hours = Math.floor(totalMinutes / 60);
    const mins = totalMinutes % 60;

    return `${hours}h ${mins}m`;
}

function formatTime(timestamp) {
    if (!timestamp) return "-";
    return new Date(timestamp).toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function formatReadableDate(dateKey) {
    if (!dateKey) return "-";
    const [y, m, d] = dateKey.split("-");
    const dt = new Date(Number(y), Number(m) - 1, Number(d));
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function getTodayDateKey() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function getRelativeDateKey(offsetDays) {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str ?? "";
    return div.innerHTML;
}

// =========================================================
// 4. SECONDARY APP REGISTRATION FOR NEW EMPLOYEES
// =========================================================
function setupEmployeeCreator() {
    const addStaffModal = document.getElementById("addStaffModal");
    const openBtn = document.getElementById("openAddStaffModalBtn");
    const closeBtn = document.getElementById("closeAddStaffModal");
    const overlay = document.getElementById("addStaffModalOverlay");
    const form = document.getElementById("addStaffForm");
    const msgEl = document.getElementById("addStaffMessage");
    const submitBtn = document.getElementById("submitAddStaffBtn");
    const emailInput = document.getElementById("staffEmail");

    if (!form || !openBtn) return;

    if (emailInput) {
        emailInput.setAttribute("autocomplete", "new-password");
        emailInput.setAttribute("autocorrect", "off");
        emailInput.setAttribute("autocapitalize", "none");
        emailInput.setAttribute("spellcheck", "false");
    }

    openBtn.addEventListener("click", () => {
        if (addStaffModal) addStaffModal.classList.add("active");
        form.reset();
        if (msgEl) msgEl.style.display = "none";
    });

    const closeModal = () => {
        if (addStaffModal) addStaffModal.classList.remove("active");
    };

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) overlay.addEventListener("click", closeModal);

    form.addEventListener("submit", async (e) => {
        e.preventDefault();

        const fullName = document.getElementById("staffFullName").value.trim();
        const username = document.getElementById("staffUsername").value.trim().toLowerCase();
        const email = document.getElementById("staffEmail").value.trim();
        const password = document.getElementById("staffPassword").value.trim();
        const contactNumber = document.getElementById("staffContact").value.trim();
        const role = document.getElementById("staffRole").value;

        if (password.length < 8) {
            if (msgEl) {
                msgEl.style.display = "block";
                msgEl.style.background = "#fdf0ef";
                msgEl.style.color = "#c9302c";
                msgEl.textContent = "Password must be at least 8 characters long.";
            }
            return;
        }

        submitBtn.disabled = true;
        submitBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Creating account...';

        try {
            // Check username availability in Usernames/{username} first
            const usernameSnap = await get(ref(db, `Usernames/${username}`));
            if (usernameSnap.exists()) {
                throw new Error("This username is already taken. Please choose another.");
            }

            const currentAppOptions = db.app.options;
            const secondaryApp = initializeApp(currentAppOptions, `StaffCreator_${Date.now()}`);
            const secondaryAuth = getAuth(secondaryApp);

            // 1. Create auth user credentials in Firebase Auth
            const userCred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
            const newUid = userCred.user.uid;

            // 2. Send verification email to the new employee
            await sendEmailVerification(userCred.user);

            // 3. Save full profile into Realtime Database under Users/{uid}
            await set(ref(db, `Users/${newUid}`), {
                uid: newUid,
                fullName: fullName,
                username: username,
                email: email,
                role: role,
                contactNumber: contactNumber || "Not provided",
                createdAt: new Date().toISOString()
            });

            // 4. Save index in Usernames/{username}
            await set(ref(db, `Usernames/${username}`), {
                uid: newUid,
                email: email,
                exactUsername: username
            });

            // 5. Immediately log out secondary session
            await secondarySignOut(secondaryAuth);

            if (msgEl) {
                msgEl.style.display = "block";
                msgEl.style.background = "#e3f8ec";
                msgEl.style.color = "#1b874c";
                msgEl.textContent = `Account created! A verification link has been sent to ${email}.`;
            }

            form.reset();
            setTimeout(() => {
                closeModal();
            }, 2000);

        } catch (err) {
            console.error("Staff creation failed:", err);
            if (msgEl) {
                msgEl.style.display = "block";
                msgEl.style.background = "#fdf0ef";
                msgEl.style.color = "#c9302c";
                msgEl.textContent = err.message || "Failed to create account.";
            }
        } finally {
            submitBtn.disabled = false;
            submitBtn.innerHTML = '<i class="fa-solid fa-user-plus"></i> Create Account';
        }
    });
}

// =========================================================
// 5. MANAGE & REMOVE ADMIN / STAFF ACCOUNTS (SUPER ADMIN ONLY)
// =========================================================
function setupEmployeeManager() {
    const manageModal = document.getElementById("manageStaffModal");
    const openBtn = document.getElementById("openManageStaffModalBtn");
    const closeBtn = document.getElementById("closeManageStaffModal");
    const overlay = document.getElementById("manageStaffModalOverlay");
    const listContainer = document.getElementById("manageStaffList");
    const msgEl = document.getElementById("manageStaffMessage");

    if (!manageModal || !openBtn) return;

    const closeModal = () => {
        manageModal.classList.remove("active");
        if (msgEl) msgEl.style.display = "none";
    };

    openBtn.addEventListener("click", () => {
        manageModal.classList.add("active");
        loadStaffAccountsList();
    });

    if (closeBtn) closeBtn.addEventListener("click", closeModal);
    if (overlay) overlay.addEventListener("click", closeModal);

    async function loadStaffAccountsList() {
        if (!listContainer) return;
        listContainer.innerHTML = `
            <div class="table-loading-cell">
                <i class="fa-solid fa-spinner fa-spin"></i> Loading staff accounts...
            </div>
        `;

        try {
            const usersRef = ref(db, "Users");
            const snapshot = await get(usersRef);

            if (!snapshot.exists()) {
                listContainer.innerHTML = `<p class="staff-empty-text">No staff accounts found.</p>`;
                return;
            }

            const usersData = snapshot.val();
            const staffList = [];

            Object.entries(usersData).forEach(([uid, u]) => {
                if (!u) return;
                const roleLower = (u.role || "").toLowerCase().replace(/[\s_]/g, "");
                
                // Exclude removed accounts and regular customers
                if (roleLower === "admin" || roleLower === "superadmin" || roleLower === "owner" || roleLower === "barista") {
                    staffList.push({ uid, ...u });
                }
            });

            if (staffList.length === 0) {
                listContainer.innerHTML = `<p class="staff-empty-text">No employee accounts found.</p>`;
                return;
            }

            renderStaffListItems(staffList);

        } catch (err) {
            console.error("Error loading staff accounts:", err);
            listContainer.innerHTML = `<p class="staff-error-text">Failed to load staff accounts: ${escapeHTML(err.message)}</p>`;
        }
    }

    function renderStaffListItems(staffMembers) {
        listContainer.innerHTML = "";
        const currentUid = currentUserAdmin?.uid;

        staffMembers.forEach((staff) => {
            const item = document.createElement("div");
            item.className = "manage-staff-card";
            item.id = `staffCard_${staff.uid}`;

            const name = staff.fullName || staff.username || "Staff Member";
            const email = staff.email || "No email";
            const role = (staff.role === "superadmin" || staff.role === "owner") ? "Owner" : "Barista";
            const isSelf = staff.uid === currentUid;

            item.innerHTML = `
                <div class="manage-staff-info">
                    <div class="manage-staff-avatar">
                        <i class="fa-solid fa-user"></i>
                    </div>
                    <div class="manage-staff-details">
                        <strong>${escapeHTML(name)} ${isSelf ? '<span class="self-tag">(You)</span>' : ''}</strong>
                        <span>${escapeHTML(email)}</span>
                        <small class="role-pill-small ${role.toLowerCase()}">${role}</small>
                    </div>
                </div>
                <div class="manage-staff-actions">
                    <button type="button" class="btn-remove-staff" data-uid="${staff.uid}" data-name="${escapeHTML(name)}" ${isSelf ? 'disabled title="You cannot delete your own account"' : ''}>
                        <i class="fa-solid fa-trash-can"></i> Remove
                    </button>
                </div>
            `;

            listContainer.appendChild(item);
        });

        // Attach click listeners
        listContainer.querySelectorAll(".btn-remove-staff:not(:disabled)").forEach((btn) => {
            btn.addEventListener("click", () => {
                const targetUid = btn.dataset.uid;
                const targetName = btn.dataset.name;
                confirmAndRemoveStaff(targetUid, targetName, btn);
            });
        });
    }

    async function confirmAndRemoveStaff(uid, name, btn) {
        const confirmed = confirm(`Are you sure you want to remove "${name}"?\n\nThis will permanently delete their profile, release their username, and revoke their system access.`);
        if (!confirmed) return;

        btn.disabled = true;
        btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Removing...`;

        try {
            // 1. Fetch user data to retrieve their username for cleanup
            const userSnap = await get(ref(db, `Users/${uid}`));
            let usernameToRemove = null;
            if (userSnap.exists()) {
                const userData = userSnap.val();
                usernameToRemove = (userData.username || "").trim().toLowerCase();
            }

            // 2. Delete user profile record from Realtime Database Users/{uid}
            await remove(ref(db, `Users/${uid}`));

            // 3. Delete lookup entry from Usernames/{username} if it exists
            if (usernameToRemove) {
                await remove(ref(db, `Usernames/${usernameToRemove}`));
            }

            // 4. Animate and remove the card from the UI
            const cardEl = document.getElementById(`staffCard_${uid}`);
            if (cardEl) {
                cardEl.style.transition = "opacity 0.25s, transform 0.25s";
                cardEl.style.opacity = "0";
                cardEl.style.transform = "scale(0.95)";
                setTimeout(() => cardEl.remove(), 260);
            }

            if (msgEl) {
                msgEl.style.display = "block";
                msgEl.style.background = "#e3f8ec";
                msgEl.style.color = "#1b874c";
                msgEl.textContent = `Staff account for "${name}" was successfully removed.`;
            }

            setTimeout(() => {
                loadStaffAccountsList();
            }, 600);

        } catch (err) {
            console.error("Failed to delete staff account:", err);
            
            if (err.message && err.message.includes("PERMISSION_DENIED")) {
                alert("Permission Denied: Please verify your Firebase Realtime Database Rules for Usernames.");
            } else {
                alert("Could not remove staff account: " + err.message);
            }

            btn.disabled = false;
            btn.innerHTML = `<i class="fa-solid fa-trash-can"></i> Remove`;
        }
    }
}

// =========================================================
// 6. CSV EXPORT
// =========================================================
function downloadAttendanceCSV() {
    if (!filteredRecords || filteredRecords.length === 0) {
        alert("No attendance records to export.");
        return;
    }

    const filename = isSuperAdmin ? "GimikCafe_Attendance_Report_All.csv" : "GimikCafe_Personal_Attendance.csv";
    const headers = ["Date", "Staff Member", "Role", "Status", "Time In", "Break Out", "Break In", "Break Duration", "Time Out", "Total Worked"];
    const rows = filteredRecords.map(staff => {
        const status = determineStatus(staff);
        const total = calculateTotalTime(staff);
        const duration = staff.breakOut && staff.breakIn ? `${Math.round((staff.breakIn - staff.breakOut) / (1000 * 60))}m` : "-";

        return [
            `"${staff.dateKey}"`,
            `"${staff.staffName || "Staff Member"}"`,
            `"${staff.role || "Barista"}"`,
            `"${status.label}"`,
            `"${formatTime(staff.timeIn)}"`,
            `"${formatTime(staff.breakOut)}"`,
            `"${formatTime(staff.breakIn)}"`,
            `"${duration}"`,
            `"${formatTime(staff.timeOut)}"`,
            `"${total}"`
        ];
    });

    const csvContent = "data:text/csv;charset=utf-8," 
        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");

    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}