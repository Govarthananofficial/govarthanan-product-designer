/**
 * Portfolio Visitor Analytics — Google Apps Script Web App backend.
 *
 * This file is NOT executed by the website directly — it runs on Google's
 * servers. To activate it:
 *
 *   1. Create a new Google Sheet (e.g. "Portfolio Visitor Analytics").
 *   2. Extensions -> Apps Script.
 *   3. Delete the placeholder code and paste this entire file in.
 *   4. Deploy -> New deployment -> select type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Click Deploy, authorize when prompted, and copy the Web App URL
 *      (ends in /exec).
 *   6. Paste that URL into ANALYTICS_URL near the top of visitor-analytics.js.
 *
 * To ship a code change after the first deploy: paste the new code in,
 * save, then Deploy -> Manage deployments -> pencil icon -> Version:
 * "New version" -> Deploy. Saving alone does NOT publish it.
 *
 * If the columns below ever change (like this update did), the sheet won't
 * auto-migrate old rows — either delete the "Visitor Log" tab and let the
 * next event rebuild it (only works if you have another tab too; Sheets
 * won't delete your last remaining tab), or just run reformatVisitorLog()
 * manually (see below) to reapply the current layout to the existing tab.
 *
 * Everything lands in ONE tab, "Visitor Log": dark header, banded rows,
 * auto-fit columns, color-coded events, hidden Session ID column.
 *
 * ONE ROW PER VISIT: the "enter" event (fires the instant a page loads)
 * appends a new row. The "exit" event (fires when that same visit ends)
 * finds that row again — matched by the hidden Session ID column, a random
 * per-page-load ID the client generates and never stores — and fills in
 * Time on Page, plus backfills Device/OS/Location/Maps Link with whatever
 * resolved more accurately by then, rather than adding a second row.
 *
 * Resume downloads get their own row (Event = "Resume Download") since
 * they're a single instant, not a start/end pair.
 *
 * "Which page is most visited" isn't computed here — it's a one-line
 * PivotTable (rows: Page, values: COUNTA, filter: Event = "Page Visit"),
 * or a COUNTIFS formula.
 */

var SHEET_NAME = 'Visitor Log';
var HEADERS = [
  'Timestamp', 'Event', 'Page', 'Time on Page (s)', 'Device', 'OS Version',
  'Browser', 'Device Type', 'Location', 'Maps Link', 'Latitude', 'Longitude',
  'Language', 'Screen', 'Referrer', 'Session ID'
];
var COL = {
  timestamp: 1, event: 2, page: 3, timeOnPage: 4, device: 5, osVersion: 6,
  browser: 7, deviceType: 8, location: 9, mapsLink: 10, latitude: 11,
  longitude: 12, language: 13, screen: 14, referrer: 15, sessionId: 16
};

