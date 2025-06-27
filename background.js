// background.js
let timeoutId;
let tabIndex = 0;
let tabsToPrint = [];
let allAvailableTabs = [];
let printSettings = {
  interval: 3000, // Default 3 seconds
  autoCloseTab: false,
};
let isPrinting = false;
let flashInterval = null;
let isPopupOpen = false;
let isKioskPrintingEnabled = false;
let printDialogTimeout = null;

// Update badge with total tab count and status color
function updateBadge(status = "normal") {
  chrome.tabs.query({}, (tabs) => {
    const validTabs = tabs.filter(
      (tab) =>
        !tab.url.startsWith("chrome://") &&
        !tab.url.startsWith("chrome-extension://")
    );

    chrome.action.setBadgeText({ text: validTabs.length.toString() });

    // Set badge color based on status
    switch (status) {
      case "printing":
        chrome.action.setBadgeBackgroundColor({ color: "#DC143C" }); // Red
        break;
      case "error":
        chrome.action.setBadgeBackgroundColor({ color: "#FF8C00" }); // Orange
        break;
      case "normal":
      default:
        chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" }); // Green
        break;
    }
  });
}

// Start flashing badge during printing
function startBadgeFlashing() {
  if (flashInterval) {
    clearInterval(flashInterval);
  }

  let isRed = true;
  flashInterval = setInterval(() => {
    chrome.action.setBadgeBackgroundColor({
      color: isRed ? "#DC143C" : "#8B0000", // Alternate between red and dark red
    });
    isRed = !isRed;
  }, 500); // Flash every 500ms
}

// Stop flashing badge
function stopBadgeFlashing() {
  if (flashInterval) {
    clearInterval(flashInterval);
    flashInterval = null;
  }
}

// Initialize badge on startup
chrome.runtime.onStartup.addListener(updateBadge);
chrome.runtime.onInstalled.addListener(updateBadge);

// Update badge when tabs change
chrome.tabs.onCreated.addListener(updateBadge);
chrome.tabs.onRemoved.addListener(updateBadge);
chrome.tabs.onUpdated.addListener(updateBadge);

// Function to safely send messages to popup
function sendToPopup(message) {
  if (isPopupOpen) {
    chrome.runtime.sendMessage(message).catch((error) => {
      // Popup was closed, update flag
      if (error.message.includes("Receiving end does not exist")) {
        isPopupOpen = false;
      }
      console.log("Message not sent, popup likely closed:", error.message);
    });
  }
}

// Detect if kiosk printing is enabled by checking if print dialog appears
function checkKioskPrintingMode(tabId) {
  return new Promise((resolve) => {
    // Inject a script to detect if print dialog appears
    chrome.scripting
      .executeScript({
        target: { tabId: tabId },
        func: () => {
          // Override window.print to detect if it's called
          let printCalled = false;
          const originalPrint = window.print;

          window.print = function () {
            printCalled = true;
            originalPrint.call(this);
            return true;
          };

          // Try to trigger print
          setTimeout(() => {
            window.print();
          }, 100);

          // Check if print was intercepted (kiosk mode) or showed dialog (normal mode)
          setTimeout(() => {
            // In kiosk mode, print happens immediately without user interaction
            // In normal mode, print dialog appears and waits for user
            window.print = originalPrint; // Restore original
            return printCalled;
          }, 500);
        },
      })
      .then(() => {
        // If we get here quickly, kiosk mode is likely enabled
        resolve(true);
      })
      .catch(() => {
        resolve(false);
      });
  });
}

