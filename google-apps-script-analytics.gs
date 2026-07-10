/**
 * Portfolio Visitor Analytics — Google Apps Script Web App backend.
 * FRESH REWRITE — deploy this into a BRAND NEW Google Sheet, not the old one.
 *
 * This file is NOT executed by the website directly — it runs on Google's
 * servers. To activate it:
 *
 *   1. Create a brand new Google Sheet (e.g. "Portfolio Visitor Analytics v2").
 *      Do NOT reuse the old sheet — this is a clean slate.
 *   2. Extensions -> Apps Script.
 *   3. Delete the placeholder code (myFunction() etc.) and paste this ENTIRE
 *      file in.
 *   4. Deploy -> New deployment -> select type "Web app".
 *        - Execute as: Me
 *        - Who has access: Anyone
 *   5. Click Deploy, authorize when prompted, and copy the Web App URL
 *      (ends in /exec).
 *   6. Paste that URL into ANALYTICS_URL near the top of visitor-analytics.js
 *      (currently blank — the site silently no-ops until it's set).
 *
 * To ship a code change after the first deploy: paste the new code in,
 * save, then Deploy -> Manage deployments -> pencil icon -> Version:
 * "New version" -> Deploy. Saving alone does NOT publish it.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * ONE ROW PER VISIT (not per page load). A "visit" is everything a visitor
 * does on the site in one browser tab, potentially across several pages:
 *
 *   - stage "enter"  — the very first page of a new visit. Appends a row
 *     with Entry Page, Traffic Source, and a fresh Session ID.
 *   - stage "nav"    — every page after the first, within the SAME visit
 *     (the client recognizes this via sessionStorage, cleared when the tab
 *     closes). Updates that same row's Exit Page, Pages Visited count, and
 *     Page Path, plus refreshes Device/OS/Location with whatever resolved
 *     more accurately by then. Traffic Source is deliberately never
 *     recomputed here — only "enter" sets it, since document.referrer on an
 *     internal navigation would just be the site's own previous page.
 *   - stage "exit"   — fires when the current page is hidden/unloaded.
 *     Fills in Time on Site with the running total since the visit started.
 *     If the visitor then moves to another page on the site, that page's
 *     "nav" ping arrives before its own eventual "exit" — so Time on Site
 *     always reflects the most recent known duration, and whichever "exit"
 *     fires last (because they actually left the site) is the true final
 *     value.
 *
 * Resume downloads do NOT get their own row — they flip "Resume Downloaded"
 * to Yes on the visitor's existing row (matched by Session ID).
 *
 * NO LATITUDE/LONGITUDE ANYWHERE. Location is a single accurate text box
 * ("Neighborhood, City, Region, Country") resolved IP-side by the client
 * script via a 3-provider fallback chain — see loadLocation() in
 * visitor-analytics.js. This is the practical accuracy ceiling without
 * prompting the visitor for GPS permission (which most visitors decline
 * anyway, and would show a popup on every visit).
 *
 * If the columns below ever change, the sheet won't auto-migrate old rows —
 * either delete the "Visitor Log" tab and let the next event rebuild it, or
 * run reformatVisitorLog() manually (see below) to reapply the current
 * layout to the existing tab.
 *
 * "Which page is most visited" isn't computed here — it's a one-line
 * PivotTable (rows: Entry Page, values: COUNTA), or a COUNTIFS formula
 * against Page Path with a "contains" match.
 */

