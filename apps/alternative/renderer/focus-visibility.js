// Suppress an existing focus ring after three seconds away from the mouse.
// DOM focus, native keyboard handling, and original hover/selected styles stay intact.
(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const installed = Symbol.for('threadshelf.focusVisibility');
  if (document[installed]) return;
  document[installed] = true;

  const idleAttribute = 'data-ts-focus-idle';
  const delay = 3000;
  const inputControls = new Set(['button', 'submit', 'reset', 'image', 'checkbox', 'radio', 'range', 'color', 'file']);
  const controls = 'button,select,summary,a[href],area[href],input,[role="button"],[role="tab"],[role="switch"],[role="checkbox"],[role="radio"],[role="option"],[role="menuitem"],[role="menuitemcheckbox"],[role="menuitemradio"],[role="slider"],[role="combobox"]';
  let focused = null;
  let hovered = false;
  let timer = null;

  function element(node) {
    return node?.nodeType === 1 ? node : node?.parentElement;
  }

  function textEntry(node) {
    return !!node && (node.isContentEditable || node.matches('textarea,[role="textbox"],[role="searchbox"]') ||
      (node.localName === 'input' && !inputControls.has(node.type)));
  }

  function controlFor(node) {
    const target = element(node);
    if (!target || target.isContentEditable || target.closest('textarea,[role="textbox"],[role="searchbox"]')) return null;
    const control = target.closest(controls);
    if (!control || textEntry(control)) return null;
    // An editable combobox and all of its adornments belong to text entry.
    const combo = target.closest('[role="combobox"]');
    if (combo && (textEntry(combo) || [...combo.querySelectorAll('input,textarea,[contenteditable],[role="textbox"],[role="searchbox"]')].some(textEntry))) return null;
    return control;
  }

  function clearTimer() {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  }

  function ownsFocus() {
    return !!focused && focused.isConnected && controlFor(document.activeElement) === focused;
  }

  function arm() {
    clearTimer();
    if (!ownsFocus() || hovered || focused.hasAttribute(idleAttribute)) return;
    const control = focused;
    timer = setTimeout(() => {
      timer = null;
      if (focused === control && ownsFocus() && !hovered) control.setAttribute(idleAttribute, '');
    }, delay);
  }

  function release() {
    clearTimer();
    focused?.removeAttribute(idleAttribute);
    focused = null;
    hovered = false;
  }

  function activate(node) {
    const control = controlFor(node);
    if (control !== focused) release();
    if (!control) return;
    focused = control;
    focused.removeAttribute(idleAttribute);
    hovered = focused.matches(':hover');
    arm();
  }

  document.addEventListener('focusin', event => activate(event.target), true);
  document.addEventListener('focusout', () => release(), true);
  document.addEventListener('keydown', () => activate(document.activeElement), true);
  document.addEventListener('pointerdown', event => {
    if (focused && controlFor(event.target) === focused) activate(document.activeElement);
  }, true);
  document.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch' || !focused || !focused.contains(element(event.target))) return;
    if (focused.contains(element(event.relatedTarget))) return;
    hovered = true;
    clearTimer();
    // Hover only delays suppression. It never restores a timed-out ring.
  }, true);
  document.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch' || !focused || !focused.contains(element(event.target))) return;
    if (focused.contains(element(event.relatedTarget))) return;
    hovered = false;
    arm();
  }, true);
  window.addEventListener('blur', clearTimer);
  window.addEventListener('focus', () => activate(document.activeElement));
  activate(document.activeElement);
})();
