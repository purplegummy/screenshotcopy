// Background service worker for ChatGPT Quick Send

const defaultSettings = {
  autoSend: true,
  showNotifications: true,
  targetUrl: "https://chatgpt.com/"
};

const defaultSlots = [
  {
    id: "slot-1",
    name: "New Chat + Screenshot",
    keybind: { key: "S", ctrl: true, shift: true, alt: false, meta: false },
    action: "screenshot",
    mode: "new",
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

// Initialize on install
chrome.runtime.onInstalled.addListener(() => {
  console.log("ChatGPT Quick Send extension installed.");
  
  chrome.storage.sync.get(["settings", "keybindSlots"], (data) => {
    if (!data.settings) {
      chrome.storage.sync.set({ settings: defaultSettings });
    }
    if (!data.keybindSlots) {
      chrome.storage.sync.set({ keybindSlots: defaultSlots });
    }
  });
});

// Message listener
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "KEYBIND_TRIGGERED") {
    handleKeybindTrigger(message.slot);
    sendResponse({ status: "processing" });
    return true;
  }
  
  if (message?.type === "CAPTURE_SCREENSHOT") {
    const settings = message.settings || defaultSettings;
    const slot = message.slot || { mode: "new", action: "screenshot" };
    captureAndSend("screenshot", slot, settings);
    sendResponse({ status: "capture queued" });
    return true;
  }
  
  if (message?.type === "CAPTURE_TEXT") {
    const settings = message.settings || defaultSettings;
    const slot = message.slot || { mode: "new", action: "text" };
    captureAndSend("text", slot, settings);
    sendResponse({ status: "text capture queued" });
    return true;
  }
  
  if (message?.type === "GET_SLOTS") {
    chrome.storage.sync.get("keybindSlots", (data) => {
      sendResponse({ slots: data.keybindSlots || defaultSlots });
    });
    return true;
  }
  
  if (message?.type === "SAVE_SLOTS") {
    chrome.storage.sync.set({ keybindSlots: message.slots }, () => {
      sendResponse({ status: "saved" });
    });
    return true;
  }
});

async function handleKeybindTrigger(slot) {
  console.log(`[Background] Keybind triggered for slot: ${slot.name}`);
  
  const settings = await getSettings();
  
  if (slot.action === "screenshot") {
    await captureAndSend("screenshot", slot, settings);
  } else if (slot.action === "text") {
    await captureAndSend("text", slot, settings);
  }
}

async function captureAndSend(action, slot, settings) {
  try {
    console.log(`[Capture] Starting ${action} capture for slot: ${slot.name || "manual"}`);
    
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs.length) {
      console.warn("[Capture] No active tab.");
      return;
    }
    
    let data;
    
    if (action === "screenshot") {
      console.log(`[Capture] Capturing visible tab: ${tabs[0].title}`);
      data = await chrome.tabs.captureVisibleTab(tabs[0].windowId, { format: "png" });
      console.log(`[Capture] Screenshot captured, size: ${data.length} bytes`);
    } else if (action === "text") {
      const results = await chrome.scripting.executeScript({
        target: { tabId: tabs[0].id },
        func: () => window.getSelection().toString()
      });
      data = results[0]?.result?.trim();
      
      if (!data) {
        console.warn("[Capture] No text selected.");
        return;
      }
      console.log(`[Capture] Text captured: "${data.substring(0, 50)}..."`);
    }
    
    // Get or create ChatGPT tab based on mode
    const chatGptTabId = await getChatGptTab(slot, settings);
    
    if (typeof chatGptTabId !== "number") {
      console.warn("[Capture] Could not get ChatGPT tab.");
      return;
    }
    
    // Update slot with tab ID for future "continue" calls
    if (slot.id) {
      await updateSlotTabId(slot.id, chatGptTabId);
    }
    
    console.log(`[Capture] Sending ${action} to tab ${chatGptTabId}`);
    
    // Retry logic
    let attempts = 0;
    const maxAttempts = 3;
    
    while (attempts < maxAttempts) {
      try {
        const response = await chrome.tabs.sendMessage(chatGptTabId, {
          type: action === "screenshot" ? "UPLOAD_SCREENSHOT" : "SEND_TEXT",
          dataUrl: action === "screenshot" ? data : undefined,
          text: action === "text" ? data : undefined,
          settings
        });
        console.log(`[Capture] ${action} sent successfully:`, response);
        break;
      } catch (error) {
        attempts++;
        console.warn(`[Capture] Attempt ${attempts}/${maxAttempts} failed:`, error.message);
        
        if (attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          await ensureContentScriptInjected(chatGptTabId);
        } else {
          console.error(`[Capture] Failed to send ${action} after ${maxAttempts} attempts`);
        }
      }
    }
  } catch (error) {
    console.error(`[Capture] Failed:`, error);
  }
}

