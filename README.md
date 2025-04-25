# WhatsApp Web Bot 🤖💬

This is a Node.js-based WhatsApp bot using `whatsapp-web.js` that allows real-time interactions with WhatsApp through the web client. It features QR code authentication, session management, and can be extended to integrate with Google APIs or external APIs via `node-fetch`.

---

## 🔧 Features

- QR Code-based WhatsApp login via terminal or frontend
- Persistent session handling
- Easily extendable with Google APIs and external APIs
- Simple REST API setup using Express
- Supports CORS for cross-origin requests
- Unique session IDs with UUID

---

## 🚀 Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/whatsapp-web-bot.git
cd whatsapp-web-bot
```

### 2. Install Dependencies

Make sure you have Node.js installed. Then run:

```bash
npm init -y
npm install express cors whatsapp-web.js qrcode uuid dotenv googleapis node-fetch
```

### 3. Create Environment File

Create a `.env` file in the root directory to store environment variables:

```env
PORT=3000
```

(You can add more environment variables like Google API keys here.)

---

## 🏃‍♂️ Running the Bot

```bash
node index.js
```

Once the server is running, visit:

```
http://localhost:3000/qr
```

Scan the QR code with your WhatsApp app to start the session.

---

## 📁 Project Structure

```
.
├── index.js           # Main server file
├── .env               # Environment variables
├── package.json       # NPM config and dependencies
├── README.md          # Documentation
└── sessions/          # Stores session data (auto-created)
```

---

## 🛠️ Technologies Used

- **Node.js** – Server-side JavaScript runtime
- **Express** – Web framework for handling API requests
- **whatsapp-web.js** – WhatsApp Web API wrapper
- **QRCode** – QR code generation for login
- **uuid** – Unique session and request identifiers
- **dotenv** – Environment configuration
- **googleapis** – Google API integrations
- **node-fetch** – Fetch API in Node.js
- **cors** – Cross-Origin Resource Sharing

---

## 🌐 API Endpoints

- `GET /qr` – Generates QR code for WhatsApp login
- `GET /status` – Check WhatsApp connection status
- `POST /send` – Send a message through WhatsApp

---

## 🤝 Contributing

Feel free to fork this repo and contribute. PRs are welcome!

---

## 📄 License

This project is licensed under the MIT License.

---

## 📞 Contact

Created by **[Your Name](https://github.com/your-username)** – feel free to connect!