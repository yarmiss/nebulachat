/**
 * Валидация email
 */
export const isValidEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
};

/**
 * Валидация username
 */
export const isValidUsername = (username) => {
  // 2-32 символа, буквы, цифры, подчеркивания, дефисы
  const usernameRegex = /^[a-zA-Z0-9_-]{2,32}$/;
  return usernameRegex.test(username);
};

/**
 * Валидация пароля
 */
export const isValidPassword = (password) => {
  // Минимум 8 символов, хотя бы одна буква и одна цифра
  return password.length >= 8 && /[a-zA-Z]/.test(password) && /[0-9]/.test(password);
};

/**
 * Санитизация HTML для предотвращения XSS
 */
export const sanitizeHtml = (html) => {
  const div = document.createElement('div');
  div.textContent = html;
  return div.innerHTML;
};

/**
 * Валидация данных регистрации
 */
export const validateRegister = (username, email, password) => {
  const errors = [];

  if (!username || !isValidUsername(username)) {
    errors.push('Имя пользователя должно быть от 2 до 32 символов и содержать только буквы, цифры, подчеркивания и дефисы');
  }

  if (!email || !isValidEmail(email)) {
    errors.push('Неверный формат email');
  }

  if (!password || !isValidPassword(password)) {
    errors.push('Пароль должен быть минимум 8 символов и содержать буквы и цифры');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

/**
 * Валидация данных входа
 */
export const validateLogin = (email, password) => {
  const errors = [];

  if (!email || !isValidEmail(email)) {
    errors.push('Неверный формат email');
  }

  if (!password || password.length < 1) {
    errors.push('Пароль обязателен');
  }

  return {
    isValid: errors.length === 0,
    errors
  };
};

