const statusEl = document.getElementById('status');

function run(variant) {
  chrome.runtime.sendMessage({ type: 'RUN_EXPERIMENT', variant });
  statusEl.textContent =
    `Running "${variant}"…\nA background Gemini tab is opening. Switch to it to watch, and check the ` +
    `service-worker console for the [content][debug] attach stages. Badge → OK / ERR.`;
}

document.getElementById('baseline').addEventListener('click', () => run('baseline'));
document.getElementById('foreground').addEventListener('click', () => run('foreground'));
document.getElementById('cdp').addEventListener('click', () => run('cdp'));
document.getElementById('filechooser').addEventListener('click', () => run('filechooser'));
