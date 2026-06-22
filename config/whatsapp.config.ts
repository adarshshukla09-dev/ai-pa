import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const WHATSAPP_VERSION = 'v18.0'; // Use the appropriate Meta API version
const BASE_URL = `https://graph.facebook.com/${WHATSAPP_VERSION}/${process.env.WHATSAPP_PHONE_NUMBER_ID}`;

export class WhatsAppService {
  /**
   * Send a standard text reply or regional Hinglish response back to the patient
   */
  static async sendTextMessage(to: string, text: string): Promise<void> {
    try {
      await axios.post(
        `${BASE_URL}/messages`,
        {
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          to: to,
          type: 'text',
          text: { body: text },
        },
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
            'Content-Type': 'application/json',
          },
        }
      );
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
          to: to,
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
        {
          headers: {
            Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          },
        }
      );
    } catch (error: any) {
      console.error('❌ Error sending WhatsApp consent interaction:', error.response?.data || error.message);
    }
  }
}