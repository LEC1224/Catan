import React, { useEffect, useId, useLayoutEffect, useRef } from "react";
import { Keyboard } from "lucide-react";

const directActions = { d: "development", r: "road", s: "settlement", c: "city", e: "endTurn", "?": "help" };
const actionKeys = {
  roll: "Space Enter", accept: "Space Enter", decline: "Escape", chat: "T",
  ...Object.fromEntries(Object.entries(directActions).map(([key, action]) => [action, key.toUpperCase()])),
};

export const shortcutProps = (action) => ({ "data-match-shortcut": action, "aria-keyshortcuts": actionKeys[action] });

const controls = "button, a[href], [role='button'], [data-pointer-action]";
const dialogSelector = "[data-keyboard-dialog]";
const topDialog = () => [...document.querySelectorAll(dialogSelector)].at(-1);
const available = (control) => control && control.getClientRects().length &&
  !control.closest(":disabled, [aria-disabled='true'], [inert], [hidden]");
const ignore = (event) => event.defaultPrevented || event.isComposing || event.ctrlKey || event.altKey || event.metaKey;

function consume(event) {
  event.preventDefault();
  event.stopPropagation();
}

export function MatchShortcuts({ scope, onChat, onEscape }) {
  const handlers = useRef(null);
  useLayoutEffect(() => { handlers.current = { onChat, onEscape }; });

  useEffect(() => {
    let pointer = null;
    let keyboardFocus = document.activeElement?.matches(":focus-visible") ? document.activeElement : null;
    const rememberPointer = (event) => {
      if (event.pointerType === "mouse") pointer = [event.clientX, event.clientY];
    };
    const pointerDown = (event) => {
      keyboardFocus = null;
      pointer = null;
      rememberPointer(event);
    };
    const forgetPointer = () => { pointer = null; };
    const pointerOut = (event) => { if (!event.relatedTarget) forgetPointer(); };
    // A mouse-focused button can start matching :focus-visible when a key is pressed.
    const focusIn = (event) => { keyboardFocus = event.target.matches(":focus-visible") ? event.target : null; };

    function keyDown(event) {
      if (ignore(event) || (event.shiftKey && event.key !== "?")) return;
      const key = event.key.toLowerCase();
      const activation = key === " " || key === "enter";
      if (!activation && key !== "escape" && key !== "t" && !Object.hasOwn(directActions, key)) return;

      const match = scope.current;
      if (!match) return;
      const target = event.target instanceof Element ? event.target : null;
      const dialog = topDialog();
      if (dialog && !activation) return;
      if (!dialog && target && target !== document.body && target !== document.documentElement && !match.contains(target)) return;
      const area = dialog ?? match;
      if (target && area.contains(target) && (target.isContentEditable || target.closest("input, textarea, select, [role='textbox']"))) {
        if (!dialog && key === "escape" && !event.repeat && target.matches(".chat-input input")) {
          consume(event);
          target.blur();
        }
        return;
      }
      if (event.repeat) {
        if (activation) consume(event);
        return;
      }

      const command = (name) => match.querySelector(`[data-match-shortcut="${name}"]`);
      const run = (control, hit) => {
        if (!available(control)) return false;
        consume(event);
        if (hit || !control.click) {
          const [clientX, clientY] = hit ? pointer : [0, 0];
          (hit ?? control).dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true,
            detail: hit ? 1 : 0, clientX, clientY, view: window }));
        } else control.click();
        return true;
      };

      if (key === "escape") {
        if (!run(command("decline")) && handlers.current.onEscape()) consume(event);
      } else if (key === "t") {
        consume(event);
        handlers.current.onChat();
      } else if (!activation) {
        run(command(directActions[key]));
      } else {
        const focused = area.contains(target) ? target?.closest(controls) : null;
        if (focused && keyboardFocus === target) {
          if (!run(focused)) consume(event);
          return;
        }
        if (!dialog && (run(command("roll")) || run(command("accept")))) return;
        if (pointer) {
          const hit = document.elementFromPoint(...pointer);
          if (area.contains(hit) && run(hit.closest(controls), hit)) return;
        } else if (run(focused)) return;
        // Do not re-click a stale mouse focus or activate a control behind a dialog.
        if (focused || (dialog && target && !area.contains(target))) consume(event);
      }
    }

    document.addEventListener("keydown", keyDown, true);
    document.addEventListener("pointermove", rememberPointer);
    document.addEventListener("pointerdown", pointerDown, true);
    document.addEventListener("pointerout", pointerOut);
    document.addEventListener("focusin", focusIn);
    window.addEventListener("blur", forgetPointer);
    return () => {
      document.removeEventListener("keydown", keyDown, true);
      document.removeEventListener("pointermove", rememberPointer);
      document.removeEventListener("pointerdown", pointerDown, true);
      document.removeEventListener("pointerout", pointerOut);
      document.removeEventListener("focusin", focusIn);
      window.removeEventListener("blur", forgetPointer);
    };
  }, [scope]);
  return null;
}

