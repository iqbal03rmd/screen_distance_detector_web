
let voicesCache = [];

function loadVoices() {
  voicesCache = window.speechSynthesis ? window.speechSynthesis.getVoices() : [];
  return voicesCache;
}

if (typeof window !== "undefined" && window.speechSynthesis) {
  window.speechSynthesis.onvoiceschanged = loadVoices;
  loadVoices();
}

/**
 * @param {string} text
 * @param {{lang?: string, rate?: number, pitch?: number}} [options]
 */

export function speak(text, options = {}) {
  if (!("speechSynthesis" in window)) {
    console.warn("SpeechSynthesis tidak didukung di browser ini.");
    return;
  }

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = options.lang || "en-US";
  utterance.rate = options.rate ?? 1;
  utterance.pitch = options.pitch ?? 1;

  const voices = voicesCache.length ? voicesCache : loadVoices();
  const preferred = voices.find((v) => v.lang === utterance.lang);
  if (preferred) utterance.voice = preferred;

  window.speechSynthesis.cancel();
  window.speechSynthesis.speak(utterance);
}
