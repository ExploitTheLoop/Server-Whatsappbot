# 24x7 AI WhatsApp Agent Server

## Overview
This is the server-side component of the 24x7 AI WhatsApp Agent, a Node.js-based WhatsApp bot using `whatsapp-web.js`. It provides APIs for the [Control Panel APK](https://github.com/ExploitTheLoop/24x7AiWhatsappAgent) to manage WhatsApp bot sessions, handle real-time interactions, and integrate with external services like Gemini API, Deepgram, ElevenLabs, and Google Sheets. The server supports QR code authentication, session management, duplicate session protection, and logging of important messages.

A demo of the project can be viewed on [YouTube](https://www.youtube.com/watch?v=lvwuYuEHyA8).

## Features
- **QR Code-based WhatsApp Login**: Authenticate WhatsApp sessions by scanning a QR code.
- **Persistent Session Handling**: Stores session data to maintain bot state across restarts.
- **Duplicate Session Protection**: Ensures only one session per WhatsApp number is active by disconnecting duplicates.
- **Gemini API Integration**: Generates AI-powered text responses for chat messages.
- **Deepgram Audio Transcription**: Transcribes audio messages received on WhatsApp.
- **ElevenLabs Audio Generation**: Converts AI responses into voice messages using ElevenLabs.
- **Google Sheets Logging**: Logs important messages to a Google Sheet for record-keeping.
- **Bot On/Off Toggle**: Allows pausing/resuming bot responses via API.
- **Cleanup of Inactive Sessions**: Automatically removes inactive session files every 24 hours.
- **CORS Support**: Enables cross-origin requests for frontend integration.

## Screenshots
The control panel interface displays:
- **Bot Statistics**: Active Bots (e.g., 136), Total Views (e.g., 5.4K), Messages (e.g., 51.6K).
- **Assistant Controls**: Options to enable/disable Internet Detection Mode, Shadow Mode, and notifications.

Below is a screenshot of the control panel:

![Control Panel Screenshot](images/screenshot.png)

## Getting Started

### 1. Clone the Repository
```bash
git clone https://github.com/ExploitTheLoop/Server-Whatsappbot.git
cd Server-Whatsappbot
```

### 2. Install Dependencies
Make sure you have Node.js installed. Then run:
```bash
npm init -y
npm install express cors whatsapp-web.js qrcode uuid dotenv googleapis node-fetch
```

### 3. Create Environment File
Create a `.env` file in the root directory with the following variables:
```env
PORT=3000
GOOGLE_CREDENTIALS_PATH=/path/to/your/google-credentials.json
```
- `GOOGLE_CREDENTIALS_PATH`: Path to your Google API credentials JSON file (required for Google Sheets integration).

### 4. Running the Server
```bash
node server.js
```
The server will start on the specified port (default: 3000). The control panel APK will interact with the server via the APIs below.

## Project Structure
```
.
├── server.js          # Main server file
├── .env               # Environment variables
├── package.json       # NPM config and dependencies
├── readme.md          # Documentation
├── sessions/          # Stores session data (auto-created)
└── audio_downloads/   # Temporary storage for audio files (auto-created)
```

## Technologies Used
- **Node.js**: Server-side JavaScript runtime.
- **Express**: Web framework for handling API requests.
- **whatsapp-web.js**: WhatsApp Web API wrapper.
- **QRCode**: QR code generation for login.
- **uuid**: Unique session identifiers.
- **dotenv**: Environment configuration.
- **googleapis**: Google Sheets integration for logging.
- **node-fetch**: Fetch API in Node.js for external API calls.
- **cors**: Cross-Origin Resource Sharing.

## API Endpoints
- **POST `/api/start-bot`**  
  Starts a new bot session and generates a QR code for WhatsApp login.  
  **Body**: 
  ```json
  {
    "geminiApiKey": "your-gemini-api-key",
    "deepgramApiKey": "your-deepgram-api-key",
    "googleSheetsId": "your-google-sheet-id",
    "prompt": "your-personality-prompt",
    "elevenLabsApiKey": "your-elevenlabs-api-key", // Optional
    "elevenLabsVoiceId": "your-elevenlabs-voice-id" // Optional
  }
  ```
  **Response**: `{ "sessionId": "uuid" }`

- **GET `/api/status/:sessionId`**  
  Retrieves the status of a session (e.g., QR code, connection status).  
  **Response**: 
  ```json
  { "status": "waiting", "qrCode": "data:image/png;base64,..." }
  ```

- **GET `/api/check-session/:sessionId`**  
  Checks if a session exists, its configuration, and connection status.  
  **Response**: 
  ```json
  { "config": {...}, "isConnected": true, "qrCode": "", "status": "ready" }
  ```

- **POST `/api/disconnect/:sessionId`**  
  Disconnects a session and cleans up resources.  
  **Response**: `{ "success": true }`

- **POST `/api/bot-on/:sessionId`**  
  Turns the bot on (enables message responses).  
  **Response**: `{ "success": true, "message": "Bot is now active (responding)." }`

- **POST `/api/bot-off/:sessionId`**  
  Turns the bot off (disables message responses).  
  **Response**: `{ "success": true, "message": "Bot is now paused (not responding)." }`

- **GET `/api/bot-status/:sessionId`**  
  Retrieves the bot's active status (on/off).  
  **Response**: 
  ```json
  { "sessionId": "uuid", "botActive": true }
  ```

## Setup Instructions for Integrations
1. **Google Sheets**:
   - Set up a Google Cloud project and enable the Google Sheets API.
   - Download your credentials JSON file and specify its path in `GOOGLE_CREDENTIALS_PATH`.
   - Share the Google Sheet (specified by `googleSheetsId`) with the service account email in your credentials file.

2. **Gemini API**:
   - Obtain an API key from the Gemini API provider and provide it in the `/api/start-bot` request.

3. **Deepgram API**:
   - Obtain an API key from Deepgram for audio transcription and provide it in the `/api/start-bot` request.

4. **ElevenLabs API** (Optional):
   - Obtain an API key and Voice ID from ElevenLabs for audio generation and provide them in the `/api/start-bot` request.

## Usage with Control Panel
This server is designed to work with the [24x7 AI WhatsApp Agent Control Panel](https://github.com/ExploitTheLoop/24x7AiWhatsappAgent). After starting the server:
1. Use the control panel to start a bot session by calling `/api/start-bot`.
2. Scan the QR code returned by `/api/status/:sessionId` to log in to WhatsApp.
3. The bot will handle messages, transcribe audio, generate voice responses, and log important messages to Google Sheets.

## Visit the Control Panel Repository
The client-side control panel for this project, which interacts with these APIs, is available at:
- **[24x7AiWhatsappAgent Repository](https://github.com/ExploitTheLoop/24x7AiWhatsappAgent)**

## Contributing
Contributions are welcome! Please fork the repository, make your changes, and submit a pull request.

## License
This project is licensed under the MIT License. See the LICENSE file in the repository for more details.
