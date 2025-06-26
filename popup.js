// popup.js
document.addEventListener("DOMContentLoaded", () => {
  const startButton = document.getElementById("startButton");
  const stopButton = document.getElementById("stopButton");
  const statusElement = document.getElementById("status");
  const totalTabCountElement = document.getElementById("totalTabCount");
  const tabListContainer = document.getElementById("tabList");
  const selectAllTabsCheckbox = document.getElementById("selectAllTabs");
  const printIntervalInput = document.getElementById("printInterval");
  const autoCloseTabCheckbox = document.getElementById("autoCloseTab");

  let availableTabs = []; // Store all valid tabs received from background
  let windowsData = [];
  let backgroundReady = false;

  // Function to send a message to the background script
  function sendMessageToBackground(action, data = {}) {
    if (!backgroundReady) {
      console.warn("Background script not ready, delaying message:", action);
      setTimeout(() => sendMessageToBackground(action, data), 200); // Try again after 200ms
      return;
    }

    chrome.runtime.sendMessage({ action: action, ...data }, (response) => {
      if (chrome.runtime.lastError) {
        console.error(
          "Error sending message:",
          chrome.runtime.lastError.message
        );
        statusElement.textContent =
          "Error: Could not communicate with background script.";
        return;
      }
      if (response && response.status) {
        // Update status from background script (e.g., "started", "stopped", "progress")
        statusElement.textContent = `Status: ${
          response.message ||
          response.status.charAt(0).toUpperCase() + response.status.slice(1)
        }.`;
      }
    });
  }

  // Function to set backgroundReady to true when background is ready
  function setBackgroundReady() {
    backgroundReady = true;
    console.log("Background script is ready.");
    // Now that background is ready, request tabs
    requestTabs();
  }

  // Listen for a "backgroundReady" message from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "backgroundReady") {
      setBackgroundReady();
    }
  });

  // Function to request tabs
  function requestTabs() {
    sendMessageToBackground("getTabs");
  }

  // Request tabs from the background script on popup load
  // Delay the initial getTabs request until the background script is ready
  setTimeout(() => {
    if (!backgroundReady) {
      console.log("Requesting background script to signal readiness.");
      chrome.runtime.sendMessage({ action: "popupOpened" });
    }
  }, 500); // Wait 500ms before prompting background

  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "tabData") {
      if (request.tabs) {
        availableTabs = request.tabs;
        windowsData = request.windows || [];
        totalTabCountElement.textContent = availableTabs.length;
        renderTabsByWindow(windowsData);
        statusElement.textContent = `Status: ${availableTabs.length} tabs across ${windowsData.length} windows.`;
      }
    }
  });

  // Function to render tabs organized by window
  function renderTabsByWindow(windows) {
    tabListContainer.innerHTML = "";
    if (windows.length === 0) {
      tabListContainer.innerHTML =
        '<p class="text-center text-gray-500">No scriptable tabs found.</p>';
      return;
    }

    windows.forEach((window, windowIndex) => {
      // Window header
      const windowHeader = document.createElement("div");
      windowHeader.className = "window-header";

      const windowTitle = document.createElement("h3");
      windowTitle.className = "window-title";
      windowTitle.innerHTML = `
        Window ${windowIndex + 1} 
        <span class="tab-count">(${window.tabs.length} tabs)</span>
      `;

      const selectWindowCheckbox = document.createElement("input");
      selectWindowCheckbox.type = "checkbox";
      selectWindowCheckbox.className = "window-checkbox";
      selectWindowCheckbox.dataset.windowId = window.id;

      const selectWindowLabel = document.createElement("label");
      selectWindowLabel.textContent = "Select All";
      selectWindowLabel.className = "select-window-label";

      windowHeader.appendChild(windowTitle);
      windowHeader.appendChild(selectWindowCheckbox);
      windowHeader.appendChild(selectWindowLabel);
      tabListContainer.appendChild(windowHeader);

      // Window tabs container
      const windowTabsContainer = document.createElement("div");
      windowTabsContainer.className = "window-tabs-container";

      window.tabs.forEach((tab) => {
        const tabItemDiv = document.createElement("div");
        tabItemDiv.className = "tab-item";

        const checkbox = document.createElement("input");
        checkbox.type = "checkbox";
        checkbox.id = `tab-${tab.id}`;
        checkbox.value = tab.id;
        checkbox.className = "tab-checkbox";
        checkbox.dataset.windowId = window.id;

        const label = document.createElement("label");
        label.htmlFor = `tab-${tab.id}`;
        label.textContent = tab.title
          ? tab.title.substring(0, 60) + (tab.title.length > 60 ? "..." : "")
          : tab.url;
        label.title = tab.title || tab.url;

        tabItemDiv.appendChild(checkbox);
        tabItemDiv.appendChild(label);
        windowTabsContainer.appendChild(tabItemDiv);
      });

      tabListContainer.appendChild(windowTabsContainer);

      // Window checkbox functionality
      selectWindowCheckbox.addEventListener("change", (event) => {
        const windowCheckboxes =
          windowTabsContainer.querySelectorAll(".tab-checkbox");
        windowCheckboxes.forEach((checkbox) => {
          checkbox.checked = event.target.checked;
        });
        updateSelectAllState();
      });
    });

    // Add event listeners to individual tab checkboxes
    document.querySelectorAll(".tab-checkbox").forEach((checkbox) => {
      checkbox.addEventListener("change", updateSelectAllState);
    });
  }

  // Update select all checkbox state based on individual selections
  function updateSelectAllState() {
    const allCheckboxes = document.querySelectorAll(".tab-checkbox");
    const checkedCheckboxes = document.querySelectorAll(
      ".tab-checkbox:checked"
    );

    if (checkedCheckboxes.length === 0) {
      selectAllTabsCheckbox.indeterminate = false;
      selectAllTabsCheckbox.checked = false;
    } else if (checkedCheckboxes.length === allCheckboxes.length) {
      selectAllTabsCheckbox.indeterminate = false;
      selectAllTabsCheckbox.checked = true;
    } else {
      selectAllTabsCheckbox.indeterminate = true;
    }

    // Update window checkboxes
    document.querySelectorAll(".window-checkbox").forEach((windowCheckbox) => {
      const windowId = windowCheckbox.dataset.windowId;
      const windowTabs = document.querySelectorAll(
        `[data-window-id="${windowId}"].tab-checkbox`
      );
      const checkedWindowTabs = document.querySelectorAll(
        `[data-window-id="${windowId}"].tab-checkbox:checked`
      );

      if (checkedWindowTabs.length === 0) {
        windowCheckbox.indeterminate = false;
        windowCheckbox.checked = false;
      } else if (checkedWindowTabs.length === windowTabs.length) {
        windowCheckbox.indeterminate = false;
        windowCheckbox.checked = true;
      } else {
        windowCheckbox.indeterminate = true;
      }
    });
  }

  // Handle "Select All" checkbox
  selectAllTabsCheckbox.addEventListener("change", (event) => {
    const isChecked = event.target.checked;
    document.querySelectorAll(".tab-checkbox").forEach((checkbox) => {
      checkbox.checked = isChecked;
    });
    document.querySelectorAll(".window-checkbox").forEach((checkbox) => {
      checkbox.checked = isChecked;
    });
  });

  // Event listener for the Start button
  startButton.addEventListener("click", () => {
    const selectedTabIds = Array.from(
      document.querySelectorAll(".tab-checkbox:checked")
    ).map((checkbox) => parseInt(checkbox.value)); // Ensure IDs are numbers

    if (selectedTabIds.length === 0) {
      statusElement.textContent = "Status: Please select at least one tab.";
      return;
    }

    // Get print settings
    const printInterval = Math.max(
      2,
      Math.min(60, parseInt(printIntervalInput.value) || 3)
    );
    const autoCloseTab = autoCloseTabCheckbox.checked;

    // Update the input value to reflect any corrections
    printIntervalInput.value = printInterval;

    console.log(`Starting print job with ${selectedTabIds.length} tabs`);
    console.log("Selected tab IDs:", selectedTabIds);
    console.log("Print interval:", printInterval);
    console.log("Auto close tabs:", autoCloseTab);

    sendMessageToBackground("start", {
      selectedTabIds: selectedTabIds,
      printInterval: printInterval * 1000, // Convert to milliseconds
      autoCloseTab: autoCloseTab,
    });
    statusElement.textContent = "Status: Initiating auto print...";
  });

  // Event listener for the Stop button
  stopButton.addEventListener("click", () => {
    sendMessageToBackground("stop");
    statusElement.textContent = "Status: Stopping auto print...";
  });

  // Listen for status updates from the background script
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.status) {
      statusElement.textContent = `Status: ${
        request.message ||
        request.status.charAt(0).toUpperCase() + request.status.slice(1)
      }.`;
    }
  });

  // Initial status message
  statusElement.textContent = "Status: Loading tabs...";
});

// document.addEventListener('DOMContentLoaded', async () => {
//   const tabList = document.getElementById('tabList');
//   const selectAll = document.getElementById('selectAll');
//   const printBtn = document.getElementById('printBtn');

//   let tabs = await chrome.tabs.query({});
//   tabs.forEach((tab, index) => {
//     const li = document.createElement('label');
//     li.innerHTML = `<input type="checkbox" data-id="${tab.id}"> ${tab.title}`;
//     tabList.appendChild(li);
//   });

//   selectAll.addEventListener('change', () => {
//     const checkboxes = tabList.querySelectorAll('input[type="checkbox"]');
//     checkboxes.forEach(cb => cb.checked = selectAll.checked);
//   });

//   printBtn.addEventListener('click', () => {
//     const selectedIds = Array.from(
//       tabList.querySelectorAll('input[type="checkbox"]:checked')
//     ).map(cb => parseInt(cb.dataset.id));

//     chrome.runtime.sendMessage({ action: "printTabs", tabIds: selectedIds });
//   });
// });
