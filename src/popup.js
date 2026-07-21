function setStatus(message, isError = false) {
  const element = document.getElementById("status");
  element.textContent = message;
  element.className = isError ? "status error" : "status";
}

function isYouTubeTab(tab) {
  try {
    const hostname = new URL(tab?.url || "").hostname.toLowerCase();
    return hostname === "youtube.com" || hostname.endsWith(".youtube.com");
  } catch {
    return false;
  }
}

function activeTab(callback) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => callback(tabs[0]));
}

activeTab((tab) => {
  document.getElementById("setCurrentSpeed").hidden = !isYouTubeTab(tab);
});

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

document.getElementById("setCurrentSpeed").addEventListener("click", () => {
  activeTab((tab) => {
    if (!tab?.id) {
      setStatus("No active tab.", true);
      return;
    }
    chrome.tabs.sendMessage(tab.id, { type: "content.setCurrentSpeed" }, (response) => {
      const error = chrome.runtime.lastError;
      if (error || !response?.ok) {
        setStatus(response?.error || "Open a regular YouTube video from one channel.", true);
        return;
      }
      setStatus(`Saved ${Number(response.speed).toFixed(2)}× for this channel.`);
    });
  });
});
