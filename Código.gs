
const SETTINGS = {
  ROOT_FOLDER_ID: '17AciB3rmDipWohuiATIHObtBf5UYebON',
  WORKOUT_SPREADSHEET_PROPERTY: 'WORKOUT_SPREADSHEET_ID',
  INVITE_CODE_PROPERTY: 'INVITE_CODE',
  CATALOG_CACHE_KEY: 'training-gifs-catalog-v2',
  CACHE_SECONDS: 21600,
};

const WORKOUT_SHEET = {
  NAME: 'Ficha semanal',
  HEADERS: ['Dia', 'Foco', 'Ordem', 'Exercício', 'Grupo', 'Séries', 'Repetições', 'Carga', 'Descanso', 'Observações', 'ID do GIF'],
  FOCUSES: ['Superior A', 'Inferior A', 'Quarta', 'Superior B', 'Inferior B', 'Sábado'],
  DAY_COUNT: 6, // segunda a sábado
};

/** Serves the training GIF catalogue. */
function doGet() {
  return HtmlService.createTemplateFromFile('Index')
    .evaluate()
    .setTitle('Biblioteca de Treinos')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Validate access to the Drive folder that contains the downloaded GIFs.
 */
function setRootFolderId() {
  DriveApp.getFolderById(SETTINGS.ROOT_FOLDER_ID); // validates access
  refreshCatalog();
}

/**
 * Run once to create and connect a spreadsheet used to save the weekly plan.
 * The returned URL can be shared with the trainer if needed.
 */
function createWorkoutSpreadsheet() {
  const spreadsheet = SpreadsheetApp.create('Ficha semanal de treino');
  PropertiesService.getScriptProperties().setProperty(
    SETTINGS.WORKOUT_SPREADSHEET_PROPERTY,
    spreadsheet.getId(),
  );
  getWorkoutSheet_(spreadsheet).getRange(1, 1, 1, WORKOUT_SHEET.HEADERS.length)
    .setValues([WORKOUT_SHEET.HEADERS]);
  return spreadsheet.getUrl();
}

/** Run once instead of createWorkoutSpreadsheet() to use an existing Sheet. */
function setWorkoutSpreadsheetId() {
  const spreadsheetId = 'COLE_AQUI_O_ID_DA_PLANILHA';
  if (!spreadsheetId || spreadsheetId.indexOf('COLE_AQUI') !== -1) {
    throw new Error('Edite setWorkoutSpreadsheetId() e informe o ID da planilha.');
  }
  SpreadsheetApp.openById(spreadsheetId); // validates access before saving
  PropertiesService.getScriptProperties().setProperty(
    SETTINGS.WORKOUT_SPREADSHEET_PROPERTY,
    spreadsheetId,
  );
  getWorkoutSheet_().getRange(1, 1, 1, WORKOUT_SHEET.HEADERS.length)
    .setValues([WORKOUT_SHEET.HEADERS]);
}

/** Returns the previously saved workout plan, if a spreadsheet is configured. */
function getWorkoutPlan() {
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(SETTINGS.WORKOUT_SPREADSHEET_PROPERTY);
  if (!spreadsheetId) return { configured: false, plan: [] };

  const sheet = getWorkoutSheet_();
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return { configured: true, plan: [] };
  const rows = sheet.getRange(2, 1, lastRow - 1, WORKOUT_SHEET.HEADERS.length).getValues();
  const plan = Array.from({ length: WORKOUT_SHEET.DAY_COUNT }, () => []);
  rows.forEach((row) => {
    const day = Number(row[0]) - 1;
    if (day < 0 || day >= WORKOUT_SHEET.DAY_COUNT) return;
    plan[day].push({
      exerciseId: String(row[10] || ''),
      exerciseName: String(row[3] || ''),
      exerciseGroup: String(row[4] || ''),
      sets: String(row[5] || ''),
      reps: String(row[6] || ''),
      load: String(row[7] || ''),
      rest: String(row[8] || ''),
      notes: String(row[9] || ''),
      order: Number(row[2]) || 0,
    });
  });
  plan.forEach((day) => day.sort((a, b) => a.order - b.order));
  return { configured: true, plan: plan };
}

/** Saves all days at once, keeping the Sheet readable as a normal table. */
function saveWorkoutPlan(plan) {
  if (!Array.isArray(plan) || !plan.length || plan.length > WORKOUT_SHEET.DAY_COUNT) {
    throw new Error('A ficha semanal recebida é inválida.');
  }
  const spreadsheetId = PropertiesService.getScriptProperties()
    .getProperty(SETTINGS.WORKOUT_SPREADSHEET_PROPERTY);
  if (!spreadsheetId) {
    throw new Error('Planilha não configurada. Execute createWorkoutSpreadsheet() uma vez.');
  }
  const rows = [];
  plan.forEach((day, dayIndex) => {
    if (!Array.isArray(day)) return;
    day.forEach((item, order) => {
      const exercise = item.exercise || {};
      rows.push([
        dayIndex + 1, WORKOUT_SHEET.FOCUSES[dayIndex], order + 1, exercise.name || '', exercise.group || '',
        item.sets || '', item.reps || '', item.load || '', item.rest || '',
        item.notes || '', exercise.id || '',
      ]);
    });
  });
  const sheet = getWorkoutSheet_();
  sheet.clearContents();
  sheet.getRange(1, 1, 1, WORKOUT_SHEET.HEADERS.length).setValues([WORKOUT_SHEET.HEADERS]);
  if (rows.length) sheet.getRange(2, 1, rows.length, WORKOUT_SHEET.HEADERS.length).setValues(rows);
  sheet.setFrozenRows(1);
  sheet.autoResizeColumns(1, WORKOUT_SHEET.HEADERS.length);
  return { savedAt: new Date().toISOString() };
}

function getWorkoutSheet_(spreadsheet) {
  const book = spreadsheet || SpreadsheetApp.openById(
    PropertiesService.getScriptProperties().getProperty(SETTINGS.WORKOUT_SPREADSHEET_PROPERTY),
  );
  return book.getSheetByName(WORKOUT_SHEET.NAME) || book.insertSheet(WORKOUT_SHEET.NAME);
}

// Multi-user workout storage. The original "Ficha semanal" tab is kept for
// backwards compatibility; new authenticated workouts use these three tabs.
const APP_SHEETS = {
  USERS: { name: 'Usuários', headers: ['ID do usuário', 'E-mail', 'Nome', 'Papel', 'Hash da senha', 'Salt', 'Criado em', 'Último acesso'] },
  WORKOUTS: { name: 'Treinos', headers: ['ID do treino', 'ID do usuário', 'Nome', 'Status', 'Criado em', 'Atualizado em', 'Descrições dos dias'] },
  EXERCISES: { name: 'Exercícios', headers: ['ID do treino', 'Dia', 'Foco', 'Ordem', 'Exercício', 'Grupo', 'Séries', 'Repetições', 'Carga', 'Descanso', 'Observações', 'ID do GIF', 'Atualizado em'] },
};

function getMyWorkouts(sessionToken) {
  const user = requireUser_(sessionToken);
  const sheet = appSheet_(APP_SHEETS.WORKOUTS);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const workouts = values.filter((row) => String(row[1]) === user.id && row[3] !== 'Arquivado')
    .map((row) => ({ id: String(row[0]), name: String(row[2]), updatedAt: String(row[5] || '') }));
  // The first workout's plan comes along so the page needs a single round trip.
  return { user: user, workouts: workouts, current: workouts.length ? loadWorkoutPlan_(workouts[0].id) : null };
}

function createMyWorkout(sessionToken, name) {
  const user = requireUser_(sessionToken);
  const title = String(name || 'Treino semanal').trim().slice(0, 80) || 'Treino semanal';
  const id = Utilities.getUuid();
  const now = new Date();
  appSheet_(APP_SHEETS.WORKOUTS).appendRow([id, user.id, title, 'Ativo', now, now]);
  return { id: id, name: title };
}

function getMyWorkoutPlan(sessionToken, workoutId) {
  const user = requireUser_(sessionToken);
  assertWorkoutOwner_(user.id, workoutId);
  return loadWorkoutPlan_(workoutId);
}

function loadWorkoutPlan_(workoutId) {
  const sheet = appSheet_(APP_SHEETS.EXERCISES);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues();
  const plan = Array.from({ length: WORKOUT_SHEET.DAY_COUNT }, () => []);
  values.filter((row) => String(row[0]) === String(workoutId)).forEach((row) => {
    const day = Number(row[1]) - 1;
    if (day < 0 || day >= WORKOUT_SHEET.DAY_COUNT) return;
    plan[day].push({ exerciseId: String(row[11] || ''), sets: String(row[6] || ''), reps: String(row[7] || ''), load: String(row[8] || ''), rest: String(row[9] || ''), notes: String(row[10] || ''), order: Number(row[3]) || 0 });
  });
  plan.forEach((day) => day.sort((a, b) => a.order - b.order));
  return { plan: plan, descriptions: getWorkoutDescriptions_(workoutId) };
}

function saveMyWorkoutPlan(sessionToken, workoutId, plan, descriptions) {
  const user = requireUser_(sessionToken);
  if (!Array.isArray(plan) || !plan.length || plan.length > WORKOUT_SHEET.DAY_COUNT) throw new Error('A ficha semanal recebida é inválida.');
  assertWorkoutOwner_(user.id, workoutId);
  const dayDescriptions = cleanDescriptions_(descriptions);
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const sheet = appSheet_(APP_SHEETS.EXERCISES);
    const existing = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 13).getValues()
      .filter((row) => String(row[0]) !== String(workoutId));
    const now = new Date();
    plan.forEach((day, dayIndex) => {
      if (!Array.isArray(day)) return;
      day.forEach((item, order) => {
        const exercise = item.exercise || {};
        existing.push([workoutId, dayIndex + 1, dayDescriptions ? dayDescriptions[dayIndex] : WORKOUT_SHEET.FOCUSES[dayIndex], order + 1, exercise.name || '', exercise.group || '', item.sets || '', item.reps || '', item.load || '', item.rest || '', item.notes || '', exercise.id || '', now]);
      });
    });
    sheet.clearContents();
    sheet.getRange(1, 1, 1, APP_SHEETS.EXERCISES.headers.length).setValues([APP_SHEETS.EXERCISES.headers]);
    if (existing.length) sheet.getRange(2, 1, existing.length, APP_SHEETS.EXERCISES.headers.length).setValues(existing);
    touchWorkout_(workoutId, now, dayDescriptions);
  } finally { lock.releaseLock(); }
  return { savedAt: new Date().toISOString() };
}

