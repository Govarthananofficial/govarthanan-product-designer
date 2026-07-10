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
 * A resume-PDF click is not a visit and never inserts its own row — it just
 * flips "Resume Downloaded" to Yes on the row for that same visit, matched
 * by Visit ID.
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

var PALETTE = {
  headerBg: '#1a1a1a', headerFg: '#ffffff',
  rowA: '#ffffff', rowB: '#f6f7f9',
  border: '#e1e3e6',
  pendingBg: '#fff8e1', pendingFg: '#8a6d1a',
  doneBg: '#e2f4e8', doneFg: '#1e6b34',
  downloadBg: '#e4ecff', downloadFg: '#1d3f9e'
};

function fieldCol(key) {
  for (var i = 0; i < FIELDS.length; i++) {
    if (FIELDS[i].key === key) return i + 1;
  }
  throw new Error('Unknown field key: ' + key);
}

// Apps Script requires this exact function name to receive POSTs from the
// deployed Web App — the client only ever sends POST, never GET.
function doPost(e) {
  try {
    var payload = JSON.parse(e.postData.contents);
    var sheet = openTrackingTab();
    routePayload(sheet, payload);
    return jsonReply({ ok: true });
  } catch (err) {
    return jsonReply({ ok: false, error: String(err) });
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
  row.duration = '';
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
 * Manual re-run: reapplies header text/colors/widths/conditional formatting
 * to the EXISTING tab without touching a single row of data. Use this after
 * editing FIELDS/PALETTE above, or whenever the layout looks off.
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
  sheet.setFrozenColumns(1);

  sheet.getRange(1, 1, 1, total)
    .setFontWeight('bold')
    .setFontFamily('Google Sans')
    .setFontSize(10)
    .setBackground(PALETTE.headerBg)
    .setFontColor(PALETTE.headerFg)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  sheet.setRowHeight(1, 32);

  var bodyRows = 998;
  for (var c = 0; c < total; c++) {
    var field = FIELDS[c];
    var col = c + 1;
    sheet.setColumnWidth(col, field.width);
    if (field.hidden) sheet.hideColumns(col);
    if (field.align) sheet.getRange(2, col, bodyRows, 1).setHorizontalAlignment(field.align);
    if (field.format) sheet.getRange(2, col, bodyRows, 1).setNumberFormat(field.format);
  }

  sheet.getRange(2, 1, bodyRows, total)
    .setFontFamily('Google Sans')
    .setFontSize(10)
    .setVerticalAlignment('middle');

  var oldBandings = sheet.getBandings();
  for (var b = 0; b < oldBandings.length; b++) oldBandings[b].remove();
  var banding = sheet.getRange(1, 1, bodyRows + 1, total)
    .applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor(PALETTE.headerBg)
    .setFirstRowColor(PALETTE.rowA)
    .setSecondRowColor(PALETTE.rowB);

  sheet.getRange(1, 1, bodyRows + 1, total).setBorder(
    true, true, true, true, true, true, PALETTE.border, SpreadsheetApp.BorderStyle.SOLID
  );

  applyStatusColors(sheet);
  sheet.setTabColor(PALETTE.headerBg);
}

// Whole-row highlight, first matching rule wins, top to bottom:
//   1. Resume Downloaded = Yes  -> blue, no matter how the visit is going
//   2. Time on Site is filled   -> green, visit has a final known duration
//   3. otherwise                -> amber, visit is still in progress
function applyStatusColors(sheet) {
  var total = FIELDS.length;
  var rows = sheet.getMaxRows();
  var everyRow = sheet.getRange(2, 1, rows - 1, total);
  var colLetter = function (n) { return String.fromCharCode(64 + n); };
  var resumeCell = '$' + colLetter(fieldCol('resume')) + '2';
  var durationCell = '$' + colLetter(fieldCol('duration')) + '2';

  var downloadRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=' + resumeCell + '="Yes"')
    .setBackground(PALETTE.downloadBg).setFontColor(PALETTE.downloadFg).setBold(true)
    .setRanges([everyRow]).build();

  var doneRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=' + durationCell + '<>""')
    .setBackground(PALETTE.doneBg).setFontColor(PALETTE.doneFg)
    .setRanges([everyRow]).build();

  var pendingRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=' + durationCell + '=""')
    .setBackground(PALETTE.pendingBg).setFontColor(PALETTE.pendingFg)
    .setRanges([everyRow]).build();

  sheet.setConditionalFormatRules([downloadRule, doneRule, pendingRule]);
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

function flagResumeDownload(sheet, visitId) {
  var row = locateVisitRow(sheet, visitId);
  if (row === -1) return false;
  sheet.getRange(row, fieldCol('resume')).setValue('Yes');
  return true;
}
