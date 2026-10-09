
/* =========================================
   MY PERSONAL VAULT
   Supabase Auth + Private Storage + PIN lock
   ========================================= */

// 1. SUPABASE CONFIGURATION
const SUPABASE_URL = "https://kflffrhzcsoyotkvbkym.supabase.co";
const SUPABASE_PUBLISHABLE_KEY = "sb_publishable_vQy7JBCqr3SrlGXA_cBeJQ_OpPJ2Kay";

let client = null;
let currentUser = null;
let personalUnlocked = false;
let busy = false;
let authSubscription = null;

// 2. HTML ELEMENTS
const $ = id => document.getElementById(id);

const loginPage = $("loginPage");
const vaultPage = $("vaultPage");
const fileSection = $("fileSection");
const fileList = $("fileList");
const pinModal = $("pinModal");
const viewer = $("photoViewer");

// 3. GENERAL HELPERS
function message(id, text, color = "#e2e8f0") {
    const element = $(id);
    if (!element) return;

    element.textContent = text;
    element.style.color = color;
}

function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, character => ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;"
    })[character]);
}

function initializeSupabase() {
    if (!window.supabase) {
        throw new Error(
            "Supabase did not load. Check your internet connection."
        );
    }

    if (
        SUPABASE_URL.includes("PASTE_YOUR") ||
        SUPABASE_PUBLISHABLE_KEY.includes("PASTE_YOUR")
    ) {
        throw new Error(
            "Add your real Supabase Project URL and Publishable key in script.js."
        );
    }

    client = window.supabase.createClient(
        SUPABASE_URL,
        SUPABASE_PUBLISHABLE_KEY
    );
}

// 4. LOGIN AND DASHBOARD
function showLogin() {
    loginPage.classList.add("active");
    vaultPage.classList.remove("active");

    fileSection.hidden = true;
    fileList.replaceChildren();

    pinModal.hidden = true;
    closePhoto();

    personalUnlocked = false;
    currentUser = null;
    clearPinFields();
}

function showVault(user) {
    currentUser = user;

    loginPage.classList.remove("active");
    vaultPage.classList.add("active");

    $("userEmail").textContent = user.email || "";
}

async function getUser() {
    const { data, error } = await client.auth.getUser();

    if (error) throw error;
    if (!data.user) {
        throw new Error("Session expired. Please log in again.");
    }

    currentUser = data.user;
    return data.user;
}

$("loginForm").addEventListener("submit", async event => {
    event.preventDefault();

    if (!client) {
        message("loginMessage", "Supabase is not configured.", "#fca5a5");
        return;
    }

    const button = $("loginButton");
    button.disabled = true;
    message("loginMessage", "Signing in...");

    try {
        const { data, error } = await client.auth.signInWithPassword({
            email: $("email").value.trim(),
            password: $("password").value
        });

        if (error) throw error;

        personalUnlocked = false;
        showVault(data.user);
        message("loginMessage", "");
    } catch (error) {
        console.error("Login failed:", error);
        message("loginMessage", error.message, "#fca5a5");
    } finally {
        button.disabled = false;
    }
});

$("logoutButton").addEventListener("click", async () => {
    if (!client) return;

    try {
        await lockPersonalPIN();

        const { error } = await client.auth.signOut();
        if (error) throw error;

        showLogin();
        $("password").value = "";
    } catch (error) {
        console.error(error);
        alert("Logout failed: " + error.message);
    }
});

// 5. PERSONAL PIN LOCK
function clearPinFields() {
    if ($("personalPin")) $("personalPin").value = "";
    if ($("newPersonalPin")) $("newPersonalPin").value = "";
    if ($("confirmPersonalPin")) $("confirmPersonalPin").value = "";

    message("pinMessage", "");
    message("setPinMessage", "");
}

function openPinModal() {
    clearPinFields();
    pinModal.hidden = false;
    $("personalPin").focus();
}

