/**
 * Modal Dialogs
 * Modal window management
 */

import { createElement } from '../utils/helpers.js';

/**
 * Base modal class
 */
export class Modal {
  constructor(options = {}) {
    this.options = {
      title: 'Modal',
      closeOnOverlay: true,
      ...options
    };

    this.overlay = null;
    this.modal = null;
    this.onClose = null;
  }

  /**
   * Create modal structure
   * @returns {HTMLElement}
   */
  create() {
    this.overlay = createElement('div', {
      className: 'modal-overlay',
      id: 'modal-overlay'
    });

    this.modal = createElement('div', {
      className: 'modal',
      role: 'dialog',
      'aria-modal': 'true',
      'aria-labelledby': 'modal-title'
    });

    // Header
    const header = createElement('div', { className: 'modal__header' });

    const title = createElement('h2', {
      className: 'modal__title',
      id: 'modal-title'
    }, this.options.title);

    const closeBtn = createElement('button', {
      className: 'modal__close',
      'aria-label': 'Закрыть'
    });

    const closeSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    closeSvg.setAttribute('width', '24');
    closeSvg.setAttribute('height', '24');

    const closeUse = document.createElementNS('http://www.w3.org/2000/svg', 'use');
    closeUse.setAttributeNS('http://www.w3.org/1999/xlink', 'href', 'icons.svg#x');
    closeSvg.appendChild(closeUse);

    closeBtn.appendChild(closeSvg);
    closeBtn.addEventListener('click', () => this.close());

    header.appendChild(title);
    header.appendChild(closeBtn);

    // Body
    const body = createElement('div', { className: 'modal__body' });
    this.renderBody(body);

    // Footer
    const footer = createElement('div', { className: 'modal__footer' });
    this.renderFooter(footer);

    this.modal.appendChild(header);
    this.modal.appendChild(body);
    if (footer.children.length > 0) {
      this.modal.appendChild(footer);
    }

    this.overlay.appendChild(this.modal);

    // Event listeners
    if (this.options.closeOnOverlay) {
      this.overlay.addEventListener('click', (e) => {
        if (e.target === this.overlay) {
          this.close();
        }
      });
    }

    // Escape key
    this.escapeHandler = (e) => {
      if (e.key === 'Escape') {
        this.close();
      }
    };
    document.addEventListener('keydown', this.escapeHandler);

    // Focus trap
    this.setupFocusTrap();

    return this.overlay;
  }

  /**
   * Render modal body (override in subclass)
   * @param {HTMLElement} body - Body element
   */
  renderBody(body) {
    body.textContent = 'Modal content';
  }

  /**
   * Render modal footer (override in subclass)
   * @param {HTMLElement} footer - Footer element
   */
  renderFooter(footer) {
    // Default: no footer
  }

  /**
   * Setup focus trap
   */
  setupFocusTrap() {
    const focusableElements = this.modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );

    if (focusableElements.length === 0) return;

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];

    this.tabHandler = (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        if (document.activeElement === firstElement) {
          lastElement.focus();
          e.preventDefault();
        }
      } else {
        if (document.activeElement === lastElement) {
          firstElement.focus();
          e.preventDefault();
        }
      }
    };

    this.modal.addEventListener('keydown', this.tabHandler);

    // Focus first element
    setTimeout(() => firstElement.focus(), 100);
  }

  /**
   * Show modal
   */
  show() {
    const existing = document.getElementById('modal-overlay');
    if (existing) existing.remove();

    const overlay = this.create();
    overlay.style.display = 'flex';
    document.body.appendChild(overlay);

    return this;
  }

  /**
   * Close modal
   */
  close() {
    if (this.overlay) {
      this.overlay.style.display = 'none';
      this.overlay.remove();
    }

    document.removeEventListener('keydown', this.escapeHandler);

    if (this.onClose) {
      this.onClose();
    }
  }

  /**
   * Set close callback
   * @param {Function} callback
   */
  setOnClose(callback) {
    this.onClose = callback;
    return this;
  }
}

