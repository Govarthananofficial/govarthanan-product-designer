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
 * Two tabs are created automatically on first write, no manual sheet setup
 * needed: "Pageviews" and "Resume Downloads".
 *
 * Each visit writes TWO rows to Pageviews: a "Stage" = enter row the instant
 * the page loads (so a row shows up right away, not only after the visitor
 * leaves), and a "Stage" = exit row when they leave, carrying the real
 * Time on Page. To count actual visits (not double them), filter/pivot on
 * Stage = "enter". The matching "exit" row for the same visit is the one
 * with the same Page + the next later Timestamp.
 *
 * "Which page is most visited" isn't computed here — it's a one-line
 * PivotTable in the Pageviews sheet (rows: Page, values: COUNTA, filtered
 * to Stage = "enter"), or a COUNTIFS formula. No need to bake aggregation
 * into the backend.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    if (data.type === 'resume_download') {
      appendRow(ss, 'Resume Downloads',
        ['Timestamp', 'Page', 'Browser', 'OS / Device', 'Device Type', 'Location', 'Referrer'],
        [data.timestamp, data.page, data.browser, data.os, data.deviceType, data.location, data.referrer]
      );
    } else {
      appendRow(ss, 'Pageviews',
        ['Timestamp', 'Stage', 'Page', 'Time on Page (s)', 'Browser', 'OS / Device', 'Device Type', 'Location', 'Referrer'],
        [data.timestamp, data.stage || 'enter', data.page, data.timeOnPageSeconds, data.browser, data.os, data.deviceType, data.location, data.referrer]
      );
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

function appendRow(ss, sheetName, headers, row) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.appendRow(headers);
    sheet.setFrozenRows(1);
  }
  sheet.appendRow(row);
}
