/**
 * VISITOR TRACKING BACKEND — Google Apps Script Web App
 *
 * Entirely new build. Deploy this into a BRAND NEW Google Sheet — do not
 * paste it into the old analytics sheet, and do not carry over any old
 * tab/data. This script creates its own tab from scratch the first time it
 * receives a request.
 *
 * SETUP
 *   1. Create a brand new Google Sheet.
 *   2. Extensions -> Apps Script.
 *   3. Delete every placeholder function already in the editor, then paste
 *      this entire file in.
 *   4. Deploy -> New deployment -> type "Web app".
 *        Execute as: Me
 *        Who has access: Anyone
 *   5. Deploy, approve the permission prompt, copy the URL ending in /exec.
 *   6. Put that URL into ANALYTICS_URL in visitor-analytics.js.
 *
 * To publish a future edit: paste the new code in, save, then
 * Deploy -> Manage deployments -> pencil icon -> Version "New version" ->
 * Deploy. Saving alone never updates the live endpoint.
 *
 * WHAT GETS RECORDED — ONE ROW PER VISIT, NOT PER PAGE LOAD
 * A visit is every page a person looks at in one browser tab. The client
 * (visitor-analytics.js) tells this backend which moment of that visit a
 * request represents via `payload.phase`:
 *   "start"    — the first page of a brand new visit. Inserts a new row.
 *   "continue" — every later page of the SAME visit. Moves the Exit Page
 *                forward, grows the page trail/count, and refreshes the
 *                Device/OS/Location cells with whatever resolved more
 *                precisely since the row was first written.
 *   "leave"    — the page is being closed/hidden. Fills in the final
 *                Time on Site for that visit's row.
 *   "refine"   — fires a moment after "start", once IP-location lookup and
 *                Client Hints device-model lookup resolve (both are
 *                asynchronous and are never ready in time for "start"
 *                itself). Patches Location/Device/OS on the existing row
 *                without touching Exit Page/page trail/count — this is what
 *                keeps single-page visits from being stuck showing
 *                "Unknown Location" forever.
 * A resume-PDF click is not a visit and never inserts its own row — it just
 * flips "Resume Downloaded" to Yes on the row for that same visit, matched
 * by Visit ID.
 *
 * Every request is processed under a script lock (see doPost) so two
 * requests for the same visit arriving close together can never race each
 * other and produce a duplicate row.
 *
 * LOCATION IS ONE PLAIN-TEXT BOX. NO LATITUDE. NO LONGITUDE. The client
 * resolves an area name (locality/city/region/country) from the visitor's
 * IP address through a chain of lookup services — see fetchAccurateLocation()
 * in visitor-analytics.js. This is as precise as location gets without
 * popping a GPS permission prompt, which most visitors would simply decline.
 *
 * If you change FIELDS below, existing rows keep their old shape — either
 * delete the tab and let the next visit rebuild it, or run
 * rebuildSheetFormatting() from the Apps Script editor to reapply the
 * current layout on top of the existing tab (never touches row data).
 */

var TAB_NAME = 'Visitors';

// Single source of truth for every column: order here is the order in the
// sheet. Add/remove/reorder a column by editing only this array.
var FIELDS = [
  { key: 'time',      label: 'Timestamp',           width: 155 },
  { key: 'place',     label: 'Location',            width: 230 },
  { key: 'resume',    label: 'Resume Downloaded',   width: 135, align: 'center' },
  { key: 'source',    label: 'Traffic Source',      width: 150 },
  { key: 'device',    label: 'Device',              width: 220 },
  { key: 'os',        label: 'OS Version',          width: 115 },
  { key: 'entry',     label: 'Entry Page',          width: 150 },
  { key: 'exit',      label: 'Exit Page',           width: 150 },
  { key: 'trail',     label: 'Page Path',           width: 260 },
  { key: 'pageCount', label: 'Pages Visited',       width: 105, align: 'center' },
  { key: 'duration',  label: 'Time on Site (s)',    width: 115, align: 'right', format: '0" s"' },
  { key: 'browser',   label: 'Browser',             width: 95 },
  { key: 'category',  label: 'Device Type',         width: 100, align: 'center' },
  { key: 'lang',      label: 'Language',            width: 85 },
  { key: 'screen',    label: 'Screen',              width: 135 },
  { key: 'visitId',   label: 'Visit ID',            width: 90, hidden: true }
];