var COLOR = {
  header: '#1a1a1a',
  headerText: '#ffffff',
  bandFirst: '#ffffff',
  bandSecond: '#f6f7f9',
  inProgressBg: '#fff8e1', inProgressText: '#8a6d1a',
  completeBg: '#e2f4e8', completeText: '#1e6b34',
  downloadBg: '#e4ecff', downloadText: '#1d3f9e',
  gridBorder: '#e1e3e6'
};

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var sheet = getOrCreateSheet();

    if (data.type === 'resume_download') {
      appendVisitorRow(sheet, rowFromPayload(data, 'Resume Download', ''));
    } else if (data.stage === 'exit') {
      var updated = completeVisitRow(sheet, data);
      if (!updated) {
        // No matching "enter" row found (e.g. the sheet was cleared mid-visit)
        // — still record it rather than silently dropping the data.
        appendVisitorRow(sheet, rowFromPayload(data, 'Page Visit', data.timeOnPageSeconds));
      }
    } else {
      appendVisitorRow(sheet, rowFromPayload(data, 'Page Visit', ''));
    }

    return ContentService
      .createTextOutput(JSON.stringify({ ok: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService
      .createTextOutput(JSON.stringify({ ok: false, error: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// Coordinates arrive from the client as strings (JSON has no way to know
// they're meant as numbers); convert here so the sheet stores real numbers,
// not numeric-looking text — matters for sorting, filtering, and any
// formula or map chart built on these columns later.
function toNumberOrBlank(v) {
  if (v === '' || v == null) return '';
  var n = parseFloat(v);
  return isNaN(n) ? '' : n;
}

function rowFromPayload(data, event, timeOnPage) {
  return {
    timestamp: data.timestamp, event: event, page: data.page, timeOnPage: timeOnPage,
    device: data.device, osVersion: data.osVersion, browser: data.browser,
    deviceType: data.deviceType, location: data.location, mapsLink: data.mapsLink || '',
    latitude: toNumberOrBlank(data.latitude), longitude: toNumberOrBlank(data.longitude),
    language: data.language || '', screen: data.screenRes || '',
    referrer: data.referrer, sessionId: data.sessionId || ''
  };
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (sheet) return sheet;

  sheet = ss.insertSheet(SHEET_NAME);
  buildLayout(sheet);
  return sheet;
}

/**
 * Run this manually to (re)apply the header/banding/colors/column-width
 * styling to an EXISTING "Visitor Log" tab, without deleting and recreating
 * it — useful right after upgrading this script, or if Sheets won't let you
 * delete the tab because it's the only one left in the file.
 *
 * How to run it: in this editor, click the function dropdown at the top
 * (next to the Run/Debug buttons), select "reformatVisitorLog", then click
 * Run (▶). Approve the permission prompt if it appears. Safe to run more
 * than once; it only rewrites formatting, never touches your row data.
 */
function reformatVisitorLog() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    Logger.log('No "Visitor Log" tab found yet — nothing to reformat.');
    return;
  }
  buildLayout(sheet);
  Logger.log('Reformatted "Visitor Log" — check the sheet.');
}

function buildLayout(sheet) {
  var lastCol = HEADERS.length;

  sheet.getRange(1, 1, 1, lastCol).setValues([HEADERS]);
  sheet.setFrozenRows(1);
  // ── Header: dark bar, white bold text, comfortable height ──
  sheet.getRange(1, 1, 1, lastCol)
    .setFontWeight('bold')
    .setFontFamily('Google Sans')
    .setFontSize(10)
    .setBackground(COLOR.header)
    .setFontColor(COLOR.headerText)
    .setVerticalAlignment('middle')
    .setHorizontalAlignment('left');
  sheet.setRowHeight(1, 32);

  // ── Column widths tuned per field ──
  sheet.setColumnWidth(COL.timestamp, 150);
  sheet.setColumnWidth(COL.event, 130);
  sheet.setColumnWidth(COL.page, 150);
  sheet.setColumnWidth(COL.timeOnPage, 110);
  sheet.setColumnWidth(COL.device, 270);
  sheet.setColumnWidth(COL.osVersion, 110);
  sheet.setColumnWidth(COL.browser, 90);
  sheet.setColumnWidth(COL.deviceType, 95);
  sheet.setColumnWidth(COL.location, 190);
  sheet.setColumnWidth(COL.mapsLink, 130);
  sheet.setColumnWidth(COL.latitude, 90);
  sheet.setColumnWidth(COL.longitude, 90);
  sheet.setColumnWidth(COL.language, 80);
  sheet.setColumnWidth(COL.screen, 130);
  sheet.setColumnWidth(COL.referrer, 140);
  sheet.hideColumns(COL.sessionId); // correlation key only, not for reading

  // ── Body: base font, banded rows, gridlines, sane alignment ──
  var bodyRange = sheet.getRange(2, 1, 998, lastCol);
  bodyRange.setFontFamily('Google Sans').setFontSize(10).setVerticalAlignment('middle');
  sheet.getRange(2, COL.timeOnPage, 998, 1).setHorizontalAlignment('right').setNumberFormat('0" s"');
  sheet.getRange(2, COL.deviceType, 998, 1).setHorizontalAlignment('center');
  sheet.getRange(2, COL.latitude, 998, 2).setHorizontalAlignment('right').setNumberFormat('0.0000');

  var existingBandings = sheet.getBandings();
  for (var b = 0; b < existingBandings.length; b++) existingBandings[b].remove();
  var banding = sheet.getRange(1, 1, 999, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor(COLOR.header)
    .setFirstRowColor(COLOR.bandFirst)
    .setSecondRowColor(COLOR.bandSecond);

  sheet.getRange(1, 1, 999, lastCol).setBorder(
    true, true, true, true, true, true, COLOR.gridBorder, SpreadsheetApp.BorderStyle.SOLID
  );

  // ── Event column: color-coded at a glance ──
  var eventCol = sheet.getRange(2, COL.event, 998, 1);
  var rules = [
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Resume Download')
      .setBackground(COLOR.downloadBg).setFontColor(COLOR.downloadText).setBold(true)
      .setRanges([eventCol]).build(),
    SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo('Page Visit')
      .setBackground(COLOR.inProgressBg).setFontColor(COLOR.inProgressText)
      .setRanges([eventCol]).build()
  ];
  sheet.setConditionalFormatRules(rules);

  sheet.setTabColor(COLOR.header);
}

function appendVisitorRow(sheet, r) {
  sheet.appendRow([
    r.timestamp, r.event, r.page, r.timeOnPage, r.device, r.osVersion, r.browser,
    r.deviceType, r.location, r.mapsLink, r.latitude, r.longitude, r.language,
    r.screen, r.referrer, r.sessionId
  ]);
  var row = sheet.getLastRow();
  linkifyMapsCell(sheet, row, r.mapsLink);
  markCompletion(sheet, row, r.event, r.timeOnPage);
}

// Fires when a visit ends: fills in Time on Page, and backfills Device,
// OS Version, Location, and Maps Link with whatever the client resolved by
// then — device model (Client Hints) and location (IP lookup) can both
// improve after page-load, so the completed row ends up more accurate than
// the "enter" row was able to be.
function completeVisitRow(sheet, data) {
  if (!data.sessionId) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, COL.sessionId, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) { // search newest-first, cheaper for recent visits
    if (ids[i][0] === data.sessionId) {
      var row = i + 2;
      sheet.getRange(row, COL.timeOnPage).setValue(data.timeOnPageSeconds);
      if (data.device) sheet.getRange(row, COL.device).setValue(data.device);
      if (data.osVersion) sheet.getRange(row, COL.osVersion).setValue(data.osVersion);
      if (data.location) sheet.getRange(row, COL.location).setValue(data.location);
      if (data.latitude) sheet.getRange(row, COL.latitude).setValue(toNumberOrBlank(data.latitude));
      if (data.longitude) sheet.getRange(row, COL.longitude).setValue(toNumberOrBlank(data.longitude));
      if (data.mapsLink) linkifyMapsCell(sheet, row, data.mapsLink);
      markCompletion(sheet, row, 'Page Visit', data.timeOnPageSeconds);
      return true;
    }
  }
  return false;
}

function linkifyMapsCell(sheet, row, url) {
  if (!url) return;
  sheet.getRange(row, COL.mapsLink).setFormula('=HYPERLINK("' + url + '", "Open in Maps")');
}

// A completed visit (Time on Page filled in) gets a distinct green tint on
// its Event cell, overriding the conditional "in progress" amber for that
// one row. Resume downloads keep their conditional blue automatically.
function markCompletion(sheet, row, event, timeOnPage) {
  if (event === 'Page Visit' && timeOnPage !== '' && timeOnPage != null) {
    sheet.getRange(row, COL.event).setBackground(COLOR.completeBg).setFontColor(COLOR.completeText).setFontWeight('bold');
  }
}
