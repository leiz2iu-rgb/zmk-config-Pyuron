const DEFAULT_SETTINGS = {
  apiKey: "",
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

async function getSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve({ ...DEFAULT_SETTINGS, ...items, selectors: { ...DEFAULT_SETTINGS.selectors, ...(items.selectors || {}) } });
    });
  });
}

async function translateText({ text, targetLanguage, sourceLanguage, promptOverride }) {
  const settings = await getSettings();
  const apiKey = settings.apiKey;
  if (!apiKey) {
    throw new Error("APIキーが設定されていません。オプションページから設定してください。");
  }

  const baseUrl = (settings.apiBaseUrl || DEFAULT_SETTINGS.apiBaseUrl).replace(/\/$/, "");
  const model = settings.model || DEFAULT_SETTINGS.model;
  const promptTemplate = promptOverride || settings.incomingPrompt;
  const prompt = promptTemplate
    .replace(/{{targetLanguage}}/g, targetLanguage || settings.outgoingLanguage || "en")
    .replace(/{{sourceLanguage}}/g, sourceLanguage || settings.incomingLanguage || "auto");

  const messages = [
    {
      role: "system",
      content: prompt
    },
    {
      role: "user",
      content: text
    }
  ];

  const response = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`翻訳リクエストが失敗しました: ${response.status} ${errorText}`);
  }

  const data = await response.json();
  const translation = data?.choices?.[0]?.message?.content?.trim();
  if (!translation) {
    throw new Error("翻訳結果を取得できませんでした。");
  }

  return translation;
}

chrome.runtime.onInstalled.addListener(async () => {
  const settings = await getSettings();
  chrome.storage.sync.set(settings);
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === "translate") {
    translateText(request.payload)
      .then((translation) => sendResponse({ ok: true, translation }))
      .catch((error) => sendResponse({ ok: false, error: error.message }));
    return true;
  }
  return false;
});