/** Archives the workout: it disappears from the site but stays in the Sheet. */
function deleteMyWorkout(sessionToken, workoutId) {
  const user = requireUser_(sessionToken);
  assertWorkoutOwner_(user.id, workoutId);
  const sheet = appSheet_(APP_SHEETS.WORKOUTS);
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const index = values.findIndex((row) => String(row[0]) === String(workoutId));
  sheet.getRange(index + 2, 4, 1, 3).setValues([['Arquivado', values[index][4], new Date()]]);
  return { deleted: workoutId };
}

function registerUser(name, email, password, inviteCode) {
  const cleanName = String(name || '').trim().slice(0, 80);
  const cleanEmail = String(email || '').trim().toLowerCase();
  validateCredentials_(cleanName, cleanEmail, password);
  assertInviteCode_(inviteCode);
  const sheet = appSheet_(APP_SHEETS.USERS);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  if (values.some((row) => String(row[1]).toLowerCase() === cleanEmail)) throw new Error('Já existe uma conta com este e-mail.');
  const salt = Utilities.getUuid();
  const user = { id: Utilities.getUuid(), email: cleanEmail, name: cleanName };
  const now = new Date();
  sheet.appendRow([user.id, user.email, user.name, 'Aluno', hashPassword_(password, salt), salt, now, now]);
  return createSession_(user);
}