/**
 * Settings Modal
 */
export class SettingsModal extends Modal {
  constructor(store) {
    super({ title: 'Настройки' });
    this.store = store;
  }

  renderBody(body) {
    const settings = this.store.getState('settings');

    // Theme setting
    const themeGroup = this.createFormGroup(
      'Тема',
      this.createSelect('theme', [
        { value: 'auto', label: 'Авто' },
        { value: 'light', label: 'Светлая' },
        { value: 'dark', label: 'Тёмная' }
      ], settings.theme)
    );

    // Language setting
    const langGroup = this.createFormGroup(
      'Язык',
      this.createSelect('language', [
        { value: 'ru', label: 'Русский' },
        { value: 'en', label: 'English' }
      ], settings.language)
    );

    // Notifications
    const notifGroup = this.createFormGroup(
      'Уведомления',
      this.createCheckbox('notifications', 'Включить уведомления', settings.notifications)
    );

    // Sounds
    const soundGroup = this.createFormGroup(
      'Звуки',
      this.createCheckbox('sounds', 'Включить звуки', settings.sounds)
    );

    body.appendChild(themeGroup);
    body.appendChild(langGroup);
    body.appendChild(notifGroup);
    body.appendChild(soundGroup);
  }

  renderFooter(footer) {
    const saveBtn = createElement('button', {
      className: 'btn btn--primary'
    }, 'Сохранить');

    saveBtn.addEventListener('click', () => {
      this.save();
    });

    const cancelBtn = createElement('button', {
      className: 'btn btn--secondary'
    }, 'Отмена');

    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(saveBtn);
  }

  createFormGroup(label, input) {
    const group = createElement('div', { className: 'form-group' });

    const labelEl = createElement('label', { className: 'form-label' }, label);

    group.appendChild(labelEl);
    group.appendChild(input);

    return group;
  }

  createSelect(name, options, value) {
    const select = createElement('select', {
      className: 'form-input',
      name
    });

    options.forEach(opt => {
      const option = createElement('option', {
        value: opt.value
      }, opt.label);

      if (opt.value === value) {
        option.selected = true;
      }

      select.appendChild(option);
    });

    return select;
  }

  createCheckbox(name, label, checked) {
    const wrapper = createElement('div', { style: 'display: flex; align-items: center; gap: 8px;' });

    const checkbox = createElement('input', {
      type: 'checkbox',
      name,
      id: name
    });

    if (checked) {
      checkbox.checked = true;
    }

    const labelEl = createElement('label', {
      for: name,
      style: 'cursor: pointer; user-select: none;'
    }, label);

    wrapper.appendChild(checkbox);
    wrapper.appendChild(labelEl);

    return wrapper;
  }

  save() {
    const formData = new FormData(this.modal.querySelector('.modal__body'));
    const updates = {};

    // Get select values
    const theme = this.modal.querySelector('[name="theme"]').value;
    const language = this.modal.querySelector('[name="language"]').value;

    // Get checkbox values
    const notifications = this.modal.querySelector('[name="notifications"]').checked;
    const sounds = this.modal.querySelector('[name="sounds"]').checked;

    updates.theme = theme;
    updates.language = language;
    updates.notifications = notifications;
    updates.sounds = sounds;

    // Import actions to update settings
    import('../state/actions.js').then(({ updateSettings }) => {
      updateSettings(this.store, updates);
      this.close();
    });
  }
}

/**
 * Create Guild Modal
 */
export class CreateGuildModal extends Modal {
  constructor(store) {
    super({ title: 'Создать сервер' });
    this.store = store;
  }

