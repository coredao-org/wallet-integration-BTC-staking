import { CONTENT_SCRIPT_PORT } from "../constants";
import {
  handleAddLockedBitcoinRequest,
  handleSendLockedBitcoinRequest,
  handleGetLockedBitcoinRequest,
} from "../handler";

// Listen for connection to the content-script - port for two-way communication
chrome.runtime.onConnect.addListener((port: chrome.runtime.Port) => {
  if (port.name !== CONTENT_SCRIPT_PORT) return;
  port.onMessage.addListener((message, messagingPort) => {
    switch (message.method) {
      case "addLockedBitcoinRequest":
        handleAddLockedBitcoinRequest(message, port);
        break;
      case "getLockedBitcoinRequest":
        handleGetLockedBitcoinRequest(message, port);
        break;
      case "sendLockedBitcoinRequest":
        handleSendLockedBitcoinRequest(message, port);
        break;
    }
  });
});
