// content.js
// This script runs within the context of each web page.

console.log('Print script activated');

// Use a timeout to ensure the page is fully loaded before printing
setTimeout(() => {
  try {
    console.log('Triggering print...');
    window.print();
    console.log('Print dialog triggered');
  } catch (error) {
    console.error('Error triggering print dialog:', error);
  }
}, 500);
