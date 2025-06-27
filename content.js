// content.js - This script runs within the context of each web page.

console.log('Print script activated for:', window.location.href);

// Track if print dialog actually appears
let printDialogShown = false;
let printStartTime = Date.now();

// Override window.print to detect kiosk mode
const originalPrint = window.print;
window.print = function() {
  console.log('Print function called');
  
  // Record that print was attempted
  const beforePrint = Date.now();
  
  // Call original print function
  const result = originalPrint.call(this);
  
  const afterPrint = Date.now();
  const printDuration = afterPrint - beforePrint;
  
  // If print returned very quickly (< 100ms), likely kiosk mode
  if (printDuration < 100) {
    console.log('Kiosk printing detected (fast return)');
    chrome.runtime.sendMessage({
      action: 'printCompleted',
      mode: 'kiosk',
      url: window.location.href,
      title: document.title,
      duration: printDuration
    }).catch(error => console.log('Message send error:', error));
  } else {
    console.log('Manual print dialog likely shown');
    chrome.runtime.sendMessage({
      action: 'printDialogShown',
      mode: 'manual',
      url: window.location.href,
      title: document.title,
      duration: printDuration
    }).catch(error => console.log('Message send error:', error));
  }
  
  return result;
};

// Listen for beforeprint and afterprint events
window.addEventListener('beforeprint', () => {
  console.log('Before print event fired');
  printDialogShown = true;
});

window.addEventListener('afterprint', () => {
  console.log('After print event fired');
  chrome.runtime.sendMessage({
    action: 'printCompleted',
    mode: 'manual',
    url: window.location.href,
    title: document.title,
    userAction: true
  }).catch(error => console.log('Message send error:', error));
});

// Wait for the page to be fully loaded before printing
function triggerPrint() {
  try {
    console.log('Triggering print dialog...');
    window.print();
    console.log('Print function called successfully');
    
    // Send initial confirmation back to background script
    chrome.runtime.sendMessage({
      action: 'printTriggered',
      url: window.location.href,
      title: document.title,
      timestamp: Date.now()
    }).catch(error => {
      console.log('Error sending message:', error);
    });
  } catch (error) {
    console.error('Error triggering print dialog:', error);
    chrome.runtime.sendMessage({
      action: 'printError',
      error: error.message,
      url: window.location.href
    }).catch(err => {
      console.log('Error sending error message:', err);
    });
  }
}

// Check if document is already loaded
if (document.readyState === 'complete') {
  setTimeout(triggerPrint, 100);
} else {
  window.addEventListener('load', () => {
    setTimeout(triggerPrint, 500);
  });
}
