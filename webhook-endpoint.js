import axios from "axios";

export default defineComponent({
  async run({ steps, $ }) {
    const data = {
      app_id: "b0033729-f174-46f2-a933-2e5daa5919b7",
      include_external_user_ids: [steps.trigger.event.user_id],
      contents: { en: steps.trigger.event.message }
    };

    const response = await axios.post("https://onesignal.com/api/v1/notifications", data, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Basic os_v2_app_wabtokprordpfkjtfzo2uwizw6fdd2mfqsruunfkvum737x23yg34pvse2vknvrc4ltvgiaiosoi5ser54suln34hbfemus3tyghdby"
      }
    });

    return response.data;
  }
});
