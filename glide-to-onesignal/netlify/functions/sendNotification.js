const axios = require('axios');

const ONESIGNAL_APP_ID = process.env.ONESIGNAL_APP_ID;
const ONESIGNAL_API_KEY = process.env.ONESIGNAL_API_KEY;

exports.handler = async function (event, context) {
  const { user_id, message } = JSON.parse(event.body || '{}');

  if (!user_id || !message) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing user_id or message" })
    };
  }

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: ONESIGNAL_APP_ID,
      include_external_user_ids: [user_id],
      contents: { en: message }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${ONESIGNAL_API_KEY}`
      }
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, data: response.data })
    };
  } catch (error) {
    console.error(error.response?.data || error.message);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Notification failed" })
    };
  }
};
