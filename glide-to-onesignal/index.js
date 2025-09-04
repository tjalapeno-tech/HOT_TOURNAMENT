const express = require('express');
const axios = require('axios');
const dotenv = require('dotenv');

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(express.json());

app.post('/send-notification', async (req, res) => {
  const { user_id, message } = req.body;

  if (!user_id || !message) {
    return res.status(400).json({ error: "Missing user_id or message" });
  }

  try {
    const response = await axios.post('https://onesignal.com/api/v1/notifications', {
      app_id: process.env.ONESIGNAL_APP_ID,
      include_external_user_ids: [user_id],
      contents: { en: message }
    }, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${process.env.ONESIGNAL_API_KEY}`
      }
    });

    return res.status(200).json({ success: true, response: response.data });
  } catch (err) {
    console.error(err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to send notification" });
  }
});

app.get('/', (req, res) => {
  res.send('Glide to OneSignal webhook is running.');
});

app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});