function fieldCol(key) {
  for (var i = 0; i < FIELDS.length; i++) {
    if (FIELDS[i].key === key) return i + 1;
  }
  throw new Error('Unknown field key: ' + key);
}

// Apps Script requires this exact function name to receive POSTs from the
// deployed Web App — the client only ever sends POST, never GET.
//
// Wrapped in a script lock: without it, two requests for the same visit
// arriving close together (e.g. "start" and a near-instant "leave") can each
// read the sheet before the other has finished writing, both conclude the
// row doesn't exist yet, and both insert their own row for the same visit.
// The lock forces requests to be handled one at a time so that never happens.
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
  } catch (lockErr) {
    return jsonReply({ ok: false, error: 'Server busy, request dropped' });
  }
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = openTrackingTab();
    routePayload(sheet, payload);
    return jsonReply({ ok: true });
  } catch (err) {
    return jsonReply({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function jsonReply(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function routePayload(sheet, payload) {
  if (payload.event === 'download') {
    if (flagResumeDownload(sheet, payload.visitId)) return;
    // No row exists yet for this visit (rare — e.g. tab reopened mid-visit
    // after the sheet was cleared). Record it anyway rather than dropping it.
    var row = rowFromPayload(payload);
    row.resume = 'Yes';
    insertRow(sheet, row);
    return;
  }

  if (payload.phase === 'leave') {
    if (!closeOutVisit(sheet, payload)) insertRow(sheet, rowFromPayload(payload));
    return;
  }

  if (payload.phase === 'continue') {
    if (!extendVisit(sheet, payload)) insertRow(sheet, rowFromPayload(payload));
    return;
  }

  if (payload.phase === 'refine') {
    // Silently drop if the row isn't there yet — "refine" is a best-effort
    // accuracy patch, never worth inserting a partial row over.
    refineVisit(sheet, payload);
    return;
  }

  // payload.phase === 'start': first page of a brand new visit.
  insertRow(sheet, rowFromPayload(payload));
}

function rowFromPayload(payload) {
  var exit = payload.exit || payload.page;
  var row = {};
  row.time = payload.time;
  row.place = payload.place || '';
  row.resume = 'No';
  row.source = payload.source || 'Direct / None';
  row.device = payload.device || '';
  row.os = payload.os || '';
  row.entry = payload.entry || exit;
  row.exit = exit;
  row.trail = payload.trail || exit;
  row.pageCount = payload.pageCount || 1;
  row.duration = (payload.duration !== undefined) ? payload.duration : '';
  row.browser = payload.browser || '';
  row.category = payload.category || '';
  row.lang = payload.lang || '';
  row.screen = payload.screen || '';
  row.visitId = payload.visitId || '';
  return row;
}

function openTrackingTab() {
  var book = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = book.getSheetByName(TAB_NAME);
  if (sheet) return sheet;
  sheet = book.insertSheet(TAB_NAME);
  applyFormatting(sheet);
  return sheet;
}

/**
 * Manual re-run: reapplies header text/widths/alignment to the EXISTING tab
 * without touching a single row of data. Use this after editing FIELDS
 * above, or whenever the layout looks off.
 * Run it from the Apps Script editor: pick "rebuildSheetFormatting" from the
 * function dropdown next to Run, then click Run and approve if prompted.
 */
function rebuildSheetFormatting() {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(TAB_NAME);
  if (!sheet) {
    Logger.log('No "' + TAB_NAME + '" tab yet — nothing to format.');
    return;
  }
  applyFormatting(sheet);
  Logger.log('Formatting reapplied to "' + TAB_NAME + '".');
}

function applyFormatting(sheet) {
  var total = FIELDS.length;

  var firstCellIsHeader = sheet.getLastRow() > 0 && sheet.getRange(1, 1).getValue() === FIELDS[0].label;
  if (!firstCellIsHeader && sheet.getLastRow() > 0) sheet.insertRowBefore(1);

  var labels = [];
  for (var i = 0; i < total; i++) labels.push(FIELDS[i].label);
  sheet.getRange(1, 1, 1, total).setValues([labels]);
  sheet.setFrozenRows(1);
  sheet.setFrozenColumns(0);

  sheet.getRange(1, 1, 1, total)
    .setFontWeight('bold')
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');

  var bodyRows = 998;
  for (var c = 0; c < total; c++) {
    var field = FIELDS[c];
    var col = c + 1;
    sheet.setColumnWidth(col, field.width);
    if (field.hidden) sheet.hideColumns(col);
    if (field.align) sheet.getRange(2, col, bodyRows, 1).setHorizontalAlignment(field.align);
    if (field.format) sheet.getRange(2, col, bodyRows, 1).setNumberFormat(field.format);
  }

  sheet.getRange(2, 1, bodyRows, total).setVerticalAlignment('middle');

  // Plain default Sheets look: no fill colors, no row banding, no
  // conditional-format highlighting, no custom border grid (Sheets' own
  // default gridlines already separate cells — drawing another border on
  // top of them was what made every line look doubled).
  var oldBandings = sheet.getBandings();
  for (var b = 0; b < oldBandings.length; b++) oldBandings[b].remove();
  sheet.getRange(1, 1, bodyRows + 1, total).setBackground(null);
  sheet.getRange(1, 1, bodyRows + 1, total).setBorder(false, false, false, false, false, false);
  sheet.setConditionalFormatRules([]);
  sheet.setTabColor(null);
}

function insertRow(sheet, row) {
  var values = [];
  for (var i = 0; i < FIELDS.length; i++) values.push(row[FIELDS[i].key]);
  sheet.appendRow(values);
}

function locateVisitRow(sheet, visitId) {
  if (!visitId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var idCol = fieldCol('visitId');
  var ids = sheet.getRange(2, idCol, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) { // newest-first: cheaper for recent visits
    if (ids[i][0] === visitId) return i + 2;
  }
  return -1;
}

// Every page after the first one in a visit: push Exit Page forward, grow
// the page trail/count, and refresh Device/OS/Location with anything more
// accurate than what the first page had (client hints and IP lookups can
// both resolve a beat after the very first page paints).
function extendVisit(sheet, payload) {
  var row = locateVisitRow(sheet, payload.visitId);
  if (row === -1) return false;
  sheet.getRange(row, fieldCol('exit')).setValue(payload.exit);
  sheet.getRange(row, fieldCol('pageCount')).setValue(payload.pageCount || '');
  sheet.getRange(row, fieldCol('trail')).setValue(payload.trail || '');
  if (payload.device) sheet.getRange(row, fieldCol('device')).setValue(payload.device);
  if (payload.os) sheet.getRange(row, fieldCol('os')).setValue(payload.os);
  if (payload.place) sheet.getRange(row, fieldCol('place')).setValue(payload.place);
  return true;
}

function closeOutVisit(sheet, payload) {
  var row = locateVisitRow(sheet, payload.visitId);
  if (row === -1) return false;
  sheet.getRange(row, fieldCol('duration')).setValue(payload.duration);
  return true;
}

// Patches Location/Device/OS only — never touches Exit Page, page trail, or
// page count, since a "refine" isn't a new page, just a late-arriving,
// more-accurate answer for fields that started as async placeholders.
function refineVisit(sheet, payload) {
  var row = locateVisitRow(sheet, payload.visitId);
  if (row === -1) return false;
  if (payload.place) sheet.getRange(row, fieldCol('place')).setValue(payload.place);
  if (payload.device) sheet.getRange(row, fieldCol('device')).setValue(payload.device);
  if (payload.os) sheet.getRange(row, fieldCol('os')).setValue(payload.os);
  return true;
}

function flagResumeDownload(sheet, visitId) {
  var row = locateVisitRow(sheet, visitId);
  if (row === -1) return false;
  sheet.getRange(row, fieldCol('resume')).setValue('Yes');
  return true;
}