async function getChatGptTab(slot, settings) {
  const chatGptUrls = ["https://chatgpt.com/*", "https://chat.openai.com/*"];
  
  // If "continue" mode and we have a saved tab ID, try to use it
  if (slot.mode === "continue" && slot.tabId) {
    try {
      const tab = await chrome.tabs.get(slot.tabId);
      if (tab && (tab.url.includes("chatgpt.com") || tab.url.includes("chat.openai.com"))) {
        console.log(`[ChatGPT] Using existing tab for slot: ${slot.tabId}`);
        await ensureContentScriptInjected(slot.tabId);
        await chrome.tabs.update(slot.tabId, { active: true });
        return slot.tabId;
      }
    } catch (e) {
      console.log(`[ChatGPT] Saved tab ${slot.tabId} no longer exists`);
    }
  }
  
  // For "continue" mode without valid tab, find any existing ChatGPT tab
  if (slot.mode === "continue") {
    const existingTabs = await chrome.tabs.query({ url: chatGptUrls });
    if (existingTabs.length) {
      console.log(`[ChatGPT] Found existing tab for continue: ${existingTabs[0].id}`);
      await ensureContentScriptInjected(existingTabs[0].id);
      await chrome.tabs.update(existingTabs[0].id, { active: true });
      return existingTabs[0].id;
    }
  }
  
  // For "new" mode, always create a new chat
  if (slot.mode === "new") {
    console.log("[ChatGPT] Creating new chat...");
    const targetUrl = settings.targetUrl || "https://chatgpt.com/";
    const created = await chrome.tabs.create({ url: targetUrl, active: true });
    await waitForTabLoad(created.id);
    await ensureContentScriptInjected(created.id);
    return created.id;
  }
  
  // Fallback: create new tab
  console.log("[ChatGPT] Fallback: creating new tab...");
  const targetUrl = settings.targetUrl || "https://chatgpt.com/";
  const created = await chrome.tabs.create({ url: targetUrl, active: true });
  await waitForTabLoad(created.id);
  await ensureContentScriptInjected(created.id);
  return created.id;
}

async function updateSlotTabId(slotId, tabId) {
  const data = await chrome.storage.sync.get("keybindSlots");
  const slots = data.keybindSlots || defaultSlots;
  
  const updatedSlots = slots.map(s => {
    if (s.id === slotId) {
      return { ...s, tabId };
    }
    return s;
  });
  
  await chrome.storage.sync.set({ keybindSlots: updatedSlots });
  console.log(`[Slots] Updated slot ${slotId} with tabId ${tabId}`);
}

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("settings", (data) => {
      resolve(data.settings || defaultSettings);
    });
  });
}

async function ensureContentScriptInjected(tabId) {
  try {
    await chrome.tabs.sendMessage(tabId, { type: "PING" });
    console.log("[Script] Content script already loaded");
  } catch (error) {
    console.log("[Script] Injecting content script...");
    try {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ["contentScript.js"]
      });
      await new Promise(resolve => setTimeout(resolve, 1000));
      console.log("[Script] Content script injected");
    } catch (injectError) {
      console.error("[Script] Failed to inject:", injectError.message);
    }
  }
}

async function waitForTabLoad(tabId, timeout = 20000) {
  return new Promise((resolve) => {
    const listener = (updatedTabId, changeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === "complete") {
        chrome.tabs.onUpdated.removeListener(listener);
        console.log("[Tab] Finished loading");
        setTimeout(resolve, 2000);
      }
    };
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      console.log("[Tab] Load timeout, proceeding anyway");
      resolve();
    }, timeout);
  });
}