  renderBody(body) {
    const nameGroup = createElement('div', { className: 'form-group' });

    const label = createElement('label', {
      className: 'form-label',
      for: 'guild-name'
    }, 'Название сервера');

    const input = createElement('input', {
      type: 'text',
      className: 'form-input',
      id: 'guild-name',
      name: 'name',
      placeholder: 'Мой сервер',
      required: true
    });

    nameGroup.appendChild(label);
    nameGroup.appendChild(input);

    body.appendChild(nameGroup);

    // Focus input
    setTimeout(() => input.focus(), 100);
  }

  renderFooter(footer) {
    const createBtn = createElement('button', {
      className: 'btn btn--primary'
    }, 'Создать');

    createBtn.addEventListener('click', () => {
      this.create();
    });

    const cancelBtn = createElement('button', {
      className: 'btn btn--secondary'
    }, 'Отмена');

    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(createBtn);
  }

  create() {
    const input = this.modal.querySelector('#guild-name');
    const name = input.value.trim();

    if (!name) {
      input.focus();
      return;
    }

    import('../state/actions.js').then(({ createGuild }) => {
      const guild = createGuild(this.store, { name });
      this.close();

      // Navigate to new guild
      import('../core/router.js').then(({ router }) => {
        const channels = this.store.getState('channels');
        const firstChannel = channels.find(c => c.guild_id === guild.id);
        if (firstChannel) {
          window.location.hash = `/g/${guild.id}/c/${firstChannel.id}`;
        }
      });
    });
  }
}

/**
 * Create Channel Modal
 */
export class CreateChannelModal extends Modal {
  constructor(store, guildId) {
    super({ title: 'Создать канал' });
    this.store = store;
    this.guildId = guildId;
  }

  renderBody(body) {
    const nameGroup = createElement('div', { className: 'form-group' });

    const label = createElement('label', {
      className: 'form-label',
      for: 'channel-name'
    }, 'Название канала');

    const input = createElement('input', {
      type: 'text',
      className: 'form-input',
      id: 'channel-name',
      name: 'name',
      placeholder: 'новый-канал',
      required: true
    });

    nameGroup.appendChild(label);
    nameGroup.appendChild(input);

    // Type select
    const typeGroup = createElement('div', { className: 'form-group' });

    const typeLabel = createElement('label', {
      className: 'form-label',
      for: 'channel-type'
    }, 'Тип канала');

    const typeSelect = createElement('select', {
      className: 'form-input',
      id: 'channel-type',
      name: 'type'
    });

    const textOption = createElement('option', { value: 'text' }, 'Текстовый');
    const voiceOption = createElement('option', { value: 'voice' }, 'Голосовой');

    typeSelect.appendChild(textOption);
    typeSelect.appendChild(voiceOption);

    typeGroup.appendChild(typeLabel);
    typeGroup.appendChild(typeSelect);

    body.appendChild(nameGroup);
    body.appendChild(typeGroup);

    setTimeout(() => input.focus(), 100);
  }

  renderFooter(footer) {
    const createBtn = createElement('button', {
      className: 'btn btn--primary'
    }, 'Создать');

    createBtn.addEventListener('click', () => {
      this.create();
    });

    const cancelBtn = createElement('button', {
      className: 'btn btn--secondary'
    }, 'Отмена');

    cancelBtn.addEventListener('click', () => {
      this.close();
    });

    footer.appendChild(cancelBtn);
    footer.appendChild(createBtn);
  }

  create() {
    const nameInput = this.modal.querySelector('#channel-name');
    const typeSelect = this.modal.querySelector('#channel-type');

    const name = nameInput.value.trim();
    const type = typeSelect.value;

    if (!name) {
      nameInput.focus();
      return;
    }

    import('../state/actions.js').then(({ createChannel }) => {
      const channel = createChannel(this.store, {
        guild_id: this.guildId,
        name,
        type,
        category: type === 'text' ? 'Текстовые каналы' : 'Голосовые каналы'
      });

      this.close();

      // Navigate to new channel
      window.location.hash = `/g/${this.guildId}/c/${channel.id}`;
    });
  }
}

