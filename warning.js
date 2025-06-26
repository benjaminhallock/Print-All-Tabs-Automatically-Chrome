// Kiosk warning functionality
document.addEventListener('DOMContentLoaded', function() {
  const kioskWarning = document.getElementById('kioskWarning');
  const dismissBtn = document.getElementById('dismissBtn');
  const expandIcon = kioskWarning.querySelector('.expand-icon');
  
  // Check if user has previously dismissed
  const hasDismissed = localStorage.getItem('kioskWarningDismissed');
  if (hasDismissed === 'true') {
    kioskWarning.classList.add('collapsed');
    if (dismissBtn) dismissBtn.style.display = 'none';
    if (expandIcon) expandIcon.style.display = 'inline';
  }
  
  // Handle dismiss button
  if (dismissBtn) {
    dismissBtn.addEventListener('click', function(e) {
      e.stopPropagation();
      kioskWarning.classList.add('collapsed');
      dismissBtn.style.display = 'none';
      if (expandIcon) expandIcon.style.display = 'inline';
      localStorage.setItem('kioskWarningDismissed', 'true');
    });
  }
  
  // Handle click to expand when collapsed
  kioskWarning.addEventListener('click', function() {
    if (kioskWarning.classList.contains('collapsed')) {
      kioskWarning.classList.remove('collapsed');
      if (dismissBtn) dismissBtn.style.display = 'inline-block';
      if (expandIcon) expandIcon.style.display = 'none';
    }
  });

  // Copy to clipboard function
  function copyToClipboard(text, button) {
    navigator.clipboard.writeText(text).then(function() {
      const feedback = button.nextElementSibling;
      feedback.classList.add('show');
      setTimeout(() => {
        feedback.classList.remove('show');
      }, 1500);
    }).catch(function(err) {
      console.error('Could not copy text: ', err);
      // Fallback for older browsers
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      const feedback = button.nextElementSibling;
      feedback.classList.add('show');
      setTimeout(() => {
        feedback.classList.remove('show');
      }, 1500);
    });
  }

  // Add event listeners for copy buttons
  const copyKioskPrintingButton = document.getElementById('copyKioskPrinting');
  const copyFullExampleButton = document.getElementById('copyFullExample');

  if (copyKioskPrintingButton) {
    copyKioskPrintingButton.addEventListener('click', function() {
      copyToClipboard('--kiosk-printing', this);
    });
  }

  if (copyFullExampleButton) {
    copyFullExampleButton.addEventListener('click', function() {
      copyToClipboard('"C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --kiosk-printing', this);
    });
  }
});
