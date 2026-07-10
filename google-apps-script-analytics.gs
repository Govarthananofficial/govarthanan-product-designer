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
 * Everything lands in ONE tab, "Visitor Log", created automatically on first
 * write — no manual sheet setup needed. Each row's "Event" column says
 * plainly what happened:
 *   - "Page Visit (Arrived)" — fires the instant a page loads.
 *   - "Page Visit (Left)"    — fires when that same visit ends, carrying the
 *                              real Time on Page.
 *   - "Resume Download"      — fires when the visitor clicks the resume PDF.
 *
 * "Which page is most visited" isn't computed here — it's a one-line
 * PivotTable (rows: Page, values: COUNTA, filter: Event = "Page Visit
 * (Arrived)"), or a COUNTIFS formula. No need to bake aggregation into the
 * backend.
 *
 * NOTE: if you're upgrading from the old two-tab version, delete the old
 * "Pageviews" and "Resume Downloads" tabs — this version writes to a fresh
 * "Visitor Log" tab instead, so old data won't mix with the new schema.
 */
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var eventLabel;
    var timeOnPage = '';
    if (data.type === 'resume_download') {
      eventLabel = 'Resume Download';
    } else if (data.stage === 'exit') {
      eventLabel = 'Page Visit (Left)';
      timeOnPage = data.timeOnPageSeconds;
    } else {
      eventLabel = 'Page Visit (Arrived)';
    }

    appendRow(ss, 'Visitor Log',
      ['Timestamp', 'Event', 'Page', 'Time on Page (s)', 'Browser', 'OS / Device', 'Device Type', 'Location', 'Referrer'],
      [data.timestamp, eventLabel, data.page, timeOnPage, data.browser, data.os, data.deviceType, data.location, data.referrer]
    );

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