// Function to start the printing process with selected tabs
function startPrinting(selectedTabIds, settings = {}) {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  // Update print settings
  printSettings.interval = settings.printInterval || 3000;
  printSettings.autoCloseTab = settings.autoCloseTab || false;

  console.log("Print settings:", printSettings);
  console.log("Selected tab IDs:", selectedTabIds);

  // Filter and store only the selected tabs based on their IDs
  tabsToPrint = allAvailableTabs.filter((tab) => selectedTabIds.includes(tab.id));

  if (tabsToPrint.length === 0) {
    console.log("No valid tabs selected for printing.");
    updateBadge("error");
    sendToPopup({
      status: "error",
      message: "No tabs selected for printing.",
    });
    return;
  }

  isPrinting = true;
  tabIndex = 0;
  console.log(
    `Starting print for ${tabsToPrint.length} selected tabs with ${printSettings.interval}ms interval.`
  );
  console.log("Tabs to print:", tabsToPrint);

  // Start flashing badge to indicate printing
  startBadgeFlashing();

  chrome.runtime.sendMessage({
    status: "started",
    message: `Printing ${tabsToPrint.length} tabs...`,
  });

  // Start printing immediately
  printCurrentTab();
}

// Function to print the current tab and schedule the next one
function printCurrentTab() {
  if (tabIndex >= tabsToPrint.length) {
    console.log("Finished printing all selected tabs.");
    isPrinting = false;
    stopBadgeFlashing();
    updateBadge("normal"); // Return to normal green
    sendToPopup({
      status: "completed",
      message: "All selected tabs printed.",
    });
    timeoutId = null;
    return;
  }

  const tab = tabsToPrint[tabIndex];
  console.log(
    `Printing tab ${tabIndex + 1}/${tabsToPrint.length}: ${
      tab.title || tab.url
    }`
  );

  // Check if tab still exists before trying to print
  chrome.tabs.get(tab.id, (tabInfo) => {
    if (chrome.runtime.lastError) {
      console.log(`Tab ${tab.id} no longer exists, skipping...`);
      moveToNextTab();
      return;
    }

    // Activate the tab
    chrome.tabs.update(tab.id, { active: true }, () => {
      if (chrome.runtime.lastError) {
        console.error(
          `Error activating tab ${tab.id}:`,
          chrome.runtime.lastError
        );
        updateBadge("error");
        setTimeout(() => updateBadge("printing"), 2000); // Show error for 2 seconds then back to printing
        moveToNextTab();
        return;
      }

      // Once the tab is active, execute the content script to print
      chrome.scripting
        .executeScript({
          target: { tabId: tab.id },
          files: ["content.js"],
        })
        .then(() => {
          console.log(
            `Print script injected into tab: ${tab.id} - ${tab.title}`
          );

          // Set up a timeout to detect if print dialog doesn't appear (kiosk mode)
          let printCompleted = false;

          printDialogTimeout = setTimeout(() => {
            if (!printCompleted) {
              // If we're here, either kiosk printing worked or nothing happened
              sendToPopup({
                status: "progress",
                message: `Printed ${tabIndex + 1}/${tabsToPrint.length}: ${
                  tab.title || tab.url
                }`,
              });
              printCompleted = true;

              // Auto-close tab if setting is enabled and we think print worked
              if (printSettings.autoCloseTab) {
                setTimeout(() => {
                  chrome.tabs.remove(tab.id, () => {
                    if (chrome.runtime.lastError) {
                      console.log(
                        `Could not close tab ${tab.id}:`,
                        chrome.runtime.lastError.message
                      );
                    } else {
                      console.log(`Auto-closed tab: ${tab.title || tab.url}`);
                    }
                    moveToNextTab();
                  });
                }, 1500); // Wait 1.5s after print before closing
              } else {
                moveToNextTab();
              }
            }
          }, 2000); // Wait 2 seconds for kiosk printing to complete

          // Listen for manual print completion (non-kiosk mode)
          chrome.tabs.onUpdated.addListener(function printListener(tabId, changeInfo) {
            if (tabId === tab.id && !printCompleted) {
              printCompleted = true;
              clearTimeout(printDialogTimeout);
              chrome.tabs.onUpdated.removeListener(printListener);

              // Check if user actually printed or cancelled
              setTimeout(() => {
                sendToPopup({
                  status: "warning",
                  message: `Manual print required for: ${tab.title || tab.url}. Enable --kiosk-printing for automation.`,
                });

                // Don't auto-close if kiosk printing isn't enabled
                if (!printSettings.autoCloseTab) {
                  moveToNextTab();
                } else {
                  // Give user time to print manually before moving on
                  setTimeout(moveToNextTab, 5000);
                }
              }, 1000);
            }
          });
        })
        .catch((error) => {
          console.error(`Error injecting script into tab ${tab.id}:`, error);
          updateBadge("error");
          setTimeout(() => { if (isPrinting) startBadgeFlashing(); }, 2000); // Show error for 2 seconds
          sendToPopup({
            status: "error",
            message: `Error printing: ${tab.title || tab.url}`,
          });
          moveToNextTab();
        });
    });
  });
}

