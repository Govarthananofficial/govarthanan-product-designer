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
 * If you're upgrading an existing "Visitor Log" tab that was created by an
 * older version of this script, delete that tab once — the next event will
 * recreate it fresh with the current layout and formatting below.
 *
 * Everything lands in ONE tab, "Visitor Log", built and formatted
 * automatically on first write — banded rows, a dark header, right-aligned
 * numbers, auto-fit columns. No manual sheet setup needed.
 *
 * ONE ROW PER VISIT: the "enter" event (fires the instant a page loads)
 * appends a new row. The "exit" event (fires when that same visit ends)
 * finds that row again — matched by the hidden Session ID column, a random
 * per-page-load ID the client generates and never stores — and fills in
 * Time on Page on it, rather than adding a second row. A visit still in
 * progress simply shows a blank Time on Page until it completes, then the
 * row tints green.
 *
 * Resume downloads get their own row (Event = "Resume Download", tinted
 * blue) since they're a single instant, not a start/end pair.
 *
 * "Which page is most visited" isn't computed here — it's a one-line
 * PivotTable (rows: Page, values: COUNTA, filter: Event = "Page Visit"),
 * or a COUNTIFS formula.
 */

var SHEET_NAME = 'Visitor Log';
var HEADERS = ['Timestamp', 'Event', 'Page', 'Time on Page (s)', 'Browser', 'OS / Device', 'Device Type', 'Location', 'Referrer', 'Session ID'];
var COL = { timestamp: 1, event: 2, page: 3, timeOnPage: 4, browser: 5, os: 6, deviceType: 7, location: 8, referrer: 9, sessionId: 10 };

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
      appendVisitorRow(sheet, {
        timestamp: data.timestamp, event: 'Resume Download', page: data.page, timeOnPage: '',
        browser: data.browser, os: data.os, deviceType: data.deviceType,
        location: data.location, referrer: data.referrer, sessionId: data.sessionId || ''
      });
    } else if (data.stage === 'exit') {
      var updated = completeVisitRow(sheet, data.sessionId, data.timeOnPageSeconds, data.os, data.location);
      if (!updated) {
        // No matching "enter" row found (e.g. the sheet was cleared mid-visit)
        // — still record it rather than silently dropping the data.
        appendVisitorRow(sheet, {
          timestamp: data.timestamp, event: 'Page Visit', page: data.page, timeOnPage: data.timeOnPageSeconds,
          browser: data.browser, os: data.os, deviceType: data.deviceType,
          location: data.location, referrer: data.referrer, sessionId: data.sessionId || ''
        });
      }
    } else {
      appendVisitorRow(sheet, {
        timestamp: data.timestamp, event: 'Page Visit', page: data.page, timeOnPage: '',
        browser: data.browser, os: data.os, deviceType: data.deviceType,
        location: data.location, referrer: data.referrer, sessionId: data.sessionId || ''
      });
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
 * (next to the Run/Debug buttons — it may currently say "doPost"), select
 * "reformatVisitorLog", then click Run (▶). Approve the permission prompt
 * if it appears. It's safe to run more than once; it only rewrites
 * formatting, never touches your existing row data.
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
  sheet.setFrozenColumns(1);

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

  // ── Column widths tuned per field, not one-size-fits-all ──
  sheet.setColumnWidth(COL.timestamp, 150);
  sheet.setColumnWidth(COL.event, 130);
  sheet.setColumnWidth(COL.page, 160);
  sheet.setColumnWidth(COL.timeOnPage, 115);
  sheet.setColumnWidth(COL.browser, 90);
  sheet.setColumnWidth(COL.os, 140);
  sheet.setColumnWidth(COL.deviceType, 95);
  sheet.setColumnWidth(COL.location, 190);
  sheet.setColumnWidth(COL.referrer, 150);
  sheet.hideColumns(COL.sessionId); // correlation key only, not for reading

  // ── Body: base font, banded rows, gridlines, sane alignment ──
  var bodyRange = sheet.getRange(2, 1, 998, lastCol);
  bodyRange.setFontFamily('Google Sans').setFontSize(10).setVerticalAlignment('middle');
  sheet.getRange(2, COL.timeOnPage, 998, 1).setHorizontalAlignment('right').setNumberFormat('0" s"');
  sheet.getRange(2, COL.deviceType, 998, 1).setHorizontalAlignment('center');

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

  // ── Give the tab itself a color so it's identifiable among other sheets ──
  sheet.setTabColor(COLOR.header);
}

function appendVisitorRow(sheet, r) {
  sheet.appendRow([r.timestamp, r.event, r.page, r.timeOnPage, r.browser, r.os, r.deviceType, r.location, r.referrer, r.sessionId]);
  var row = sheet.getLastRow();
  markCompletion(sheet, row, r.event, r.timeOnPage);
}

// Fires when a visit ends: fills in Time on Page on its row, and also
// backfills OS/Device and Location with whatever the client resolved by
// then — both can improve after page-load (device model via Client Hints,
// location via the IP lookup), so the completed row ends up more accurate
// than the "enter" row was able to be.
function completeVisitRow(sheet, sessionId, seconds, os, location) {
  if (!sessionId) return false;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return false;
  var ids = sheet.getRange(2, COL.sessionId, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) { // search newest-first, cheaper for recent visits
    if (ids[i][0] === sessionId) {
      var row = i + 2;
      sheet.getRange(row, COL.timeOnPage).setValue(seconds);
      if (os) sheet.getRange(row, COL.os).setValue(os);
      if (location) sheet.getRange(row, COL.location).setValue(location);
      markCompletion(sheet, row, 'Page Visit', seconds);
      return true;
    }
  }
  return false;
}

// A completed visit (Time on Page filled in) gets a distinct green tint on
// its Event cell, overriding the conditional "in progress" amber for that
// one row. Resume downloads keep their conditional blue automatically.
function markCompletion(sheet, row, event, timeOnPage) {
  if (event === 'Page Visit' && timeOnPage !== '' && timeOnPage != null) {
    sheet.getRange(row, COL.event).setBackground(COLOR.completeBg).setFontColor(COLOR.completeText).setFontWeight('bold');
  }
}
