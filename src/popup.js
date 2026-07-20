function setStatus(message, isError = false) {
  const element = document.getElementById("status");
  element.textContent = message;
  element.className = isError ? "status error" : "status";
}

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("learnCurrentSpeed").addEventListener("click", () => {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) {
      setStatus("No active tab.", true);
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "content.learnCurrentSpeed" }, (response) => {
      const error = chrome.runtime.lastError;
      if (error || !response?.ok) {
        setStatus(response?.error || "Open a regular YouTube video from one channel.", true);
        return;
      }
      setStatus(`Saved ${Number(response.speed).toFixed(2)}× for this channel.`);
    });
  });
});