/** Generates a new invitation code. The old one stops working immediately. */
function generateInviteCode() {
  const code = Utilities.getUuid().replace(/-/g, '').slice(0, 10).toUpperCase();
  PropertiesService.getScriptProperties().setProperty(SETTINGS.INVITE_CODE_PROPERTY, code);
  Logger.log('Código de convite: ' + code);
  return code;
}

/** Shows the current invitation code in the execution log without replacing it. */
function showInviteCode() {
  const code = PropertiesService.getScriptProperties().getProperty(SETTINGS.INVITE_CODE_PROPERTY);
  if (!code) throw new Error('Nenhum código de convite foi configurado ainda.');
  Logger.log('Código de convite atual: ' + code);
  return code;
}

/** Set a chosen invitation code manually, if you prefer a memorable value. */
function setInviteCode() {
  const code = 'COLE_AQUI_O_CODIGO_DE_CONVITE';
  if (!code || code.indexOf('COLE_AQUI') !== -1) throw new Error('Edite setInviteCode() e informe o código de convite.');
  PropertiesService.getScriptProperties().setProperty(SETTINGS.INVITE_CODE_PROPERTY, String(code).trim().toUpperCase());
  Logger.log('Código de convite definido: ' + String(code).trim().toUpperCase());
}

function loginUser(email, password) {
  const cleanEmail = String(email || '').trim().toLowerCase();
  const sheet = appSheet_(APP_SHEETS.USERS);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 8).getValues();
  const index = values.findIndex((row) => String(row[1]).toLowerCase() === cleanEmail);
  if (index === -1 || hashPassword_(password, String(values[index][5])) !== String(values[index][4])) throw new Error('E-mail ou senha inválidos.');
  const row = values[index];
  const user = { id: String(row[0]), email: String(row[1]), name: String(row[2]) };
  sheet.getRange(index + 2, 8).setValue(new Date());
  return createSession_(user);
}