// Create or change the PIN using the Supabase RPC function.
async function setPersonalPIN(pin) {
    if (!/^\d{6}$/.test(pin)) {
        throw new Error("PIN must contain exactly six digits.");
    }

    const { error } = await client.rpc("set_personal_pin", {
        p_pin: pin
    });

    if (error) throw error;
    return true;
}

// Verify the PIN on the server.
async function unlockPersonalPIN(pin) {
    if (!/^\d{6}$/.test(pin)) {
        throw new Error("Enter exactly six digits.");
    }

    const { data, error } = await client.rpc(
        "unlock_personal_vault",
        { p_pin: pin }
    );

    if (error) throw error;

    if (data !== true) {
        throw new Error("Incorrect PIN.");
    }

    personalUnlocked = true;
    return true;
}

// Revoke the server-side unlock state.
async function lockPersonalPIN() {
    personalUnlocked = false;

    if (!client || !currentUser) return;

    const { error } = await client.rpc("lock_personal_vault");

    if (error) throw error;
}

// Check the server's unlock state before accessing Personal files.
async function checkPersonalPINStatus() {
    if (!client) return false;

    const { data, error } = await client.rpc(
        "personal_vault_is_unlocked"
    );

    if (error) throw error;

    personalUnlocked = data === true;
    return personalUnlocked;
}

$("pinForm").addEventListener("submit", async event => {
    event.preventDefault();

    const pin = $("personalPin").value;
    const button = $("pinUnlockButton");

    button.disabled = true;
    message("pinMessage", "Verifying PIN...");

    try {
        await unlockPersonalPIN(pin);

        pinModal.hidden = true;
        $("personalPin").value = "";

        await renderFiles("Personal");
    } catch (error) {
        console.error("PIN verification failed:", error);
        message("pinMessage", error.message, "#fca5a5");
    } finally {
        button.disabled = false;
    }
});

$("setPinForm").addEventListener("submit", async event => {
    event.preventDefault();

    const pin = $("newPersonalPin").value;
    const confirmation = $("confirmPersonalPin").value;

    if (!/^\d{6}$/.test(pin)) {
        message("setPinMessage", "Use exactly six digits.", "#fca5a5");
        return;
    }

    if (pin !== confirmation) {
        message("setPinMessage", "The PINs do not match.", "#fca5a5");
        return;
    }

    try {
        await setPersonalPIN(pin);

        message(
            "setPinMessage",
            "PIN saved. Enter it above to unlock.",
            "#86efac"
        );

        $("newPersonalPin").value = "";
        $("confirmPersonalPin").value = "";
        $("personalPin").focus();
    } catch (error) {
        console.error(error);
        message("setPinMessage", error.message, "#fca5a5");
    }
});

$("pinCancelButton").addEventListener("click", async () => {
    pinModal.hidden = true;
    clearPinFields();
    fileSection.hidden = true;
    fileList.replaceChildren();
});

// 6. CATEGORY NAVIGATION
document.querySelectorAll("[data-category]").forEach(button => {
    button.addEventListener("click", async () => {
        const category = button.dataset.category;

        if (category === "Personal") {
            try {
                const unlocked = await checkPersonalPINStatus();

                if (!unlocked) {
                    openPinModal();
                    return;
                }

                await renderFiles("Personal");
            } catch (error) {
                console.error(error);
                openPinModal();
                message("pinMessage", error.message, "#fca5a5");
            }
        } else {
            await renderFiles(category);
        }
    });
});

$("closeFilesButton").addEventListener("click", async () => {
    const category = $("fileSectionTitle").dataset.category;

    fileSection.hidden = true;
    fileList.replaceChildren();

    if (category === "Personal") {
        try {
            await lockPersonalPIN();
        } catch (error) {
            console.error("Could not lock Personal folder:", error);
            alert("The folder could not be locked on the server. Please retry.");
        }
    }
});

