import { MESSAGE_SOURCE, CONTENT_SCRIPT_PORT } from "../constants";

let backgroundPort: chrome.runtime.Port;

function connect() {
  backgroundPort = chrome.runtime.connect({ name: CONTENT_SCRIPT_PORT });
  backgroundPort.onDisconnect.addListener(connect);
}

connect();

// Receives message from background script to execute in browser
chrome.runtime.onMessage.addListener((message) => {
  if (message.source === MESSAGE_SOURCE) {
    // Forward to web app (browser)
    window.postMessage(message, window.location.origin);
  }
});

// Listen for a CustomEvent (Add Locked Bitcoin Request) coming from the web app
document.addEventListener("add_locked_bitcoin_request", ((
  event: CustomEvent<{
    addLockedBitcoinRequest: string;
  }>
) => {
  backgroundPort.postMessage({
    payload: event.detail.addLockedBitcoinRequest,
    method: "addLockedBitcoinRequest",
  });
}) as EventListener);

document.addEventListener("get_locked_bitcoin_request", ((
  event: CustomEvent<{
    getLockedBitcoinRequest: string;
  }>
) => {
  backgroundPort.postMessage({
    payload: event.detail.getLockedBitcoinRequest,
    method: "getLockedBitcoinRequest",
  });
}) as EventListener);

document.addEventListener("send_locked_bitcoin_request", ((
  event: CustomEvent<{
    sendLockedBitcoinRequest: string;
  }>
) => {
  backgroundPort.postMessage({
    payload: event.detail.sendLockedBitcoinRequest,
    method: "sendLockedBitcoinRequest",
  });
}) as EventListener);

// Inject in-page script
const injectInPageScript = (isPriority) => {
  const inpage = document.createElement("script");
  inpage.src = chrome.runtime.getURL("inpage.js");
  inpage.id = "core-test-wallet-provider";
  inpage.setAttribute("data-is-priority", isPriority ? "true" : "");
  document.head.appendChild(inpage);
};
injectInPageScript(false);
