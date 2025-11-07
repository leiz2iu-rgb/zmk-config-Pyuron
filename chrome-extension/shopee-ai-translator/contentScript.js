(function () {
  let initialised = false;

  const STATE = {
    settings: null,
    observer: null,
    inputObserver: null,
    recognition: null,
    listening: false
  };

  function log(...args) {
    console.log("[Shopee AI Translator]", ...args);
  }

  function createTranslationBadge(text) {
    const container = document.createElement("div");
    container.className = "shopee-ai-translation";
    container.textContent = text;
    return container;
  }

  function markAsProcessed(node) {
    node.dataset.shopeeAiTranslated = "true";
  }

  function isProcessed(node) {
    return node.dataset.shopeeAiTranslated === "true";
  }

  async function translate(text, overrides = {}) {
    if (!text || !text.trim()) {
      return null;
    }

    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage(
        {
          type: "translate",
          payload: {
            text,
            targetLanguage: overrides.targetLanguage,
            sourceLanguage: overrides.sourceLanguage,
            promptOverride: overrides.promptOverride
          }
        },
        (response) => {
          if (!response) {
            reject(new Error("拡張機能のバックグラウンドから応答がありません。"));
            return;
          }
          if (!response.ok) {
            reject(new Error(response.error || "翻訳に失敗しました。"));
            return;
          }
          resolve(response.translation);
        }
      );
    });
  }

  function findNodeBySelectors(root, selectors) {
    const list = selectors
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const selector of list) {
      const result = root.querySelector(selector);
      if (result) {
        return result;
      }
    }
    return null;
  }

  function getMessageTextNode(messageNode, selectorList) {
    if (!messageNode) return null;
    const selectors = selectorList.split(",").map((s) => s.trim()).filter(Boolean);
    for (const selector of selectors) {
      const target = messageNode.matches(selector) ? messageNode : messageNode.querySelector(selector);
      if (target) {
        return target;
      }
    }
    return messageNode;
  }

  async function handleMessageNode(node) {
    if (!STATE.settings) return;
    if (isProcessed(node)) return;

    const textNode = getMessageTextNode(node, STATE.settings.selectors.messageText);
    if (!textNode) return;

    const originalText = textNode.innerText.trim();
    if (!originalText) return;

    try {
      const translation = await translate(originalText, {
        targetLanguage: STATE.settings.incomingLanguage,
        sourceLanguage: STATE.settings.outgoingLanguage,
        promptOverride: STATE.settings.incomingPrompt
      });
      if (translation) {
        const badge = createTranslationBadge(translation);
        node.appendChild(badge);
        markAsProcessed(node);
      }
    } catch (error) {
      log("Failed to translate incoming message", error);
      const badge = createTranslationBadge(`翻訳に失敗しました: ${error.message}`);
      node.appendChild(badge);
      markAsProcessed(node);
    }
  }

  function observeMessages(container) {
    if (!container) return;

    const incomingSelectors = STATE.settings.selectors.incomingMessage
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const callback = (mutations) => {
      for (const mutation of mutations) {
        mutation.addedNodes.forEach((node) => {
          if (!(node instanceof HTMLElement)) return;
          const isIncoming = incomingSelectors.some((selector) => node.matches(selector) || node.querySelector(selector));
          if (isIncoming) {
            const targetNode = incomingSelectors.some((selector) => node.matches(selector)) ? node : incomingSelectors
              .map((selector) => node.querySelector(selector))
              .find(Boolean);
            if (targetNode) {
              handleMessageNode(targetNode);
            }
          }
        });
      }
    };

    STATE.observer = new MutationObserver(callback);
    STATE.observer.observe(container, { childList: true, subtree: true });

    container.querySelectorAll(incomingSelectors.join(",")).forEach((node) => {
      handleMessageNode(node);
    });
  }

  function setupMicrophoneButton() {
    const mountButton = (container) => {
      if (!container || container.querySelector(".shopee-ai-mic")) {
        return;
      }

      const button = document.createElement("button");
      button.type = "button";
      button.className = "shopee-ai-mic";
      button.innerHTML = `\n        <span class="shopee-ai-mic__icon">🎤</span>\n        <span class="shopee-ai-mic__label">AI翻訳</span>\n      `;

      button.addEventListener("click", () => {
        if (STATE.listening) {
          stopListening();
        } else {
          startListening();
        }
      });

      container.appendChild(button);
    };

    const inputContainer = findNodeBySelectors(document, STATE.settings.selectors.inputContainer);
    if (inputContainer) {
      mountButton(inputContainer);
      return;
    }

    if (STATE.inputObserver) {
      return;
    }

    STATE.inputObserver = new MutationObserver(() => {
      const container = findNodeBySelectors(document, STATE.settings.selectors.inputContainer);
      if (container) {
        mountButton(container);
        if (STATE.inputObserver) {
          STATE.inputObserver.disconnect();
          STATE.inputObserver = null;
        }
      }
    });

    STATE.inputObserver.observe(document.body, { childList: true, subtree: true });
  }

  function ensureRecognition() {
    if (STATE.recognition) return STATE.recognition;
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error("ブラウザが音声認識に対応していません。");
    }
    const recognition = new SpeechRecognition();
    const locale = STATE.settings.speechRecognitionLocale ||
      (STATE.settings.incomingLanguage === "ja" ? "ja-JP" : STATE.settings.incomingLanguage || "ja-JP");
    recognition.lang = locale;
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    STATE.recognition = recognition;
    return recognition;
  }

  function startListening() {
    try {
      const recognition = ensureRecognition();
      recognition.start();
      STATE.listening = true;
      updateMicButtonState();
      recognition.onresult = async (event) => {
        const transcript = event.results[0][0].transcript;
        await handleSpeechResult(transcript);
      };
      recognition.onerror = (event) => {
        log("Speech recognition error", event.error);
        showMicError(event.error);
        stopListening();
      };
      recognition.onend = () => {
        stopListening();
      };
    } catch (error) {
      showMicError(error.message);
      log("Failed to start speech recognition", error);
    }
  }

  function stopListening() {
    if (STATE.recognition && STATE.listening) {
      STATE.recognition.stop();
    }
    STATE.listening = false;
    updateMicButtonState();
  }

  function updateMicButtonState() {
    const button = document.querySelector(".shopee-ai-mic");
    if (!button) return;
    button.classList.toggle("shopee-ai-mic--listening", STATE.listening);
  }

  function showMicError(message) {
    const button = document.querySelector(".shopee-ai-mic");
    if (!button) return;
    button.dataset.error = message;
    button.classList.add("shopee-ai-mic--error");
    setTimeout(() => {
      button.classList.remove("shopee-ai-mic--error");
      delete button.dataset.error;
    }, 5000);
  }

  async function handleSpeechResult(transcript) {
    log("Speech recognised", transcript);
    try {
      const translation = await translate(transcript, {
        targetLanguage: STATE.settings.outgoingLanguage,
        sourceLanguage: STATE.settings.incomingLanguage,
        promptOverride: STATE.settings.outgoingPrompt
      });
      if (translation) {
        injectTextToInput(translation);
      }
    } catch (error) {
      showMicError(error.message);
      log("Failed to translate speech", error);
    }
  }

  function injectTextToInput(text) {
    const input = findNodeBySelectors(document, STATE.settings.selectors.textarea);
    if (!input) {
      log("チャット入力欄が見つかりません");
      return;
    }

    if (input.tagName === "TEXTAREA") {
      input.value = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    } else if (input.getAttribute("contenteditable") === "true") {
      input.textContent = text;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }
  }

  async function init() {
    if (initialised) {
      return;
    }
    initialised = true;

    STATE.settings = await new Promise((resolve) => {
      chrome.storage.sync.get(null, (items) => {
        const merged = {
          ...items,
          selectors: { ...DEFAULT_SELECTORS, ...(items.selectors || {}) }
        };
        resolve({ ...DEFAULT_SETTINGS, ...merged });
      });
    });

    const messageContainer = findNodeBySelectors(document, STATE.settings.selectors.messageList);
    if (messageContainer) {
      observeMessages(messageContainer);
    } else {
      const watcher = new MutationObserver((mutations, observer) => {
        const container = findNodeBySelectors(document, STATE.settings.selectors.messageList);
        if (container) {
          observeMessages(container);
          observer.disconnect();
        }
      });
      watcher.observe(document.body, { childList: true, subtree: true });
    }

    setupMicrophoneButton();
  }

  const DEFAULT_SETTINGS = {
    incomingLanguage: "ja",
    outgoingLanguage: "en",
    speechRecognitionLocale: "ja-JP",
    incomingPrompt: "You are a translation assistant. Translate the following text into natural Japanese. Respond with the translation only.",
    outgoingPrompt: "You are a translation assistant. Translate the following Japanese text into {{targetLanguage}} for a Shopee chat reply. Respond with the translation only.",
    selectors: {}
  };

  const DEFAULT_SELECTORS = {
    messageList: '[data-testid="chat-content"], .chatroom-conversation, .chatroom__conversation',
    incomingMessage: '[data-testid="message-item-other"], .message-item--partner, .bubble--other',
    outgoingMessage: '[data-testid="message-item-self"], .message-item--self, .bubble--self',
    messageText: '.message-text, [data-testid="chat-message-text"], .bubble__message',
    inputContainer: '[data-testid="chat-input"], .chatroom-input',
    textarea: 'textarea, [contenteditable="true"]'
  };

  document.addEventListener("DOMContentLoaded", init);
  if (document.readyState !== "loading") {
    init();
  }
})();
