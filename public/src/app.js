// 心靈健身房的進入點：準備儲存空間，把畫面事件轉給練習室模組。
import {
  handlePracticeClick,
  handlePracticeInput,
  handlePracticeKeydown,
  handlePracticeSubmit,
  initPractice,
  renderPractice,
} from './practice-view.js';

// localStorage 在無痕模式或被封鎖時可能丟錯；退回記憶體，畫面照常運作。
const storage = (() => {
  const memory = new Map();
  let real = null;
  try {
    real = window.localStorage;
    real.getItem('emo.probe');
  } catch {
    real = null;
  }
  return {
    getItem(key) {
      try {
        if (real) return real.getItem(key);
      } catch {}
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
      try {
        if (real) real.setItem(key, value);
      } catch {}
    },
  };
})();

const view = document.getElementById('view');
initPractice(view, storage);

view.addEventListener('click', handlePracticeClick);
view.addEventListener('input', handlePracticeInput);
view.addEventListener('submit', handlePracticeSubmit);
view.addEventListener('keydown', handlePracticeKeydown);

renderPractice();

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