var SHEET_NAME = 'Visitor Log';
var HEADERS = [
  'Timestamp', 'Location', 'Resume Downloaded', 'Traffic Source', 'Device',
  'OS Version', 'Entry Page', 'Exit Page', 'Page Path', 'Pages Visited',
  'Time on Site (s)', 'Browser', 'Device Type', 'Language', 'Screen', 'Session ID'
];
var COL = {
  timestamp: 1, location: 2, resumeDownloaded: 3, trafficSource: 4, device: 5,
  osVersion: 6, entryPage: 7, exitPage: 8, pagePath: 9, pagesVisited: 10,
  timeOnSite: 11, browser: 12, deviceType: 13, language: 14, screen: 15, sessionId: 16
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
      if (!markResumeDownload(sheet, data)) {
        // No matching visit row found (e.g. sheet was cleared mid-visit) —
        // still record it rather than silently dropping the data.
        var fallback = rowFromNewVisit(data);
        fallback.resumeDownloaded = 'Yes';
        appendVisitorRow(sheet, fallback);
      }
    } else if (data.stage === 'exit') {
      if (!updateExit(sheet, data)) {
        appendVisitorRow(sheet, rowFromNewVisit(data));
      }
    } else if (data.stage === 'nav') {
      if (!updateNav(sheet, data)) {
        appendVisitorRow(sheet, rowFromNewVisit(data));
      }
    } else {
      // stage === 'enter': first page of a brand new visit.
      appendVisitorRow(sheet, rowFromNewVisit(data));
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

function rowFromNewVisit(data) {
  var exitPage = data.exitPage || data.page;
  return {
    timestamp: data.timestamp, location: data.location,
    resumeDownloaded: 'No', trafficSource: data.trafficSource || 'Direct / None',
    device: data.device, osVersion: data.osVersion,
    entryPage: data.entryPage || exitPage, exitPage: exitPage,
    pagePath: data.pagePath || exitPage, pagesVisited: data.pagesVisited || 1,
    timeOnSite: '', browser: data.browser, deviceType: data.deviceType,
    language: data.language || '', screen: data.screenRes || '',
    sessionId: data.sessionId || ''
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

  // If row 1 is already visitor data rather than the header (e.g. this tab
  // existed and had rows appended to it before buildLayout ever ran on it),
  // push everything down a row instead of overwriting that data.
  var hasHeader = sheet.getLastRow() > 0 && sheet.getRange(1, 1).getValue() === HEADERS[0];
  if (!hasHeader && sheet.getLastRow() > 0) {
    sheet.insertRowBefore(1);
  }

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

  // ── Column widths tuned per field ──
  sheet.setColumnWidth(COL.timestamp, 150);
  sheet.setColumnWidth(COL.location, 220);
  sheet.setColumnWidth(COL.resumeDownloaded, 130);
  sheet.setColumnWidth(COL.trafficSource, 150);
  sheet.setColumnWidth(COL.device, 210);
  sheet.setColumnWidth(COL.osVersion, 110);
  sheet.setColumnWidth(COL.entryPage, 150);
  sheet.setColumnWidth(COL.exitPage, 150);
  sheet.setColumnWidth(COL.pagePath, 260);
  sheet.setColumnWidth(COL.pagesVisited, 100);
  sheet.setColumnWidth(COL.timeOnSite, 110);
  sheet.setColumnWidth(COL.browser, 90);
  sheet.setColumnWidth(COL.deviceType, 95);
  sheet.setColumnWidth(COL.language, 80);
  sheet.setColumnWidth(COL.screen, 130);
  sheet.hideColumns(COL.sessionId); // correlation key only, not for reading

  // ── Body: base font, banded rows, gridlines, sane alignment ──
  var bodyRange = sheet.getRange(2, 1, 998, lastCol);
  bodyRange.setFontFamily('Google Sans').setFontSize(10).setVerticalAlignment('middle');
  sheet.getRange(2, COL.timeOnSite, 998, 1).setHorizontalAlignment('right').setNumberFormat('0" s"');
  sheet.getRange(2, COL.pagesVisited, 998, 1).setHorizontalAlignment('center');
  sheet.getRange(2, COL.deviceType, 998, 1).setHorizontalAlignment('center');
  sheet.getRange(2, COL.resumeDownloaded, 998, 1).setHorizontalAlignment('center');

  var existingBandings = sheet.getBandings();
  for (var b = 0; b < existingBandings.length; b++) existingBandings[b].remove();
  var banding = sheet.getRange(1, 1, 999, lastCol).applyRowBanding(SpreadsheetApp.BandingTheme.LIGHT_GREY, true, false);
  banding.setHeaderRowColor(COLOR.header)
    .setFirstRowColor(COLOR.bandFirst)
    .setSecondRowColor(COLOR.bandSecond);

  sheet.getRange(1, 1, 999, lastCol).setBorder(
    true, true, true, true, true, true, COLOR.gridBorder, SpreadsheetApp.BorderStyle.SOLID
  );

  setConditionalFormatting(sheet);

  sheet.setTabColor(COLOR.header);
}

// Whole-row coloring, evaluated top-to-bottom (first matching rule wins):
//   1. Resume Downloaded = Yes  → blue, regardless of how the visit is going
//   2. Time on Site filled in   → green, visit has a known final duration
//   3. otherwise                → amber, visit still in progress
function setConditionalFormatting(sheet) {
  var maxRows = sheet.getMaxRows();
  var fullRowRange = sheet.getRange(2, 1, maxRows - 1, HEADERS.length);
  var col = function (c) { return String.fromCharCode(64 + c) + '2'; }; // e.g. 7 -> "G2"

  var downloadRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + col(COL.resumeDownloaded) + '="Yes"')
    .setBackground(COLOR.downloadBg).setFontColor(COLOR.downloadText).setBold(true)
    .setRanges([fullRowRange]).build();

  var completeRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + col(COL.timeOnSite) + '<>""')
    .setBackground(COLOR.completeBg).setFontColor(COLOR.completeText)
    .setRanges([fullRowRange]).build();

  var inProgressRule = SpreadsheetApp.newConditionalFormatRule()
    .whenFormulaSatisfied('=$' + col(COL.timeOnSite) + '=""')
    .setBackground(COLOR.inProgressBg).setFontColor(COLOR.inProgressText)
    .setRanges([fullRowRange]).build();

  sheet.setConditionalFormatRules([downloadRule, completeRule, inProgressRule]);
}