export function useDialogKeyboard(ref) {
  useLayoutEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.focus({ preventScroll: true });
    function keyDown(event) {
      if ((event.key !== "Escape" && event.key !== "Tab") || ignore(event) || topDialog() !== dialog) return;
      if (event.key === "Escape" && !event.shiftKey && !event.repeat) {
        const close = dialog.querySelector("[data-dialog-close]");
        if (close) { consume(event); close.click(); }
      } else if (event.key === "Tab") {
        const tabbable = [...dialog.querySelectorAll("button, a[href], input, select, textarea, [tabindex]")]
          .filter((element) => element.tabIndex >= 0 && available(element));
        const first = tabbable[0], last = tabbable.at(-1);
        const focus = document.activeElement;
        if (!tabbable.includes(focus) || focus === (event.shiftKey ? first : last)) {
          consume(event);
          (event.shiftKey ? last : first)?.focus();
        }
      }
    }
    document.addEventListener("keydown", keyDown);
    return () => {
      document.removeEventListener("keydown", keyDown);
      if (previous?.isConnected && (dialog.contains(document.activeElement) || document.activeElement === document.body)) {
        previous.focus({ preventScroll: true });
      }
    };
  }, [ref]);
}

export function KeyboardShortcuts({ tableNavigation = false }) {
  const heading = useId();
  const entries = [
    [["Space", "Enter"], "Activate the control you focused with the keyboard. Otherwise, roll when the dice are ready, accept the displayed offer if you can, or click the button, card or board spot under your pointer."],
    [["Esc"], `Close an open dialog or leave the message field. During play, decline the displayed incoming offer. With no offer, cancel your build selection or close the trade tray${tableNavigation ? " or a compact side panel" : ""}.`],
    [[actionKeys.chat], "Open chat and focus the message field. Press Enter in the field to send."],
    [[actionKeys.development], "Buy a development card."],
    [[actionKeys.road, actionKeys.settlement, actionKeys.city], "Select Road, Settlement or City, then choose a location on the board."],
    [[actionKeys.endTurn], "End your turn."],
    [[actionKeys.help], "Open the game rules."],
    [["Tab", "Shift + Tab"], "Move to the next or previous control."],
    ...(tableNavigation ? [
      [["↑", "↓", "←", "→"], "Pan when the board is focused."],
      [["+", "=", "−", "0"], "With the board focused: zoom in (+ or =), zoom out (−), or reset the view (0)."],
    ] : []),
    [["←", "→", "Home", "End"], `Move between ${tableNavigation ? "cards in a focused hand or " : ""}replay markers, or jump to the first or last.`],
  ];
  return (
    <section className="guide-shortcuts" aria-labelledby={heading}>
      <h3 id={heading}><Keyboard size={19} aria-hidden="true" /> Keyboard shortcuts</h3>
      <dl>
        {entries.map(([keys, description]) => (
          <div key={keys[0]}>
            <dt>{keys.map((key) => <kbd key={key}>{key}</kbd>)}</dt>
            <dd>{description}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
