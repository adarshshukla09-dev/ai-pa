import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID || process.env.PHONE_NUMBER_ID;
const WHATSAPP_VERSION = 'v18.0';
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_VERSION}/${PHONE_NUMBER_ID}`;

if (!WHATSAPP_TOKEN || !PHONE_NUMBER_ID) {
  console.error('❌ Missing required environment variables for WhatsApp configuration.');
  process.exit(1);
}

export class WhatsAppService {
  private static headers = {
    Authorization: `Bearer ${WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };

  /**
   * Send a standard text reply back to the patient
   */
  static async sendTextMessage(to: string, text: string): Promise<void> {
    try {
      await axios.post(
        `${BASE_URL}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'text',
          text: { body: text },
        },
        { headers: this.headers }
      );
      console.log(`✅ Text message sent successfully to ${to}`);
    } catch (error: any) {
      console.error('❌ WhatsApp sendTextMessage error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * DPDP Act 2023 Explicit Consent Requirement:
   * Sends an interactive button message to new users before processing data
   */
  static async sendConsentTemplate(to: string): Promise<void> {
    try {
      await axios.post(
        `${BASE_URL}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to,
          type: 'interactive',
          interactive: {
            type: 'button',
            body: {
              text: 'Welcome to HealBot AI. To help manage your bookings and medical tracking seamlessly, we require your explicit consent under the DPDP Act 2023. Do you agree to our data policy?',
            },
            action: {
              buttons: [
                {
                  type: 'reply',
                  reply: { id: 'consent_accept', title: 'I Accept' },
                },
                {
                  type: 'reply',
                  reply: { id: 'consent_decline', title: 'Decline' },
                },
              ],
            },
          },
        },
        { headers: this.headers }
      );
      console.log(`✅ Consent template sent successfully to ${to}`);
    } catch (error: any) {
      console.error('❌ Error sending WhatsApp consent interaction:', error.response?.data || error.message);
      throw error;
    }
  }
}