/**
 * Virtual List Implementation
 * Efficient rendering of large lists
 */

export class VirtualList {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      itemHeight: 60,
      overscan: 5,
      renderItem: () => {},
      ...options
    };

    this.items = [];
    this.visibleItems = new Map();
    this.scrollTop = 0;
    this.containerHeight = 0;

    this.init();
  }

  /**
   * Initialize virtual list
   */
  init() {
    this.wrapper = document.createElement('div');
    this.wrapper.style.position = 'relative';
    this.wrapper.style.width = '100%';

    this.content = document.createElement('div');
    this.content.style.position = 'absolute';
    this.content.style.top = '0';
    this.content.style.left = '0';
    this.content.style.width = '100%';
    this.content.style.willChange = 'transform';

    this.wrapper.appendChild(this.content);
    this.container.appendChild(this.wrapper);

    // Setup scroll listener
    this.container.addEventListener('scroll', this.handleScroll.bind(this));

    // Setup resize observer
    this.resizeObserver = new ResizeObserver(() => {
      this.containerHeight = this.container.clientHeight;
      this.render();
    });
    this.resizeObserver.observe(this.container);

    this.containerHeight = this.container.clientHeight;
  }

  /**
   * Set items to render
   * @param {Array} items - Items array
   */
  setItems(items) {
    this.items = items;
    this.updateWrapperHeight();
    this.render();
  }

  /**
   * Update wrapper height based on total items
   */
  updateWrapperHeight() {
    const totalHeight = this.items.length * this.options.itemHeight;
    this.wrapper.style.height = `${totalHeight}px`;
  }

  /**
   * Handle scroll event
   */
  handleScroll() {
    this.scrollTop = this.container.scrollTop;
    this.render();
  }

  /**
   * Calculate visible range
   * @returns {Object} - Start and end indices
   */
  calculateVisibleRange() {
    const start = Math.floor(this.scrollTop / this.options.itemHeight);
    const visibleCount = Math.ceil(this.containerHeight / this.options.itemHeight);
    
    const startIndex = Math.max(0, start - this.options.overscan);
    const endIndex = Math.min(
      this.items.length,
      start + visibleCount + this.options.overscan
    );

    return { startIndex, endIndex };
  }

  /**
   * Render visible items
   */
  render() {
    const { startIndex, endIndex } = this.calculateVisibleRange();
    const currentVisible = new Set();

    // Render items in range
    for (let i = startIndex; i < endIndex; i++) {
      currentVisible.add(i);

      if (!this.visibleItems.has(i)) {
        const item = this.renderItem(i);
        this.visibleItems.set(i, item);
        this.content.appendChild(item);
      }
    }

    // Remove items outside range
    for (const [index, element] of this.visibleItems) {
      if (!currentVisible.has(index)) {
        element.remove();
        this.visibleItems.delete(index);
      }
    }
  }

  /**
   * Render individual item
   * @param {number} index - Item index
   * @returns {HTMLElement} - Rendered element
   */
  renderItem(index) {
    const item = this.items[index];
    const element = this.options.renderItem(item, index);

    element.style.position = 'absolute';
    element.style.top = `${index * this.options.itemHeight}px`;
    element.style.width = '100%';
    element.style.height = `${this.options.itemHeight}px`;
    element.dataset.index = index;

    return element;
  }

  /**
   * Scroll to index
   * @param {number} index - Item index
   * @param {string} behavior - Scroll behavior
   */
  scrollToIndex(index, behavior = 'smooth') {
    const top = index * this.options.itemHeight;
    this.container.scrollTo({ top, behavior });
  }

  /**
   * Update item at index
   * @param {number} index - Item index
   */
  updateItem(index) {
    if (this.visibleItems.has(index)) {
      const oldElement = this.visibleItems.get(index);
      const newElement = this.renderItem(index);
      oldElement.replaceWith(newElement);
      this.visibleItems.set(index, newElement);
    }
  }

  /**
   * Destroy virtual list
   */
  destroy() {
    this.resizeObserver.disconnect();
    this.container.removeEventListener('scroll', this.handleScroll);
    this.wrapper.remove();
    this.visibleItems.clear();
  }
}

/**
 * Simple windowing for message list
 */
export class MessageWindow {
  constructor(container, options = {}) {
    this.container = container;
    this.options = {
      windowSize: 50,
      renderMessage: () => {},
      ...options
    };

    this.messages = [];
    this.renderedMessages = new Map();
    this.isAtBottom = true;
  }

  /**
   * Set messages
   * @param {Array} messages - Messages array
   */
  setMessages(messages) {
    this.messages = messages;
    this.render();
    
    if (this.isAtBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Add message
   * @param {Object} message - Message object
   */
  addMessage(message) {
    this.messages.push(message);
    
    // Keep only last N messages in DOM
    if (this.messages.length > this.options.windowSize) {
      const toRemove = this.messages.length - this.options.windowSize;
      for (let i = 0; i < toRemove; i++) {
        const msg = this.messages[i];
        if (this.renderedMessages.has(msg.id)) {
          this.renderedMessages.get(msg.id).remove();
          this.renderedMessages.delete(msg.id);
        }
      }
    }

    // Render new message
    const element = this.options.renderMessage(message);
    this.renderedMessages.set(message.id, element);
    this.container.appendChild(element);

    if (this.isAtBottom) {
      this.scrollToBottom();
    }
  }

  /**
   * Render messages
   */
  render() {
    this.container.innerHTML = '';
    this.renderedMessages.clear();

    const start = Math.max(0, this.messages.length - this.options.windowSize);
    const messagesToRender = this.messages.slice(start);

    messagesToRender.forEach(message => {
      const element = this.options.renderMessage(message);
      this.renderedMessages.set(message.id, element);
      this.container.appendChild(element);
    });
  }

  /**
   * Check if scrolled to bottom
   * @returns {boolean}
   */
  checkIfAtBottom() {
    const threshold = 100;
    const scrollContainer = this.container.parentElement;
    
    if (!scrollContainer) return true;

    this.isAtBottom = (
      scrollContainer.scrollHeight - scrollContainer.scrollTop - scrollContainer.clientHeight
    ) < threshold;

    return this.isAtBottom;
  }

  /**
   * Scroll to bottom
   * @param {string} behavior - Scroll behavior
   */
  scrollToBottom(behavior = 'smooth') {
    const scrollContainer = this.container.parentElement;
    if (scrollContainer) {
      scrollContainer.scrollTo({
        top: scrollContainer.scrollHeight,
        behavior
      });
    }
  }

  /**
   * Clear messages
   */
  clear() {
    this.messages = [];
    this.renderedMessages.clear();
    this.container.innerHTML = '';
  }
}