// 7. UPLOAD FILES
$("uploadButton").addEventListener("click", async () => {
    if (!client || busy) return;

    const category = $("categorySelect").value;
    const files = Array.from($("fileInput").files);

    if (!files.length) {
        message("uploadMessage", "Choose at least one file.", "#fca5a5");
        return;
    }

    if (category === "Personal") {
        try {
            if (!(await checkPersonalPINStatus())) {
                openPinModal();
                message("pinMessage", "Unlock Personal before uploading.");
                return;
            }
        } catch (error) {
            message("uploadMessage", error.message, "#fca5a5");
            return;
        }
    }

    busy = true;
    $("uploadButton").disabled = true;

    try {
        const user = await getUser();
        let uploaded = 0;
        const failures = [];

        for (let i = 0; i < files.length; i++) {
            const file = files[i];
            const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
            const path =
                `${user.id}/${category}/${Date.now()}_${i}_${safeName}`;

            message(
                "uploadMessage",
                `Uploading ${i + 1} of ${files.length}: ${file.name}`
            );

            const { error } = await client.storage
                .from("vault")
                .upload(path, file, { upsert: false });

            if (error) {
                console.error("Upload failed:", error);
                failures.push(file.name);
            } else {
                uploaded++;
            }
        }

        $("fileInput").value = "";

        message(
            "uploadMessage",
            `${uploaded} uploaded; ${failures.length} failed.`,
            failures.length ? "#fca5a5" : "#86efac"
        );

        await renderFiles(category);
    } catch (error) {
        console.error(error);
        message("uploadMessage", error.message, "#fca5a5");
    } finally {
        busy = false;
        $("uploadButton").disabled = false;
    }
});

// 8. LIST FILES
async function renderFiles(category) {
    if (!client) return;

    if (category === "Personal") {
        try {
            if (!(await checkPersonalPINStatus())) {
                personalUnlocked = false;
                openPinModal();
                return;
            }
        } catch (error) {
            console.error(error);
            openPinModal();
            message("pinMessage", error.message, "#fca5a5");
            return;
        }
    }

    try {
        const user = await getUser();

        fileSection.hidden = false;
        $("fileSectionTitle").textContent = {
            Photos: "📸 Photos",
            Documents: "📄 Documents",
            Personal: "🔒 Personal Files"
        }[category];

        $("fileSectionTitle").dataset.category = category;
        fileList.textContent = "Loading files...";

        const { data, error } = await client.storage
            .from("vault")
            .list(`${user.id}/${category}`, {
                limit: 100,
                sortBy: { column: "created_at", order: "desc" }
            });

        if (error) throw error;

        const files = (data || []).filter(file => file.name);

        if (!files.length) {
            fileList.innerHTML =
                '<p class="empty-message">No files here yet.</p>';
            return;
        }

        if (category === "Photos") {
            await renderPhotos(user.id, files);
        } else {
            renderFileList(category, files);
        }
    } catch (error) {
        console.error(error);
        fileList.textContent = "Could not load files: " + error.message;
    }
}

// 9. PHOTO GALLERY
async function renderPhotos(userId, files) {
    fileList.replaceChildren();

    const gallery = document.createElement("div");
    gallery.className = "photo-gallery";

    const images = files.filter(file =>
        /\.(jpg|jpeg|png|gif|webp|bmp|avif)$/i.test(file.name)
    );

    for (const file of images) {
        const path = `${userId}/Photos/${file.name}`;

        const { data, error } = await client.storage
            .from("vault")
            .createSignedUrl(path, 60);

        if (error) {
            console.error(error);
            continue;
        }

        const card = document.createElement("div");
        card.className = "photo-card";

        const image = document.createElement("img");
        image.src = data.signedUrl;
        image.alt = file.name;
        image.loading = "lazy";
        image.addEventListener("click", () => openPhoto(data.signedUrl));

        const remove = document.createElement("button");
        remove.className = "photo-delete";
        remove.textContent = "🗑️";
        remove.setAttribute("aria-label", "Delete photo");
        remove.addEventListener("click", () =>
            deleteFile("Photos", file.name)
        );

        card.append(image, remove);
        gallery.appendChild(card);
    }

    if (!gallery.children.length) {
        fileList.innerHTML =
            '<p class="empty-message">No supported photos found.</p>';
        return;
    }

    fileList.appendChild(gallery);
}

