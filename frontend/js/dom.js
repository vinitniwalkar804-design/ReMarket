/**
 * Minimal DOM construction helpers.
 *
 * The React build describes the UI with JSX, which a compiler turns into DOM
 * calls. This module is the equivalent primitive for the vanilla build: `h()`
 * takes the same information a JSX element carries (tag, props, children) and
 * returns a real element. Every page module is written against it, so a JSX
 * element and its `h()` counterpart stay side by side line for line, which is
 * what makes the two frontends reviewable against each other.
 *
 * Deliberately no virtual DOM and no reactivity. Pages re-render the region
 * they own when their data changes, which is all the React build's state
 * updates amounted to once a re-render was triggered.
 */

/** Create an SVG element (same call shape as `h`, different namespace). */
function svgEl(tag) {
  return document.createElementNS("http://www.w3.org/2000/svg", tag);
}

const SVG_TAGS = new Set([
  "svg", "g", "path", "circle", "rect", "line", "polyline", "polygon", "ellipse",
  "defs", "linearGradient", "radialGradient", "stop", "clipPath", "mask", "text",
  "tspan", "use", "filter", "feGaussianBlur", "feOffset", "feMerge", "feMergeNode",
  "animate", "animateTransform", "title", "foreignObject",
]);

/**
 * Props whose value is set as an attribute only when it is a non-empty string.
 * Boolean-ish values are handled the way HTML expects.
 */
function setAttr(el, key, value) {
  const isAria = key.startsWith("aria-");

  if (value === null || value === undefined) return;

  if (typeof value === "boolean") {
    // HTML boolean attributes are presence-only: React renders `disabled={true}`
    // as `disabled=""` and drops the attribute entirely when false. ARIA states
    // are enumerated instead - `aria-pressed={false}` is `aria-pressed="false"`,
    // not an absent attribute, and "not present" is what a screen reader reads as
    // an unknown state. Product card wishlist and compare toggles depend on this,
    // so the two forms are kept apart in both directions.
    if (isAria) {
      el.setAttribute(key, value ? "true" : "false");
      return;
    }
    if (!value) return;
    el.setAttribute(key, "");
    return;
  }

  if (value === "") {
    if (isAria) {
      el.setAttribute(key, "");
      return;
    }
    return;
  }
  el.setAttribute(key, String(value));
}

/** Apply props to an element, returning the element. */
function applyProps(el, props) {
  for (const [key, value] of Object.entries(props || {})) {
    // `aria-pressed={false}` has to reach setAttr as the string "false". Skipping
    // false props here is right for HTML boolean attributes but wrong for the
    // enumerated ARIA ones, where React keeps the attribute and sets its value.
    if (value === null || value === undefined) continue;
    if (value === false && !key.startsWith("aria-")) continue;

    // React-style aliases so a JSX line can be copied over almost verbatim.
    if (key === "className") {
      el.setAttribute("class", String(value));
      continue;
    }
    if (key === "htmlFor") {
      el.setAttribute("for", String(value));
      continue;
    }
    if (key === "style" && typeof value === "object") {
      for (const [prop, v] of Object.entries(value)) {
        if (v === null || v === undefined) continue;
        if (prop.startsWith("--")) el.style.setProperty(prop, String(v));
        else el.style[prop] = v;
      }
      continue;
    }
    if (key === "dataset" && typeof value === "object") {
      for (const [k, v] of Object.entries(value)) {
        if (v === null || v === undefined) continue;
        el.dataset[k] = String(v);
      }
      continue;
    }
    // Event handlers.
    if (key.startsWith("on") && typeof value === "function") {
      const type = key.slice(2).toLowerCase();
      el.addEventListener(type, value);
      continue;
    }
    if (key === "ref" && typeof value === "function") {
      value(el);
      continue;
    }
    if (key === "value" && "value" in el) {
      // Assign the property, not the attribute, so controlled inputs update.
      el.value = value;
      continue;
    }
    if (key === "checked" && "checked" in el) {
      el.checked = Boolean(value);
      continue;
    }
    if (key === "dangerouslySetInnerHTML") {
      el.innerHTML = value?.__html ?? "";
      continue;
    }
    if (key === "key") continue; // React-only identity hint

    setAttr(el, key, value);
  }
  return el;
}

/** Append children, skipping the null/undefined/boolean holes JSX produces. */
function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false || child === true) continue;
    if (Array.isArray(child)) {
      appendChildren(el, child);
      continue;
    }
    el.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  }
}

/**
 * Build an element.
 *
 * @param {string} tag                 tag name; SVG tags get the SVG namespace.
 * @param {object} [props]             attributes, `on*` handlers, style object.
 * @param {...any} children            strings, numbers, nodes, arrays, or holes.
 * @returns {Element}
 */
export function h(tag, props, ...children) {
  // Allow h("div", [child]) as well as h("div", null, child).
  const rest = props && Array.isArray(props) ? [props, ...children] : children;
  const attrs = props && Array.isArray(props) ? null : props;

  const el = SVG_TAGS.has(tag) ? svgEl(tag) : document.createElement(tag);
  applyProps(el, attrs);
  appendChildren(el, rest);
  return el;
}

/** A detached fragment, for returning sibling nodes from a builder. */
export function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

/** Replace an element's contents in one operation. */
export function mount(target, ...children) {
  target.replaceChildren();
  appendChildren(target, children);
  return target;
}

/** Detach every child of an element. */
export function clear(target) {
  target.replaceChildren();
  return target;
}

/**
 * Build a component: a function that returns an element.
 * Exists so page modules read like JSX modules and so a future edit can swap in
 * a different renderer without touching call sites.
 */
export const component = (render) => render;

/** Join class names, dropping falsy entries. Mirrors clsx/tailwind-merge use. */
export function cx(...parts) {
  const out = [];
  for (const p of parts) {
    if (!p) continue;
    if (Array.isArray(p)) {
      const nested = cx(...p);
      if (nested) out.push(nested);
    } else if (typeof p === "object") {
      for (const [k, on] of Object.entries(p)) if (on) out.push(k);
    } else {
      out.push(String(p));
    }
  }
  return out.join(" ");
}

export { h as createElement };
export default h;