function requireUser_(sessionToken) {
  if (!sessionToken) throw new Error('Faça login para acessar seus treinos.');
  const stored = CacheService.getScriptCache().get('session-' + sessionToken);
  if (!stored) throw new Error('Sua sessão expirou. Entre novamente.');
  return JSON.parse(stored);
}

function createSession_(user) {
  const token = Utilities.getUuid() + Utilities.getUuid();
  CacheService.getScriptCache().put('session-' + token, JSON.stringify(user), 21600);
  return { sessionToken: token, user: user };
}

function hashPassword_(password, salt) {
  return Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(salt) + ':' + String(password), Utilities.Charset.UTF_8));
}

function validateCredentials_(name, email, password) {
  if (name.length < 2) throw new Error('Informe seu nome.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Informe um e-mail válido.');
  if (String(password || '').length < 6) throw new Error('A senha deve ter pelo menos 6 caracteres.');
}

function assertInviteCode_(inviteCode) {
  const expected = PropertiesService.getScriptProperties().getProperty(SETTINGS.INVITE_CODE_PROPERTY);
  if (!expected) throw new Error('Cadastros ainda não estão liberados. Configure um código de convite.');
  if (String(inviteCode || '').trim().toUpperCase() !== expected) throw new Error('Código de convite inválido.');
}

function assertWorkoutOwner_(userId, workoutId) {
  const sheet = appSheet_(APP_SHEETS.WORKOUTS);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  if (!values.some((row) => String(row[0]) === String(workoutId) && String(row[1]) === userId && row[3] !== 'Arquivado')) throw new Error('Treino não encontrado ou sem permissão de acesso.');
}

function touchWorkout_(workoutId, now, descriptions) {
  const sheet = appSheet_(APP_SHEETS.WORKOUTS);
  const values = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 6).getValues();
  const index = values.findIndex((row) => String(row[0]) === String(workoutId));
  if (index === -1) return;
  sheet.getRange(index + 2, 6).setValue(now);
  if (descriptions) {
    // Sheets created before this column existed need the header added too.
    sheet.getRange(1, 7).setValue(APP_SHEETS.WORKOUTS.headers[6]);
    sheet.getRange(index + 2, 7).setValue(JSON.stringify(descriptions));
  }
}

/** Returns the custom day descriptions, or null to use the defaults. */
function getWorkoutDescriptions_(workoutId) {
  const sheet = appSheet_(APP_SHEETS.WORKOUTS);
  if (sheet.getLastRow() < 2 || sheet.getLastColumn() < 7) return null;
  const values = sheet.getRange(2, 1, sheet.getLastRow() - 1, 7).getValues();
  const row = values.find((item) => String(item[0]) === String(workoutId));
  if (!row || !row[6]) return null;
  try { return cleanDescriptions_(JSON.parse(String(row[6]))); } catch (error) { return null; }
}

