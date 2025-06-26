// content.js - This script runs within the context of each web page.

console.log('Print script activated for:', window.location.href);

// Wait for the page to be fully loaded before printing
function triggerPrint() {
  try {
    console.log('Triggering print dialog...');
    window.print();
    console.log('Print dialog triggered successfully');
    
    // Send confirmation back to background script
    chrome.runtime.sendMessage({
      action: 'printTriggered',
      url: window.location.href,
      title: document.title
    });
  } catch (error) {
    console.error('Error triggering print dialog:', error);
    chrome.runtime.sendMessage({
      action: 'printError',
      error: error.message,
      url: window.location.href
    });
  }
}

// Check if document is already loaded
if (document.readyState === 'complete') {
  // Page is already loaded, print immediately
  setTimeout(triggerPrint, 100);
} else {
  // Wait for page to load
  window.addEventListener('load', () => {
    setTimeout(triggerPrint, 500);
  });
}