// 10. DOCUMENTS AND PERSONAL FILE LIST
function renderFileList(category, files) {
    fileList.replaceChildren();

    for (const file of files) {
        const item = document.createElement("div");
        item.className = "file-item";

        const name = document.createElement("div");
        name.className = "file-name";
        name.textContent = file.name;

        const actions = document.createElement("div");
        actions.className = "file-actions";

        const download = document.createElement("button");
        download.className = "download-btn";
        download.textContent = "⬇️ Download";
        download.addEventListener("click", () =>
            downloadFile(category, file.name)
        );

        const remove = document.createElement("button");
        remove.className = "danger";
        remove.textContent = "🗑️ Delete";
        remove.addEventListener("click", () =>
            deleteFile(category, file.name)
        );

        actions.append(download, remove);
        item.append(name, actions);
        fileList.appendChild(item);
    }
}

// 11. DOWNLOAD FILE
async function downloadFile(category, name) {
    try {
        if (category === "Personal" && !(await checkPersonalPINStatus())) {
            personalUnlocked = false;
            openPinModal();
            return;
        }

        const user = await getUser();
        const path = `${user.id}/${category}/${name}`;

        const { data, error } = await client.storage
            .from("vault")
            .createSignedUrl(path, 60, { download: name });

        if (error) throw error;

        window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    } catch (error) {
        console.error(error);
        alert("Download failed: " + error.message);
    }
}

// 12. DELETE FILE
async function deleteFile(category, name) {
    try {
        if (category === "Personal" && !(await checkPersonalPINStatus())) {
            personalUnlocked = false;
            openPinModal();
            return;
        }

        if (!confirm(`Permanently delete "${name}"?`)) return;

        const user = await getUser();
        const path = `${user.id}/${category}/${name}`;

        const { error } = await client.storage
            .from("vault")
            .remove([path]);

        if (error) throw error;

        await renderFiles(category);
    } catch (error) {
        console.error(error);
        alert("Delete failed: " + error.message);
    }
}

// 13. PHOTO VIEWER
function openPhoto(url) {
    $("viewerImage").src = url;
    viewer.hidden = false;
}

function closePhoto() {
    if (!viewer) return;

    viewer.hidden = true;
    $("viewerImage").src = "";
}

$("viewerCloseButton").addEventListener("click", closePhoto);

viewer.addEventListener("click", event => {
    if (event.target === viewer) closePhoto();
});

document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
        closePhoto();

        if (!pinModal.hidden) {
            pinModal.hidden = true;
            clearPinFields();
            fileSection.hidden = true;
            fileList.replaceChildren();
        }
    }
});

// Lock Personal when the page is hidden.
document.addEventListener("visibilitychange", async () => {
    if (document.hidden && personalUnlocked) {
        try {
            await lockPersonalPIN();
        } catch (error) {
            console.error("Automatic lock failed:", error);
        }

        fileSection.hidden = true;
        fileList.replaceChildren();
    }
});

// 14. RESTORE AUTH SESSION
async function startApp() {
    try {
        initializeSupabase();

        const { data, error } = await client.auth.getSession();
        if (error) throw error;

        if (data.session) {
            showVault(data.session.user);
        } else {
            showLogin();
        }

        const result = client.auth.onAuthStateChange((event, session) => {
            if (event === "SIGNED_OUT" || !session) {
                personalUnlocked = false;
                currentUser = null;
                showLogin();
            } else if (session.user) {
                showVault(session.user);
            }
        });

        authSubscription = result.data.subscription;
    } catch (error) {
        console.error("Startup error:", error);
        message("loginMessage", error.message, "#fca5a5");
    }
}

startApp();
