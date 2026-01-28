// Keybind listener - runs on all pages to capture custom key combinations

let keybindSlots = [];
let isCapturingKeybind = false;

// Load keybind slots from storage
chrome.storage.sync.get("keybindSlots", (data) => {
  keybindSlots = data.keybindSlots || getDefaultSlots();
});

// Listen for storage changes
chrome.storage.onChanged.addListener((changes) => {
  if (changes.keybindSlots) {
    keybindSlots = changes.keybindSlots.newValue || getDefaultSlots();
  }
  if (changes.isCapturingKeybind) {
    isCapturingKeybind = changes.isCapturingKeybind.newValue || false;
  }
});

function getDefaultSlots() {
  return [
    {
      id: "slot-1",
      name: "New Chat + Screenshot",
      keybind: { key: "S", ctrl: true, shift: true, alt: false, meta: false },
      action: "screenshot",
      mode: "new", // "new" = new chat, "continue" = same chat
      tabId: null
    },
    {
      id: "slot-2", 
      name: "Continue Chat + Screenshot",
      keybind: { key: "D", ctrl: true, shift: true, alt: false, meta: false },
      action: "screenshot",
      mode: "continue",
      tabId: null
    },
    {
      id: "slot-3",
      name: "New Chat + Text",
      keybind: { key: "C", ctrl: true, shift: true, alt: false, meta: false },
      action: "text",
      mode: "new",
      tabId: null
    },
    {
      id: "slot-4",
      name: "Continue Chat + Text", 
      keybind: { key: "V", ctrl: true, shift: true, alt: false, meta: false },
      action: "text",
      mode: "continue",
      tabId: null
    }
  ];
}

// Listen for keydown events
document.addEventListener("keydown", (event) => {
  // Skip if we're capturing a keybind in the popup
  if (isCapturingKeybind) return;
  
  // Skip if typing in an input field (unless it's a modifier + key combo)
  const isInput = event.target.tagName === "INPUT" || 
                  event.target.tagName === "TEXTAREA" || 
                  event.target.isContentEditable;
  
  // Check each slot for a matching keybind
  for (const slot of keybindSlots) {
    if (matchesKeybind(event, slot.keybind)) {
      // Prevent default browser behavior
      event.preventDefault();
      event.stopPropagation();
      
      console.log(`[Keybind] Triggered slot: ${slot.name}`);
      
      // Send message to background script
      chrome.runtime.sendMessage({
        type: "KEYBIND_TRIGGERED",
        slot: slot
      });
      
      return;
    }
  }
}, true);

function matchesKeybind(event, keybind) {
  if (!keybind || !keybind.key) return false;
  
  const keyMatches = event.key.toUpperCase() === keybind.key.toUpperCase() ||
                     event.code === `Key${keybind.key.toUpperCase()}` ||
                     event.code === keybind.key;
  
  const ctrlMatches = event.ctrlKey === (keybind.ctrl || false);
  const shiftMatches = event.shiftKey === (keybind.shift || false);
  const altMatches = event.altKey === (keybind.alt || false);
  const metaMatches = event.metaKey === (keybind.meta || false);
  
  return keyMatches && ctrlMatches && shiftMatches && altMatches && metaMatches;
}

// Helper function to format keybind for display
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

