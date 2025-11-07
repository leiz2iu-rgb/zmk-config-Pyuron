const form = document.getElementById("options-form");
const status = document.getElementById("status");

const DEFAULTS = {
  apiBaseUrl: "https://api.openai.com",
  model: "gpt-4o-mini",
  incomingLanguage: "ja",
  outgoingLanguage: "en",
  speechRecognitionLocale: "ja-JP",
  incomingPrompt: "You are a translation assistant. Translate the following text into natural Japanese. Respond with the translation only.",
  outgoingPrompt: "You are a translation assistant. Translate the following Japanese text into {{targetLanguage}} for a Shopee chat reply. Respond with the translation only.",
  selectors: {
    messageList: '[data-testid="chat-content"], .chatroom-conversation, .chatroom__conversation',
    incomingMessage: '[data-testid="message-item-other"], .message-item--partner, .bubble--other',
    outgoingMessage: '[data-testid="message-item-self"], .message-item--self, .bubble--self',
    messageText: '.message-text, [data-testid="chat-message-text"], .bubble__message',
    inputContainer: '[data-testid="chat-input"], .chatroom-input',
    textarea: 'textarea, [contenteditable="true"]'
  }
};

function restoreOptions() {
  chrome.storage.sync.get(DEFAULTS, (items) => {
    const data = { ...DEFAULTS, ...items, selectors: { ...DEFAULTS.selectors, ...(items.selectors || {}) } };
    form.apiBaseUrl.value = data.apiBaseUrl;
    form.model.value = data.model;
    form.apiKey.value = data.apiKey || "";
    form.incomingLanguage.value = data.incomingLanguage;
    form.outgoingLanguage.value = data.outgoingLanguage;
    form.speechRecognitionLocale.value = data.speechRecognitionLocale || "";
    form.incomingPrompt.value = data.incomingPrompt;
    form.outgoingPrompt.value = data.outgoingPrompt;
    form['selectors.messageList'].value = data.selectors.messageList;
    form['selectors.incomingMessage'].value = data.selectors.incomingMessage;
    form['selectors.outgoingMessage'].value = data.selectors.outgoingMessage;
    form['selectors.messageText'].value = data.selectors.messageText;
    form['selectors.inputContainer'].value = data.selectors.inputContainer;
    form['selectors.textarea'].value = data.selectors.textarea;
  });
}

function saveOptions(event) {
  event.preventDefault();
  const formData = new FormData(form);
  const selectors = {
    messageList: formData.get('selectors.messageList') || DEFAULTS.selectors.messageList,
    incomingMessage: formData.get('selectors.incomingMessage') || DEFAULTS.selectors.incomingMessage,
    outgoingMessage: formData.get('selectors.outgoingMessage') || DEFAULTS.selectors.outgoingMessage,
    messageText: formData.get('selectors.messageText') || DEFAULTS.selectors.messageText,
    inputContainer: formData.get('selectors.inputContainer') || DEFAULTS.selectors.inputContainer,
    textarea: formData.get('selectors.textarea') || DEFAULTS.selectors.textarea
  };
  const payload = {
    apiBaseUrl: formData.get('apiBaseUrl') || DEFAULTS.apiBaseUrl,
    model: formData.get('model') || DEFAULTS.model,
    apiKey: formData.get('apiKey') || "",
    incomingLanguage: formData.get('incomingLanguage') || DEFAULTS.incomingLanguage,
    outgoingLanguage: formData.get('outgoingLanguage') || DEFAULTS.outgoingLanguage,
    speechRecognitionLocale: formData.get('speechRecognitionLocale') || DEFAULTS.speechRecognitionLocale,
    incomingPrompt: formData.get('incomingPrompt') || DEFAULTS.incomingPrompt,
    outgoingPrompt: formData.get('outgoingPrompt') || DEFAULTS.outgoingPrompt,
    selectors
  };

  chrome.storage.sync.set(payload, () => {
    status.textContent = "保存しました";
    setTimeout(() => {
      status.textContent = "";
    }, 3000);
  });
}

form.addEventListener("submit", saveOptions);
document.addEventListener("DOMContentLoaded", restoreOptions);
