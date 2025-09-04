import axios from "axios";

export default defineComponent({
  async run({ steps, $ }) {
    const data = {
      app_id: "YOUR_ONESIGNAL_APP_ID",
      include_external_user_ids: [steps.trigger.event.user_id],
      contents: { en: steps.trigger.event.message }
    };

    const response = await axios.post("https://onesignal.com/api/v1/notifications", data, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic YOUR_REST_API_KEY"
      }
    });

    return response.data;
  }
});
