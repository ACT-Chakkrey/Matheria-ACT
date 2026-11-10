// Matheria Virtual Touch Keypad for Mobile and Tablet Math Combat
(function() {
  function getActiveInput() {
    const coop = document.getElementById('coopAnswer');
    if (coop && coop.offsetParent !== null) return coop;
    const single = document.getElementById('answer');
    if (single && single.offsetParent !== null) return single;
    return null;
  }

  function handleKey(key) {
    const input = getActiveInput();
    if (!input) return;

    if (key === 'ENTER') {
      if (typeof playSfx === 'function') playSfx('clickSound');
      if (input.id === 'coopAnswer' && typeof coopSubmit === 'function') {
        coopSubmit();
      } else if (typeof check === 'function') {
        check();
      }
      return;
    }

    if (key === 'DEL') {
      input.value = input.value.slice(0, -1);
    } else {
      if (input.value.length < 8) {
        input.value += key;
      }
    }

    // Trigger input event for any reactive listeners
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  function createKeypad(containerId) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const wrap = document.createElement('div');
    wrap.className = 'mobile-keypad';

    const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'ENTER'];

    keys.forEach(k => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'keypad-btn';
      if (k === 'DEL') {
        btn.classList.add('action-del');
        btn.textContent = '⌫';
      } else if (k === 'ENTER') {
        btn.classList.add('action-enter');
        btn.textContent = '↵';
      } else {
        btn.textContent = k;
      }

      btn.addEventListener('touchstart', e => {
        e.preventDefault();
        handleKey(k);
      });

      btn.addEventListener('click', e => {
        e.preventDefault();
        handleKey(k);
      });

      wrap.appendChild(btn);
    });

    container.appendChild(wrap);
  }

  document.addEventListener('DOMContentLoaded', () => {
    createKeypad('inputZone');
    const coopFight = document.getElementById('coopFight');
    if (coopFight) createKeypad('coopFight');
  });

  window.initMobileKeypad = () => {
    if (!document.querySelector('#inputZone .mobile-keypad')) {
      createKeypad('inputZone');
    }
    if (!document.querySelector('#coopFight .mobile-keypad')) {
      createKeypad('coopFight');
    }
  };
})();
