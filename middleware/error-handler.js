/**
 * Обработчик ошибок
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Ошибка:', err);

  // Ошибки валидации
  if (err.name === 'ValidationError') {
    return res.status(400).json({
      error: 'Ошибка валидации',
      details: err.message
    });
  }

  // Ошибки JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'Недействительный токен'
    });
  }

  // Ошибки базы данных
  if (err.code === 'SQLITE_CONSTRAINT') {
    return res.status(400).json({
      error: 'Нарушение ограничения базы данных',
      details: err.message
    });
  }

  // Общая ошибка сервера
  res.status(err.status || 500).json({
    error: err.message || 'Внутренняя ошибка сервера',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Обработка 404
 */
export const notFound = (req, res, next) => {
  res.status(404).json({
    error: 'Маршрут не найден',
    path: req.path
  });
};

