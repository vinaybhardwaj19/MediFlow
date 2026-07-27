/**
 * @file twilio.js
 * @description Utility wrapper for sending SMS alerts via Twilio REST API.
 */

/**
 * Send an SMS message using Twilio
 * @param {string} to - Destination phone number (E.164 format)
 * @param {string} body - SMS body content
 * @returns {Promise<boolean>} True if sent successfully, false otherwise
 */
exports.sendSMS = async (to, body) => {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE_NUMBER;

  if (!accountSid || !authToken || !from) {
    console.warn('[Twilio] Credentials or sender number missing in environment configuration.');
    return false;
  }

  // Ensure 'to' has a leading '+' for E.164, default to Indian numbers if 10 digit
  let formattedTo = to.trim();
  if (formattedTo.length === 10 && !formattedTo.startsWith('+')) {
    formattedTo = '+91' + formattedTo;
  } else if (!formattedTo.startsWith('+')) {
    formattedTo = '+' + formattedTo;
  }

  try {
    const authString = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${authString}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        To: formattedTo,
        From: from,
        Body: body
      })
    });

    if (response.ok) {
      const data = await response.json();
      console.log(`[Twilio] SMS successfully sent to ${formattedTo}. SID: ${data.sid}`);
      return true;
    } else {
      const errorData = await response.json().catch(() => ({}));
      console.error(`[Twilio] API error response (Status ${response.status}):`, errorData.message || errorData);
      return false;
    }
  } catch (err) {
    console.error('[Twilio] Network error sending SMS:', err);
    return false;
  }
};