// Function to move to the next tab with proper timing
function moveToNextTab() {
  tabIndex++;
  if (tabIndex < tabsToPrint.length) {
    // Schedule next print with the specified interval
    timeoutId = setTimeout(printCurrentTab, printSettings.interval);
  } else {
    // All tabs processed
    printCurrentTab(); // This will trigger the completion message
  }
}

// Function to stop the printing process
function stopPrinting() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  isPrinting = false;
  stopBadgeFlashing();
  updateBadge("normal"); // Return to normal green

  console.log("Auto printing stopped.");
  sendToPopup({
    status: "stopped",
    message: "Auto printing stopped.",
  });
}

// Send a message to the popup when the background script is ready
function signalBackgroundReady() {
  sendToPopup({ action: "backgroundReady" });
  console.log("Background script signaled readiness.");
}

// Call signalBackgroundReady after a short delay
setTimeout(signalBackgroundReady, 300);

// Listener for messages from the popup or other parts of the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  // Track when popup is open
  if (request.action === "popupOpened") {
    isPopupOpen = true;
    sendResponse({ status: "backgroundAck" });
    signalBackgroundReady();
    return true;
  }

  if (request.action === "start") {
    isPopupOpen = true; // Popup is definitely open if sending start request
    console.log("Start request received:", request);
    startPrinting(request.selectedTabIds, {
      printInterval: request.printInterval,
      autoCloseTab: request.autoCloseTab,
    });
    sendResponse({ status: "started", message: "Print job initiated" });
  } else if (request.action === "stop") {
    isPopupOpen = true;
    stopPrinting();
    sendResponse({ status: "stopped", message: "Print job stopped" });
  } else if (request.action === "getTabs") {
    isPopupOpen = true;
    // Query all tabs and organize by window
    chrome.tabs.query({}, function (tabs) {
      const validTabs = tabs.filter(
        (tab) =>
          !tab.url.startsWith("chrome://") &&
          !tab.url.startsWith("chrome-extension://")
      );

      // Group tabs by window
      const tabsByWindow = {};
      validTabs.forEach((tab) => {
        if (!tabsByWindow[tab.windowId]) {
          tabsByWindow[tab.windowId] = [];
        }
        tabsByWindow[tab.windowId].push(tab);
      });

      // Get window information
      chrome.windows.getAll({}, (windows) => {
        const windowsWithTabs = windows
          .map((window) => ({
            id: window.id,
            focused: window.focused,
            type: window.type,
            tabs: tabsByWindow[window.id] || [],
          }))
          .filter((window) => window.tabs.length > 0);

        allAvailableTabs = validTabs;
        sendResponse({ status: "tabData" });
        sendToPopup({
          action: "tabData",
          windows: windowsWithTabs,
          tabs: validTabs,
          totalCount: validTabs.length,
        });
      });
    });
    return true;
  }
  return true;
});

// Track when popup closes by detecting port disconnection
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === "popup") {
    port.onDisconnect.addListener(() => {
      isPopupOpen = false;
      console.log("Popup disconnected");
    });
  }
});
