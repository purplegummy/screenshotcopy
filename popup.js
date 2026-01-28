// Elements - Panels
const mainPanel = document.getElementById("main-panel");
const keybindsPanel = document.getElementById("keybinds-panel");
const settingsPanel = document.getElementById("settings-panel");

// Elements - Main
const settingsToggle = document.getElementById("settings-toggle");
const captureNewBtn = document.getElementById("capture-new-btn");
const textNewBtn = document.getElementById("text-new-btn");
const manageSlots = document.getElementById("manage-slots-btn");
const slotsList = document.getElementById("slots-list");
const status = document.getElementById("status");

// Elements - Keybinds
const backFromKeybinds = document.getElementById("back-from-keybinds");
const addSlotBtn = document.getElementById("add-slot-btn");
const slotsEditor = document.getElementById("keybind-slots-editor");

// Elements - Settings
const backFromSettings = document.getElementById("back-from-settings");
const autoSendToggle = document.getElementById("auto-send");
const showNotificationsToggle = document.getElementById("show-notifications");
const targetUrlSelect = document.getElementById("target-url");

// Elements - Modal
const keybindModal = document.getElementById("keybind-modal");
const keybindPreview = document.getElementById("keybind-preview");
const cancelKeybind = document.getElementById("cancel-keybind");
const saveKeybind = document.getElementById("save-keybind");

// State
let keybindSlots = [];
let currentEditingSlotId = null;
let capturedKeybind = null;

// Initialize
loadSettings();
loadSlots();

// Navigation
settingsToggle?.addEventListener("click", () => showPanel("settings"));
manageSlots?.addEventListener("click", () => showPanel("keybinds"));
backFromKeybinds?.addEventListener("click", () => showPanel("main"));
backFromSettings?.addEventListener("click", () => {
  saveSettings();
  showPanel("main");
});

function showPanel(panel) {
  mainPanel.classList.add("hidden");
  keybindsPanel.classList.add("hidden");
  settingsPanel.classList.add("hidden");
  
  if (panel === "main") {
    mainPanel.classList.remove("hidden");
    renderSlotsPreview();
  } else if (panel === "keybinds") {
    keybindsPanel.classList.remove("hidden");
    renderSlotsEditor();
  } else if (panel === "settings") {
    settingsPanel.classList.remove("hidden");
  }
}

// Quick Actions
captureNewBtn?.addEventListener("click", () => {
  setStatus("Capturing screenshot...", "");
  captureNewBtn.disabled = true;
  
  chrome.runtime.sendMessage({
    type: "CAPTURE_SCREENSHOT",
    settings: getSettings(),
    slot: { mode: "new", action: "screenshot" }
  }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Failed to capture", "error");
    } else {
      setStatus("Screenshot sent! ✓", "success");
    }
    captureNewBtn.disabled = false;
  });
});

textNewBtn?.addEventListener("click", () => {
  setStatus("Capturing text...", "");
  textNewBtn.disabled = true;
  
  chrome.runtime.sendMessage({
    type: "CAPTURE_TEXT",
    settings: getSettings(),
    slot: { mode: "new", action: "text" }
  }, (response) => {
    if (chrome.runtime.lastError) {
      setStatus("Failed to capture", "error");
    } else {
      setStatus("Text sent! ✓", "success");
    }
    textNewBtn.disabled = false;
  });
});

// Add Slot
addSlotBtn?.addEventListener("click", () => {
  const newSlot = {
    id: `slot-${Date.now()}`,
    name: `Slot ${keybindSlots.length + 1}`,
    keybind: null,
    action: "screenshot",
    mode: "continue",
    tabId: null
  };
  
  keybindSlots.push(newSlot);
  saveSlots();
  renderSlotsEditor();
});

// Keybind Modal
cancelKeybind?.addEventListener("click", closeKeybindModal);
saveKeybind?.addEventListener("click", () => {
  if (capturedKeybind && currentEditingSlotId) {
    const slot = keybindSlots.find(s => s.id === currentEditingSlotId);
    if (slot) {
      slot.keybind = capturedKeybind;
      saveSlots();
      renderSlotsEditor();
    }
  }
  closeKeybindModal();
});

function openKeybindModal(slotId) {
  currentEditingSlotId = slotId;
  capturedKeybind = null;
  keybindPreview.textContent = "Waiting...";
  keybindPreview.classList.add("empty");
  saveKeybind.disabled = true;
  keybindModal.classList.remove("hidden");
  
  // Notify content scripts that we're capturing
  chrome.storage.sync.set({ isCapturingKeybind: true });
  
  document.addEventListener("keydown", captureKeybindHandler);
}

function closeKeybindModal() {
  keybindModal.classList.add("hidden");
  currentEditingSlotId = null;
  capturedKeybind = null;
  
  chrome.storage.sync.set({ isCapturingKeybind: false });
  document.removeEventListener("keydown", captureKeybindHandler);
}

function captureKeybindHandler(event) {
  event.preventDefault();
  event.stopPropagation();
  
  // Ignore modifier-only presses
  if (["Control", "Shift", "Alt", "Meta"].includes(event.key)) {
    return;
  }
  
  capturedKeybind = {
    key: event.key.length === 1 ? event.key.toUpperCase() : event.key,
    ctrl: event.ctrlKey,
    shift: event.shiftKey,
    alt: event.altKey,
    meta: event.metaKey
  };
  
  keybindPreview.textContent = formatKeybind(capturedKeybind);
  keybindPreview.classList.remove("empty");
  saveKeybind.disabled = false;
}

