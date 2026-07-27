/**
 * component.js — Reactive Base Component System for MediFlow UI
 *
 * Provides a lightweight component abstraction over vanilla JS.
 * Supports lifecycle hooks, event delegation, child components,
 * and reactive state updates without any framework dependency.
 *
 * Usage:
 *   class MyWidget extends Component {
 *     render() { return `<div>${this.state.count}</div>`; }
 *     bindEvents() { this.on('click', 'button', () => this.setState({ count: this.state.count + 1 })); }
 *   }
 *   new MyWidget('#app', {}, { count: 0 }).mount();
 */

export class Component {
  /**
   * @param {string|HTMLElement} container - CSS selector or DOM element
   * @param {Object} props   - Immutable configuration passed from parent
   * @param {Object} state   - Initial reactive state
   */
  constructor(container, props = {}, state = {}) {
    this.container = typeof container === 'string'
      ? document.querySelector(container)
      : container;
    this.props = Object.freeze({ ...props });
    this.state = { ...state };
    this._eventCleanups = [];
    this._children = [];
    this._mounted = false;
  }

  // ── Lifecycle Hooks ────────────────────────────────────────────────────

  /** Called once before first render */
  beforeMount() {}

  /** Called once after first render + bindEvents */
  afterMount() {}

  /** Called before every re-render (including first) */
  beforeUpdate() {}

  /** Called after every re-render */
  afterUpdate() {}

  /** Called when component is destroyed */
  onDestroy() {}

  // ── Core Methods ───────────────────────────────────────────────────────

  /**
   * Returns HTML string for this component.
   * Override in subclasses.
   * @returns {string}
   */
  render() {
    return '';
  }

  /**
   * Bind DOM events after render. Called after every update().
   * Use this.on() for automatic cleanup on re-render.
   */
  bindEvents() {}

  /**
   * Mount the component: initial render + lifecycle hooks.
   * @returns {this}
   */
  mount() {
    this.beforeMount();
    this.update();
    this._mounted = true;
    this.afterMount();
    return this;
  }

  /**
   * Update the DOM: re-render + rebind events.
   * Automatically cleans up previous event listeners.
   */
  update() {
    if (!this.container) return;
    this.beforeUpdate();
    this._cleanup();
    this.container.innerHTML = this.render();
    this.bindEvents();
    this._mountChildren();
    this.afterUpdate();
  }

  /**
   * Merge new state and trigger re-render.
   * @param {Object} newState - Partial state to merge
   */
  setState(newState) {
    const prev = { ...this.state };
    this.state = { ...this.state, ...newState };
    // Only re-render if state actually changed
    if (JSON.stringify(prev) !== JSON.stringify(this.state)) {
      this.update();
    }
  }

  /**
   * Destroy this component: cleanup events, children, DOM.
   */
  destroy() {
    this.onDestroy();
    this._cleanup();
    this._children.forEach(c => c.destroy());
    this._children = [];
    if (this.container) this.container.innerHTML = '';
    this._mounted = false;
  }

  // ── Event Delegation ───────────────────────────────────────────────────

  /**
   * Add a delegated event listener scoped to this component's container.
   * Listeners are automatically removed on re-render/destroy.
   *
   * @param {string}   event     - DOM event name ('click', 'input', etc.)
   * @param {string}   selector  - CSS selector to delegate to
   * @param {Function} handler   - Event handler
   */
  on(event, selector, handler) {
    const listener = (e) => {
      const target = e.target.closest(selector);
      if (target && this.container.contains(target)) {
        handler.call(this, e, target);
      }
    };
    this.container.addEventListener(event, listener);
    this._eventCleanups.push(() => this.container.removeEventListener(event, listener));
  }

  /**
   * Query an element within this component's container.
   * @param {string} selector
   * @returns {HTMLElement|null}
   */
  $(selector) {
    return this.container?.querySelector(selector) || null;
  }

  /**
   * Query all elements within this component's container.
   * @param {string} selector
   * @returns {NodeList}
   */
  $$(selector) {
    return this.container?.querySelectorAll(selector) || [];
  }

  // ── Child Components ───────────────────────────────────────────────────

  /**
   * Register a child component to be mounted after this component renders.
   * @param {Component} child
   * @returns {Component} the child
   */
  addChild(child) {
    this._children.push(child);
    return child;
  }

  // ── Private ────────────────────────────────────────────────────────────

  _cleanup() {
    this._eventCleanups.forEach(fn => fn());
    this._eventCleanups = [];
  }

  _mountChildren() {
    this._children.forEach(child => {
      if (child.container && this.container.contains(child.container)) {
        child.mount();
      }
    });
  }
}
