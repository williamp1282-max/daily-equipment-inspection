function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

function collectFlaggedItems(record) {
  const flagged = [];
  ['fluids', 'checklist', 'attachmentChecklist', 'attachmentLines'].forEach(function (group) {
    (record[group] || []).forEach(function (item) {
      if (item && (item.status === 'Needs Attention' || item.status === 'Low')) {
        flagged.push(item);
      }
    });
  });
  return flagged;
}

/**
 * Sends a "needs attention" email via the Resend API.
 * No-ops (returns { skipped: true }) if RESEND_API_KEY isn't set or there
 * are no recipients — callers should never let this block saving an
 * inspection, so failures here are meant to be caught and logged, not thrown
 * up to the user.
 */
export async function sendFailureAlert({ toEmails, record, appUrl }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey || !toEmails || !toEmails.length) {
    return { skipped: true };
  }

  const flagged = collectFlaggedItems(record);
  const subject = 'Inspection needs attention \u2014 ' + (record.equipmentLabel || record.equipmentType) + ' ' + record.unitId;

  const itemsHtml = flagged.map(function (it) {
    return '<li><strong>' + escapeHtml(it.label) + '</strong> \u2014 ' + escapeHtml(it.status) +
      (it.notes ? ': ' + escapeHtml(it.notes) : '') + '</li>';
  }).join('');

  const html =
    '<p>An inspection was just logged with one or more items flagged <strong>Needs Attention</strong> or <strong>Low</strong>.</p>' +
    '<p>' +
    '<strong>Equipment:</strong> ' + escapeHtml(record.equipmentLabel || record.equipmentType) + '<br>' +
    '<strong>Unit / Asset #:</strong> ' + escapeHtml(record.unitId) + '<br>' +
    '<strong>Operator:</strong> ' + escapeHtml(record.operator) + '<br>' +
    '<strong>Date:</strong> ' + escapeHtml(record.date) + ' (' + escapeHtml(record.shift) + ' shift)' +
    '</p>' +
    '<p><strong>Flagged items:</strong></p>' +
    '<ul>' + itemsHtml + '</ul>' +
    (appUrl ? '<p><a href="' + appUrl + '">Open the inspection app</a></p>' : '');

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      from: process.env.ALERT_FROM_EMAIL || 'Equipment Inspections <onboarding@resend.dev>',
      to: toEmails,
      subject: subject,
      html: html
    })
  });

  if (!res.ok) {
    const text = await res.text().catch(function () { return ''; });
    throw new Error('Resend API error ' + res.status + ': ' + text);
  }

  return res.json();
}