function cleanDescriptions_(descriptions) {
  // Older workouts were saved with five days; the missing ones start empty.
  if (!Array.isArray(descriptions) || !descriptions.length || descriptions.length > WORKOUT_SHEET.DAY_COUNT) return null;
  return Array.from({ length: WORKOUT_SHEET.DAY_COUNT }, (_, i) => String(descriptions[i] || '').trim().slice(0, 120));
}

function appSheet_(definition) {
  const book = SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty(SETTINGS.WORKOUT_SPREADSHEET_PROPERTY));
  const sheet = book.getSheetByName(definition.name) || book.insertSheet(definition.name);
  if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, definition.headers.length).setValues([definition.headers]);
  sheet.setFrozenRows(1);
  return sheet;
}

/** Called by the page. The result is cached, so Drive is not scanned per visit. */
function getCatalog() {
  const cache = CacheService.getScriptCache();
  const metadata = cache.get(SETTINGS.CATALOG_CACHE_KEY);
  if (metadata) {
    const { chunks } = JSON.parse(metadata);
    const keys = Array.from({ length: chunks }, (_, i) => SETTINGS.CATALOG_CACHE_KEY + '-' + i);
    const cached = cache.getAll(keys);
    if (Object.keys(cached).length === chunks) {
      return keys.flatMap((key) => JSON.parse(cached[key]));
    }
  }

  const catalog = buildCatalog_();
  putCatalogInCache_(catalog);
  return catalog;
}

/** Run manually whenever files are added or removed from Drive. */
function refreshCatalog() {
  const cache = CacheService.getScriptCache();
  const metadata = cache.get(SETTINGS.CATALOG_CACHE_KEY);
  const chunks = metadata ? JSON.parse(metadata).chunks : 0;
  cache.removeAll([SETTINGS.CATALOG_CACHE_KEY].concat(
    Array.from({ length: chunks }, (_, i) => SETTINGS.CATALOG_CACHE_KEY + '-' + i),
  ));
  return getCatalog().length;
}

// CacheService limits one value to 100 KB. Split this catalogue to keep it
// reliable even as more exercises are added.
function putCatalogInCache_(catalog) {
  const pieces = [];
  let piece = [];
  let size = 2;
  catalog.forEach((item) => {
    const itemSize = JSON.stringify(item).length + 1;
    if (piece.length && size + itemSize > 90000) {
      pieces.push(piece);
      piece = [];
      size = 2;
    }
    piece.push(item);
    size += itemSize;
  });
  if (piece.length) pieces.push(piece);

  const values = {};
  pieces.forEach((items, index) => { values[SETTINGS.CATALOG_CACHE_KEY + '-' + index] = JSON.stringify(items); });
  const cache = CacheService.getScriptCache();
  if (Object.keys(values).length) cache.putAll(values, SETTINGS.CACHE_SECONDS);
  cache.put(SETTINGS.CATALOG_CACHE_KEY, JSON.stringify({ chunks: pieces.length }), SETTINGS.CACHE_SECONDS);
}

function buildCatalog_() {
  const result = [];
  walkFolder_(DriveApp.getFolderById(SETTINGS.ROOT_FOLDER_ID), [], result);
  return result.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
}

function walkFolder_(folder, path, result) {
  const currentPath = path.concat(folder.getName());
  const files = folder.getFiles();
  while (files.hasNext()) {
    const file = files.next();
    if (file.getMimeType() !== MimeType.GIF && !/\.gif$/i.test(file.getName())) continue;

    result.push({
      id: file.getId(),
      name: file.getName().replace(/\s*\(\d+\)(?=\.gif$)/i, '').replace(/\.gif$/i, ''),
      group: currentPath[1] || currentPath[0],
      folder: currentPath.slice(1).join(' / ') || currentPath[0],
      // Generated by Drive for the original binary file; works better in <img>
      // than the legacy /uc?export=view address.
      gifUrl: file.getDownloadUrl(),
      previewUrl: file.getUrl(),
      // Static fallback if a browser or Workspace policy blocks direct GIF files.
      thumbnailUrl: 'https://drive.google.com/thumbnail?id=' + file.getId() + '&sz=w1000',
    });
  }

  const folders = folder.getFolders();
  while (folders.hasNext()) walkFolder_(folders.next(), currentPath, result);
}