// Render Functions
function renderSlotsPreview() {
  if (!slotsList) return;
  
  slotsList.innerHTML = keybindSlots.slice(0, 4).map(slot => `
    <div class="slot-preview-item">
      <span class="slot-name">${escapeHtml(slot.name)}</span>
      <span class="slot-keybind">${slot.keybind ? formatKeybind(slot.keybind) : "Not set"}</span>
    </div>
  `).join("");
}

function renderSlotsEditor() {
  if (!slotsEditor) return;
  
  slotsEditor.innerHTML = keybindSlots.map(slot => `
    <div class="slot-card" data-slot-id="${slot.id}">
      <div class="slot-card-header">
        <input type="text" class="slot-name-input" value="${escapeHtml(slot.name)}" 
               data-slot-id="${slot.id}" placeholder="Slot name">
        <button class="delete-slot-btn" data-slot-id="${slot.id}" title="Delete">🗑️</button>
      </div>
      
      <div class="slot-options">
        <div class="slot-option">
          <label>Action</label>
          <select class="slot-action-select" data-slot-id="${slot.id}">
            <option value="screenshot" ${slot.action === "screenshot" ? "selected" : ""}>Screenshot</option>
            <option value="text" ${slot.action === "text" ? "selected" : ""}>Selected Text</option>
          </select>
        </div>
        <div class="slot-option">
          <label>Mode</label>
          <select class="slot-mode-select" data-slot-id="${slot.id}">
            <option value="new" ${slot.mode === "new" ? "selected" : ""}>New Chat</option>
            <option value="continue" ${slot.mode === "continue" ? "selected" : ""}>Continue Chat</option>
          </select>
        </div>
      </div>
      
      <div class="slot-keybind-row">
        <div class="keybind-display ${slot.keybind ? "" : "empty"}">
          ${slot.keybind ? formatKeybind(slot.keybind) : "No keybind set"}
        </div>
        <button class="change-keybind-btn" data-slot-id="${slot.id}">Set</button>
      </div>
    </div>
  `).join("");
  
  // Add event listeners
  slotsEditor.querySelectorAll(".slot-name-input").forEach(input => {
    input.addEventListener("change", (e) => {
      const slotId = e.target.dataset.slotId;
      const slot = keybindSlots.find(s => s.id === slotId);
      if (slot) {
        slot.name = e.target.value || "Unnamed Slot";
        saveSlots();
      }
    });
  });
  
  slotsEditor.querySelectorAll(".slot-action-select").forEach(select => {
    select.addEventListener("change", (e) => {
      const slotId = e.target.dataset.slotId;
      const slot = keybindSlots.find(s => s.id === slotId);
      if (slot) {
        slot.action = e.target.value;
        saveSlots();
      }
    });
  });
  
  slotsEditor.querySelectorAll(".slot-mode-select").forEach(select => {
    select.addEventListener("change", (e) => {
      const slotId = e.target.dataset.slotId;
      const slot = keybindSlots.find(s => s.id === slotId);
      if (slot) {
        slot.mode = e.target.value;
        slot.tabId = null; // Reset tab association when mode changes
        saveSlots();
      }
    });
  });
  
  slotsEditor.querySelectorAll(".change-keybind-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      openKeybindModal(e.target.dataset.slotId);
    });
  });
  
  slotsEditor.querySelectorAll(".delete-slot-btn").forEach(btn => {
    btn.addEventListener("click", (e) => {
      const slotId = e.target.dataset.slotId;
      keybindSlots = keybindSlots.filter(s => s.id !== slotId);
      saveSlots();
      renderSlotsEditor();
    });
  });
}

// Storage Functions
function loadSlots() {
  chrome.runtime.sendMessage({ type: "GET_SLOTS" }, (response) => {
    keybindSlots = response?.slots || [];
    renderSlotsPreview();
  });
}

function saveSlots() {
  chrome.runtime.sendMessage({ type: "SAVE_SLOTS", slots: keybindSlots });
}

function loadSettings() {
  chrome.storage.sync.get("settings", (data) => {
    const settings = data.settings || {};
    if (autoSendToggle) autoSendToggle.checked = settings.autoSend ?? true;
    if (showNotificationsToggle) showNotificationsToggle.checked = settings.showNotifications ?? true;
    if (targetUrlSelect) targetUrlSelect.value = settings.targetUrl ?? "https://chatgpt.com/";
  });
}

function saveSettings() {
  chrome.storage.sync.set({ settings: getSettings() });
}

function getSettings() {
  return {
    autoSend: autoSendToggle?.checked ?? true,
    showNotifications: showNotificationsToggle?.checked ?? true,
    targetUrl: targetUrlSelect?.value ?? "https://chatgpt.com/"
  };
}

// Utility Functions
function setStatus(message, type = "") {
  if (status) {
    status.textContent = message;
    status.className = type;
  }
}

function formatKeybind(keybind) {
  if (!keybind || !keybind.key) return "Not set";
  
  const parts = [];
  if (keybind.ctrl) parts.push("Ctrl");
  if (keybind.alt) parts.push("Alt");
  if (keybind.shift) parts.push("Shift");
  if (keybind.meta) parts.push("⌘");
  parts.push(keybind.key.toUpperCase());
  
  return parts.join(" + ");
}

function escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text;
  return div.innerHTML;
}

// Settings handlers
autoSendToggle?.addEventListener("change", saveSettings);
showNotificationsToggle?.addEventListener("change", saveSettings);
targetUrlSelect?.addEventListener("change", saveSettings);
