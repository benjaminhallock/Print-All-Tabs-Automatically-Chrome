// background.js
let intervalId;
let tabIndex = 0;
let tabsToPrint = [];
let allAvailableTabs = [];
let printSettings = {
  interval: 3000, // Default 3 seconds
  autoCloseTab: false
};

// Update badge with total tab count
function updateBadge() {
  chrome.tabs.query({}, (tabs) => {
    const validTabs = tabs.filter(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));
    chrome.action.setBadgeText({ text: validTabs.length.toString() });
    chrome.action.setBadgeBackgroundColor({ color: '#4CAF50' });
  });
}

// Initialize badge on startup
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);

// Update badge when tabs change
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener(updateBadge);

// Function to start the printing process with selected tabs
function startPrinting(selectedTabIds, settings = {}) {
  if (intervalId) {
    clearInterval(intervalId); // Clear any existing interval
  }

  // Update print settings with user preferences
  printSettings.interval = settings.printInterval || 3000;
  printSettings.autoCloseTab = settings.autoCloseTab || false;
  
  console.log("Print settings:", printSettings);
  console.log("Selected tab IDs:", selectedTabIds);

  // Store only the selected tabs based on their IDs
  tabsToPrint = [];
  for (let i = 0; i < selectedTabIds.length; i++) {
    const tabId = selectedTabIds[i];
    const tab = allAvailableTabs.find(t => t.id === tabId);
    if (tab) {
      tabsToPrint.push(tab);
    }
  }

  if (tabsToPrint.length === 0) {
    console.log("No valid tabs selected for printing.");
    chrome.runtime.sendMessage({ status: "error", message: "No tabs selected for printing." });
    return;
  }

  tabIndex = 0;
  console.log(`Starting print for ${tabsToPrint.length} selected tabs with ${printSettings.interval}ms interval.`);
  console.log("Tabs to print:", tabsToPrint);
  chrome.runtime.sendMessage({ status: "started", message: `Printing ${tabsToPrint.length} tabs...` });

  // Print first tab immediately
  printNextTab();
}

// Function to print the next tab in sequence
function printNextTab() {
  if (tabIndex >= tabsToPrint.length) {
    console.log("Finished printing all selected tabs.");
    chrome.runtime.sendMessage({ status: "completed", message: "All selected tabs printed." });
    return;
  }

  const tab = tabsToPrint[tabIndex];
  console.log(`Printing tab ${tabIndex + 1}/${tabsToPrint.length}: ${tab.title || tab.url}`);

  // Check if tab still exists before trying to print
  chrome.tabs.get(tab.id, (tabInfo) => {
    if (chrome.runtime.lastError) {
      console.log(`Tab ${tab.id} no longer exists, skipping...`);
      tabIndex++;
      // Schedule next tab print
      intervalId = setTimeout(printNextTab, printSettings.interval);
      return;
    }

    // Activate the tab
    chrome.tabs.update(tab.id, { active: true }, () => {
      if (chrome.runtime.lastError) {
        console.error(`Error activating tab ${tab.id}:`, chrome.runtime.lastError);
        tabIndex++;
        // Schedule next tab print
        intervalId = setTimeout(printNextTab, printSettings.interval);
        return;
      }

      // Once the tab is active, execute the content script to print
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        files: ['content.js']
      }).then(() => {
        console.log(`Print script injected into tab: ${tab.id} - ${tab.title}`);
        chrome.runtime.sendMessage({ status: "progress", message: `Printing: ${tab.title || tab.url}` });
        
        // Auto-close tab if setting is enabled
        if (printSettings.autoCloseTab) {
          setTimeout(() => {
            chrome.tabs.remove(tab.id, () => {
              if (chrome.runtime.lastError) {
                console.log(`Could not close tab ${tab.id}:`, chrome.runtime.lastError.message);
              } else {
                console.log(`Auto-closed tab: ${tab.title || tab.url}`);
              }
              
              // Move to next tab after closing
              tabIndex++;
              // Schedule next tab print
              intervalId = setTimeout(printNextTab, printSettings.interval);
            });
          }, 1500); // Wait 1.5 seconds after printing before closing
        } else {
          // If not closing tab, move to next tab after a delay
          tabIndex++;
          // Schedule next tab print
          intervalId = setTimeout(printNextTab, printSettings.interval);
        }
      }).catch(error => {
        console.error(`Error injecting script into tab ${tab.id}:`, error);
        chrome.runtime.sendMessage({ status: "error", message: `Error printing: ${tab.title || tab.url}` });
        
        // Move to next tab despite error
        tabIndex++;
        // Schedule next tab print
        intervalId = setTimeout(printNextTab, printSettings.interval);
      });
    });
  });
}

// Function to stop the printing process
function stopPrinting() {
  if (intervalId) {
    clearTimeout(intervalId);
    intervalId = null;
    console.log("Auto printing stopped.");
    chrome.runtime.sendMessage({ status: "stopped", message: "Auto printing stopped." });
  }
}

// Listener for messages from the popup or other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start") {
    console.log("Received start request with:", request);
    startPrinting(request.selectedTabIds, {
      printInterval: request.printInterval,
      autoCloseTab: request.autoCloseTab
    });
    sendResponse({ status: "started", message: "Print job started" });
  } else if (request.action === "stop") {
    stopPrinting();
    sendResponse({ status: "stopped", message: "Print job stopped" });
  } else if (request.action === "getTabs") {
    // Query all tabs and organize by window
    chrome.tabs.query({}, function(tabs) {
      const validTabs = tabs.filter(tab => !tab.url.startsWith('chrome://') && !tab.url.startsWith('chrome-extension://'));
      
      // Group tabs by window
      const tabsByWindow = {};
      validTabs.forEach(tab => {
        if (!tabsByWindow[tab.windowId]) {
          tabsByWindow[tab.windowId] = [];
        }
        tabsByWindow[tab.windowId].push(tab);
      });

      // Get window information
      chrome.windows.getAll({}, (windows) => {
        const windowsWithTabs = windows.map(window => ({
          id: window.id,
          focused: window.focused,
          type: window.type,
          tabs: tabsByWindow[window.id] || []
        })).filter(window => window.tabs.length > 0);

        allAvailableTabs = validTabs;
        sendResponse({ 
          windows: windowsWithTabs,
          tabs: validTabs,
          totalCount: validTabs.length 
        });
      });
    });
    return true;
  }
});