function appendVisitorRow(sheet, r) {
  sheet.appendRow([
    r.timestamp, r.location, r.resumeDownloaded, r.trafficSource, r.device,
    r.osVersion, r.entryPage, r.exitPage, r.pagePath, r.pagesVisited,
    r.timeOnSite, r.browser, r.deviceType, r.language, r.screen, r.sessionId
  ]);
}

function findRowBySessionId(sheet, sessionId) {
  if (!sessionId) return -1;
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, COL.sessionId, lastRow - 1, 1).getValues();
  for (var i = ids.length - 1; i >= 0; i--) { // search newest-first, cheaper for recent visits
    if (ids[i][0] === sessionId) return i + 2;
  }
  return -1;
}

// Fires on every page after the first one in a visit: moves the "Exit Page"
// pointer forward, grows the Pages Visited count and Page Path trail, and
// refreshes Device/OS/Location with whatever resolved more accurately since
// the visit started (Client Hints device model and IP location lookups can
// both improve a second or two after the first page loads).
function updateNav(sheet, data) {
  var row = findRowBySessionId(sheet, data.sessionId);
  if (row === -1) return false;
  sheet.getRange(row, COL.exitPage).setValue(data.exitPage);
  sheet.getRange(row, COL.pagesVisited).setValue(data.pagesVisited || '');
  sheet.getRange(row, COL.pagePath).setValue(data.pagePath || '');
  if (data.device) sheet.getRange(row, COL.device).setValue(data.device);
  if (data.osVersion) sheet.getRange(row, COL.osVersion).setValue(data.osVersion);
  if (data.location) sheet.getRange(row, COL.location).setValue(data.location);
  return true;
}

function updateExit(sheet, data) {
  var row = findRowBySessionId(sheet, data.sessionId);
  if (row === -1) return false;
  sheet.getRange(row, COL.timeOnSite).setValue(data.timeOnSiteSeconds);
  return true;
}

function markResumeDownload(sheet, data) {
  var row = findRowBySessionId(sheet, data.sessionId);
  if (row === -1) return false;
  sheet.getRange(row, COL.resumeDownloaded).setValue('Yes');
  return true;
}
